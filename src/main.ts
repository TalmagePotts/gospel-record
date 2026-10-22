import {
	debounce,
	getFrontMatterInfo,
	type MarkdownPostProcessorContext,
	Modal,
	moment,
	normalizePath,
	Notice,
	parseYaml,
	Platform,
	Plugin,
	requestUrl,
	stringifyYaml,
	TFile,
	TFolder,
} from "obsidian";
import { parseFixes } from "./dictation";
import { buildEntry, ENTRY_TYPES, type EntryInput, type EntryType, type EntryTypeId, processIncoming, safeFileName, TOPIC_BLOCK, withTopicBlock } from "./entry";
import { EntryModal } from "./modal";
import { AUTO_FILE_KEY, DEFAULT_SETTINGS, type GospelRecordSettings, GospelRecordSettingTab, WHISPER_TOKEN_KEY } from "./settings";
import { audioMimeType, buildMultipart, type Part, vocabularyLines } from "./transcribe";
import { TopicIndex, type Topic } from "./topics";
import { parseViewName, RecordView } from "./views";

const INBOX_SETTLE_MS = 3000;
const TOPIC_REBUILD_MS = 1000;

const DASHBOARD = (["inbox", "guessed", "recent", "needs-topics", "topic-counts", "scriptures"] as const)
	.map((show) => {
		const heading = {
			inbox: "Inbox",
			guessed: "Voice notes needing a type",
			recent: "Recent",
			"needs-topics": "Needs topics",
			"topic-counts": "Topics I write about most",
			scriptures: "Scripture index",
		}[show];
		return `## ${heading}\n\`\`\`gospel-record\nshow: ${show}\n\`\`\`\n`;
	})
	.join("");

// Meld Encrypt creates a note already encrypted, after asking for the password (cancel = nothing created).
const MELD_PLUGIN_ID = "meld-encrypt";
interface MeldCreateFeature {
	processCreateNewEncryptedNoteCommand(folder: TFolder): Promise<void>;
}

/** A problem that will fix itself (a recording still syncing), so it is logged rather than shown. */
class NotYetError extends Error {}

const asList = (v: unknown): string[] => (v == null || v === "" ? [] : (Array.isArray(v) ? v : [v]).map(String));
const linkName = (link: string) => link.replace(/^\[\[|\]\]$/g, "").split("|")[0].split("/").pop()!;

interface AppWithInternals {
	commands: { executeCommandById(id: string): boolean; commands: Record<string, unknown> };
	plugins: { enabledPlugins: Set<string>; plugins: Record<string, unknown> };
}

