// ```gospel-record``` code blocks: the "My Record" section on topic pages and the dashboard sections.
// show: topic | recent | inbox | needs-topics | guessed | topic-counts | scriptures
import { debounce, MarkdownRenderChild, moment, Notice, TFile } from "obsidian";
import { referenceBook, referenceUrl, sortReferences } from "./scripture";
import type GospelRecordPlugin from "./main";

const RECENT_LIMIT = 15;
const RERENDER_DELAY_MS = 800;

export const VIEW_NAMES = ["topic", "recent", "inbox", "needs-topics", "guessed", "topic-counts", "scriptures"] as const;
type ViewName = (typeof VIEW_NAMES)[number];

const asList = (v: unknown): string[] => (v == null || v === "" ? [] : (Array.isArray(v) ? v : [v]).map(String));

export class RecordView extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly plugin: GospelRecordPlugin,
		private readonly show: ViewName,
		private readonly sourcePath: string,
	) {
		super(containerEl);
	}

	onload(): void {
		this.render();
		const rerender = debounce(() => this.render(), RERENDER_DELAY_MS, true);
		this.registerEvent(this.plugin.app.metadataCache.on("resolved", rerender));
		this.registerEvent(this.plugin.app.vault.on("rename", rerender));
		this.registerEvent(this.plugin.app.vault.on("delete", rerender));
	}

	private get app() {
		return this.plugin.app;
	}

	private fm(file: TFile): Record<string, unknown> {
		return this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	}

	private date(file: TFile): string {
		const d = this.fm(file).date;
		return d ? String(d) : moment(file.stat.ctime).format("YYYY-MM-DD");
	}

	private byDateDesc = (a: TFile, b: TFile) => this.date(b).localeCompare(this.date(a)) || b.stat.ctime - a.stat.ctime;

	private link(parent: HTMLElement, file: TFile, text = file.basename): HTMLElement {
		const a = parent.createEl("a", { text, cls: "internal-link", attr: { "data-href": file.path, href: file.path } });
		a.addEventListener("click", (e) => {
			e.preventDefault();
			void this.app.workspace.openLinkText(file.path, this.sourcePath, e.metaKey || e.ctrlKey);
		});
		return a;
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("gospel-record-view");
		try {
			this[this.show === "needs-topics" ? "needsTopics" : this.show === "topic-counts" ? "topicCounts" : this.show]();
		} catch (e) {
			el.createDiv({ cls: "gr-error", text: `Gospel Record: ${(e as Error).message}` });
			console.error("[gospel-record] view failed", this.show, e);
		}
	}

	private empty(text: string): void {
		this.containerEl.createEl("p", { cls: "gr-empty", text });
	}

	private topic(): void {
		const entries = this.plugin.entriesLinkingTo(this.sourcePath);
		if (!entries.length) return this.empty("Nothing recorded for this topic yet.");
		for (const type of this.plugin.entryTypes()) {
			const rows = entries.filter((f) => this.plugin.typeOf(f)?.id === type.id).sort(this.byDateDesc);
			if (!rows.length) continue;
			this.containerEl.createEl("h4", { text: `${type.label}s (${rows.length})` });
			const ul = this.containerEl.createEl("ul");
			for (const f of rows) {
				const li = ul.createEl("li");
				this.link(li, f);
				const kind = this.fm(f).kind;
				li.appendText(` · ${this.date(f)}${kind ? ` · ${kind}` : ""}`);
			}
		}
	}

	private recent(): void {
		const entries = this.plugin.allEntries().sort(this.byDateDesc).slice(0, RECENT_LIMIT);
		if (!entries.length) return this.empty("No entries yet. Use “Gospel Record: New entry”.");
		const ul = this.containerEl.createEl("ul");
		for (const f of entries) {
			const li = ul.createEl("li");
			this.link(li, f);
			li.appendText(` · ${this.plugin.typeOf(f)?.label ?? ""} · ${this.date(f)}`);
		}
	}

	private inbox(): void {
		const files = this.plugin.inboxFiles();
		if (!files.length) return this.empty("Inbox is empty.");
		const bar = this.containerEl.createDiv({ cls: "gr-bar" });
		const button = bar.createEl("button", { text: `File ${files.length} now`, cls: "mod-cta" });
		button.addEventListener("click", async () => {
			button.disabled = true;
			const n = await this.plugin.fileInbox();
			new Notice(`Filed ${n} ${n === 1 ? "entry" : "entries"}`);
		});
		const ul = this.containerEl.createEl("ul");
		for (const f of files) this.link(ul.createEl("li"), f);
	}

	private needsTopics(): void {
		const entries = this.plugin.allEntries().filter((f) => asList(this.fm(f).topics).length === 0).sort(this.byDateDesc);
		if (!entries.length) return this.empty("Everything has topics. ✅");
		for (const f of entries) {
			const row = this.containerEl.createDiv({ cls: "gr-needs" });
			this.link(row, f);
			const chips = row.createDiv({ cls: "gr-chips" });
			const suggested = asList(this.fm(f).suggested_topics);
			if (!suggested.length) chips.createSpan({ cls: "gr-empty", text: "no suggestions. Add topics in the note" });
			for (const name of suggested) {
				const chip = chips.createEl("button", { cls: "gr-chip gr-suggestion", text: `+ ${name}`, attr: { "data-suggestion": name } });
				chip.addEventListener("click", async () => {
					chip.disabled = true;
					await this.plugin.acceptTopic(f, name);
				});
			}
		}
	}

	private guessed(): void {
		const entries = this.plugin.allEntries().filter((f) => this.fm(f).type_guessed === true);
		if (!entries.length) return this.empty("No voice notes waiting for a type.");
		for (const f of entries) {
			const row = this.containerEl.createDiv({ cls: "gr-needs" });
			this.link(row, f);
			const chips = row.createDiv({ cls: "gr-chips" });
			for (const type of this.plugin.entryTypes()) {
				const chip = chips.createEl("button", { cls: "gr-chip", text: type.label, attr: { "data-type": type.id } });
				chip.addEventListener("click", async () => {
					await this.plugin.setType(f, type.id);
				});
			}
		}
	}

	private topicCounts(): void {
		const counts = new Map<string, number>();
		for (const f of this.plugin.allEntries()) {
			for (const path of this.plugin.linkedTopicPaths(f)) counts.set(path, (counts.get(path) ?? 0) + 1);
		}
		if (!counts.size) return this.empty("No topics linked yet.");
		const ul = this.containerEl.createEl("ul");
		for (const [path, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			const li = ul.createEl("li");
			this.link(li, file);
			li.appendText(` (${n})`);
		}
	}

	private scriptures(): void {
		const byRef = new Map<string, TFile[]>();
		for (const f of this.plugin.allEntries()) {
			for (const ref of asList(this.fm(f).scriptures)) byRef.set(ref, [...(byRef.get(ref) ?? []), f]);
		}
		if (!byRef.size) return this.empty("No scriptures recorded yet.");
		let book: string | null = null;
		let ul: HTMLElement | null = null;
		for (const ref of sortReferences([...byRef.keys()])) {
			const b = referenceBook(ref) ?? "Other";
			if (b !== book) {
				book = b;
				this.containerEl.createEl("h4", { text: b });
				ul = this.containerEl.createEl("ul");
			}
			const li = ul!.createEl("li");
			const url = referenceUrl(ref);
			if (url) li.createEl("a", { text: ref, href: url, cls: "external-link" });
			else li.appendText(ref);
			li.appendText(" — ");
			byRef.get(ref)!.forEach((f, i) => {
				if (i) li.appendText(", ");
				this.link(li, f);
			});
		}
	}
}

/** Parses the block's `show: x` line. */
export function parseViewName(source: string): ViewName | null {
	const m = /show:\s*([\w-]+)/.exec(source);
	const name = (m?.[1] ?? "topic") as ViewName;
	return VIEW_NAMES.includes(name) ? name : null;
}
