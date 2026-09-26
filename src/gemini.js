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
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash"
].filter(Boolean);

/**
 * Rewords and formats an issue using Gemini Flash Lite without adding new content.
 * @param {string} title - The issue title
 * @param {string} body - The raw issue body
 * @returns {Promise<{ enhancedBody: string, modelUsed: string }>}
 */
export async function enhanceIssue(title, body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Please reword and format the following GitHub issue for clarity, readability, and structure. Do not add any new facts, assumptions, reproduction steps, or content that was not in the original issue.\n\nIssue Title: ${title || "(No title provided)"}\n\nIssue Content:\n${body || "(No description provided)"}`;

  // Deduplicate model candidates
  const candidateModels = Array.from(new Set(DEFAULT_MODELS));
  let lastError = null;

  for (const model of candidateModels) {
    try {
      console.log(`[Gemini] Attempting generation with model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2 // Low temperature for high fidelity and zero hallucinations
        }
      });

      if (response && response.text) {
        console.log(`[Gemini] Successfully formatted issue using model: ${model}`);
        return {
          enhancedBody: response.text.trim(),
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
