import { create } from 'zustand';
import { webRequest } from '../services/webClient';
import { mirrorFeatureState } from '../services/piMirror';

// ---------------------------------------------------------------------------
// Canonical types — must match jiuwenclaw/pi_agent/social_station.py
// ---------------------------------------------------------------------------

export type SocialPlatformKey =
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'youtube'
  | 'threads'
  | 'pinterest'
  | 'reddit'
  | 'bluesky'
  | 'google_business';

export type SocialTabKey = 'creation' | 'automation' | 'feed' | 'auto';
export type ScheduleMode = 'now' | 'at' | 'queue';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled';
export type MediaKind = 'photo' | 'video' | 'document';

export interface PlatformDef {
  key: SocialPlatformKey;
  label: string;
  dailyCap: number;
  supports: string[];
}

export interface PlatformConnection {
  connected: boolean;
  enabled: boolean;
  displayName: string;
  handle: string;
  accountId: string;
  tokenRef: string;
  status: string;
  lastSyncAt: string | null;
  oauthConfigured: boolean;
  scopes: string[];
  notes: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  dataUrl: string;
  thumbnailUrl: string;
  sizeBytes: number;
  durationSec: number;
  mimeType: string;
  addedAt: string;
  altText?: string;
}

export interface ComposerDraft {
  activePlatforms: SocialPlatformKey[];
  caption: string;
  title: string;
  firstComment: string;
  scheduleMode: ScheduleMode;
  scheduleDate: string;
  timezone: string;
  mediaAssets: MediaAsset[];
  platformMeta: Record<string, Record<string, unknown>>;
  platformOverrides: Partial<Record<SocialPlatformKey, { caption?: string; title?: string; firstComment?: string }>>;
  lastError: string | null;
}

