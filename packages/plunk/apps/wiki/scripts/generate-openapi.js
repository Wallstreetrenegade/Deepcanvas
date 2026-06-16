#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {config} from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Load environment variables from .env file (optional - for local development)
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  config({path: envPath});
}

const templatePath = path.join(projectRoot, 'openapi.json');
const localPath = path.join(projectRoot, 'openapi.local.json');

if (!fs.existsSync(templatePath)) {
  console.error('❌ openapi.json template not found');
  process.exit(1);
}

try {
  // In development: Replace URLs with local values
  // In Docker: Just copy the file - URLs will be replaced at container startup
  const isDevelopment =
    process.env.API_URI?.includes('localhost') || process.env.NEXT_PUBLIC_API_URI?.includes('localhost');

  if (isDevelopment) {
    // Local development - replace with localhost URLs
    let content = fs.readFileSync(templatePath, 'utf-8');
    const apiUrl = process.env.API_URI || process.env.NEXT_PUBLIC_API_URI || 'http://localhost:8080';
    const description = 'Development server';

    content = content.replace(/"url":\s*"https:\/\/api\.useplunk\.com"/, `"url": "${apiUrl}"`);
    content = content.replace(/"description":\s*"Production server"/, `"description": "${description}"`);

    fs.writeFileSync(localPath, content, 'utf-8');
    console.log(`✓ Generated openapi.local.json with server URL: ${apiUrl}`);
  } else {
    // Docker build - just copy template (URLs will be replaced at runtime)
    fs.copyFileSync(templatePath, localPath);
    console.log('✓ Copied openapi.json to openapi.local.json (URLs will be replaced at runtime)');
  }
} catch (error) {
  console.error('❌ Failed to generate openapi.local.json:', error.message);
  process.exit(1);
}
