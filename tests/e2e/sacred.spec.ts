import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eventually, expect, test, type Vault } from "./obsidian";

const MELD = path.join(path.dirname(fileURLToPath(import.meta.url)), "vendor/meld-encrypt");
const SECRET = "words only God and I should read";

async function installMeld(vault: Vault) {
	for (const f of fs.readdirSync(MELD)) vault.write(`.obsidian/plugins/meld-encrypt/${f}`, fs.readFileSync(path.join(MELD, f), "utf8"));
	vault.write(".obsidian/plugins/meld-encrypt/data.json", JSON.stringify({ rememberPassword: true, rememberPasswordTimeout: 5 }));
	await vault.page.evaluate(async () => {
		const app = (window as any).app;
		await app.plugins.loadManifests();
		await app.plugins.enablePlugin("meld-encrypt");
	});
}

test("creates the Sacred note already encrypted, and typed words never reach the disk unencrypted", async ({ vault }) => {
	const { page } = vault;
	await installMeld(vault);
	await vault.command("gospel-record:new-sacred");

	const prompt = page.locator(".modal", { hasText: "Please provide a password for encryption" });
	await expect(prompt).toBeVisible();
	const fields = prompt.locator('input[type="password"]');
	await fields.nth(0).fill("correct horse");
	await fields.nth(1).fill("correct horse");
	await prompt.getByRole("button", { name: "Confirm" }).click();

	const name = await eventually(() => {
		const files = vault.list("Gospel/Sacred");
		expect(files).toHaveLength(1);
		return files[0];
	});
	expect(name).toMatch(/\.mdenc$/);

	// Type into the open encrypted note, then check what is on disk.
	const editor = page.locator(".workspace-leaf.mod-active .cm-content").first();
	await editor.click();
	await page.keyboard.type(SECRET);
	await page.waitForTimeout(3000);
	const onDisk = vault.read(`Gospel/Sacred/${name}`);
	expect(onDisk.length).toBeGreaterThan(50);
	expect(onDisk).not.toContain(SECRET);
	expect(onDisk).not.toContain("only God");
	// Nothing else in the vault holds the words either.
	const stray = vault.list("Gospel/Sacred").filter((f) => !f.endsWith(".mdenc"));
	expect(stray).toEqual([]);
});

test("cancelling the password prompt creates nothing", async ({ vault }) => {
	const { page } = vault;
	await installMeld(vault);
	await vault.command("gospel-record:new-sacred");
	const prompt = page.locator(".modal", { hasText: "Please provide a password for encryption" });
	await expect(prompt).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(prompt).toBeHidden();
	await page.waitForTimeout(1000);
	expect(vault.list("Gospel/Sacred")).toEqual([]);
});
