import { eventually, expect, test, type Vault } from "./obsidian";

const VOICE_NOTE = [
	"---",
	"needs_processing: true",
	"source: voice-whisper",
	"date: 2026-10-18",
	'audio: "[[Gospel/Audio/2026-10-18 1745.m4a]]"',
	"---",
	"Special experience. At the temple, during ceilings, I prayed and remembered Allah 32, verse 21. I will tell emmalene tonight.",
	"",
].join("\n");
const FILED = "Gospel/Special Experiences/At the temple, during sealings, I prayed and remembered Alma.md";

async function setUp(vault: Vault) {
	await vault.command("gospel-record:setup-vault");
	const confirm = vault.page.locator(".modal", { hasText: "Add a “My Record” section to" });
	await confirm.getByRole("button", { name: "Add" }).click();
	await expect(confirm).toBeHidden();
}

async function dropVoiceNote(vault: Vault) {
	vault.write("Gospel/Audio/2026-10-18 1745.m4a", "fake audio");
	vault.write("Gospel/Inbox/2026-10-18 1745 voice.md", VOICE_NOTE);
	return eventually(() => vault.read(FILED), 20_000);
}

test.describe("Inbox, dashboard and topic pages", () => {
	test("set up migrates the old Dataview block and adds My Record to topic pages after confirming", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:setup-vault");
		const confirm = page.locator(".modal", { hasText: "Add a “My Record” section to" });
		await expect(confirm).toContainText("to 5 topic pages");
		await confirm.getByRole("button", { name: "Add" }).click();

		await eventually(() => expect(vault.read("Gospel/Mysteries of God/Zion.md")).toContain("## My Record\n```gospel-record\nshow: topic\n```\n\nParent:"));
		expect(vault.read("Gospel/Mysteries of God/Zion.md")).not.toContain("dataviewjs");
		await eventually(() =>
			expect(vault.read("Gospel/Mysteries of God/Prayer.md")).toBe(
				"---\naliases:\n  - pray\n  - prayed\n---\nPrayer is communication with God.\n\n## My Record\n```gospel-record\nshow: topic\n```\n\nParent: [[Gospel/Mysteries of God]]\n",
			),
		);
		for (const folder of ["Gospel/Inbox", "Gospel/Audio", "Gospel/Sacred", "Gospel/Scripture Insights"]) expect(vault.exists(folder)).toBe(true);
		expect(vault.read("Gospel/Gospel Dashboard.md")).toContain("show: needs-topics");
		// The folder note is not a topic and is left alone.
		expect(vault.read("Gospel/Mysteries of God/Mysteries of God.md")).toBe("Folder note, not a topic.\n");
	});

	test("files a voice note from the iPhone Shortcut: type, dictation fixes, scriptures, suggestions, audio", async ({ vault }) => {
		const content = await dropVoiceNote(vault);
		expect(vault.list("Gospel/Inbox")).toEqual([]);
		expect(content).toContain("At the temple, during sealings, I prayed and remembered Alma 32:21. I will tell Emmaline tonight.");
		expect(content).toContain("![[Gospel/Audio/2026-10-18 1745.m4a]]");
		expect(content).toMatch(/scriptures:\n\s+- Alma 32:21/);
		expect(content).toMatch(/suggested_topics:\n\s+- Prayer/);
		expect(content).toMatch(/topics: \[\]/);
		expect(content).not.toContain("needs_processing");
	});

	test("the dashboard turns a suggestion into a topic with one tap, and the topic page lists the entry", async ({ vault }) => {
		const { page } = vault;
		await setUp(vault);
		await dropVoiceNote(vault);
		await vault.openFile("Gospel/Gospel Dashboard.md");
		const chip = page.locator('.gospel-record-view [data-suggestion="Prayer"]');
		await expect(chip).toBeVisible({ timeout: 15_000 });
		await chip.click();

		await eventually(() => expect(vault.read(FILED)).toMatch(/topics:\n\s+- "?\[\[Prayer\]\]"?/));
		expect(vault.read(FILED)).not.toContain("suggested_topics");

		await vault.openFile("Gospel/Mysteries of God/Prayer.md");
		const record = page.locator(".gospel-record-view").filter({ hasText: "Special Experiences" });
		await expect(record).toContainText("At the temple, during sealings, I prayed and remembered Alma", { timeout: 15_000 });
	});

	test("the scripture index groups references by book in canonical order with Gospel Library links", async ({ vault }) => {
		const { page } = vault;
		await setUp(vault);
		await dropVoiceNote(vault);
		vault.write(
			"Gospel/Scripture Insights/Babel.md",
			'---\ndate: 2026-02-11\ntopics: ["[[Zion]]"]\nscriptures: ["Moses 7:18", "Genesis 11:4"]\n---\nTower of Babel vs Zion.\n',
		);
		await vault.openFile("Gospel/Gospel Dashboard.md");
		const index = page.locator(".gospel-record-view").filter({ has: page.locator("h4") }).last();
		await expect(index.locator("h4")).toHaveText(["Genesis", "Alma", "Moses"], { timeout: 15_000 });
		await expect(index.getByRole("link", { name: "Alma 32:21" })).toHaveAttribute(
			"href",
			"https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p21#p21",
		);
	});

	test("a voice note with no spoken type is flagged, and one tap files it", async ({ vault }) => {
		const { page } = vault;
		await setUp(vault);
		vault.write("Gospel/Inbox/untyped.md", "---\nneeds_processing: true\nsource: voice-apple\ndate: 2026-10-18\n---\nMy son shared his toy without being asked.\n");
		const guessed = "Gospel/Thoughtful Insights/My son shared his toy without being asked.md";
		await eventually(() => expect(vault.read(guessed)).toContain("type_guessed: true"), 20_000);

		await vault.openFile("Gospel/Gospel Dashboard.md");
		const row = page.locator(".gospel-record-view .gr-needs", { hasText: "My son shared his toy" }).filter({ has: page.locator('[data-type="parable"]') });
		await row.locator('[data-type="parable"]').click();
		const moved = "Gospel/Modern Parables/My son shared his toy without being asked.md";
		await eventually(() => expect(vault.read(moved)).not.toContain("type_guessed"));
		expect(vault.exists(guessed)).toBe(false);
	});

	test("Sacred refuses to create anything without Meld Encrypt", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:new-sacred");
		await expect(page.locator(".notice", { hasText: "Install and enable the Meld Encrypt plugin first" })).toBeVisible();
		expect(vault.list("Gospel/Sacred")).toEqual([]);
	});
});
