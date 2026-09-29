import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are an expert GitHub issue formatter, evaluator, and technical triage assistant.
Your task is fourfold:
1. Evaluate whether the original issue description is ALREADY thorough and well-explained on its own ('YES' or 'NO').
   Criteria: An issue is considered thorough ('YES') if it contains more than 2 well-written, descriptive paragraphs or has equivalent well-structured explanation (e.g., clear problem statement, steps to reproduce, or clear technical specifications) and does not need structural rewording or formatting. If the issue is brief, shorthand, fragmented, lacking clarity or structure, or has 2 or fewer brief paragraphs without clear organization, mark it as 'NO'.
2. Re-format and reword the issue title and description into a clean, professional, and well-structured GitHub issue format WITHOUT ADDING NEW CONTENT, ASSUMPTIONS, OR FABRICATIONS to the issue description.
3. If applicable, provide brief, actionable instructions/guidance for anyone who wants to fix or address the issue.
4. Perform automated triage classification based on the issue content:
   - Match and select the most relevant labels from the available repository labels provided.
   - Estimate the priority (P0: Blocker/Critical/Urgent, P1: High, P2: Medium/Normal, P3: Low/Minor).
   - Estimate the scope/size (XS: Tiny/Trivial, S: Small, M: Medium, L: Large, XL: Very Large/Epic).
   - If candidate milestones are provided, select the best matching milestone.

STRICT CONSTRAINTS FOR THE ISSUE BODY:
1. STRICTLY NO NEW CONTENT IN ISSUE BODY: Do NOT hallucinate, invent, or assume any new facts, symptoms, reproduction steps, technical solutions, error logs, environment details, or requirements that the author did not explicitly state or provide.
2. REWORD FOR CLARITY: Turn informal, rushed, shorthand, or fragmented sentences into articulate, grammatical, and professional technical English.
3. EXPAND STRUCTURALLY: Reorganize messy, brief, or unstructured thoughts into clean markdown sections (e.g., Summary / Overview, Details, Observed Context / Notes) without adding unmentioned information.
4. PRESERVE ORIGINAL ARTIFACTS: Preserve all code snippets, terminal commands, stack traces, URLs, file paths, versions, and usernames VERBATIM in appropriate markdown code blocks.

GUIDELINES FOR FIX INSTRUCTIONS:
1. APPLICABILITY: Only provide fix instructions if the issue represents an actionable bug, defect, feature request, or technical task where reasonable, practical guidance can be derived from the issue description.
2. WHEN NOT APPLICABLE: If the issue is a general question, open-ended discussion, announcement, duplicate, invalid/incomprehensible, or completely lacks sufficient technical context to give meaningful guidance, you MUST output strictly "NOT_APPLICABLE" under FIX_INSTRUCTIONS.
3. BRIEF & ACTIONABLE: When applicable, keep instructions concise (bulleted steps, typically 2-4 points). Focus on:
   - Probable area or component to inspect based on the context.
   - Key steps or considerations for a contributor to implement the fix.
   - How to test or verify the resolution.
4. TONE: Direct, helpful, and targeted at a developer or contributor wanting to resolve the issue.

