import axios from 'axios';

// v1beta is the documented base for generationConfig extensions like
// thinkingConfig / responseMimeType.
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export const callOpenAIModel = async (messages: Array<{ role: string; content: string }>) => {
  try {
    const geminiContents = messages.map((msg) => {
      let role = msg.role;
      // Gemini uses 'user' and 'model' roles instead of 'user' and 'assistant'
      if (role === 'assistant') {
        role = 'model';
      }
      // Gemini doesn't support 'system' role directly, convert to user message
      if (role === 'system') {
        role = 'user';
      }
      return {
        role: role,
        parts: [{ text: msg.content }],
      };
    });

    const response = await axios.post(
      GEMINI_URL,
      {
        contents: geminiContents,
        generationConfig: {
          // 2.5-flash thinks by default and thought tokens count against
          // maxOutputTokens; a 500-token budget returned empty/truncated
          // JSON (P0-7). Disable thinking and give headroom for output.
          maxOutputTokens: 2048,
          temperature: 0.1,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          // Header keeps the API key out of URLs (query strings end up in logs).
          'x-goog-api-key': process.env.GOOGLE_API_KEY ?? '',
        },
        timeout: 60_000,
      },
    );

    const candidate = response.data?.candidates?.[0];
    const rawContent: string | undefined = candidate?.content?.parts?.[0]?.text;

    if (typeof rawContent !== 'string') {
      const finishReason = candidate?.finishReason;
      const thoughts = response.data?.usageMetadata?.thoughtsTokenCount;
      throw new Error(
        `Gemini returned no text (finishReason=${finishReason ?? 'unknown'}, thoughtsTokenCount=${thoughts ?? 'n/a'})`,
      );
    }

    // Strip markdown code fences (```json ... ``` or ``` ... ```) that Gemini sometimes wraps JSON in
    const content = rawContent
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();

    // Extract usage information (Gemini provides token counts)
    const usage = {
      prompt_tokens: response.data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.data.usageMetadata?.totalTokenCount || 0,
    };

    // Return both the content and the usage information
    return {
      content: content,
      usage: usage,
    };
  } catch (error: any) {
    console.error(
      'Error calling Gemini API:',
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
};

/**
 * Call the LLM and parse its response as JSON, retrying once on failure.
 *
 * Returns the parsed object, or null after all attempts fail — callers must
 * treat null as "mark this chunk's tracks failed and continue", never as
 * "abort the whole migration" (P2-5).
 */
export async function callLlmJsonWithRetry(
  messages: Array<{ role: string; content: string }>,
  maxAttempts = 2,
): Promise<Record<string, unknown> | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callOpenAIModel(messages);
      return JSON.parse(result.content);
    } catch (err: any) {
      console.warn(
        `[LLM] Attempt ${attempt}/${maxAttempts} failed: ${err?.message || 'unknown error'}`,
      );
    }
  }
  return null;
}
