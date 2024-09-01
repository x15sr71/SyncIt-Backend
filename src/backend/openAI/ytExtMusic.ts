import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const callOpenAIModel = async (prompt) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/completions',
      {
        model: 'gpt-3.5-turbo-0125', 
        prompt: prompt,
        max_tokens: 150, // Adjust this according to your needs
        temperature: 0.7, // Adjust the creativity level
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    console.log('OpenAI response:', response.data.choices[0].text);
    return response.data.choices[0].text;
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
    throw error;
  }
};