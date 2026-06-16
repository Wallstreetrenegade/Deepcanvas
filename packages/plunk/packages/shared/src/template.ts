/**
 * Render email template by replacing variables
 * Supports {{variable}} and {{variable ?? defaultValue}} syntax
 * Also supports nested access like {{data.firstName}}
 *
 * Example:
 * renderTemplate('Hello {{name}}!', { name: 'World' }) -> 'Hello World!'
 * renderTemplate('Hello {{data.name}}!', { data: { name: 'World' } }) -> 'Hello World!'
 * renderTemplate('Hello {{name ?? Guest}}!', {}) -> 'Hello Guest!'
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const [mainKey, defaultValue] = key.split('??').map((s: string) => s.trim());

    // Handle nested property access (e.g., data.firstName)
    const getValue = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce((current: Record<string, unknown> | unknown, key) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, obj);
    };

    // Try multiple lookup strategies
    const value =
      getValue(variables, mainKey) || // Try as nested path (e.g., data.firstName)
      variables[mainKey] || // Try as top-level property
      (variables.data as Record<string, unknown>)?.[mainKey]; // Try in data object

    // Handle array values (for lists)
    if (Array.isArray(value)) {
      return value.map((e: string) => `<li>${e}</li>`).join('\n');
    }

    return value ?? defaultValue ?? '';
  });
}