// Scripture references: recognise them in typed or dictated text, normalise them
// ("first nephi 3 7" -> "1 Nephi 3:7"), sort them canonically and link them to the Gospel Library.

type Volume = "ot" | "nt" | "bofm" | "dc-testament" | "pgp";

interface Book {
	name: string;
	volume: Volume;
	slug: string;
	chapters: number;
	/** Other ways to write or say the book, without the number prefix for numbered books. */
	aliases?: string[];
	/** 1-4 for "1 Nephi", "2 Kings"...; `name` and `aliases` then omit the number. */
	number?: number;
	/** Book names that are also ordinary English words only count when capitalised ("Job 19", not "my job 2"). */
	capitalOnly?: boolean;
}

const BOOKS: Book[] = [
	{ name: "Genesis", volume: "ot", slug: "gen", chapters: 50, aliases: ["Gen"] },
	{ name: "Exodus", volume: "ot", slug: "ex", chapters: 40, aliases: ["Ex", "Exod"] },
	{ name: "Leviticus", volume: "ot", slug: "lev", chapters: 27, aliases: ["Lev"] },
	{ name: "Numbers", volume: "ot", slug: "num", chapters: 36, aliases: ["Num"], capitalOnly: true },
	{ name: "Deuteronomy", volume: "ot", slug: "deut", chapters: 34, aliases: ["Deut"] },
	{ name: "Joshua", volume: "ot", slug: "josh", chapters: 24, aliases: ["Josh"] },
	{ name: "Judges", volume: "ot", slug: "judg", chapters: 21, aliases: ["Judg"], capitalOnly: true },
	{ name: "Ruth", volume: "ot", slug: "ruth", chapters: 4 },
	{ name: "Samuel", number: 1, volume: "ot", slug: "1-sam", chapters: 31, aliases: ["Sam"] },
	{ name: "Samuel", number: 2, volume: "ot", slug: "2-sam", chapters: 24, aliases: ["Sam"] },
	{ name: "Kings", number: 1, volume: "ot", slug: "1-kgs", chapters: 22, aliases: ["Kgs"] },
	{ name: "Kings", number: 2, volume: "ot", slug: "2-kgs", chapters: 25, aliases: ["Kgs"] },
	{ name: "Chronicles", number: 1, volume: "ot", slug: "1-chr", chapters: 29, aliases: ["Chr", "Chron"] },
	{ name: "Chronicles", number: 2, volume: "ot", slug: "2-chr", chapters: 36, aliases: ["Chr", "Chron"] },
	{ name: "Ezra", volume: "ot", slug: "ezra", chapters: 10 },
	{ name: "Nehemiah", volume: "ot", slug: "neh", chapters: 13, aliases: ["Neh"] },
	{ name: "Esther", volume: "ot", slug: "esth", chapters: 10, aliases: ["Esth"] },
	{ name: "Job", volume: "ot", slug: "job", chapters: 42, capitalOnly: true },
	{ name: "Psalms", volume: "ot", slug: "ps", chapters: 150, aliases: ["Psalm", "Ps"] },
	{ name: "Proverbs", volume: "ot", slug: "prov", chapters: 31, aliases: ["Prov"] },
	{ name: "Ecclesiastes", volume: "ot", slug: "eccl", chapters: 12, aliases: ["Eccl"] },
	{ name: "Song of Solomon", volume: "ot", slug: "song", chapters: 8, aliases: ["Song"], capitalOnly: true },
	{ name: "Isaiah", volume: "ot", slug: "isa", chapters: 66, aliases: ["Isa"] },
	{ name: "Jeremiah", volume: "ot", slug: "jer", chapters: 52, aliases: ["Jer"] },
	{ name: "Lamentations", volume: "ot", slug: "lam", chapters: 5, aliases: ["Lam"] },
	{ name: "Ezekiel", volume: "ot", slug: "ezek", chapters: 48, aliases: ["Ezek"] },
	{ name: "Daniel", volume: "ot", slug: "dan", chapters: 12, aliases: ["Dan"] },
	{ name: "Hosea", volume: "ot", slug: "hosea", chapters: 14 },
	{ name: "Joel", volume: "ot", slug: "joel", chapters: 3 },
	{ name: "Amos", volume: "ot", slug: "amos", chapters: 9 },
	{ name: "Obadiah", volume: "ot", slug: "obad", chapters: 1, aliases: ["Obad"] },
	{ name: "Jonah", volume: "ot", slug: "jonah", chapters: 4 },
	{ name: "Micah", volume: "ot", slug: "micah", chapters: 7 },
	{ name: "Nahum", volume: "ot", slug: "nahum", chapters: 3 },
	{ name: "Habakkuk", volume: "ot", slug: "hab", chapters: 3, aliases: ["Hab"] },
	{ name: "Zephaniah", volume: "ot", slug: "zeph", chapters: 3, aliases: ["Zeph"] },
	{ name: "Haggai", volume: "ot", slug: "hag", chapters: 2, aliases: ["Hag"] },
	{ name: "Zechariah", volume: "ot", slug: "zech", chapters: 14, aliases: ["Zech"] },
	{ name: "Malachi", volume: "ot", slug: "mal", chapters: 4, aliases: ["Mal"] },

	{ name: "Matthew", volume: "nt", slug: "matt", chapters: 28, aliases: ["Matt"] },
	{ name: "Mark", volume: "nt", slug: "mark", chapters: 16, capitalOnly: true },
	{ name: "Luke", volume: "nt", slug: "luke", chapters: 24 },
	{ name: "John", volume: "nt", slug: "john", chapters: 21 },
	{ name: "Acts", volume: "nt", slug: "acts", chapters: 28, capitalOnly: true },
	{ name: "Romans", volume: "nt", slug: "rom", chapters: 16, aliases: ["Rom"] },
	{ name: "Corinthians", number: 1, volume: "nt", slug: "1-cor", chapters: 16, aliases: ["Cor"] },
	{ name: "Corinthians", number: 2, volume: "nt", slug: "2-cor", chapters: 13, aliases: ["Cor"] },
	{ name: "Galatians", volume: "nt", slug: "gal", chapters: 6, aliases: ["Gal"] },
	{ name: "Ephesians", volume: "nt", slug: "eph", chapters: 6, aliases: ["Eph"] },
	{ name: "Philippians", volume: "nt", slug: "philip", chapters: 4, aliases: ["Philip", "Phil"] },
	{ name: "Colossians", volume: "nt", slug: "col", chapters: 4, aliases: ["Col"] },
	{ name: "Thessalonians", number: 1, volume: "nt", slug: "1-thes", chapters: 5, aliases: ["Thes", "Thess"] },
	{ name: "Thessalonians", number: 2, volume: "nt", slug: "2-thes", chapters: 3, aliases: ["Thes", "Thess"] },
	{ name: "Timothy", number: 1, volume: "nt", slug: "1-tim", chapters: 6, aliases: ["Tim"] },
	{ name: "Timothy", number: 2, volume: "nt", slug: "2-tim", chapters: 4, aliases: ["Tim"] },
	{ name: "Titus", volume: "nt", slug: "titus", chapters: 3 },
	{ name: "Philemon", volume: "nt", slug: "philem", chapters: 1, aliases: ["Philem"] },
	{ name: "Hebrews", volume: "nt", slug: "heb", chapters: 13, aliases: ["Heb"] },
	{ name: "James", volume: "nt", slug: "james", chapters: 5 },
	{ name: "Peter", number: 1, volume: "nt", slug: "1-pet", chapters: 5, aliases: ["Pet"] },
	{ name: "Peter", number: 2, volume: "nt", slug: "2-pet", chapters: 3, aliases: ["Pet"] },
	{ name: "John", number: 1, volume: "nt", slug: "1-jn", chapters: 5, aliases: ["Jn"] },
	{ name: "John", number: 2, volume: "nt", slug: "2-jn", chapters: 1, aliases: ["Jn"] },
	{ name: "John", number: 3, volume: "nt", slug: "3-jn", chapters: 1, aliases: ["Jn"] },
	{ name: "Jude", volume: "nt", slug: "jude", chapters: 1 },
	{ name: "Revelation", volume: "nt", slug: "rev", chapters: 22, aliases: ["Rev"], capitalOnly: true },

	{ name: "Nephi", number: 1, volume: "bofm", slug: "1-ne", chapters: 22, aliases: ["Ne", "Neph"] },
	{ name: "Nephi", number: 2, volume: "bofm", slug: "2-ne", chapters: 33, aliases: ["Ne", "Neph"] },
	{ name: "Jacob", volume: "bofm", slug: "jacob", chapters: 7 },
	{ name: "Enos", volume: "bofm", slug: "enos", chapters: 1 },
	{ name: "Jarom", volume: "bofm", slug: "jarom", chapters: 1 },
	{ name: "Omni", volume: "bofm", slug: "omni", chapters: 1 },
	{ name: "Words of Mormon", volume: "bofm", slug: "w-of-m", chapters: 1, aliases: ["W of M", "WofM"] },
	{ name: "Mosiah", volume: "bofm", slug: "mosiah", chapters: 29 },
	{ name: "Alma", volume: "bofm", slug: "alma", chapters: 63 },
	{ name: "Helaman", volume: "bofm", slug: "hel", chapters: 16, aliases: ["Hel"] },
	{ name: "Nephi", number: 3, volume: "bofm", slug: "3-ne", chapters: 30, aliases: ["Ne", "Neph"] },
	{ name: "Nephi", number: 4, volume: "bofm", slug: "4-ne", chapters: 1, aliases: ["Ne", "Neph"] },
	{ name: "Mormon", volume: "bofm", slug: "morm", chapters: 9, aliases: ["Morm"] },
	{ name: "Ether", volume: "bofm", slug: "ether", chapters: 15, capitalOnly: true },
	{ name: "Moroni", volume: "bofm", slug: "moro", chapters: 10, aliases: ["Moro"] },

	{
		name: "D&C",
		volume: "dc-testament",
		slug: "dc",
		chapters: 138,
		aliases: ["Doctrine and Covenants", "Doctrine & Covenants", "D and C", "D & C", "DC", "D. & C."],
	},

	{ name: "Moses", volume: "pgp", slug: "moses", chapters: 8 },
	{ name: "Abraham", volume: "pgp", slug: "abr", chapters: 5, aliases: ["Abr"] },
	{ name: "Joseph Smith—Matthew", volume: "pgp", slug: "js-m", chapters: 1, aliases: ["JS-M", "JS—M", "Joseph Smith Matthew", "Joseph Smith-Matthew"] },
	{ name: "Joseph Smith—History", volume: "pgp", slug: "js-h", chapters: 1, aliases: ["JS-H", "JS—H", "Joseph Smith History", "Joseph Smith-History"] },
	{ name: "Articles of Faith", volume: "pgp", slug: "a-of-f", chapters: 1, aliases: ["A of F", "AofF"] },
];

