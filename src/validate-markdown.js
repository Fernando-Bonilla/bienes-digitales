import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extrae texto de un archivo original (PDF, DOCX, XLSX)
 */
async function extractTextFromOriginal(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    switch (ext) {
      case '.pdf':
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        return pdfData.text;
      
      case '.docx':
        const docxResult = await mammoth.extractRawText({ path: filePath });
        return docxResult.value;
      
      case '.xlsx':
      case '.xls':
        const workbook = XLSX.readFile(filePath);
        let text = '';
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          text += `\n=== ${sheetName} ===\n\n`;
          text += XLSX.utils.sheet_to_txt(sheet);
          text += '\n\n';
        });
        return text;
      
      default:
        return await fs.readFile(filePath, 'utf-8');
    }
  } catch (error) {
    throw new Error(`Error extrayendo texto de ${path.basename(filePath)}: ${error.message}`);
  }
}

/**
 * Extrae texto del markdown (sin formato, solo contenido)
 */
function extractTextFromMarkdown(markdownContent) {
  // Remover código markdown, mantener solo el contenido
  let text = markdownContent
    // Remover headers (# ## ###)
    .replace(/^#{1,6}\s+/gm, '')
    // Remover enlaces pero mantener el texto [texto](url) -> texto
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remover formato markdown pero mantener el texto
    .replace(/\*\*([^\*]+)\*\*/g, '$1')
    .replace(/\*([^\*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/_{2}([^_]+)_{2}/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remover separadores horizontales
    .replace(/^---+$/gm, '')
    // Remover listas markdown pero mantener el contenido
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remover tablas markdown pero mantener el contenido
    .replace(/\|/g, ' ')
    // Limpiar espacios múltiples
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

/**
 * Normaliza texto para comparación (elimina espacios, puntuación, convierte a minúsculas)
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^\w\s]/g, '') // Remover puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula el porcentaje de contenido que se conservó
 */
function calculatePreservationRate(originalText, markdownText) {
  const originalNormalized = normalizeText(originalText);
  const markdownNormalized = normalizeText(markdownText);
  
  // Contar palabras únicas en el original
  const originalWords = new Set(originalNormalized.split(/\s+/).filter(w => w.length > 2));
  const markdownWords = new Set(markdownNormalized.split(/\s+/).filter(w => w.length > 2));
  
  // Contar palabras del original que están en el markdown
  let preservedWords = 0;
  for (const word of originalWords) {
    if (markdownWords.has(word)) {
      preservedWords++;
    }
  }
  
  const preservationRate = originalWords.size > 0 
    ? (preservedWords / originalWords.size) * 100 
    : 0;
  
  // También calcular por caracteres (sin espacios)
  const originalChars = originalNormalized.replace(/\s/g, '').length;
  const markdownChars = markdownNormalized.replace(/\s/g, '').length;
  const charPreservationRate = originalChars > 0 
    ? (Math.min(markdownChars, originalChars) / originalChars) * 100 
    : 0;
  
  // Encontrar palabras importantes que puedan faltar
  const missingWords = [];
  for (const word of originalWords) {
    if (!markdownWords.has(word) && word.length > 4) { // Solo palabras de más de 4 caracteres
      missingWords.push(word);
    }
  }
  
  return {
    wordPreservationRate: preservationRate,
    charPreservationRate: charPreservationRate,
    originalWordCount: originalWords.size,
    markdownWordCount: markdownWords.size,
    preservedWordCount: preservedWords,
    missingWords: missingWords.slice(0, 20) // Primeras 20 palabras faltantes
  };
}

/**
 * Solicita a ChatGPT una evaluación final del documento markdown
 */
async function getChatGPTAssessment(originalFileName, validationResult, markdownContent, originalText) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

  // Preparar el prompt con toda la información relevante
  const prompt = `Eres un experto en evaluación de calidad de documentos convertidos a Markdown.

He convertido el documento "${originalFileName}" a formato Markdown usando ChatGPT, y he realizado una validación determinística comparando el texto original con el markdown generado.

## Resultados de la validación determinística:

- **Preservación de palabras:** ${validationResult.stats.wordPreservationRate.toFixed(2)}%
- **Preservación de caracteres:** ${validationResult.stats.charPreservationRate.toFixed(2)}%
- **Palabras en el original:** ${validationResult.stats.originalWordCount}
- **Palabras en el markdown:** ${validationResult.stats.markdownWordCount}
- **Palabras preservadas:** ${validationResult.stats.preservedWordCount}
${validationResult.stats.missingWords.length > 0 ? `- **Algunas palabras que podrían faltar:** ${validationResult.stats.missingWords.slice(0, 10).join(', ')}` : ''}

## Contexto:
${validationResult.isAcceptable ? 'El documento cumple con los umbrales mínimos de preservación (≥85% palabras, ≥80% caracteres).' : 'El documento NO cumple con los umbrales mínimos de preservación y necesita revisión.'}

## Documento original (primeros 5000 caracteres):
${originalText.substring(0, 5000)}${originalText.length > 5000 ? '\n\n[... texto truncado ...]' : ''}

## Documento Markdown generado:
${markdownContent}

---

Por favor, realiza una evaluación final del documento Markdown generado. Tu respuesta debe estar en formato Markdown y debe incluir:

1. **Assessment Final**: Una evaluación general de la calidad de la conversión, considerando:
   - Completitud del contenido
   - Precisión de la información
   - Estructura y formato Markdown
   - Legibilidad
   - Posibles problemas identificados

2. **Sugerencias de cambios**: SOLO si hay problemas reales que necesiten corrección. Si el documento está bien, indica que no se requieren cambios. Si hay problemas, lista sugerencias específicas y concretas para mejorar el documento.

IMPORTANTE:
- Si el documento está bien y solo hay diferencias menores esperables (como palabras unidas que vienen de la extracción de texto), indica que NO se requieren cambios.
- Solo sugiere cambios si hay problemas significativos como: información faltante importante, errores de formato que afectan la legibilidad, estructura incorrecta, o contenido claramente incompleto.
- Sé específico y concreto en tus sugerencias.

Formato tu respuesta en Markdown bien estructurado.`;

  try {
    console.log(`   🤖 Solicitando evaluación final de ChatGPT...`);
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en evaluación de calidad de documentos convertidos a Markdown. Proporcionas evaluaciones objetivas, constructivas y específicas.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error(`   ❌ Error en evaluación de ChatGPT: ${error.message}`);
    return null;
  }
}

/**
 * Valida un documento comparando el original con el markdown
 */
async function validateDocument(originalPath, markdownPath) {
  const fileName = path.basename(originalPath);
  
  try {
    console.log(`\n📄 Validando: ${fileName}`);
    console.log(`   📖 Extrayendo texto del documento original...`);
    
    const originalText = await extractTextFromOriginal(originalPath);
    
    if (!originalText || originalText.trim().length === 0) {
      return {
        fileName,
        success: false,
        error: 'No se pudo extraer texto del documento original',
        stats: null
      };
    }
    
    console.log(`   📝 Extrayendo texto del markdown...`);
    const markdownContent = await fs.readFile(markdownPath, 'utf-8');
    const markdownText = extractTextFromMarkdown(markdownContent);
    
    if (!markdownText || markdownText.trim().length === 0) {
      return {
        fileName,
        success: false,
        error: 'El markdown está vacío o no se pudo procesar',
        stats: null
      };
    }
    
    console.log(`   🔍 Comparando contenido...`);
    const stats = calculatePreservationRate(originalText, markdownText);
    
    const isAcceptable = stats.wordPreservationRate >= 85 && stats.charPreservationRate >= 80;
    
    console.log(`   ${isAcceptable ? '✅' : '⚠️ '} Preservación de palabras: ${stats.wordPreservationRate.toFixed(2)}%`);
    console.log(`   ${isAcceptable ? '✅' : '⚠️ '} Preservación de caracteres: ${stats.charPreservationRate.toFixed(2)}%`);
    
    if (stats.missingWords.length > 0 && stats.wordPreservationRate < 95) {
      console.log(`   ⚠️  Palabras importantes que podrían faltar: ${stats.missingWords.slice(0, 5).join(', ')}${stats.missingWords.length > 5 ? '...' : ''}`);
    }
    
    const result = {
      fileName,
      success: true,
      isAcceptable,
      stats,
      originalLength: originalText.length,
      markdownLength: markdownText.length,
      chatGPTAssessment: null
    };

    // Realizar evaluación de ChatGPT
    const assessment = await getChatGPTAssessment(
      fileName,
      result,
      markdownContent,
      originalText
    );
    result.chatGPTAssessment = assessment;

    return result;
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return {
      fileName,
      success: false,
      error: error.message,
      stats: null
    };
  }
}

/**
 * Guarda el assessment de ChatGPT en un archivo markdown
 */
async function saveAssessment(fileName, assessment, validationResult) {
  if (!assessment) return;

  const assessmentDir = path.join(__dirname, '..', 'documentos_markdown', 'assessments');
  await fs.mkdir(assessmentDir, { recursive: true });

  const baseName = path.basename(fileName, path.extname(fileName));
  const assessmentFileName = `${baseName}_assessment.md`;
  const assessmentPath = path.join(assessmentDir, assessmentFileName);

  // Crear contenido del assessment con metadata
  const assessmentContent = `# Assessment: ${fileName}

## Resultados de Validación

- **Preservación de palabras:** ${validationResult.stats.wordPreservationRate.toFixed(2)}%
- **Preservación de caracteres:** ${validationResult.stats.charPreservationRate.toFixed(2)}%
- **Estado:** ${validationResult.isAcceptable ? '✅ Aceptable' : '⚠️ Necesita revisión'}

---

${assessment}`;

  await fs.writeFile(assessmentPath, assessmentContent, 'utf-8');
  console.log(`   💾 Assessment guardado: ${assessmentFileName}`);
  
  return assessmentPath;
}

/**
 * Valida todos los documentos
 */
async function validateAllDocuments() {
  const documentosDir = path.join(__dirname, '..', 'documentos');
  const markdownDir = path.join(__dirname, '..', 'documentos_markdown');
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 VALIDACIÓN DE DOCUMENTOS MARKDOWN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📁 Documentos originales: ${documentosDir}`);
    console.log(`📁 Documentos markdown: ${markdownDir}`);
    
    // Leer archivos originales
    const originalFiles = await fs.readdir(documentosDir);
    const originalFilePaths = [];
    
    for (const file of originalFiles) {
      const filePath = path.join(documentosDir, file);
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        originalFilePaths.push({ original: filePath, name: file });
      }
    }
    
    // Leer archivos markdown de gpt-5-nano
    const markdownFiles = await fs.readdir(markdownDir);
    const markdownFilePaths = markdownFiles
      .filter(f => f.endsWith('.md') && f.includes('gpt-5-nano'))
      .map(f => path.join(markdownDir, f));
    
    if (originalFilePaths.length === 0) {
      console.log('\n⚠️  No se encontraron archivos originales en documentos/');
      return;
    }
    
    if (markdownFilePaths.length === 0) {
      console.log('\n⚠️  No se encontraron archivos markdown de gpt-5-nano');
      return;
    }
    
    console.log(`\n📋 Archivos a validar: ${originalFilePaths.length} original(es) vs ${markdownFilePaths.length} markdown(s)`);
    
    const results = [];
    
    // Emparejar archivos originales con sus markdown correspondientes
    for (const { original, name } of originalFilePaths) {
      const nameWithoutExt = path.basename(name, path.extname(name));
      const markdownFile = markdownFilePaths.find(m => {
        const markdownName = path.basename(m, '.md');
        return markdownName.includes(nameWithoutExt);
      });
      
      if (!markdownFile) {
        console.log(`\n⚠️  No se encontró markdown para: ${name}`);
        results.push({
          fileName: name,
          success: false,
          error: 'No se encontró archivo markdown correspondiente',
          stats: null
        });
        continue;
      }
      
      const result = await validateDocument(original, markdownFile);
      
      // Guardar assessment de ChatGPT
      if (result.chatGPTAssessment) {
        await saveAssessment(name, result.chatGPTAssessment, result);
      }
      
      results.push(result);
    }
    
    // Resumen
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 RESUMEN DE VALIDACIÓN`);
    console.log(`${'='.repeat(60)}`);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const acceptable = successful.filter(r => r.isAcceptable);
    const needsReview = successful.filter(r => !r.isAcceptable);
    
    console.log(`\n📈 Estadísticas:`);
    console.log(`   Total validados: ${results.length}`);
    console.log(`   ✅ Exitosos y aceptables: ${acceptable.length}`);
    console.log(`   ⚠️  Necesitan revisión: ${needsReview.length}`);
    console.log(`   ❌ Fallidos: ${failed.length}`);
    
    if (successful.length > 0) {
      const avgWordPreservation = successful.reduce((sum, r) => sum + r.stats.wordPreservationRate, 0) / successful.length;
      const avgCharPreservation = successful.reduce((sum, r) => sum + r.stats.charPreservationRate, 0) / successful.length;
      
      console.log(`\n📊 Promedios:`);
      console.log(`   Preservación de palabras: ${avgWordPreservation.toFixed(2)}%`);
      console.log(`   Preservación de caracteres: ${avgCharPreservation.toFixed(2)}%`);
    }
    
    if (needsReview.length > 0) {
      console.log(`\n⚠️  Documentos que necesitan revisión:`);
      needsReview.forEach(r => {
        console.log(`\n   📄 ${r.fileName}:`);
        console.log(`      Preservación de palabras: ${r.stats.wordPreservationRate.toFixed(2)}%`);
        console.log(`      Preservación de caracteres: ${r.stats.charPreservationRate.toFixed(2)}%`);
        if (r.stats.missingWords.length > 0) {
          console.log(`      Palabras faltantes (primeras 10): ${r.stats.missingWords.slice(0, 10).join(', ')}`);
        }
      });
    }

    // Mostrar información sobre assessments de ChatGPT
    const assessmentsGenerated = results.filter(r => r.chatGPTAssessment !== null).length;
    if (assessmentsGenerated > 0) {
      console.log(`\n🤖 Assessments de ChatGPT generados: ${assessmentsGenerated}`);
      console.log(`   📁 Guardados en: documentos_markdown/assessments/`);
    }
    
    if (failed.length > 0) {
      console.log(`\n❌ Documentos con errores:`);
      failed.forEach(r => {
        console.log(`   - ${r.fileName}: ${r.error || 'Error desconocido'}`);
      });
    }
    
    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🤖 Evaluación de ChatGPT incluida en la validación\n');
  
  validateAllDocuments().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { validateDocument, validateAllDocuments };

