# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Duplicate Detection & Auto-Closure:**
  - Evaluates new issues against existing candidate issues (both open and recently closed).
  - Prompts Gemini with strict criteria: only specify `===DUPLICATE_OF===` if definitively certain an issue duplicates an existing one.
  - Automatically applies the `duplicate` label to confirmed duplicate issues.
  - Posts a notification comment linking directly to the existing issue (`Duplicate of #<number>`).
  - Closes duplicate issues automatically with `state: "closed"` and `state_reason: "not_planned"`.
  - Bypasses redundant downstream automation (development branch creation, milestone assignment, and project assignment) when an issue is closed as a duplicate.
  - Configurable via `close-duplicates` workflow input / `CLOSE_DUPLICATES` env / `--no-close-duplicates` CLI flag.

## [0.5.0] - 2026-09-29

### Added
- **Automated AI Triage & Dynamic Labeling:** Dynamically fetches existing repository labels and prompts Gemini to select appropriate labels based on issue content and scope, merging them with any configured static labels.
- **GitHub Projects v2 Organization:** Seamlessly assigns new issues to a configured GitHub Project v2 via GraphQL and GitHub CLI fallback (`gh project item-add`), automatically classifying and setting custom single-select or text fields for **Priority** (P0-P3, Urgent/High/Medium/Low) and **Size** (XS, S, M, L, XL).
- **Project Token Diagnostics:** Automatically detects and diagnoses token types (`ghs_` default Actions runner token, `github_pat_` fine-grained PAT, and `ghp_` classic PAT), providing clear actionable guidance on GitHub's API requirements for User-owned Projects v2.
- **Conditional User Assignment:** When `auto-assign: true` or `assignees` is specified, automatically assigns the repository owner or designated developers. Supports custom keyword and label assignment rules defined in `.github/issue-enhancer.json`.
- **Milestone Association:** Associates issues with an explicit milestone or allows Gemini to automatically select the most relevant open repository milestone when set to `auto`.
- **Development Branch Creation & Linking:** When `create-branch: true` is configured, automatically creates a dedicated development branch (`issue-{number}-{kebab-title}`) from the repository's default branch and associates it with the issue via GraphQL `createLinkedBranch`.
- **Resilient Error Handling:** Gracefully warns and continues with issue body formatting and labeling if any third-party management step (project permissions, branch protection, or milestone) encounters an error.

## [0.4.0] - 2026-09-29

### Added
- **Issue Thoroughness Detection:** Automated evaluation determines if a newly opened issue is already thorough and well-explained (more than 2 well-written descriptive paragraphs or equivalent clear structure). When thorough, the action leaves the author's title and body intact and only posts contributor fix instructions (if enabled).
- **On-Demand `/enhance` Comment Command:** Added support for triggering enhancement on existing, previously created, or edited issues via `/enhance` comment.
- **Permission Protection:** Restricted `/enhance` command execution to authorized roles (issue author, repository collaborators, and owners/maintainers).
- **Emoji Command Reactions:** Acknowledges `/enhance` comments with interactive emoji reactions (adds `eyes` 👀 when execution starts, and `rocket` 🚀 when complete).
- **Safe Re-Enhancement Extraction:** Safely extracts the original raw text from existing `<details>` blocks or stripped markdown when re-enhancing already-enhanced issues, preventing recursive badges and marker duplication.
- **Workflow Triggers:** Added `issue_comment: types: [created]` to `.github/workflows/enhance-issue.yml` and `.github/workflow-templates/enhance-issue.yml`.

## [0.3.0] - 2026-09-29

### Added
- **Contributor Fix Instructions in Comments:** When an issue is opened, Gemini now generates brief, practical instructions/guidance for anyone looking to fix or resolve the issue, and posts it as a comment.
- **Applicability Filter:** Fix instructions are only generated and posted if applicable to the issue (e.g. actionable bugs, defects, features). If the issue is a question, discussion, non-actionable, or lacks sufficient context, no comment is posted.
- **Single-Call Gemini Prompting:** Issue rewording and contributor fix instructions are generated in a unified API call with structured delimiters (`===ENHANCED_BODY===`, `===FIX_INSTRUCTIONS===`), minimizing token and API consumption.

## [0.2.1] - 2026-09-27

### Changed
- **Updated Baseline Model:** Set `gemini-3.1-flash-lite` as the standard default model across workflow definitions, templates, configuration defaults, action metadata, and environment templates.
- **Removed Deprecated Legacy Models:** Removed fallback references to models older than `gemini-3.1-flash-lite` (dropping obsolete `gemini-2.5-flash-lite`, `gemini-2.0-flash-lite`, and `gemini-1.5-flash`), establishing `gemini-3.1-flash-lite` as the current minimum/oldest supported model.

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