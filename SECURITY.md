# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this repository, please do not file a public issue. Instead, report it privately to the repository maintainer.

### Secret Management

- **GEMINI_API_KEY**: Never commit your Google Gemini API key to version control. Store it as a repository secret under **Settings > Secrets and variables > Actions > New repository secret**.
- **GITHUB_TOKEN**: The workflow uses GitHub's default ephemeral `GITHUB_TOKEN` (`secrets.GITHUB_TOKEN`) with minimal required permissions (`issues: write`, `contents: read`).
- Local `.env` files are automatically ignored by `.gitignore`.
