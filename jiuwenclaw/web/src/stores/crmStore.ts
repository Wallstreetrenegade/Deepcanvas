import { create } from 'zustand';
import { mirrorFeatureState } from '../services/piMirror';
import { webRequest } from '../services/webClient';

const STORAGE_KEY_PREFIX = 'deep_canvas_crm_v2';
const CRM_STATE_VERSION = 2;

export const CRM_MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const CRM_MAX_IMPORT_ROWS = 5000;

export type CrmLeadStage = 'new' | 'qualified' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type CrmLeadStatus = 'active' | 'nurturing' | 'follow-up' | 'stale' | 'closed';
export type CrmDensity = 'compact' | 'cozy';
export type CrmViewPreset = 'all' | 'hot' | 'follow-up' | 'pipeline' | 'closed';
export type CrmSortDirection = 'asc' | 'desc';
export type CrmColumnKind = 'core' | 'custom';
export type CrmSourceFilter = 'all' | string;
export type CrmHydrationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type CrmImportableField =
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'address'
  | 'website'
  | 'owner'
  | 'source'
  | 'stage'
  | 'status'
  | 'score'
  | 'nextAction'
  | 'lastContactAt'
  | 'tags';
export type CrmImportTarget = '__ignore__' | CrmImportableField | `custom:${string}`;

export interface CrmColumn {
  key: string;
  label: string;
  kind: CrmColumnKind;
  visible: boolean;
}

