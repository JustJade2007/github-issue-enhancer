import { Octokit } from "@octokit/rest";
import { assignIssueToProject } from "./projects.js";

const ENHANCED_MARKER = "<!-- gemini-enhanced -->";

/**
 * Checks if the issue has already been processed by the enhancer.
 * @param {string} body 
 * @returns {boolean}
 */
export function isAlreadyEnhanced(body) {
  if (!body) return false;
  return body.includes(ENHANCED_MARKER);
}

/**
 * Extracts raw or unenhanced content from an issue body that may already be enhanced.
 * Looks for the collapsible <details> "Original Submission" block, or strips out bot badges and markers.
 * @param {string} body
 * @returns {string}
 */
export function extractRawIssueContent(body) {
  if (!body) return "";

  // Check for the <details> section containing the original submission
  const detailsMatch = body.match(
    /<details>\s*<summary>[\s\S]*?Original Submission[\s\S]*?<\/summary>\s*([\s\S]*?)\s*<\/details>/i
  );
  if (
    detailsMatch &&
    detailsMatch[1] &&
    detailsMatch[1].trim() &&
    detailsMatch[1].trim() !== "*(Original body was empty)*"
  ) {
    return detailsMatch[1].trim();
  }

  // Otherwise, strip out known bot markers, badges, and details blocks
  let cleaned = body
    .replace(/<!--\s*gemini-enhanced\s*-->/gi, "")
    .replace(/>\s*\[!NOTE\][\s\S]*?Original raw submission is preserved below\.\s*/gi, "")
    .trim();

  return cleaned || body;
}

/**
 * Adds an emoji reaction to an issue comment.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.commentId
 * @param {'eyes'|'rocket'|'+1'|'-1'|'laugh'|'confused'|'heart'|'hooray'} params.content
 */
export async function addCommentReaction({ token, repository, commentId, content }) {
  if (!token || !repository || !commentId || !content) return;
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: parseInt(commentId, 10),
      content
    });
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not add reaction '${content}' to comment #${commentId}:`, err.message);
  }
}

/**
 * Fetches all active label names for a repository.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @returns {Promise<string[]>}
 */
export async function fetchRepositoryLabels({ token, repository }) {
  if (!token || !repository) return [];
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100
    });
    return data.map((l) => l.name);
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not fetch repository labels:`, err.message);
    return [];
  }
}

/**
 * Fetches open milestones for a repository.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @returns {Promise<Array<{ id: number, number: number, title: string }>>}
 */
export async function fetchRepositoryMilestones({ token, repository }) {
  if (!token || !repository) return [];
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.issues.listMilestones({
      owner,
      repo,
      state: "open",
      per_page: 50
    });
    return data.map((m) => ({ id: m.id, number: m.number, title: m.title }));
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not fetch repository milestones:`, err.message);
    return [];
  }
}

/**
 * Fetches recent open issues in the repository for relationship detection (excluding current issue).
 * Also inspects whether candidate issues already have branch or PR associations.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.excludeIssueNumber
 * @param {number} [params.limit=50]
 * @returns {Promise<Array<{ number: number, title: string, nodeId: string, body: string, state: string, milestone?: { number: number, title: string }|null }>>}
 */
export async function fetchOpenIssues({ token, repository, excludeIssueNumber, limit = 50 }) {
  if (!token || !repository) return [];
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    // Fetch both open and closed issues so Gemini can identify duplicates and dependencies
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: Math.min(limit, 100)
    });

    const currentNum = parseInt(excludeIssueNumber, 10);
    // Exclude pull requests (GitHub API listForRepo includes PRs unless filtered) and the current issue
    const candidateIssues = data
      .filter((item) => !item.pull_request && item.number !== currentNum)
      .slice(0, limit);

    return candidateIssues.map((item) => ({
      number: item.number,
      title: item.title,
      nodeId: item.node_id,
      body: item.body || "",
      state: item.state || "open",
      milestone: item.milestone ? { number: item.milestone.number, title: item.milestone.title } : null
    }));
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not fetch candidate issues for relationship/duplicate detection:`, err.message);
    return [];
  }
}

/**
 * Discovers linked development branch or Pull Request for an issue.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.issueNumber
 * @returns {Promise<{ branchName: string|null, prNumber: number|null, prUrl: string|null }>}
 */
export async function findIssueWorkAssociations({ token, repository, issueNumber }) {
  if (!token || !repository || !issueNumber) return { branchName: null, prNumber: null, prUrl: null };
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });

    // 1. Check open Pull Requests that reference this issue (e.g. #issueNumber, fixes #..., closes #...)
    const { data: openPRs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 50
    });

    const targetPattern = new RegExp(`(?:#|issues\\/)${issueNumber}\\b`, "i");
    for (const pr of openPRs) {
      if (
        (pr.body && targetPattern.test(pr.body)) ||
        (pr.title && targetPattern.test(pr.title)) ||
        pr.head?.ref?.includes(String(issueNumber))
      ) {
        return {
          branchName: pr.head?.ref || null,
          prNumber: pr.number,
          prUrl: pr.html_url
        };
      }
    }

    // 2. Check for branches named after the issue (e.g. issue-<num> or <prefix><num>)
    try {
      const { data: branches } = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100
      });
      const issueBranch = branches.find((b) =>
        new RegExp(`(^|[-_/])${issueNumber}([-_/]|$)`).test(b.name)
      );
      if (issueBranch) {
        return { branchName: issueBranch.name, prNumber: null, prUrl: null };
      }
    } catch {
      // ignore branch listing errors
    }

    return { branchName: null, prNumber: null, prUrl: null };
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not inspect work associations for issue #${issueNumber}:`, err.message);
    return { branchName: null, prNumber: null, prUrl: null };
  }
}

