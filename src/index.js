import "dotenv/config";
import fs from "fs";
import readline from "readline";
import { loadConfig, parseBoolean, parseList } from "./config.js";
import { enhanceIssue } from "./gemini.js";
import {
  isAlreadyEnhanced,
  extractRawIssueContent,
  addCommentReaction,
  updateGitHubIssue,
  fetchRepositoryLabels,
  fetchRepositoryMilestones,
  getIssueDetails,
  assignUsersToIssue,
  setIssueMilestone,
  createAndLinkBranch,
  fetchOpenIssues,
  findIssueWorkAssociations,
  linkSubIssue,
  linkBlockedBy
} from "./github.js";
import { assignIssueToProject } from "./projects.js";

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
    } else if (arg === "--auto-assign") {
      parsed.autoAssign = true;
    } else if (arg === "--assignees" && i + 1 < args.length) {
      parsed.assignees = args[++i];
    } else if (arg === "--milestone" && i + 1 < args.length) {
      parsed.milestone = args[++i];
    } else if (arg === "--create-branch") {
      parsed.createBranch = true;
    } else if (arg === "--project-url" && i + 1 < args.length) {
      parsed.projectUrl = args[++i];
    } else if (arg === "--no-close-duplicates") {
      parsed.closeDuplicates = false;
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

function resolveAssignees({ repository, config, labels, title, body }) {
  const [owner] = repository ? repository.split("/") : [""];
  // Filter out special keywords like 'auto' or 'none' from literal username list
  const filteredAssignees = (config.assignees || []).filter(
    (a) => a && a.toLowerCase() !== "auto" && a.toLowerCase() !== "none"
  );
  const assigneesSet = new Set(filteredAssignees);
  const wantsAutoAssign =
    Boolean(config.autoAssign) ||
    (config.assignees || []).some((a) => a && a.toLowerCase() === "auto");

  if (Array.isArray(config.assignmentRules)) {
    const textToMatch = `${title} ${body}`.toLowerCase();
    const currentLabels = (labels || []).map((l) => l.toLowerCase());

    for (const rule of config.assignmentRules) {
      if (!rule || !Array.isArray(rule.assignees)) continue;
      let matched = false;

      if (rule.label && currentLabels.includes(rule.label.toLowerCase())) {
        matched = true;
      }
      if (rule.keyword && textToMatch.includes(rule.keyword.toLowerCase())) {
        matched = true;
      }

      if (matched) {
        for (const a of rule.assignees) {
          assigneesSet.add(a);
        }
      }
    }
  }

  // If auto-assign is requested and no explicit/rule assignees were added, assign the repo owner
  if (wantsAutoAssign && assigneesSet.size === 0 && owner) {
    console.log(`[GitHub Action] Auto-assigning issue to repository owner: "${owner}".`);
    assigneesSet.add(owner);
  }

  return Array.from(assigneesSet);
}

function resolveMilestone({ config, candidateMilestones, recommendedMilestone }) {
  if (!config.milestone) return null;

  if (!candidateMilestones || candidateMilestones.length === 0) {
    console.log("[GitHub Action] Note: Repository has no open milestones created. Skipping milestone assignment.");
    return null;
  }

  const milestoneSetting = String(config.milestone).trim();

  // Helper for case-insensitive and whitespace-tolerant matching
  const findMilestoneMatch = (targetTitle) => {
    if (!targetTitle) return null;
    const cleanTarget = targetTitle.trim().toLowerCase();
    return candidateMilestones.find(
      (m) => m.title && m.title.trim().toLowerCase() === cleanTarget
    );
  };

  if (milestoneSetting.toLowerCase() === "auto") {
    if (!recommendedMilestone) return null;
    const match = findMilestoneMatch(recommendedMilestone);
    if (!match) {
      console.log(`[GitHub Action] AI recommendation "${recommendedMilestone}" did not match any open milestone.`);
      return null;
    }
    return match.number;
  }

  const asNumber = parseInt(milestoneSetting, 10);
  if (!isNaN(asNumber) && String(asNumber) === milestoneSetting) {
    return asNumber;
  }

  const match = findMilestoneMatch(milestoneSetting);
  return match ? match.number : null;
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
  --auto-assign                Enable auto-assignment
  --assignees <users>          Comma-separated usernames to assign
  --milestone <name/num/auto>  Milestone to assign
  --create-branch              Enable development branch creation
  --project-url <url>          GitHub Project v2 URL
  --no-close-duplicates        Disable auto-closing duplicate issues
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

  if (!title && !body) {
    console.error("Error: At least an issue title or body is required.");
    process.exit(1);
  }

  console.log("\nEnhancing issue with Gemini Flash Lite...\n");

  try {
    const {
      isThorough,
      enhancedTitle,
      enhancedBody,
      fixInstructions,
      recommendedLabels,
      estimatedPriority,
      estimatedSize,
      recommendedMilestone,
      duplicateOf,
      modelUsed
    } = await enhanceIssue(title, body, {
      model: config.geminiModel,
      temperature: config.temperature,
      customInstruction: config.customInstruction,
      enhanceTitle: config.enhanceTitle,
      availableLabels: config.addLabels.length > 0 ? config.addLabels : ["bug", "documentation", "enhancement", "ui/ux", "frontend", "backend"]
    });

    console.log("=========================================");
    console.log("             ENHANCED ISSUE              ");
    console.log("=========================================\n");
    console.log(`Evaluated Thorough: ${isThorough ? "YES (Skip body rewrite)" : "NO (Rewritten for clarity)"}`);
    if (duplicateOf) {
      console.log(`🚨 DUPLICATE DETECTED: Duplicate of #${duplicateOf}`);
    }
    if (config.enhanceTitle && enhancedTitle) {
      console.log(`Enhanced Title: ${enhancedTitle}\n`);
    }

    if (config.addBadge) {
      console.log("> [!NOTE]");
      console.log("> **Issue Formatted with Gemini Flash Lite**");
      console.log("> This issue description was automatically reworded and structured for technical clarity without adding any new content or assumptions. Original raw submission is preserved below.\n");
    }

    console.log(enhancedBody);

    if (config.preserveOriginal) {
      console.log("\n---");
      console.log("<details>");
      console.log("<summary>🔍 <b>Original Submission</b> (Click to expand)</summary>\n");
      console.log(body ? body : "*(Original body was empty)*");
      console.log("\n</details>");
    }

    console.log("\n=========================================");
    console.log("           AUTOMATED TRIAGE              ");
    console.log("=========================================");
    console.log(`Duplicate Of:       ${duplicateOf ? `#${duplicateOf}` : "None"}`);
    console.log(`Recommended Labels: ${recommendedLabels.length > 0 ? recommendedLabels.join(", ") : "None"}`);
    console.log(`Estimated Priority: ${estimatedPriority || "Unspecified"}`);
    console.log(`Estimated Size:     ${estimatedSize || "Unspecified"}`);
    console.log(`Recommended Milestone: ${recommendedMilestone || "None"}`);

    if (config.postComment) {
      console.log("\n=========================================");
      console.log("     CONTRIBUTOR FIX INSTRUCTIONS        ");
      console.log("=========================================\n");
      if (duplicateOf) {
        console.log(`> [!WARNING]\n> Marked as duplicate of #${duplicateOf} and closed.`);
      } else if (fixInstructions) {
        console.log("> [!TIP]");
        console.log("> ### 💡 Instructions to Fix This Issue");
        console.log("> Here are brief instructions to help anyone interested in resolving this issue:\n");
        console.log(fixInstructions);
      } else {
        console.log("(Instructions not applicable for this issue)");
      }
    }
  } catch (error) {
    console.error("Enhancement failed:", error.message);
    process.exit(1);
  }
}

async function runGitHubAction() {
  console.log("[GitHub Action] Starting GitHub Issue Enhancer workflow...");

  const config = loadConfig();
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  let title = process.env.ISSUE_TITLE || "";
  let body = process.env.ISSUE_BODY || "";
  let issueNumber = process.env.ISSUE_NUMBER;
  let repository = process.env.REPOSITORY;
  let author = process.env.ISSUE_AUTHOR || "";
  let labels = [];
  let isCommentTrigger = false;
  let commentId = process.env.COMMENT_ID || null;
  let forceEnhance = false;

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
  let eventData = null;
  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
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

  // Check if triggered by an issue comment
  if (eventData && eventData.comment) {
    isCommentTrigger = true;
    commentId = eventData.comment.id;

    if (eventData.issue && eventData.issue.pull_request) {
      console.log("[GitHub Action] Comment is on a pull request, not an issue. Skipping.");
      return;
    }

    const commentBody = eventData.comment.body || process.env.COMMENT_BODY || "";
    const isEnhanceCommand = /^\s*\/enhance\b/im.test(commentBody);
    if (!isEnhanceCommand) {
      console.log("[GitHub Action] Comment does not contain /enhance command. Skipping.");
      return;
    }

    const commentAuthor = eventData.comment.user?.login || process.env.COMMENT_AUTHOR || "";
    const issueAuthor = eventData.issue?.user?.login || author || "";
    const authorAssociation = (
      eventData.comment.author_association ||
      process.env.COMMENT_AUTHOR_ASSOCIATION ||
      ""
    ).toUpperCase();
    const allowedRoles = ["OWNER", "MEMBER", "COLLABORATOR"];

    const isAuthorized =
      (commentAuthor && issueAuthor && commentAuthor.toLowerCase() === issueAuthor.toLowerCase()) ||
      allowedRoles.includes(authorAssociation);

    if (!isAuthorized) {
      console.log(
        `[GitHub Action] User "${commentAuthor}" (association: ${authorAssociation}) is not authorized to execute /enhance. Allowed: issue author, repository owner, members, or collaborators. Skipping.`
      );
      return;
    }

    if (commentId && githubToken) {
      await addCommentReaction({
        token: githubToken,
        repository,
        commentId,
        content: "eyes"
      });
    }

    forceEnhance = true;
    if (isAlreadyEnhanced(body)) {
      console.log(`[GitHub Action] Issue #${issueNumber} was previously enhanced. Extracting base content for re-enhancement.`);
      body = extractRawIssueContent(body);
    }
  } else {
    if (isAlreadyEnhanced(body)) {
      console.log(`[GitHub Action] Issue #${issueNumber} is already enhanced. Skipping to prevent loop.`);
      return;
    }
  }

  // Ignore-author / ignore-label filters are intended to prevent *automatic* enhancement
  // on issue creation. An explicit "/enhance" command is a deliberate request from an
  // authorized user and should always be honored, so these filters are skipped in that case.
  if (!forceEnhance) {
    if (config.ignoreAuthors && config.ignoreAuthors.length > 0 && author) {
      const isIgnoredAuthor = config.ignoreAuthors.some(
        (ignored) => ignored.trim().toLowerCase() === author.trim().toLowerCase()
      );
      if (isIgnoredAuthor) {
        console.log(`[GitHub Action] Issue #${issueNumber} opened by ignored author: "${author}". Skipping enhancement.`);
        return;
      }
    }

    if (config.ignoreLabels && config.ignoreLabels.length > 0 && labels.length > 0) {
      const lowerLabels = labels.map((l) => l.toLowerCase());
      const matchedLabel = config.ignoreLabels.find((il) => lowerLabels.includes(il.toLowerCase()));
      if (matchedLabel) {
        console.log(`[GitHub Action] Issue #${issueNumber} has ignored label: "${matchedLabel}". Skipping enhancement.`);
        return;
      }
    }
  }

  try {
    await enhanceAndUpdateIssue({
      config,
      githubToken,
      title,
      body,
      issueNumber,
      repository,
      author,
      labels,
      isCommentTrigger,
      commentId,
      forceEnhance
    });
  } catch (error) {
    // If an authorized "/enhance" command fails partway through, the commenter is left
    // with a permanent "eyes" reaction and no indication anything went wrong. Surface the
    // failure with a "confused" reaction so there is reliable, visible feedback.
    if (isCommentTrigger && commentId && githubToken) {
      await addCommentReaction({
        token: githubToken,
        repository,
        commentId,
        content: "confused"
      });
    }
    throw error;
  }
}

async function enhanceAndUpdateIssue({
  config,
  githubToken,
  title,
  body,
  issueNumber,
  repository,
  author,
  labels,
  isCommentTrigger,
  commentId,
  forceEnhance
}) {
  // Fetch repository context (labels, milestones, open issues, issue node_id)
  console.log(`[GitHub Action] Fetching repository labels and context for ${repository}...`);
  const availableLabels = await fetchRepositoryLabels({
    token: githubToken,
    repository
  });

  let candidateMilestones = [];
  if (config.milestone) {
    candidateMilestones = await fetchRepositoryMilestones({
      token: githubToken,
      repository
    });
  }

  // Fetch open issues in the repository for relationship cross-checking
  console.log(`[GitHub Action] Fetching open issues for relationship detection...`);
  const candidateIssues = await fetchOpenIssues({
    token: githubToken,
    repository,
    excludeIssueNumber: issueNumber,
    limit: 30
  });

  const issueDetails = await getIssueDetails({
    token: githubToken,
    repository,
    issueNumber
  });
  const issueNodeId = issueDetails?.node_id || null;

  console.log(`[GitHub Action] Processing issue #${issueNumber}: "${title}" (forceEnhance: ${forceEnhance})`);
  const {
    isThorough,
    enhancedTitle,
    enhancedBody,
    fixInstructions,
    recommendedLabels,
    estimatedPriority,
    estimatedSize,
    recommendedMilestone,
    duplicateOf = null,
    relatedIssues = [],
    blockedByIssues = [],
    blockingIssues = [],
    parentIssue = null,
    modelUsed
  } = await enhanceIssue(title, body, {
    model: config.geminiModel,
    temperature: config.temperature,
    customInstruction: config.customInstruction,
    enhanceTitle: config.enhanceTitle,
    availableLabels,
    candidateMilestones: candidateMilestones.map((m) => m.title),
    candidateIssues
  });

  const isDuplicate = Boolean(duplicateOf && config.closeDuplicates);
  if (isDuplicate) {
    console.log(`[GitHub Action] Issue #${issueNumber} evaluated as DUPLICATE of #${duplicateOf}.`);
  }

  const skipBodyUpdate = Boolean(isThorough && !forceEnhance);
  if (skipBodyUpdate) {
    console.log(
      `[GitHub Action] Issue #${issueNumber} was evaluated as thorough on its own. Preserving original body/title, updating triage attributes.`
    );
  }

  // Link Sub-Issue / Parent Issue via GraphQL if enabled (skip for duplicates)
  if (!isDuplicate && config.linkSubIssues && parentIssue && issueNodeId) {
    const parentCandidate = candidateIssues.find((iss) => iss.number === parentIssue);
    if (parentCandidate && parentCandidate.nodeId) {
      console.log(`[GitHub Action] Linking issue #${issueNumber} as sub-issue of #${parentIssue}...`);
      await linkSubIssue({
        token: githubToken,
        parentIssueId: parentCandidate.nodeId,
        subIssueId: issueNodeId
      });
    }
  }

  // Link Blocked By Dependencies via GraphQL if enabled (skip for duplicates)
  if (!isDuplicate && config.linkDependencies && issueNodeId) {
    for (const blockedByNum of blockedByIssues) {
      const blockingCandidate = candidateIssues.find((iss) => iss.number === blockedByNum);
      if (blockingCandidate && blockingCandidate.nodeId) {
        console.log(`[GitHub Action] Linking issue #${issueNumber} as blocked by #${blockedByNum}...`);
        await linkBlockedBy({
          token: githubToken,
          blockedIssueId: issueNodeId,
          blockingIssueId: blockingCandidate.nodeId
        });
      }
    }

    for (const blockingNum of blockingIssues) {
      const blockedCandidate = candidateIssues.find((iss) => iss.number === blockingNum);
      if (blockedCandidate && blockedCandidate.nodeId) {
        console.log(`[GitHub Action] Linking issue #${blockingNum} as blocked by #${issueNumber}...`);
        await linkBlockedBy({
          token: githubToken,
          blockedIssueId: blockedCandidate.nodeId,
          blockingIssueId: issueNodeId
        });
      }
    }
  }

  // Check whether this issue itself is already referenced by an open Pull Request (e.g. "Closes #N")
  // or has a matching development branch. When such a relationship already exists, the issue's
  // assignment, milestone, and branch linking should stay in sync with that existing work instead
  // of being skipped or duplicated.
  const selfExistingWork = !isDuplicate
    ? await findIssueWorkAssociations({ token: githubToken, repository, issueNumber })
    : null;
  if (selfExistingWork && (selfExistingWork.branchName || selfExistingWork.prNumber)) {
    console.log(
      `[GitHub Action] Issue #${issueNumber} is already linked to existing work${
        selfExistingWork.prNumber ? ` (PR #${selfExistingWork.prNumber})` : ""
      }${selfExistingWork.branchName ? ` on branch "${selfExistingWork.branchName}"` : ""}.`
    );
  }

  // Automated Assignment (if enabled or configured) (skip for duplicates)
  const resolvedAssignees = !isDuplicate ? resolveAssignees({
    repository,
    config,
    labels: [...labels, ...recommendedLabels],
    title,
    body
  }) : [];

  // Keep assignees in sync with an already-linked pull request's assignees
  if (selfExistingWork?.prAssignees?.length) {
    for (const assignee of selfExistingWork.prAssignees) {
      if (!resolvedAssignees.includes(assignee)) {
        resolvedAssignees.push(assignee);
      }
    }
  }

  if (resolvedAssignees.length > 0) {
    await assignUsersToIssue({
      token: githubToken,
      repository,
      issueNumber,
      assignees: resolvedAssignees
    });
  }

  // Milestone Association (if enabled or configured) (skip for duplicates)
  let resolvedMilestoneNumber = !isDuplicate ? resolveMilestone({
    config,
    candidateMilestones,
    recommendedMilestone
  }) : null;

  // Fall back to the milestone already set on a linked pull request, if any
  if (!resolvedMilestoneNumber && selfExistingWork?.prMilestone) {
    resolvedMilestoneNumber = selfExistingWork.prMilestone.number;
  }

  if (resolvedMilestoneNumber) {
    await setIssueMilestone({
      token: githubToken,
      repository,
      issueNumber,
      milestoneNumber: resolvedMilestoneNumber
    });
  }

  // Development Branch Creation & Linking (skip for duplicates)
  let createdBranchName = null;
  let reusedBranchInfo = null;

  if (!isDuplicate && config.createBranch) {
    if (selfExistingWork && selfExistingWork.branchName) {
      reusedBranchInfo = {
        issueNumber,
        branchName: selfExistingWork.branchName,
        prNumber: selfExistingWork.prNumber,
        prUrl: selfExistingWork.prUrl
      };
      console.log(
        `[GitHub Action] Reusing existing work branch "${selfExistingWork.branchName}" already linked to this issue${selfExistingWork.prNumber ? ` (PR #${selfExistingWork.prNumber})` : ""}.`
      );
    } else {
      // Check if any related, parent, or blocking issues already have a PR or branch
      const candidateWorkIssues = Array.from(
        new Set([parentIssue, ...blockedByIssues, ...blockingIssues, ...relatedIssues].filter(Boolean))
      );

      for (const relatedNum of candidateWorkIssues) {
        const existingWork = await findIssueWorkAssociations({
          token: githubToken,
          repository,
          issueNumber: relatedNum
        });
        if (existingWork && existingWork.branchName) {
          reusedBranchInfo = {
            issueNumber: relatedNum,
            branchName: existingWork.branchName,
            prNumber: existingWork.prNumber,
            prUrl: existingWork.prUrl
          };
          console.log(
            `[GitHub Action] Reusing existing work branch "${existingWork.branchName}" from related issue #${relatedNum}${existingWork.prNumber ? ` (PR #${existingWork.prNumber})` : ""}.`
          );
          break;
        }
      }
    }

    if (reusedBranchInfo) {
      createdBranchName = reusedBranchInfo.branchName;
    } else {
      createdBranchName = await createAndLinkBranch({
        token: githubToken,
        repository,
        issueNumber,
        issueTitle: enhancedTitle || title,
        issueNodeId,
        branchPrefix: config.branchPrefix
      });
    }
  }

  // Construct relationship cross references for comment / issue body
  const relationshipDetails = {
    relatedIssues: config.linkRelated ? relatedIssues : [],
    blockedByIssues: config.linkDependencies ? blockedByIssues : [],
    blockingIssues: config.linkDependencies ? blockingIssues : [],
    parentIssue: config.linkSubIssues ? parentIssue : null,
    reusedBranchInfo
  };

  // Update GitHub Issue body, title, labels, and contributor comment
  await updateGitHubIssue({
    token: githubToken,
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
      addLabels: config.addLabels,
      recommendedLabels,
      skipBodyUpdate,
      createdBranchName,
      relationshipDetails,
      duplicateOf: isDuplicate ? duplicateOf : null
    }
  });

  // GitHub Project v2 Assignment & Attributes (if configured) (skip for duplicates)
  if (!isDuplicate && (config.projectUrl || config.projectNumber) && issueNodeId) {
    await assignIssueToProject({
      token: config.projectToken || githubToken,
      issueNodeId,
      repository,
      issueNumber,
      projectUrl: config.projectUrl,
      projectNumber: config.projectNumber,
      projectOwner: config.projectOwner,
      status: config.initialStatus,
      statusFieldName: config.statusField,
      priority: estimatedPriority,
      size: estimatedSize,
      priorityFieldName: config.priorityField,
      sizeFieldName: config.sizeField
    });
  }

  // Acknowledge completion on /enhance comment with 'rocket' reaction
  if (isCommentTrigger && commentId && githubToken) {
    await addCommentReaction({
      token: githubToken,
      repository,
      commentId,
      content: "rocket"
    });
  }

  console.log(`[GitHub Action] Completed processing for issue #${issueNumber}.`);
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