export interface CrmLeadNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface CrmLead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  owner: string;
  source: string;
  stage: CrmLeadStage;
  status: CrmLeadStatus;
  score: number;
  nextAction: string;
  lastContactAt: string;
  tags: string[];
  customFields: Record<string, string>;
  notes: CrmLeadNote[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmCsvParseResult {
  headers: string[];
  rows: string[][];
}

export interface CrmImportMapping {
  header: string;
  target: CrmImportTarget;
}

export interface CrmImportResult {
  importedCount: number;
  skippedDuplicateCount: number;
  skippedInvalidCount: number;
  skippedLimitCount: number;
  totalRows: number;
}

export interface CreateLeadInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  owner?: string;
  source?: string;
  stage?: CrmLeadStage;
  status?: CrmLeadStatus;
  score?: number;
  nextAction?: string;
  lastContactAt?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

interface CrmSnapshot {
  schemaVersion: number;
  columns: CrmColumn[];
  leads: CrmLead[];
  searchQuery: string;
  stageFilter: CrmLeadStage | 'all';
  statusFilter: CrmLeadStatus | 'all';
  sourceFilter: CrmSourceFilter;
  viewPreset: CrmViewPreset;
  density: CrmDensity;
  sortKey: string;
  sortDirection: CrmSortDirection;
  detailLeadId: string | null;
  lastSavedAt: string;
}

interface CrmState extends CrmSnapshot {
  hydrationStatus: CrmHydrationStatus;
  hydrationError: string | null;
  hydrate: () => Promise<void>;
  setSearchQuery: (value: string) => void;
  setStageFilter: (value: CrmLeadStage | 'all') => void;
  setStatusFilter: (value: CrmLeadStatus | 'all') => void;
  setSourceFilter: (value: CrmSourceFilter) => void;
  setViewPreset: (value: CrmViewPreset) => void;
  setDensity: (value: CrmDensity) => void;
  setSort: (key: string) => void;
  toggleColumnVisibility: (key: string) => void;
  addCustomColumn: (label: string) => void;
  addLead: (input: CreateLeadInput) => CrmLead | null;
  updateLead: (leadId: string, updates: Partial<Omit<CrmLead, 'id' | 'notes' | 'customFields' | 'createdAt'>>) => void;
  updateLeadCustomField: (leadId: string, fieldKey: string, value: string) => void;
  addLeadNote: (leadId: string, body: string) => void;
  deleteLead: (leadId: string) => void;
  openLead: (leadId: string) => void;
  closeLead: () => void;
  importCsv: (content: string) => CrmImportResult;
  importMappedCsv: (content: string, mappings: CrmImportMapping[]) => CrmImportResult;
}

interface StoredAuthUser {
  id: string;
  email: string;
  displayName?: string;
}

interface PiStateResponse {
  feature?: string;
  data?: unknown;
}

export const CRM_STAGE_OPTIONS: CrmLeadStage[] = ['new', 'qualified', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
export const CRM_STATUS_OPTIONS: CrmLeadStatus[] = ['active', 'nurturing', 'follow-up', 'stale', 'closed'];
export const CRM_VIEW_PRESETS: CrmViewPreset[] = ['all', 'hot', 'follow-up', 'pipeline', 'closed'];
export const CRM_IMPORTABLE_FIELDS: Array<{ key: CrmImportableField; label: string }> = [
  { key: 'name', label: 'Lead' },
  { key: 'company', label: 'Company' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'website', label: 'Website' },
  { key: 'owner', label: 'Owner' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'score', label: 'Score' },
  { key: 'nextAction', label: 'Next Action' },
  { key: 'lastContactAt', label: 'Last Contact' },
  { key: 'tags', label: 'Tags' },
];

const DEFAULT_SOURCE_OPTIONS = ['Website', 'Referral', 'Outbound', 'Event', 'Partner'];

const DEFAULT_COLUMNS: CrmColumn[] = [
  { key: 'name', label: 'Lead', kind: 'core', visible: true },
  { key: 'company', label: 'Company', kind: 'core', visible: true },
  { key: 'email', label: 'Email', kind: 'core', visible: true },
  { key: 'phone', label: 'Phone', kind: 'core', visible: true },
  { key: 'address', label: 'Address', kind: 'core', visible: true },
  { key: 'stage', label: 'Stage', kind: 'core', visible: true },
  { key: 'status', label: 'Status', kind: 'core', visible: true },
  { key: 'owner', label: 'Owner', kind: 'core', visible: true },
  { key: 'source', label: 'Source', kind: 'core', visible: false },
  { key: 'score', label: 'Score', kind: 'core', visible: false },
  { key: 'nextAction', label: 'Next Action', kind: 'core', visible: false },
  { key: 'lastContactAt', label: 'Last Contact', kind: 'core', visible: false },
  { key: 'updatedAt', label: 'Updated', kind: 'core', visible: false },
];

const EMPTY_IMPORT_RESULT: CrmImportResult = {
  importedCount: 0,
  skippedDuplicateCount: 0,
  skippedInvalidCount: 0,
  skippedLimitCount: 0,
  totalRows: 0,
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function clampScore(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeWebsite(value: unknown): string {
  return cleanText(value, 240).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function normalizeDateValue(value: unknown): string {
  const raw = cleanText(value, 32);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function sanitizeStage(value: unknown): CrmLeadStage {
  const normalized = cleanText(value, 40).toLowerCase();
  return CRM_STAGE_OPTIONS.find((option) => option === normalized) ?? 'new';
}

function sanitizeStatus(value: unknown): CrmLeadStatus {
  const normalized = cleanText(value, 40).toLowerCase();
  return CRM_STATUS_OPTIONS.find((option) => option === normalized) ?? 'active';
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 30);
  }
  return cleanText(value, 600).split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function normalizeCustomFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((result, [key, fieldValue]) => {
    const cleanKey = cleanText(key, 80);
    const cleanValue = cleanText(fieldValue, 1200);
    if (cleanKey && cleanValue) {
      result[cleanKey] = cleanValue;
    }
    return result;
  }, {});
}

function normalizeNotes(value: unknown): CrmLeadNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((note, index) => {
    if (!note || typeof note !== 'object') return [];
    const raw = note as Record<string, unknown>;
    const body = cleanText(raw.body ?? raw.text ?? raw.note, 4000);
    if (!body) return [];
    return [{
      id: cleanText(raw.id, 80) || makeId(`note_${index}`),
      body,
      createdAt: cleanText(raw.createdAt ?? raw.created_at, 40) || nowIso(),
    }];
  });
}

function isDefaultSeedLead(lead: CrmLead): boolean {
  return (
    (lead.id === 'lead_1' && lead.name === 'Avery Brooks' && lead.company === 'Northline Studio') ||
    (lead.id === 'lead_2' && lead.name === 'Sofia Patel' && lead.company === 'Peak Logistics') ||
    (lead.id === 'lead_3' && lead.name === 'Marcus Green' && lead.company === 'Valence Health')
  );
}

function normalizeLead(value: unknown, index: number): CrmLead | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const timestamp = nowIso();
  const company = cleanText(raw.company ?? raw.organization, 240);
  const email = cleanText(raw.email ?? raw.emailAddress, 240).toLowerCase();
  const phone = cleanText(raw.phone ?? raw.mobile, 80);
  const name = cleanText(raw.name ?? raw.fullName ?? raw.title, 240) || company || email || phone;
  if (!name && !company && !email && !phone) return null;

  const lead: CrmLead = {
    id: cleanText(raw.id, 80) || makeId(`lead_${index}`),
    name: name || `Lead ${index + 1}`,
    company,
    email,
    phone,
    address: cleanText(raw.address ?? raw.location, 500),
    website: normalizeWebsite(raw.website),
    owner: cleanText(raw.owner ?? raw.assignee, 160),
    source: cleanText(raw.source, 160) || 'Website',
    stage: sanitizeStage(raw.stage),
    status: sanitizeStatus(raw.status),
    score: clampScore(raw.score),
    nextAction: cleanText(raw.nextAction ?? raw.next_action, 500),
    lastContactAt: normalizeDateValue(raw.lastContactAt ?? raw.last_contact_at),
    tags: parseTags(raw.tags),
    customFields: normalizeCustomFields(raw.customFields ?? raw.custom_fields),
    notes: normalizeNotes(raw.notes),
    createdAt: cleanText(raw.createdAt ?? raw.created_at, 40) || timestamp,
    updatedAt: cleanText(raw.updatedAt ?? raw.updated_at, 40) || timestamp,
  };

  return isDefaultSeedLead(lead) ? null : lead;
}

function normalizeColumns(value: unknown): CrmColumn[] {
  const incoming = Array.isArray(value) ? value : [];
  const merged = DEFAULT_COLUMNS.map((defaultColumn) => {
    const matching = incoming.find((column) => column && typeof column === 'object' && (column as CrmColumn).key === defaultColumn.key) as Partial<CrmColumn> | undefined;
    return {
      ...defaultColumn,
      visible: typeof matching?.visible === 'boolean' ? matching.visible : defaultColumn.visible,
    };
  });

  incoming.forEach((column) => {
    if (!column || typeof column !== 'object') return;
    const raw = column as Partial<CrmColumn>;
    if (raw.kind !== 'custom') return;
    const label = cleanText(raw.label, 80);
    if (!label) return;
    const key = cleanText(raw.key, 80) || `custom_${slugify(label)}`;
    if (merged.some((candidate) => candidate.key === key || normalizeHeader(candidate.label) === normalizeHeader(label))) return;
    merged.push({ key, label, kind: 'custom', visible: raw.visible !== false });
  });

  if (!merged.some((column) => column.visible)) {
    merged[0] = { ...merged[0], visible: true };
  }

  return merged;
}

function createDefaultSnapshot(): CrmSnapshot {
  const timestamp = nowIso();
  return {
    schemaVersion: CRM_STATE_VERSION,
    columns: DEFAULT_COLUMNS,
    leads: [],
    searchQuery: '',
    stageFilter: 'all',
    statusFilter: 'all',
    sourceFilter: 'all',
    viewPreset: 'all',
    density: 'compact',
    sortKey: 'updatedAt',
    sortDirection: 'desc',
    detailLeadId: null,
    lastSavedAt: timestamp,
  };
}

function normalizeSnapshot(value: unknown, fallback: CrmSnapshot = createDefaultSnapshot()): CrmSnapshot {
  if (Array.isArray(value)) {
    const leads = value.map((lead, index) => normalizeLead(lead, index)).filter((lead): lead is CrmLead => Boolean(lead));
    return { ...fallback, leads, detailLeadId: leads[0]?.id ?? null };
  }

  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Partial<CrmSnapshot> & Record<string, unknown>;
  const rawLeads = Array.isArray(raw.leads) ? raw.leads : Array.isArray(raw.contacts) ? raw.contacts : Array.isArray(raw.items) ? raw.items : [];
  const leads = rawLeads.map((lead, index) => normalizeLead(lead, index)).filter((lead): lead is CrmLead => Boolean(lead));
  const detailLeadId = cleanText(raw.detailLeadId, 80);
  const stageFilter = raw.stageFilter === 'all' || CRM_STAGE_OPTIONS.includes(raw.stageFilter as CrmLeadStage)
    ? raw.stageFilter as CrmLeadStage | 'all'
    : fallback.stageFilter;
  const statusFilter = raw.statusFilter === 'all' || CRM_STATUS_OPTIONS.includes(raw.statusFilter as CrmLeadStatus)
    ? raw.statusFilter as CrmLeadStatus | 'all'
    : fallback.statusFilter;

  return {
    schemaVersion: CRM_STATE_VERSION,
    columns: normalizeColumns(raw.columns),
    leads,
    searchQuery: cleanText(raw.searchQuery, 200),
    stageFilter,
    statusFilter,
    sourceFilter: cleanText(raw.sourceFilter, 160) || fallback.sourceFilter,
    viewPreset: CRM_VIEW_PRESETS.includes(raw.viewPreset as CrmViewPreset) ? raw.viewPreset as CrmViewPreset : fallback.viewPreset,
    density: raw.density === 'cozy' ? 'cozy' : fallback.density,
    sortKey: cleanText(raw.sortKey, 80) || fallback.sortKey,
    sortDirection: raw.sortDirection === 'asc' ? 'asc' : fallback.sortDirection,
    detailLeadId: leads.some((lead) => lead.id === detailLeadId) ? detailLeadId : null,
    lastSavedAt: cleanText(raw.lastSavedAt, 40) || fallback.lastSavedAt,
  };
}

function readStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('exclaw_auth_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: Partial<StoredAuthUser> };
    if (!parsed.user?.id || !parsed.user.email) return null;
    return {
      id: parsed.user.id,
      email: parsed.user.email,
      displayName: parsed.user.displayName,
    };
  } catch {
    return null;
  }
}

function localStorageKey(user: StoredAuthUser | null = readStoredAuthUser()): string {
  return user?.id ? `${STORAGE_KEY_PREFIX}_${user.id}` : `${STORAGE_KEY_PREFIX}_anonymous`;
}

function readLocalSnapshot(): CrmSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey());
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persistSnapshot(snapshot: CrmSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localStorageKey(), JSON.stringify(snapshot));
  } catch {
    // Backend PI state is the durable source; browser cache failures are non-fatal.
  }
}

