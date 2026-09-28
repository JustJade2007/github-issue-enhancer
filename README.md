# GitHub Issue Enhancer

An automated GitHub workflow and CLI utility powered by Google Gemini Flash Lite that rewords, clarifies, and formats new repository issues into clean, professional GitHub issue markdown **without adding new content, assumptions, or hallucinations**.

## Features

- **Strict Content Fidelity:** Reorganizes messy or shorthand descriptions into clean GitHub Flavored Markdown (Summary, Details, Context, Logs) while strictly preserving original technical boundaries and without inventing steps or solutions.
- **Automated Workflow:** Triggers immediately whenever an issue is opened (`issues: [opened]`).
- **Two-Fold Enhancement:**
  1. Updates the issue body with structured markdown while preserving the raw text in an expandable `<details>` section for transparency.
  2. Posts a status comment confirming the issue has been formatted with Gemini Flash Lite.
- **Multi-Repo Reusable Action:** Packaged as a standard GitHub Action (`action.yml`) so any repository on GitHub can consume it with a 15-line workflow file.
- **Zero-Dependency Runner:** Pre-bundled with `dist/index.mjs` so downstream repos do not need to run `npm install`, provide a `package-lock.json`, or contain Node.js code.
- **Loop & Duplicate Protection:** Uses metadata markers (`<!-- gemini-enhanced -->`) to avoid repeated formatting or execution loops.
- **Model Support & Fallback:** Configured for `gemini-3.1-flash-lite` / `gemini-2.5-flash-lite` with automatic fallback handling.
- **Local Testing:** Test directly on your local machine using interactive prompts or CLI flags via `run.bat` or `node src/index.js`.

---

## How to Use in Any Repository

To use GitHub Issue Enhancer in any repository (Python, Go, Rust, Java, Web, or issues-only repos), **no additional files or dependencies are needed in your repository**.

### Step 1: Create the Workflow File

In your target repository, create `.github/workflows/enhance-issue.yml`:

```yaml
name: Enhance New Issue

on:
  issues:
    types: [opened]

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
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 2: Add Secret to the Target Repository
1. Go to your repository's **Settings > Secrets and variables > Actions > New repository secret**.
2. Name: `GEMINI_API_KEY`
3. Value: Your Google Gemini API key.

That's all! The action executes self-contained via its pre-bundled distribution and requires no `package.json`, `package-lock.json`, or code checkout in the target repository.

---

## Repository Structure

```
github-issue-enhancer/
├── .github/
│   └── workflows/
│       └── enhance-issue.yml  # Out-of-the-box issue trigger workflow
├── action.yml                 # Reusable GitHub Action definition
├── dist/
│   └── index.mjs              # Standalone bundled executable (zero dependencies)
├── scripts/
│   └── build.js               # Build & bundling script using esbuild
├── src/
│   ├── gemini.js              # Gemini API client & strict prompt constraints
│   ├── github.js              # Octokit issue updater & comment poster
│   └── index.js               # Main runner (GitHub Action + CLI)
├── CHANGELOG.md               # Dated project changelog
├── SECURITY.md                # Security & secret management policy
├── README.md                  # Project documentation
├── run.bat                    # Windows launch & test script
├── package.json               # Node.js project manifest (v0.1.1)
└── .gitignore                 # Ignored dependencies & secrets
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

# Run with CLI parameters
node src/index.js --title "Bug on checkout" --body "cart button broken on mobile Safari"
```

### Building Distribution
To re-bundle the standalone file:
```bash
npm run build
```

---

## License

MIT
