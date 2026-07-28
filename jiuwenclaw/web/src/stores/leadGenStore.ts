import { create } from 'zustand';
import { mirrorFeatureState } from '../services/piMirror';
import { webRequest } from '../services/webClient';

const STORAGE_KEY = 'deep_canvas_lead_gen_v2';

export type LeadGenLeadStatus = 'new' | 'researching' | 'contacted' | 'qualified' | 'meeting' | 'proposal' | 'won' | 'lost';
export type LeadGenCampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type LeadGenSourceKey =
  | 'url'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'linkedin'
  | 'web'
  | 'maps'
  | 'reddit'
  | 'x'
  | 'youtube'
  | 'zillow'
  | 'realtor'
  | 'redfin'
  | 'loopnet';

export interface LeadGenNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface LeadGenSignal {
  id: string;
  label: string;
  detail: string;
}

export interface LeadGenProspect {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  source: string;
  status: LeadGenLeadStatus;
  score: number;
  tags: string[];
  notes: LeadGenNote[];
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  profileUrl?: string;
  location?: string;
  experience?: string;
  industry?: string;
  summary?: string;
  avatarColor?: string;
  referenceBadges?: string[];
  signals?: LeadGenSignal[];
  batchName?: string;
  sourceKey?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourceQuery?: string;
  sourceMode?: string;
  sourceActorId?: string;
  scrapedAt?: string;
}

