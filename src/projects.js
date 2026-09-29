import { Octokit } from "@octokit/rest";

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

  // 1. Exact match
  const exact = options.find((o) => o.name.toLowerCase() === target);
  if (exact) return exact.id;

  // 2. Starts with / prefix match (e.g. "P0" in "P0 - Critical")
  const prefixMatch = options.find((o) => {
    const optLower = o.name.toLowerCase();
    return optLower.startsWith(target) || target.startsWith(optLower);
  });
  if (prefixMatch) return prefixMatch.id;

  // 3. Bidirectional priority alias groups
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

  // 4. Size alias groups
  const sizeGroups = [
    ["xs", "tiny", "trivial"],
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
 * Assigns a GitHub issue to a Project V2 and sets priority & size attributes.
 * @param {object} params
 * @param {string} params.token - GitHub / Project Personal Access Token
 * @param {string} params.issueNodeId - GraphQL node ID of the issue
 * @param {string} [params.projectUrl] - URL of the GitHub project
 * @param {string|number} [params.projectNumber] - Project number
 * @param {string} [params.projectOwner] - Project owner (org or user)
 * @param {string} [params.priority] - Estimated priority (P0, P1, P2, P3, etc.)
 * @param {string} [params.size] - Estimated size (XS, S, M, L, XL, etc.)
 * @param {string} [params.priorityFieldName="Priority"] - Custom field name for priority
 * @param {string} [params.sizeFieldName="Size"] - Custom field name for size
 * @returns {Promise<{ itemId: string } | null>}
 */
export async function assignIssueToProject({
  token,
  issueNodeId,
  projectUrl,
  projectNumber,
  projectOwner,
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

  try {
    const octokit = new Octokit({ auth: token });
    console.log(`[Project] Locating GitHub Project #${projectIdent.number} (${projectIdent.owner})...`);
    const projectDetails = await getProjectV2Details(octokit, projectIdent);
    console.log(`[Project] Found project "${projectDetails.title}" (ID: ${projectDetails.id}).`);

    // Add item to project
    const addItemMutation = `
      mutation addItem($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item {
            id
          }
        }
      }
    `;

    console.log(`[Project] Adding issue to project "${projectDetails.title}"...`);
    const addResult = await octokit.graphql(addItemMutation, {
      projectId: projectDetails.id,
      contentId: issueNodeId
    });

    const itemId = addResult?.addProjectV2ItemById?.item?.id;
    if (!itemId) {
      console.warn("[Project] Warning: Failed to obtain project item ID after adding issue.");
      return null;
    }
    console.log(`[Project] Successfully added issue to project (Item ID: ${itemId}).`);

    const updateFieldMutation = `
      mutation updateField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValueInput!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    // Update Priority if specified
    if (priority) {
      const pField = projectDetails.fields.find(
        (f) => f.name.toLowerCase() === priorityFieldName.toLowerCase()
      );
      if (pField) {
        if (pField.dataType === "SINGLE_SELECT" && pField.options) {
          const optionId = matchSelectOption(pField.options, priority);
          if (optionId) {
            await octokit.graphql(updateFieldMutation, {
              projectId: projectDetails.id,
              itemId,
              fieldId: pField.id,
              value: { singleSelectOptionId: optionId }
            });
            console.log(`[Project] Set ${pField.name} to "${priority}".`);
          } else {
            console.log(`[Project] Option "${priority}" did not match available ${pField.name} options.`);
          }
        } else if (pField.dataType === "TEXT") {
          await octokit.graphql(updateFieldMutation, {
            projectId: projectDetails.id,
            itemId,
            fieldId: pField.id,
            value: { text: priority }
          });
          console.log(`[Project] Set ${pField.name} text to "${priority}".`);
        }
      } else {
        console.log(`[Project] Field "${priorityFieldName}" not found on project. Skipping priority attribute.`);
      }
    }

    // Update Size if specified
    if (size) {
      const sField = projectDetails.fields.find(
        (f) => f.name.toLowerCase() === sizeFieldName.toLowerCase()
      );
      if (sField) {
        if (sField.dataType === "SINGLE_SELECT" && sField.options) {
          const optionId = matchSelectOption(sField.options, size);
          if (optionId) {
            await octokit.graphql(updateFieldMutation, {
              projectId: projectDetails.id,
              itemId,
              fieldId: sField.id,
              value: { singleSelectOptionId: optionId }
            });
            console.log(`[Project] Set ${sField.name} to "${size}".`);
          } else {
            console.log(`[Project] Option "${size}" did not match available ${sField.name} options.`);
          }
        } else if (sField.dataType === "TEXT") {
          await octokit.graphql(updateFieldMutation, {
            projectId: projectDetails.id,
            itemId,
            fieldId: sField.id,
            value: { text: size }
          });
          console.log(`[Project] Set ${sField.name} text to "${size}".`);
        }
      } else {
        console.log(`[Project] Field "${sizeFieldName}" not found on project. Skipping size attribute.`);
      }
    }

    return { itemId };
  } catch (err) {
    if (err.message && err.message.includes("Resource not accessible by integration")) {
      console.warn(`[Project] Warning: GitHub Actions default GITHUB_TOKEN cannot write to User-level Projects (${projectIdent.owner}). To add issues to user projects, create a Personal Access Token (PAT) with 'project' scope, add it as repository secret 'PROJECT_TOKEN', and set 'project-token: \${{ secrets.PROJECT_TOKEN }}' in the workflow.`);
    } else {
      console.warn(`[Project] Warning: Failed to assign issue to project:`, err.message);
    }
    return null;
  }
}
