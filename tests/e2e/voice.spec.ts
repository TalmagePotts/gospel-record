import http from "http";
import type { AddressInfo } from "net";
import { eventually, expect, test, type Vault } from "./obsidian";

interface FakeWhisper {
	url: string;
	requests: { auth?: string; body: Buffer }[];
	close(): Promise<void>;
}

/** Stands in for the Whisper server you run yourself. */
async function fakeWhisper(transcript: string): Promise<FakeWhisper> {
	const requests: FakeWhisper["requests"] = [];
	const server = http.createServer((req, res) => {
		if (req.url === "/health") return res.end(JSON.stringify({ ok: true, model: "fake" }));
		const chunks: Buffer[] = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			requests.push({ auth: req.headers.authorization, body: Buffer.concat(chunks) });
			if (req.headers.authorization !== "Bearer secret") {
				res.statusCode = 401;
				return res.end("{}");
			}
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ text: transcript, duration: 3, seconds: 1, model: "fake" }));
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	return {
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		requests,
		close: () => new Promise((r) => server.close(() => r())),
	};
}

async function configure(vault: Vault, url: string, token = "secret") {
	await vault.page.evaluate(
		async ([u, t]) => {
			const app = (window as any).app;
			const p = app.plugins.plugins["gospel-record"];
			p.settings.whisperUrl = u;
			await p.saveSettings();
			app.saveLocalStorage("gospel-record-whisper-token", t);
		},
		[url, token],
	);
}

const voiceNote = (stamp: string) =>
	`---\nneeds_processing: true\nneeds_transcription: true\nsource: voice\ndate: 2026-10-18\naudio: "[[Gospel/Audio/${stamp}.m4a]]"\n---\n`;

test("transcribes a recording with the token and files it", async ({ vault }) => {
	const whisper = await fakeWhisper("Tender mercy. A friend called right when I needed it, like Allah 32 verse 21.");
	try {
		await configure(vault, whisper.url);
		vault.write("Gospel/Audio/2026-10-18 0900.m4a", "AUDIO-BYTES");
		vault.write("Gospel/Inbox/2026-10-18 0900.md", voiceNote("2026-10-18 0900"));

		const filed = "Gospel/Special Experiences/A friend called right when I needed it, like Alma 32 21.md";
		const content = await eventually(() => vault.read(filed), 20_000);
		expect(content).toContain("kind: tender mercy");
		expect(content).toContain("source: voice-whisper");
		expect(content).not.toContain("needs_transcription");
		expect(content).toContain("A friend called right when I needed it, like Alma 32:21.");
		expect(content).toContain("![[Gospel/Audio/2026-10-18 0900.m4a]]");
		expect(vault.list("Gospel/Inbox")).toEqual([]);

		expect(whisper.requests).toHaveLength(1);
		expect(whisper.requests[0].auth).toBe("Bearer secret");
		const body = whisper.requests[0].body.toString();
		expect(body).toContain('name="file"; filename="2026-10-18 0900.m4a"');
		expect(body).toContain("Content-Type: audio/mp4");
		expect(body).toContain("AUDIO-BYTES");
	} finally {
		await whisper.close();
	}
});

test("keeps the note in the Inbox and explains when Whisper can't be reached", async ({ vault }) => {
	const whisper = await fakeWhisper("unused");
	const url = whisper.url;
	await whisper.close();
	await configure(vault, url);
	vault.write("Gospel/Audio/2026-10-18 0901.m4a", "AUDIO");
	vault.write("Gospel/Inbox/2026-10-18 0901.md", voiceNote("2026-10-18 0901"));

	await expect(vault.page.locator(".notice", { hasText: "can't reach the Whisper server" })).toBeVisible({ timeout: 20_000 });
	expect(vault.list("Gospel/Inbox")).toEqual(["2026-10-18 0901.md"]);
	expect(vault.read("Gospel/Inbox/2026-10-18 0901.md")).toContain("needs_transcription: true");
});

test("waits quietly for a recording that hasn't synced yet, then files it when it arrives", async ({ vault }) => {
	const whisper = await fakeWhisper("Thought. Late recording.");
	try {
		await configure(vault, whisper.url);
		vault.write("Gospel/Inbox/2026-10-18 0902.md", voiceNote("2026-10-18 0902"));
		await vault.page.waitForTimeout(5000);
		expect(vault.list("Gospel/Inbox")).toEqual(["2026-10-18 0902.md"]);
		await expect(vault.page.locator(".notice", { hasText: "could not file" })).toHaveCount(0);

		vault.write("Gospel/Audio/2026-10-18 0902.m4a", "AUDIO");
		await eventually(() => vault.read("Gospel/Thoughtful Insights/Late recording.md"), 20_000);
	} finally {
		await whisper.close();
	}
});

test("Test connection reports a reachable server", async ({ vault }) => {
	const whisper = await fakeWhisper("x");
	try {
		await configure(vault, whisper.url);
		await vault.page.evaluate(() => (window as any).app.plugins.plugins["gospel-record"].testWhisper());
		await expect(vault.page.locator(".notice", { hasText: "Whisper is reachable (fake)" })).toBeVisible();
	} finally {
		await whisper.close();
	}
});

test.describe("obsidian://gospel-record links (the iPhone Action Button menu)", () => {
	test("mode=new opens the form, with an optional type", async ({ vault }) => {
		vault.openUri("obsidian://gospel-record?mode=new&type=parable");
		await expect(vault.page.locator('.gospel-record-modal .gr-types [data-type="parable"]')).toHaveClass(/is-active/, { timeout: 15_000 });
	});

	test("mode=dashboard opens the dashboard, not the form", async ({ vault }) => {
		vault.write("Gospel/Gospel Dashboard.md", "# Dashboard\n");
		vault.openUri("obsidian://gospel-record?mode=dashboard");
		await expect.poll(() => vault.page.evaluate(() => (window as any).app.workspace.getActiveFile()?.path), { timeout: 15_000 }).toBe("Gospel/Gospel Dashboard.md");
		await expect(vault.page.locator(".gospel-record-modal")).toHaveCount(0);
	});

	test("mode=sacred starts a Sacred entry, not the form", async ({ vault }) => {
		vault.openUri("obsidian://gospel-record?mode=sacred");
		// No Meld in this vault, so the Sacred path explains instead of creating anything.
		await expect(vault.page.locator(".notice", { hasText: "Install and enable the Meld Encrypt plugin first" })).toBeVisible({ timeout: 15_000 });
		await expect(vault.page.locator(".gospel-record-modal")).toHaveCount(0);
	});

	test("mode=file-inbox files the Inbox", async ({ vault }) => {
		vault.openUri("obsidian://gospel-record?mode=file-inbox");
		await expect(vault.page.locator(".notice", { hasText: "Inbox is empty" })).toBeVisible({ timeout: 15_000 });
	});
});