function loadSnapshot(): CrmSnapshot {
  return readLocalSnapshot() ?? createDefaultSnapshot();
}

function mirrorCrmSnapshot(snapshot: CrmSnapshot): void {
  mirrorFeatureState('crm', {
    schemaVersion: CRM_STATE_VERSION,
    columns: snapshot.columns,
    leads: snapshot.leads,
    searchQuery: snapshot.searchQuery,
    stageFilter: snapshot.stageFilter,
    statusFilter: snapshot.statusFilter,
    sourceFilter: snapshot.sourceFilter,
    viewPreset: snapshot.viewPreset,
    density: snapshot.density,
    sortKey: snapshot.sortKey,
    sortDirection: snapshot.sortDirection,
    lastSavedAt: snapshot.lastSavedAt,
  });
}

function touchSnapshot(snapshot: CrmSnapshot): CrmSnapshot {
  return { ...snapshot, schemaVersion: CRM_STATE_VERSION, lastSavedAt: nowIso() };
}

function commitSnapshot(
  set: (partial: Partial<CrmState> | ((state: CrmState) => Partial<CrmState>)) => void,
  snapshotOrUpdater: CrmSnapshot | ((state: CrmState) => CrmSnapshot)
) {
  set((state) => {
    const rawNextSnapshot = typeof snapshotOrUpdater === 'function' ? snapshotOrUpdater(state) : snapshotOrUpdater;
    const nextSnapshot = touchSnapshot(rawNextSnapshot);
    persistSnapshot(nextSnapshot);
    mirrorCrmSnapshot(nextSnapshot);
    return {
      ...nextSnapshot,
      hydrationStatus: state.hydrationStatus === 'idle' ? 'ready' : state.hydrationStatus,
      hydrationError: null,
    };
  });
}