const NUMBER_PREFIXES: Record<number, string[]> = {
	1: ["1", "1st", "first", "I"],
	2: ["2", "2nd", "second", "II"],
	3: ["3", "3rd", "third", "III"],
	4: ["4", "4th", "fourth", "IV"],
};

const displayName = (b: Book) => (b.number ? `${b.number} ${b.name}` : b.name);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Variant {
	text: string;
	book: Book;
}

// Every way to write every book, longest first so "1 Nephi" wins over "Nephi" and "Doctrine and Covenants" over "D".
const VARIANTS: Variant[] = BOOKS.flatMap((book) => {
	const bases = [book.name, ...(book.aliases ?? [])];
	if (!book.number) return bases.map((text) => ({ text, book }));
	return NUMBER_PREFIXES[book.number].flatMap((prefix) =>
		bases.flatMap((base) => [`${prefix} ${base}`, ...(/^\d/.test(prefix) ? [`${prefix}${base}`] : [])]).map((text) => ({ text, book })),
	);
}).sort((a, b) => b.text.length - a.text.length);

const variantPattern = (v: Variant) => escape(v.text).replace(/\\ |\s+/g, "\\s+").replace(/—|-/g, "[—–-]");
const BOOK_RE = new RegExp(`(?<![\\p{L}\\d])(${VARIANTS.map(variantPattern).join("|")})\\.?(?![\\p{L}])`, "giu");
const VARIANT_LOOKUP = new Map(VARIANTS.map((v) => [v.text.toLowerCase().replace(/[—–-]/g, "-").replace(/\s+/g, " "), v]));

