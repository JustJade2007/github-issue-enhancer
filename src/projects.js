import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";

/**
 * Detects the type of GitHub authentication token.
 * @param {string} token
 * @returns {'none'|'actions_runner_token'|'fine_grained_pat'|'classic_pat'|'custom'}
 */
export function detectTokenKind(token) {
  if (!token) return "none";
  if (token.startsWith("ghs_")) return "actions_runner_token";
  if (token.startsWith("github_pat_")) return "fine_grained_pat";
  if (token.startsWith("ghp_")) return "classic_pat";
  return "custom";
}

/**
 * Returns a human-friendly description of the detected token type.
 * @param {string} token
 * @returns {string}
 */
export function describeTokenKind(token) {
  const kind = detectTokenKind(token);
  switch (kind) {
    case "none":
      return "None (empty)";
    case "actions_runner_token":
      return "GitHub Actions default runner token (GITHUB_TOKEN / ghs_...)";
    case "fine_grained_pat":
      return "Fine-Grained Personal Access Token (github_pat_...)";
    case "classic_pat":
      return "Classic Personal Access Token (ghp_...)";
    default:
      return `Custom Token (length: ${token.length})`;
  }
}

/**
 * Parses GitHub Project URL or parameters into owner type, owner name, and project number.
 * Supported formats:
 * - https://github.com/orgs/{org}/projects/{number}
 * - https://github.com/users/{user}/projects/{number}
 * - {owner}/{number}
 * @param {string} [projectUrl]
 * @param {string|number} [projectNumber]
 * @param {string} [projectOwner]
 * @returns {{ ownerType: 'org'|'user'|'unknown', owner: string, number: number } | null}
 */
export function parseProjectIdentifier(projectUrl, projectNumber, projectOwner) {
  if (projectUrl && typeof projectUrl === "string") {
    const trimmed = projectUrl.trim();
    const orgMatch = trimmed.match(/github\.com\/orgs\/([^/]+)\/projects\/(\d+)/i);
    if (orgMatch) {
      return { ownerType: "org", owner: orgMatch[1], number: parseInt(orgMatch[2], 10) };
    }

    const userMatch = trimmed.match(/github\.com\/users\/([^/]+)\/projects\/(\d+)/i);
    if (userMatch) {
      return { ownerType: "user", owner: userMatch[1], number: parseInt(userMatch[2], 10) };
    }

    const shortMatch = trimmed.match(/^([^/]+)\/(\d+)$/);
    if (shortMatch) {
      return { ownerType: "unknown", owner: shortMatch[1], number: parseInt(shortMatch[2], 10) };
    }
  }

  if (projectNumber && projectOwner) {
    const num = parseInt(projectNumber, 10);
    if (!isNaN(num)) {
      return { ownerType: "unknown", owner: String(projectOwner).trim(), number: num };
    }
  }

  return null;
}

/**
 * Fetches Project V2 metadata, including project ID and custom fields.
 * @param {InstanceType<typeof Octokit>} octokit
 * @param {{ ownerType: string, owner: string, number: number }} projectInfo
 * @returns {Promise<{ id: string, title: string, fields: Array<{ id: string, name: string, dataType: string, options?: Array<{ id: string, name: string }> }> }>}
 */