export default class GospelRecordPlugin extends Plugin {
	settings!: GospelRecordSettings;
	topicIndex = new TopicIndex([]);
	private filing = false;
	private readonly topicListeners = new Set<() => void>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new GospelRecordSettingTab(this.app, this));

		this.addRibbonIcon("feather", "New Gospel Record entry", () => new EntryModal(this).open());
		this.addCommand({ id: "new-entry", name: "New entry", callback: () => new EntryModal(this).open() });
		for (const type of ENTRY_TYPES) {
			this.addCommand({ id: `new-${type.id}`, name: `New ${type.label}`, callback: () => new EntryModal(this, type.id).open() });
		}
		this.addCommand({ id: "new-sacred", name: "New Sacred entry (encrypted)", callback: () => void this.newSacredEntry() });
		this.addCommand({ id: "file-inbox", name: "File Inbox now", callback: () => void this.fileInboxWithNotice() });
		this.addCommand({ id: "open-dashboard", name: "Open dashboard", callback: () => void this.openDashboard() });
		this.addCommand({ id: "setup-vault", name: "Set up this vault", callback: () => void this.setupVault() });

		// obsidian://gospel-record?mode=new[&type=experience] | sacred | dashboard | file-inbox  (for the iPhone Action Button).
		// Not "action": Obsidian sets params.action to the handler's own name, overwriting a query parameter of that name.
		this.registerObsidianProtocolHandler("gospel-record", (params) => {
			this.log("link opened", params);
			const type = ENTRY_TYPES.find((t) => t.id === params.type)?.id;
			if (params.mode === "sacred") void this.newSacredEntry();
			else if (params.mode === "dashboard") void this.openDashboard();
			else if (params.mode === "file-inbox") void this.fileInboxWithNotice();
			else new EntryModal(this, type).open();
		});

		this.registerMarkdownCodeBlockProcessor("gospel-record", (source, el, ctx: MarkdownPostProcessorContext) => {
			const show = parseViewName(source);
			if (!show) {
				el.createDiv({ cls: "gr-error", text: `Gospel Record: unknown view in “${source.trim()}”` });
				return;
			}
			ctx.addChild(new RecordView(el, this, show, ctx.sourcePath));
		});

		const rebuildTopics = debounce(() => this.rebuildTopics(), TOPIC_REBUILD_MS, true);
		const fileInboxSoon = debounce(() => void this.fileInbox(), INBOX_SETTLE_MS, true);
		this.app.workspace.onLayoutReady(() => {
			this.rebuildTopics();
			if (this.autoFileInbox) void this.fileInbox();
			// Layout can be ready before every file's properties are indexed; aliases arrive with "resolved".
			this.registerEvent(this.app.metadataCache.on("resolved", rebuildTopics));
			this.registerEvent(
				this.app.metadataCache.on("changed", (file) => {
					if (this.inFolder(file.path, this.settings.topicsFolder)) rebuildTopics();
					if (this.autoFileInbox && this.inFolder(file.path, this.settings.inboxFolder)) fileInboxSoon();
				}),
			);
			for (const event of ["create", "delete", "rename"] as const) {
				this.registerEvent(
					this.app.vault.on(event as "create", (file) => {
						if (this.inFolder(file.path, this.settings.topicsFolder)) rebuildTopics();
						// A recording can arrive from iCloud after its note; filing waits for it.
						const arrived = this.inFolder(file.path, this.settings.inboxFolder) || this.inFolder(file.path, this.settings.audioFolder);
						if (event === "create" && this.autoFileInbox && arrived) fileInboxSoon();
					}),
				);
			}
		});
		this.log("loaded", { autoFileInbox: this.autoFileInbox, mobile: Platform.isMobile });
	}

	// ---- settings and device-local state -------------------------------------------------------

	async loadSettings(): Promise<void> {
		const saved = ((await this.loadData()) ?? {}) as Partial<GospelRecordSettings>;
		this.settings = { ...DEFAULT_SETTINGS, ...saved, folders: { ...DEFAULT_SETTINGS.folders, ...saved.folders } };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.rebuildTopics();
		this.log("settings saved", this.settings);
	}

	loadLocal(key: string): unknown {
		return this.app.loadLocalStorage(key);
	}

	saveLocal(key: string, value: unknown): void {
		this.app.saveLocalStorage(key, value);
	}

	get autoFileInbox(): boolean {
		const v = this.loadLocal(AUTO_FILE_KEY);
		return v === null || v === undefined ? Platform.isDesktopApp : v === true || v === "true";
	}

	setAutoFileInbox(on: boolean): void {
		this.saveLocal(AUTO_FILE_KEY, on);
		this.log("auto-file inbox on this device", on);
		if (on) void this.fileInbox();
	}

	log(message: string, ...data: unknown[]): void {
		if (this.settings?.debug) console.debug(`[gospel-record] ${message}`, ...data);
	}

	// ---- vault queries used by the views and the form -------------------------------------------

	entryTypes(): EntryType[] {
		return ENTRY_TYPES.map((t) => ({ ...t, folder: normalizePath(this.settings.folders[t.id] || t.folder) }));
	}

	private inFolder(path: string, folder: string): boolean {
		const f = normalizePath(folder);
		return !!folder && (path === f || path.startsWith(`${f}/`));
	}

	typeOf(file: TFile): EntryType | undefined {
		return this.entryTypes().find((t) => this.inFolder(file.path, t.folder));
	}

	allEntries(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((f) => this.typeOf(f) && !this.isFolderNote(f));
	}

	/** Folder-notes plugin style "Special Experiences.md" inside or beside its folder is not an entry. */
	private isFolderNote(file: TFile): boolean {
		return file.basename === file.parent?.name;
	}

	private linkTargets(file: TFile): string[] {
		return Object.keys(this.app.metadataCache.resolvedLinks[file.path] ?? {});
	}

	entriesLinkingTo(path: string): TFile[] {
		return this.allEntries().filter((f) => this.linkTargets(f).includes(path));
	}

	linkedTopicPaths(file: TFile): string[] {
		return this.linkTargets(file).filter((p) => this.inFolder(p, this.settings.topicsFolder));
	}

	inboxFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((f) => this.inFolder(f.path, this.settings.inboxFolder));
	}

	rebuildTopics(): void {
		const folder = normalizePath(this.settings.topicsFolder);
		const topics: Topic[] = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.inFolder(f.path, folder) && f.basename !== folder.split("/").pop())
			.map((f) => ({ name: f.basename, path: f.path, aliases: asList(this.app.metadataCache.getFileCache(f)?.frontmatter?.aliases) }));
		const ignore = this.settings.ignoreTopics.split(",").map((s) => s.trim()).filter(Boolean);
		this.topicIndex = new TopicIndex(topics, { ignore });
		this.log("topic index rebuilt", topics.length);
		for (const listener of this.topicListeners) listener();
	}

	/** Called whenever the topic list changes; returns an unsubscribe function. */
	onTopicsChanged(listener: () => void): () => void {
		this.topicListeners.add(listener);
		return () => this.topicListeners.delete(listener);
	}

	// ---- writing ----------------------------------------------------------------------------------

	private async ensureFolder(path: string): Promise<void> {
		const p = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(p);
		if (existing instanceof TFolder) return;
		if (existing) throw new Error(`${p} exists and is not a folder`);
		await this.app.vault.createFolder(p);
		this.log("created folder", p);
	}

	private uniquePath(folder: string, fileName: string, ext = "md"): string {
		const base = fileName.replace(new RegExp(`\\.${ext}$`), "");
		for (let i = 1; ; i++) {
			const path = normalizePath(`${folder}/${base}${i > 1 ? ` ${i}` : ""}.${ext}`);
			if (!this.app.vault.getAbstractFileByPath(path)) return path;
		}
	}

	async saveEntry(input: EntryInput): Promise<TFile> {
		const entry = buildEntry(input, this.entryTypes());
		await this.ensureFolder(entry.folder);
		const file = await this.app.vault.create(this.uniquePath(entry.folder, entry.fileName), entry.content);
		console.info("[gospel-record] saved entry", file.path);
		return file;
	}

	async createTopic(name: string): Promise<string> {
		const clean = safeFileName(name);
		const folder = normalizePath(this.settings.topicsFolder);
		await this.ensureFolder(folder);
		const path = normalizePath(`${folder}/${clean}.md`);
		if (!this.app.vault.getAbstractFileByPath(path)) {
			let content = TOPIC_BLOCK;
			const template = this.settings.topicTemplate && this.app.vault.getAbstractFileByPath(normalizePath(this.settings.topicTemplate));
			const templater = (this.app as unknown as AppWithInternals).plugins.plugins["templater-obsidian"] as
				| { templater?: { create_new_note_from_template(t: TFile, folder: TFolder, name: string, open: boolean): Promise<TFile | undefined> } }
				| undefined;
			const folderFile = this.app.vault.getAbstractFileByPath(folder);
			if (template instanceof TFile && templater?.templater && folderFile instanceof TFolder) {
				const created = await templater.templater.create_new_note_from_template(template, folderFile, clean, false);
				if (created && !(await this.app.vault.read(created)).includes("gospel-record")) {
					await this.app.vault.process(created, (c) => withTopicBlock(c));
				}
			} else {
				if (template instanceof TFile) content = withTopicBlock((await this.app.vault.read(template)).replace(/<%[^%]*tp\.date\.now\("([^"]+)"\)[^%]*%>/g, (_, fmt) => moment().format(fmt)));
				await this.app.vault.create(path, content);
			}
			console.info("[gospel-record] created topic", path);
		}
		this.rebuildTopics();
		return clean;
	}

	async acceptTopic(file: TFile, name: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const topics = asList(fm.topics);
			if (!topics.map(linkName).includes(name)) topics.push(`[[${name}]]`);
			fm.topics = topics;
			fm.suggested_topics = asList(fm.suggested_topics).filter((s) => s !== name);
			if (!fm.suggested_topics.length) delete fm.suggested_topics;
		});
		this.log("accepted topic", file.path, name);
	}

	async setType(file: TFile, type: EntryTypeId): Promise<void> {
		const folder = this.entryTypes().find((t) => t.id === type)!.folder;
		await this.app.fileManager.processFrontMatter(file, (fm) => delete fm.type_guessed);
		await this.ensureFolder(folder);
		if (file.parent?.path !== folder) await this.app.fileManager.renameFile(file, this.uniquePath(folder, file.basename));
		this.log("set type", file.path, type);
	}

	// ---- Inbox (notes from the iPhone Shortcut) ---------------------------------------------------

	private async fileInboxWithNotice(): Promise<void> {
		const n = await this.fileInbox();
		new Notice(n ? `Filed ${n} ${n === 1 ? "entry" : "entries"}` : "Inbox is empty");
	}

	async fileInbox(): Promise<number> {
		if (this.filing) return 0;
		this.filing = true;
		let filed = 0;
		try {
			for (const file of this.inboxFiles()) {
				try {
					if (await this.fileOne(file)) filed++;
				} catch (e) {
					if (e instanceof NotYetError) {
						this.log("waiting to file", file.path, e.message);
						continue;
					}
					console.error("[gospel-record] could not file", file.path, e);
					new Notice(`Gospel Record: could not file ${file.basename}: ${(e as Error).message}`, 8000);
				}
			}
		} finally {
			this.filing = false;
		}
		if (filed) console.info(`[gospel-record] filed ${filed} inbox note(s)`);
		return filed;
	}

	private async fileOne(file: TFile): Promise<boolean> {
		const raw = await this.app.vault.read(file);
		const info = getFrontMatterInfo(raw);
		const frontmatter = (info.exists ? parseYaml(info.frontmatter) : null) ?? {};
		if (!frontmatter.needs_processing) return false;

		const audio = typeof frontmatter.audio === "string" ? frontmatter.audio.replace(/^\[\[|\]\]$/g, "") : "";
		let incomingBody = raw.slice(info.contentStart);
		if (frontmatter.needs_transcription) {
			const transcript = await this.transcribe(audio);
			incomingBody = transcript || "(No speech was recognised in the recording.)";
			frontmatter.source = "voice-whisper";
			delete frontmatter.needs_transcription;
		}

		const result = processIncoming(
			{ frontmatter, body: incomingBody },
			{ topics: this.topicIndex, fixes: parseFixes(this.settings.dictationFixes), types: this.entryTypes() },
		);
		let body = result.body;
		if (audio && !body.includes(`![[${audio}]]`)) body += `\n\n![[${audio}]]`;

		await this.app.vault.modify(file, `---\n${stringifyYaml(result.frontmatter)}---\n${body}\n`);
		const folder = this.entryTypes().find((t) => t.id === result.type)!.folder;
		await this.ensureFolder(folder);
		await this.app.fileManager.renameFile(file, this.uniquePath(folder, safeFileName(result.title)));
		this.log("filed", file.path, result.type);
		return true;
	}

	private whisperConfig(): { url: string; token: string } {
		const url = this.settings.whisperUrl.replace(/\/+$/, "");
		const token = String(this.loadLocal(WHISPER_TOKEN_KEY) ?? "");
		if (!url || !token) throw new Error("Whisper isn't set up on this device (Settings → Gospel Record → Voice notes)");
		return { url, token };
	}

	/** Sends a recording to the Whisper server and returns the transcript. */
	async transcribe(audioPath: string): Promise<string> {
		if (!audioPath) throw new Error("voice note has no recording");
		const { url, token } = this.whisperConfig();
		const file = this.app.vault.getAbstractFileByPath(normalizePath(audioPath));
		if (!(file instanceof TFile)) throw new NotYetError(`recording ${audioPath} has not synced yet`);
		const parts: Part[] = [{ name: "file", fileName: file.name, mimeType: audioMimeType(file.name), data: await this.app.vault.readBinary(file) }];
		// An empty list falls back to the server's own vocab.txt.
		const vocabulary = vocabularyLines(this.settings.whisperVocabulary);
		if (vocabulary.length) parts.push({ name: "vocabulary", value: vocabulary.join("\n") });
		const { body, contentType } = buildMultipart(parts);
		const started = Date.now();
		let res;
		try {
			res = await requestUrl({ url: `${url}/transcribe`, method: "POST", headers: { Authorization: `Bearer ${token}` }, contentType, body, throw: false });
		} catch (e) {
			throw new Error(`can't reach the Whisper server (is Tailscale on?): ${(e as Error).message}`);
		}
		if (res.status !== 200) throw new Error(`Whisper server answered ${res.status}`);
		this.log("transcribed", audioPath, `${Date.now() - started} ms`);
		return String(res.json?.text ?? "").trim();
	}

	async testWhisper(): Promise<void> {
		try {
			const { url } = this.whisperConfig();
			const res = await requestUrl({ url: `${url}/health`, throw: false });
			new Notice(res.status === 200 ? `Whisper is reachable (${res.json?.model ?? "ok"})` : `Whisper answered ${res.status}`);
		} catch (e) {
			new Notice(`Can't reach Whisper: ${(e as Error).message}`);
		}
	}

	// ---- Sacred -----------------------------------------------------------------------------------

	private async newSacredEntry(): Promise<void> {
		const app = this.app as unknown as AppWithInternals;
		// Loaded plugins only; a disabled Meld is not in this map.
		const meld = app.plugins.plugins[MELD_PLUGIN_ID] as { enabledFeatures?: unknown[] } | undefined;
		if (!meld) {
			new Notice("Install and enable the Meld Encrypt plugin first. Nothing was created.");
			return;
		}
		const create = meld.enabledFeatures?.find(
			(f): f is MeldCreateFeature => typeof (f as Partial<MeldCreateFeature>)?.processCreateNewEncryptedNoteCommand === "function",
		);
		if (!create) {
			// Never fall back to a plain note: words typed into it would be unencrypted on disk.
			new Notice("This Meld Encrypt version isn't supported. Use its “Create new encrypted note” in the Sacred folder. Nothing was created.", 10000);
			return;
		}
		await this.ensureFolder(this.settings.sacredFolder);
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.sacredFolder));
		if (!(folder instanceof TFolder)) return;
		await create.processCreateNewEncryptedNoteCommand(folder);
		this.log("sacred entry started");
	}

	// ---- dashboard and setup ------------------------------------------------------------------------

	private async openDashboard(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.dashboardPath));
		if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
		else new Notice("No dashboard yet. Run “Gospel Record: Set up this vault”.");
	}

	async setupVault(): Promise<void> {
		const s = this.settings;
		for (const folder of [...this.entryTypes().map((t) => t.folder), s.inboxFolder, s.audioFolder, s.sacredFolder, s.topicsFolder]) {
			await this.ensureFolder(folder);
		}
		const dashPath = normalizePath(s.dashboardPath);
		if (!this.app.vault.getAbstractFileByPath(dashPath)) {
			await this.ensureFolder(dashPath.split("/").slice(0, -1).join("/") || "/");
			await this.app.vault.create(dashPath, DASHBOARD);
		}
		this.rebuildTopics();
		const needBlock: TFile[] = [];
		for (const t of this.topicIndex.topics) {
			const f = this.app.vault.getAbstractFileByPath(t.path);
			if (f instanceof TFile && !(await this.app.vault.cachedRead(f)).includes("```gospel-record")) needBlock.push(f);
		}
		if (needBlock.length) {
			new ConfirmModal(this, `Add a “My Record” section to ${needBlock.length} topic pages in ${s.topicsFolder}?`, async () => {
				for (const f of needBlock) await this.app.vault.process(f, (c) => withTopicBlock(c));
				new Notice(`Added My Record to ${needBlock.length} topic pages`);
			}).open();
		}
		new Notice("Gospel Record is set up");
		await this.openDashboard();
	}
}

class ConfirmModal extends Modal {
	constructor(
		plugin: GospelRecordPlugin,
		private readonly question: string,
		private readonly onYes: () => Promise<void>,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.setTitle("Gospel Record");
		this.contentEl.createEl("p", { text: this.question });
		const footer = this.contentEl.createDiv({ cls: "gr-footer" });
		footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const yes = footer.createEl("button", { text: "Add", cls: "mod-cta" });
		yes.addEventListener("click", async () => {
			yes.disabled = true;
			await this.onYes();
			this.close();
		});
		this.scope.register([], "Enter", () => {
			yes.click();
			return false;
		});
		window.setTimeout(() => yes.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
