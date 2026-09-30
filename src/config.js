import fs from "fs";

export const DEFAULT_CONFIG = {
  geminiModel: "gemini-3.1-flash-lite",
  temperature: 0.2,
  customInstruction: "",
  postComment: true,
  preserveOriginal: true,
  addBadge: true,
  enhanceTitle: false,
  addLabels: [],
  ignoreAuthors: [],
  ignoreLabels: [],
  // Triage & Project Settings
  projectUrl: "",
  projectToken: "",
  projectNumber: null,
  projectOwner: "",
  priorityField: "Priority",
  sizeField: "Size",
  statusField: "Status",
  initialStatus: "Backlog",
  autoAssign: false,
  assignees: [],
  assignmentRules: [],
  milestone: "",
  createBranch: false,
  branchPrefix: "issue-",
  linkRelated: true,
  linkDependencies: true,
  linkSubIssues: true
};

/**
 * Parses a string or boolean into a boolean value.
 * @param {string|boolean|undefined} val
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function parseBoolean(val, defaultValue = true) {
  if (val === undefined || val === null || val === "") return defaultValue;
  if (typeof val === "boolean") return val;
  const str = String(val).trim().toLowerCase();
  if (str === "false" || str === "0" || str === "no" || str === "off") return false;
  if (str === "true" || str === "1" || str === "yes" || str === "on") return true;
  return defaultValue;
}

/**
 * Parses a comma-separated string or array into a clean array of strings.
 * @param {string|string[]|undefined} val
 * @returns {string[]}
 */
export function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Loads and merges configuration from defaults, optional config file,
 * environment variables, and CLI overrides.
 * @param {object} overrides
 * @returns {typeof DEFAULT_CONFIG}
 */
