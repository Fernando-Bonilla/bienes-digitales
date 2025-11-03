import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de dotenv ANTES de importar
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

// Mock de OpenAI ANTES de importar - usar vi.hoisted para que la función esté disponible
const { mockCreateFn } = vi.hoisted(() => {
  return {
    mockCreateFn: vi.fn(),
  };
});

vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreateFn,
          },
        },
      };
    }),
  };
});

// Importar después de los mocks
import { chatWithOpenAI } from '../src/index.js';

describe('chatWithOpenAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4';
  });

  it('debería enviar un prompt y retornar una respuesta', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'Esta es una respuesta de prueba',
          },
        },
      ],
    };

    mockCreateFn.mockResolvedValue(mockResponse);
    
    const response = await chatWithOpenAI('Hola');
    
    expect(response).toBe('Esta es una respuesta de prueba');
    expect(mockCreateFn).toHaveBeenCalledWith({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'Hola',
        },
      ],
    });
  });

  it('debería retornar string vacío si no hay contenido en la respuesta', async () => {
    const mockResponse = {
      choices: [
        {
          message: {},
        },
      ],
    };

    mockCreateFn.mockResolvedValue(mockResponse);
    
    const response = await chatWithOpenAI('Test');
    
    expect(response).toBe('');
  });

  it('debería manejar errores y lanzarlos', async () => {
    const error = new Error('Network error');
    mockCreateFn.mockRejectedValue(error);

    await expect(chatWithOpenAI('Test')).rejects.toThrow('Network error');
  });
});

