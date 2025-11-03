import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Limpia headers/footers duplicados comunes en documentos extraídos de PDFs
 */
function cleanDuplicatedHeadersFooters(content) {
  let cleaned = content;

  // Patrón de información de contacto que aparece en headers/footers
  const contactPattern = /www\.mododigital\.uy Misiones, 1280 \+598 2915 3404\s*\n\s*\nMontevideo, Uruguay/g;
  
  // Contar cuántas veces aparece
  const matches = content.match(contactPattern);
  if (matches && matches.length > 1) {
    // Reemplazar todas las ocurrencias excepto la última (que puede ser footer legítimo al final)
    const lines = cleaned.split('\n');
    let cleanedLines = [];
    let lastContactIndex = -1;
    
    // Encontrar la última ocurrencia
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('www.mododigital.uy') || 
          (i > 0 && lines[i-1].includes('www.mododigital.uy'))) {
        lastContactIndex = i;
        break;
      }
    }
    
    // Eliminar ocurrencias intermedias
    let skipNext = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detectar inicio de bloque de contacto
      if (line.includes('www.mododigital.uy')) {
        // Si no es la última ocurrencia, eliminarla
        if (i !== lastContactIndex && i !== lastContactIndex - 1) {
          skipNext = true;
          // Saltar esta línea y las siguientes hasta encontrar una línea no vacía
          continue;
        }
      }
      
      // Detectar línea de "Montevideo, Uruguay" que sigue al contacto
      if (line.trim() === 'Montevideo, Uruguay' && skipNext) {
        skipNext = false;
        continue;
      }
      
      // Saltar líneas vacías después de un bloque de contacto eliminado
      if (skipNext && line.trim() === '') {
        continue;
      }
      
      skipNext = false;
      cleanedLines.push(line);
    }
    
    cleaned = cleanedLines.join('\n');
  }

  // Limpiar bloques vacíos múltiples (más de 2 líneas vacías consecutivas)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * Limpia un archivo markdown específico
 */
async function cleanMarkdownFile(filePath) {
  console.log(`\n🧹 Limpiando: ${path.basename(filePath)}`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const originalLength = content.length;
    const originalLines = content.split('\n').length;

    // Aplicar limpiezas (solo headers/footers obvios)
    let cleaned = cleanDuplicatedHeadersFooters(content);
    
    // Limpiar líneas vacías al inicio y final
    cleaned = cleaned.trim();

    const newLength = cleaned.length;
    const newLines = cleaned.split('\n').length;

    // Guardar archivo limpio
    await fs.writeFile(filePath, cleaned, 'utf-8');

    console.log(`   ✓ Limpieza completada`);
    console.log(`   📊 Original: ${originalLines} líneas, ${originalLength.toLocaleString()} caracteres`);
    console.log(`   📊 Limpio: ${newLines} líneas, ${newLength.toLocaleString()} caracteres`);
    console.log(`   📉 Reducción: ${(originalLines - newLines)} líneas eliminadas`);

    return { originalLines, newLines, originalLength, newLength };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Limpia todos los archivos markdown en la carpeta documentos_markdown
 */
async function cleanAllMarkdownFiles() {
  const markdownDir = path.join(__dirname, '..', 'documentos_markdown');
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧹 LIMPIEZA DE ARCHIVOS MARKDOWN`);
    console.log(`${'='.repeat(60)}`);

    const files = await fs.readdir(markdownDir);
    const markdownFiles = files.filter(f => f.endsWith('.md') && f.includes('gpt-5-nano'));

    if (markdownFiles.length === 0) {
      console.log('\n⚠️  No se encontraron archivos markdown de gpt-5-nano para limpiar');
      return;
    }

    console.log(`\n📋 Archivos encontrados: ${markdownFiles.length}`);

    const results = [];
    for (const file of markdownFiles) {
      const filePath = path.join(markdownDir, file);
      try {
        const result = await cleanMarkdownFile(filePath);
        results.push({ file, ...result, success: true });
      } catch (error) {
        results.push({ file, success: false, error: error.message });
      }
    }

    // Resumen
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 RESUMEN DE LIMPIEZA`);
    console.log(`${'='.repeat(60)}`);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Archivos limpiados: ${successful.length}`);
    console.log(`❌ Archivos con errores: ${failed.length}`);
    
    if (successful.length > 0) {
      const totalLinesRemoved = successful.reduce((sum, r) => sum + (r.originalLines - r.newLines), 0);
      console.log(`📉 Total de líneas eliminadas: ${totalLinesRemoved}`);
    }

    if (failed.length > 0) {
      console.log(`\n⚠️  Archivos con errores:`);
      failed.forEach(r => console.log(`   - ${r.file}: ${r.error}`));
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanAllMarkdownFiles().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { cleanMarkdownFile, cleanAllMarkdownFiles };

