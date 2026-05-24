import { create } from 'zustand';
import { mirrorFeatureState } from '../services/piMirror';
import { webRequest } from '../services/webClient';

const STORAGE_KEY_PREFIX = 'deep_canvas_email_v1';
const EMAIL_STATE_VERSION = 1;

export type EmailEngine = 'resend' | 'postmark' | 'ses' | 'smtp';
export type EmailRightPanel = 'inbox' | 'templates' | 'campaigns';
export type EmailHydrationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EmailDraft {
  to: string;
  cc: string;
  bcc: string;
  from: string;
  subject: string;
  body: string;
  templateId: string | null;
  campaignId: string | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  templateId: string | null;
  recipientCount: number;
  status: 'draft' | 'queued' | 'sent';
  updatedAt: string;
}

export interface EmailInboxItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
}

export interface EmailSentItem {
  id: string;
  to: string[];
  from: string;
  subject: string;
  body: string;
  status: 'queued' | 'sent';
  createdAt: string;
  leadIds: string[];
}

interface StoredAuthUser {
  id: string;
  email: string;
}

interface EmailSendResponse {
  state?: unknown;
  sentItem?: unknown;
}

interface EmailStateResponse {
  state?: unknown;
}

interface EmailTestResponse {
  engine?: unknown;
  target?: unknown;
  message?: unknown;
}

interface EmailSnapshot {
  schemaVersion: number;
  engine: EmailEngine;
  rightPanel: EmailRightPanel;
  draft: EmailDraft;
  templates: EmailTemplate[];
  campaigns: EmailCampaign[];
  inbox: EmailInboxItem[];
  sent: EmailSentItem[];
  selectedInboxId: string | null;
  lastSavedAt: string;
}

interface EmailState extends EmailSnapshot {
  hydrationStatus: EmailHydrationStatus;
  hydrationError: string | null;
  hydrate: () => Promise<void>;
  setEngine: (engine: EmailEngine) => void;
  setRightPanel: (panel: EmailRightPanel) => void;
  setSelectedInboxId: (id: string | null) => void;
  updateDraftField: <K extends keyof EmailDraft>(key: K, value: EmailDraft[K]) => void;
  clearDraft: () => void;
  applyTemplate: (templateId: string) => void;
  saveTemplateFromDraft: (name: string) => EmailTemplate | null;
  createCampaignFromDraft: (name: string, recipientCount?: number) => EmailCampaign | null;
  sendDraft: (leadIds?: string[]) => Promise<EmailSentItem | null>;
  testEngine: () => Promise<string>;
  composeForRecipients: (recipients: Array<{ email: string; name?: string; leadId?: string }>, subject?: string) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value: unknown, maxLength = 10000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeEmails(value: unknown): string {
  const seen = new Set<string>();
  return cleanText(value, 2000)
    .split(/[,\n;]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part && part.includes('@'))
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join(', ');
}

function splitEmails(value: string): string[] {
  return normalizeEmails(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function readStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('exclaw_auth_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: Partial<StoredAuthUser> };
    if (!parsed.user?.id || !parsed.user.email) return null;
    return { id: parsed.user.id, email: parsed.user.email };
  } catch {
    return null;
  }
}

function localStorageKey(user: StoredAuthUser | null = readStoredAuthUser()): string {
  return user?.id ? `${STORAGE_KEY_PREFIX}_${user.id}` : `${STORAGE_KEY_PREFIX}_anonymous`;
}

function createDefaultDraft(user: StoredAuthUser | null = readStoredAuthUser()): EmailDraft {
  return {
    to: '',
    cc: '',
    bcc: '',
    from: user?.email || 'hello@deepcanvas.ai',
    subject: '',
    body: '',
    templateId: null,
    campaignId: null,
  };
}

function createDefaultSnapshot(): EmailSnapshot {
  return {
    schemaVersion: EMAIL_STATE_VERSION,
    engine: 'resend',
    rightPanel: 'inbox',
    draft: createDefaultDraft(),
    templates: [
      {
        id: 'template_intro',
        name: 'Intro',
        subject: 'Quick intro',
        body: 'Hi {{name}},\n\nI wanted to reach out with a quick intro.\n\nBest,\nDeep Canvas',
        updatedAt: nowIso(),
      },
      {
        id: 'template_followup',
        name: 'Follow-up',
        subject: 'Following up',
        body: 'Hi {{name}},\n\nChecking back in on the note below.\n\nBest,\nDeep Canvas',
        updatedAt: nowIso(),
      },
    ],
    campaigns: [],
    inbox: [
      {
        id: 'inbox_1',
        from: 'ops@deepcanvas.ai',
        subject: 'Shared inbox connected',
        preview: 'Email is ready to send and review from one place.',
        receivedAt: nowIso(),
        unread: true,
      },
    ],
    sent: [],
    selectedInboxId: 'inbox_1',
    lastSavedAt: nowIso(),
  };
}

function normalizeTemplate(value: unknown, index: number): EmailTemplate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 120);
  if (!name) return null;
  return {
    id: cleanText(raw.id, 80) || makeId(`template_${index}`),
    name,
    subject: cleanText(raw.subject, 240),
    body: cleanText(raw.body, 12000),
    updatedAt: cleanText(raw.updatedAt, 40) || nowIso(),
  };
}

