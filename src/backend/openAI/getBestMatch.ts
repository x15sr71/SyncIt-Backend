import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const callOpenAIModel = async (messages) => {
  try {
      const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
              model: 'gpt-3.5-turbo',
              messages: messages,
              max_tokens: 500, // Adjust this according to your needs
              temperature: 0.7, // Adjust the creativity level
          },
          {
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
              },
          }
      );

      // Log the full response for debugging
      console.log('OpenAI API response:', response.data);

      // Return both the content and the usage information
      return {
          content: response.data.choices[0].message.content,
          usage: response.data.usage
      };
  } catch (error) {
      console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
      throw error;
  }
};
