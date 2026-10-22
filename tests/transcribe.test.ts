import { describe, expect, it } from "vitest";
import { audioMimeType, buildMultipart, vocabularyLines } from "../src/transcribe";

describe("buildMultipart", () => {
	it("encodes one file field the way the Whisper server's form parser expects", () => {
		const bytes = new Uint8Array([0, 1, 2, 255]);
		const { body, contentType } = buildMultipart([{ name: "file", fileName: "note 1.m4a", mimeType: "audio/mp4", data: bytes.buffer }], "BOUNDARY");
		expect(contentType).toBe("multipart/form-data; boundary=BOUNDARY");
		const raw = new Uint8Array(body);
		const head = new TextDecoder().decode(raw.slice(0, raw.length - bytes.length - "\r\n--BOUNDARY--\r\n".length));
		expect(head).toBe('--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="note 1.m4a"\r\nContent-Type: audio/mp4\r\n\r\n');
		expect([...raw.slice(head.length, head.length + 4)]).toEqual([0, 1, 2, 255]);
		expect(new TextDecoder().decode(raw.slice(head.length + 4))).toBe("\r\n--BOUNDARY--\r\n");
	});

	it("strips quotes and line breaks from the file name so the header stays valid", () => {
		const { body } = buildMultipart([{ name: "file", fileName: 'a"b\r\nc.m4a', mimeType: "audio/mp4", data: new ArrayBuffer(0) }], "B");
		expect(new TextDecoder().decode(body)).toContain('filename="abc.m4a"');
	});
});

describe("buildMultipart with a text field", () => {
	it("sends the vocabulary as a plain form field after the file", () => {
		const { body } = buildMultipart(
			[
				{ name: "file", fileName: "a.m4a", mimeType: "audio/mp4", data: new TextEncoder().encode("AUDIO").buffer },
				{ name: "vocabulary", value: "Nephi\nAlma" },
			],
			"B",
		);
		expect(new TextDecoder().decode(body)).toBe(
			'--B\r\nContent-Disposition: form-data; name="file"; filename="a.m4a"\r\nContent-Type: audio/mp4\r\n\r\nAUDIO\r\n' +
				'--B\r\nContent-Disposition: form-data; name="vocabulary"\r\n\r\nNephi\nAlma\r\n' +
				"--B--\r\n",
		);
	});
});

describe("vocabularyLines", () => {
	it("keeps one word or phrase per line, dropping blanks and # comments", () => {
		expect(vocabularyLines("Nephi\n\n  Holy Ghost  \n# names\nEmmaline\n")).toEqual(["Nephi", "Holy Ghost", "Emmaline"]);
	});
});

describe("audioMimeType", () => {
	it.each([
		["x.m4a", "audio/mp4"],
		["x.MP3", "audio/mpeg"],
		["x.wav", "audio/wav"],
		["x.caf", "audio/x-caf"],
		["x.unknown", "application/octet-stream"],
	])("%s -> %s", (name, type) => expect(audioMimeType(name)).toBe(type));
});
