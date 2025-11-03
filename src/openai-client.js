import { OpenAI } from 'openai';

/**
 * Cliente configurado para interactuar con la API de OpenAI
 */
export class OpenAIClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY es requerida');
    }
    
    this.client = new OpenAI({
      apiKey: apiKey,
    });
  }

  /**
   * Envía un mensaje y obtiene una respuesta de OpenAI
   * @param {string} prompt - El mensaje del usuario
   * @param {string} model - El modelo a usar (por defecto: gpt-4)
   * @returns {Promise<string>} - La respuesta del modelo
   */
  async chat(prompt, model = 'gpt-4') {
    try {
      const completion = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      throw new Error(`Error en OpenAI API: ${error.message}`);
    }
  }
}

