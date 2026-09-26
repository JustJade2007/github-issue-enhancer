# GitHub Issue Enhancer

An automated GitHub workflow and CLI utility powered by Google Gemini Flash Lite that rewinds, clarifies, and formats new repository issues into clean, professional GitHub issue markdown **without adding new content, assumptions, or hallucinations**.

## Features

- **Strict Content Fidelity:** Reorganizes messy or shorthand descriptions into clean GitHub Flavored Markdown (Summary, Details, Context, Logs) while strictly preserving original technical boundaries and without inventing steps or solutions.
- **Automated Workflow:** Triggers immediately whenever an issue is opened (`issues: [opened]`).
- **Two-Fold Enhancement:**
  1. Updates the issue body with structured markdown while preserving the raw text in an expandable `<details>` section for transparency.
  2. Posts a status comment confirming the issue has been formatted with Gemini Flash Lite.
- **Loop & Duplicate Protection:** Uses metadata markers (`<!-- gemini-enhanced -->`) to avoid repeated formatting or execution loops.
- **Model Support & Fallback:** Configured for `gemini-3.1-flash-lite` / `gemini-2.5-flash-lite` with automatic fallback handling.
- **Local Testing:** Test directly on your local machine using interactive prompts or CLI flags via `run.bat` or `node src/index.js`.

---

## Setup for GitHub Repository

### 1. Add Repository Secret
1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. In your GitHub repository, navigate to:
   **Settings > Secrets and variables > Actions > New repository secret**.
3. Set the name to:
   ```
   GEMINI_API_KEY
   ```
4. Paste your API key as the secret value and save.

### 2. Workflow Permissions
The GitHub Action requires write permissions to edit issues and post comments. In your repository:
1. Go to **Settings > Actions > General > Workflow permissions**.
2. Select **Read and write permissions** (or rely on the in-workflow `permissions: issues: write` block).

---

## Repository Structure

```
github-issue-enhancer/
├── .github/
│   └── workflows/
│       └── enhance-issue.yml  # GitHub Actions trigger on issue creation
├── dist/
│   └── index.mjs              # Bundled distribution executable
├── scripts/
│   └── build.js               # Build & bundling script using esbuild
├── src/
│   ├── gemini.js              # Gemini API client & prompt constraints
│   ├── github.js              # Octokit issue updater & comment poster
│   └── index.js               # Main runner (GitHub Action + CLI)
├── CHANGELOG.md               # Dated project changelog
├── SECURITY.md                # Security & secret management policy
├── README.md                  # Project documentation
├── run.bat                    # Windows launch & test script
├── package.json               # Node.js project manifest (v0.1.0)
└── .gitignore                 # Ignored dependencies, secrets, & configs
```

---

## Local Development & Testing

### Prerequisites
- Node.js (version 20 or higher)
- A valid `GEMINI_API_KEY`

### Running Locally with `run.bat`
Double-click `run.bat` or run in terminal:
```cmd
run.bat
```

### Running with Node CLI
You can test the formatting without publishing to GitHub:

```bash
# Set your API key
set GEMINI_API_KEY=your_key_here

# Run with interactive prompt
npm start

# Run with CLI parameters
node src/index.js --title "Bug on checkout" --body "cart button broken on mobile Safari"
```

### Building Distribution
To bundle the project:
```bash
npm run build
```

---

## License

MIT