/**
 * Links a child sub-issue to a parent issue using GraphQL addSubIssue mutation.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.parentIssueId - GraphQL node_id
 * @param {string} params.subIssueId - GraphQL node_id
 */
export async function linkSubIssue({ token, parentIssueId, subIssueId }) {
  if (!token || !parentIssueId || !subIssueId) return;
  try {
    const octokit = new Octokit({ auth: token });
    const mutation = `
      mutation addSubIssue($issueId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
          subIssue {
            id
            number
          }
        }
      }
    `;
    await octokit.graphql(mutation, {
      issueId: parentIssueId,
      subIssueId,
      headers: {
        "GraphQL-Features": "sub_issues"
      }
    });
    console.log(`[GitHub] Successfully linked sub-issue via GraphQL.`);
  } catch (err) {
    console.log(`[GitHub] Note: GraphQL sub-issue linking: ${err.message}`);
  }
}

/**
 * Links a blocking issue dependency using GraphQL addBlockedBy mutation.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.blockedIssueId - GraphQL node_id of issue that is blocked
 * @param {string} params.blockingIssueId - GraphQL node_id of issue doing the blocking
 */
export async function linkBlockedBy({ token, blockedIssueId, blockingIssueId }) {
  if (!token || !blockedIssueId || !blockingIssueId) return;
  try {
    const octokit = new Octokit({ auth: token });
    const mutation = `
      mutation addBlockedBy($issueId: ID!, $blockingIssueId: ID!) {
        addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) {
          blockingIssue {
            id
            number
          }
        }
      }
    `;
    await octokit.graphql(mutation, {
      issueId: blockedIssueId,
      blockingIssueId
    });
    console.log(`[GitHub] Successfully linked blocked-by dependency via GraphQL.`);
  } catch (err) {
    console.log(`[GitHub] Note: GraphQL issue dependency linking: ${err.message}`);
  }
}

/**
 * Fetches detailed GitHub issue information, including node_id.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.issueNumber
 * @returns {Promise<any>}
 */
export async function getIssueDetails({ token, repository, issueNumber }) {
  if (!token || !repository || !issueNumber) return null;
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: parseInt(issueNumber, 10)
    });
    return data;
  } catch (err) {
    console.warn(`[GitHub] Warning: Could not fetch details for issue #${issueNumber}:`, err.message);
    return null;
  }
}

/**
 * Assigns users to an issue.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.issueNumber
 * @param {string[]} params.assignees
 */
export async function assignUsersToIssue({ token, repository, issueNumber, assignees }) {
  if (!token || !repository || !issueNumber || !Array.isArray(assignees) || assignees.length === 0) return;
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    console.log(`[GitHub] Assigning issue #${issueNumber} to: ${assignees.join(", ")}`);
    await octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: parseInt(issueNumber, 10),
      assignees
    });
    console.log(`[GitHub] Successfully assigned issue #${issueNumber}.`);
  } catch (err) {
    console.warn(`[GitHub] Warning: Failed to assign users to issue #${issueNumber}:`, err.message);
  }
}

/**
 * Sets milestone on an issue.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.issueNumber
 * @param {number} params.milestoneNumber
 */
