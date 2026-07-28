import { useEffect, useState } from 'react';

const IDENTITY_PATH = 'agent/jiuwenclaw_workspace/IDENTITY.md';

function cleanIdentityValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/^[-*\s]+/, '')
    .replace(/^_+|_+$/g, '')
    .trim();

  if (!cleaned) return null;

  const normalized = cleaned.replace(/^\(|\)$/g, '').trim().toLowerCase();
  if (
    normalized === 'pick something you like' ||
    normalized === 'ai? robot? familiar? ghost in the machine? something weirder?' ||
    normalized.startsWith('how do you come across?') ||
    normalized.startsWith('your signature') ||
    normalized.startsWith('workspace-relative path')
  ) {
    return null;
  }

  return cleaned;
}

function parseAssistantName(content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/-\s*\*\*Name:\*\*\s*(.*)$/i);
    if (!match) continue;

    const sameLineValue = cleanIdentityValue(match[1]);
    if (sameLineValue) return sameLineValue;

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (/^\s*-\s*\*\*/.test(nextLine)) return null;
      const nextValue = cleanIdentityValue(nextLine);
      if (nextValue) return nextValue;
    }
  }

  return null;
}

export function useAssistantName(fallback = 'Deep Canvas'): string {
  const [assistantName, setAssistantName] = useState(fallback);

  useEffect(() => {
    let cancelled = false;

    async function loadAssistantName() {
      try {
        const response = await fetch(
          `/file-api/file-content?path=${encodeURIComponent(IDENTITY_PATH)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) return;
        const content = await response.text();
        if (cancelled) return;
        const parsed = parseAssistantName(content);
        if (parsed) {
          setAssistantName(parsed);
        }
      } catch {
        // Keep fallback when identity is unavailable.
      }
    }

    void loadAssistantName();
    return () => {
      cancelled = true;
    };
  }, []);

  return assistantName;
}
