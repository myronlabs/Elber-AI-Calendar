#!/usr/bin/env node

/**
 * Fix import paths after TypeScript compilation
 * Converts @services and @types aliases to correct relative paths
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FUNCTIONS_DIR = path.resolve(__dirname, '../../../netlify/functions');

/**
 * Process a directory recursively
 */
async function processDirectory(directory) {
  console.log(`Processing directory: ${directory}`);
  const results = [];
  
  try {
    const entries = await fs.readdir(directory);
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        const subResults = await processDirectory(fullPath);
        results.push(...subResults);
      } else if (stats.isFile() && fullPath.endsWith('.js')) {
        const result = await fixImportPaths(fullPath);
        results.push(result);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${directory}:`, error);
  }
  
  return results;
}

/**
 * Fix import paths in a single file
 */
async function fixImportPaths(filePath) {
  try {
    console.log(`Fixing imports in: ${filePath}`);
    
    let content = await fs.readFile(filePath, 'utf8');
    const originalContent = content;
    
    // Fix @services alias imports
    // The compiled JS has these as relative paths like ../../services/
    // We need to change them to ./services/
    content = content.replace(
      /require\(['"]\.\.\/\.\.\/services\/(.*?)['"]\)/g,
      "require('./services/$1')"
    );
    
    // Also handle the @services pattern if it still exists
    content = content.replace(
      /require\(['"]@services\/(.*?)['"]\)/g,
      "require('./services/$1')"
    );
    
    // Fix @types alias imports
    content = content.replace(
      /require\(['"]\.\.\/\.\.\/types\/(.*?)['"]\)/g,
      "require('./types/$1')"
    );
    
    content = content.replace(
      /require\(['"]@types\/(.*?)['"]\)/g,
      "require('./types/$1')"
    );
    
    // Fix relative imports to shared utils within functions
    // This should remain relative to the function
    content = content.replace(
      /require\(['"]\.\/functions\/_shared\/(.*?)['"]\)/g,
      "require('./_shared/$1')"
    );
    
    // Only write if content changed
    if (content !== originalContent) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✓ Fixed imports in: ${filePath}`);
      return { file: filePath, success: true };
    } else {
      console.log(`  No changes needed for: ${filePath}`);
      return { file: filePath, success: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error fixing imports in ${filePath}:`, error);
    return { file: filePath, success: false, error: errorMessage };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Post-build script: Fixing import paths...');
  
  try {
    // Process the functions directory
    const results = await processDirectory(FUNCTIONS_DIR);
    
    // Summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log('\n=== Import Path Fix Summary ===');
    console.log(`Total files processed: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    
    if (failureCount > 0) {
      console.log('\n⚠️  Failed files:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.file}: ${r.error}`);
      });
    }
    
    console.log('\nPost-build script completed.');
  } catch (error) {
    console.error('Post-build script failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();