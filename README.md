# GitHub Issue Enhancer

An automated GitHub workflow and CLI utility powered by Google Gemini Flash Lite that rewords, clarifies, and formats new repository issues into clean, professional GitHub issue markdown **without adding new content, assumptions, or hallucinations**.

## Features

- **Strict Content Fidelity:** Reorganizes messy or shorthand descriptions into clean GitHub Flavored Markdown (Summary, Details, Context, Logs) while strictly preserving original technical boundaries and without inventing steps or solutions.
- **Issue Thoroughness Detection:** Automatically evaluates new issues upon creation. If an issue is already thorough and well-explained (more than 2 well-written descriptive paragraphs or equivalent clear structure), the action preserves the author's original title and body, only posting contributor fix instructions as a comment if applicable.
- **On-Demand `/enhance` Comment Command:** Work on existing or edited issues at any time! Commenting `/enhance` on any issue triggers enhancement, automatically acknowledges with emoji reactions (👀 while running, 🚀 when done), and safely re-formats previously enhanced issues.
- **Authorized Permissions:** `/enhance` is restricted to authorized contributors: the original issue author, repository collaborators, and owners/maintainers.
- **Centralized Workflow Settings:** Fully customizable workflow settings section to easily toggle or populate optional features (comments, badges, original text dropdown, title enhancement, labels, bot ignore lists, and temperature).
- **Automated Workflow:** Triggers immediately whenever an issue is opened (`issues: [opened]`) or when `/enhance` is commented (`issue_comment: [created]`).
- **Two-Fold Enhancement:**
  1. Updates the issue body with structured markdown while preserving the raw text in an expandable `<details>` section for transparency.
  2. Posts a comment with brief, practical instructions for contributors wanting to fix the issue (only posted if applicable; otherwise no comment is left).
- **Multi-Repo Reusable Action:** Packaged as a standard GitHub Action (`action.yml`) so any repository on GitHub can consume it with a self-contained workflow file.
- **Zero-Dependency Runner:** Pre-bundled with `dist/index.mjs` so downstream repos do not need to run `npm install`, provide a `package-lock.json`, or contain Node.js code.
- **Loop & Duplicate Protection:** Uses metadata markers (`<!-- gemini-enhanced -->`) to avoid repeated formatting or execution loops.
- **Model Support & Fallback:** Powered by `gemini-3.1-flash-lite` (the baseline model) with automatic fallback handling.
- **Local Testing:** Test directly on your local machine using interactive prompts or CLI flags via `run.bat` or `node src/index.js`.

---

## How to Use in Any Repository

To use GitHub Issue Enhancer in any repository (Python, Go, Rust, Java, Web, or issues-only repos), **no additional files or dependencies are needed in your repository**.

### Step 1: Create the Workflow File

In your target repository, create `.github/workflows/enhance-issue.yml`:

```yaml
name: Enhance GitHub Issue

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]

permissions:
  issues: write
  contents: read

jobs:
  enhance-issue:
    name: Reword and Format Issue
    runs-on: ubuntu-latest
    steps:
      - name: Enhance Issue with Gemini Flash Lite
        uses: JustJade2007/github-issue-enhancer@main
        with:
          # =========================================================================
          # Centralized Workflow Settings
          # =========================================================================

          # --- Required Authentication ---
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

          # --- Model & Generation Settings ---
          # Specify Gemini model (default: gemini-3.1-flash-lite)
          gemini-model: 'gemini-3.1-flash-lite'
          # Sampling temperature (0.0 to 1.0, lower = higher fidelity, default: 0.2)
          temperature: '0.2'
          # Optional custom guidelines or domain-specific formatting rules
          custom-instruction: ''

          # --- Feature Toggles ---
          # Post brief contributor instructions on how to fix the issue (only posted if applicable)
          post-comment: 'true'
          # Include original issue submission in an expandable <details> section
          preserve-original: 'true'
          # Prepend [!NOTE] header badge in the enhanced issue description
          add-badge: 'true'
          # Clarify and reword issue title in addition to body (default: false)
          enhance-title: 'false'

          # --- Automation & Filtering ---
          # Comma-separated labels to automatically apply to enhanced issues (e.g. 'enhanced')
          add-labels: ''
          # Comma-separated list of authors/bots to ignore (e.g. 'dependabot[bot],renovate[bot]')
          ignore-authors: 'dependabot[bot],renovate[bot]'
          # Comma-separated list of labels that skip enhancement if already present
          ignore-labels: 'no-enhance'
```

### Step 2: Add Secret to the Target Repository
1. Go to your repository's **Settings > Secrets and variables > Actions > New repository secret**.
2. Name: `GEMINI_API_KEY`
3. Value: Your Google Gemini API key.

That's all! The action executes self-contained via its pre-bundled distribution and requires no `package.json`, `package-lock.json`, or code checkout in the target repository.

