// Keeps the JS/CSS chunks of previous deploys online for 14 days, so a tab opened before a deploy can
// still load its lazy pages (the host would otherwise answer index.html for a removed chunk).
//   node scripts/keep-old-assets.mjs save      before the build: copy dist/assets into .deploy-assets/
//   node scripts/keep-old-assets.mjs restore   after the build: add the kept chunks missing from dist/assets
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve("dist", "assets");
const cache = resolve(".deploy-assets");
const MAX_AGE_MS = 14 * 86400000;
const mode = process.argv[2];

if (mode === "save") {
  mkdirSync(cache, { recursive: true });
  if (existsSync(dist)) {
    for (const f of readdirSync(dist)) {
      const target = join(cache, f);
      if (!existsSync(target)) copyFileSync(join(dist, f), target);
    }
  }
  const now = Date.now();
  let pruned = 0;
  for (const f of readdirSync(cache)) {
    if (now - statSync(join(cache, f)).mtimeMs > MAX_AGE_MS) {
      rmSync(join(cache, f));
      pruned++;
    }
  }
  console.log(`keep-old-assets: ${readdirSync(cache).length} chunks kept, ${pruned} pruned`);
} else if (mode === "restore") {
  if (!existsSync(cache) || !existsSync(dist)) process.exit(0);
  let added = 0;
  for (const f of readdirSync(cache)) {
    const target = join(dist, f);
    if (existsSync(target)) {
      // Still current: refresh its age so it is kept 14 days after its last deploy.
      const now = new Date();
      utimesSync(join(cache, f), now, now);
      continue;
    }
    copyFileSync(join(cache, f), target);
    added++;
  }
  console.log(`keep-old-assets: ${added} previous chunks added to dist/assets`);
} else {
  console.error("usage: node scripts/keep-old-assets.mjs save|restore");
  process.exit(1);
}