function normalizeCampaign(value: unknown, index: number): EmailCampaign | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 120);
  if (!name) return null;
  const status = raw.status === 'queued' || raw.status === 'sent' ? raw.status : 'draft';
  return {
    id: cleanText(raw.id, 80) || makeId(`campaign_${index}`),
    name,
    subject: cleanText(raw.subject, 240),
    templateId: cleanText(raw.templateId, 80) || null,
    recipientCount: Number.isFinite(Number(raw.recipientCount)) ? Number(raw.recipientCount) : 0,
    status,
    updatedAt: cleanText(raw.updatedAt, 40) || nowIso(),
  };
}

function normalizeInboxItem(value: unknown, index: number): EmailInboxItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const subject = cleanText(raw.subject, 240);
  if (!subject) return null;
  return {
    id: cleanText(raw.id, 80) || makeId(`inbox_${index}`),
    from: cleanText(raw.from, 240),
    subject,
    preview: cleanText(raw.preview, 500),
    receivedAt: cleanText(raw.receivedAt, 40) || nowIso(),
    unread: raw.unread !== false,
  };
}

function normalizeSentItem(value: unknown, index: number): EmailSentItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const to = Array.isArray(raw.to) ? raw.to.map((item) => cleanText(item, 240)).filter(Boolean) : splitEmails(cleanText(raw.to, 1000));
  if (to.length === 0) return null;
  return {
    id: cleanText(raw.id, 80) || makeId(`sent_${index}`),
    to,
    from: cleanText(raw.from, 240),
    subject: cleanText(raw.subject, 240),
    body: cleanText(raw.body, 12000),
    status: raw.status === 'queued' ? 'queued' : 'sent',
    createdAt: cleanText(raw.createdAt, 40) || nowIso(),
    leadIds: Array.isArray(raw.leadIds) ? raw.leadIds.map((item) => cleanText(item, 80)).filter(Boolean) : [],
  };
}

function applySnapshot(
  set: (partial: Partial<EmailState>) => void,
  snapshot: EmailSnapshot,
  hydrationStatus: EmailHydrationStatus = 'ready'
): void {
  const next = touchSnapshot(snapshot);
  persistSnapshot(next);
  mirrorEmailSnapshot(next);
  set({ ...next, hydrationStatus, hydrationError: null });
}

function normalizeDraft(value: unknown, fallback: EmailDraft): EmailDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const raw = value as Partial<EmailDraft>;
  return {
    to: normalizeEmails(raw.to),
    cc: normalizeEmails(raw.cc),
    bcc: normalizeEmails(raw.bcc),
    from: cleanText(raw.from, 240) || fallback.from,
    subject: cleanText(raw.subject, 240),
    body: cleanText(raw.body, 12000),
    templateId: cleanText(raw.templateId, 80) || null,
    campaignId: cleanText(raw.campaignId, 80) || null,
  };
}