TRIAGE CLASSIFICATION GUIDELINES:
- LABELS: Pick only labels that accurately describe the type, component, or status based on available labels.
- PRIORITY: Assign P0 for crashes/data loss/security, P1 for major broken functionality, P2 for normal bugs/features, P3 for typos/minor enhancements.
- SIZE: XS (1-line / simple fix), S (small self-contained fix), M (standard feature/bug fix), L (multi-component change), XL (large architectural refactor).`;

const DEFAULT_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview"
].filter(Boolean);

/**
 * Normalizes fix instructions text, returning null if not applicable or empty.
 * @param {string} text
 * @returns {string|null}
 */
export function normalizeFixInstructions(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const cleaned = trimmed.replace(/^[\s*_-]+|[\s*_-]+$/g, "");
  const lower = cleaned.toLowerCase();
  if (
    !lower ||
    lower === "not_applicable" ||
    lower === "not applicable" ||
    lower === "not applicable." ||
    lower === "n/a" ||
    lower === "none" ||
    lower === "none." ||
    lower.startsWith("not_applicable") ||
    lower.startsWith("not applicable")
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Parses Gemini response extracting thoroughness, enhanced title, enhanced body, fix instructions,
 * recommended labels, priority, size, and milestone.
 * @param {string} rawText
 * @param {boolean} enhanceTitle
 * @returns {{
 *   isThorough: boolean,
 *   enhancedTitle: string|null,
 *   enhancedBody: string,
 *   fixInstructions: string|null,
 *   recommendedLabels: string[],
 *   estimatedPriority: string|null,
 *   estimatedSize: string|null,
 *   recommendedMilestone: string|null
 * }}
 */
export function parseGeminiResponse(rawText, enhanceTitle = false) {
  let isThorough = false;
  let enhancedTitle = null;
  let enhancedBody = rawText;
  let fixInstructions = null;
  let recommendedLabels = [];
  let estimatedPriority = null;
  let estimatedSize = null;
  let recommendedMilestone = null;

  const thoroughMatch = rawText.match(/===IS_THOROUGH===\s*([\s\S]*?)(?====ENHANCED_TITLE===|===ENHANCED_BODY===|===FIX_INSTRUCTIONS===|===RECOMMENDED_LABELS===|===ESTIMATED_PRIORITY===|===ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  if (thoroughMatch && thoroughMatch[1].trim()) {
    isThorough = thoroughMatch[1].trim().toUpperCase().startsWith("YES");
  }

  const titleMatch = rawText.match(/===ENHANCED_TITLE===\s*([\s\S]*?)(?====ENHANCED_BODY===|===FIX_INSTRUCTIONS===|===RECOMMENDED_LABELS===|===ESTIMATED_PRIORITY===|===ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  const bodyMatch = rawText.match(/===ENHANCED_BODY===\s*([\s\S]*?)(?====FIX_INSTRUCTIONS===|===RECOMMENDED_LABELS===|===ESTIMATED_PRIORITY===|===ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  const fixMatch = rawText.match(/===FIX_INSTRUCTIONS===\s*([\s\S]*?)(?====RECOMMENDED_LABELS===|===ESTIMATED_PRIORITY===|===ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  const labelsMatch = rawText.match(/===RECOMMENDED_LABELS===\s*([\s\S]*?)(?====ESTIMATED_PRIORITY===|===ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  const priorityMatch = rawText.match(/===ESTIMATED_PRIORITY===\s*([\s\S]*?)(?====ESTIMATED_SIZE===|===RECOMMENDED_MILESTONE===|$)/i);
  const sizeMatch = rawText.match(/===ESTIMATED_SIZE===\s*([\s\S]*?)(?====RECOMMENDED_MILESTONE===|$)/i);
  const milestoneMatch = rawText.match(/===RECOMMENDED_MILESTONE===\s*([\s\S]*?)$/i);

  if (enhanceTitle && titleMatch && titleMatch[1].trim()) {
    enhancedTitle = titleMatch[1].trim();
  }

  if (bodyMatch && bodyMatch[1].trim()) {
    enhancedBody = bodyMatch[1].trim();
  } else if (!bodyMatch && (titleMatch || fixMatch)) {
    let cleaned = rawText;
    if (thoroughMatch) cleaned = cleaned.replace(thoroughMatch[0], "");
    if (titleMatch) cleaned = cleaned.replace(titleMatch[0], "");
    if (fixMatch) cleaned = cleaned.replace(fixMatch[0], "");
    if (labelsMatch) cleaned = cleaned.replace(labelsMatch[0], "");
    if (priorityMatch) cleaned = cleaned.replace(priorityMatch[0], "");
    if (sizeMatch) cleaned = cleaned.replace(sizeMatch[0], "");
    if (milestoneMatch) cleaned = cleaned.replace(milestoneMatch[0], "");
    enhancedBody = cleaned.trim();
  } else if (!bodyMatch && !titleMatch && !fixMatch) {
    const legacyMatch = rawText.match(/^TITLE:\s*(.+?)(?:\r?\n)+BODY:\s*([\s\S]+)$/i);
    if (legacyMatch) {
      if (enhanceTitle) enhancedTitle = legacyMatch[1].trim();
      enhancedBody = legacyMatch[2].trim();
    }
  }

  if (fixMatch && fixMatch[1].trim()) {
    fixInstructions = normalizeFixInstructions(fixMatch[1]);
  }

  if (labelsMatch && labelsMatch[1].trim()) {
    const rawLabels = labelsMatch[1].trim();
    if (rawLabels.toLowerCase() !== "none") {
      recommendedLabels = rawLabels
        .split(",")
        .map((l) => l.trim().replace(/^["'`]|["'`]$/g, ""))
        .filter((l) => l && l.toLowerCase() !== "none");
    }
  }

  if (priorityMatch && priorityMatch[1].trim()) {
    const p = priorityMatch[1].trim().toUpperCase();
    if (["P0", "P1", "P2", "P3"].includes(p)) {
      estimatedPriority = p;
    } else {
      const matchP = p.match(/\b(P[0-3]|CRITICAL|HIGH|MEDIUM|LOW)\b/i);
      if (matchP) estimatedPriority = matchP[1].toUpperCase();
    }
  }

  if (sizeMatch && sizeMatch[1].trim()) {
    const s = sizeMatch[1].trim().toUpperCase();
    if (["XS", "S", "M", "L", "XL"].includes(s)) {
      estimatedSize = s;
    } else {
      const matchS = s.match(/\b(XS|S|M|L|XL|SMALL|MEDIUM|LARGE)\b/i);
      if (matchS) estimatedSize = matchS[1].toUpperCase();
    }
  }

  if (milestoneMatch && milestoneMatch[1].trim()) {
    const m = milestoneMatch[1].trim();
    if (m.toLowerCase() !== "none" && m.toLowerCase() !== "n/a") {
      recommendedMilestone = m;
    }
  }

  return {
    isThorough,
    enhancedTitle,
    enhancedBody,
    fixInstructions,
    recommendedLabels,
    estimatedPriority,
    estimatedSize,
    recommendedMilestone
  };
}