### Marketplace Integration & `blank.yml`
When adding this action via GitHub Actions Marketplace or clicking **"Set up a workflow yourself"**, GitHub creates an empty file named `blank.yml` and opens the Marketplace sidebar. 

> [!NOTE]
> The GitHub Marketplace sidebar displays only a single step snippet (`- name: ... uses: ...`). A step snippet by itself cannot run without the surrounding workflow triggers (`on: issues`), permissions (`issues: write`), and job declaration. 

To resolve this, replace the entire content of `blank.yml` (or rename it to `.github/workflows/enhance-issue.yml`) with the complete workflow code shown in **Step 1** above. Alternatively, you can use the ready-made workflow template located at `.github/workflow-templates/enhance-issue.yml`.

---

## Centralized Workflow Settings Reference

The table below outlines all available settings under `with:`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gemini-api-key` | string | **(Required)** | Google Gemini API Key. |
| `github-token` | string | `${{ github.token }}` | GitHub token with `issues: write` permission. |
| `gemini-model` | string | `'gemini-3.1-flash-lite'` | Gemini model identifier to invoke (baseline oldest supported is `gemini-3.1-flash-lite`). |
| `temperature` | number / string | `'0.2'` | Sampling temperature (between 0.0 and 1.0). Lower values enforce strict adherence. |
| `custom-instruction` | string | `''` | Optional extra formatting guidelines or project rules for Gemini. |
| `post-comment` | boolean / string | `'true'` | Toggles posting contributor fix instructions as a comment (only posted if applicable). |
| `preserve-original` | boolean / string | `'true'` | Toggles appending the original raw issue submission in an expandable `<details>` dropdown. |
| `add-badge` | boolean / string | `'true'` | Toggles prepending the `> [!NOTE]` header banner at the top of the issue. |
| `enhance-title` | boolean / string | `'false'` | Toggles rewording and clarifying the issue title in addition to the issue body. |
| `add-labels` | string | `''` | Comma-separated list of labels to automatically attach to formatted issues (e.g. `enhanced, triage`). |
| `ignore-authors` | string | `''` | Comma-separated list of authors or bot usernames whose issues will not be enhanced (e.g. `dependabot[bot],renovate[bot]`). |
| `ignore-labels` | string | `''` | Comma-separated list of labels that skip enhancement if present on the issue (e.g. `no-enhance, manual`). |

### Optional Repository Configuration File

In addition to workflow `with:` inputs, settings can also be defined in a `.github/issue-enhancer.json` file in your repository:

```json
{
  "geminiModel": "gemini-3.1-flash-lite",
  "temperature": 0.2,
  "postComment": true,
  "preserveOriginal": true,
  "addBadge": true,
  "enhanceTitle": false,
  "addLabels": ["enhanced"],
  "ignoreAuthors": ["dependabot[bot]", "renovate[bot]"],
  "ignoreLabels": ["no-enhance"]
}
```

*Note: Workflow inputs specified in `with:` take precedence over repository config files.*

---

## Repository Structure

```
github-issue-enhancer/
├── .github/
│   ├── workflow-templates/
│   │   ├── enhance-issue.yml          # GitHub Actions starter workflow template
│   │   └── enhance-issue.properties.json # Marketplace template metadata
│   └── workflows/
│       └── enhance-issue.yml          # Out-of-the-box issue trigger workflow with settings
├── action.yml                         # Reusable GitHub Action definition & inputs schema
├── dist/
│   └── index.mjs                      # Standalone bundled executable (zero dependencies)
├── scripts/
│   └── build.js                       # Build & bundling script using esbuild
├── src/
│   ├── config.js                      # Centralized configuration loader & parser
│   ├── gemini.js                      # Gemini API client & strict prompt constraints
│   ├── github.js                      # Octokit issue updater, labeler & comment poster
│   └── index.js                       # Main runner (GitHub Action + CLI)
├── CHANGELOG.md                       # Dated project changelog
├── SECURITY.md                        # Security & secret management policy
├── README.md                          # Project documentation
├── run.bat                            # Windows launch & test script
├── package.json                       # Node.js project manifest (v0.2.0)
└── .gitignore                         # Ignored dependencies & secrets
```

---

## Local Development & Testing

### Running Locally with `run.bat`
Double-click `run.bat` or run in terminal:
```cmd
run.bat
```

### Running with Node CLI
```bash
# Set your API key
set GEMINI_API_KEY=your_key_here

# Run with interactive prompt
npm start

# Run with test issue
node src/index.js --test

# Run with custom parameters & options
node src/index.js --title "Bug on checkout" --body "cart button broken on mobile Safari" --enhance-title --no-badge
```

### Building Distribution
To re-bundle the standalone executable:
```bash
npm run build
```

---

## License

MIT
