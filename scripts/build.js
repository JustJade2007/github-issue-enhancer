import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const distDir = path.resolve("dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log("[Build] Bundling github-issue-enhancer with esbuild...");

try {
  await esbuild.build({
    entryPoints: ["src/index.js"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: "dist/index.mjs",
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);"
    },
    sourcemap: false
  });

  console.log("[Build] Build complete: dist/index.mjs created successfully.");
} catch (error) {
  console.error("[Build] Build failed:", error);
  process.exit(1);
}