/**
 * Rewords and formats an issue using Gemini Flash Lite, checks if the issue is already thorough,
 * generates contributor fix instructions, and performs automated triage (labels, priority, size, milestone).
 * @param {string} title - The issue title
 * @param {string} body - The raw issue body
 * @param {object} [options={}] - Configurable options
 * @param {string} [options.model] - Gemini model override
 * @param {number} [options.temperature] - Temperature (0.0 - 1.0)
 * @param {string} [options.customInstruction] - Custom guidelines
 * @param {boolean} [options.enhanceTitle] - Whether to reword title
 * @param {string[]} [options.availableLabels=[]] - Existing repo labels for Gemini to select from
 * @param {string[]} [options.candidateMilestones=[]] - Open repo milestones
 * @returns {Promise<{
 *   isThorough: boolean,
 *   enhancedTitle: string|null,
 *   enhancedBody: string,
 *   fixInstructions: string|null,
 *   recommendedLabels: string[],
 *   estimatedPriority: string|null,
 *   estimatedSize: string|null,
 *   recommendedMilestone: string|null,
 *   modelUsed: string
 * }>}
 */
export async function enhanceIssue(title, body, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const customInstruction = options.customInstruction || "";
  const temperature =
    typeof options.temperature === "number" && !isNaN(options.temperature)
      ? options.temperature
      : 0.2;
  const enhanceTitle = Boolean(options.enhanceTitle);
  const availableLabels = Array.isArray(options.availableLabels) ? options.availableLabels : [];
  const candidateMilestones = Array.isArray(options.candidateMilestones) ? options.candidateMilestones : [];

  let systemInstruction = SYSTEM_INSTRUCTION;
  if (customInstruction.trim()) {
    systemInstruction += `\n\nADDITIONAL USER GUIDELINES:\n${customInstruction.trim()}`;
  }

  const labelsContext = availableLabels.length > 0
    ? `Available Repository Labels (choose only the most relevant ones):\n${availableLabels.join(", ")}`
    : `(No predefined labels available. If applicable, recommend standard labels like bug, documentation, enhancement, etc.)`;

  const milestonesContext = candidateMilestones.length > 0
    ? `Candidate Open Milestones:\n${candidateMilestones.join(", ")}`
    : `(No open milestones available)`;

  const titleSection = enhanceTitle
    ? `===ENHANCED_TITLE===\n<rewritten clear, concise, and professional issue title>\n\n`
    : "";

  const prompt = `Please evaluate the thoroughness of the following GitHub issue, reword and format the issue description for clarity and structure, provide brief fix instructions if applicable, and determine triage metadata (labels, priority, size, milestone).

${labelsContext}
${milestonesContext}

Return your response strictly in the following format with the exact delimiter tags:

===IS_THOROUGH===
<strictly 'YES' if the original issue description is already thorough and well-explained on its own (contains more than 2 well-written descriptive paragraphs or equivalent clear structure); otherwise strictly 'NO'>

${titleSection}===ENHANCED_BODY===
<rewritten markdown issue description without adding new facts or assumptions>

===FIX_INSTRUCTIONS===
<brief, practical instructions for anyone who wants to fix this issue, OR strictly 'NOT_APPLICABLE' if instructions are not applicable or if there is insufficient context>

===RECOMMENDED_LABELS===
<comma-separated list of 1-3 matching labels from the available repository labels, or 'NONE'>

===ESTIMATED_PRIORITY===
<strictly one of: 'P0', 'P1', 'P2', 'P3'>

===ESTIMATED_SIZE===
<strictly one of: 'XS', 'S', 'M', 'L', 'XL'>

===RECOMMENDED_MILESTONE===
<exact name of matching milestone from Candidate Open Milestones, or 'NONE'>

Issue Title: ${title || "(No title provided)"}

Issue Content:
${body || "(No description provided)"}`;

  // Deduplicate model candidates
  const candidateModels = Array.from(
    new Set([options.model, ...DEFAULT_MODELS].filter(Boolean))
  );
  let lastError = null;

  for (const model of candidateModels) {
    try {
      console.log(`[Gemini] Attempting generation with model: ${model} (temperature: ${temperature})`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature
        }
      });

      if (response && response.text) {
        const rawText = response.text.trim();
        console.log(`[Gemini] Successfully formatted issue and generated triage metadata with model: ${model}`);

        const parsed = parseGeminiResponse(rawText, enhanceTitle);
        return {
          isThorough: parsed.isThorough,
          enhancedTitle: parsed.enhancedTitle,
          enhancedBody: parsed.enhancedBody,
          fixInstructions: parsed.fixInstructions,
          recommendedLabels: parsed.recommendedLabels,
          estimatedPriority: parsed.estimatedPriority,
          estimatedSize: parsed.estimatedSize,
          recommendedMilestone: parsed.recommendedMilestone,
          modelUsed: model
        };
      }
    } catch (err) {
      console.warn(`[Gemini] Model ${model} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
}
