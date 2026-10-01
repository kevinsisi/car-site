import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

test("Wrangler serves the Astro Cloudflare build directory as assets", () => {
  const config = readFileSync(resolve(root, "wrangler.toml"), "utf8");
  const assetsIgnore = readFileSync(resolve(root, "public/.assetsignore"), "utf8")
    .trim()
    .split(/\r?\n/);

  assert.equal(existsSync(resolve(root, "dist/_worker.js/index.js")), true);
  assert.equal(existsSync(resolve(root, "dist/_astro")), true);
  assert.match(config, /^main\s*=\s*"(?:\.\/)?dist\/_worker\.js\/index\.js"$/m);

  const assetDirectories = [...config.matchAll(/^directory\s*=\s*"([^"]+)"$/gm)]
    .map(([, directory]) => directory);
  assert.deepEqual(assetDirectories, ["./dist", "./dist"]);
  assert.deepEqual(assetsIgnore, ["_worker.js", "_routes.json"]);
});
