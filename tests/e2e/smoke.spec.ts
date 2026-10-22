import { expect, test } from "./obsidian";

test("plugin loads and indexes the topic pages", async ({ vault }) => {
	const names = await vault.page.evaluate(() => (window as any).app.plugins.plugins["gospel-record"].topicIndex.topics.map((t: any) => t.name).sort());
	expect(names).toEqual(["Faith", "Holy Spirit", "Prayer", "Rest", "Zion"]);
});
