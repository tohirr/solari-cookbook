/**
 * The studio is built from studio/app into studio/ itself, so the committed
 * studio/index.html plus studio/assets/ is what GitHub Pages serves at
 * /passk/studio/. It imports the report theme and the metrics straight from
 * the engine's src/, so the numbers and the look are the report's own.
 */
import { defineConfig } from "vite";
import path from "node:path";

const here = import.meta.dirname;
const root = path.resolve(here, "app");

export default defineConfig({
  root,
  base: "./",
  publicDir: false, // data.json is written straight into studio/ by scripts/studio-data.ts
  build: {
    outDir: path.resolve(here), emptyOutDir: false, sourcemap: false,
    // Fixed file names, so a rebuild overwrites instead of piling up hashed bundles in a committed folder.
    rollupOptions: { output: { entryFileNames: "assets/studio.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } },
  },
  server: { fs: { allow: [path.resolve(here, "..")] } },
});
