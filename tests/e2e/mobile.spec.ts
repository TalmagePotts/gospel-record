import { expect, test } from "./obsidian";

// Obsidian's own phone emulation, in a short window standing in for the space above the keyboard.
test("on a phone the form keeps Save visible above the keyboard and scrolls to the focused field", async ({ vault }) => {
	const { page } = vault;
	await page.evaluate(() => (window as any).app.emulateMobile(true));
	await page.waitForFunction(() => document.body.classList.contains("is-mobile") && (window as any).app.plugins.plugins["gospel-record"], null, { timeout: 30_000 });
	await page.setViewportSize({ width: 390, height: 420 });

	await vault.command("gospel-record:new-entry");
	const modal = page.locator(".gospel-record-modal");
	await expect(modal).toHaveClass(/gr-mobile/);

	const inView = async (selector: string) => {
		const box = await modal.locator(selector).boundingBox();
		return !!box && box.y >= 0 && box.y + box.height <= 420;
	};
	await expect.poll(() => inView(".gr-save")).toBe(true);
	// Save comes before the fields, i.e. at the top.
	const order = await modal.evaluate((m) => Array.from(m.querySelectorAll(".gr-save, textarea.gr-text"), (e) => e.tagName));
	expect(order).toEqual(["BUTTON", "TEXTAREA"]);

	await modal.locator(".gr-scriptures input").focus();
	await expect.poll(() => inView(".gr-scriptures input"), { timeout: 5000 }).toBe(true);
	await expect.poll(() => inView(".gr-save")).toBe(true);

	await modal.locator("textarea.gr-text").fill("Typed on the phone.");
	await modal.locator(".gr-save").click();
	await expect(modal).toBeHidden();
	await page.evaluate(() => (window as any).app.emulateMobile(false));
});
