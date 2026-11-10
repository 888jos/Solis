// Copies the carousel models from Carousel Factory into public/cf-models/ so the deployed site can show them
// (the dev server reads them in place instead, see vite.config.ts). public/cf-models/ is git-ignored.
// Images are downsized to 720 px wide JPEGs (macOS `sips`). Run before `npm run deploy`:
//   node scripts/export-models.mjs            (CF_FACTORY_DIR overrides ~/app/carousel-factory)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.env.CF_FACTORY_DIR ?? join(homedir(), "app", "carousel-factory"));
const out = resolve("public", "cf-models");
const dirs = { models: join(root, "content", "models"), orig: join(root, "data", "favoris"), copy: join(root, "data", "sandboxes", "models", "out") };
const jpgs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort() : []);
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const shrink = (src, dest) => {
  mkdirSync(join(dest, ".."), { recursive: true });
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", "720", src, "--out", dest], { stdio: "ignore" });
};

const report = readJson(join(root, "data", "sandboxes", "models", "report.json")) ?? {};
const models = [];
let n = 0;
for (const f of readdirSync(dirs.models).filter((x) => x.endsWith(".json")).sort()) {
  const m = readJson(join(dirs.models, f));
  if (!m) continue;
  const handle = String(m.reference ?? "").replace(/^@/, "");
  const original = jpgs(join(dirs.orig, handle)).map((x) => {
    shrink(join(dirs.orig, handle, x), join(out, "orig", handle, x));
    n++;
    return `/cf-models/orig/${handle}/${x}`;
  });
  const copy = jpgs(join(dirs.copy, m.model_id, "jpg")).map((x) => {
    shrink(join(dirs.copy, m.model_id, "jpg", x), join(out, "copy", m.model_id, x));
    n++;
    return `/cf-models/copy/${m.model_id}/${x}`;
  });
  const qa = readJson(join(dirs.copy, m.model_id, "qa.json"));
  models.push({
    id: m.model_id,
    name: m.model_name,
    reference: m.reference,
    structure: m.structure,
    aspect: m.aspect,
    hook: m.hook_options?.[0] ?? "",
    roles: (m.slides ?? []).map((s) => s.role),
    original,
    copy,
    qa: report[m.model_id] ?? (qa ? { status: qa.status } : null),
  });
}
writeFileSync(join(out, "index.json"), JSON.stringify({ root: "copie en ligne", exportedAt: new Date().toISOString(), models, favourites: models.length }));
console.log(`${models.length} models, ${n} images -> ${out}`);
