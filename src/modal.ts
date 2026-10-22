import { debounce, Modal, moment, Notice, Platform, setIcon } from "obsidian";
import { detectType } from "./dictation";
import { buildEntry, EXPERIENCE_KINDS, type EntryTypeId } from "./entry";
import { findReferences, parseScriptureList, sortReferences } from "./scripture";
import type GospelRecordPlugin from "./main";

const LAST_TYPE_KEY = "gospel-record-last-type";
const SUGGEST_DELAY_MS = 300;
const SUGGESTION_LIMIT = 6;

/** The capture form: type, text, topics (suggested + search), scriptures. */
export class EntryModal extends Modal {
	private type: EntryTypeId;
	private kind = "";
	private readonly topics: string[] = [];
	private readonly dismissed = new Set<string>();

	private textEl!: HTMLTextAreaElement;
	private titleInput!: HTMLInputElement;
	private scripturesEl!: HTMLInputElement;
	private typeButtons = new Map<EntryTypeId, HTMLButtonElement>();
	private kindRow!: HTMLElement;
	private chosenEl!: HTMLElement;
	private suggestedEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private scripturePreviewEl!: HTMLElement;
	private errorEl!: HTMLElement;
	private saving = false;
	/** Once the user picks a type themselves, a spoken "Tender mercy." prefix no longer changes it. */
	private typePicked = false;
	private unsubscribe: (() => void) | null = null;
	private stopFitting: (() => void) | null = null;

