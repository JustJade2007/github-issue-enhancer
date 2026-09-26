# Changelog

All notable changes to this project will be documented in this file.

## [2026-09-26]

### Added
- Initial release of GitHub Issue Enhancer using Gemini Flash Lite.
- GitHub Actions workflow (`.github/workflows/enhance-issue.yml`) triggered automatically when new issues are opened (`issues: [opened]`).
- Gemini integration (`src/gemini.js`) enforcing strict constraints to reword and expand issues for clarity and GitHub formatting without adding new assumptions or content.
- Automatic model fallback sequence prioritizing `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, and `gemini-2.0-flash-lite`.
- Issue updating and commenting (`src/github.js`) to replace the issue description with structured markdown and attach an informational comment referencing the update.
- Preserved original issue content in a collapsible section in the issue description.
- Loop prevention check using hidden metadata markers (`<!-- gemini-enhanced -->`).
- Command-line and interactive local testing runner (`src/index.js` and `run.bat`).
- Build script (`scripts/build.js`) bundling output to `dist/index.mjs`.
- Security policy documentation (`SECURITY.md`).