// After the book: [chapter] N [M] [: or "verse(s)"] V [to V2] | -N
const NUM = "(\\d{1,3})";
const RANGE_WORD = "\\s*(?:-|–|—|\\bto\\b|\\bthrough\\b|\\band\\b)\\s*";
const VERSE_INTRO = "(?:\\s*:\\s*|\\s*,?\\s+verses?\\s+|\\s*,?\\s*vv?\\.\\s*)";
const AFTER_BOOK = new RegExp(
	`^\\s*(?:chapter\\s+)?${NUM}(?:\\s+${NUM}(?!\\s*:))?(?:${VERSE_INTRO}${NUM}(?:${RANGE_WORD}${NUM})?|\\s*[-–]\\s*${NUM})?`,
	"i",
);
const RANGE_IS_AND = /\band\b/i;

export interface FoundReference {
	ref: string;
	start: number;
	end: number;
}

export interface FindOptions {
	/** Dictated text: "Helaman 5-12" means 5:12, not chapters 5 to 12. */
	spoken?: boolean;
}

function lookupBook(matched: string): Book | undefined {
	return VARIANT_LOOKUP.get(matched.toLowerCase().replace(/[—–-]/g, "-").replace(/\s+/g, " "))?.book;
}

function format(book: Book, chapter: number, verse?: number, verseEnd?: number, list = false, chapterEnd?: number): string | null {
	if (chapter < 1 || chapter > book.chapters) return null;
	if (chapterEnd !== undefined) {
		if (chapterEnd <= chapter || chapterEnd > book.chapters) return null;
		return `${displayName(book)} ${chapter}-${chapterEnd}`;
	}
	let ref = `${displayName(book)} ${chapter}`;
	if (verse !== undefined) {
		if (verse < 1) return null;
		ref += `:${verse}`;
		if (verseEnd !== undefined && verseEnd !== verse) {
			if (list && verseEnd !== verse + 1) ref += `,${verseEnd}`;
			else if (verseEnd > verse) ref += `-${verseEnd}`;
			else return null;
		}
	}
	return ref;
}

