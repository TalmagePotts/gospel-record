# Gospel Record

An Obsidian plugin for recording spiritual insights, modern parables and special
experiences quickly, and finding them again by topic and scripture.

- **Four kinds of entry**, each in its own folder: Scripture Insights, Thoughtful
  Insights, Modern Parables, Special Experiences (with a kind: miracle, tender
  mercy, answered prayer, prompting, temple, revelation).
- **A capture form** (`Mod+Shift+E` if you set the hotkey; a feather icon in the ribbon;
  `obsidian://gospel-record?mode=new` from an iPhone Shortcut; also `mode=sacred`, `mode=dashboard`, `mode=file-inbox`). Topics are suggested from
  your topic pages' names and aliases as you write; scripture references are recognised in
  any common form (`first nephi 3 7`, `D&C 121:41`, `Moro 10:4-5`) and saved in standard form.
  No AI is involved; suggestions are plain word matching on your device.
- **Topic pages fill themselves in**: a `My Record` section lists every entry linked to the topic.
- **A dashboard**: Inbox, recent entries, entries needing topics (tap a suggestion to add it),
  topics you write about most, and a scripture index in canonical order with Gospel Library links.
- **Voice notes**: an iPhone Shortcut records audio into the Inbox; the plugin sends it to a
  private Whisper server, cleans up dictation ("Allah 32 verse 21" → Alma 32:21), detects a
  spoken type ("Tender mercy. …") and files it.
- **Sacred entries**: `New Sacred entry` creates a note that is encrypted from the first
  keystroke, using the Meld Encrypt plugin. Nothing is created if Meld is missing or the
  password prompt is cancelled. Sacred notes never appear in topic pages or the dashboard.

## Install

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Community
   plugins, then in BRAT choose **Add beta plugin** and paste this repository's URL.
   (Or copy `main.js`, `manifest.json` and `styles.css` into
   `<vault>/.obsidian/plugins/gospel-record/`.)
2. Enable **Gospel Record** in Community plugins. For Sacred entries also install and enable
   **Meld Encrypt**.
3. Open **Settings → Gospel Record** and set your folders, especially **Topics folder** (where
   your topic pages are). Everything has a sensible default under `Gospel/`.
4. Run the command **Gospel Record: Set up this vault**. It creates the folders and the
   dashboard, and asks before adding `My Record` to your topic pages.

## Settings worth knowing

- **Never suggest these topics**: topics that are also everyday words (Rest, Rock, Work).
- **Dictation fixes**: names dictation gets wrong, one per line: `emmalene, emiline => Emmaline`.
- **Whisper server / token**: only for voice notes. The token is stored per device.
- **File Inbox notes automatically**: turn on for one device only: a computer that is often
  open, or the phone if that's the only device. Notes are filed when they arrive and whenever
  Obsidian opens. Two devices filing the same iCloud Inbox would create conflict copies.

## Voice notes (optional)

Needs a Whisper server you run yourself on an always-on computer; see
[`services/whisper`](services/whisper/README.md). The iPhone Shortcut:

1. **Record Audio** (or Dictate Text), then **Save File** to the vault's `Gospel/Inbox` folder in
   Files → iCloud Drive → Obsidian → *your vault* (turn off "Ask Where to Save").
2. Optionally **Open URLs** `obsidian://gospel-record?mode=file-inbox` so it's filed right away.

The plugin transcribes the recording, applies dictation fixes, picks the type from a spoken
prefix ("Tender mercy. …") and files it. Never record Sacred entries this way.

## Development

```sh
npm install
npm test                       # unit tests (Vitest)
npm run build                  # type-check and build main.js
xvfb-run -a npm run test:e2e   # end-to-end tests in the real Obsidian app
```

The end-to-end tests launch Obsidian (extracted AppImage at
`~/.cache/obsidian-e2e/squashfs-root/obsidian`, or set `OBSIDIAN_BIN`) on a throwaway copy of
`tests/e2e/fixture-vault` and drive it with Playwright over the DevTools protocol.
`tests/e2e/vendor/meld-encrypt` is Meld Encrypt 2.4.5 (MIT), used only by the Sacred tests.