	constructor(
		private readonly plugin: GospelRecordPlugin,
		initialType?: EntryTypeId,
	) {
		super(plugin.app);
		const last = plugin.loadLocal(LAST_TYPE_KEY) as EntryTypeId | null;
		this.type = initialType ?? (last && plugin.entryTypes().some((t) => t.id === last) ? last : "scripture");
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("gospel-record-modal");
		this.setTitle("New entry");
		this.plugin.log("form opened", { type: this.type, mobile: Platform.isMobile });

		// On phones Cancel/Save sit in a bar at the top so the keyboard never covers them.
		const footer = createDiv({ cls: "gr-footer" });
		if (Platform.isMobile) {
			modalEl.addClass("gr-mobile");
			contentEl.appendChild(footer);
		}

		const types = contentEl.createDiv({ cls: "gr-types" });
		this.plugin.entryTypes().forEach((t, i) => {
			const b = types.createEl("button", { text: t.label, attr: { "data-type": t.id, title: Platform.isMobile ? "" : `Mod+${i + 1}` } });
			b.addEventListener("click", () => this.setType(t.id, true));
			this.typeButtons.set(t.id, b);
		});

		this.kindRow = contentEl.createDiv({ cls: "gr-kinds" });
		for (const kind of EXPERIENCE_KINDS) {
			const b = this.kindRow.createEl("button", { text: kind, cls: "gr-chip", attr: { "data-kind": kind } });
			b.addEventListener("click", () => {
				this.kind = this.kind === kind ? "" : kind;
				this.plugin.log("kind", this.kind);
				this.renderKinds();
			});
		}

		this.textEl = contentEl.createEl("textarea", {
			cls: "gr-text",
			attr: { placeholder: "What happened, or what did you learn?", rows: Platform.isMobile ? "5" : "8" },
		});
		this.textEl.addEventListener("input", this.onTextChange);

		this.titleInput = contentEl.createEl("input", { cls: "gr-title", attr: { type: "text", placeholder: "Title (optional)" } });

		const topicsBox = contentEl.createDiv({ cls: "gr-topics" });
		topicsBox.createDiv({ cls: "gr-label", text: "Topics" });
		this.chosenEl = topicsBox.createDiv({ cls: "gr-chips gr-chosen" });
		this.suggestedEl = topicsBox.createDiv({ cls: "gr-chips gr-suggested" });
		const searchWrap = topicsBox.createDiv({ cls: "gr-search" });
		this.searchEl = searchWrap.createEl("input", { attr: { type: "text", placeholder: "Add a topic…" } });
		this.resultsEl = searchWrap.createDiv({ cls: "gr-results" });
		this.searchEl.addEventListener("input", () => this.renderSearch());
		this.searchEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.isComposing && !(e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void this.pickFirstResult();
			}
		});

		const scriptBox = contentEl.createDiv({ cls: "gr-scriptures" });
		scriptBox.createDiv({ cls: "gr-label", text: "Scriptures" });
		this.scripturesEl = scriptBox.createEl("input", { attr: { type: "text", placeholder: "alma 32 21; d&c 6:23" } });
		this.scripturePreviewEl = scriptBox.createDiv({ cls: "gr-chips gr-scripture-preview" });
		this.scripturesEl.addEventListener("input", () => this.renderScriptures());

		this.errorEl = contentEl.createDiv({ cls: "gr-error" });

		if (!Platform.isMobile) contentEl.appendChild(footer);
		const cancel = footer.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const save = footer.createEl("button", { text: Platform.isMobile ? "Save" : "Save  ⌘↵", cls: "mod-cta gr-save" });
		save.addEventListener("click", () => void this.save());

		this.scope.register(["Mod"], "Enter", (e) => {
			e.preventDefault();
			void this.save();
			return false;
		});
		this.plugin.entryTypes().forEach((t, i) =>
			this.scope.register(["Mod"], String(i + 1), (e) => {
				e.preventDefault();
				this.setType(t.id, true);
				return false;
			}),
		);

		this.setType(this.type);
		this.renderChosen();
		this.renderSuggestions();
		this.renderScriptures();
		window.setTimeout(() => this.textEl.focus(), 0);
		this.fitAboveKeyboard();
		// Topics (and their aliases) may still be loading right after Obsidian starts.
		this.unsubscribe = this.plugin.onTopicsChanged(() => {
			this.renderSuggestions();
			this.renderSearch();
		});
	}

	/** Phones: keep the form inside the area above the keyboard, and the focused field in view. */
	private fitAboveKeyboard(): void {
		if (!Platform.isMobile) return;
		const vv = window.visualViewport;
		const fit = () => {
			if (!vv) return;
			this.modalEl.style.maxHeight = `${Math.floor(vv.height)}px`;
			this.modalEl.style.top = `${Math.floor(vv.offsetTop)}px`;
			this.plugin.log("fit form to viewport", vv.height);
		};
		const reveal = (e: FocusEvent) => window.setTimeout(() => (e.target as HTMLElement).scrollIntoView?.({ block: "nearest" }), 300);
		vv?.addEventListener("resize", fit);
		vv?.addEventListener("scroll", fit);
		this.contentEl.addEventListener("focusin", reveal);
		fit();
		this.stopFitting = () => {
			vv?.removeEventListener("resize", fit);
			vv?.removeEventListener("scroll", fit);
		};
	}

	onClose(): void {
		this.stopFitting?.();
		this.unsubscribe?.();
		this.contentEl.empty();
	}

	private setType(type: EntryTypeId, picked = false): void {
		this.type = type;
		if (picked) this.typePicked = true;
		this.plugin.log("type", type);
		for (const [id, b] of this.typeButtons) b.toggleClass("is-active", id === type);
		this.kindRow.toggle(type === "experience");
		this.renderKinds();
	}

	private renderKinds(): void {
		this.kindRow.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.toggleClass("is-active", b.dataset.kind === this.kind));
	}

	/** The text without a leading "Special experience." / "Tender mercy." phrase, unless it is part of the story. */
	private entryText(): string {
		const detected = detectType(this.textEl.value);
		const isLabel = detected.type && (!this.typePicked || detected.type === this.type);
		return (isLabel ? detected.rest : this.textEl.value).trim();
	}

	private onTextChange = debounce(
		() => {
			const detected = detectType(this.textEl.value);
			if (detected.type && !this.typePicked) {
				this.setType(detected.type);
				if (detected.kind) this.kind = detected.kind;
				this.renderKinds();
			}
			this.titleInput.placeholder = this.textEl.value.trim() ? `Title: ${this.derivedTitle()}` : "Title (optional)";
			this.renderSuggestions();
			this.renderScriptures();
		},
		SUGGEST_DELAY_MS,
		true,
	);

	private derivedTitle(): string {
		return buildEntry({ type: this.type, text: this.entryText(), topics: [], scriptures: [], date: "" }, this.plugin.entryTypes()).fileName.replace(/\.md$/, "");
	}

	private addTopic(name: string): void {
		if (this.topics.some((t) => t.toLowerCase() === name.toLowerCase())) return;
		this.topics.push(name);
		this.plugin.log("topic added", name);
		this.renderChosen();
		this.renderSuggestions();
	}

	private removeTopic(name: string): void {
		this.topics.splice(this.topics.indexOf(name), 1);
		this.dismissed.add(name);
		this.plugin.log("topic removed", name);
		this.renderChosen();
		this.renderSuggestions();
	}

	private renderChosen(): void {
		this.chosenEl.empty();
		for (const name of this.topics) {
			const chip = this.chosenEl.createEl("button", { cls: "gr-chip is-active", attr: { "data-topic": name, "aria-label": `Remove ${name}` } });
			chip.createSpan({ text: name });
			setIcon(chip.createSpan({ cls: "gr-chip-x" }), "x");
			chip.addEventListener("click", () => this.removeTopic(name));
		}
	}

	private renderSuggestions(): void {
		this.suggestedEl.empty();
		const suggestions = this.plugin.topicIndex
			.suggest(this.textEl?.value ?? "", { exclude: [...this.topics, ...this.dismissed], limit: SUGGESTION_LIMIT })
			.map((s) => s.name);
		for (const name of suggestions) {
			const chip = this.suggestedEl.createEl("button", { cls: "gr-chip gr-suggestion", text: `+ ${name}`, attr: { "data-suggestion": name } });
			chip.addEventListener("click", () => this.addTopic(name));
		}
	}

	private renderSearch(): void {
		this.resultsEl.empty();
		const q = this.searchEl.value.trim();
		if (!q) return;
		const results = this.plugin.topicIndex.search(q).filter((t) => !this.topics.includes(t.name));
		for (const t of results) {
			const row = this.resultsEl.createDiv({ cls: "gr-result", text: t.name, attr: { "data-result": t.name } });
			row.addEventListener("click", () => this.pickResult(t.name));
		}
		if (!this.plugin.topicIndex.byName(q)) {
			const row = this.resultsEl.createDiv({ cls: "gr-result gr-create", text: `Create topic “${q}”`, attr: { "data-create": q } });
			row.addEventListener("click", () => void this.createTopic(q));
		}
	}

	private pickResult(name: string): void {
		this.addTopic(name);
		this.searchEl.value = "";
		this.renderSearch();
		this.searchEl.focus();
	}

	private async pickFirstResult(): Promise<void> {
		const q = this.searchEl.value.trim();
		if (!q) return;
		const first = this.plugin.topicIndex.search(q).find((t) => !this.topics.includes(t.name));
		if (first) this.pickResult(first.name);
		else await this.createTopic(q);
	}

	private async createTopic(name: string): Promise<void> {
		try {
			const created = await this.plugin.createTopic(name);
			this.pickResult(created);
			new Notice(`Created topic “${created}”`);
		} catch (e) {
			this.showError(`Could not create topic: ${(e as Error).message}`);
		}
	}

	private scriptures(): { refs: string[]; unknown: string[]; fromText: string[] } {
		const typed = parseScriptureList(this.scripturesEl?.value ?? "");
		const fromText = findReferences(this.textEl?.value ?? "").map((r) => r.ref).filter((r) => !typed.refs.includes(r));
		return { refs: sortReferences([...typed.refs, ...fromText]), unknown: typed.unknown, fromText };
	}

	private renderScriptures(): void {
		this.scripturePreviewEl.empty();
		const { refs, unknown, fromText } = this.scriptures();
		for (const ref of refs) {
			this.scripturePreviewEl.createSpan({ cls: "gr-chip is-active", text: fromText.includes(ref) ? `${ref} (in text)` : ref, attr: { "data-ref": ref } });
		}
		for (const part of unknown) this.scripturePreviewEl.createSpan({ cls: "gr-chip gr-unknown", text: `? ${part}`, attr: { title: "Not recognised; it will be noted in the entry" } });
	}

	private showError(message: string): void {
		this.errorEl.setText(message);
		this.plugin.log("form error", message);
	}

	private async save(): Promise<void> {
		if (this.saving) return;
		const text = this.entryText();
		if (!text) {
			this.showError("Write something first.");
			this.textEl.focus();
			return;
		}
		this.saving = true;
		try {
			const { refs, unknown } = this.scriptures();
			const body = unknown.length ? `${text}\n\nUnrecognised scripture: ${unknown.join("; ")}` : text;
			const file = await this.plugin.saveEntry({
				type: this.type,
				kind: this.type === "experience" ? this.kind || undefined : undefined,
				title: this.titleInput.value,
				text: body,
				topics: this.topics,
				scriptures: refs,
				date: moment().format("YYYY-MM-DD"),
				source: "form",
			});
			this.plugin.saveLocal(LAST_TYPE_KEY, this.type);
			this.close();
			const notice = new Notice(`Saved to ${file.parent?.name ?? "vault"}: ${file.basename} (tap to open)`, 6000);
			notice.messageEl.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
		} catch (e) {
			this.showError(`Could not save: ${(e as Error).message}`);
		} finally {
			this.saving = false;
		}
	}
}
