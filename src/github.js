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
    console.log(`[GitHub] Creating development branch "${branchName}" from "${defaultBranch}" (${latestCommitSha.slice(0, 7)})...`);

    // 3. Create ref in git
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: latestCommitSha
    });
    console.log(`[GitHub] Successfully created branch "${branchName}".`);

    // 4. Link branch to issue via GraphQL createLinkedBranch if issueNodeId is available
    if (issueNodeId) {
      try {
        const linkMutation = `
          mutation linkBranch($issueId: ID!, $oid: GitObjectID!, $name: String!) {
            createLinkedBranch(input: { issueId: $issueId, oid: $oid, name: $name }) {
              linkedBranch {
                id
              }
            }
          }
        `;
        await octokit.graphql(linkMutation, {
          issueId: issueNodeId,
          oid: latestCommitSha,
          name: branchName
        });
        console.log(`[GitHub] Successfully linked branch "${branchName}" to issue #${issueNumber}.`);
      } catch (linkErr) {
        console.log(`[GitHub] Note: Linked branch association via GraphQL not available (${linkErr.message}). Branch was created in Git.`);
      }
    }

    return branchName;
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
    createdBranchName = null
  } = options;

  const octokit = new Octokit({ auth: token });

  // 1. Update issue body & title if not skipped
  if (skipBodyUpdate) {
    console.log(`[GitHub] Issue #${num} description was evaluated as thorough. Preserving original issue body and title.`);
  } else {
    // Construct new body respecting user settings
    const bodyParts = [ENHANCED_MARKER];

    if (addBadge) {
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

    console.log(`[GitHub] Updating issue #${num} in ${owner}/${repo}...`);
    await octokit.rest.issues.update(updatePayload);
    console.log(`[GitHub] Successfully updated issue #${num} description.`);
  }

  // 2. Merge and apply labels (configured addLabels + AI recommendedLabels)
  const combinedLabels = Array.from(
    new Set([...addLabels, ...recommendedLabels].map((l) => l.trim()).filter(Boolean))
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

  // 3. Post comment with contributor fix instructions if enabled and applicable
  if (postComment) {
    if (fixInstructions && fixInstructions.trim()) {
      const commentLines = [
        "> [!TIP]",
        "> ### 💡 Instructions to Fix This Issue",
        "> Here are brief instructions to help anyone interested in resolving this issue:",
        "",
        fixInstructions.trim()
      ];

      if (createdBranchName) {
        commentLines.push(
          "",
          "> [!NOTE]",
          `> Development branch \`${createdBranchName}\` has been created for this issue.`
        );
      }

      const commentContent = commentLines.join("\n");

      console.log(`[GitHub] Posting contributor fix instructions comment to issue #${num}...`);
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