function normalizeSnapshot(value: unknown, fallback: EmailSnapshot = createDefaultSnapshot()): EmailSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const templates = Array.isArray(raw.templates) ? raw.templates.map(normalizeTemplate).filter((item): item is EmailTemplate => Boolean(item)) : fallback.templates;
  const campaigns = Array.isArray(raw.campaigns) ? raw.campaigns.map(normalizeCampaign).filter((item): item is EmailCampaign => Boolean(item)) : fallback.campaigns;
  const inbox = Array.isArray(raw.inbox) ? raw.inbox.map(normalizeInboxItem).filter((item): item is EmailInboxItem => Boolean(item)) : fallback.inbox;
  const sent = Array.isArray(raw.sent) ? raw.sent.map(normalizeSentItem).filter((item): item is EmailSentItem => Boolean(item)) : fallback.sent;
  const selectedInboxId = cleanText(raw.selectedInboxId, 80);
  return {
    schemaVersion: EMAIL_STATE_VERSION,
    engine: raw.engine === 'postmark' || raw.engine === 'ses' || raw.engine === 'smtp' ? raw.engine : fallback.engine,
    rightPanel: raw.rightPanel === 'inbox' || raw.rightPanel === 'campaigns' ? raw.rightPanel : fallback.rightPanel,
    draft: normalizeDraft(raw.draft, fallback.draft),
    templates: templates.length ? templates : fallback.templates,
    campaigns,
    inbox: inbox.length ? inbox : fallback.inbox,
    sent,
    selectedInboxId: inbox.some((item) => item.id === selectedInboxId) ? selectedInboxId : inbox[0]?.id ?? fallback.selectedInboxId,
    lastSavedAt: cleanText(raw.lastSavedAt, 40) || fallback.lastSavedAt,
  };
}

function persistSnapshot(snapshot: EmailSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localStorageKey(), JSON.stringify(snapshot));
  } catch {
    // ignore local cache failures
  }
}

function readLocalSnapshot(): EmailSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey());
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function mirrorEmailSnapshot(snapshot: EmailSnapshot): void {
  mirrorFeatureState('email', {
    schemaVersion: snapshot.schemaVersion,
    engine: snapshot.engine,
    draft: snapshot.draft,
    templates: snapshot.templates,
    campaigns: snapshot.campaigns,
    inbox: snapshot.inbox,
    sent: snapshot.sent,
    rightPanel: snapshot.rightPanel,
    selectedInboxId: snapshot.selectedInboxId,
    lastSavedAt: snapshot.lastSavedAt,
  });
}

function touchSnapshot(snapshot: EmailSnapshot): EmailSnapshot {
  return { ...snapshot, schemaVersion: EMAIL_STATE_VERSION, lastSavedAt: nowIso() };
}

function commitSnapshot(
  set: (partial: Partial<EmailState> | ((state: EmailState) => Partial<EmailState>)) => void,
  snapshotOrUpdater: EmailSnapshot | ((state: EmailState) => EmailSnapshot)
) {
  set((state) => {
    const rawNext = typeof snapshotOrUpdater === 'function' ? snapshotOrUpdater(state) : snapshotOrUpdater;
    const next = touchSnapshot(rawNext);
    persistSnapshot(next);
    mirrorEmailSnapshot(next);
    return {
      ...next,
      hydrationStatus: state.hydrationStatus === 'idle' ? 'ready' : state.hydrationStatus,
      hydrationError: null,
    };
  });
}

const initialSnapshot = readLocalSnapshot() ?? createDefaultSnapshot();

export const EMAIL_ENGINE_OPTIONS: Array<{ value: EmailEngine; label: string }> = [
  { value: 'resend', label: 'Resend' },
  { value: 'postmark', label: 'Postmark' },
  { value: 'ses', label: 'SES' },
  { value: 'smtp', label: 'SMTP' },
];