function readAfterBook(book: Book, rest: string, spoken: boolean): { ref: string; length: number } | null {
	const m = AFTER_BOOK.exec(rest);
	if (!m) return null;
	const [whole, ch, second, verse, verseEnd, dashNum] = m;
	const n = (s?: string) => (s === undefined ? undefined : Number(s));
	const rangeIsAnd = verseEnd !== undefined && RANGE_IS_AND.test(whole.slice(whole.lastIndexOf(verse) + verse.length));
	let ref: string | null;
	if (second !== undefined && verse !== undefined) {
		// "Doctrine and Covenants 1 21, verse 41": dictation split chapter 121.
		const joined = Number(ch + second);
		ref = format(book, joined <= book.chapters ? joined : Number(ch), n(verse), n(verseEnd), rangeIsAnd);
	} else if (second !== undefined) {
		// "Helaman 5 12" -> 5:12, and "Moroni 10 4-5" -> 10:4-5.
		ref = format(book, Number(ch), Number(second), n(dashNum));
	} else if (verse !== undefined) {
		ref = format(book, Number(ch), Number(verse), n(verseEnd), rangeIsAnd);
	} else if (dashNum !== undefined) {
		ref = spoken ? format(book, Number(ch), Number(dashNum)) : format(book, Number(ch), undefined, undefined, false, Number(dashNum));
	} else {
		ref = format(book, Number(ch));
	}
	return ref ? { ref, length: whole.length } : null;
}

