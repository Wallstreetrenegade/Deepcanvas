import { create } from 'zustand';
import { webRequest } from '../services/webClient';
import { mirrorFeatureState } from '../services/piMirror';

// Mirrors jiuwenclaw/pi_agent/social_larry.py

export interface LarryAppProfile {
  name: string;
  description: string;
  audience: string;
  problem: string;
  differentiator: string;
  appStoreUrl: string;
  category: 'home' | 'beauty' | 'fitness' | 'productivity' | 'food' | 'other';
  isMobileApp: boolean;
}

export interface LarryImageGen {
  provider: 'openai' | 'stability' | 'replicate' | 'local';
  model: string;
  basePrompt: string;
  useBatchAPI: boolean;
  apiKey?: string;
}

export interface LarryLLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LarryCompetitor {
  handle: string;
  platform: string;
  notes?: string;
}

export interface LarryCompetitorResearch {
  lastResearchedAt?: string | null;
  competitors: LarryCompetitor[];
  trackedHashtags: string[];
  nicheInsights: string;
}

export interface LarryPosting {
  schedule: string[];
  timezone: string;
  crossPost: string[];
}

export interface LarryConfig {
  app: LarryAppProfile;
  llm: LarryLLMConfig;
  imageGen: LarryImageGen;
  posting: LarryPosting;
  competitorResearch: LarryCompetitorResearch;
}

export interface LarrySlide {
  slide: number;
  role: string;
  overlay: string;
  imagePrompt: string;
}

export type LarryPlanStatus =
  | 'draft'
  | 'rendering'
  | 'render_failed'
  | 'upload_failed'
  | 'posted'
  | 'sent_to_composer';

export interface LarryPlan {
  id: string;
  title: string;
  hookTier: string;
  hookCategory: string;
  slides: LarrySlide[];
  caption: string;
  cta: string;
  platforms: string[];
  notes: string;
  status: LarryPlanStatus | string;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
  requestId: string | null;
  autonomous?: boolean;
  uploadResult?: Record<string, unknown>;
  lastError?: string;
}

export interface LarryReport {
  date: string;
  headline: string;
  verdict: 'SCALE' | 'FIX_CTA' | 'FIX_HOOKS' | 'FULL_RESET' | 'APP_ISSUE' | 'NEEDS_DATA';
  metrics: Record<string, number | null>;
  topPost?: Record<string, unknown>;
  worstPost?: Record<string, unknown>;
  whatIsWorking?: string[];
  whatToChange?: string[];
  suggestedHooks?: string[];
  ctaRecommendation?: string;
  generatedAt?: string;
  windowDays?: number;
  raw?: string;
}

export interface LarryChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface LarrySnapshot {
  config: LarryConfig;
  plans: LarryPlan[];
  reports: LarryReport[];
  hookPerformance: Record<string, unknown>[];
  chat: LarryChatMessage[];
  autoEnabled: boolean;
  lastReportAt: string | null;
  lastAutoPosts?: Record<string, string>;
  onboardingComplete: boolean;
  busy: boolean;
  lastError: string | null;
  llmReady: boolean;
  uploadPostReady: boolean;
  currentProfile: string;
  updatedAt: string;
}

interface RpcResp {
  state: LarrySnapshot;
  planId?: string;
  composer?: Record<string, unknown>;
  requestId?: string;
  uploadResult?: Record<string, unknown>;
}

interface LarryState extends LarrySnapshot {
  isLoaded: boolean;
  isLoading: boolean;
  sending: boolean;
  error: string | null;

  loadState: () => Promise<void>;
  refreshState: () => Promise<void>;
  clearError: () => void;

  saveConfig: (patch: Partial<LarryConfig>) => Promise<void>;
  toggleAuto: (enabled: boolean) => Promise<void>;
  reset: () => Promise<void>;

  sendChat: (message: string) => Promise<void>;
  clearChat: () => Promise<void>;

  generatePlan: (guidance?: string) => Promise<string | null>;
  deletePlan: (planId: string) => Promise<void>;
  renamePlan: (planId: string, title: string) => Promise<void>;
  updatePlanCaption: (planId: string, caption: string) => Promise<void>;
  postPlan: (planId: string) => Promise<{ requestId?: string; uploadResult?: Record<string, unknown> } | null>;

