import {generateFiles} from 'fumadocs-openapi';
import fs from 'fs';

// Import the shared openapi instance (fumadocs recommended pattern)
import {openapi} from '../lib/openapi.js';

try {
  // Check if openapi.local.json exists
  if (!fs.existsSync('./openapi.local.json')) {
    console.error('❌ openapi.local.json not found! Run generate-openapi.js first.');
    process.exit(1);
  }

  // Must await the promise! The 'void' keyword was causing early exit
  await generateFiles({
    input: openapi,
    output: './content/docs/api-reference',
    groupBy: 'tag',
    per: 'operation',
    includeDescription: true,
  });

  // Verify files were created
  const generatedFiles = fs
    .readdirSync('./content/docs/api-reference', {recursive: true})
    .filter(f => f.toString().endsWith('.mdx') && f.toString().includes('/'));

  console.log(`✅ API documentation generated successfully! Created ${generatedFiles.length} endpoint pages.`);

  if (generatedFiles.length === 0) {
    console.warn('⚠️  Warning: No endpoint pages were generated. Check your OpenAPI spec.');
  }
} catch (error) {
  console.error('❌ Failed to generate API documentation:', error.message);
  process.exit(1);
}
