# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-09-27

### Added
- **Centralized Workflow Settings Section:** Implemented a unified, clearly defined settings block in `.github/workflows/enhance-issue.yml` and `.github/workflow-templates/enhance-issue.yml` for managing all workflow behaviors and optional features.
- **Configurable Feature Toggles:**
  - `post-comment`: Toggle posting the automated informational summary comment on the issue (`true`/`false`, default `true`).
  - `preserve-original`: Toggle appending the original raw submission inside an expandable `<details>` section (`true`/`false`, default `true`).
  - `add-badge`: Toggle prepending the `> [!NOTE]` header callout badge to the formatted issue description (`true`/`false`, default `true`).
  - `enhance-title`: Toggle rewording and clarifying the issue title in addition to the issue body (`true`/`false`, default `false`).
- **Issue Filtering & Automation Settings:**
  - `add-labels`: Automatically apply specified comma-separated labels (e.g. `enhanced`) when an issue is enhanced.
  - `ignore-authors`: Skip issues opened by designated bot or user accounts (e.g. `dependabot[bot],renovate[bot]`).
  - `ignore-labels`: Skip enhancement if the issue already contains specified labels (e.g. `no-enhance`).
- **Model & Generation Customization:**
  - `temperature`: Configurable sampling temperature (0.0 - 1.0, default `0.2`) for high-precision output.
  - `custom-instruction`: Inject repository-specific formatting instructions or domain guidelines into Gemini's system instructions.
- **Centralized Configuration Loader (`src/config.js`):** Unified configuration parser supporting action inputs, environment variables, CLI parameters, and optional repository configuration file (`.github/issue-enhancer.json`).
- Updated `action.yml` with the complete inputs schema and mapped environment variables.
- Updated `run.bat`, `.env.example`, and CLI runner with new configuration options and flags.

## [0.1.2] - 2026-09-27

### Added
- Added official GitHub Actions starter workflow template `.github/workflow-templates/enhance-issue.yml` and metadata manifest `.github/workflow-templates/enhance-issue.properties.json` for GitHub Marketplace and repository starter workflow discovery.

### Fixed
- Fixed empty `.yml` file issue when adding through the marketplace: provided complete workflow template and clear guidance resolving the GitHub web editor limitation where adding an action from the Marketplace sidebar generates a `blank.yml` containing only an isolated step snippet without mandatory job triggers or permissions.

### Changed
- Documented Marketplace integration walkthrough and `blank.yml` resolution in `README.md`.
- Updated `.gitignore` with `.antigravity/` and `*.local` ignore rules.
- Bumped package version to `0.1.2`.

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