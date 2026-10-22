// Cleanup for dictated text (Whisper or Apple): misheard scripture names, spoken references,
// homophones, and the user's own fixes from settings. Typed text is never passed through here.
import { findReferences } from "./scripture";

export interface Fix {
	from: string[];
	to: string;
}

// Misheard book names, only fixed right before a chapter number so ordinary prose is untouched.
const BOOK_MISHEARINGS: [RegExp, string][] = [
	[/\b(?:allah|ola|olla|alla|all the|olma|alma's)(?=\s+\d)/gi, "Alma"],
	[/\b(?:knee ?fi|nefi|neefi|neifi|neophi)(?=\s+\d)/gi, "Nephi"],
	[/\b(?:hila ?man|hela man|hellaman|healaman|heela ?man)(?=\s+\d)/gi, "Helaman"],
	[/\b(?:mosaya|mosiya|mosaiah)(?=\s+\d)/gi, "Mosiah"],
	[/\b(?:moroney|maroni|moronai|moro 8)(?=\s+\d)/gi, "Moroni"],
];

// "Ceilings" is the classic mishearing of sealings, but only plausible in a note about the temple.
const TEMPLE_CONTEXT = /\b(?:temple|sealer|sealed|endowment|ordinance)s?\b/i;

const wordRe = (word: string) => new RegExp(`(?<![\\p{L}\\d])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "giu");

/** Settings text, one fix per line: `emmalene, emiline => Emmaline`. Lines starting with # are comments. */
export function parseFixes(text: string): Fix[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#") && line.includes("=>"))
		.map((line) => {
			const [from, to] = line.split("=>");
			return { from: from.split(",").map((w) => w.trim()).filter(Boolean), to: to.trim() };
		})
		.filter((fix) => fix.from.length && fix.to);
}

export function fixDictation(text: string, fixes: Fix[] = []): string {
	let out = text;
	for (const [re, to] of BOOK_MISHEARINGS) out = out.replace(re, to);
	if (TEMPLE_CONTEXT.test(out)) out = out.replace(/\bceiling(s?)\b/gi, "sealing$1");
	for (const fix of fixes) for (const word of fix.from) out = out.replace(wordRe(word), fix.to);

	// Rewrite spoken references ("1st Nephi chapter 3, verse 7") in standard form, back to front so offsets stay valid.
	for (const r of findReferences(out, { spoken: true }).reverse()) {
		out = out.slice(0, r.start) + r.ref + out.slice(r.end);
	}
	return out;
}

export type EntryTypeId = "scripture" | "thought" | "parable" | "experience";

// What a voice note may start with. Kinds only apply to Special Experiences.
const SPOKEN_TYPES: { phrase: RegExp; type: EntryTypeId; kind?: string }[] = [
	{ phrase: /special experience/i, type: "experience" },
	{ phrase: /scripture insight/i, type: "scripture" },
	{ phrase: /thoughtful insight/i, type: "thought" },
	{ phrase: /thought/i, type: "thought" },
	{ phrase: /modern parable/i, type: "parable" },
	{ phrase: /parable/i, type: "parable" },
	{ phrase: /miracle/i, type: "experience", kind: "miracle" },
	{ phrase: /tender mercy/i, type: "experience", kind: "tender mercy" },
	{ phrase: /answered prayer/i, type: "experience", kind: "answered prayer" },
	{ phrase: /prompting/i, type: "experience", kind: "prompting" },
];

/** "Special experience. Today…" -> type experience, rest "Today…". */
export function detectType(text: string): { type?: EntryTypeId; kind?: string; rest: string } {
	const trimmed = text.trimStart();
	for (const { phrase, type, kind } of SPOKEN_TYPES) {
		const m = new RegExp(`^${phrase.source}\\s*[.!:,;—–-]\\s*`, "i").exec(trimmed);
		if (m) return { type, kind, rest: trimmed.slice(m[0].length) };
	}
	return { type: undefined, kind: undefined, rest: text };
}
