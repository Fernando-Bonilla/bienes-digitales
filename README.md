# Bienes Digitales - Proyecto con OpenAI

Proyecto JavaScript con integración de la API de OpenAI, entorno de desarrollo simple y tests.

## 📋 Requisitos

- Node.js >= 18.0.0
- npm o yarn
- API Key de OpenAI

## 🚀 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Configura las variables de entorno:
```bash
cp .env.example .env
```

3. Edita el archivo `.env` y agrega tu API Key de OpenAI:
```
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_MODEL=gpt-4
```

## 💻 Uso

### Desarrollo
Para ejecutar el proyecto en modo desarrollo con auto-reload:
```bash
npm run dev
```

### Producción
Para ejecutar el proyecto:
```bash
npm start
```

### Ejemplo de uso directo
```bash
node src/index.js "Tu pregunta aquí"
```

## 🧪 Tests

Ejecutar todos los tests:
```bash
npm test
```

Ejecutar tests en modo watch:
```bash
npm run test:watch
```

Ejecutar tests con UI interactiva:
```bash
npm run test:ui
```

## 📁 Estructura del Proyecto

```
bienes-digitales/
├── src/
│   ├── index.js          # Archivo principal con ejemplo de uso
│   └── openai-client.js  # Cliente reutilizable para OpenAI
├── tests/
│   ├── index.test.js     # Tests para index.js
│   └── openai-client.test.js  # Tests para OpenAIClient
├── documentos/           # Documentación del proyecto
├── package.json
├── vitest.config.js     # Configuración de Vitest
├── .env.example         # Plantilla de variables de entorno
└── README.md
```

## 🔧 Tecnologías Utilizadas

- **Node.js** - Runtime de JavaScript
- **OpenAI SDK** - Cliente oficial de OpenAI
- **Vitest** - Framework de testing rápido
- **dotenv** - Gestión de variables de entorno

## 📝 Notas

- Asegúrate de tener tu API Key de OpenAI configurada antes de ejecutar el proyecto
- Los tests usan mocks para no hacer llamadas reales a la API durante el desarrollo
- El proyecto usa ES Modules (import/export)

