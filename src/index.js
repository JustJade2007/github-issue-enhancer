import "dotenv/config";
import fs from "fs";
import readline from "readline";
import { loadConfig, parseBoolean, parseList } from "./config.js";
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
    } else if (arg === "--model" && i + 1 < args.length) {
      parsed.model = args[++i];
    } else if (arg === "--temperature" && i + 1 < args.length) {
      parsed.temperature = parseFloat(args[++i]);
    } else if (arg === "--custom-instruction" && i + 1 < args.length) {
      parsed.customInstruction = args[++i];
    } else if (arg === "--enhance-title") {
      parsed.enhanceTitle = true;
    } else if (arg === "--no-comment") {
      parsed.postComment = false;
    } else if (arg === "--no-original") {
      parsed.preserveOriginal = false;
    } else if (arg === "--no-badge") {
      parsed.addBadge = false;
    } else if (arg === "--add-labels" && i + 1 < args.length) {
      parsed.addLabels = args[++i];
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
  --title <title>              Specify issue title
  --body <body>                Specify issue body text
  --model <model>              Gemini model to use
  --temperature <val>          Sampling temperature (0.0 - 1.0)
  --custom-instruction <txt>   Custom formatting guidelines or rules
  --enhance-title              Enable title rewording & clarification
  --no-comment                 Disable posting contributor fix instructions comment
  --no-original                Disable appending original submission block
  --no-badge                   Disable [!NOTE] header callout badge
  --add-labels <labels>        Comma-separated labels to apply
  --test                       Run with a simulated issue
  --help, -h                   Show help information
    `);
    process.exit(0);
  }

  const config = loadConfig(args);

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

  console.log(`\nEnhancing issue with Gemini (Model: ${config.geminiModel}, Temp: ${config.temperature})...\n`);
  try {
    const { enhancedTitle, enhancedBody, fixInstructions, modelUsed } = await enhanceIssue(title, body, {
      model: config.geminiModel,
      temperature: config.temperature,
      customInstruction: config.customInstruction,
      enhanceTitle: config.enhanceTitle
    });

    console.log("==========================================");
    console.log(`  ENHANCED ISSUE (Model: ${modelUsed})`);
    console.log("==========================================");
    if (enhancedTitle) {
      console.log(`\nEnhanced Title: ${enhancedTitle}\n`);
    }

    if (config.addBadge) {
      console.log("> [!NOTE]\n> **Issue Formatted with Gemini Flash Lite**\n");
    }

    console.log(enhancedBody);

    if (config.preserveOriginal) {
      console.log("\n---");
      console.log("<details>\n<summary>🔍 <b>Original Submission</b></summary>\n");
      console.log(body || "*(Original body was empty)*");
      console.log("\n</details>");
    }

    console.log("\n==========================================");

    if (config.postComment) {
      console.log("  CONTRIBUTOR FIX INSTRUCTIONS (COMMENT)");
      console.log("==========================================");
      if (fixInstructions) {
        console.log("> [!TIP]");
        console.log("> ### 💡 Instructions to Fix This Issue\n");
        console.log(fixInstructions);
      } else {
        console.log("*(No comment would be posted: fix instructions not applicable for this issue)*");
      }
      console.log("==========================================");
    }
  } catch (error) {
    console.error("Enhancement failed:", error.message);
    process.exit(1);
  }
}

async function runGitHubAction() {
  console.log("[GitHub Action] Starting GitHub Issue Enhancer workflow...");

  const config = loadConfig();

  let title = process.env.ISSUE_TITLE || "";
  let body = process.env.ISSUE_BODY || "";
  let issueNumber = process.env.ISSUE_NUMBER;
  let repository = process.env.REPOSITORY;
  let author = process.env.ISSUE_AUTHOR || "";
  let labels = [];

  // Parse ISSUE_LABELS from environment if present
  if (process.env.ISSUE_LABELS) {
    try {
      const parsedLabels = JSON.parse(process.env.ISSUE_LABELS);
      if (Array.isArray(parsedLabels)) {
        labels = parsedLabels.map((l) => (typeof l === "string" ? l : l.name || ""));
      }
    } catch {
      labels = parseList(process.env.ISSUE_LABELS);
    }
  }

  // If GITHUB_EVENT_PATH is available, read directly from the GitHub event payload
  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      if (eventData.issue) {
        title = eventData.issue.title || title;
        body = eventData.issue.body || body;
        issueNumber = eventData.issue.number || issueNumber;
        if (eventData.issue.user && eventData.issue.user.login) {
          author = eventData.issue.user.login;
        }
        if (Array.isArray(eventData.issue.labels)) {
          labels = eventData.issue.labels.map((l) => (typeof l === "string" ? l : l.name || ""));
        }
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

  // Check ignore-authors filter
  if (config.ignoreAuthors && config.ignoreAuthors.length > 0 && author) {
    const isIgnoredAuthor = config.ignoreAuthors.some(
      (ignored) => ignored.trim().toLowerCase() === author.trim().toLowerCase()
    );
    if (isIgnoredAuthor) {
      console.log(`[GitHub Action] Issue #${issueNumber} opened by ignored author: "${author}". Skipping enhancement.`);
      return;
    }
  }

  // Check ignore-labels filter
  if (config.ignoreLabels && config.ignoreLabels.length > 0 && labels.length > 0) {
    const lowerLabels = labels.map((l) => l.toLowerCase());
    const matchedLabel = config.ignoreLabels.find((il) => lowerLabels.includes(il.toLowerCase()));
    if (matchedLabel) {
      console.log(`[GitHub Action] Issue #${issueNumber} has ignored label: "${matchedLabel}". Skipping enhancement.`);
      return;
    }
  }

  // Check loop protection
  if (isAlreadyEnhanced(body)) {
    console.log(`[GitHub Action] Issue #${issueNumber} is already enhanced. Skipping to prevent loop.`);
    return;
  }

  console.log(`[GitHub Action] Processing issue #${issueNumber}: "${title}"`);
  const { enhancedTitle, enhancedBody, fixInstructions, modelUsed } = await enhanceIssue(title, body, {
    model: config.geminiModel,
    temperature: config.temperature,
    customInstruction: config.customInstruction,
    enhanceTitle: config.enhanceTitle
  });

  await updateGitHubIssue({
    token: process.env.GITHUB_TOKEN,
    repository,
    issueNumber,
    originalTitle: title,
    enhancedTitle,
    originalBody: body,
    enhancedBody,
    fixInstructions,
    modelUsed,
    options: {
      postComment: config.postComment,
      preserveOriginal: config.preserveOriginal,
      addBadge: config.addBadge,
      addLabels: config.addLabels
    }
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
