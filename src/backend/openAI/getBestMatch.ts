import axios from 'axios';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

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
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.1,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    // Log the full response for debugging
    console.log('Gemini API response:', response.data);

    // Extract the content from Gemini's response format
    const rawContent: string = response.data.candidates[0].content.parts[0].text;
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