export interface LeadGenCampaign {
  id: string;
  name: string;
  audience: string;
  offer: string;
  channel: string;
  status: LeadGenCampaignStatus;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadGenSearchCriteria {
  request: string;
  geography: string;
  includeKeywords: string;
  excludeKeywords: string;
  freshness: string;
  limit: number;
  sources: LeadGenSourceKey[];
  directUrls: string;
  resultType: string;
  community: string;
  maxPosts: number;
}

export interface LeadGenUsage {
  enabled: boolean;
  accountKey: string;
  creditsRemaining: number;
  creditsUsed: number;
  creditsCharged?: number;
  creditsEstimated?: number;
  billingMode: string;
  updatedAt?: string;
}

export interface LeadGenCreditPackage {
  id: string;
  label: string;
  credits: number;
  price: string;
  highlight?: boolean;
}

export interface LeadGenSourceCapability {
  key: LeadGenSourceKey;
  label: string;
  mode: string;
  actorId: string;
  nativeActor: boolean;
  requiresDirectUrls: boolean;
  resultTypes: string[];
  available: boolean;
  fallback: boolean;
}

export interface LeadGenCatalog {
  apiKeyConfigured: boolean;
  mcpUrl: string;
  usage: LeadGenUsage;
  sources: LeadGenSourceCapability[];
  defaultSources: LeadGenSourceKey[];
  advancedFields: string[];
  creditPackages?: LeadGenCreditPackage[];
}

interface LeadGenSnapshot {
  schemaVersion: number;
  prospects: LeadGenProspect[];
  campaigns: LeadGenCampaign[];
  searchQuery: string;
  selectedProspectId: string | null;
  searchResults: LeadGenProspect[];
  selectedResultIds: string[];
  activeResultId: string | null;
  searchCriteria: LeadGenSearchCriteria;
  lastSearchMessage: string;
  catalog: LeadGenCatalog | null;
  usage: LeadGenUsage | null;
  creditPackages: LeadGenCreditPackage[];
  updatedAt: string;
}

interface LeadGenSearchResponse {
  message?: string;
  prospects?: unknown[];
  catalog?: LeadGenCatalog;
  usage?: LeadGenUsage;
}

interface LeadGenCreditPackagesResponse {
  packages?: LeadGenCreditPackage[];
  usage?: LeadGenUsage;
}

interface LeadGenCheckoutResponse {
  status?: string;
  package?: LeadGenCreditPackage;
  checkoutUrl?: string;
  usage?: LeadGenUsage;
  message?: string;
}

interface LeadGenState extends LeadGenSnapshot {
  isSearching: boolean;
  isCatalogLoading: boolean;
  searchError: string | null;
  catalogError: string | null;
  checkoutMessage: string;
  checkoutError: string | null;
  setSearchQuery: (value: string) => void;
  setSearchCriteria: (patch: Partial<LeadGenSearchCriteria>) => void;
  selectProspect: (prospectId: string | null) => void;
  setActiveResult: (prospectId: string | null) => void;
  toggleResultSelection: (prospectId: string) => void;
  selectAllResults: () => void;
  clearResultSelection: () => void;
  clearResults: () => void;
  loadCatalog: () => Promise<void>;
  loadCreditPackages: () => Promise<void>;
  startCreditCheckout: (packageId: string) => Promise<LeadGenCheckoutResponse | null>;
  runSearch: () => Promise<void>;
  addProspect: (input: Partial<Omit<LeadGenProspect, 'id' | 'notes' | 'createdAt' | 'updatedAt'>>) => LeadGenProspect | null;
  addProspectsFromResults: (prospects: LeadGenProspect[], batchName: string) => LeadGenProspect[];
  updateProspect: (prospectId: string, updates: Partial<Omit<LeadGenProspect, 'id' | 'notes' | 'createdAt' | 'updatedAt'>>) => void;
  addProspectNote: (prospectId: string, body: string) => void;
  deleteProspect: (prospectId: string) => void;
  addCampaign: (input: Partial<Omit<LeadGenCampaign, 'id' | 'createdAt' | 'updatedAt'>>) => LeadGenCampaign | null;
  updateCampaign: (campaignId: string, updates: Partial<Omit<LeadGenCampaign, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  attachProspectToCampaign: (campaignId: string, prospectId: string) => void;
  detachProspectFromCampaign: (campaignId: string, prospectId: string) => void;
  deleteCampaign: (campaignId: string) => void;
}

export const LEAD_GEN_SOURCE_OPTIONS: Array<{ key: LeadGenSourceKey; label: string }> = [
  { key: 'url', label: 'URL' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'web', label: 'Web' },
  { key: 'maps', label: 'Maps' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'zillow', label: 'Zillow' },
  { key: 'realtor', label: 'Realtor' },
  { key: 'redfin', label: 'Redfin' },
  { key: 'loopnet', label: 'LoopNet' },
];

export const LEAD_GEN_DEFAULT_COLUMNS = ['name', 'company', 'role', 'source', 'score', 'location', 'profileUrl', 'nextAction'] as const;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown, maxLength = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function clampScore(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function createDefaultCriteria(): LeadGenSearchCriteria {
  return {
    request: '',
    geography: '',
    includeKeywords: '',
    excludeKeywords: '',
    freshness: '',
    limit: 25,
    sources: ['instagram'],
    directUrls: '',
    resultType: 'auto',
    community: '',
    maxPosts: 0,
  };
}

function createDefaultSnapshot(): LeadGenSnapshot {
  return {
    schemaVersion: 2,
    prospects: [],
    campaigns: [],
    searchQuery: '',
    selectedProspectId: null,
    searchResults: [],
    selectedResultIds: [],
    activeResultId: null,
    searchCriteria: createDefaultCriteria(),
    lastSearchMessage: '',
    catalog: null,
    usage: null,
    creditPackages: [],
    updatedAt: nowIso(),
  };
}

function normalizeSources(value: unknown): LeadGenSourceKey[] {
  if (!Array.isArray(value)) return ['instagram'];
  const allowed = new Set(LEAD_GEN_SOURCE_OPTIONS.map((item) => item.key));
  const sources = value
    .map((item) => cleanText(item, 40).toLowerCase())
    .filter((item): item is LeadGenSourceKey => allowed.has(item as LeadGenSourceKey));
  return Array.from(new Set(sources)).slice(0, LEAD_GEN_SOURCE_OPTIONS.length);
}

function normalizeSignals(value: unknown): LeadGenSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      id: cleanText(item.id, 80) || `signal_${index}`,
      label: cleanText(item.label, 120) || 'Signal',
      detail: cleanText(item.detail, 500),
    }))
    .filter((item) => item.label || item.detail)
    .slice(0, 8);
}

