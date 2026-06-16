import juice from 'juice';

/**
 * Converts modern HTML from Tiptap to email-friendly HTML
 * - Inlines CSS styles
 * - Adds email-safe defaults
 * - Preserves variable placeholders like {{email}}
 */
export function convertToEmailHtml(html: string): string {
  // Wrap in email-safe container with basic styling
  const wrappedHtml = `
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: #374151;
            margin: 0;
            padding: 0;
          }
          h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 16px 0;
            color: #111827;
          }
          h2 {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 12px 0;
            color: #111827;
          }
          h3 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: #111827;
          }
          p {
            margin: 0 0 16px 0;
          }
          a {
            color: #3B82F6;
            text-decoration: underline;
          }
          ul, ol {
            margin: 0 0 16px 0;
            padding-left: 24px;
          }
          li {
            margin-bottom: 8px;
          }
          blockquote {
            margin: 0 0 16px 0;
            padding-left: 16px;
            border-left: 4px solid #E5E7EB;
            color: #6B7280;
          }
          code {
            background-color: #F3F4F6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
          }
          strong {
            font-weight: 600;
          }
          em {
            font-style: italic;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 0 0 16px 0;
          }
          th, td {
            border: 1px solid #E5E7EB;
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background-color: #F3F4F6;
            font-weight: 600;
          }
          .variable-placeholder {
            display: inline;
            background-color: #DBEAFE;
            color: #1E40AF;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #3B82F6;
            color: #FFFFFF;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  // Inline CSS using juice
  const inlined = juice(wrappedHtml, {
    preserveMediaQueries: false,
    preserveFontFaces: false,
    removeStyleTags: true,
    applyStyleTags: true,
  });

  // Extract just the body content
  const bodyMatch = inlined.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch && bodyMatch[1] ? bodyMatch[1].trim() : inlined;

  // Clean up Tiptap-specific artifacts
  const cleaned = bodyContent
    .replace(/\sdata-pm-slice="[^"]*"/g, '')
    .replace(/\sclass=""/g, '')
    .replace(/\sstyle=""/g, '');

  return cleaned;
}

/**
 * Wraps text content in a button element for CTAs
 */
export function createButtonHtml(text: string, href: string, color = '#3B82F6'): string {
  return `<a href="${href}" class="button" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 8px 0;">${text}</a>`;
}

/**
 * Converts plain HTML back to a format suitable for Tiptap
 * Preserves structure but removes email-specific inline styles
 */
export function convertFromEmailHtml(html: string): string {
  // Remove inline styles added by juice
  const cleaned = html.replace(/\sstyle="[^"]*"/g, '');

  // Preserve basic structure elements
  return cleaned.trim();
}
