import { Octokit } from "@octokit/rest";

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
 * Updates a GitHub issue with the enhanced markdown body, applies optional title changes,
 * adds labels, and posts contributor fix instructions as a comment if applicable.
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
 * @param {boolean} [params.options.postComment=true] - Whether to post comment if applicable
 * @param {boolean} [params.options.preserveOriginal=true] - Whether to include collapsible original text
 * @param {boolean} [params.options.addBadge=true] - Whether to prepend [!NOTE] header badge
 * @param {string[]} [params.options.addLabels=[]] - Labels to add to the issue
 * @param {boolean} [params.options.skipBodyUpdate=false] - Whether to skip rewriting issue body/title
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
    skipBodyUpdate = false
  } = options;

  const octokit = new Octokit({ auth: token });

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

  // Apply optional labels if configured
  if (Array.isArray(addLabels) && addLabels.length > 0) {
    try {
      console.log(`[GitHub] Adding configured label(s) to issue #${num}: ${addLabels.join(", ")}`);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: num,
        labels: addLabels
      });
      console.log(`[GitHub] Successfully added labels to issue #${num}.`);
    } catch (lblErr) {
      console.warn(`[GitHub] Warning: Failed to apply labels to issue #${num}:`, lblErr.message);
    }
  }

  // Post comment with contributor fix instructions if enabled and applicable
  if (postComment) {
    if (fixInstructions && fixInstructions.trim()) {
      const commentLines = [
        "> [!TIP]",
        "> ### 💡 Instructions to Fix This Issue",
        "> Here are brief instructions to help anyone interested in resolving this issue:",
        "",
        fixInstructions.trim()
      ];

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

