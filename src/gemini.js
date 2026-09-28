import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are an expert GitHub issue formatter and technical rewording assistant.
Your task is to take an issue title and description and reword/expand it into a clean, professional, and well-structured GitHub issue format WITHOUT ADDING NEW CONTENT, ASSUMPTIONS, OR FABRICATIONS.

STRICT CONSTRAINTS:
1. STRICTLY NO NEW CONTENT: Do NOT hallucinate, invent, or assume any new facts, symptoms, reproduction steps, technical solutions, error logs, environment details, or requirements that the user did not explicitly state or provide.
2. DO NOT GUESS SOLUTIONS: If the author only describes a bug or an idea, do not invent code fixes or technical architectures unless the author explicitly proposed them.
3. REWORD FOR CLARITY: Turn informal, rushed, shorthand, or fragmented sentences into articulate, grammatical, and professional technical English.
4. EXPAND STRUCTURALLY: Reorganize messy, brief, or unstructured thoughts into clean markdown sections (e.g., Summary / Overview, Details, Observed Context / Notes) without adding unmentioned information.
5. PRESERVE ORIGINAL ARTIFACTS: Preserve all code snippets, terminal commands, stack traces, URLs, file paths, versions, and usernames VERBATIM in appropriate markdown code blocks.
6. OUTPUT ONLY MARKDOWN: Return strictly the formatted markdown text for the issue description. Do not wrap in conversational chit-chat, meta explanations, or greetings.`;

const DEFAULT_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview"
].filter(Boolean);

/**
 * Rewords and formats an issue using Gemini Flash Lite without adding new content.
 * @param {string} title - The issue title
 * @param {string} body - The raw issue body
 * @param {object} [options={}] - Configurable options
 * @param {string} [options.model] - Gemini model override
 * @param {number} [options.temperature] - Temperature (0.0 - 1.0)
 * @param {string} [options.customInstruction] - Custom guidelines
 * @param {boolean} [options.enhanceTitle] - Whether to reword title
 * @returns {Promise<{ enhancedTitle: string|null, enhancedBody: string, modelUsed: string }>}
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
    prompt = `Please reword and format the following GitHub issue for clarity, readability, and structure. Clarify both the title and the body without adding any new facts, assumptions, reproduction steps, or content that was not in the original issue.

Return your response strictly in the following format:
TITLE: <rewritten clear, concise, and professional issue title>
BODY:
<rewritten markdown issue description>

Issue Title: ${title || "(No title provided)"}

Issue Content:
${body || "(No description provided)"}`;
  } else {
    prompt = `Please reword and format the following GitHub issue for clarity, readability, and structure. Do not add any new facts, assumptions, reproduction steps, or content that was not in the original issue.\n\nIssue Title: ${title || "(No title provided)"}\n\nIssue Content:\n${body || "(No description provided)"}`;
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
        console.log(`[Gemini] Successfully formatted issue using model: ${model}`);

        if (enhanceTitle) {
          const match = rawText.match(/^TITLE:\s*(.+?)(?:\r?\n)+BODY:\s*([\s\S]+)$/i);
          if (match) {
            return {
              enhancedTitle: match[1].trim(),
              enhancedBody: match[2].trim(),
              modelUsed: model
            };
          }
        }

        return {
          enhancedTitle: null,
          enhancedBody: rawText,
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

