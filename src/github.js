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
 * Updates a GitHub issue with the enhanced markdown body and creates a summary comment.
 * @param {object} params
 * @param {string} params.token - GitHub Token
 * @param {string} params.repository - "owner/repo" string
 * @param {number|string} params.issueNumber - GitHub issue number
 * @param {string} params.originalTitle - Original issue title
 * @param {string} params.originalBody - Original issue body
 * @param {string} params.enhancedBody - Gemini-enhanced markdown
 * @param {string} params.modelUsed - Model name used
 */
export async function updateGitHubIssue({
  token,
  repository,
  issueNumber,
  originalTitle,
  originalBody,
  enhancedBody,
  modelUsed
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

  const octokit = new Octokit({ auth: token });

  // Construct new body with tracking marker, blue alert note badge, and collapsible original submission
  const updatedIssueBody = [
    ENHANCED_MARKER,
    "> [!NOTE]",
    "> **Issue Formatted with Gemini Flash Lite**",
    "> This issue description was automatically reworded and structured for technical clarity without adding any new content or assumptions. Original raw submission is preserved below.",
    "",
    enhancedBody,
    "",
    "---",
    "<details>",
    "<summary>🔍 <b>Original Submission</b> (Click to expand)</summary>",
    "",
    originalBody ? originalBody : "*(Original body was empty)*",
    "",
    "</details>"
  ].join("\n");

  console.log(`[GitHub] Updating issue #${num} in ${owner}/${repo}...`);
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: num,
    body: updatedIssueBody
  });
  console.log(`[GitHub] Successfully updated issue #${num} description.`);

  // Post a summary comment on the issue with blue alert style
  const commentContent = [
    "> [!NOTE]",
    "> ### 🤖 Issue Formatted with Gemini Flash Lite",
    "> This issue description was automatically reworded and structured for clarity and readability without adding any new content or assumptions.",
    "",
    `- **Model Used:** \`${modelUsed}\``,
    "- **Changes:** Reworded and organized into standard GitHub issue format.",
    "- **Original Content:** Preserved and accessible via the collapsible dropdown in the description above."
  ].join("\n");

  console.log(`[GitHub] Posting summary comment to issue #${num}...`);
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: num,
    body: commentContent
  });
  console.log(`[GitHub] Successfully posted comment to issue #${num}.`);
}
