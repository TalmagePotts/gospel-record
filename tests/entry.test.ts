import { describe, expect, it } from "vitest";
import { buildEntry, deriveTitle, ENTRY_TYPES, processIncoming, safeFileName, withTopicBlock } from "../src/entry";
import { TopicIndex } from "../src/topics";

const topics = new TopicIndex([
	{ name: "Prayer", path: "Gospel/Mysteries of God/Prayer.md", aliases: ["prayed"] },
	{ name: "Holy Spirit", path: "Gospel/Mysteries of God/Holy Spirit.md", aliases: ["Holy Ghost"] },
	{ name: "Faith", path: "Gospel/Mysteries of God/Faith.md", aliases: [] },
]);

describe("deriveTitle", () => {
	it("uses the first sentence, cut at a word boundary", () => {
		expect(deriveTitle("The power went out mid-song. Then the choir kept going.")).toBe("The power went out mid-song");
		expect(deriveTitle("a".repeat(5) + " " + "word ".repeat(30), 40)).toBe("aaaaa word word word word word word word");
	});

	it("falls back when there is no text", () => {
		expect(deriveTitle("   ")).toBe("Untitled entry");
	});
});

describe("safeFileName", () => {
	it("removes characters Obsidian or iCloud cannot store in a file name", () => {
		expect(safeFileName('Faith: "trust" / [Him]? #1 ^a | b')).toBe("Faith trust Him 1 a b");
	});
});

describe("buildEntry", () => {
	it("puts each type in its folder with the record properties", () => {
		const e = buildEntry({
			type: "experience",
			kind: "miracle",
			text: "The car started after we prayed.",
			topics: ["Prayer"],
			scriptures: ["Alma 32:21"],
			date: "2026-10-18",
		});
		expect(e.folder).toBe("Gospel/Special Experiences");
		expect(e.fileName).toBe("The car started after we prayed.md");
		expect(e.content).toBe(
			[
				"---",
				"date: 2026-10-18",
				"kind: miracle",
				"topics:",
				'  - "[[Prayer]]"',
				"scriptures:",
				'  - "Alma 32:21"',
				"---",
				"The car started after we prayed.",
				"",
			].join("\n"),
		);
	});

	it("writes empty lists rather than leaving the properties out", () => {
		const e = buildEntry({ type: "thought", text: "x", topics: [], scriptures: [], date: "2026-10-18" });
		expect(e.content).toContain("topics: []\nscriptures: []\n");
		expect(e.content).not.toContain("kind:");
	});

	it("keeps an attached recording and where the text came from", () => {
		const e = buildEntry({
			type: "parable",
			text: "x",
			topics: [],
			scriptures: [],
			date: "2026-10-18",
			source: "voice-whisper",
			audio: "Gospel/Audio/2026-10-18 1745.m4a",
		});
		expect(e.content).toContain('source: voice-whisper\naudio: "[[Gospel/Audio/2026-10-18 1745.m4a]]"\n');
		expect(e.content).toContain("![[Gospel/Audio/2026-10-18 1745.m4a]]");
	});

	it("knows every type's folder", () => {
		expect(Object.fromEntries(ENTRY_TYPES.map((t) => [t.id, t.folder]))).toEqual({
			scripture: "Gospel/Scripture Insights",
			thought: "Gospel/Thoughtful Insights",
			parable: "Gospel/Modern Parables",
			experience: "Gospel/Special Experiences",
		});
	});
});

describe("processIncoming (notes the iPhone Shortcut drops in the Inbox)", () => {
	it("files a voice note: detects type, fixes dictation, pulls out scriptures, suggests topics", () => {
		const result = processIncoming(
			{
				frontmatter: { needs_processing: true, source: "voice-whisper", date: "2026-10-18", scriptures_raw: "" },
				body: "Special experience. As I prayed, I felt the Holy Ghost. Then I remembered Allah 32, verse 21.",
			},
			{ topics, fixes: [] },
		);
		expect(result.type).toBe("experience");
		expect(result.title).toBe("As I prayed, I felt the Holy Ghost");
		expect(result.body).toBe("As I prayed, I felt the Holy Ghost. Then I remembered Alma 32:21.");
		expect(result.frontmatter).toEqual({
			date: "2026-10-18",
			source: "voice-whisper",
			topics: [],
			scriptures: ["Alma 32:21"],
			suggested_topics: ["Holy Spirit", "Prayer"],
		});
	});

	it("keeps a type and topics chosen in the Shortcut form, and merges typed scriptures", () => {
		const result = processIncoming(
			{
				frontmatter: {
					needs_processing: true,
					source: "form",
					type: "scripture",
					date: "2026-10-18",
					topics: ["[[Faith]]"],
					scriptures_raw: "moro 10 4-5; the bit about faith",
				},
				body: "Faith precedes the miracle, see Ether 12:6.",
			},
			{ topics, fixes: [] },
		);
		expect(result.type).toBe("scripture");
		expect(result.body).toBe("Faith precedes the miracle, see Ether 12:6.\n\nUnrecognised scripture: the bit about faith");
		expect(result.frontmatter.topics).toEqual(["[[Faith]]"]);
		expect(result.frontmatter.scriptures).toEqual(["Ether 12:6", "Moroni 10:4-5"]);
		expect(result.frontmatter.suggested_topics).toEqual([]);
	});

	it("does not rewrite typed text, only voice transcripts", () => {
		const result = processIncoming(
			{ frontmatter: { needs_processing: true, source: "form", type: "thought", date: "2026-10-18" }, body: "all the 32 verse 21" },
			{ topics, fixes: [] },
		);
		expect(result.body).toBe("all the 32 verse 21");
	});

	it("files a voice note with no spoken type under Thoughtful Insights and says so", () => {
		const result = processIncoming(
			{ frontmatter: { needs_processing: true, source: "voice-apple", date: "2026-10-18" }, body: "Today I noticed something." },
			{ topics, fixes: [] },
		);
		expect(result.type).toBe("thought");
		expect(result.frontmatter.type_guessed).toBe(true);
	});

	it("keeps a spoken kind (miracle, tender mercy) on Special Experiences", () => {
		const result = processIncoming(
			{ frontmatter: { needs_processing: true, source: "voice-whisper", date: "2026-10-18" }, body: "Tender mercy. A friend called." },
			{ topics, fixes: [] },
		);
		expect(result.type).toBe("experience");
		expect(result.frontmatter.kind).toBe("tender mercy");
	});
});

describe("withTopicBlock", () => {
	it("adds My Record above the folder-notes Parent footer", () => {
		expect(withTopicBlock("# Zion\n\ntext\n\nParent: [[Gospel/Mysteries of God]]")).toBe(
			"# Zion\n\ntext\n\n## My Record\n```gospel-record\nshow: topic\n```\n\nParent: [[Gospel/Mysteries of God]]\n",
		);
	});

	it("appends at the end when there is no footer", () => {
		expect(withTopicBlock("# Zion\ntext\n")).toBe("# Zion\ntext\n\n## My Record\n```gospel-record\nshow: topic\n```\n\n");
	});

	it("migrates the old Dataview block in place", () => {
		const old = '## My Record\n```dataviewjs\nawait dv.view("Other/Views/gospel-record", { show: "topic" })\n```\n\nParent: [[X]]';
		expect(withTopicBlock(old)).toBe("## My Record\n```gospel-record\nshow: topic\n```\n\nParent: [[X]]");
	});

	it("leaves a page that already has it alone", () => {
		const page = "x\n```gospel-record\nshow: topic\n```\n";
		expect(withTopicBlock(page)).toBe(page);
	});
});