  runDailyReport: (days?: number) => Promise<void>;
}

const EMPTY_SNAPSHOT: LarrySnapshot = {
  config: {
    app: {
      name: '',
      description: '',
      audience: '',
      problem: '',
      differentiator: '',
      appStoreUrl: '',
      category: 'other',
      isMobileApp: true,
    },
    imageGen: { provider: 'openai', model: 'gpt-image-1.5', basePrompt: '', useBatchAPI: false, apiKey: '' },
    llm: { provider: 'openai', apiKey: '', baseUrl: '', model: '' },
    posting: { schedule: ['07:30', '16:30', '21:00'], timezone: '', crossPost: ['tiktok', 'instagram'] },
    competitorResearch: { competitors: [], trackedHashtags: [], nicheInsights: '', lastResearchedAt: null },
  },
  plans: [],
  reports: [],
  hookPerformance: [],
  chat: [],
  autoEnabled: false,
  lastReportAt: null,
  onboardingComplete: false,
  busy: false,
  lastError: null,
  llmReady: false,
  uploadPostReady: false,
  currentProfile: '',
  updatedAt: '',
};

function applySnapshot(snap: LarrySnapshot): LarrySnapshot {
  mirrorFeatureState('social_larry', snap);
  return snap;
}

export const useLarryStore = create<LarryState>((set, get) => {
  async function callAndApply(method: string, params?: Record<string, unknown>): Promise<RpcResp | null> {
    const resp = await webRequest<RpcResp>(method, params ?? {});
    if (!resp || !resp.state) return null;
    const snap = applySnapshot(resp.state);
    set((s) => ({ ...s, ...snap, isLoaded: true, error: snap.lastError ?? null }));
    return resp;
  }

  return {
    ...EMPTY_SNAPSHOT,
    isLoaded: false,
    isLoading: false,
    sending: false,
    error: null,

    loadState: async () => {
      if (get().isLoading) return;
      set({ isLoading: true, error: null });
      try {
        await callAndApply('social.larry.get_state');
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Failed to load Larry state' });
      } finally {
        set({ isLoading: false });
      }
    },
    refreshState: async () => {
      try {
        await callAndApply('social.larry.get_state');
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Failed to refresh' });
      }
    },
    clearError: () => set({ error: null }),

    saveConfig: async (patch) => {
      try {
        await callAndApply('social.larry.save_config', patch as Record<string, unknown>);
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Save failed' });
      }
    },
    toggleAuto: async (enabled) => {
      await callAndApply('social.larry.toggle_auto', { enabled });
    },
    reset: async () => {
      await callAndApply('social.larry.reset');
    },

    sendChat: async (message) => {
      if (!message.trim() || get().sending) return;
      set({ sending: true, error: null });
      try {
        await callAndApply('social.larry.chat', { message });
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Chat failed' });
      } finally {
        set({ sending: false });
      }
    },
    clearChat: async () => {
      await callAndApply('social.larry.clear_chat');
    },

    generatePlan: async (guidance) => {
      if (get().busy) return null;
      set({ error: null });
      try {
        const resp = await callAndApply('social.larry.generate_plan', { guidance: guidance ?? '' });
        return resp?.planId ?? null;
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Plan generation failed' });
        return null;
      }
    },
    deletePlan: async (planId) => {
      await callAndApply('social.larry.delete_plan', { planId });
    },
    renamePlan: async (planId, title) => {
      await callAndApply('social.larry.rename_plan', { planId, title });
    },
    updatePlanCaption: async (planId, caption) => {
      await callAndApply('social.larry.update_plan_caption', { planId, caption });
    },
    postPlan: async (planId) => {
      try {
        const resp = await callAndApply('social.larry.post_plan', { planId });
        if (!resp) return null;
        return { requestId: resp.requestId, uploadResult: resp.uploadResult };
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Post failed' });
        return null;
      }
    },

    runDailyReport: async (days = 3) => {
      if (get().busy) return;
      set({ error: null });
      try {
        await callAndApply('social.larry.run_daily_report', { days });
      } catch (err) {
        set({ error: (err as Error)?.message ?? 'Report failed' });
      }
    },
  };
});
