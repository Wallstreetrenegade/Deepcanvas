import { create } from 'zustand';
import { mirrorFeatureState } from '../services/piMirror';

const STORAGE_KEY = 'deep_canvas_creative_studio_v1';

export type CreativeAssetStatus = 'draft' | 'queued' | 'in_progress' | 'ready';
export type CreativeExportStatus = 'draft' | 'queued' | 'rendering' | 'delivered';

export interface CreativeBrief {
  projectName: string;
  brand: string;
  objective: string;
  audience: string;
  deliverables: string[];
  voice: string;
  visualStyle: string;
}

export interface CreativeAssetRequest {
  id: string;
  title: string;
  kind: string;
  prompt: string;
  notes: string;
  status: CreativeAssetStatus;
  updatedAt: string;
}

export interface CreativeExportRecord {
  id: string;
  name: string;
  format: string;
  destination: string;
  status: CreativeExportStatus;
  updatedAt: string;
}

interface CreativeStudioSnapshot {
  schemaVersion: number;
  brief: CreativeBrief;
  assetRequests: CreativeAssetRequest[];
  exports: CreativeExportRecord[];
  selectedTemplate: string;
  updatedAt: string;
}

interface CreativeStudioState extends CreativeStudioSnapshot {
  updateBrief: (updates: Partial<CreativeBrief>) => void;
  addAssetRequest: (input: Partial<Omit<CreativeAssetRequest, 'id' | 'updatedAt'>>) => CreativeAssetRequest | null;
  updateAssetRequest: (assetId: string, updates: Partial<Omit<CreativeAssetRequest, 'id' | 'updatedAt'>>) => void;
  queueExport: (input: Partial<Omit<CreativeExportRecord, 'id' | 'updatedAt'>>) => CreativeExportRecord | null;
  updateExport: (exportId: string, updates: Partial<Omit<CreativeExportRecord, 'id' | 'updatedAt'>>) => void;
  deleteExport: (exportId: string) => void;
  setSelectedTemplate: (value: string) => void;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultSnapshot(): CreativeStudioSnapshot {
  return {
    schemaVersion: 1,
    brief: {
      projectName: 'Untitled creative project',
      brand: '',
      objective: '',
      audience: '',
      deliverables: ['Hero still', 'Social cutdown', 'Story variant'],
      voice: '',
      visualStyle: '',
    },
    assetRequests: [],
    exports: [],
    selectedTemplate: 'starter',
    updatedAt: nowIso(),
  };
}

function normalizeSnapshot(raw: unknown): CreativeStudioSnapshot {
  const base = createDefaultSnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const parsed = raw as Partial<CreativeStudioSnapshot>;
  const brief: Partial<CreativeBrief> = parsed.brief && typeof parsed.brief === 'object' ? parsed.brief as Partial<CreativeBrief> : {};
  return {
    schemaVersion: 1,
    brief: {
      projectName: typeof brief.projectName === 'string' && brief.projectName.trim() ? brief.projectName : base.brief.projectName,
      brand: typeof brief.brand === 'string' ? brief.brand : '',
      objective: typeof brief.objective === 'string' ? brief.objective : '',
      audience: typeof brief.audience === 'string' ? brief.audience : '',
      deliverables: Array.isArray(brief.deliverables) ? brief.deliverables.map((item: string) => String(item).trim()).filter(Boolean) : base.brief.deliverables,
      voice: typeof brief.voice === 'string' ? brief.voice : '',
      visualStyle: typeof brief.visualStyle === 'string' ? brief.visualStyle : '',
    },
    assetRequests: Array.isArray(parsed.assetRequests) ? parsed.assetRequests.filter((item): item is CreativeAssetRequest => Boolean(item && typeof item === 'object')) : [],
    exports: Array.isArray(parsed.exports) ? parsed.exports.filter((item): item is CreativeExportRecord => Boolean(item && typeof item === 'object')) : [],
    selectedTemplate: typeof parsed.selectedTemplate === 'string' && parsed.selectedTemplate.trim() ? parsed.selectedTemplate : base.selectedTemplate,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : base.updatedAt,
  };
}

function loadSnapshot(): CreativeStudioSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSnapshot();
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultSnapshot();
  }
}

function persistSnapshot(snapshot: CreativeStudioSnapshot) {
  const next = { ...snapshot, updatedAt: nowIso() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore browser storage failures
  }
  mirrorFeatureState('creative_studio', next);
  return next;
}

const initialSnapshot = persistSnapshot(loadSnapshot());

export const useCreativeStudioStore = create<CreativeStudioState>((set) => ({
  ...initialSnapshot,

  updateBrief: (updates) => {
    set((state) => persistSnapshot({ ...state, brief: { ...state.brief, ...updates } }));
  },

  addAssetRequest: (input) => {
    const cleanTitle = String(input.title || '').trim();
    if (!cleanTitle) return null;
    const asset: CreativeAssetRequest = {
      id: makeId('asset'),
      title: cleanTitle,
      kind: String(input.kind || 'image').trim() || 'image',
      prompt: String(input.prompt || '').trim(),
      notes: String(input.notes || '').trim(),
      status: (input.status as CreativeAssetStatus) || 'draft',
      updatedAt: nowIso(),
    };
    set((state) => persistSnapshot({ ...state, assetRequests: [asset, ...state.assetRequests] }));
    return asset;
  },

  updateAssetRequest: (assetId, updates) => {
    set((state) =>
      persistSnapshot({
        ...state,
        assetRequests: state.assetRequests.map((asset) =>
          asset.id === assetId ? { ...asset, ...updates, updatedAt: nowIso() } : asset
        ),
      })
    );
  },

  queueExport: (input) => {
    const cleanName = String(input.name || '').trim();
    if (!cleanName) return null;
    const record: CreativeExportRecord = {
      id: makeId('export'),
      name: cleanName,
      format: String(input.format || 'mp4').trim() || 'mp4',
      destination: String(input.destination || 'download').trim() || 'download',
      status: (input.status as CreativeExportStatus) || 'queued',
      updatedAt: nowIso(),
    };
    set((state) => persistSnapshot({ ...state, exports: [record, ...state.exports] }));
    return record;
  },

  updateExport: (exportId, updates) => {
    set((state) =>
      persistSnapshot({
        ...state,
        exports: state.exports.map((record) =>
          record.id === exportId ? { ...record, ...updates, updatedAt: nowIso() } : record
        ),
      })
    );
  },

  deleteExport: (exportId) => {
    set((state) =>
      persistSnapshot({
        ...state,
        exports: state.exports.filter((record) => record.id !== exportId),
      })
    );
  },

  setSelectedTemplate: (selectedTemplate) => {
    set((state) => persistSnapshot({ ...state, selectedTemplate }));
  },
}));
