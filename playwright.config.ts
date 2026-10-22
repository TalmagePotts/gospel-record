import { defineConfig } from "@playwright/test";

// Drives the real Obsidian app; one instance at a time. Run headless with: xvfb-run -a npm run test:e2e
export default defineConfig({
	testDir: "tests/e2e",
	workers: 1,
	timeout: 60_000,
	reporter: [["list"]],
	use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