function normalizeCreditPackages(value: unknown): LeadGenCreditPackage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: cleanText(item.id, 80),
      label: cleanText(item.label, 80),
      credits: Math.max(0, Math.round(Number(item.credits || 0) || 0)),
      price: cleanText(item.price, 40),
      highlight: Boolean(item.highlight),
    }))
    .filter((item) => item.id && item.credits > 0)
    .slice(0, 8);
}

function normalizeProspect(value: unknown, index = 0): LeadGenProspect | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 180);
  if (!name) return null;
  const timestamp = nowIso();
  return {
    id: cleanText(raw.id, 160) || makeId(`prospect_${index}`),
    name,
    company: cleanText(raw.company, 180),
    role: cleanText(raw.role, 180),
    email: cleanText(raw.email, 240),
    source: cleanText(raw.source, 80) || 'Manual',
    status: (cleanText(raw.status, 40) as LeadGenLeadStatus) || 'new',
    score: clampScore(raw.score ?? 50),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 12) : [],
    notes: Array.isArray(raw.notes) ? raw.notes.filter((item): item is LeadGenNote => Boolean(item && typeof item === 'object')) : [],
    nextAction: cleanText(raw.nextAction, 240),
    createdAt: cleanText(raw.createdAt, 40) || timestamp,
    updatedAt: cleanText(raw.updatedAt, 40) || timestamp,
    profileUrl: cleanText(raw.profileUrl, 500),
    location: cleanText(raw.location, 180),
    experience: cleanText(raw.experience, 180),
    industry: cleanText(raw.industry, 180),
    summary: cleanText(raw.summary, 1200),
    avatarColor: cleanText(raw.avatarColor, 32),
    referenceBadges: Array.isArray(raw.referenceBadges) ? raw.referenceBadges.map((item) => cleanText(item, 20)).filter(Boolean).slice(0, 5) : [],
    signals: normalizeSignals(raw.signals),
    batchName: cleanText(raw.batchName, 160),
    sourceKey: cleanText(raw.sourceKey, 80),
    sourceLabel: cleanText(raw.sourceLabel, 120),
    sourceUrl: cleanText(raw.sourceUrl, 500),
    sourceQuery: cleanText(raw.sourceQuery, 1200),
    sourceMode: cleanText(raw.sourceMode, 120),
    sourceActorId: cleanText(raw.sourceActorId, 160),
    scrapedAt: cleanText(raw.scrapedAt, 80),
  };
}

function normalizeCriteria(value: unknown): LeadGenSearchCriteria {
  const base = createDefaultCriteria();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<LeadGenSearchCriteria>;
  return {
    request: cleanText(raw.request, 1200),
    geography: cleanText(raw.geography, 240),
    includeKeywords: cleanText(raw.includeKeywords, 400),
    excludeKeywords: cleanText(raw.excludeKeywords, 400),
    freshness: cleanText(raw.freshness, 120),
    limit: Math.max(1, Math.min(100, Number(raw.limit || base.limit) || base.limit)),
    sources: normalizeSources(raw.sources),
    directUrls: cleanText(raw.directUrls, 4000),
    resultType: cleanText(raw.resultType, 80) || 'auto',
    community: cleanText(raw.community, 120),
    maxPosts: Math.max(0, Math.min(500, Number(raw.maxPosts || 0) || 0)),
  };
}

