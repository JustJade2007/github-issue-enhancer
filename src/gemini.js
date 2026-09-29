import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are an expert GitHub issue formatter, evaluator, and technical rewording assistant.
Your task is threefold:
1. Evaluate whether the original issue description is ALREADY thorough and well-explained on its own ('YES' or 'NO').
   Criteria: An issue is considered thorough ('YES') if it contains more than 2 well-written, descriptive paragraphs or has equivalent well-structured explanation (e.g., clear problem statement, steps to reproduce, or clear technical specifications) and does not need structural rewording or formatting. If the issue is brief, shorthand, fragmented, lacking clarity or structure, or has 2 or fewer brief paragraphs without clear organization, mark it as 'NO'.
2. Re-format and reword the issue title and description into a clean, professional, and well-structured GitHub issue format WITHOUT ADDING NEW CONTENT, ASSUMPTIONS, OR FABRICATIONS to the issue description.
3. If applicable, provide brief, actionable instructions/guidance for anyone who wants to fix or address the issue.

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
4. TONE: Direct, helpful, and targeted at a developer or contributor wanting to resolve the issue.`;

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
 * Parses Gemini response extracting thoroughness, enhanced title, enhanced body, and fix instructions.
 * @param {string} rawText
 * @param {boolean} enhanceTitle
 * @returns {{ isThorough: boolean, enhancedTitle: string|null, enhancedBody: string, fixInstructions: string|null }}
 */
export function parseGeminiResponse(rawText, enhanceTitle = false) {
  let isThorough = false;
  let enhancedTitle = null;
  let enhancedBody = rawText;
  let fixInstructions = null;

  const thoroughMatch = rawText.match(/===IS_THOROUGH===\s*([\s\S]*?)(?====ENHANCED_TITLE===|===ENHANCED_BODY===|===FIX_INSTRUCTIONS===|$)/i);
  if (thoroughMatch && thoroughMatch[1].trim()) {
    isThorough = thoroughMatch[1].trim().toUpperCase().startsWith("YES");
  }

  const titleMatch = rawText.match(/===ENHANCED_TITLE===\s*([\s\S]*?)(?====ENHANCED_BODY===|===FIX_INSTRUCTIONS===|$)/i);
  const bodyMatch = rawText.match(/===ENHANCED_BODY===\s*([\s\S]*?)(?====FIX_INSTRUCTIONS===|$)/i);
  const fixMatch = rawText.match(/===FIX_INSTRUCTIONS===\s*([\s\S]*?)$/i);

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

  return {
    isThorough,
    enhancedTitle,
    enhancedBody,
    fixInstructions
  };
}

/**
 * Rewords and formats an issue using Gemini Flash Lite without adding new content to the body,
 * checks if the issue is already thorough, and generates brief contributor fix instructions if applicable.
 * @param {string} title - The issue title
 * @param {string} body - The raw issue body
 * @param {object} [options={}] - Configurable options
 * @param {string} [options.model] - Gemini model override
 * @param {number} [options.temperature] - Temperature (0.0 - 1.0)
 * @param {string} [options.customInstruction] - Custom guidelines
 * @param {boolean} [options.enhanceTitle] - Whether to reword title
 * @returns {Promise<{ isThorough: boolean, enhancedTitle: string|null, enhancedBody: string, fixInstructions: string|null, modelUsed: string }>}
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

  let systemInstruction = SYSTEM_INSTRUCTION;
  if (customInstruction.trim()) {
    systemInstruction += `\n\nADDITIONAL USER GUIDELINES:\n${customInstruction.trim()}`;
  }

  let prompt = "";
  if (enhanceTitle) {
    prompt = `Please evaluate the thoroughness of the following GitHub issue, reword and format the issue for clarity, readability, and structure, and provide brief fix instructions if applicable.

Return your response strictly in the following format with the exact delimiter tags:

===IS_THOROUGH===
<strictly 'YES' if the original issue description is already thorough and well-explained on its own (contains more than 2 well-written descriptive paragraphs or equivalent clear structure); otherwise strictly 'NO'>

===ENHANCED_TITLE===
<rewritten clear, concise, and professional issue title>

===ENHANCED_BODY===
<rewritten markdown issue description without adding new facts or assumptions>

===FIX_INSTRUCTIONS===
<brief, practical instructions for anyone who wants to fix this issue, OR strictly 'NOT_APPLICABLE' if instructions are not applicable or if there is insufficient context>

Issue Title: ${title || "(No title provided)"}

Issue Content:
${body || "(No description provided)"}`;
  } else {
    prompt = `Please evaluate the thoroughness of the following GitHub issue, reword and format the issue description for clarity, readability, and structure, and provide brief fix instructions if applicable.

Return your response strictly in the following format with the exact delimiter tags:

===IS_THOROUGH===
<strictly 'YES' if the original issue description is already thorough and well-explained on its own (contains more than 2 well-written descriptive paragraphs or equivalent clear structure); otherwise strictly 'NO'>

===ENHANCED_BODY===
<rewritten markdown issue description without adding new facts or assumptions>

===FIX_INSTRUCTIONS===
<brief, practical instructions for anyone who wants to fix this issue, OR strictly 'NOT_APPLICABLE' if instructions are not applicable or if there is insufficient context>

Issue Title: ${title || "(No title provided)"}

Issue Content:
${body || "(No description provided)"}`;
  }

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
        console.log(`[Gemini] Successfully formatted issue and generated instructions with model: ${model}`);

        const parsed = parseGeminiResponse(rawText, enhanceTitle);
        return {
          isThorough: parsed.isThorough,
          enhancedTitle: parsed.enhancedTitle,
          enhancedBody: parsed.enhancedBody,
          fixInstructions: parsed.fixInstructions,
          modelUsed: model
        };
      }
    } catch (err) {
      console.warn(`[Gemini] Model ${model} failed: ${err.message}`);
      lastError = err;
      // Continue to next fallback model
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message || "Unknown error"}`);
}

