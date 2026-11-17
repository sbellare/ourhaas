import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { loadConfigFromFile } from "vite";

const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
const original = Object.fromEntries(
  ["PORT", "BASE_PATH", "NODE_ENV"].map((key) => [key, process.env[key]]),
);

// Run configuration tests in Node, not the UI suite's jsdom environment:
// Vite's esbuild loader requires Node's native typed-array/TextEncoder realm.
beforeEach(() => {
  delete process.env.PORT;
  delete process.env.BASE_PATH;
  process.env.NODE_ENV = "production";
});
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function loadConfig(command) {
  return loadConfigFromFile({ command, mode: "production" }, configFile, undefined, "silent");
}

test("homepage artwork is included in the website source assets", async () => {
  const home = await readFile(new URL("../src/pages/home.tsx", import.meta.url), "utf8");
  const imageImport = home.match(/import\s+heroImg\s+from\s+["'](@\/assets\/[^"']+)["']/);
  assert(imageImport, "Homepage artwork must not depend on the workspace upload folder");
  const image = await readFile(new URL(`../src/${imageImport[1].slice(2)}`, import.meta.url));
  assert(image.length > 0, "The homepage artwork file must not be empty");
});

test("static builds need neither PORT nor BASE_PATH", async () => {
  const loaded = await loadConfig("build");
  assert.equal(loaded?.config.base, "/");
  assert.equal(loaded?.config.server?.port, undefined);
});

test("static builds preserve an explicitly configured base path", async () => {
  process.env.BASE_PATH = "/community/";
  const loaded = await loadConfig("build");
  assert.equal(loaded?.config.base, "/community/");
});

test("development still requires a port", async () => {
  await assert.rejects(loadConfig("serve"), /PORT environment variable is required/);
});

test("development preserves its configured port and base path", async () => {
  process.env.PORT = "5273";
  process.env.BASE_PATH = "/community/";
  const loaded = await loadConfig("serve");
  assert.equal(loaded?.config.server?.port, 5273);
  assert.equal(loaded?.config.base, "/community/");
});
