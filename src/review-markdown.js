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
 * Lee el assessment y extrae las sugerencias
 */
async function readAssessment(assessmentPath) {
  try {
    const content = await fs.readFile(assessmentPath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Error leyendo assessment: ${error.message}`);
  }
}

/**
 * Solicita a ChatGPT que revise y corrija el documento markdown
 */
async function reviewMarkdownWithChatGPT(originalFileName, originalText, currentMarkdown, assessmentContent) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

  // Preparar el prompt con toda la información
  const prompt = `Eres un experto en conversión precisa de documentos a formato Markdown. Estoy trabajando en documentos que se utilizarán para solicitar financiamiento, por lo que la precisión es CRÍTICA.

## Contexto

He convertido el documento "${originalFileName}" a formato Markdown usando ChatGPT, y he realizado una evaluación que incluye sugerencias de mejora. Ahora necesito que revises y corrijas el documento markdown para lograr una reproducción fiel del documento original.

## 1. Texto Original Extraído

Este es el texto extraído del documento original (${originalFileName}):

${originalText.substring(0, 8000)}${originalText.length > 8000 ? '\n\n[... texto truncado por límites del prompt ...]' : ''}

## 2. Documento Markdown Actual

Este es el documento markdown generado que necesitas revisar y corregir:

${currentMarkdown}

## 3. Assessment y Sugerencias

Esta es la evaluación completa del documento markdown actual, incluyendo sugerencias específicas:

${assessmentContent}

---

## Tu Tarea

Basándote en:
1. **El texto original extraído** (como referencia de la fuente de verdad)
2. **El documento markdown actual** (lo que necesitas mejorar)
3. **Las sugerencias del assessment** (puntos específicos a corregir)

Por favor:

1. **Revisa el documento markdown** comparándolo cuidadosamente con el texto original
2. **Implementa las correcciones sugeridas** en el assessment, si son pertinentes y mejoran la fidelidad al documento original
3. **Corrige cualquier error, omisión o imprecisión** que identifiques comparando con el texto original
4. **Mejora la estructura y formato** si es necesario para mayor claridad, manteniendo siempre la fidelidad al contenido original
5. **Asegura que toda la información importante esté presente** y correctamente representada

## Requisitos CRÍTICOS:

- ✅ **PRECISIÓN ABSOLUTA**: Cada detalle del documento original debe estar correctamente representado
- ✅ **COMPLETITUD**: Toda la información importante debe estar incluida
- ✅ **FIDELIDAD**: El contenido debe ser fiel al original, sin añadir información que no esté presente
- ✅ **FORMATO CLARO**: El markdown debe estar bien estructurado y legible
- ✅ **IMPORTANCIA**: Estos documentos se usan para solicitar financiamiento, errores pueden ser críticos

Por favor, devuelve ÚNICAMENTE el documento markdown corregido y mejorado, sin explicaciones adicionales ni comentarios. El resultado debe ser un documento markdown completo, listo para usar.`;

  try {
    console.log(`   🤖 Enviando a ChatGPT para revisión y corrección...`);
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en conversión precisa de documentos a Markdown. Tu objetivo es crear documentos markdown que sean fieles, completos y precisos respecto al documento original. Trabajas con documentos críticos para solicitar financiamiento, por lo que la precisión es esencial.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error(`   ❌ Error en revisión de ChatGPT: ${error.message}`);
    throw error;
  }
}

/**
 * Revisa un documento markdown específico
 */
async function reviewDocument(markdownPath) {
  const fileName = path.basename(markdownPath);
  const baseName = fileName.replace('_gpt-5-nano.md', '');
  
  console.log(`\n📄 Revisando: ${fileName}`);
  
  try {
    // 1. Leer el documento markdown actual
    console.log(`   📝 Leyendo documento markdown...`);
    const currentMarkdown = await fs.readFile(markdownPath, 'utf-8');
    
    // 2. Encontrar y leer el documento original
    const documentosDir = path.join(__dirname, '..', 'documentos');
    const originalFiles = await fs.readdir(documentosDir);
    
    const originalFile = originalFiles.find(f => {
      const nameWithoutExt = path.basename(f, path.extname(f));
      return baseName.includes(nameWithoutExt) || nameWithoutExt.includes(baseName.replace(/_/g, ' '));
    });
    
    if (!originalFile) {
      throw new Error(`No se encontró el documento original para ${fileName}`);
    }
    
    const originalPath = path.join(documentosDir, originalFile);
    console.log(`   📖 Extrayendo texto del documento original: ${originalFile}...`);
    const originalText = await extractTextFromOriginal(originalPath);
    
    // 3. Leer el assessment
    const assessmentDir = path.join(__dirname, '..', 'documentos_markdown', 'assessments');
    const assessmentFileName = `${baseName}_assessment.md`;
    const assessmentPath = path.join(assessmentDir, assessmentFileName);
    
    let assessmentContent = '';
    try {
      console.log(`   📋 Leyendo assessment: ${assessmentFileName}...`);
      assessmentContent = await readAssessment(assessmentPath);
    } catch (error) {
      console.log(`   ⚠️  No se encontró assessment, continuando sin sugerencias...`);
      assessmentContent = 'No se encontró assessment con sugerencias específicas. Revisa el documento comparándolo cuidadosamente con el texto original.';
    }
    
    // 4. Solicitar revisión a ChatGPT
    const reviewedMarkdown = await reviewMarkdownWithChatGPT(
      originalFile,
      originalText,
      currentMarkdown,
      assessmentContent
    );
    
    if (!reviewedMarkdown || reviewedMarkdown.trim().length === 0) {
      throw new Error('ChatGPT no devolvió contenido revisado');
    }
    
    // 5. Guardar el documento revisado
    const markdownDir = path.join(__dirname, '..', 'documentos_markdown');
    const reviewedFileName = `${baseName}_revisado.md`;
    const reviewedPath = path.join(markdownDir, reviewedFileName);
    
    await fs.writeFile(reviewedPath, reviewedMarkdown, 'utf-8');
    console.log(`   ✅ Documento revisado guardado: ${reviewedFileName}`);
    
    return {
      success: true,
      originalFile,
      markdownFile: fileName,
      reviewedFile: reviewedFileName,
      reviewedPath
    };
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return {
      success: false,
      fileName,
      error: error.message
    };
  }
}

/**
 * Revisa todos los documentos markdown
 */
async function reviewAllDocuments() {
  const markdownDir = path.join(__dirname, '..', 'documentos_markdown');
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 REVISIÓN DE DOCUMENTOS MARKDOWN`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📁 Documentos markdown: ${markdownDir}`);
    
    // Leer archivos markdown de gpt-5-nano (excluir los revisados y assessments)
    const allFiles = await fs.readdir(markdownDir);
    const markdownFiles = allFiles
      .filter(f => f.endsWith('.md') && f.includes('gpt-5-nano') && !f.includes('_revisado') && !f.includes('assessment'))
      .map(f => path.join(markdownDir, f));
    
    if (markdownFiles.length === 0) {
      console.log('\n⚠️  No se encontraron archivos markdown de gpt-5-nano para revisar');
      return;
    }
    
    console.log(`\n📋 Archivos a revisar: ${markdownFiles.length}`);
    
    const results = [];
    
    for (const markdownFile of markdownFiles) {
      const result = await reviewDocument(markdownFile);
      results.push(result);
    }
    
    // Resumen
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 RESUMEN DE REVISIÓN`);
    console.log(`${'='.repeat(60)}`);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`\n📈 Estadísticas:`);
    console.log(`   Total procesados: ${results.length}`);
    console.log(`   ✅ Exitosos: ${successful.length}`);
    console.log(`   ❌ Fallidos: ${failed.length}`);
    
    if (successful.length > 0) {
      console.log(`\n✅ Documentos revisados exitosamente:`);
      successful.forEach(r => {
        console.log(`   - ${r.reviewedFile}`);
      });
    }
    
    if (failed.length > 0) {
      console.log(`\n❌ Documentos con errores:`);
      failed.forEach(r => {
        console.log(`   - ${r.fileName || 'Desconocido'}: ${r.error || 'Error desconocido'}`);
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
  console.log('🤖 Revisión con ChatGPT habilitada\n');
  
  reviewAllDocuments().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { reviewDocument, reviewAllDocuments };