export async function getProjectV2Details(octokit, { ownerType, owner, number }) {
  const queryOrg = `
    query getOrgProject($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const queryUser = `
    query getUserProject($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  let project = null;

  if (ownerType === "org") {
    const res = await octokit.graphql(queryOrg, { owner, number });
    project = res?.organization?.projectV2;
  } else if (ownerType === "user") {
    const res = await octokit.graphql(queryUser, { owner, number });
    project = res?.user?.projectV2;
  } else {
    // Try organization first, fall back to user
    try {
      const res = await octokit.graphql(queryOrg, { owner, number });
      project = res?.organization?.projectV2;
    } catch {
      const res = await octokit.graphql(queryUser, { owner, number });
      project = res?.user?.projectV2;
    }
  }

  if (!project) {
    throw new Error(`Project #${number} not found for owner "${owner}". Verify project number and permissions.`);
  }

  const fields = (project.fields?.nodes || []).filter(Boolean);
  return {
    id: project.id,
    title: project.title,
    fields
  };
}

/**
 * Finds the closest matching single-select option for a given target value.
 * @param {Array<{ id: string, name: string }>} options
 * @param {string} targetValue
 * @returns {string|null} Option ID or null
 */
export function matchSelectOption(options, targetValue) {
  if (!Array.isArray(options) || !targetValue) return null;
  const target = targetValue.trim().toLowerCase();

  // 1. Exact match (case-insensitive)
  const exact = options.find((o) => o.name.toLowerCase() === target);
  if (exact) return exact.id;

  // 2. Starts with / prefix match (e.g. "P0" in "P0 - Critical" or "Backlog" in "Backlog / Inbox")
  const prefixMatch = options.find((o) => {
    const optLower = o.name.toLowerCase();
    return optLower.startsWith(target) || target.startsWith(optLower);
  });
  if (prefixMatch) return prefixMatch.id;

  // 3. Status alias groups
  const statusGroups = [
    ["backlog", "inbox", "to do", "todo", "new", "triage", "open"],
    ["ready", "ready for dev", "next up"],
    ["in progress", "active", "doing", "started"],
    ["in review", "review", "pr", "testing"],
    ["done", "closed", "complete", "finished"]
  ];

  const matchedStatusGroup = statusGroups.find((grp) =>
    grp.some((term) => target === term || target.includes(term) || term.includes(target))
  );
  if (matchedStatusGroup) {
    const statusMatch = options.find((o) => {
      const optLower = o.name.toLowerCase();
      return matchedStatusGroup.some(
        (term) => optLower === term || optLower.includes(term) || term.includes(optLower)
      );
    });
    if (statusMatch) return statusMatch.id;
  }

  // 4. Bidirectional priority alias groups
  const priorityGroups = [
    ["p0", "critical", "urgent", "highest", "blocker"],
    ["p1", "high", "important"],
    ["p2", "medium", "normal", "moderate"],
    ["p3", "low", "lowest", "minor"]
  ];

  const matchedPriGroup = priorityGroups.find((grp) =>
    grp.some((term) => target.includes(term) || term.includes(target))
  );
  if (matchedPriGroup) {
    const groupMatch = options.find((o) => {
      const optLower = o.name.toLowerCase();
      return matchedPriGroup.some((term) => optLower.includes(term) || term.includes(optLower));
    });
    if (groupMatch) return groupMatch.id;
  }

  // 5. Size alias groups
  const sizeGroups = [
    ["xs", "tiny", "trivial", "extra small"],
    ["s", "small"],
    ["m", "medium", "standard"],
    ["l", "large"],
    ["xl", "extra large", "epic"]
  ];

  const matchedSizeGroup = sizeGroups.find((grp) =>
    grp.some((term) => target === term || target.startsWith(term))
  );
  if (matchedSizeGroup) {
    const sizeMatch = options.find((o) => {
      const optLower = o.name.toLowerCase();
      return matchedSizeGroup.some((term) => optLower === term || optLower.startsWith(term));
    });
    if (sizeMatch) return sizeMatch.id;
  }

  return null;
}

/**
 * Finds a field in the project by name, checking exact match first, then alternative aliases.
 * @param {Array<{ id: string, name: string, dataType: string, options?: Array<{ id: string, name: string }> }>} fields
 * @param {string} targetName
 * @param {string[]} [aliases=[]]
 * @returns {object|null}
 */
export function findProjectField(fields, targetName, aliases = []) {
  if (!Array.isArray(fields) || !targetName) return null;
  const targetLower = targetName.trim().toLowerCase();

  // Exact match
  const exact = fields.find((f) => f.name.toLowerCase() === targetLower);
  if (exact) return exact;

  // Check aliases
  for (const alias of aliases) {
    const aLower = alias.toLowerCase();
    const aliasMatch = fields.find((f) => f.name.toLowerCase() === aLower);
    if (aliasMatch) return aliasMatch;
  }

  // Loose includes match
  return fields.find((f) => f.name.toLowerCase().includes(targetLower)) || null;
}

/**
 * Assigns a GitHub issue to a Project V2 and sets status, priority & size attributes.
 * @param {object} params
 * @param {string} params.token - GitHub / Project Personal Access Token
 * @param {string} params.issueNodeId - GraphQL node ID of the issue
 * @param {string} [params.repository] - Owner/repo string (e.g. 'JustJade2007/issue-enhancer-test')
 * @param {string|number} [params.issueNumber] - Issue number
 * @param {string} [params.projectUrl] - URL of the GitHub project
 * @param {string|number} [params.projectNumber] - Project number
 * @param {string} [params.projectOwner] - Project owner (org or user)
 * @param {string} [params.status="Backlog"] - Initial project status (e.g. 'Backlog', 'Todo')
 * @param {string} [params.statusFieldName="Status"] - Custom field name for status
 * @param {string} [params.priority] - Estimated priority (P0, P1, P2, P3, etc.)
 * @param {string} [params.size] - Estimated size (XS, S, M, L, XL, etc.)
 * @param {string} [params.priorityFieldName="Priority"] - Custom field name for priority
 * @param {string} [params.sizeFieldName="Size"] - Custom field name for size
 * @returns {Promise<{ itemId: string } | null>}
 */
export async function assignIssueToProject({
  token,
  issueNodeId,
  repository,
  issueNumber,
  projectUrl,
  projectNumber,
  projectOwner,
  status = "Backlog",
  statusFieldName = "Status",
  priority,
  size,
  priorityFieldName = "Priority",
  sizeFieldName = "Size"
}) {
  if (!token) {
    console.warn("[Project] Warning: No token provided for project assignment. Skipping.");
    return null;
  }

  const projectIdent = parseProjectIdentifier(projectUrl, projectNumber, projectOwner);
  if (!projectIdent) {
    console.warn("[Project] Warning: Invalid project configuration. Provide a valid project URL or owner/number.");
    return null;
  }

  const tokenKind = detectTokenKind(token);
  console.log(`[Project] Authentication token detected: ${describeTokenKind(token)}.`);

  if (projectIdent.ownerType === "user" && tokenKind === "actions_runner_token") {
    console.warn(
      `[Project] Warning: Target project "${projectIdent.owner}/${projectIdent.number}" is a User-level Project. Default GitHub Actions runner token (GITHUB_TOKEN) does not have permission to modify user-owned projects. Ensure secret 'PROJECT_TOKEN' is set in repository settings with a Classic PAT (project scope).`
    );
  }

  try {
    const octokit = new Octokit({ auth: token });
    console.log(`[Project] Locating GitHub Project #${projectIdent.number} (${projectIdent.owner})...`);
    const projectDetails = await getProjectV2Details(octokit, projectIdent);
    console.log(`[Project] Found project "${projectDetails.title}" (ID: ${projectDetails.id}).`);

    // Log available project fields for easy troubleshooting
    const availableFieldSummaries = projectDetails.fields.map((f) => {
      if (f.dataType === "SINGLE_SELECT" && f.options) {
        return `${f.name} [${f.dataType}: ${f.options.map((o) => o.name).join(", ")}]`;
      }
      return `${f.name} [${f.dataType}]`;
    });
    console.log(`[Project] Available project fields: ${availableFieldSummaries.join(" | ")}`);

    let itemId = null;

    // Strategy 1: Attempt via GitHub CLI ('gh project item-add') if repository and issueNumber are available
    if (repository && issueNumber) {
      try {
        const issueUrl = `https://github.com/${repository}/issues/${issueNumber}`;
        console.log(`[Project] Attempting to add issue to project via GitHub CLI ('gh project item-add')...`);
        const stdout = execSync(
          `gh project item-add ${projectIdent.number} --owner "${projectIdent.owner}" --url "${issueUrl}" --format json`,
          {
            encoding: "utf8",
            env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
            stdio: ["pipe", "pipe", "pipe"]
          }
        );
        const parsed = JSON.parse(stdout);
        if (parsed?.id) {
          itemId = parsed.id;
          console.log(`[Project] Successfully added issue to project via GitHub CLI (Item ID: ${itemId}).`);
        }
      } catch (cliErr) {
        const cliMsg = (cliErr.stderr || cliErr.message || "").trim();
        console.log(`[Project] Note: GitHub CLI item-add returned: ${cliMsg || "error"}. Attempting GraphQL mutation...`);
      }
    }

    // Strategy 2: Direct GraphQL mutation addProjectV2ItemById
    if (!itemId) {
      const addItemMutation = `
        mutation addItem($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item {
              id
            }
          }
        }
      `;

      console.log(`[Project] Adding issue to project "${projectDetails.title}" via GraphQL mutation...`);
      const addResult = await octokit.graphql(addItemMutation, {
        projectId: projectDetails.id,
        contentId: issueNodeId
      });

      itemId = addResult?.addProjectV2ItemById?.item?.id;
    }

    if (!itemId) {
      console.warn("[Project] Warning: Failed to obtain project item ID after adding issue.");
      return null;
    }
    console.log(`[Project] Successfully added issue to project (Item ID: ${itemId}).`);

    const updateFieldMutation = `
      mutation updateField($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item {
            id
          }
        }
      }
    `;

    // Helper to safely execute field updates
    const setFieldValue = async (fieldId, value) => {
      return octokit.graphql(updateFieldMutation, {
        input: {
          projectId: projectDetails.id,
          itemId,
          fieldId,
          value
        }
      });
    };

    // 1. Update Status (default: "Backlog")
    const targetStatus = status || "Backlog";
    const statusField = findProjectField(projectDetails.fields, statusFieldName, ["Status", "State"]);
    if (statusField) {
      if (statusField.dataType === "SINGLE_SELECT" && statusField.options) {
        const optionId = matchSelectOption(statusField.options, targetStatus);
        if (optionId) {
          const matchedOpt = statusField.options.find((o) => o.id === optionId);
          await setFieldValue(statusField.id, { singleSelectOptionId: optionId });
          console.log(`[Project] Set ${statusField.name} to "${matchedOpt?.name || targetStatus}".`);
        } else {
          console.log(
            `[Project] Status "${targetStatus}" did not match available options for ${statusField.name} (${statusField.options.map((o) => o.name).join(", ")}).`
          );
        }
      } else if (statusField.dataType === "TEXT") {
        await setFieldValue(statusField.id, { text: targetStatus });
        console.log(`[Project] Set ${statusField.name} text to "${targetStatus}".`);
      }
    } else {
      console.log(`[Project] Field "${statusFieldName}" not found on project. Skipping status attribute.`);
    }

    // 2. Update Priority (if estimated or specified)
    if (priority) {
      const pField = findProjectField(projectDetails.fields, priorityFieldName, ["Priority", "Severity", "Urgency"]);
      if (pField) {
        if (pField.dataType === "SINGLE_SELECT" && pField.options) {
          const optionId = matchSelectOption(pField.options, priority);
          if (optionId) {
            const matchedOpt = pField.options.find((o) => o.id === optionId);
            await setFieldValue(pField.id, { singleSelectOptionId: optionId });
            console.log(`[Project] Set ${pField.name} to "${matchedOpt?.name || priority}".`);
          } else {
            console.log(
              `[Project] Option "${priority}" did not match available ${pField.name} options (${pField.options.map((o) => o.name).join(", ")}).`
            );
          }
        } else if (pField.dataType === "TEXT") {
          await setFieldValue(pField.id, { text: priority });
          console.log(`[Project] Set ${pField.name} text to "${priority}".`);
        }
      } else {
        console.log(`[Project] Field "${priorityFieldName}" not found on project. Skipping priority attribute.`);
      }
    } else {
      console.log(`[Project] No estimated priority provided. Skipping priority attribute.`);
    }

    // 3. Update Size (if estimated or specified)
    if (size) {
      const sField = findProjectField(projectDetails.fields, sizeFieldName, ["Size", "Estimate", "Complexity"]);
      if (sField) {
        if (sField.dataType === "SINGLE_SELECT" && sField.options) {
          const optionId = matchSelectOption(sField.options, size);
          if (optionId) {
            const matchedOpt = sField.options.find((o) => o.id === optionId);
            await setFieldValue(sField.id, { singleSelectOptionId: optionId });
            console.log(`[Project] Set ${sField.name} to "${matchedOpt?.name || size}".`);
          } else {
            console.log(
              `[Project] Option "${size}" did not match available ${sField.name} options (${sField.options.map((o) => o.name).join(", ")}).`
            );
          }
        } else if (sField.dataType === "TEXT") {
          await setFieldValue(sField.id, { text: size });
          console.log(`[Project] Set ${sField.name} text to "${size}".`);
        }
      } else {
        console.log(`[Project] Field "${sizeFieldName}" not found on project. Skipping size attribute.`);
      }
    } else {
      console.log(`[Project] No estimated size provided. Skipping size attribute.`);
    }

    return { itemId };
  } catch (err) {
    if (err.message && err.message.includes("Resource not accessible by integration")) {
      if (tokenKind === "fine_grained_pat") {
        console.warn(
          `[Project] Warning: A Fine-Grained Personal Access Token (github_pat_...) was provided. GitHub currently does NOT support Fine-Grained PATs for user-owned Projects (v2) like "${projectIdent.owner}/${projectIdent.number}". To fix this, create a Classic Personal Access Token (ghp_...) with the 'project' scope, save it as secret 'PROJECT_TOKEN', and set 'project-token: \${{ secrets.PROJECT_TOKEN }}'.`
        );
      } else if (tokenKind === "actions_runner_token") {
        console.warn(
          `[Project] Warning: GitHub Actions default GITHUB_TOKEN cannot write to User-level Projects (${projectIdent.owner}). To add issues to user projects, create a Classic Personal Access Token (PAT) with 'project' scope, add it as repository secret 'PROJECT_TOKEN' in repository "${repository || 'target repository'}", and set 'project-token: \${{ secrets.PROJECT_TOKEN }}' in the workflow.`
        );
      } else {
        console.warn(
          `[Project] Warning: Permission denied ("Resource not accessible by integration") for user project "${projectIdent.owner}/${projectIdent.number}". Verify that the token has the 'project' scope (and 'repo' scope) checked in GitHub Developer Settings.`
        );
      }
    } else {
      console.warn(`[Project] Warning: Failed to assign issue to project:`, err.message);
    }
    return null;
  }
}
