// Launches the real Obsidian app (AppImage, extracted) on a throwaway copy of fixture-vault and
// connects Playwright over the Chrome DevTools protocol. Each test gets a fresh vault and app.
import { type ChildProcess, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { type Browser, chromium, type Page, test as base } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "../..");
const OBSIDIAN = process.env.OBSIDIAN_BIN ?? path.join(os.homedir(), ".cache/obsidian-e2e/squashfs-root/obsidian");
const FIXTURE = path.join(__dirname, "fixture-vault");
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
const START_TIMEOUT_MS = 30_000;

export const PLUGIN_SETTINGS = {
	topicsFolder: "Gospel/Mysteries of God",
	topicTemplate: "Templates/Topic.md",
	ignoreTopics: "Rest",
	dictationFixes: "emmalene, emiline => Emmaline",
	debug: true,
};

export interface Vault {
	dir: string;
	page: Page;
	read(rel: string): string;
	exists(rel: string): boolean;
	write(rel: string, content: string): void;
	list(relDir: string): string[];
	command(id: string): Promise<void>;
	/** Opens an obsidian:// link the way iOS/macOS do: a second launch hands it to the running app. */
	openUri(uri: string): void;
	openFile(rel: string): Promise<void>;
	logs: string[];
}

function copyDir(src: string, dst: string): void {
	fs.mkdirSync(dst, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const [s, d] = [path.join(src, entry.name), path.join(dst, entry.name)];
		if (entry.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
}

async function waitForCdp(port: number): Promise<void> {
	const deadline = Date.now() + START_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error("Obsidian did not open its debugging port");
}

export const test = base.extend<{ vault: Vault; obsidian: { vaultDir: string; userData: string; page: Page; logs: string[] } }>({
	obsidian: [
		async ({}, use, testInfo) => {
			if (!fs.existsSync(OBSIDIAN)) throw new Error(`Obsidian not found at ${OBSIDIAN} (set OBSIDIAN_BIN)`);
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gospel-record-e2e-"));
			const vaultDir = path.join(tmp, "vault");
			const userData = path.join(tmp, "user-data");
			copyDir(FIXTURE, vaultDir);
			const pluginDir = path.join(vaultDir, ".obsidian/plugins/gospel-record");
			fs.mkdirSync(pluginDir, { recursive: true });
			for (const f of PLUGIN_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(pluginDir, f));
			fs.writeFileSync(path.join(pluginDir, "data.json"), JSON.stringify(PLUGIN_SETTINGS));
			fs.mkdirSync(userData, { recursive: true });
			fs.writeFileSync(
				path.join(userData, "obsidian.json"),
				JSON.stringify({ vaults: { e2e0000000000001: { path: vaultDir, ts: Date.now(), open: true } } }),
			);

			const port = 9400 + testInfo.workerIndex;
			const proc: ChildProcess = spawn(OBSIDIAN, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, "--no-sandbox", "--disable-gpu"], {
				stdio: "ignore",
				env: { ...process.env },
			});
			let browser: Browser | undefined;
			try {
				await waitForCdp(port);
				browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
				const deadline = Date.now() + START_TIMEOUT_MS;
				let page: Page | undefined;
				while (!page && Date.now() < deadline) {
					page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith("devtools"));
					if (!page) await new Promise((r) => setTimeout(r, 250));
				}
				if (!page) throw new Error("no Obsidian window");
				const logs: string[] = [];
				page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
				await page.waitForFunction(() => (window as any).app?.workspace?.layoutReady, null, { timeout: START_TIMEOUT_MS });
				// Fresh profile starts in Restricted Mode: trust the vault and load the plugin under test.
				await page.evaluate(async () => {
					const app = (window as any).app;
					localStorage.setItem(`enable-plugin-${app.appId}`, "true");
					await app.plugins.setEnable(true);
					await app.plugins.loadManifests();
					if (!app.plugins.plugins["gospel-record"]) await app.plugins.enablePlugin("gospel-record");
				});
				await page.waitForFunction(() => !!(window as any).app.plugins.plugins["gospel-record"]?.topicIndex?.topics?.length, null, {
					timeout: START_TIMEOUT_MS,
				});
				// Close any trust or welcome dialogs a fresh profile may show.
				await page.keyboard.press("Escape");
				await use({ vaultDir, userData, page, logs });
			} finally {
				await browser?.close().catch(() => {});
				const exited = new Promise((r) => proc.once("exit", r));
				proc.kill();
				await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
				fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		},
		{ timeout: 60_000 },
	],

	vault: async ({ obsidian }, use) => {
		const { vaultDir, userData, page, logs } = obsidian;
		const abs = (rel: string) => path.join(vaultDir, rel);
		await use({
			dir: vaultDir,
			page,
			logs,
			read: (rel) => fs.readFileSync(abs(rel), "utf8"),
			exists: (rel) => fs.existsSync(abs(rel)),
			write: (rel, content) => {
				fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
				fs.writeFileSync(abs(rel), content);
			},
			list: (relDir) => (fs.existsSync(abs(relDir)) ? fs.readdirSync(abs(relDir)).sort() : []),
			command: async (id) => {
				const ok = await page.evaluate((cmd) => (window as any).app.commands.executeCommandById(cmd), id);
				if (!ok) throw new Error(`command ${id} not found`);
			},
			openUri: (uri) => {
				spawn(OBSIDIAN, [`--user-data-dir=${userData}`, "--no-sandbox", "--disable-gpu", uri], { stdio: "ignore", detached: true }).unref();
			},
			openFile: async (rel) => {
				await page.evaluate(async (p) => {
					const app = (window as any).app;
					await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(p));
				}, rel);
			},
		});
		// Leave no modal open for the next test.
		await page.keyboard.press("Escape");
	},
});

export const expect = test.expect;

/** Polls until `fn` stops throwing, for files Obsidian writes asynchronously. */
export async function eventually<T>(fn: () => T, timeoutMs = 10_000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			return fn();
		} catch (e) {
			if (Date.now() > deadline) throw e;
			await new Promise((r) => setTimeout(r, 200));
		}
	}
}