function ensureColumn(columns: CrmColumn[], label: string): CrmColumn[] {
  const cleanLabel = cleanText(label, 80);
  const slug = slugify(cleanLabel);
  const existing = columns.find((column) => column.key === `custom_${slug}` || normalizeHeader(column.label) === normalizeHeader(cleanLabel));
  if (!cleanLabel || existing) {
    return columns;
  }

  return [
    ...columns,
    {
      key: `custom_${slug || makeId('field')}`,
      label: cleanLabel,
      kind: 'custom',
      visible: true,
    },
  ];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseCrmCsv(content: string): CrmCsvParseResult {
  const lines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerLine, ...rowLines] = lines;
  const headers = parseCsvLine(headerLine).map((header, index) => cleanText(header, 120) || `Column ${index + 1}`);
  return {
    headers,
    rows: rowLines.map(parseCsvLine),
  };
}

function resolveCoreField(header: string): CrmImportableField | null {
  const normalized = normalizeHeader(header);
  const aliases: Record<string, CrmImportableField> = {
    lead: 'name',
    name: 'name',
    'full name': 'name',
    company: 'company',
    organization: 'company',
    email: 'email',
    'email address': 'email',
    phone: 'phone',
    'phone number': 'phone',
    mobile: 'phone',
    address: 'address',
    location: 'address',
    website: 'website',
    owner: 'owner',
    rep: 'owner',
    source: 'source',
    stage: 'stage',
    status: 'status',
    score: 'score',
    'lead score': 'score',
    'next action': 'nextAction',
    'follow up': 'nextAction',
    'last contact': 'lastContactAt',
    tags: 'tags',
  };

  return aliases[normalized] ?? null;
}