export function loadConfig(overrides = {}) {
  let fileConfig = {};
  const configPaths = [
    ".github/issue-enhancer.json",
    ".github/issue-enhancer-config.json",
    "issue-enhancer.json"
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        console.log(`[Config] Loaded settings from ${configPath}`);
        break;
      } catch (err) {
        console.warn(`[Config] Warning: Failed to parse ${configPath}:`, err.message);
      }
    }
  }

  const env = process.env;

  const config = {
    geminiModel:
      overrides.model ||
      env.GEMINI_MODEL ||
      fileConfig.geminiModel ||
      DEFAULT_CONFIG.geminiModel,
    temperature:
      overrides.temperature !== undefined
        ? parseFloat(overrides.temperature)
        : env.TEMPERATURE !== undefined && env.TEMPERATURE !== ""
        ? parseFloat(env.TEMPERATURE)
        : fileConfig.temperature !== undefined
        ? parseFloat(fileConfig.temperature)
        : DEFAULT_CONFIG.temperature,
    customInstruction:
      overrides.customInstruction !== undefined
        ? overrides.customInstruction
        : env.CUSTOM_INSTRUCTION !== undefined
        ? env.CUSTOM_INSTRUCTION
        : fileConfig.customInstruction || DEFAULT_CONFIG.customInstruction,
    postComment:
      overrides.postComment !== undefined
        ? parseBoolean(overrides.postComment, DEFAULT_CONFIG.postComment)
        : env.POST_COMMENT !== undefined
        ? parseBoolean(env.POST_COMMENT, DEFAULT_CONFIG.postComment)
        : fileConfig.postComment !== undefined
        ? parseBoolean(fileConfig.postComment, DEFAULT_CONFIG.postComment)
        : DEFAULT_CONFIG.postComment,
    preserveOriginal:
      overrides.preserveOriginal !== undefined
        ? parseBoolean(overrides.preserveOriginal, DEFAULT_CONFIG.preserveOriginal)
        : env.PRESERVE_ORIGINAL !== undefined
        ? parseBoolean(env.PRESERVE_ORIGINAL, DEFAULT_CONFIG.preserveOriginal)
        : fileConfig.preserveOriginal !== undefined
        ? parseBoolean(fileConfig.preserveOriginal, DEFAULT_CONFIG.preserveOriginal)
        : DEFAULT_CONFIG.preserveOriginal,
    addBadge:
      overrides.addBadge !== undefined
        ? parseBoolean(overrides.addBadge, DEFAULT_CONFIG.addBadge)
        : env.ADD_BADGE !== undefined
        ? parseBoolean(env.ADD_BADGE, DEFAULT_CONFIG.addBadge)
        : fileConfig.addBadge !== undefined
        ? parseBoolean(fileConfig.addBadge, DEFAULT_CONFIG.addBadge)
        : DEFAULT_CONFIG.addBadge,
    enhanceTitle:
      overrides.enhanceTitle !== undefined
        ? parseBoolean(overrides.enhanceTitle, DEFAULT_CONFIG.enhanceTitle)
        : env.ENHANCE_TITLE !== undefined
        ? parseBoolean(env.ENHANCE_TITLE, DEFAULT_CONFIG.enhanceTitle)
        : fileConfig.enhanceTitle !== undefined
        ? parseBoolean(fileConfig.enhanceTitle, DEFAULT_CONFIG.enhanceTitle)
        : DEFAULT_CONFIG.enhanceTitle,
    addLabels:
      overrides.addLabels !== undefined
        ? parseList(overrides.addLabels)
        : env.ADD_LABELS !== undefined
        ? parseList(env.ADD_LABELS)
        : fileConfig.addLabels !== undefined
        ? parseList(fileConfig.addLabels)
        : DEFAULT_CONFIG.addLabels,
    ignoreAuthors:
      overrides.ignoreAuthors !== undefined
        ? parseList(overrides.ignoreAuthors)
        : env.IGNORE_AUTHORS !== undefined
        ? parseList(env.IGNORE_AUTHORS)
        : fileConfig.ignoreAuthors !== undefined
        ? parseList(fileConfig.ignoreAuthors)
        : DEFAULT_CONFIG.ignoreAuthors,
    ignoreLabels:
      overrides.ignoreLabels !== undefined
        ? parseList(overrides.ignoreLabels)
        : env.IGNORE_LABELS !== undefined
        ? parseList(env.IGNORE_LABELS)
        : fileConfig.ignoreLabels !== undefined
        ? parseList(fileConfig.ignoreLabels)
        : DEFAULT_CONFIG.ignoreLabels,
    // GitHub Projects v2
    projectUrl:
      overrides.projectUrl ||
      env.PROJECT_URL ||
      fileConfig.project?.url ||
      fileConfig.projectUrl ||
      DEFAULT_CONFIG.projectUrl,
    projectToken:
      overrides.projectToken ||
      env.PROJECT_TOKEN ||
      env.GH_PAT ||
      env.PAT_TOKEN ||
      fileConfig.project?.token ||
      env.GITHUB_TOKEN ||
      env.GH_TOKEN ||
      DEFAULT_CONFIG.projectToken,
    projectNumber:
      overrides.projectNumber !== undefined
        ? overrides.projectNumber
        : env.PROJECT_NUMBER !== undefined
        ? env.PROJECT_NUMBER
        : fileConfig.project?.number || DEFAULT_CONFIG.projectNumber,
    projectOwner:
      overrides.projectOwner ||
      env.PROJECT_OWNER ||
      fileConfig.project?.owner ||
      DEFAULT_CONFIG.projectOwner,
    priorityField:
      overrides.priorityField ||
      env.PROJECT_PRIORITY_FIELD ||
      fileConfig.project?.priorityField ||
      DEFAULT_CONFIG.priorityField,
    sizeField:
      overrides.sizeField ||
      env.PROJECT_SIZE_FIELD ||
      fileConfig.project?.sizeField ||
      DEFAULT_CONFIG.sizeField,
    statusField:
      overrides.statusField ||
      env.PROJECT_STATUS_FIELD ||
      env.STATUS_FIELD ||
      fileConfig.project?.statusField ||
      DEFAULT_CONFIG.statusField,
    initialStatus:
      overrides.initialStatus !== undefined
        ? overrides.initialStatus
        : env.PROJECT_INITIAL_STATUS !== undefined
        ? env.PROJECT_INITIAL_STATUS
        : env.INITIAL_STATUS !== undefined
        ? env.INITIAL_STATUS
        : fileConfig.project?.initialStatus !== undefined
        ? fileConfig.project.initialStatus
        : DEFAULT_CONFIG.initialStatus,
    // Automated Triage & Assignment
    autoAssign:
      overrides.autoAssign !== undefined
        ? parseBoolean(overrides.autoAssign, DEFAULT_CONFIG.autoAssign)
        : env.AUTO_ASSIGN !== undefined
        ? parseBoolean(env.AUTO_ASSIGN, DEFAULT_CONFIG.autoAssign)
        : fileConfig.triage?.autoAssign !== undefined
        ? parseBoolean(fileConfig.triage.autoAssign, DEFAULT_CONFIG.autoAssign)
        : DEFAULT_CONFIG.autoAssign,
    assignees:
      overrides.assignees !== undefined
        ? parseList(overrides.assignees)
        : env.ASSIGNEES !== undefined
        ? parseList(env.ASSIGNEES)
        : fileConfig.triage?.assignees !== undefined
        ? parseList(fileConfig.triage.assignees)
        : DEFAULT_CONFIG.assignees,
    assignmentRules:
      fileConfig.triage?.assignmentRules ||
      fileConfig.assignmentRules ||
      DEFAULT_CONFIG.assignmentRules,
    // Milestones
    milestone:
      overrides.milestone !== undefined
        ? String(overrides.milestone).trim()
        : env.MILESTONE !== undefined
        ? String(env.MILESTONE).trim()
        : fileConfig.triage?.milestone !== undefined
        ? String(fileConfig.triage.milestone).trim()
        : DEFAULT_CONFIG.milestone,
    // Branch creation
    createBranch:
      overrides.createBranch !== undefined
        ? parseBoolean(overrides.createBranch, DEFAULT_CONFIG.createBranch)
        : env.CREATE_BRANCH !== undefined
        ? parseBoolean(env.CREATE_BRANCH, DEFAULT_CONFIG.createBranch)
        : fileConfig.triage?.createBranch !== undefined
        ? parseBoolean(fileConfig.triage.createBranch, DEFAULT_CONFIG.createBranch)
        : DEFAULT_CONFIG.createBranch,
    branchPrefix:
      overrides.branchPrefix ||
      env.BRANCH_PREFIX ||
      fileConfig.triage?.branchPrefix ||
      DEFAULT_CONFIG.branchPrefix,
    linkRelated:
      overrides.linkRelated !== undefined
        ? parseBoolean(overrides.linkRelated, DEFAULT_CONFIG.linkRelated)
        : env.LINK_RELATED !== undefined
        ? parseBoolean(env.LINK_RELATED, DEFAULT_CONFIG.linkRelated)
        : fileConfig.triage?.linkRelated !== undefined
        ? parseBoolean(fileConfig.triage.linkRelated, DEFAULT_CONFIG.linkRelated)
        : DEFAULT_CONFIG.linkRelated,
    linkDependencies:
      overrides.linkDependencies !== undefined
        ? parseBoolean(overrides.linkDependencies, DEFAULT_CONFIG.linkDependencies)
        : env.LINK_DEPENDENCIES !== undefined
        ? parseBoolean(env.LINK_DEPENDENCIES, DEFAULT_CONFIG.linkDependencies)
        : fileConfig.triage?.linkDependencies !== undefined
        ? parseBoolean(fileConfig.triage.linkDependencies, DEFAULT_CONFIG.linkDependencies)
        : DEFAULT_CONFIG.linkDependencies,
    linkSubIssues:
      overrides.linkSubIssues !== undefined
        ? parseBoolean(overrides.linkSubIssues, DEFAULT_CONFIG.linkSubIssues)
        : env.LINK_SUB_ISSUES !== undefined
        ? parseBoolean(env.LINK_SUB_ISSUES, DEFAULT_CONFIG.linkSubIssues)
        : fileConfig.triage?.linkSubIssues !== undefined
        ? parseBoolean(fileConfig.triage.linkSubIssues, DEFAULT_CONFIG.linkSubIssues)
        : DEFAULT_CONFIG.linkSubIssues
  };

  // Ensure temperature stays in valid range
  if (isNaN(config.temperature) || config.temperature < 0 || config.temperature > 1) {
    config.temperature = DEFAULT_CONFIG.temperature;
  }

  return config;
}
