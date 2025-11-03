import dotenv from 'dotenv';
import { OpenAI } from 'openai';

// Cargar variables de entorno
dotenv.config();

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Función de ejemplo para interactuar con OpenAI
 * @param {string} prompt - El mensaje a enviar a OpenAI
 * @returns {Promise<string>} - La respuesta de OpenAI
 */
export async function chatWithOpenAI(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error al comunicarse con OpenAI:', error);
    throw error;
  }
}

// Ejemplo de uso (solo se ejecuta si se ejecuta este archivo directamente)
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2] || 'Hola, ¿cómo estás?';
  
  chatWithOpenAI(prompt)
    .then((response) => {
      console.log('Respuesta:', response);
    })
    .catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

