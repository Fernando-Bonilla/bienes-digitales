import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';

// Configurar __dirname equivalente para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config();

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modelo a usar - gpt-4o es el mejor modelo disponible actualmente
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

/**
 * Formatea el tiempo transcurrido en formato legible
 */
function formatElapsedTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Obtiene el timestamp actual formateado
 */
function getTimestamp() {
  return new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

/**
 * Determina el tipo MIME del archivo basado en su extensión
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Lee el contenido de un archivo PDF
 */
async function readPDF(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

/**
 * Lee el contenido de un archivo DOCX
 */
async function readDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

/**
 * Lee el contenido de un archivo XLSX
 */
async function readXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  let text = '';
  
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    text += `\n=== Hoja: ${sheetName} ===\n\n`;
    text += XLSX.utils.sheet_to_txt(sheet);
    text += '\n\n';
  });
  
  return text;
}

/**
 * Detecta el tipo de archivo y extrae su contenido como texto
 */
async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.pdf':
      return await readPDF(filePath);
    case '.docx':
      return await readDOCX(filePath);
    case '.xlsx':
    case '.xls':
      return await readXLSX(filePath);
    default:
      // Intentar leer como texto plano
      return await fs.readFile(filePath, 'utf-8');
  }
}

/**
 * Convierte texto a markdown usando chat completions (funciona con cualquier modelo)
 */
async function convertTextToMarkdown(text, fileName, progressCallback) {
  const prompt = `Por favor, convierte el siguiente contenido a formato Markdown bien estructurado y formateado. 
Mantén toda la información importante, incluyendo títulos, subtítulos, listas, tablas, y cualquier otra estructura relevante.
Si hay tablas, conviértelas a formato de tabla Markdown.
Asegúrate de que el markdown sea limpio, legible y bien organizado.

Contenido del archivo "${fileName}":

${text}`;

  try {
    if (progressCallback) {
      progressCallback('Enviando solicitud a OpenAI (Chat Completions)...');
    }

    const startTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en convertir documentos a formato Markdown, manteniendo toda la estructura y formato importante.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      // Nota: Algunos modelos (como gpt-5-nano) solo aceptan temperature por defecto (1)
      // Si necesitas cambiar esto, verifica la compatibilidad del modelo
    });

    const elapsedTime = Date.now() - startTime;
    
    if (progressCallback) {
      progressCallback(`Respuesta recibida (${formatElapsedTime(elapsedTime)})`);
    }

    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error(`Error al convertir ${fileName} a markdown:`, error.message);
    throw error;
  }
}

/**
 * Extrae texto de un archivo y lo convierte a markdown usando Chat Completions
 */
async function convertFileToMarkdown(filePath, fileName, progressCallback) {
  try {
    // Extraer texto del archivo
    if (progressCallback) {
      progressCallback('Extrayendo texto del archivo...');
    }

    const extractStartTime = Date.now();
    const text = await extractTextFromFile(filePath);
    const extractTime = Date.now() - extractStartTime;
    
    if (!text || text.trim().length === 0) {
      throw new Error('No se pudo extraer texto del archivo');
    }

    if (progressCallback) {
      progressCallback(`Texto extraído (${formatElapsedTime(extractTime)}, ${text.length.toLocaleString()} caracteres)`);
      progressCallback('Enviando a OpenAI para conversión a Markdown...');
    }

    // Convertir a markdown usando Chat Completions
    return await convertTextToMarkdown(text, fileName, progressCallback);
    
  } catch (error) {
    console.error(`Error al convertir ${fileName} a markdown:`, error.message);
    throw error;
  }
}

/**
 * Procesa un archivo: lo lee, convierte a markdown y guarda el resultado
 */
async function processFile(inputFilePath, fileIndex, totalFiles) {
  const fileName = path.basename(inputFilePath);
  const fileNameWithoutExt = path.basename(inputFilePath, path.extname(inputFilePath));
  const outputFileName = `${fileNameWithoutExt}_${MODEL}.md`;
  const outputDir = path.join(__dirname, '..', 'documentos_markdown');
  const outputPath = path.join(outputDir, outputFileName);

  const fileStartTime = Date.now();
  const timestamp = getTimestamp();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 [${timestamp}] Archivo ${fileIndex}/${totalFiles}: ${fileName}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Verificar tamaño del archivo
    const fileStats = await fs.stat(inputFilePath);
    const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
    console.log(`   📊 Tamaño del archivo: ${fileSizeMB} MB`);
    console.log(`   🤖 Modelo a usar: ${MODEL}`);
    console.log(`   📄 Tipo: ${getMimeType(inputFilePath)}`);

    // Extraer texto y convertir a markdown usando Chat Completions
    const aiStartTime = Date.now();
    console.log(`   🚀 [${getTimestamp()}] Procesando archivo con OpenAI...`);
    console.log(`   💡 Método: Extracción de texto + Chat Completions`);
    
    const markdown = await convertFileToMarkdown(inputFilePath, fileName, (message) => {
      console.log(`   ⏳ [${getTimestamp()}] ${message}`);
    });

    if (!markdown || markdown.trim().length === 0) {
      console.log(`   ⚠️  [${getTimestamp()}] No se recibió contenido del archivo`);
      return null;
    }

    const aiTime = Date.now() - aiStartTime;
    console.log(`   ✓ [${getTimestamp()}] Conversión completada en ${formatElapsedTime(aiTime)}`);
    console.log(`   💾 [${getTimestamp()}] Guardando archivo...`);

    // Crear directorio de salida si no existe
    await fs.mkdir(outputDir, { recursive: true });

    // Guardar el resultado
    await fs.writeFile(outputPath, markdown, 'utf-8');

    const totalTime = Date.now() - fileStartTime;
    const fileSize = markdown.length;
    
    console.log(`   ✓ [${getTimestamp()}] Guardado: ${outputPath}`);
    console.log(`   📏 Tamaño del markdown: ${fileSize.toLocaleString()} caracteres`);
    console.log(`   ⏱️  Tiempo total: ${formatElapsedTime(totalTime)}`);
    console.log(`   ✅ Archivo ${fileIndex}/${totalFiles} completado!`);

    return { outputPath, totalTime, success: true };
  } catch (error) {
    const totalTime = Date.now() - fileStartTime;
    console.error(`   ❌ [${getTimestamp()}] Error procesando ${fileName}:`, error.message);
    console.error(`   ⏱️  Tiempo transcurrido antes del error: ${formatElapsedTime(totalTime)}`);
    throw error;
  }
}

