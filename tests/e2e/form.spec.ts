import { eventually, expect, test } from "./obsidian";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe("New entry form", () => {
	test("saves a Special Experience with suggested topics, a kind and scriptures, using only the keyboard and taps", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:new-entry");
		const modal = page.locator(".gospel-record-modal");
		await expect(modal).toBeVisible();
		await expect(modal.locator("textarea.gr-text")).toBeFocused();

		await page.keyboard.type("As I prayed I felt the Holy Ghost confirm Alma 32:21 to me.");
		// Suggestions come from topic names and aliases; Rest is ignored in settings.
		await expect(modal.locator(".gr-suggested [data-suggestion]")).toHaveText(["+ Holy Spirit", "+ Prayer"]);
		await expect(modal.locator('.gr-scripture-preview [data-ref="Alma 32:21"]')).toHaveText("Alma 32:21 (in text)");

		await modal.locator('[data-suggestion="Prayer"]').click();
		await expect(modal.locator(".gr-chosen [data-topic]")).toHaveText(["Prayer"]);
		await expect(modal.locator(".gr-suggested [data-suggestion]")).toHaveText(["+ Holy Spirit"]);

		await modal.locator(".gr-scriptures input").fill("moro 10 4-5; the one about faith");
		await expect(modal.locator(".gr-scripture-preview .gr-chip")).toHaveText(["Alma 32:21 (in text)", "Moroni 10:4-5", "? the one about faith"]);

		await page.keyboard.press(`${MOD}+4`);
		await expect(modal.locator('.gr-types [data-type="experience"]')).toHaveClass(/is-active/);
		await expect(modal.locator(".gr-kinds")).toBeVisible();
		await modal.locator('.gr-kinds [data-kind="miracle"]').click();

		await page.keyboard.press(`${MOD}+Enter`);
		await expect(modal).toBeHidden();

		const content = await eventually(() => vault.read("Gospel/Special Experiences/As I prayed I felt the Holy Ghost confirm Alma 32 21 to me.md"));
		expect(content).toBe(
			[
				"---",
				`date: ${new Date().toLocaleDateString("en-CA")}`,
				"kind: miracle",
				"topics:",
				'  - "[[Prayer]]"',
				"scriptures:",
				'  - "Alma 32:21"',
				'  - "Moroni 10:4-5"',
				"source: form",
				"---",
				"As I prayed I felt the Holy Ghost confirm Alma 32:21 to me.",
				"",
				"Unrecognised scripture: the one about faith",
				"",
			].join("\n"),
		);
	});

	test("refuses to save an empty entry and says why", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:new-entry");
		const modal = page.locator(".gospel-record-modal");
		await modal.locator(".gr-save").click();
		await expect(modal.locator(".gr-error")).toHaveText("Write something first.");
		await expect(modal).toBeVisible();
		await expect(modal.locator("textarea.gr-text")).toBeFocused();
	});

	test("adds topics by search with Enter, and creates a new topic from the template", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:new-thought");
		const modal = page.locator(".gospel-record-modal");
		await expect(modal.locator('.gr-types [data-type="thought"]')).toHaveClass(/is-active/);
		await modal.locator("textarea.gr-text").fill("Covenants bind us to Christ.");

		const search = modal.locator(".gr-search input");
		await search.fill("ghost");
		await expect(modal.locator(".gr-result").first()).toHaveText("Holy Spirit");
		await search.press("Enter");
		await expect(modal.locator(".gr-chosen [data-topic]")).toHaveText(["Holy Spirit"]);
		await expect(search).toHaveValue("");

		await search.fill("Covenants");
		await expect(modal.locator("[data-create]")).toHaveText("Create topic “Covenants”");
		await search.press("Enter");
		await expect(modal.locator(".gr-chosen [data-topic]")).toHaveText(["Holy Spirit", "Covenants"]);

		const topic = await eventually(() => vault.read("Gospel/Mysteries of God/Covenants.md"));
		expect(topic).toContain(`Date Created: ${new Date().toLocaleDateString("en-CA")}`);
		expect(topic).toContain("```gospel-record\nshow: topic\n```");

		await page.keyboard.press(`${MOD}+Enter`);
		const entry = await eventually(() => vault.read("Gospel/Thoughtful Insights/Covenants bind us to Christ.md"));
		expect(entry).toContain('topics:\n  - "[[Holy Spirit]]"\n  - "[[Covenants]]"\n');
	});

	test("remembers the last type used", async ({ vault }) => {
		const { page } = vault;
		await vault.command("gospel-record:new-parable");
		await page.locator(".gospel-record-modal textarea.gr-text").fill("The choir kept singing in the dark.");
		await page.keyboard.press(`${MOD}+Enter`);
		await eventually(() => vault.read("Gospel/Modern Parables/The choir kept singing in the dark.md"));

		await vault.command("gospel-record:new-entry");
		await expect(page.locator('.gospel-record-modal .gr-types [data-type="parable"]')).toHaveClass(/is-active/);
	});

	test("does not overwrite an entry with the same title", async ({ vault }) => {
		const { page } = vault;
		for (let i = 0; i < 2; i++) {
			await vault.command("gospel-record:new-scripture");
			await page.locator(".gospel-record-modal textarea.gr-text").fill("Same title.");
			await page.keyboard.press(`${MOD}+Enter`);
			await expect(page.locator(".gospel-record-modal")).toBeHidden();
		}
		await eventually(() => expect(vault.list("Gospel/Scripture Insights")).toEqual(["Same title 2.md", "Same title.md"]));
	});
});

test("a spoken type at the start picks the type and kind and is left out of the entry", async ({ vault }) => {
	const { page } = vault;
	await vault.command("gospel-record:new-scripture");
	const modal = page.locator(".gospel-record-modal");
	// Opened as Scripture Insight, but the user did not pick it, so the prefix wins.
	await modal.locator("textarea.gr-text").fill("Tender mercy. A friend called right when I needed it.");
	await expect(modal.locator('.gr-types [data-type="experience"]')).toHaveClass(/is-active/);
	await expect(modal.locator('.gr-kinds [data-kind="tender mercy"]')).toHaveClass(/is-active/);
	await expect(modal.locator(".gr-title")).toHaveAttribute("placeholder", "Title: A friend called right when I needed it");
	await page.keyboard.press(`${MOD}+Enter`);
	const entry = await eventually(() => vault.read("Gospel/Special Experiences/A friend called right when I needed it.md"));
	expect(entry).toContain("kind: tender mercy\n");
	expect(entry).toContain("---\nA friend called right when I needed it.\n");
});

test("a type picked by hand is not overridden by the text", async ({ vault }) => {
	const { page } = vault;
	await vault.command("gospel-record:new-entry");
	const modal = page.locator(".gospel-record-modal");
	await modal.locator('.gr-types [data-type="parable"]').click();
	await modal.locator("textarea.gr-text").fill("Miracle. That is what my son called his lost toy turning up.");
	await page.waitForTimeout(500);
	await expect(modal.locator('.gr-types [data-type="parable"]')).toHaveClass(/is-active/);
	await page.keyboard.press(`${MOD}+Enter`);
	const entry = await eventually(() => vault.read("Gospel/Modern Parables/Miracle.md"));
	expect(entry).toContain("---\nMiracle. That is what my son called his lost toy turning up.\n");
});
