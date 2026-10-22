// Topic suggestions from the topic pages' names and aliases. Plain word matching on the device, no AI.
import { findReferences } from "./scripture";

export interface Topic {
	name: string;
	path: string;
	aliases: string[];
}

export interface Suggestion {
	name: string;
	path: string;
	hits: number;
}

interface Term {
	topic: Topic;
	re: RegExp;
	length: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Trials" matches "trial" and "Prayer" matches "prayers": compare without a trailing s/es.
function termPattern(term: string): string {
	const words = term.trim().split(/\s+/).map(escape);
	const last = words.pop()!;
	const stem = last.length > 3 ? last.replace(/(?:es|s)$/i, "") : last;
	return [...words, `${stem}(?:s|es)?`].join("\\s+");
}

export class TopicIndex {
	private readonly terms: Term[];
	private readonly ignore: Set<string>;

	constructor(
		readonly topics: Topic[],
		options: { ignore?: string[] } = {},
	) {
		this.ignore = new Set((options.ignore ?? []).map((n) => n.toLowerCase()));
		this.terms = topics
			.flatMap((topic) => [topic.name, ...topic.aliases].filter((t) => t.trim()).map((t) => ({ topic, term: t })))
			.map(({ topic, term }) => ({
				topic,
				re: new RegExp(`(?<![\\p{L}\\d])${termPattern(term)}(?![\\p{L}\\d])`, "giu"),
				length: term.length,
			}))
			// Longest terms claim their words first, so "Abrahamic Covenant" isn't also counted as "Abraham".
			.sort((a, b) => b.length - a.length);
	}

	/** Topics mentioned in `text`, most mentioned first; ties alphabetical. */
	suggest(text: string, options: { exclude?: string[]; limit?: number } = {}): Suggestion[] {
		const exclude = new Set((options.exclude ?? []).map((n) => n.toLowerCase()));
		// Blank out scripture references so "Abraham 1:11" doesn't suggest the Abraham topic.
		let haystack = text;
		for (const r of findReferences(text)) haystack = haystack.slice(0, r.start) + " ".repeat(r.end - r.start) + haystack.slice(r.end);

		const hits = new Map<Topic, number>();
		for (const { topic, re } of this.terms) {
			re.lastIndex = 0;
			haystack = haystack.replace(re, (match) => {
				hits.set(topic, (hits.get(topic) ?? 0) + 1);
				return " ".repeat(match.length);
			});
		}
		return [...hits.entries()]
			.filter(([t]) => !this.ignore.has(t.name.toLowerCase()) && !exclude.has(t.name.toLowerCase()))
			.map(([t, n]) => ({ name: t.name, path: t.path, hits: n }))
			.sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name))
			.slice(0, options.limit ?? Infinity);
	}

	/** Autocomplete: topics where a word of the name or an alias starts with `query`. Exact names first. */
	search(query: string, limit = 8): Topic[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const score = (t: Topic): number => {
			if (t.name.toLowerCase() === q) return 0;
			if (t.name.toLowerCase().startsWith(q)) return 1;
			const words = [t.name, ...t.aliases].flatMap((s) => s.toLowerCase().split(/[\s,]+/));
			if (words.some((w) => w.startsWith(q))) return 2;
			return [t.name, ...t.aliases].some((s) => s.toLowerCase().includes(q)) ? 3 : -1;
		};
		return this.topics
			.map((t) => ({ t, s: score(t) }))
			.filter(({ s }) => s >= 0)
			.sort((a, b) => a.s - b.s || a.t.name.localeCompare(b.t.name))
			.slice(0, limit)
			.map(({ t }) => t);
	}

	byName(name: string): Topic | undefined {
		const n = name.toLowerCase();
		return this.topics.find((t) => t.name.toLowerCase() === n);
	}
}