/**
 * Procesa todos los archivos en la carpeta documentos/
 */
async function processAllFiles() {
  const overallStartTime = Date.now();
  const documentosDir = path.join(__dirname, '..', 'documentos');
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 CONVERSIÓN DE DOCUMENTOS A MARKDOWN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📅 Inicio: ${new Date().toLocaleString('es-ES')}`);
    console.log(`🤖 Modelo: ${MODEL}`);
    console.log(`📁 Origen: ${documentosDir}`);
    console.log(`📁 Destino: ${path.join(__dirname, '..', 'documentos_markdown')}`);
    
    // Leer todos los archivos de la carpeta documentos
    console.log(`\n🔍 [${getTimestamp()}] Buscando archivos en documentos/...`);
    const files = await fs.readdir(documentosDir);
    
    // Filtrar solo archivos (no directorios)
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(documentosDir, file);
        const stats = await fs.stat(filePath);
        return { file, filePath, isFile: stats.isFile() };
      })
    );

    const filesToProcess = fileStats
      .filter(({ isFile }) => isFile)
      .map(({ filePath }) => filePath);

    if (filesToProcess.length === 0) {
      console.log('\n⚠️  No se encontraron archivos para procesar en documentos/');
      return;
    }

    console.log(`\n📋 Archivos encontrados: ${filesToProcess.length}`);
    filesToProcess.forEach((filePath, index) => {
      console.log(`   ${index + 1}. ${path.basename(filePath)}`);
    });

    const results = [];
    let successfulFiles = 0;
    let failedFiles = 0;
    
    for (let i = 0; i < filesToProcess.length; i++) {
      const filePath = filesToProcess[i];
      try {
        const result = await processFile(filePath, i + 1, filesToProcess.length);
        if (result && result.success) {
          results.push({ 
            input: filePath, 
            output: result.outputPath, 
            success: true,
            time: result.totalTime 
          });
          successfulFiles++;
        } else {
          results.push({ input: filePath, output: null, success: false });
          failedFiles++;
        }
      } catch (error) {
        results.push({ 
          input: filePath, 
          output: null, 
          success: false, 
          error: error.message 
        });
        failedFiles++;
      }
      
      // Mostrar progreso parcial después de cada archivo
      if (i < filesToProcess.length - 1) {
        const elapsedSoFar = Date.now() - overallStartTime;
        const avgTimePerFile = elapsedSoFar / (i + 1);
        const estimatedRemaining = avgTimePerFile * (filesToProcess.length - (i + 1));
        
        console.log(`\n   📈 Progreso: ${i + 1}/${filesToProcess.length} archivos procesados`);
        console.log(`   ⏱️  Tiempo transcurrido: ${formatElapsedTime(elapsedSoFar)}`);
        console.log(`   ⏳ Tiempo estimado restante: ~${formatElapsedTime(estimatedRemaining)}`);
      }
    }

    // Resumen final
    const totalTime = Date.now() - overallStartTime;
    const avgTimePerFile = totalTime / filesToProcess.length;
    
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 RESUMEN FINAL`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📅 Finalización: ${new Date().toLocaleString('es-ES')}`);
    console.log(`⏱️  Tiempo total: ${formatElapsedTime(totalTime)}`);
    console.log(`📊 Promedio por archivo: ${formatElapsedTime(avgTimePerFile)}`);
    console.log(`\n📁 Archivos:`);
    console.log(`   Total: ${filesToProcess.length}`);
    console.log(`   ✅ Exitosos: ${successfulFiles}`);
    console.log(`   ❌ Fallidos: ${failedFiles}`);

    if (results.some(r => r.success && r.time)) {
      console.log(`\n⏱️  Tiempos por archivo:`);
      results
        .filter(r => r.success && r.time)
        .forEach(r => {
          const fileName = path.basename(r.input);
          console.log(`   ${fileName}: ${formatElapsedTime(r.time)}`);
        });
    }

    if (failedFiles > 0) {
      console.log(`\n⚠️  Archivos con errores:`);
      results
        .filter(r => !r.success)
        .forEach(r => {
          const fileName = path.basename(r.input);
          console.log(`   ❌ ${fileName}: ${r.error || 'Error desconocido'}`);
        });
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    const totalTime = Date.now() - overallStartTime;
    console.error(`\n❌ Error fatal después de ${formatElapsedTime(totalTime)}:`);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  processAllFiles().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { processFile, processAllFiles };