export async function setIssueMilestone({ token, repository, issueNumber, milestoneNumber }) {
  if (!token || !repository || !issueNumber || !milestoneNumber) return;
  try {
    const [owner, repo] = repository.split("/");
    const octokit = new Octokit({ auth: token });
    console.log(`[GitHub] Setting milestone #${milestoneNumber} on issue #${issueNumber}...`);
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: parseInt(issueNumber, 10),
      milestone: milestoneNumber
    });
    console.log(`[GitHub] Successfully set milestone on issue #${issueNumber}.`);
  } catch (err) {
    console.warn(`[GitHub] Warning: Failed to set milestone on issue #${issueNumber}:`, err.message);
  }
}

/**
 * Creates a git development branch for the issue and associates it via GraphQL createLinkedBranch if supported.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.repository
 * @param {number|string} params.issueNumber
 * @param {string} params.issueTitle
 * @param {string} [params.issueNodeId]
 * @param {string} [params.branchPrefix="issue-"]
 * @returns {Promise<string|null>} Created branch name or null
 */
export async function createAndLinkBranch({
  token,
  repository,
  issueNumber,
  issueTitle,
  issueNodeId,
  branchPrefix = "issue-"
}) {
  if (!token || !repository || !issueNumber) return null;
  const [owner, repo] = repository.split("/");
  const octokit = new Octokit({ auth: token });

  try {
    // 1. Get default branch info
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch || "main";

    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`
    });
    const latestCommitSha = refData.object.sha;

    // 2. Format slug from title
    const slug = (issueTitle || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);

    const branchName = `${branchPrefix}${issueNumber}${slug ? `-${slug}` : ""}`;
    console.log(`[GitHub] Preparing development branch "${branchName}" from "${defaultBranch}" (${latestCommitSha.slice(0, 7)})...`);

    // Strategy 1: Use GitHub CLI 'gh issue develop' (native GitHub command to create & link branch)
    try {
      const { execFileSync } = await import("child_process");
      console.log(`[GitHub] Attempting to create and link branch via GitHub CLI ('gh issue develop')...`);
      execFileSync(
        "gh",
        [
          "issue",
          "develop",
          String(issueNumber),
          "--repo",
          repository,
          "--name",
          branchName,
          "--base",
          defaultBranch
        ],
        {
          env: {
            ...process.env,
            GH_TOKEN: token,
            GITHUB_TOKEN: token
          },
          stdio: "pipe",
          encoding: "utf8"
        }
      );
      console.log(`[GitHub] Successfully created and linked branch "${branchName}" to issue #${issueNumber} via GitHub CLI.`);
      return branchName;
    } catch (cliErr) {
      console.log(`[GitHub] Note: GitHub CLI linking returned: ${cliErr.message?.split("\n")[0] || "unavailable"}. Attempting GraphQL mutation.`);
    }

    // Strategy 2: Use GraphQL createLinkedBranch mutation (creates branch and associates it with issue)
    if (issueNodeId) {
      try {
        const linkMutation = `
          mutation createLinkedBranch($input: CreateLinkedBranchInput!) {
            createLinkedBranch(input: $input) {
              linkedBranch {
                id
                ref {
                  name
                }
              }
            }
          }
        `;

        const res = await octokit.graphql(linkMutation, {
          input: {
            issueId: issueNodeId,
            oid: latestCommitSha,
            name: branchName,
            repositoryId: repoData.node_id
          }
        });

        if (res?.createLinkedBranch?.linkedBranch?.id) {
          console.log(`[GitHub] Successfully created and linked branch "${branchName}" to issue #${issueNumber} via GraphQL.`);
          return branchName;
        }
      } catch (linkErr) {
        console.log(`[GitHub] Note: GraphQL createLinkedBranch returned: ${linkErr.message}. Falling back to Git ref creation.`);
      }
    }

    // Strategy 3: Direct Git ref creation as fallback
    try {
      console.log(`[GitHub] Creating branch "${branchName}" in Git directly...`);
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: latestCommitSha
      });
      console.log(`[GitHub] Successfully created branch "${branchName}" in Git.`);
      return branchName;
    } catch (refErr) {
      if (refErr.message && refErr.message.includes("Reference already exists")) {
        console.log(`[GitHub] Branch "${branchName}" already exists in Git.`);
        return branchName;
      }
      throw refErr;
    }
  } catch (err) {
    console.warn(`[GitHub] Warning: Failed to create development branch:`, err.message);
    return null;
  }
}