/** Second number + dash ("Moroni 10 4-5") is not covered by AFTER_BOOK's alternation; extend the match. */
function extendSecondRange(rest: string, found: { ref: string; length: number }): { ref: string; length: number } {
	const tail = /^\s*[-–]\s*(\d{1,3})/.exec(rest.slice(found.length));
	if (!tail || found.ref.includes("-") || !found.ref.includes(":")) return found;
	const [, verse] = found.ref.split(":");
	if (Number(tail[1]) <= Number(verse)) return found;
	return { ref: `${found.ref}-${tail[1]}`, length: found.length + tail[0].length };
}

/** All references in `text`, in order of appearance, each once. */
export function findReferences(text: string, options: FindOptions = {}): FoundReference[] {
	const found: FoundReference[] = [];
	const seen = new Set<string>();
	BOOK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = BOOK_RE.exec(text))) {
		const book = lookupBook(m[1]);
		if (!book) continue;
		if (book.capitalOnly && !/^[\dIV]*\s*[A-Z]/.test(m[1])) continue;
		const restStart = m.index + m[0].length;
		let read = readAfterBook(book, text.slice(restStart), !!options.spoken);
		if (!read) continue;
		read = extendSecondRange(text.slice(restStart), read);
		const end = restStart + read.length;
		BOOK_RE.lastIndex = end;
		if (seen.has(read.ref)) continue;
		seen.add(read.ref);
		found.push({ ref: read.ref, start: m.index, end });
	}
	return found;
}

/** A single reference in any common form, or null if `input` is not exactly one reference. */
export function normalizeReference(input: string): string | null {
	const text = input.trim().replace(/[.,;]+$/, "");
	if (!text) return null;
	const [first] = findReferences(text, { spoken: true });
	return first && first.start === 0 && first.end === text.length ? first.ref : null;
}

/** The scriptures field of a form: "alma 32 21; d&c 6:23" -> normalised refs plus anything unreadable. */
export function parseScriptureList(input: string): { refs: string[]; unknown: string[] } {
	const refs: string[] = [];
	const unknown: string[] = [];
	for (const part of input.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)) {
		const ref = normalizeReference(part);
		if (ref) {
			if (!refs.includes(ref)) refs.push(ref);
		} else unknown.push(part);
	}
	return { refs, unknown };
}

function parseNormalized(ref: string): { book: Book; chapter: number; verse?: number; verseEnd?: number } | null {
	const m = /^(.+?) (\d+)(?:-\d+)?(?::(\d+)(?:[-,](\d+))?)?$/.exec(ref);
	if (!m) return null;
	const book = BOOKS.find((b) => displayName(b) === m[1]);
	return book ? { book, chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : undefined, verseEnd: m[4] ? Number(m[4]) : undefined } : null;
}

/** Gospel Library link, in the same format the vault's existing notes use. */
export function referenceUrl(ref: string): string | null {
	const p = parseNormalized(ref);
	if (!p) return null;
	let url = `https://www.churchofjesuschrist.org/study/scriptures/${p.book.volume}/${p.book.slug}/${p.chapter}?lang=eng`;
	if (p.verse !== undefined) url += `&id=p${p.verse}${p.verseEnd !== undefined ? `-p${p.verseEnd}` : ""}#p${p.verse}`;
	return url;
}

/** Book name of a normalised reference ("1 Nephi 3:7" -> "1 Nephi"), for grouping. */
export function referenceBook(ref: string): string | null {
	const p = parseNormalized(ref);
	return p ? displayName(p.book) : null;
}

/** Canonical order: Old Testament, New Testament, Book of Mormon, D&C, Pearl of Great Price. */
export function sortReferences(refs: string[]): string[] {
	const key = (ref: string): number[] => {
		const p = parseNormalized(ref);
		return p ? [BOOKS.indexOf(p.book), p.chapter, p.verse ?? 0] : [Number.MAX_SAFE_INTEGER, 0, 0];
	};
	return [...refs].sort((a, b) => {
		const [ka, kb] = [key(a), key(b)];
		return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.localeCompare(b);
	});
}
