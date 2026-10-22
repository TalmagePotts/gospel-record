import { App, PluginSettingTab, Setting } from "obsidian";
import { ENTRY_TYPES, type EntryTypeId } from "./entry";
import type GospelRecordPlugin from "./main";

export interface GospelRecordSettings {
	folders: Record<EntryTypeId, string>;
	/** Topic pages live here; new topics are created here. */
	topicsFolder: string;
	/** Optional note copied for new topics (Templater syntax runs if Templater is installed). */
	topicTemplate: string;
	inboxFolder: string;
	audioFolder: string;
	sacredFolder: string;
	dashboardPath: string;
	/** Comma-separated topic names never suggested (too common a word, e.g. "Rest"). */
	ignoreTopics: string;
	/** One per line: `emmalene, emiline => Emmaline`. */
	dictationFixes: string;
	/** Private Whisper server, e.g. http://100.x.y.z:8790. The token is stored per device, not here. */
	whisperUrl: string;
	/** Names and words Whisper should expect, one per line; sent with every recording. */
	whisperVocabulary: string;
	debug: boolean;
}

export const DEFAULT_SETTINGS: GospelRecordSettings = {
	folders: Object.fromEntries(ENTRY_TYPES.map((t) => [t.id, t.folder])) as Record<EntryTypeId, string>,
	topicsFolder: "Gospel/Topics",
	topicTemplate: "",
	inboxFolder: "Gospel/Inbox",
	audioFolder: "Gospel/Audio",
	sacredFolder: "Gospel/Sacred",
	dashboardPath: "Gospel/Gospel Dashboard.md",
	ignoreTopics: "",
	dictationFixes: "",
	whisperUrl: "",
	whisperVocabulary: [
		"Nephi", "Alma", "Helaman", "Moroni", "Mosiah", "Mormon", "Ether", "Jarom", "Omni", "Abinadi", "Ammon", "Lehi",
		"Doctrine and Covenants", "D&C", "Pearl of Great Price", "Abraham", "Moses", "Enoch", "Zion", "Abrahamic covenant",
		"Holy Ghost", "sealings", "endowment", "initiatory", "temple", "tender mercy", "Come Follow Me",
	].join("\n"),
	debug: false,
};

// Device-local, not synced: only one device should file the Inbox, or iCloud makes conflict copies.
export const AUTO_FILE_KEY = "gospel-record-auto-file-inbox";
// Device-local so the token never lands in synced settings or the vault's git history.
export const WHISPER_TOKEN_KEY = "gospel-record-whisper-token";

export class GospelRecordSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: GospelRecordPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = async () => this.plugin.saveSettings();
		const text = (name: string, desc: string, get: () => string, set: (v: string) => void, placeholder = "") =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((t) =>
					t
						.setPlaceholder(placeholder)
						.setValue(get())
						.onChange(async (v) => {
							set(v.trim());
							await save();
						}),
				);

		new Setting(containerEl).setName("Folders").setHeading();
		for (const type of ENTRY_TYPES) {
			text(type.label, `Where ${type.label.toLowerCase()} notes are saved.`, () => s.folders[type.id], (v) => (s.folders[type.id] = v || type.folder), type.folder);
		}
		text("Topics folder", "Your topic pages. Topic suggestions come from their names and aliases.", () => s.topicsFolder, (v) => (s.topicsFolder = v), DEFAULT_SETTINGS.topicsFolder);
		text("New topic template", "Optional note used when you create a topic from the form.", () => s.topicTemplate, (v) => (s.topicTemplate = v), "Templates/Topic.md");
		text("Inbox folder", "Where the iPhone Shortcut saves notes for filing.", () => s.inboxFolder, (v) => (s.inboxFolder = v), DEFAULT_SETTINGS.inboxFolder);
		text("Audio folder", "Where voice recordings are kept.", () => s.audioFolder, (v) => (s.audioFolder = v), DEFAULT_SETTINGS.audioFolder);
		text("Sacred folder", "Encrypted notes (needs the Meld Encrypt plugin).", () => s.sacredFolder, (v) => (s.sacredFolder = v), DEFAULT_SETTINGS.sacredFolder);
		text("Dashboard", "Created by “Set up this vault”.", () => s.dashboardPath, (v) => (s.dashboardPath = v), DEFAULT_SETTINGS.dashboardPath);

		new Setting(containerEl).setName("Suggestions and dictation").setHeading();
		text("Never suggest these topics", "Comma-separated, for topics that are also everyday words (e.g. Rest, Rock).", () => s.ignoreTopics, (v) => (s.ignoreTopics = v));
		new Setting(containerEl)
			.setName("Dictation fixes")
			.setDesc("Words dictation gets wrong, one fix per line: emmalene, emiline => Emmaline")
			.addTextArea((t) => {
				t.inputEl.rows = 6;
				t.inputEl.style.width = "100%";
				t.setValue(s.dictationFixes).onChange(async (v) => {
					s.dictationFixes = v;
					await save();
				});
			});

		new Setting(containerEl).setName("Voice notes").setHeading();
		text("Whisper server", "Transcribes voice notes from the iPhone Shortcut. Leave empty if you don't use one.", () => s.whisperUrl, (v) => (s.whisperUrl = v.replace(/\/+$/, "")), "http://100.x.y.z:8790");
		new Setting(containerEl)
			.setName("Whisper token (this device)")
			.setDesc("Stored only on this device. Enter it once on each device.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(String(this.plugin.loadLocal(WHISPER_TOKEN_KEY) ?? "")).onChange((v) => this.plugin.saveLocal(WHISPER_TOKEN_KEY, v.trim()));
			})
			.addButton((b) =>
				b.setButtonText("Test connection").onClick(async () => {
					b.setDisabled(true);
					await this.plugin.testWhisper();
					b.setDisabled(false);
				}),
			);

		new Setting(containerEl)
			.setName("Whisper vocabulary")
			.setDesc("Names and words Whisper should expect, one per line (family names, places, scripture names it mishears). Keep it short: Whisper only reads about the last 200 words.")
			.addTextArea((t) => {
				t.inputEl.rows = 10;
				t.inputEl.style.width = "100%";
				t.setValue(s.whisperVocabulary).onChange(async (v) => {
					s.whisperVocabulary = v;
					await save();
				});
			});

		new Setting(containerEl).setName("This device").setHeading();
		new Setting(containerEl)
			.setName("File Inbox notes automatically")
			.setDesc("Turn this on for one device only (usually your Mac). On other devices, use “File Inbox now” on the dashboard.")
			.addToggle((t) =>
				t.setValue(this.plugin.autoFileInbox).onChange((v) => {
					this.plugin.setAutoFileInbox(v);
				}),
			);
		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Log state changes to the developer console.")
			.addToggle((t) =>
				t.setValue(s.debug).onChange(async (v) => {
					s.debug = v;
					await save();
				}),
			);
	}
}