/**
 * Updates a GitHub issue with the enhanced markdown body, applies optional title changes,
 * adds labels, and posts contributor fix instructions as a comment if applicable.
 * Also coordinates automated triage: user assignment, milestone, branch linking, and project attributes.
 * @param {object} params
 * @param {string} params.token - GitHub Token
 * @param {string} params.repository - "owner/repo" string
 * @param {number|string} params.issueNumber - GitHub issue number
 * @param {string} params.originalTitle - Original issue title
 * @param {string} [params.enhancedTitle] - Optional reworded issue title
 * @param {string} params.originalBody - Original issue body
 * @param {string} params.enhancedBody - Gemini-enhanced markdown
 * @param {string} [params.fixInstructions] - Optional brief instructions to fix the issue
 * @param {string} params.modelUsed - Model name used
 * @param {object} [params.options] - Configurable workflow settings
 */
export async function updateGitHubIssue({
  token,
  repository,
  issueNumber,
  originalTitle,
  enhancedTitle,
  originalBody,
  enhancedBody,
  fixInstructions,
  modelUsed,
  options = {}
}) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to update GitHub issues.");
  }
  if (!repository || !repository.includes("/")) {
    throw new Error(`Invalid repository format: "${repository}". Expected "owner/repo".`);
  }

  const [owner, repo] = repository.split("/");
  const num = parseInt(issueNumber, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid issue number: ${issueNumber}`);
  }

  const {
    postComment = true,
    preserveOriginal = true,
    addBadge = true,
    addLabels = [],
    recommendedLabels = [],
    skipBodyUpdate = false,
    autoAssign = false,
    assignees = [],
    milestone = null,
    candidateMilestones = [],
    createBranch = false,
    branchPrefix = "issue-",
    projectUrl = null,
    projectNumber = null,
    projectOwner = null,
    projectToken = null,
    estimatedPriority = null,
    estimatedSize = null,
    priorityField = "Priority",
    sizeField = "Size",
    createdBranchName = null,
    relationshipDetails = null,
    duplicateOf = null
  } = options;

  const octokit = new Octokit({ auth: token });

  const isDuplicate = Boolean(duplicateOf);

  // 1. Update issue body & title if not skipped
  if (skipBodyUpdate) {
    console.log(`[GitHub] Issue #${num} description was evaluated as thorough. Preserving original issue body and title.`);
  } else {
    // Construct new body respecting user settings
    const bodyParts = [ENHANCED_MARKER];

    if (isDuplicate) {
      bodyParts.push(
        "> [!WARNING]",
        `> **Duplicate Issue Detected**`,
        `> This issue has been identified as a duplicate of #${duplicateOf} and closed automatically.`,
        ""
      );
    } else if (addBadge) {
      bodyParts.push(
        "> [!NOTE]",
        "> **Issue Formatted with Gemini Flash Lite**",
        "> This issue description was automatically reworded and structured for technical clarity without adding any new content or assumptions. Original raw submission is preserved below.",
        ""
      );
    }

    bodyParts.push(enhancedBody);

    if (preserveOriginal) {
      bodyParts.push(
        "",
        "---",
        "<details>",
        "<summary>🔍 <b>Original Submission</b> (Click to expand)</summary>",
        "",
        originalBody ? originalBody : "*(Original body was empty)*",
        "",
        "</details>"
      );
    }

    const updatedIssueBody = bodyParts.join("\n");

    const updatePayload = {
      owner,
      repo,
      issue_number: num,
      body: updatedIssueBody
    };

    const hasTitleUpdate = Boolean(enhancedTitle && enhancedTitle !== originalTitle);
    if (hasTitleUpdate) {
      updatePayload.title = enhancedTitle;
    }

    if (isDuplicate) {
      updatePayload.state = "closed";
      updatePayload.state_reason = "not_planned";
    }

    console.log(`[GitHub] Updating issue #${num} in ${owner}/${repo}...`);
    await octokit.rest.issues.update(updatePayload);
    console.log(`[GitHub] Successfully updated issue #${num} description${isDuplicate ? " and closed as duplicate" : ""}.`);
  }

  // If body update was skipped but issue is a duplicate, close it now
  if (skipBodyUpdate && isDuplicate) {
    console.log(`[GitHub] Closing issue #${num} as duplicate of #${duplicateOf}...`);
    try {
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: num,
        state: "closed",
        state_reason: "not_planned"
      });
      console.log(`[GitHub] Successfully closed issue #${num} as duplicate.`);
    } catch (closeErr) {
      console.warn(`[GitHub] Warning: Failed to close issue #${num}:`, closeErr.message);
    }
  }

  // 2. Merge and apply labels (configured addLabels + AI recommendedLabels + duplicate if applicable)
  const allLabels = [...addLabels, ...recommendedLabels];
  if (isDuplicate && !allLabels.includes("duplicate")) {
    allLabels.push("duplicate");
  }
  const combinedLabels = Array.from(
    new Set(allLabels.map((l) => l.trim()).filter(Boolean))
  );

  if (combinedLabels.length > 0) {
    try {
      console.log(`[GitHub] Adding label(s) to issue #${num}: ${combinedLabels.join(", ")}`);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: num,
        labels: combinedLabels
      });
      console.log(`[GitHub] Successfully added labels to issue #${num}.`);
    } catch (lblErr) {
      console.warn(`[GitHub] Warning: Failed to apply labels to issue #${num}:`, lblErr.message);
    }
  }

  // 3. Post comment with contributor fix instructions and relationship links if enabled
  if (postComment) {
    const hasFixInstructions = Boolean(fixInstructions && fixInstructions.trim());
    const rel = relationshipDetails || {};
    const hasRelationships = Boolean(
      (rel.relatedIssues && rel.relatedIssues.length > 0) ||
      (rel.blockedByIssues && rel.blockedByIssues.length > 0) ||
      (rel.blockingIssues && rel.blockingIssues.length > 0) ||
      rel.parentIssue ||
      rel.reusedBranchInfo
    );

    if (isDuplicate || hasFixInstructions || hasRelationships || createdBranchName) {
      const commentLines = [];

      if (isDuplicate) {
        commentLines.push(
          "> [!WARNING]",
          "> ### 🚫 Closed as Duplicate",
          `> This issue has been evaluated as a duplicate of #${duplicateOf} and has been closed.`,
          `> `,
          `> Please refer to #${duplicateOf} for ongoing discussion and progress.`
        );
      }

      if (hasFixInstructions && !isDuplicate) {
        commentLines.push(
          "> [!TIP]",
          "> ### 💡 Instructions to Fix This Issue",
          "> Here are brief instructions to help anyone interested in resolving this issue:",
          "",
          fixInstructions.trim()
        );
      }

      if (hasRelationships) {
        if (commentLines.length > 0) commentLines.push("");
        commentLines.push(
          "> [!NOTE]",
          "> ### 🔗 Issue Relationships & Work Context"
        );
        if (rel.parentIssue) {
          commentLines.push(`> - **Sub-issue of**: #${rel.parentIssue}`);
        }
        if (rel.blockedByIssues && rel.blockedByIssues.length > 0) {
          commentLines.push(`> - **Blocked by**: ${rel.blockedByIssues.map((n) => `#${n}`).join(", ")}`);
        }
        if (rel.blockingIssues && rel.blockingIssues.length > 0) {
          commentLines.push(`> - **Blocks**: ${rel.blockingIssues.map((n) => `#${n}`).join(", ")}`);
        }
        if (rel.relatedIssues && rel.relatedIssues.length > 0) {
          commentLines.push(`> - **Related issues**: ${rel.relatedIssues.map((n) => `#${n}`).join(", ")}`);
        }
        if (rel.reusedBranchInfo) {
          const prRef = rel.reusedBranchInfo.prNumber ? ` (PR #${rel.reusedBranchInfo.prNumber})` : "";
          commentLines.push(
            `> - **Development Branch**: Shared with related issue #${rel.reusedBranchInfo.issueNumber} on \`${rel.reusedBranchInfo.branchName}\`${prRef}`
          );
        }
      }

      if (createdBranchName && (!rel.reusedBranchInfo || rel.reusedBranchInfo.branchName !== createdBranchName)) {
        if (commentLines.length > 0) commentLines.push("");
        commentLines.push(
          "> [!NOTE]",
          `> Development branch \`${createdBranchName}\` has been created for this issue.`
        );
      }

      const commentContent = commentLines.join("\n");

      console.log(`[GitHub] Posting ${isDuplicate ? "duplicate notification" : "contributor fix instructions"} comment to issue #${num}...`);
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: num,
        body: commentContent
      });
      console.log(`[GitHub] Successfully posted fix instructions comment to issue #${num}.`);
    } else {
      console.log(`[GitHub] Contributor fix instructions not applicable for issue #${num}. Skipping comment.`);
    }
  } else {
    console.log(`[GitHub] Skipping comment on issue #${num} (post-comment is disabled).`);
  }
}
