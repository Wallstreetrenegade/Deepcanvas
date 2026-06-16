const RECENT_KEY = 'cmdPaletteRecents';
const MAX_RECENT = 5;

export interface RecentPage {
  label: string;
  href: string;
}

export function getRecentPages(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentPage[];
  } catch {
    return [];
  }
}

export function addRecentPage(page: RecentPage) {
  const current = getRecentPages().filter(p => p.href !== page.href);
  localStorage.setItem(RECENT_KEY, JSON.stringify([page, ...current].slice(0, MAX_RECENT)));
}

const STATIC_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/contacts': 'Contacts',
  '/segments': 'Segments',
  '/activity': 'Activity',
  '/analytics': 'Analytics',
  '/templates': 'Templates',
  '/workflows': 'Workflows',
  '/campaigns': 'Campaigns',
  '/settings': 'Settings',
  '/campaigns/create': 'New Campaign',
  '/templates/create': 'New Template',
  '/segments/new': 'New Segment',
};

const DYNAMIC_LABELS: [RegExp, string][] = [
  [/^\/contacts\/[^/]+$/, 'Contact'],
  [/^\/segments\/[^/]+$/, 'Segment'],
  [/^\/workflows\/[^/]+$/, 'Workflow'],
  [/^\/campaigns\/[^/]+$/, 'Campaign'],
  [/^\/templates\/[^/]+$/, 'Template'],
];

export function getFallbackLabel(pathname: string): string | null {
  if (STATIC_LABELS[pathname]) return STATIC_LABELS[pathname];
  for (const [pattern, label] of DYNAMIC_LABELS) {
    if (pattern.test(pathname)) return label;
  }
  return null;
}
