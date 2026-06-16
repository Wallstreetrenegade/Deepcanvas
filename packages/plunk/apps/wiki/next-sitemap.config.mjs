/** @type {import('next-sitemap').IConfig} */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively find all MDX files in a directory
 */
function findMdxFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findMdxFiles(filePath, fileList);
    } else if (file.endsWith('.mdx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Convert file path to URL path
 * Example: content/docs/getting-started/introduction.mdx -> /getting-started/introduction
 */
function filePathToUrl(filePath) {
  const contentDocsPath = path.join(__dirname, 'content', 'docs');
  const relativePath = path.relative(contentDocsPath, filePath);
  const withoutExt = relativePath.replace(/\.mdx$/, '');

  // Convert index.mdx to root path
  if (withoutExt === 'index') {
    return '/';
  }

  // Convert path separators to forward slashes
  return '/' + withoutExt.split(path.sep).join('/');
}

const config = {
  siteUrl: process.env.NEXT_PUBLIC_WIKI_URI || 'https://docs.useplunk.com',
  generateRobotsTxt: true,
  additionalPaths: async () => {
    const contentDocsPath = path.join(__dirname, 'content', 'docs');

    // Find all MDX files
    const mdxFiles = findMdxFiles(contentDocsPath);

    // Convert to sitemap entries
    return mdxFiles.map(filePath => ({
      loc: filePathToUrl(filePath),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date().toISOString(),
    }));
  },
};

export default config;