export function getDefaultCrmImportMappings(headers: string[]): CrmImportMapping[] {
  return headers.map((header): CrmImportMapping => {
    const coreField = resolveCoreField(header);
    const target: CrmImportTarget = coreField ?? (`custom:${header}` as CrmImportTarget);
    return { header, target };
  });
}

function leadFingerprint(lead: Pick<CrmLead, 'email' | 'phone' | 'name' | 'company'>): string {
  if (lead.email) return `email:${lead.email.toLowerCase()}`;
  if (lead.phone) return `phone:${lead.phone.replace(/\D/g, '')}`;
  return `name:${normalizeHeader(`${lead.name} ${lead.company}`)}`;
}

export function findDuplicateLead(leads: CrmLead[], candidate: Pick<CrmLead, 'email' | 'phone' | 'name' | 'company'>): CrmLead | null {
  const fingerprint = leadFingerprint(candidate);
  return leads.find((lead) => leadFingerprint(lead) === fingerprint) ?? null;
}

function createLeadFromInput(input: CreateLeadInput): CrmLead | null {
  const timestamp = nowIso();
  return normalizeLead({
    id: makeId('lead'),
    ...input,
    score: clampScore(input.score),
    website: normalizeWebsite(input.website),
    createdAt: timestamp,
    updatedAt: timestamp,
  }, 0);
}

