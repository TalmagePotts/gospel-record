import { describe, expect, it } from "vitest";
import { TopicIndex } from "../src/topics";

const index = new TopicIndex(
	[
		{ name: "Prayer", path: "Gospel/Mysteries of God/Prayer.md", aliases: ["pray", "praying", "prayed"] },
		{ name: "Holy Spirit", path: "Gospel/Mysteries of God/Holy Spirit.md", aliases: ["Holy Ghost", "Spirit"] },
		{ name: "Zion", path: "Gospel/Mysteries of God/Zion.md", aliases: [] },
		{ name: "Abraham", path: "Gospel/Mysteries of God/Abraham.md", aliases: [] },
		{ name: "Abrahamic Covenant", path: "Gospel/Mysteries of God/Abrahamic Covenant.md", aliases: [] },
		{ name: "Rest", path: "Gospel/Mysteries of God/Rest.md", aliases: [] },
		{ name: "Trials", path: "Gospel/Mysteries of God/Trials.md", aliases: [] },
		{ name: "Elohim, God, the Eternal Father", path: "Gospel/Mysteries of God/Elohim, God, the Eternal Father.md", aliases: [] },
	],
	{ ignore: ["Rest"] },
);
const names = (text: string, opts = {}) => index.suggest(text, opts).map((s) => s.name);

describe("TopicIndex.suggest", () => {
	it("matches topic names and aliases as whole words, ignoring case", () => {
		expect(names("As I prayed, I felt the Holy Ghost. Zion came to mind.")).toEqual(["Holy Spirit", "Prayer", "Zion"]);
	});

	it("ranks topics mentioned more often first", () => {
		expect(names("Zion. I pray. I pray again. Zion. Zion.")).toEqual(["Zion", "Prayer"]);
	});

	it("matches simple plurals", () => {
		expect(names("my trial this week")).toEqual(["Trials"]);
		expect(names("our prayers were answered")).toEqual(["Prayer"]);
	});

	it("prefers the longest match so Abrahamic Covenant does not also count as Abraham", () => {
		expect(names("the Abrahamic covenant came to mind")).toEqual(["Abrahamic Covenant"]);
	});

	it("does not suggest topics just because they appear inside a scripture reference", () => {
		expect(names("I read Abraham 1:11 and Moses 7")).toEqual([]);
	});

	it("never suggests ignored topics", () => {
		expect(names("the rest of the day I rested")).toEqual([]);
	});

	it("leaves out topics already chosen and respects the limit", () => {
		expect(names("pray, Zion, Holy Ghost", { exclude: ["Zion"], limit: 1 })).toEqual(["Holy Spirit"]);
	});

	it("does not match inside other words", () => {
		expect(names("horizon spray")).toEqual([]);
	});
});

describe("TopicIndex.search", () => {
	it("finds topics by name or alias prefix for the form's autocomplete", () => {
		expect(index.search("pra").map((t) => t.name)).toEqual(["Prayer"]);
		expect(index.search("ghost").map((t) => t.name)).toEqual(["Holy Spirit"]);
		expect(index.search("eternal").map((t) => t.name)).toEqual(["Elohim, God, the Eternal Father"]);
	});

	it("returns exact name matches first", () => {
		expect(index.search("abraham").map((t) => t.name)).toEqual(["Abraham", "Abrahamic Covenant"]);
	});
});
