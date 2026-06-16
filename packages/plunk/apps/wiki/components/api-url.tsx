// Simple components that render the base URLs
// Runtime environment configuration
// Reads from window.__ENV__ (set by /__env.js at runtime in Docker)
// Falls back to process.env.NEXT_PUBLIC_* (for development)

'use client';

declare global {
  interface Window {
    __ENV__?: {
      API_URI?: string;
      DASHBOARD_URI?: string;
      LANDING_URI?: string;
      WIKI_URI?: string;
    };
  }
}

const getRuntimeEnv = (key: keyof NonNullable<typeof window.__ENV__>) => {
  // Client-side: read from window.__ENV__
  if (typeof window !== 'undefined' && window.__ENV__) {
    return window.__ENV__[key];
  }
  // Server-side: read from process.env (loaded from .env file in standalone mode)
  if (typeof window === 'undefined') {
    return process.env[key];
  }
  return undefined;
};

export function ApiUrl({path = ''}: {path?: string}) {
  const baseUrl = getRuntimeEnv('API_URI') || process.env.NEXT_PUBLIC_API_URI || 'https://next-api.useplunk.com';
  return (
    <code>
      {baseUrl}
      {path}
    </code>
  );
}

export function DashboardUrl({path = ''}: {path?: string}) {
  const baseUrl =
    getRuntimeEnv('DASHBOARD_URI') || process.env.NEXT_PUBLIC_DASHBOARD_URI || 'https://next-app.useplunk.com';
  return (
    <code>
      {baseUrl}
      {path}
    </code>
  );
}