export const useEmailStore = create<EmailState>((set, get) => ({
  ...initialSnapshot,
  hydrationStatus: 'idle',
  hydrationError: null,

  hydrate: async () => {
    if (get().hydrationStatus === 'loading') return;
    set({ hydrationStatus: 'loading', hydrationError: null });
    try {
      const response = await webRequest<EmailStateResponse>('email.get_state', {}, { timeoutMs: 12000 });
      const remoteSnapshot = normalizeSnapshot(response?.state, createDefaultSnapshot());
      const localSnapshot = readLocalSnapshot();
      applySnapshot(set, localSnapshot ?? remoteSnapshot, 'ready');
    } catch (error) {
      const fallback = readLocalSnapshot() ?? createDefaultSnapshot();
      set({
        ...fallback,
        hydrationStatus: 'error',
        hydrationError: error instanceof Error ? error.message : 'Failed to load email state',
      });
    }
  },

  setEngine: (engine) => commitSnapshot(set, (state) => ({ ...state, engine })),
  setRightPanel: (rightPanel) => commitSnapshot(set, (state) => ({ ...state, rightPanel })),
  setSelectedInboxId: (selectedInboxId) => commitSnapshot(set, (state) => ({
    ...state,
    selectedInboxId,
    inbox: state.inbox.map((item) => item.id === selectedInboxId ? { ...item, unread: false } : item),
  })),

  updateDraftField: (key, value) => commitSnapshot(set, (state) => ({
    ...state,
    draft: {
      ...state.draft,
      [key]: key === 'to' || key === 'cc' || key === 'bcc' ? normalizeEmails(value) : value,
    },
  })),

  clearDraft: () => commitSnapshot(set, (state) => ({
    ...state,
    draft: createDefaultDraft(),
  })),

  applyTemplate: (templateId) => commitSnapshot(set, (state) => {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return state;
    return {
      ...state,
      draft: {
        ...state.draft,
        subject: template.subject,
        body: template.body,
        templateId: template.id,
      },
      rightPanel: 'templates',
    };
  }),

  saveTemplateFromDraft: (name) => {
    const cleanName = cleanText(name, 120);
    if (!cleanName) return null;
    let saved: EmailTemplate | null = null;
    commitSnapshot(set, (state) => {
      const templateId = state.draft.templateId;
      const nextTemplate: EmailTemplate = {
        id: templateId || makeId('template'),
        name: cleanName,
        subject: state.draft.subject,
        body: state.draft.body,
        updatedAt: nowIso(),
      };
      saved = nextTemplate;
      const templates = templateId
        ? state.templates.map((item) => item.id === templateId ? nextTemplate : item)
        : [nextTemplate, ...state.templates];
      return {
        ...state,
        templates,
        rightPanel: 'templates',
        draft: { ...state.draft, templateId: nextTemplate.id },
      };
    });
    return saved;
  },

  createCampaignFromDraft: (name, recipientCount = splitEmails(get().draft.to).length) => {
    const cleanName = cleanText(name, 120);
    if (!cleanName) return null;
    let campaign: EmailCampaign | null = null;
    commitSnapshot(set, (state) => {
      campaign = {
        id: makeId('campaign'),
        name: cleanName,
        subject: state.draft.subject,
        templateId: state.draft.templateId,
        recipientCount,
        status: 'draft',
        updatedAt: nowIso(),
      };
      return {
        ...state,
        campaigns: [campaign, ...state.campaigns],
        rightPanel: 'campaigns',
        draft: { ...state.draft, campaignId: campaign.id },
      };
    });
    return campaign;
  },

  sendDraft: async (leadIds = []) => {
    const state = get();
    if (!splitEmails(state.draft.to).length || !state.draft.subject.trim() || !state.draft.body.trim()) {
      return null;
    }
    const response = await webRequest<EmailSendResponse>(
      'email.send',
      { engine: state.engine, draft: state.draft, leadIds },
      { timeoutMs: 90000 }
    );
    applySnapshot(set, normalizeSnapshot(response?.state, state), get().hydrationStatus === 'idle' ? 'ready' : get().hydrationStatus);
    return normalizeSentItem(response?.sentItem, 0);
  },

  testEngine: async () => {
    const state = get();
    const target = splitEmails(state.draft.to)[0] || state.draft.from;
    const response = await webRequest<EmailTestResponse>(
      'email.test_provider',
      { engine: state.engine, target },
      { timeoutMs: 90000 }
    );
    return cleanText(response?.message, 240) || `Test email sent to ${cleanText(response?.target, 240) || target}`;
  },

  composeForRecipients: (recipients, subject = '') => commitSnapshot(set, (state) => {
    const valid = recipients.filter((item) => item.email?.trim());
    const to = valid.map((item) => item.email.trim().toLowerCase()).join(', ');
    return {
      ...state,
      rightPanel: 'templates',
      draft: {
        ...state.draft,
        to,
        subject: subject || state.draft.subject,
        templateId: null,
        campaignId: null,
      },
    };
  }),
}));
