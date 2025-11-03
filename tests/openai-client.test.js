import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del módulo openai ANTES de importar el módulo bajo prueba
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    }),
  };
});

// Importar después del mock
import { OpenAIClient } from '../src/openai-client.js';

describe('OpenAIClient', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenAIClient('test-api-key');
  });

  it('debería lanzar un error si no se proporciona apiKey', () => {
    expect(() => new OpenAIClient()).toThrow('OPENAI_API_KEY es requerida');
  });

  it('debería crear una instancia correctamente con apiKey', () => {
    expect(() => new OpenAIClient('test-key')).not.toThrow();
  });

  it('debería enviar un mensaje y obtener una respuesta', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'Respuesta de prueba',
          },
        },
      ],
    };

    mockCreate.mockResolvedValue(mockResponse);

    const response = await client.chat('Hola');
    
    expect(response).toBe('Respuesta de prueba');
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'Hola',
        },
      ],
    });
  });

  it('debería usar el modelo personalizado si se proporciona', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'Respuesta',
          },
        },
      ],
    };

    mockCreate.mockResolvedValue(mockResponse);

    await client.chat('Hola', 'gpt-3.5-turbo');
    
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Hola',
        },
      ],
    });
  });

  it('debería manejar errores correctamente', async () => {
    const error = new Error('API Error');
    mockCreate.mockRejectedValue(error);

    await expect(client.chat('Hola')).rejects.toThrow('Error en OpenAI API: API Error');
  });
});

