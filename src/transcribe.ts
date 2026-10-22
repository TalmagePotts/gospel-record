// Sending a voice note's recording to the private Whisper server (see services/whisper in the README).
// Obsidian's requestUrl has no FormData support, so the multipart body is built by hand.

const MIME: Record<string, string> = {
	m4a: "audio/mp4",
	mp4: "audio/mp4",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	caf: "audio/x-caf",
	aac: "audio/aac",
	ogg: "audio/ogg",
	webm: "audio/webm",
};

export function audioMimeType(fileName: string): string {
	return MIME[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export type Part = { name: string; value: string } | { name: string; fileName: string; mimeType: string; data: ArrayBuffer };

export function buildMultipart(parts: Part[], boundary = `----gospel-record-${Math.random().toString(16).slice(2)}`): { body: ArrayBuffer; contentType: string } {
	const enc = new TextEncoder();
	const chunks: Uint8Array[] = [];
	for (const part of parts) {
		if ("data" in part) {
			const safeName = part.fileName.replace(/["\r\n]/g, "");
			chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${safeName}"\r\nContent-Type: ${part.mimeType}\r\n\r\n`));
			chunks.push(new Uint8Array(part.data));
		} else {
			chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}`));
		}
		chunks.push(enc.encode("\r\n"));
	}
	chunks.push(enc.encode(`--${boundary}--\r\n`));
	const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of chunks) {
		body.set(c, offset);
		offset += c.length;
	}
	return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** The settings box: one word or phrase per line; blank lines and # comments ignored. */
export function vocabularyLines(text: string): string[] {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));
}
