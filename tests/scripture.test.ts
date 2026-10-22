import { describe, expect, it } from "vitest";
import { findReferences, normalizeReference, parseScriptureList, referenceUrl, sortReferences } from "../src/scripture";

const refs = (text: string, spoken = false) => findReferences(text, { spoken }).map((r) => r.ref);

describe("normalizeReference", () => {
	it.each([
		["Alma 32:21", "Alma 32:21"],
		["alma 32:21", "Alma 32:21"],
		["1 Ne 3:7", "1 Nephi 3:7"],
		["1st Nephi 3:7", "1 Nephi 3:7"],
		["first nephi 3 7", "1 Nephi 3:7"],
		["1 nephi chapter 3 verse 7", "1 Nephi 3:7"],
		["Hel 5:12", "Helaman 5:12"],
		["Moro 10:4-5", "Moroni 10:4-5"],
		["D&C 121:41", "D&C 121:41"],
		["dc 121:41", "D&C 121:41"],
		["Doctrine and Covenants 6:23", "D&C 6:23"],
		["d and c 6 23", "D&C 6:23"],
		["Gen 11:1-9", "Genesis 11:1-9"],
		["Matt. 6:5", "Matthew 6:5"],
		["Abr 1:11", "Abraham 1:11"],
		["JS-H 1:17", "Joseph Smith—History 1:17"],
		["Joseph Smith History 1:17", "Joseph Smith—History 1:17"],
		["Psalm 23", "Psalms 23"],
		["3 John 1:4", "3 John 1:4"],
		["Words of Mormon 1:7", "Words of Mormon 1:7"],
	])("%s -> %s", (input, expected) => {
		expect(normalizeReference(input)).toBe(expected);
	});

	it("rejects chapters a book does not have", () => {
		expect(normalizeReference("Alma 64:1")).toBeNull();
		expect(normalizeReference("Enos 2:1")).toBeNull();
	});

	it("rejects text that is not a reference", () => {
		expect(normalizeReference("my job")).toBeNull();
		expect(normalizeReference("")).toBeNull();
	});
});

describe("findReferences in prose", () => {
	it("finds the references in the benchmark transcript", () => {
		const text =
			"This morning I was reading in 1 Nephi chapter 3, verse 7, where Nephi says he will go and do. " +
			"Then I remembered Alma 32, verse 21, about faith. Later I thought about Helaman 5-12, that we must build. " +
			"I also thought of Moroni 10, verses 4 and 5, and Doctrine and Covenants 121, verse 41, about gentleness.";
		expect(refs(text, true)).toEqual(["1 Nephi 3:7", "Alma 32:21", "Helaman 5:12", "Moroni 10:4-5", "D&C 121:41"]);
	});

	it("joins a chapter split by dictation when a verse follows (\"1 21, verse 41\")", () => {
		expect(refs("and doctrine and covenants 1 21, verse 41, about", true)).toEqual(["D&C 121:41"]);
	});

	it("reads two bare numbers as chapter and verse (\"Helaman 5 12\")", () => {
		expect(refs("I thought about Helaman 5 12 today", true)).toEqual(["Helaman 5:12"]);
	});

	it("treats a typed dash with no colon as a chapter range", () => {
		expect(refs("read Alma 36-42 this week")).toEqual(["Alma 36-42"]);
	});

	it("keeps non-consecutive verses as a list", () => {
		expect(refs("Moroni 10, verses 4 and 7", true)).toEqual(["Moroni 10:4,7"]);
	});

	it("ignores common words that are also book names unless capitalised", () => {
		expect(refs("I quit my job 2 years ago and acts 3 times")).toEqual([]);
		expect(refs("Job 19:25 and Acts 3:6")).toEqual(["Job 19:25", "Acts 3:6"]);
	});

	it("needs a chapter number to count as a reference", () => {
		expect(refs("Nephi was obedient, like Moses and Abraham.")).toEqual([]);
	});

	it("reports where each reference sits in the text", () => {
		const [r] = findReferences("See Alma 32:21 now", {});
		expect("See Alma 32:21 now".slice(r.start, r.end)).toBe("Alma 32:21");
	});

	it("does not report the same reference twice", () => {
		expect(refs("Alma 32:21 ... alma 32:21")).toEqual(["Alma 32:21"]);
	});
});

describe("parseScriptureList", () => {
	it("splits a typed field on ; and newlines and normalizes each", () => {
		expect(parseScriptureList("alma 32 21; d&c 6:23\nmoro 10:4-5")).toEqual({
			refs: ["Alma 32:21", "D&C 6:23", "Moroni 10:4-5"],
			unknown: [],
		});
	});

	it("reports parts it could not read instead of dropping them", () => {
		expect(parseScriptureList("Alma 32:21; the one about faith")).toEqual({
			refs: ["Alma 32:21"],
			unknown: ["the one about faith"],
		});
	});
});

describe("referenceUrl", () => {
	it("matches the Gospel Library link format already used in the vault", () => {
		expect(referenceUrl("Matthew 6:5")).toBe(
			"https://www.churchofjesuschrist.org/study/scriptures/nt/matt/6?lang=eng&id=p5#p5",
		);
		expect(referenceUrl("Moroni 10:4-5")).toBe(
			"https://www.churchofjesuschrist.org/study/scriptures/bofm/moro/10?lang=eng&id=p4-p5#p4",
		);
		expect(referenceUrl("D&C 121:41")).toBe(
			"https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/121?lang=eng&id=p41#p41",
		);
		expect(referenceUrl("Alma 36-42")).toBe("https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/36?lang=eng");
	});
});

describe("sortReferences", () => {
	it("sorts in canonical order, not alphabetically", () => {
		expect(sortReferences(["Moroni 10:4", "D&C 6:23", "Genesis 2:3", "Alma 32:21", "1 Nephi 3:7", "Matthew 6:5"])).toEqual([
			"Genesis 2:3",
			"Matthew 6:5",
			"1 Nephi 3:7",
			"Alma 32:21",
			"Moroni 10:4",
			"D&C 6:23",
		]);
	});
});
