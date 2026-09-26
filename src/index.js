import "dotenv/config";
import fs from "fs";
import readline from "readline";
import { enhanceIssue } from "./gemini.js";
import { isAlreadyEnhanced, updateGitHubIssue } from "./github.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title" && i + 1 < args.length) {
      parsed.title = args[++i];
    } else if (arg === "--body" && i + 1 < args.length) {
      parsed.body = args[++i];
    } else if (arg === "--test") {
      parsed.test = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    }
  }
  return parsed;
}

function promptLine(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runLocal(args) {
  if (args.help) {
    console.log(`
Usage:
  node src/index.js [options]

Options:
  --title <title>    Specify issue title
  --body <body>      Specify issue body text
  --test             Run with a simulated issue
  --help, -h         Show help information
    `);
    process.exit(0);
  }

  let title = args.title;
  let body = args.body;

  if (args.test) {
    title = "button click breaks on login page";
    body = "when i click submit button on login screen it does nothing and in console it says uncaught typeerror cannot read properties of undefined. please fix";
    console.log("[Local Mode] Running with test issue input...");
  } else if (!title && !body) {
    console.log("=== GitHub Issue Enhancer (Local Mode) ===");
    console.log("Enter the raw issue details below to format using Gemini Flash Lite:\n");
    title = await promptLine("Issue Title: ");
    console.log("\nEnter/paste issue body (finish by typing 'END' on a new line):");
    
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for await (const line of rl) {
      if (line.trim() === "END") break;
      lines.push(line);
    }
    body = lines.join("\n").trim();
  }

  console.log("\nEnhancing issue with Gemini Flash Lite without adding new content...\n");
  try {
    const { enhancedBody, modelUsed } = await enhanceIssue(title, body);
    console.log("==========================================");
    console.log(`  ENHANCED ISSUE (Model: ${modelUsed})`);
    console.log("==========================================\n");
    console.log(enhancedBody);
    console.log("\n==========================================");
  } catch (error) {
    console.error("Enhancement failed:", error.message);
    process.exit(1);
  }
}

async function runGitHubAction() {
  console.log("[GitHub Action] Starting GitHub Issue Enhancer workflow...");

  let title = process.env.ISSUE_TITLE || "";
  let body = process.env.ISSUE_BODY || "";
  let issueNumber = process.env.ISSUE_NUMBER;
  let repository = process.env.REPOSITORY;

  // If GITHUB_EVENT_PATH is available, read directly from the GitHub event payload
  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      if (eventData.issue) {
        title = eventData.issue.title || title;
        body = eventData.issue.body || body;
        issueNumber = eventData.issue.number || issueNumber;
      }
      if (eventData.repository && eventData.repository.full_name) {
        repository = eventData.repository.full_name || repository;
      }
    } catch (err) {
      console.warn("[GitHub Action] Could not parse event file, falling back to environment variables:", err.message);
    }
  }

  if (!issueNumber) {
    throw new Error("ISSUE_NUMBER is missing from action context.");
  }
  if (!repository) {
    throw new Error("REPOSITORY is missing from action context.");
  }

  if (isAlreadyEnhanced(body)) {
    console.log(`[GitHub Action] Issue #${issueNumber} is already enhanced. Skipping to prevent loop.`);
    return;
  }

  console.log(`[GitHub Action] Processing issue #${issueNumber}: "${title}"`);
  const { enhancedBody, modelUsed } = await enhanceIssue(title, body);

  await updateGitHubIssue({
    token: process.env.GITHUB_TOKEN,
    repository,
    issueNumber,
    originalTitle: title,
    originalBody: body,
    enhancedBody,
    modelUsed
  });

  console.log(`[GitHub Action] Completed enhancement for issue #${issueNumber}.`);
}

async function main() {
  const isCi = process.env.GITHUB_ACTIONS === "true" || !!process.env.GITHUB_TOKEN;
  const args = parseArgs();

  if (isCi && !args.test && !args.title) {
    await runGitHubAction();
  } else {
    await runLocal(args);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