function normalizeSnapshot(raw: unknown): LeadGenSnapshot {
  const base = createDefaultSnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const parsed = raw as Partial<LeadGenSnapshot>;
  return {
    schemaVersion: 2,
    prospects: Array.isArray(parsed.prospects) ? parsed.prospects.map(normalizeProspect).filter((item): item is LeadGenProspect => Boolean(item)) : [],
    campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns.filter((item): item is LeadGenCampaign => Boolean(item && typeof item === 'object')) : [],
    searchQuery: cleanText(parsed.searchQuery, 300),
    selectedProspectId: cleanText(parsed.selectedProspectId, 160) || null,
    searchResults: Array.isArray(parsed.searchResults) ? parsed.searchResults.map(normalizeProspect).filter((item): item is LeadGenProspect => Boolean(item)) : [],
    selectedResultIds: Array.isArray(parsed.selectedResultIds) ? parsed.selectedResultIds.map((item) => cleanText(item, 160)).filter(Boolean) : [],
    activeResultId: cleanText(parsed.activeResultId, 160) || null,
    searchCriteria: normalizeCriteria(parsed.searchCriteria),
    lastSearchMessage: cleanText(parsed.lastSearchMessage, 300),
    catalog: parsed.catalog && typeof parsed.catalog === 'object' ? parsed.catalog as LeadGenCatalog : null,
    usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage as LeadGenUsage : null,
    creditPackages: normalizeCreditPackages(parsed.creditPackages || parsed.catalog?.creditPackages),
    updatedAt: cleanText(parsed.updatedAt, 40) || base.updatedAt,
  };
}

function loadSnapshot(): LeadGenSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSnapshot();
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultSnapshot();
  }
}

function fingerprint(prospect: Pick<LeadGenProspect, 'name' | 'company' | 'email' | 'profileUrl'>): string {
  if (prospect.email) return `email:${prospect.email.toLowerCase()}`;
  if (prospect.profileUrl) return `url:${prospect.profileUrl.toLowerCase()}`;
  return `name:${prospect.name.toLowerCase()}|${prospect.company.toLowerCase()}`;
}

