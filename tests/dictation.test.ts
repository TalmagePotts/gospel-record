import { describe, expect, it } from "vitest";
import { detectType, fixDictation, parseFixes } from "../src/dictation";

describe("fixDictation", () => {
	it("fixes scripture names Whisper and Apple mishear, only before a chapter number", () => {
		expect(fixDictation("Then I remembered Allah 32, verse 21")).toBe("Then I remembered Alma 32:21");
		expect(fixDictation("all the 32 verse 21")).toBe("Alma 32:21");
		expect(fixDictation("Ola 32, verse 21")).toBe("Alma 32:21");
		expect(fixDictation("I gave it all the time I had")).toBe("I gave it all the time I had");
	});

	it("rewrites spoken references into standard form", () => {
		expect(fixDictation("reading in 1st Nephi chapter 3, verse 7, where")).toBe("reading in 1 Nephi 3:7, where");
		expect(fixDictation("Moroni 10, verses 4 and 5, and Doctrine and Covenants 121, verse 41, about")).toBe(
			"Moroni 10:4-5, and D&C 121:41, about",
		);
		expect(fixDictation("Helaman 5-12 that we must build")).toBe("Helaman 5:12 that we must build");
	});

	it("turns ceilings into sealings only when the note is about the temple", () => {
		expect(fixDictation("Later at the temple, during ceilings, I thought")).toBe("Later at the temple, during sealings, I thought");
		expect(fixDictation("We painted the ceilings")).toBe("We painted the ceilings");
	});

	it("applies the user's own fixes as whole words, ignoring case", () => {
		const fixes = parseFixes("emmalene, emiline, Emmalyn => Emmaline\n# comment\n\nbad line");
		expect(fixDictation("share it with emmalene tonight", fixes)).toBe("share it with Emmaline tonight");
		expect(fixDictation("Emiline and I", fixes)).toBe("Emmaline and I");
		expect(fixDictation("emmaleneville", fixes)).toBe("emmaleneville");
	});

	it("leaves the prose alone otherwise", () => {
		const text = "I felt so much peace. The Abrahamic covenant, Zion, and the city of Enoch all came to mind.";
		expect(fixDictation(text)).toBe(text);
	});
});

describe("parseFixes", () => {
	it("skips comments, blanks and lines without =>", () => {
		expect(parseFixes("# x\n\nnope\na, b => c")).toEqual([{ from: ["a", "b"], to: "c" }]);
	});
});

describe("detectType", () => {
	it.each([
		["Special experience. Today at the temple…", "experience", undefined, "Today at the temple…"],
		["Special Experience! Today", "experience", undefined, "Today"],
		["Scripture insight: in Alma 32", "scripture", undefined, "in Alma 32"],
		["Thoughtful insight, I noticed", "thought", undefined, "I noticed"],
		["Thought. I noticed", "thought", undefined, "I noticed"],
		["Modern parable. My son", "parable", undefined, "My son"],
		["Parable. My son", "parable", undefined, "My son"],
		["Miracle. The car", "experience", "miracle", "The car"],
		["Tender mercy. A friend", "experience", "tender mercy", "A friend"],
		["Answered prayer. We", "experience", "answered prayer", "We"],
	])("%s", (text, type, kind, rest) => {
		expect(detectType(text)).toEqual({ type, kind, rest });
	});

	it("returns no type when the note does not start with one", () => {
		expect(detectType("Today I went to the store")).toEqual({ type: undefined, kind: undefined, rest: "Today I went to the store" });
	});
});
