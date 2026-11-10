import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev only: the "Modèles" view of Carrousels reads Carousel Factory's files in place (no copy into Solis or Convex):
 * content/models/*.json (the replica models), data/favoris/<handle>/ (the original favourites) and
 * data/sandboxes/models/out/<model>/jpg/ (the renders). Never part of the build.
 */
function carouselModels(): Plugin {
  const root = resolve(process.env.CF_FACTORY_DIR ?? join(homedir(), "app", "carousel-factory"));
  const dirs = {
    models: join(root, "content", "models"),
    orig: join(root, "data", "favoris"),
    copy: join(root, "data", "sandboxes", "models", "out"),
  };
  const jpgs = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort() : []);
  const readJson = (file: string) => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };

  const index = () => {
    const report = readJson(join(root, "data", "sandboxes", "models", "report.json")) ?? {};
    const files = existsSync(dirs.models) ? readdirSync(dirs.models).filter((f) => f.endsWith(".json")).sort() : [];
    const models = files.map((f) => {
      const m = readJson(join(dirs.models, f)) ?? {};
      const handle = String(m.reference ?? "").replace(/^@/, "");
      const qa = readJson(join(dirs.copy, m.model_id, "qa.json"));
      return {
        id: m.model_id,
        name: m.model_name,
        reference: m.reference,
        structure: m.structure,
        aspect: m.aspect,
        hook: m.hook_options?.[0] ?? "",
        roles: (m.slides ?? []).map((s: { role: string }) => s.role),
        original: jpgs(join(dirs.orig, handle)).map((x) => `/__cf-models/orig/${handle}/${x}`),
        copy: jpgs(join(dirs.copy, m.model_id, "jpg")).map((x) => `/__cf-models/copy/${m.model_id}/jpg/${x}`),
        qa: report[m.model_id] ?? (qa ? { status: qa.status } : null),
      };
    });
    const favourites = readJson(join(dirs.orig, "index.json")) ?? [];
    return { root, models, favourites: favourites.length };
  };

  return {
    name: "carousel-models",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__cf-models", (req, res, next) => {
        const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
        if (url === "/index.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(index()));
          return;
        }
        const m = url.match(/^\/(orig|copy)\/(.+)$/);
        if (!m) return next();
        const base = dirs[m[1] as "orig" | "copy"];
        const file = resolve(base, m[2]);
        if (!file.startsWith(base + sep) || !/\.jpe?g$/i.test(file) || !existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), carouselModels()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
    },
  },
  server: { port: 5199, strictPort: true },
});
