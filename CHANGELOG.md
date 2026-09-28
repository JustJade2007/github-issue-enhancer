# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-09-27

### Fixed
- Fixed workflow failure where `actions/setup-node@v4` threw `Error: Dependencies lock file is not found` on repositories without `package-lock.json` (such as `AVA-School-Assistant-2`).
- Replaced manual checkout, node caching, and `npm ci` steps in `.github/workflows/enhance-issue.yml` with direct invocation of reusable action `JustJade2007/github-issue-enhancer@main`.
- Ensured GitHub Action workflow runs completely out of the box with zero external dependencies, lockfiles, or files needed in consumer repositories.
- Updated `run.bat` to launch bundled `dist/index.mjs` directly if present, eliminating node_modules installation prerequisite for quick execution.

### Changed
- Streamlined documentation in `README.md` to demonstrate single out-of-the-box workflow integration without requiring file copying.
- Rebuilt distribution bundle `dist/index.mjs`.

## [0.1.0] - 2026-09-26

### Added
- Initial release of GitHub Issue Enhancer using Gemini Flash Lite.
- GitHub Actions workflow (`.github/workflows/enhance-issue.yml`) triggered automatically when new issues are opened (`issues: [opened]`).
- Composite GitHub Action metadata (`action.yml`) allowing direct multi-repo usage via `uses: <owner>/github-issue-enhancer@main`.
- Added GitHub Action marketplace branding in `action.yml` with `icon: alert-circle` and `color: blue`.
- Optimized `action.yml` description to comply with GitHub Marketplace limit (<= 125 characters).
- Cleaned character encoding in `action.yml` to remove UTF-8 BOM preventing Marketplace parser detection.
- Pre-bundled standalone distribution (`dist/index.mjs`) for zero-dependency execution across any repository.
- Gemini integration (`src/gemini.js`) enforcing strict constraints to reword and expand issues for clarity and GitHub formatting without adding new assumptions or content.
- Automatic model fallback sequence prioritizing `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, and `gemini-2.0-flash-lite`.
- Issue updating and commenting (`src/github.js`) to replace the issue description with structured markdown and attach an informational comment referencing the update.
- Preserved original issue content in a collapsible section in the issue description.
- Loop prevention check using hidden metadata markers (`<!-- gemini-enhanced -->`).
- Command-line and interactive local testing runner (`src/index.js` and `run.bat`).
- Build script (`scripts/build.js`) bundling output to `dist/index.mjs`.
- Security policy documentation (`SECURITY.md`).