function persistSnapshot(snapshot: LeadGenSnapshot) {
  const selectedSet = new Set(snapshot.searchResults.map((item) => item.id));
  const next = {
    ...snapshot,
    selectedResultIds: snapshot.selectedResultIds.filter((id) => selectedSet.has(id)),
    updatedAt: nowIso(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser storage failures should not break the workspace.
  }
  mirrorFeatureState('lead_gen', next);
  return next;
}

const initialSnapshot = persistSnapshot(loadSnapshot());

export const useLeadGenStore = create<LeadGenState>((set, get) => ({
  ...initialSnapshot,
  isSearching: false,
  isCatalogLoading: false,
  searchError: null,
  catalogError: null,
  checkoutMessage: '',
  checkoutError: null,

  setSearchQuery: (searchQuery) => {
    set((state) => persistSnapshot({ ...state, searchQuery }));
  },

  setSearchCriteria: (patch) => {
    set((state) => persistSnapshot({ ...state, searchCriteria: normalizeCriteria({ ...state.searchCriteria, ...patch }) }));
  },

  selectProspect: (selectedProspectId) => {
    set((state) => persistSnapshot({ ...state, selectedProspectId }));
  },

  setActiveResult: (activeResultId) => {
    set((state) => persistSnapshot({ ...state, activeResultId }));
  },

  toggleResultSelection: (prospectId) => {
    set((state) => {
      const selected = new Set(state.selectedResultIds);
      if (selected.has(prospectId)) selected.delete(prospectId);
      else selected.add(prospectId);
      return persistSnapshot({ ...state, selectedResultIds: Array.from(selected) });
    });
  },

  selectAllResults: () => {
    set((state) => persistSnapshot({ ...state, selectedResultIds: state.searchResults.map((item) => item.id) }));
  },

  clearResultSelection: () => {
    set((state) => persistSnapshot({ ...state, selectedResultIds: [] }));
  },

  clearResults: () => {
    set((state) => persistSnapshot({ ...state, searchResults: [], selectedResultIds: [], activeResultId: null, lastSearchMessage: '' }));
  },

  loadCatalog: async () => {
    set({ isCatalogLoading: true, catalogError: null });
    try {
      const catalog = await webRequest<LeadGenCatalog>('lead_gen.catalog', {}, { timeoutMs: 30000 });
      set((state) => persistSnapshot({
        ...state,
        catalog,
        usage: catalog.usage ?? state.usage,
        creditPackages: normalizeCreditPackages(catalog.creditPackages).length
          ? normalizeCreditPackages(catalog.creditPackages)
          : state.creditPackages,
      }));
    } catch (error) {
      set({ catalogError: error instanceof Error ? error.message : 'Lead Gen catalog failed' });
    } finally {
      set({ isCatalogLoading: false });
    }
  },

  loadCreditPackages: async () => {
    set({ checkoutError: null });
    try {
      const response = await webRequest<LeadGenCreditPackagesResponse>('lead_gen.credit_packages', {}, { timeoutMs: 30000 });
      set((state) => persistSnapshot({
        ...state,
        creditPackages: normalizeCreditPackages(response?.packages),
        usage: response?.usage ?? state.usage,
      }));
    } catch (error) {
      set({ checkoutError: error instanceof Error ? error.message : 'Credit packages failed' });
    }
  },

  startCreditCheckout: async (packageId) => {
    set({ checkoutError: null, checkoutMessage: '' });
    try {
      const response = await webRequest<LeadGenCheckoutResponse>('lead_gen.checkout', { packageId }, { timeoutMs: 30000 });
      set((state) => persistSnapshot({
        ...state,
        usage: response?.usage ?? state.usage,
      }));
      if (response?.message) set({ checkoutMessage: response.message });
      return response ?? null;
    } catch (error) {
      set({ checkoutError: error instanceof Error ? error.message : 'Checkout failed' });
      return null;
    }
  },

  runSearch: async () => {
    const criteria = get().searchCriteria;
    set({ isSearching: true, searchError: null });
    try {
      const response = await webRequest<LeadGenSearchResponse>('lead_gen.search', {
        engine: 'apify_mcp',
        ...criteria,
      }, { timeoutMs: 180000 });
      const results = Array.isArray(response?.prospects)
        ? response.prospects.map(normalizeProspect).filter((item): item is LeadGenProspect => Boolean(item))
        : [];
      set((state) => persistSnapshot({
        ...state,
        searchResults: results,
        selectedResultIds: [],
        activeResultId: results[0]?.id ?? null,
        lastSearchMessage: cleanText(response?.message, 300) || `Loaded ${results.length} leads`,
        catalog: response?.catalog ?? state.catalog,
        usage: response?.usage ?? state.usage,
      }));
    } catch (error) {
      set({ searchError: error instanceof Error ? error.message : 'Lead search failed' });
    } finally {
      set({ isSearching: false });
    }
  },

  addProspect: (input) => {
    const normalized = normalizeProspect({
      ...input,
      id: makeId('prospect'),
      notes: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    if (!normalized) return null;
    let created: LeadGenProspect | null = null;
    set((state) => {
      const existing = new Set(state.prospects.map(fingerprint));
      if (existing.has(fingerprint(normalized))) return state;
      created = normalized;
      return persistSnapshot({
        ...state,
        prospects: [normalized, ...state.prospects],
        selectedProspectId: normalized.id,
      });
    });
    return created;
  },

  addProspectsFromResults: (prospects, batchName) => {
    const cleanBatch = batchName.trim();
    if (prospects.length === 0) return [];
    let added: LeadGenProspect[] = [];
    set((state) => {
      const existing = new Set(state.prospects.map(fingerprint));
      const nextProspects: LeadGenProspect[] = [];
      prospects.forEach((prospect, index) => {
        const normalized = normalizeProspect({
          ...prospect,
          id: makeId(`prospect_${index}`),
          batchName: cleanBatch,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        if (!normalized) return;
        const key = fingerprint(normalized);
        if (existing.has(key)) return;
        existing.add(key);
        nextProspects.push(normalized);
      });
      added = nextProspects;
      if (nextProspects.length === 0) return state;
      return persistSnapshot({
        ...state,
        prospects: [...nextProspects, ...state.prospects],
        selectedProspectId: nextProspects[0].id,
      });
    });
    return added;
  },

  updateProspect: (prospectId, updates) => {
    set((state) =>
      persistSnapshot({
        ...state,
        prospects: state.prospects.map((prospect) =>
          prospect.id === prospectId
            ? normalizeProspect({ ...prospect, ...updates, updatedAt: nowIso() }, 0) ?? prospect
            : prospect
        ),
      })
    );
  },

  addProspectNote: (prospectId, body) => {
    const cleanBody = body.trim();
    if (!cleanBody) return;
    const note: LeadGenNote = { id: makeId('note'), body: cleanBody, createdAt: nowIso() };
    set((state) =>
      persistSnapshot({
        ...state,
        prospects: state.prospects.map((prospect) =>
          prospect.id === prospectId
            ? { ...prospect, notes: [note, ...prospect.notes], updatedAt: nowIso() }
            : prospect
        ),
      })
    );
  },

  deleteProspect: (prospectId) => {
    set((state) =>
      persistSnapshot({
        ...state,
        prospects: state.prospects.filter((prospect) => prospect.id !== prospectId),
        campaigns: state.campaigns.map((campaign) => ({
          ...campaign,
          leadIds: campaign.leadIds.filter((leadId) => leadId !== prospectId),
          updatedAt: campaign.leadIds.includes(prospectId) ? nowIso() : campaign.updatedAt,
        })),
        selectedProspectId: state.selectedProspectId === prospectId ? null : state.selectedProspectId,
      })
    );
  },

  addCampaign: (input) => {
    const cleanName = String(input.name || '').trim();
    if (!cleanName) return null;
    const campaign: LeadGenCampaign = {
      id: makeId('campaign'),
      name: cleanName,
      audience: String(input.audience || '').trim(),
      offer: String(input.offer || '').trim(),
      channel: String(input.channel || 'Email').trim() || 'Email',
      status: (input.status as LeadGenCampaignStatus) || 'draft',
      leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((item) => String(item)).filter(Boolean) : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((state) => persistSnapshot({ ...state, campaigns: [campaign, ...state.campaigns] }));
    return campaign;
  },

  updateCampaign: (campaignId, updates) => {
    set((state) =>
      persistSnapshot({
        ...state,
        campaigns: state.campaigns.map((campaign) =>
          campaign.id === campaignId
            ? {
                ...campaign,
                ...updates,
                leadIds: Array.isArray(updates.leadIds) ? updates.leadIds.map((item) => String(item)).filter(Boolean) : campaign.leadIds,
                updatedAt: nowIso(),
              }
            : campaign
        ),
      })
    );
  },

  attachProspectToCampaign: (campaignId, prospectId) => {
    set((state) =>
      persistSnapshot({
        ...state,
        campaigns: state.campaigns.map((campaign) =>
          campaign.id === campaignId && !campaign.leadIds.includes(prospectId)
            ? { ...campaign, leadIds: [...campaign.leadIds, prospectId], updatedAt: nowIso() }
            : campaign
        ),
      })
    );
  },

  detachProspectFromCampaign: (campaignId, prospectId) => {
    set((state) =>
      persistSnapshot({
        ...state,
        campaigns: state.campaigns.map((campaign) =>
          campaign.id === campaignId
            ? {
                ...campaign,
                leadIds: campaign.leadIds.filter((leadId) => leadId !== prospectId),
                updatedAt: nowIso(),
              }
            : campaign
        ),
      })
    );
  },

  deleteCampaign: (campaignId) => {
    set((state) =>
      persistSnapshot({
        ...state,
        campaigns: state.campaigns.filter((campaign) => campaign.id !== campaignId),
      })
    );
  },
}));
