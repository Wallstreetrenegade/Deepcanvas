/**
 * Color palette for the email editor toolbar
 * Organized by hue using Tailwind color values
 */
export const EDITOR_COLOR_GROUPS = [
  {
    name: 'Neutrals',
    colors: ['#000000', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#F3F4F6', '#FFFFFF'],
  },
  {
    name: 'Reds',
    colors: ['#7F1D1D', '#991B1B', '#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FEE2E2'],
  },
  {
    name: 'Oranges',
    colors: ['#7C2D12', '#C2410C', '#EA580C', '#F97316', '#FB923C', '#FDBA74', '#FED7AA'],
  },
  {
    name: 'Yellows',
    colors: ['#713F12', '#A16207', '#CA8A04', '#EAB308', '#FACC15', '#FDE047', '#FEF08A'],
  },
  {
    name: 'Greens',
    colors: ['#14532D', '#15803D', '#16A34A', '#22C55E', '#4ADE80', '#86EFAC', '#BBF7D0'],
  },
  {
    name: 'Blues',
    colors: ['#1E3A8A', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE'],
  },
  {
    name: 'Purples',
    colors: ['#581C87', '#6B21A8', '#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#E9D5FF'],
  },
  {
    name: 'Pinks',
    colors: ['#831843', '#9F1239', '#DB2777', '#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8'],
  },
] as const;