export interface PostItem {
  id: string;
  status: PostStatus;
  platforms: SocialPlatformKey[];
  caption: string;
  title?: string;
  firstComment?: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  mediaAssets?: MediaAsset[];
  platformMeta?: Record<string, unknown>;
  platformResults?: Record<string, { url?: string; postId?: string; error?: string }>;
  uploadPostRequestId?: string;
  uploadPostJobId?: string;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderProfile {
  username: string;
  displayName: string;
  status: string;
  connectedPlatforms: string[];
  lastSyncAt: string;
}

export interface ProviderState {
  apiKey: string;
  apiKeyConfigured: boolean;
  credentialSource: 'missing' | 'environment' | 'user';
  status: 'ok' | 'missing_key' | 'error';
  profiles: ProviderProfile[];
  currentProfile: string;
  lastError: string | null;
  lastSyncAt: string | null;
  account?: Record<string, unknown>;
}

export interface RssFeed {
  id: string;
  name: string;
  url: string;
  prompt: string;
  enabled: boolean;
  publishTargets: SocialPlatformKey[];
  lastPolledAt?: string | null;
  entryCount: number;
  updatedAt?: string;
}

export interface RssPreviewEntry {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
}

export interface ViewState {
  visibleYear: number;
  visibleMonth: number; // 1..12
  selectedDate: string; // YYYY-MM-DD
  calendarMode: 'month' | 'week';
  activeTab: SocialTabKey;
  feedFilter: string;
}

export interface SocialStationSnapshot {
  view: ViewState;
  platforms: PlatformDef[];
  connections: Record<string, PlatformConnection>;
  composer: ComposerDraft;
  posts: PostItem[];
  provider: ProviderState;
  automation: { enabled: boolean; rules: unknown[]; notes: string; lastLaunch?: unknown };
  rss: { feeds: RssFeed[]; previewEntries: RssPreviewEntry[]; lastError: string | null };
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const PLATFORM_FALLBACK: PlatformDef[] = [
  { key: 'tiktok',          label: 'TikTok',          dailyCap: 15,  supports: ['video'] },
  { key: 'instagram',       label: 'Instagram',       dailyCap: 50,  supports: ['video', 'photo', 'reel', 'story', 'carousel'] },
  { key: 'x',               label: 'X / Twitter',     dailyCap: 50,  supports: ['text', 'photo', 'video', 'thread', 'poll'] },
  { key: 'facebook',        label: 'Facebook',        dailyCap: 25,  supports: ['text', 'photo', 'video'] },
  { key: 'linkedin',        label: 'LinkedIn',        dailyCap: 150, supports: ['text', 'photo', 'video', 'document'] },
  { key: 'youtube',         label: 'YouTube',         dailyCap: 10,  supports: ['video'] },
  { key: 'threads',         label: 'Threads',         dailyCap: 50,  supports: ['text', 'photo', 'video'] },
  { key: 'pinterest',       label: 'Pinterest',       dailyCap: 20,  supports: ['photo', 'video'] },
  { key: 'reddit',          label: 'Reddit',          dailyCap: 40,  supports: ['text', 'photo', 'video', 'link'] },
  { key: 'bluesky',         label: 'Bluesky',         dailyCap: 50,  supports: ['text', 'photo', 'video'] },
  { key: 'google_business', label: 'Google Business', dailyCap: 10,  supports: ['text', 'photo', 'cta', 'event', 'offer'] },
];

const PLATFORM_KEYS = new Set(PLATFORM_FALLBACK.map((p) => p.key));

export const PLATFORM_CHAR_LIMITS: Partial<Record<SocialPlatformKey, number>> = {
  x: 280,
  threads: 500,
  bluesky: 300,
  tiktok: 2200,
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  youtube: 5000,
  pinterest: 500,
  reddit: 40000,
  google_business: 1500,
};

export const PLATFORM_GLYPHS: Record<SocialPlatformKey, string> = {
  tiktok: 'TT',
  instagram: 'IG',
  x: 'X',
  facebook: 'FB',
  linkedin: 'In',
  youtube: 'YT',
  threads: '@',
  pinterest: 'P',
  reddit: 'r/',
  bluesky: 'BS',
  google_business: 'GB',
};

function emptyConnection(label: string): PlatformConnection {
  return {
    connected: false,
    enabled: false,
    displayName: label,
    handle: '',
    accountId: '',
    tokenRef: '',
    status: 'disconnected',
    lastSyncAt: null,
    oauthConfigured: false,
    scopes: [],
    notes: '',
  };
}

function defaultComposer(): ComposerDraft {
  return {
    activePlatforms: [],
    caption: '',
    title: '',
    firstComment: '',
    scheduleMode: 'now',
    scheduleDate: '',
    timezone: 'UTC',
    mediaAssets: [],
    platformMeta: {
      facebook: { facebook_page_id: '' },
      pinterest: { pinterest_board_id: '', pinterest_link: '' },
      reddit: { subreddit: '', reddit_title: '', flair_id: '' },
      google_business: {
        gbp_location_id: '',
        cta_type: '',
        cta_url: '',
        event: { title: '', start: '', end: '' },
        offer: { title: '', coupon_code: '', redeem_url: '', terms: '' },
      },
      youtube: { youtube_title: '', youtube_description: '', youtube_privacy: 'public', youtube_tags: [] },
      tiktok: {
        tiktok_post_mode: 'DIRECT_POST',
        tiktok_privacy_status: 'PUBLIC_TO_EVERYONE',
        tiktok_disable_comments: false,
        tiktok_disable_duet: false,
        tiktok_disable_stitch: false,
        tiktok_brand_content_toggle: false,
        tiktok_brand_organic_toggle: false,
      },
      instagram: { instagram_share_mode: 'feed' },
      x: { thread: [], x_poll: null },
      linkedin: { is_document: false, linkedin_page_urn: '' },
      threads: {},
      bluesky: {},
    },
    platformOverrides: {},
    lastError: null,
  };
}

function defaultSnapshot(): SocialStationSnapshot {
  const today = new Date();
  const connections: Record<string, PlatformConnection> = {};
  PLATFORM_FALLBACK.forEach((p) => { connections[p.key] = emptyConnection(p.label); });
  return {
    view: {
      visibleYear: today.getFullYear(),
      visibleMonth: today.getMonth() + 1,
      selectedDate: today.toISOString().slice(0, 10),
      calendarMode: 'month',
      activeTab: 'creation',
      feedFilter: 'all',
    },
    platforms: PLATFORM_FALLBACK,
    connections,
    composer: defaultComposer(),
    posts: [],
    provider: {
      apiKey: '',
      apiKeyConfigured: false,
      credentialSource: 'missing',
      status: 'missing_key',
      profiles: [],
      currentProfile: '',
      lastError: null,
      lastSyncAt: null,
    },
    automation: { enabled: false, rules: [], notes: '' },
    rss: { feeds: [], previewEntries: [], lastError: null },
  };
}

function normalizeState(raw?: Partial<SocialStationSnapshot> | null): SocialStationSnapshot {
  const base = defaultSnapshot();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.view) base.view = { ...base.view, ...raw.view };
  if (Array.isArray(raw.platforms) && raw.platforms.length > 0) base.platforms = raw.platforms;
  if (raw.connections) {
    for (const key of Object.keys(raw.connections)) {
      if (PLATFORM_KEYS.has(key as SocialPlatformKey)) {
        base.connections[key] = { ...base.connections[key], ...raw.connections[key] };
      }
    }
  }
  if (raw.composer) {
    base.composer = {
      ...base.composer,
      ...raw.composer,
      activePlatforms: (raw.composer.activePlatforms ?? []).filter((p) => PLATFORM_KEYS.has(p)),
      platformMeta: { ...base.composer.platformMeta, ...(raw.composer.platformMeta ?? {}) },
      platformOverrides: raw.composer.platformOverrides ?? {},
      mediaAssets: Array.isArray(raw.composer.mediaAssets) ? raw.composer.mediaAssets : [],
    };
  }
  if (Array.isArray(raw.posts)) base.posts = raw.posts;
  if (raw.provider) base.provider = { ...base.provider, ...raw.provider };
  if (raw.automation) base.automation = { ...base.automation, ...raw.automation };
  if (raw.rss) {
    base.rss = {
      feeds: Array.isArray(raw.rss.feeds) ? raw.rss.feeds : [],
      previewEntries: Array.isArray(raw.rss.previewEntries) ? raw.rss.previewEntries : [],
      lastError: raw.rss.lastError ?? null,
    };
  }
  if (raw.updatedAt) base.updatedAt = raw.updatedAt;
  return base;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function inferKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  if (/\.(pdf|docx?|pptx?)$/i.test(file.name)) return 'document';
  return 'photo';
}

function shiftMonthLocally(view: ViewState, direction: -1 | 1): ViewState {
  let year = view.visibleYear;
  let month = view.visibleMonth + direction;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { ...view, visibleYear: year, visibleMonth: month };
}

function shiftPeriodLocally(view: ViewState, direction: -1 | 1): ViewState {
  if (view.calendarMode !== 'week') return shiftMonthLocally(view, direction);
  const base = new Date(`${view.selectedDate}T12:00:00`);
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  safe.setDate(safe.getDate() + (direction * 7));
  return {
    ...view,
    selectedDate: safe.toISOString().slice(0, 10),
    visibleYear: safe.getFullYear(),
    visibleMonth: safe.getMonth() + 1,
  };
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface StoreState extends SocialStationSnapshot {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  lastConnectUrl: string;

  loadState: () => Promise<void>;
  refreshState: () => Promise<void>;
  clearError: () => void;

  shiftVisibleMonth: (direction: -1 | 1) => Promise<void>;
  shiftVisiblePeriod: (direction: -1 | 1) => Promise<void>;
  jumpToToday: () => Promise<void>;
  setSelectedDate: (date: string) => Promise<void>;
  setCalendarMode: (mode: 'month' | 'week') => Promise<void>;
  setActiveTab: (tab: SocialTabKey) => Promise<void>;
  setFeedFilter: (filter: string) => Promise<void>;

  toggleConnectedPlatform: (platform: SocialPlatformKey) => Promise<void>;
  toggleEnabledPlatform: (platform: SocialPlatformKey) => Promise<void>;
  updateConnection: (platform: SocialPlatformKey, patch: Partial<PlatformConnection>) => Promise<void>;

  setUploadPostApiKey: (apiKey: string) => Promise<void>;
  listProfiles: () => Promise<void>;
  ensureProfile: (username: string) => Promise<void>;
  generateConnectUrl: (args: { username?: string; platforms?: SocialPlatformKey[]; redirectUrl?: string }) => Promise<string>;

  updateDraft: (patch: Partial<ComposerDraft>) => Promise<void>;
  togglePlatformInDraft: (platform: SocialPlatformKey) => Promise<void>;
  uploadMedia: (files: File[]) => Promise<void>;
  removeMediaAsset: (id: string) => Promise<void>;
  publishPost: () => Promise<void>;

  createPost: (post: Partial<PostItem>) => Promise<void>;
  updatePost: (id: string, patch: Partial<PostItem>) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  updateAutomation: (patch: Record<string, unknown>) => Promise<void>;

  upsertRssFeed: (feed: Partial<RssFeed> & { url: string }) => Promise<void>;
  removeRssFeed: (id: string) => Promise<void>;
  previewRssFeed: (url: string) => Promise<void>;

  launchAgent: (intent: string, payload?: Record<string, unknown>) => Promise<void>;
}

interface RpcReply {
  state?: Partial<SocialStationSnapshot>;
  [k: string]: unknown;
}

async function rpc(method: string, params?: Record<string, unknown>): Promise<RpcReply> {
  return ((await webRequest<RpcReply>(method, params)) ?? {}) as RpcReply;
}

export const useSocialStationStore = create<StoreState>((set, get) => {
  function apply(snapshot?: Partial<SocialStationSnapshot>) {
    const next = normalizeState(snapshot ?? {});
    set({ ...next, isLoaded: true, isLoading: false, error: null });
  }

  async function callAndApply(method: string, params?: Record<string, unknown>): Promise<RpcReply> {
    try {
      const resp = await rpc(method, params);
      if (resp.state) apply(resp.state);
      return resp;
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed: ${method}`;
      set({ error: msg });
      throw err;
    }
  }

  return {
    ...defaultSnapshot(),
    isLoaded: false,
    isLoading: false,
    error: null,
    lastConnectUrl: '',

    loadState: async () => {
      if (get().isLoading) return;
      set({ isLoading: true, error: null });
      try {
        const resp = await rpc('social.station.get_state');
        apply(resp.state ?? {});
      } catch (err) {
        set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load Social Station' });
      }
    },

    refreshState: async () => { await callAndApply('social.station.get_state'); },

    clearError: () => set({ error: null }),

    shiftVisibleMonth: async (direction) => {
      const previous = get().view;
      set({ view: shiftMonthLocally(previous, direction) });
      try {
        await callAndApply('social.station.shift_visible_month', { direction });
      } catch {
        set({ error: null });
      }
    },
    shiftVisiblePeriod: async (direction) => {
      const previous = get().view;
      set({ view: shiftPeriodLocally(previous, direction) });
      try {
        await callAndApply('social.station.shift_visible_period', { direction });
      } catch {
        set({ error: null });
      }
    },
    jumpToToday: async () => { await callAndApply('social.station.jump_to_today'); },
    setSelectedDate: async (date) => { await callAndApply('social.station.set_selected_date', { date }); },
    setCalendarMode: async (mode) => {
      set((state) => ({ view: { ...state.view, calendarMode: mode } }));
      try {
        await callAndApply('social.station.set_calendar_mode', { mode });
      } catch {
        set({ error: null });
      }
    },
    setActiveTab: async (tab) => { await callAndApply('social.station.set_active_tab', { tab }); },
    setFeedFilter: async (filter) => { await callAndApply('social.station.set_feed_filter', { filter }); },

    toggleConnectedPlatform: async (platform) => { await callAndApply('social.station.toggle_connected_platform', { platform }); },
    toggleEnabledPlatform: async (platform) => { await callAndApply('social.station.toggle_enabled_platform', { platform }); },
    updateConnection: async (platform, patch) => { await callAndApply('social.station.update_connection', { platform, patch }); },

    setUploadPostApiKey: async (apiKey) => { await callAndApply('social.station.set_upload_post_api_key', { apiKey }); },
    listProfiles: async () => { await callAndApply('social.station.list_profiles'); },
    ensureProfile: async (username) => { await callAndApply('social.station.ensure_profile', { username }); },
    generateConnectUrl: async ({ username, platforms, redirectUrl }) => {
      const resp = await callAndApply('social.station.generate_connect_url', {
        username: username ?? get().provider.currentProfile,
        platforms,
        redirectUrl,
      });
      const url = (resp.connectUrl as string) || '';
      set({ lastConnectUrl: url });
      return url;
    },

    updateDraft: async (patch) => { await callAndApply('social.station.update_draft', { patch }); },
    togglePlatformInDraft: async (platform) => {
      const current = get().composer.activePlatforms;
      const next = current.includes(platform)
        ? current.filter((p) => p !== platform)
        : [...current, platform];
      await callAndApply('social.station.update_draft', { patch: { activePlatforms: next } });
    },
    uploadMedia: async (files) => {
      const payloads = await Promise.all(files.map(async (file) => ({
        name: file.name,
        kind: inferKind(file),
        dataUrl: await fileToDataUrl(file),
        sizeBytes: file.size,
        mimeType: file.type,
      })));
      await callAndApply('social.station.upload_media', { files: payloads });
    },
    removeMediaAsset: async (id) => {
      const current = get().composer.mediaAssets.filter((a) => a.id !== id);
      await callAndApply('social.station.update_draft', { patch: { mediaAssets: current } });
    },
    publishPost: async () => { await callAndApply('social.station.publish_post'); },

    createPost: async (post) => { await callAndApply('social.station.create_post', { post }); },
    updatePost: async (id, patch) => { await callAndApply('social.station.update_post', { id, patch }); },
    deletePost: async (id) => { await callAndApply('social.station.delete_post', { id }); },

    updateAutomation: async (patch) => { await callAndApply('social.station.update_automation', { patch }); },

    upsertRssFeed: async (feed) => { await callAndApply('social.station.upsert_rss_feed', { feed }); },
    removeRssFeed: async (id) => { await callAndApply('social.station.remove_rss_feed', { id }); },
    previewRssFeed: async (url) => { await callAndApply('social.station.preview_rss_feed', { url }); },

    launchAgent: async (intent, payload) => { await callAndApply('social.station.launch_agent', { intent, payload }); },
  };
});

// Silent mirror for the PI agent — feature_tools read this.
useSocialStationStore.subscribe((state) => {
  mirrorFeatureState('social_posts', {
    posts: state.posts,
    composer: state.composer,
    connections: state.connections,
    provider: { status: state.provider.status, currentProfile: state.provider.currentProfile },
    view: state.view,
    rss: state.rss,
  });
});