function applyMappedImport(
  state: CrmSnapshot,
  content: string,
  mappings: CrmImportMapping[]
): { snapshot: CrmSnapshot; result: CrmImportResult } {
  const parsed = parseCrmCsv(content);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { snapshot: state, result: EMPTY_IMPORT_RESULT };
  }

  let nextColumns = [...state.columns];
  const mappingByHeader = new Map(mappings.map((mapping) => [normalizeHeader(mapping.header), mapping.target]));

  const headerMappings = parsed.headers.map((header, index) => {
    const selectedTarget = mappingByHeader.get(normalizeHeader(header)) ?? '__ignore__';
    if (selectedTarget === '__ignore__') {
      return { index, kind: 'ignore' as const, key: '__ignore__', label: header };
    }

    if (selectedTarget.startsWith('custom:')) {
      const customLabel = selectedTarget.slice('custom:'.length).trim() || header;
      nextColumns = ensureColumn(nextColumns, customLabel);
      const matchingColumn = nextColumns.find((column) => normalizeHeader(column.label) === normalizeHeader(customLabel));
      return {
        index,
        kind: 'custom' as const,
        key: matchingColumn?.key ?? `custom_${slugify(customLabel)}`,
        label: customLabel,
      };
    }

    return { index, kind: 'core' as const, key: selectedTarget, label: header };
  });

  const existingFingerprints = new Set(state.leads.map(leadFingerprint));
  const importRows = parsed.rows.slice(0, CRM_MAX_IMPORT_ROWS);
  const result: CrmImportResult = {
    importedCount: 0,
    skippedDuplicateCount: 0,
    skippedInvalidCount: 0,
    skippedLimitCount: Math.max(0, parsed.rows.length - CRM_MAX_IMPORT_ROWS),
    totalRows: parsed.rows.length,
  };

  const nextLeads: CrmLead[] = [];
  importRows.forEach((row, rowIndex) => {
    if (!row.some((cell) => cell.trim().length > 0)) {
      result.skippedInvalidCount += 1;
      return;
    }

    const rawLead: Record<string, unknown> = {
      id: makeId('lead'),
      source: 'Website',
      stage: 'new',
      status: 'active',
      score: 0,
      customFields: {},
      notes: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    headerMappings.forEach(({ index, kind, key }) => {
      if (kind === 'ignore') return;
      const cell = row[index]?.trim() ?? '';
      if (!cell) return;
      if (kind === 'custom') {
        const customFields = rawLead.customFields as Record<string, string>;
        customFields[key] = cleanText(cell, 1200);
        return;
      }
      rawLead[key] = cell;
    });

    const normalized = normalizeLead(rawLead, state.leads.length + rowIndex);
    if (!normalized) {
      result.skippedInvalidCount += 1;
      return;
    }

    const fingerprint = leadFingerprint(normalized);
    if (existingFingerprints.has(fingerprint)) {
      result.skippedDuplicateCount += 1;
      return;
    }

    existingFingerprints.add(fingerprint);
    nextLeads.push(normalized);
    result.importedCount += 1;
  });

  if (nextLeads.length === 0 && nextColumns.length === state.columns.length) {
    return { snapshot: state, result };
  }

  return {
    snapshot: {
      ...state,
      columns: nextColumns,
      leads: [...nextLeads, ...state.leads],
      detailLeadId: nextLeads[0]?.id ?? state.detailLeadId,
    },
    result,
  };
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCrmCsv(leads: CrmLead[], columns: CrmColumn[]): string {
  const exportColumns = columns.filter((column) => column.visible || column.kind === 'custom');
  const headers = exportColumns.map((column) => column.label);
  const rows = leads.map((lead) => exportColumns.map((column) => {
    if (column.key in lead) {
      const value = lead[column.key as keyof CrmLead];
      return csvEscape(value);
    }
    return csvEscape(lead.customFields[column.key] ?? '');
  }));
  return [headers.map(csvEscape).join(','), ...rows.map((row) => row.join(','))].join('\n');
}

const initialSnapshot = loadSnapshot();

export const useCrmStore = create<CrmState>((set, get) => ({
  ...initialSnapshot,
  hydrationStatus: 'idle',
  hydrationError: null,

  hydrate: async () => {
    if (get().hydrationStatus === 'loading') return;
    set({ hydrationStatus: 'loading', hydrationError: null });
    try {
      const response = await webRequest<PiStateResponse>('pi.state.get', { feature: 'crm' }, { timeoutMs: 12000 });
      const remoteData = response?.data;
      const remoteSnapshot = normalizeSnapshot(remoteData, createDefaultSnapshot());
      const hasRemoteData = Array.isArray(remoteData)
        ? remoteData.length > 0
        : Boolean(remoteData && typeof remoteData === 'object' && (
            Array.isArray((remoteData as Record<string, unknown>).leads) ||
            Array.isArray((remoteData as Record<string, unknown>).contacts) ||
            Array.isArray((remoteData as Record<string, unknown>).items)
          ));
      const localSnapshot = readLocalSnapshot();
      const nextSnapshot = touchSnapshot(hasRemoteData ? remoteSnapshot : localSnapshot ?? remoteSnapshot);
      persistSnapshot(nextSnapshot);
      mirrorCrmSnapshot(nextSnapshot);
      set({ ...nextSnapshot, hydrationStatus: 'ready', hydrationError: null });
    } catch (error) {
      const fallback = readLocalSnapshot() ?? normalizeSnapshot(get());
      set({
        ...fallback,
        hydrationStatus: 'error',
        hydrationError: error instanceof Error ? error.message : 'Failed to load saved CRM data',
      });
    }
  },

  setSearchQuery: (value) => {
    commitSnapshot(set, (state) => ({ ...state, searchQuery: value }));
  },

  setStageFilter: (value) => {
    commitSnapshot(set, (state) => ({ ...state, stageFilter: value }));
  },

  setStatusFilter: (value) => {
    commitSnapshot(set, (state) => ({ ...state, statusFilter: value }));
  },

  setSourceFilter: (value) => {
    commitSnapshot(set, (state) => ({ ...state, sourceFilter: value }));
  },

  setViewPreset: (value) => {
    commitSnapshot(set, (state) => ({ ...state, viewPreset: value }));
  },

  setDensity: (value) => {
    commitSnapshot(set, (state) => ({ ...state, density: value }));
  },

  setSort: (key) => {
    commitSnapshot(set, (state) => ({
      ...state,
      sortKey: key,
      sortDirection: state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc',
    }));
  },

  toggleColumnVisibility: (key) => {
    commitSnapshot(set, (state) => {
      const nextColumns = state.columns.map((column) =>
        column.key === key ? { ...column, visible: !column.visible } : column
      );
      if (!nextColumns.some((column) => column.visible)) {
        return state;
      }
      return { ...state, columns: nextColumns };
    });
  },

  addCustomColumn: (label) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    commitSnapshot(set, (state) => ({ ...state, columns: ensureColumn(state.columns, cleanLabel) }));
  },

  addLead: (input) => {
    const nextLead = createLeadFromInput(input);
    if (!nextLead) return null;
    let createdLead: CrmLead | null = null;
    commitSnapshot(set, (state) => {
      if (findDuplicateLead(state.leads, nextLead)) {
        return state;
      }
      createdLead = nextLead;
      return {
        ...state,
        leads: [nextLead, ...state.leads],
        detailLeadId: nextLead.id,
      };
    });
    return createdLead;
  },

  updateLead: (leadId, updates) => {
    commitSnapshot(set, (state) => ({
      ...state,
      leads: state.leads.map((lead) =>
        lead.id === leadId
          ? normalizeLead({
              ...lead,
              ...updates,
              score: updates.score !== undefined ? clampScore(updates.score) : lead.score,
              website: updates.website !== undefined ? normalizeWebsite(updates.website) : lead.website,
              lastContactAt: updates.lastContactAt !== undefined ? normalizeDateValue(updates.lastContactAt) : lead.lastContactAt,
              updatedAt: nowIso(),
            }, 0) ?? lead
          : lead
      ),
    }));
  },

  updateLeadCustomField: (leadId, fieldKey, value) => {
    commitSnapshot(set, (state) => ({
      ...state,
      leads: state.leads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              customFields: { ...lead.customFields, [fieldKey]: cleanText(value, 1200) },
              updatedAt: nowIso(),
            }
          : lead
      ),
    }));
  },

  addLeadNote: (leadId, body) => {
    const cleanBody = cleanText(body, 4000);
    if (!cleanBody) return;
    commitSnapshot(set, (state) => ({
      ...state,
      leads: state.leads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              notes: [{ id: makeId('note'), body: cleanBody, createdAt: nowIso() }, ...lead.notes],
              updatedAt: nowIso(),
            }
          : lead
      ),
    }));
  },

  deleteLead: (leadId) => {
    commitSnapshot(set, (state) => ({
      ...state,
      leads: state.leads.filter((lead) => lead.id !== leadId),
      detailLeadId: state.detailLeadId === leadId ? null : state.detailLeadId,
    }));
  },

  openLead: (leadId) => {
    commitSnapshot(set, (state) => ({ ...state, detailLeadId: leadId }));
  },

  closeLead: () => {
    commitSnapshot(set, (state) => ({ ...state, detailLeadId: null }));
  },

  importCsv: (content) => {
    const defaultMappings = getDefaultCrmImportMappings(parseCrmCsv(content).headers);
    let result = EMPTY_IMPORT_RESULT;
    commitSnapshot(set, (state) => {
      const imported = applyMappedImport(state, content, defaultMappings);
      result = imported.result;
      return imported.snapshot;
    });
    return result;
  },

  importMappedCsv: (content, mappings) => {
    let result = EMPTY_IMPORT_RESULT;
    commitSnapshot(set, (state) => {
      const imported = applyMappedImport(state, content, mappings);
      result = imported.result;
      return imported.snapshot;
    });
    return result;
  },
}));

export function getCrmSourceOptions(leads: CrmLead[]): string[] {
  const values = new Set([...DEFAULT_SOURCE_OPTIONS, ...leads.map((lead) => lead.source).filter(Boolean)]);
  return Array.from(values);
}
