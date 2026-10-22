// Building record notes, and filing the raw notes the iPhone Shortcut drops into the Inbox.
import { detectType, fixDictation, type EntryTypeId, type Fix } from "./dictation";
import { findReferences, parseScriptureList, sortReferences } from "./scripture";
import type { TopicIndex } from "./topics";

export type { EntryTypeId };

export interface EntryType {
	id: EntryTypeId;
	label: string;
	folder: string;
}

/** Defaults; each vault can change the folders in settings. */
export const ENTRY_TYPES: EntryType[] = [
	{ id: "scripture", label: "Scripture Insight", folder: "Gospel/Scripture Insights" },
	{ id: "thought", label: "Thoughtful Insight", folder: "Gospel/Thoughtful Insights" },
	{ id: "parable", label: "Modern Parable", folder: "Gospel/Modern Parables" },
	{ id: "experience", label: "Special Experience", folder: "Gospel/Special Experiences" },
];

export const EXPERIENCE_KINDS = ["miracle", "tender mercy", "answered prayer", "prompting", "temple", "revelation"];

/** Where a voice note goes when it doesn't start with a type. Marked type_guessed so the dashboard can flag it. */
const FALLBACK_TYPE: EntryTypeId = "thought";
const TITLE_MAX = 60;
const SUGGESTION_LIMIT = 5;

export type Source = "form" | "voice-whisper" | "voice-apple";

export interface EntryInput {
	type: EntryTypeId;
	text: string;
	topics: string[];
	scriptures: string[];
	date: string;
	title?: string;
	kind?: string;
	source?: Source;
	/** Vault path of a recording to embed. */
	audio?: string;
}

export function deriveTitle(text: string, max = TITLE_MAX): string {
	const firstSentence = text.trim().split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? "";
	let title = firstSentence.replace(/[.!?]+$/, "");
	if (title.length > max) {
		const cut = title.slice(0, max + 1);
		title = cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max);
	}
	title = title.replace(/[,;:\s]+$/, "");
	return title || "Untitled entry";
}

export function safeFileName(title: string): string {
	return title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "Untitled entry";
}

const quote = (s: string) => JSON.stringify(s);
const yamlList = (items: string[]) => (items.length ? items.map((i) => `\n  - ${quote(i)}`).join("") : " []");
const topicLink = (name: string) => (name.startsWith("[[") ? name : `[[${name}]]`);

export function typeById(id: string, types: EntryType[] = ENTRY_TYPES): EntryType | undefined {
	return types.find((t) => t.id === id);
}

export function buildEntry(input: EntryInput, types: EntryType[] = ENTRY_TYPES): { folder: string; fileName: string; content: string } {
	const type = typeById(input.type, types);
	if (!type) throw new Error(`unknown entry type: ${input.type}`);
	const lines = [`date: ${input.date}`];
	if (input.kind) lines.push(`kind: ${input.kind}`);
	lines.push(`topics:${yamlList(input.topics.map(topicLink))}`);
	lines.push(`scriptures:${yamlList(input.scriptures)}`);
	if (input.source) lines.push(`source: ${input.source}`);
	if (input.audio) lines.push(`audio: ${quote(`[[${input.audio}]]`)}`);
	let body = input.text.trim();
	if (input.audio) body += `\n\n![[${input.audio}]]`;
	return {
		folder: type.folder,
		fileName: `${safeFileName(input.title?.trim() || deriveTitle(input.text))}.md`,
		content: `---\n${lines.join("\n")}\n---\n${body}\n`,
	};
}

export interface IncomingNote {
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface ProcessedNote {
	type: EntryTypeId;
	title: string;
	body: string;
	frontmatter: Record<string, unknown>;
}

const asStringList = (v: unknown): string[] =>
	v == null || v === "" ? [] : (Array.isArray(v) ? v : [v]).map(String).map((s) => s.trim()).filter(Boolean);
const linkName = (link: string) => link.replace(/^\[\[|\]\]$/g, "").split("|")[0].split("/").pop()!;

/** Turn a raw Shortcut note (needs_processing: true) into a finished entry. Pure: the caller writes and moves the file. */
export function processIncoming(note: IncomingNote, ctx: { topics: TopicIndex; fixes: Fix[]; types?: EntryType[] }): ProcessedNote {
	const fm = { ...note.frontmatter };
	const types = ctx.types ?? ENTRY_TYPES;
	const spoken = String(fm.source ?? "").startsWith("voice");

	let text = note.body.trim();
	let spokenType: EntryTypeId | undefined;
	let spokenKind: string | undefined;
	if (spoken) {
		const detected = detectType(text);
		spokenType = detected.type;
		spokenKind = detected.kind;
		text = fixDictation(detected.rest, ctx.fixes);
	}

	const chosenType = typeof fm.type === "string" && typeById(fm.type, types) ? (fm.type as EntryTypeId) : undefined;
	const type = chosenType ?? spokenType ?? FALLBACK_TYPE;
	const kind = (typeof fm.kind === "string" && fm.kind) || spokenKind;

	const typed = parseScriptureList(String(fm.scriptures_raw ?? ""));
	const fromText = findReferences(text, { spoken }).map((r) => r.ref);
	const scriptures = sortReferences([...new Set([...asStringList(fm.scriptures), ...typed.refs, ...fromText])]);
	if (typed.unknown.length) text += `\n\nUnrecognised scripture: ${typed.unknown.join("; ")}`;

	const topics = asStringList(fm.topics).map(topicLink);
	const suggested = ctx.topics.suggest(text, { exclude: topics.map(linkName), limit: SUGGESTION_LIMIT }).map((s) => s.name);

	delete fm.needs_processing;
	delete fm.scriptures_raw;
	delete fm.type;
	delete fm.kind;
	const out: Record<string, unknown> = { ...fm, topics, scriptures, suggested_topics: suggested };
	if (kind) out.kind = kind;
	if (!chosenType && !spokenType) out.type_guessed = true;

	return { type, title: deriveTitle(text), body: text, frontmatter: out };
}

export const TOPIC_BLOCK = "## My Record\n```gospel-record\nshow: topic\n```\n";
// The Dataview version this plugin replaces, so "Set up this vault" can migrate it.
const LEGACY_TOPIC_BLOCK = /```dataviewjs\nawait dv\.view\("Other\/Views\/gospel-record", \{ show: "topic" \}\)\n```/;

/** Adds the My Record section to a topic page, above a trailing "Parent: [[...]]" footer, or at the end. */
export function withTopicBlock(content: string): string {
	if (LEGACY_TOPIC_BLOCK.test(content)) return content.replace(LEGACY_TOPIC_BLOCK, "```gospel-record\nshow: topic\n```");
	if (content.includes("```gospel-record")) return content;
	const lines = content.replace(/\n+$/, "").split("\n");
	const footer = lines.length && /^Parent: \[\[/.test(lines[lines.length - 1]) ? lines.pop()! : null;
	return `${lines.join("\n").replace(/\n+$/, "")}\n\n${TOPIC_BLOCK}${footer ? `\n${footer}` : ""}\n`;
}
