import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  PLATFORM_CHAR_LIMITS,
  PLATFORM_GLYPHS,
  type ComposerDraft,
  type MediaAsset,
  type PlatformDef,
  type PostItem,
  type PostStatus,
  type ProviderState,
  type RssFeed,
  type ScheduleMode,
  type SocialPlatformKey,
  type SocialTabKey,
  useSocialStationStore,
} from '../../stores/socialStationStore';
import './SocialStationWorkspace.css';
import { LarryAutoPanel } from './LarryAutoPanel';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TAB_OPTIONS: Array<{ key: SocialTabKey; label: string }> = [
  { key: 'creation', label: 'Composer' },
  { key: 'automation', label: 'Scheduler' },
  { key: 'feed', label: 'Feed' },
  { key: 'auto', label: 'Auto' },
];

const FEED_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
];

type CalendarMode = 'month' | 'week';
type EditorFilter = 'none' | 'warm' | 'mono' | 'vivid' | 'fade';
type CropPreset = 'original' | 'square' | 'landscape' | 'portrait' | 'story';
type TextPosition = 'top' | 'center' | 'bottom';

interface EditorState {
  cropPreset: CropPreset;
  filterPreset: EditorFilter;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  textOverlay: string;
  textPosition: TextPosition;
  brightness: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value?: string | null): Date {
  const raw = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : undefined;
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildMonthCells(year: number, monthIdx0: number): Date[] {
  const first = new Date(year, monthIdx0, 1, 12);
  const offset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function buildWeekCells(anchorDate: string): Date[] {
  const base = parseIsoDate(anchorDate);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatAssetSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: PostStatus): string {
  switch (status) {
    case 'published': return 'published';
    case 'scheduled': return 'scheduled';
    case 'publishing': return 'publishing';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    default: return 'draft';
  }
}

function scheduleModeLabel(mode: ScheduleMode): string {
  if (mode === 'now') return 'Post now';
  if (mode === 'queue') return 'Queue';
  return 'Schedule';
}

function platformDisplayName(platform: SocialPlatformKey): string {
  return platform === 'x' ? 'X / Twitter' : platform.replace(/_/g, ' ');
}

function getWeekTitle(cells: Date[]): string {
  if (cells.length === 0) return '';
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (first.getMonth() === last.getMonth()) {
    return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}-${last.getDate()}, ${last.getFullYear()}`;
  }
  return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} - ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}

function formatCalendarTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatScheduleSummary(draft: ComposerDraft): string {
  if (draft.scheduleMode === 'queue') return 'Added to queue';
  if (draft.scheduleMode === 'at' && draft.scheduleDate) {
    const date = new Date(draft.scheduleDate);
    if (!Number.isNaN(date.getTime())) {
      return `${date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ${draft.timezone}`;
    }
    return `${draft.scheduleDate} ${draft.timezone}`.trim();
  }
  return 'Publish immediately';
}

function editorFilterCss(preset: EditorFilter, brightness: number): string {
  const filterMap: Record<EditorFilter, string> = {
    none: 'saturate(1)',
    warm: 'sepia(0.18) saturate(1.1) contrast(1.02)',
    mono: 'grayscale(1) contrast(1.05)',
    vivid: 'saturate(1.35) contrast(1.12)',
    fade: 'saturate(0.8) brightness(1.05) contrast(0.92)',
  };
  return `${filterMap[preset]} brightness(${brightness})`;
}

function aspectRatioForPreset(preset: CropPreset): number | null {
  if (preset === 'square') return 1;
  if (preset === 'landscape') return 1.91 / 1;
  if (preset === 'portrait') return 4 / 5;
  if (preset === 'story') return 9 / 16;
  return null;
}

function computeCropRect(width: number, height: number, preset: CropPreset, zoom: number) {
  let cropW = width;
  let cropH = height;
  const aspect = aspectRatioForPreset(preset);
  if (aspect) {
    if (width / height > aspect) cropW = height * aspect;
    else cropH = width / aspect;
  }
  const safeZoom = Math.max(1, Math.min(2, zoom));
  cropW /= safeZoom;
  cropH /= safeZoom;
  const x = (width - cropW) / 2;
  const y = (height - cropH) / 2;
  return { x, y, width: cropW, height: cropH };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

async function renderEditedImage(asset: MediaAsset, editor: EditorState): Promise<string> {
  const image = await loadImage(asset.dataUrl);
  const crop = computeCropRect(image.naturalWidth, image.naturalHeight, editor.cropPreset, editor.zoom);
  const turns = editor.rotation / 90;
  const swapSides = turns % 2 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(swapSides ? crop.height : crop.width));
  canvas.height = Math.max(1, Math.round(swapSides ? crop.width : crop.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((editor.rotation * Math.PI) / 180);
  ctx.filter = editorFilterCss(editor.filterPreset, editor.brightness);
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -crop.width / 2,
    -crop.height / 2,
    crop.width,
    crop.height,
  );
  ctx.restore();

  if (editor.textOverlay.trim()) {
    const fontSize = Math.max(26, Math.round(canvas.width * 0.055));
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.12));
    let y = fontSize * 1.5;
    if (editor.textPosition === 'center') y = canvas.height / 2;
    if (editor.textPosition === 'bottom') y = canvas.height - fontSize * 1.2;
    ctx.strokeText(editor.textOverlay, canvas.width / 2, y);
    ctx.fillText(editor.textOverlay, canvas.width / 2, y);
  }

  return canvas.toDataURL(asset.mimeType || 'image/jpeg', 0.92);
}

function updateMediaAssetInDraft(composer: ComposerDraft, assetId: string, patch: Partial<MediaAsset>): MediaAsset[] {
  return composer.mediaAssets.map((asset) => (
    asset.id === assetId
      ? {
          ...asset,
          ...patch,
          thumbnailUrl: patch.dataUrl || patch.thumbnailUrl || asset.thumbnailUrl,
        }
      : asset
  ));
}

// ---------------------------------------------------------------------------

export function SocialStationWorkspace(_props: { onExit: () => void }) {
  const s = useSocialStationStore();
  const {
    view, platforms, connections, composer, posts, provider, rss,
    isLoaded, isLoading, error, lastConnectUrl,
    loadState, clearError,
    shiftVisiblePeriod, jumpToToday, setSelectedDate, setCalendarMode, setActiveTab,
    toggleConnectedPlatform, toggleEnabledPlatform,
    ensureProfile,
    generateConnectUrl,
    updateDraft, togglePlatformInDraft, uploadMedia, removeMediaAsset, publishPost,
    updatePost, deletePost, setFeedFilter,
    upsertRssFeed, removeRssFeed, previewRssFeed,
  } = s;

  const [rssUrlInput, setRssUrlInput] = useState('');
  const [rssNameInput, setRssNameInput] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [editorAssetId, setEditorAssetId] = useState<string>('');
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isLoaded && !isLoading) void loadState();
  }, [isLoaded, isLoading, loadState]);

  useEffect(() => {
    if (!composer.mediaAssets.length) {
      setSelectedMediaId('');
      if (editorAssetId) setEditorAssetId('');
      return;
    }
    const stillExists = composer.mediaAssets.some((asset) => asset.id === selectedMediaId);
    if (!stillExists) setSelectedMediaId(composer.mediaAssets[0].id);
  }, [composer.mediaAssets, selectedMediaId, editorAssetId]);

  const monthIdx0 = Math.max(0, Math.min(11, view.visibleMonth - 1));
  const calendarMode = (view.calendarMode || 'month') as CalendarMode;
  const monthCells = useMemo(() => buildMonthCells(view.visibleYear, monthIdx0), [view.visibleYear, monthIdx0]);
  const weekCells = useMemo(() => buildWeekCells(view.selectedDate), [view.selectedDate]);
  const calendarCells = calendarMode === 'week' ? weekCells : monthCells;
  const calendarTitle = calendarMode === 'week'
    ? getWeekTitle(weekCells)
    : `${MONTH_NAMES[monthIdx0]} ${view.visibleYear}`;

  const postsByDay = useMemo(() => {
    const map: Record<string, PostItem[]> = {};
    for (const post of posts) {
      const date = (post.scheduledFor || post.publishedAt || post.createdAt || '').slice(0, 10);
      if (!date) continue;
      (map[date] = map[date] || []).push(post);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (b.scheduledFor || b.createdAt || '').localeCompare(a.scheduledFor || a.createdAt || ''));
    }
    return map;
  }, [posts]);

  const selectedDayPosts = postsByDay[view.selectedDate] ?? [];
  const filteredFeed = useMemo(() => {
    if (view.feedFilter === 'all') return posts;
    return posts.filter((post) => post.status === view.feedFilter);
  }, [view.feedFilter, posts]);

  const connectedPlatformKeys = useMemo(() => new Set(
    Object.entries(connections)
      .filter(([, conn]) => conn?.connected)
      .map(([key]) => key),
  ), [connections]);

  const selectedMedia = composer.mediaAssets.find((asset) => asset.id === selectedMediaId) || composer.mediaAssets[0] || null;
  const editorAsset = composer.mediaAssets.find((asset) => asset.id === editorAssetId) || null;
  const selectedPlatformsConnected = composer.activePlatforms.every((platform) => connectedPlatformKeys.has(platform));
  const hasScheduleValue = composer.scheduleMode !== 'at' || !!composer.scheduleDate;
  const providerReady = provider.status === 'ok' && !!provider.currentProfile;
  const canPublish = composer.activePlatforms.length > 0 && providerReady && selectedPlatformsConnected && hasScheduleValue;
  const handleMediaPick = () => mediaInputRef.current?.click();

  const handleMediaChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) await uploadMedia(files);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const handleConnectPlatform = async (platformKey: SocialPlatformKey) => {
    if (provider.status !== 'ok') return;
    const username = provider.currentProfile || 'default';
    if (!provider.currentProfile) await ensureProfile(username);
    const url = await generateConnectUrl({ username, platforms: [platformKey] });
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleAddRss = async () => {
    if (!rssUrlInput.trim()) return;
    await upsertRssFeed({ url: rssUrlInput.trim(), name: rssNameInput.trim() || rssUrlInput.trim() });
    setRssUrlInput('');
    setRssNameInput('');
  };

  const handleSaveEditedMedia = async (assetId: string, patch: Partial<MediaAsset>) => {
    await updateDraft({ mediaAssets: updateMediaAssetInDraft(composer, assetId, patch) });
    setEditorAssetId('');
  };

  const handleUpdateSelectedMediaAltText = async (value: string) => {
    if (!selectedMedia) return;
    await updateDraft({ mediaAssets: updateMediaAssetInDraft(composer, selectedMedia.id, { altText: value }) });
  };

  return (
    <div className="ss animate-rise">
      {error ? (
        <div className="ss__banner ss__banner--error">
          <span>{error}</span>
          <button type="button" className="ss__btn ss__btn--mini" onClick={clearError}>dismiss</button>
        </div>
      ) : null}

      <ConnectRow
        platforms={platforms}
        connections={connections}
        provider={provider}
        onConnectPlatform={handleConnectPlatform}
        onRefreshConnections={toggleConnectedPlatform}
      />

      <div className={`ss__layout ${view.activeTab === 'auto' ? 'ss__layout--full' : ''}`}>
        {view.activeTab !== 'auto' ? (
          <section className="ss__calendar">
            <div className="ss__cal-nav">
              <button
                type="button"
                className="ss__btn ss__btn--icon"
                onClick={() => void shiftVisiblePeriod(-1)}
                title={calendarMode === 'week' ? 'Previous week' : 'Previous month'}
              >
                &lt;
              </button>
              <div className="ss__cal-title">{calendarTitle}</div>
              <button
                type="button"
                className="ss__btn ss__btn--icon"
                onClick={() => void shiftVisiblePeriod(1)}
                title={calendarMode === 'week' ? 'Next week' : 'Next month'}
              >
                &gt;
              </button>
              <button type="button" className="ss__btn ss__btn--ghost ss__btn--mini" onClick={() => void jumpToToday()}>Today</button>
              <div className="ss__seg">
                {(['week', 'month'] as CalendarMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`ss__seg-btn ${calendarMode === mode ? 'is-active' : ''}`}
                    onClick={() => void setCalendarMode(mode)}
                  >
                    {mode === 'week' ? 'Week' : 'Month'}
                  </button>
                ))}
              </div>
            </div>
            <div className="ss__cal-weekdays">
              {WEEKDAYS.map((weekday) => <div key={weekday} className="ss__cal-wd">{weekday}</div>)}
            </div>
            <div className={`ss__cal-grid ${calendarMode === 'week' ? 'ss__cal-grid--week' : ''}`}>
              {calendarCells.map((date) => {
                const iso = toIsoDate(date);
                const inMonth = date.getMonth() === monthIdx0;
                const isSelected = iso === view.selectedDate;
                const isToday = iso === toIsoDate(new Date());
                const dayPosts = postsByDay[iso] ?? [];
                return (
                  <button
                    key={iso}
                    type="button"
                    className={[
                      'ss__cal-cell',
                      inMonth ? '' : 'ss__cal-cell--muted',
                      isSelected ? 'is-selected' : '',
                      isToday ? 'is-today' : '',
                    ].join(' ').trim()}
                    onClick={() => void setSelectedDate(iso)}
                  >
                    <div className="ss__cal-cell-head">
                      <span className="ss__cal-dayname">{WEEKDAYS[date.getDay()]}</span>
                      <span className="ss__cal-daynum">{date.getDate()}</span>
                    </div>
                    {calendarMode === 'month' ? (
                      dayPosts.length > 0 ? (
                        <div className="ss__cal-dots">
                          {dayPosts.slice(0, 4).map((post) => (
                            <span key={post.id} className={`ss__cal-dot ss__cal-dot--${statusTone(post.status)}`} />
                          ))}
                          {dayPosts.length > 4 ? <span className="ss__cal-more">+{dayPosts.length - 4}</span> : null}
                        </div>
                      ) : null
                    ) : (
                      <div className="ss__cal-stack">
                        {dayPosts.slice(0, 3).map((post) => (
                          <span key={post.id} className={`ss__cal-entry ss__cal-entry--${statusTone(post.status)}`}>
                            <strong>{formatCalendarTime(post.scheduledFor || post.createdAt)}</strong>
                            <span>{post.caption || '(untitled post)'}</span>
                          </span>
                        ))}
                        {dayPosts.length > 3 ? <span className="ss__cal-more">+{dayPosts.length - 3} more</span> : null}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDayPosts.length > 0 ? (
              <div className="ss__day-panel">
                <div className="ss__day-panel-head">{view.selectedDate} | {selectedDayPosts.length} post{selectedDayPosts.length === 1 ? '' : 's'}</div>
                <ul className="ss__day-posts">
                  {selectedDayPosts.map((post) => (
                    <li key={post.id} className="ss__day-post">
                      <span className={`ss__pill ss__pill--${statusTone(post.status)}`}>{post.status}</span>
                      <span className="ss__day-post-caption">{post.caption || '(no caption)'}</span>
                      <span className="ss__day-post-plat">{post.platforms.join(', ')}</span>
                      <button type="button" className="ss__btn ss__btn--mini ss__btn--danger" onClick={() => void deletePost(post.id)}>x</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <aside className="ss__rail">
          <nav className="ss__tabs">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`ss__tab ${view.activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => void setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {view.activeTab === 'creation' ? (
            <Composer
              platforms={platforms}
              connections={connections}
              composer={composer}
              provider={provider}
              selectedMedia={selectedMedia}
              canPublish={canPublish}
              onSelectMedia={setSelectedMediaId}
              onOpenEditor={setEditorAssetId}
              onUpdateSelectedMediaAltText={handleUpdateSelectedMediaAltText}
              onToggle={togglePlatformInDraft}
              onUpdate={updateDraft}
              onPickMedia={handleMediaPick}
              onRemoveMedia={removeMediaAsset}
              onPublish={publishPost}
            />
          ) : null}

          {view.activeTab === 'automation' ? (
            <Scheduler posts={posts} onUpdatePost={updatePost} onDeletePost={deletePost} />
          ) : null}

          {view.activeTab === 'feed' ? (
            <FeedPanel
              posts={filteredFeed}
              feedFilter={view.feedFilter}
              onSetFilter={setFeedFilter}
              onDeletePost={deletePost}
              rssFeeds={rss.feeds}
              previewEntries={rss.previewEntries}
              rssError={rss.lastError}
              rssUrlInput={rssUrlInput}
              rssNameInput={rssNameInput}
              setRssUrlInput={setRssUrlInput}
              setRssNameInput={setRssNameInput}
              onAddRss={handleAddRss}
              onRemoveRss={removeRssFeed}
              onPreviewRss={previewRssFeed}
            />
          ) : null}

          {view.activeTab === 'auto' ? <LarryAutoPanel /> : null}
        </aside>
      </div>

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx"
        multiple
        className="ss__file-hidden"
        aria-hidden="true"
        title="Add media files"
        onChange={handleMediaChange}
      />

      {lastConnectUrl ? (
        <div className="ss__banner ss__banner--info">
          <span>Connection flow opened successfully.</span>
          <a href={lastConnectUrl} target="_blank" rel="noreferrer">Open again</a>
        </div>
      ) : null}

      <HiddenEnableShim platforms={platforms} connections={connections} onToggleEnabled={toggleEnabledPlatform} />

      {editorAsset ? (
        <ImageEditorModal
          asset={editorAsset}
          onClose={() => setEditorAssetId('')}
          onSave={handleSaveEditedMedia}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ConnectRow(props: {
  platforms: PlatformDef[];
  connections: Record<string, { connected: boolean; enabled: boolean; displayName: string; handle: string }>;
  provider: ProviderState;
  onConnectPlatform: (p: SocialPlatformKey) => void | Promise<void>;
  onRefreshConnections: (p: SocialPlatformKey) => void | Promise<void>;
}) {
  const { platforms, connections, provider, onConnectPlatform, onRefreshConnections } = props;
  const providerReady = provider.status === 'ok' && !!provider.currentProfile;

  return (
    <div className="ss__connect-row">
      <div className="ss__connect-chips">
        {platforms.map((platform) => {
          const connection = connections[platform.key];
          const connected = !!connection?.connected;
          return (
            <button
              key={platform.key}
              type="button"
              className={`ss__connect-chip ${connected ? 'is-connected' : ''}`}
              onClick={() => {
                if (connected) void onRefreshConnections(platform.key as SocialPlatformKey);
                else void onConnectPlatform(platform.key as SocialPlatformKey);
              }}
              title={
                providerReady
                  ? (connected ? `Refresh ${platform.label} connection status` : `Connect ${platform.label}`)
                  : 'Publishing credentials are being managed for this workspace'
              }
              disabled={!providerReady && !connected}
            >
              <span className="ss__connect-glyph">{PLATFORM_GLYPHS[platform.key as SocialPlatformKey] || platform.key.slice(0, 2).toUpperCase()}</span>
              <span className="ss__connect-name">{platform.label}</span>
              {connected ? <span className="ss__connect-dot" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HiddenEnableShim(props: {
  platforms: PlatformDef[];
  connections: Record<string, { connected: boolean; enabled: boolean }>;
  onToggleEnabled: (p: SocialPlatformKey) => void | Promise<void>;
}) {
  const { platforms, connections, onToggleEnabled } = props;
  const anyConnected = platforms.some((platform) => connections[platform.key]?.connected);
  if (!anyConnected) return null;
  return (
    <div className="ss__enable-row">
      <span className="ss__enable-label">Enabled destinations</span>
      {platforms.filter((platform) => connections[platform.key]?.connected).map((platform) => {
        const enabled = !!connections[platform.key]?.enabled;
        return (
          <label key={platform.key} className={`ss__enable-chip ${enabled ? 'is-on' : ''}`}>
            <input type="checkbox" checked={enabled} onChange={() => void onToggleEnabled(platform.key as SocialPlatformKey)} />
            <span>{platform.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function Composer(props: {
  platforms: PlatformDef[];
  connections: Record<string, { connected: boolean }>;
  composer: ComposerDraft;
  provider: ProviderState;
  selectedMedia: MediaAsset | null;
  canPublish: boolean;
  onSelectMedia: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onUpdateSelectedMediaAltText: (value: string) => void | Promise<void>;
  onToggle: (p: SocialPlatformKey) => void | Promise<void>;
  onUpdate: (patch: Partial<ComposerDraft>) => void | Promise<void>;
  onPickMedia: () => void;
  onRemoveMedia: (id: string) => void | Promise<void>;
  onPublish: () => void | Promise<void>;
}) {
  const {
    platforms, connections, composer, provider, selectedMedia, canPublish,
    onSelectMedia, onOpenEditor, onUpdateSelectedMediaAltText,
    onToggle, onUpdate, onPickMedia, onRemoveMedia, onPublish,
  } = props;

  const minCharLimit = useMemo(() => {
    const limits = composer.activePlatforms
      .map((platform) => PLATFORM_CHAR_LIMITS[platform])
      .filter((value): value is number => typeof value === 'number');
    return limits.length ? Math.min(...limits) : null;
  }, [composer.activePlatforms]);

  const providerReady = provider.status === 'ok' && !!provider.currentProfile;
  const connectedSelected = composer.activePlatforms.every((platform) => connections[platform]?.connected);

  return (
    <div className="ss__composer">
      <div className="ss__composer-shell">
        <div className="ss__composer-topbar">
          <div className="ss__composer-schedule">
            <div className="ss__composer-schedule-row">
              <div className="ss__seg">
                {(['now', 'at', 'queue'] as ScheduleMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`ss__seg-btn ${composer.scheduleMode === mode ? 'is-active' : ''}`}
                    onClick={() => void onUpdate({ scheduleMode: mode })}
                  >
                    {scheduleModeLabel(mode)}
                  </button>
                ))}
              </div>
              {composer.scheduleMode === 'at' ? (
                <>
                  <input
                    className="ss__input ss__input--compact"
                    type="datetime-local"
                    title="Schedule date and time"
                    aria-label="Schedule date and time"
                    value={composer.scheduleDate ? composer.scheduleDate.slice(0, 16) : ''}
                    onChange={(event) => void onUpdate({ scheduleDate: event.target.value })}
                  />
                  <input
                    className="ss__input ss__input--sm"
                    type="text"
                    title="Timezone"
                    aria-label="Timezone"
                    value={composer.timezone}
                    onChange={(event) => void onUpdate({ timezone: event.target.value })}
                    placeholder="UTC"
                  />
                </>
              ) : (
                <span className="ss__composer-schedule-pill">{formatScheduleSummary(composer)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="ss__activate">
          <div className="ss__activate-label">Choose connected profiles</div>
          <div className="ss__activate-chips">
            {platforms.map((platform) => {
              const active = composer.activePlatforms.includes(platform.key as SocialPlatformKey);
              const connected = !!connections[platform.key]?.connected;
              return (
                <button
                  key={platform.key}
                  type="button"
                  className={`ss__plat-chip ${active ? 'is-active' : ''} ${connected ? '' : 'is-disabled'}`}
                  onClick={() => { if (connected) void onToggle(platform.key as SocialPlatformKey); }}
                  title={connected ? `${platform.label} connected` : `Connect ${platform.label} before selecting it`}
                  disabled={!connected}
                >
                  <span className="ss__plat-glyph">{PLATFORM_GLYPHS[platform.key as SocialPlatformKey] || platform.key.slice(0, 2).toUpperCase()}</span>
                  <span className="ss__plat-name">{platform.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ss__composer-grid">
          <div className="ss__media-panel">
            <div className="ss__field-head">
              <label className="ss__lbl">Media</label>
              <button type="button" className="ss__btn ss__btn--ghost ss__btn--mini" onClick={onPickMedia}>Change media</button>
            </div>
            <button
              type="button"
              className={`ss__media-stage ${selectedMedia ? '' : 'is-empty'}`}
              onClick={() => {
                if (selectedMedia?.kind === 'photo') onOpenEditor(selectedMedia.id);
              }}
            >
              {!selectedMedia ? (
                <div className="ss__media-empty">
                  Upload images, video, or documents to start building the post.
                </div>
              ) : selectedMedia.kind === 'photo' ? (
                <img src={selectedMedia.dataUrl} alt={selectedMedia.altText || selectedMedia.name} />
              ) : selectedMedia.kind === 'video' ? (
                <video src={selectedMedia.dataUrl} muted />
              ) : (
                <div className="ss__media-doc ss__media-doc--large">{selectedMedia.name}</div>
              )}
            </button>
            <div className="ss__media-actions">
              <button
                type="button"
                className="ss__btn ss__btn--ghost"
                onClick={() => selectedMedia && selectedMedia.kind === 'photo' && onOpenEditor(selectedMedia.id)}
                disabled={!selectedMedia || selectedMedia.kind !== 'photo'}
              >
                Edit image
              </button>
              <button type="button" className="ss__btn ss__btn--ghost" onClick={onPickMedia}>Add / swap media</button>
              <button
                type="button"
                className="ss__btn ss__btn--danger"
                onClick={() => selectedMedia && void onRemoveMedia(selectedMedia.id)}
                disabled={!selectedMedia}
              >
                Remove
              </button>
            </div>
            {selectedMedia ? (
              <div className="ss__field">
                <label className="ss__lbl">Alt text</label>
                <textarea
                  className="ss__textarea ss__textarea--compact"
                  rows={3}
                  placeholder="Add accessibility text for this media"
                  value={selectedMedia.altText || ''}
                  onChange={(event) => void onUpdateSelectedMediaAltText(event.target.value)}
                />
              </div>
            ) : null}
            {composer.mediaAssets.length > 0 ? (
              <div className="ss__media-strip ss__media-strip--grid">
                {composer.mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={`ss__media-tile ss__media-picker ${selectedMedia?.id === asset.id ? 'is-active' : ''}`}
                    onClick={() => onSelectMedia(asset.id)}
                  >
                    {asset.kind === 'photo' ? <img src={asset.dataUrl} alt={asset.altText || asset.name} /> : null}
                    {asset.kind === 'video' ? <video src={asset.dataUrl} muted /> : null}
                    {asset.kind === 'document' ? <div className="ss__media-doc">{asset.name.slice(0, 20)}</div> : null}
                    <div className="ss__media-meta">
                      <span>{asset.kind}</span>
                      <span>{formatAssetSize(asset.sizeBytes)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ss__composer-body">
            <div className="ss__field">
              <div className="ss__field-head">
                <label className="ss__lbl">Post caption</label>
                {minCharLimit !== null ? (
                  <span className={`ss__char ${composer.caption.length > minCharLimit ? 'is-over' : ''}`}>
                    {composer.caption.length} / {minCharLimit}
                  </span>
                ) : null}
              </div>
              <textarea
                className="ss__textarea ss__textarea--hero"
                rows={7}
                placeholder="Write the main caption, hook, or announcement here."
                value={composer.caption}
                onChange={(event) => void onUpdate({ caption: event.target.value })}
              />
            </div>

            {(composer.activePlatforms.some((platform) => ['youtube', 'linkedin', 'pinterest', 'reddit'].includes(platform)) || composer.title) ? (
              <div className="ss__field">
                <label className="ss__lbl">Title / headline</label>
                <input
                  className="ss__input"
                  type="text"
                  placeholder="Optional title for YouTube, LinkedIn, Pinterest, or Reddit"
                  value={composer.title}
                  onChange={(event) => void onUpdate({ title: event.target.value })}
                />
              </div>
            ) : null}

            <div className="ss__field">
              <label className="ss__lbl">First comment</label>
              <input
                className="ss__input"
                type="text"
                placeholder="Optional first comment for supported platforms"
                value={composer.firstComment}
                onChange={(event) => void onUpdate({ firstComment: event.target.value })}
              />
            </div>

            <PlatformSettings composer={composer} onUpdate={onUpdate} />

            {composer.activePlatforms.length > 1 ? (
              <PlatformOverrides composer={composer} onUpdate={onUpdate} />
            ) : null}

            <div className="ss__publish-row">
              <button type="button" className="ss__btn ss__btn--primary" onClick={() => void onPublish()} disabled={!canPublish}>
                {composer.scheduleMode === 'now' ? 'Publish post' : composer.scheduleMode === 'at' ? 'Schedule post' : 'Add to queue'}
              </button>
              {!canPublish ? (
                <span className="ss__hint ss__hint--warn">
                  {composer.activePlatforms.length === 0
                    ? 'Select at least one connected destination.'
                    : !providerReady
                      ? 'Publishing credentials are still being configured for this workspace.'
                      : !connectedSelected
                        ? 'Connect the selected destinations before publishing.'
                        : 'Choose the scheduled time before publishing.'}
                </span>
              ) : (
                <span className="ss__hint">Ready to send with {provider.currentProfile || 'default'}.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformSettings(props: {
  composer: ComposerDraft;
  onUpdate: (patch: Partial<ComposerDraft>) => void | Promise<void>;
}) {
  const { composer, onUpdate } = props;
  if (composer.activePlatforms.length === 0) {
    return <div className="ss__empty">Choose one or more connected destinations to reveal platform-specific settings.</div>;
  }

  return (
    <div className="ss__settings-stack">
      <div className="ss__section-kicker">Platform-specific settings</div>
      {composer.activePlatforms.map((platform) => (
        <PlatformSettingsCard key={platform} platform={platform} composer={composer} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function PlatformSettingsCard(props: {
  platform: SocialPlatformKey;
  composer: ComposerDraft;
  onUpdate: (patch: Partial<ComposerDraft>) => void | Promise<void>;
}) {
  const { platform, composer, onUpdate } = props;
  const meta = (composer.platformMeta?.[platform] || {}) as Record<string, unknown>;
  const title = platformDisplayName(platform);
  const glyph = PLATFORM_GLYPHS[platform] || platform.slice(0, 2).toUpperCase();

  const setMeta = (patch: Record<string, unknown>) => void onUpdate({ platformMeta: { [platform]: patch } as ComposerDraft['platformMeta'] });

  return (
    <section className="ss__settings-card">
      <div className="ss__settings-card-head">
        <span className="ss__settings-icon">{glyph}</span>
        <div>
          <strong>{title}</strong>
          <div className="ss__hint">Only the controls for this destination are shown.</div>
        </div>
      </div>

      {platform === 'instagram' ? (
        <div className="ss__field ss__field--row">
          <label className="ss__lbl">Share mode</label>
          <select
            className="ss__input"
            title="Instagram share mode"
            aria-label="Instagram share mode"
            value={(meta.instagram_share_mode as string) || 'feed'}
            onChange={(event) => setMeta({ instagram_share_mode: event.target.value })}
          >
            <option value="feed">Feed post</option>
            <option value="reel">Reel</option>
            <option value="story">Story</option>
            <option value="carousel">Carousel</option>
          </select>
        </div>
      ) : null}

      {platform === 'facebook' ? (
        <MetaField
          label="Facebook page ID"
          value={(meta.facebook_page_id as string) || ''}
          placeholder="Enter the connected page ID"
          onChange={(value) => setMeta({ facebook_page_id: value })}
        />
      ) : null}

      {platform === 'linkedin' ? (
        <>
          <MetaField
            label="LinkedIn page URN"
            value={(meta.linkedin_page_urn as string) || ''}
            placeholder="urn:li:organization:..."
            onChange={(value) => setMeta({ linkedin_page_urn: value })}
          />
          <ToggleField
            label="Document post"
            checked={Boolean(meta.is_document)}
            onChange={(checked) => setMeta({ is_document: checked })}
          />
        </>
      ) : null}

      {platform === 'youtube' ? (
        <>
          <MetaField
            label="YouTube title"
            value={(meta.youtube_title as string) || composer.title || ''}
            placeholder="Video title"
            onChange={(value) => setMeta({ youtube_title: value })}
          />
          <div className="ss__field">
            <label className="ss__lbl">YouTube description</label>
            <textarea
              className="ss__textarea ss__textarea--compact"
              rows={3}
              placeholder="Add a longer YouTube-specific description"
              value={(meta.youtube_description as string) || ''}
              onChange={(event) => setMeta({ youtube_description: event.target.value })}
            />
          </div>
          <div className="ss__field ss__field--row">
            <label className="ss__lbl">Privacy</label>
            <select
              className="ss__input"
              title="YouTube privacy"
              aria-label="YouTube privacy"
              value={(meta.youtube_privacy as string) || 'public'}
              onChange={(event) => setMeta({ youtube_privacy: event.target.value })}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
          <MetaField
            label="Tags"
            value={Array.isArray(meta.youtube_tags) ? (meta.youtube_tags as string[]).join(', ') : ''}
            placeholder="marketing, launch, update"
            onChange={(value) => setMeta({ youtube_tags: value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
          />
        </>
      ) : null}

      {platform === 'tiktok' ? (
        <>
          <div className="ss__field ss__field--row">
            <label className="ss__lbl">Post mode</label>
            <select
              className="ss__input"
              title="TikTok post mode"
              aria-label="TikTok post mode"
              value={(meta.tiktok_post_mode as string) || 'DIRECT_POST'}
              onChange={(event) => setMeta({ tiktok_post_mode: event.target.value })}
            >
              <option value="DIRECT_POST">Direct post</option>
              <option value="DRAFT">Draft only</option>
            </select>
          </div>
          <div className="ss__field ss__field--row">
            <label className="ss__lbl">Privacy</label>
            <select
              className="ss__input"
              title="TikTok privacy"
              aria-label="TikTok privacy"
              value={(meta.tiktok_privacy_status as string) || 'PUBLIC_TO_EVERYONE'}
              onChange={(event) => setMeta({ tiktok_privacy_status: event.target.value })}
            >
              <option value="PUBLIC_TO_EVERYONE">Public</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
              <option value="SELF_ONLY">Private</option>
            </select>
          </div>
          <div className="ss__toggle-grid">
            <ToggleField label="Disable comments" checked={Boolean(meta.tiktok_disable_comments)} onChange={(checked) => setMeta({ tiktok_disable_comments: checked })} />
            <ToggleField label="Disable duet" checked={Boolean(meta.tiktok_disable_duet)} onChange={(checked) => setMeta({ tiktok_disable_duet: checked })} />
            <ToggleField label="Disable stitch" checked={Boolean(meta.tiktok_disable_stitch)} onChange={(checked) => setMeta({ tiktok_disable_stitch: checked })} />
            <ToggleField label="Brand content" checked={Boolean(meta.tiktok_brand_content_toggle)} onChange={(checked) => setMeta({ tiktok_brand_content_toggle: checked })} />
            <ToggleField label="Organic brand" checked={Boolean(meta.tiktok_brand_organic_toggle)} onChange={(checked) => setMeta({ tiktok_brand_organic_toggle: checked })} />
          </div>
        </>
      ) : null}

      {platform === 'pinterest' ? (
        <>
          <MetaField
            label="Board ID"
            value={(meta.pinterest_board_id as string) || ''}
            placeholder="Pinterest board ID"
            onChange={(value) => setMeta({ pinterest_board_id: value })}
          />
          <MetaField
            label="Destination link"
            value={(meta.pinterest_link as string) || ''}
            placeholder="https://..."
            onChange={(value) => setMeta({ pinterest_link: value })}
          />
        </>
      ) : null}

      {platform === 'reddit' ? (
        <>
          <MetaField
            label="Subreddit"
            value={(meta.subreddit as string) || ''}
            placeholder="r/community"
            onChange={(value) => setMeta({ subreddit: value })}
          />
          <MetaField
            label="Reddit title"
            value={(meta.reddit_title as string) || composer.title || ''}
            placeholder="Post title"
            onChange={(value) => setMeta({ reddit_title: value })}
          />
          <MetaField
            label="Flair ID"
            value={(meta.flair_id as string) || ''}
            placeholder="Optional flair ID"
            onChange={(value) => setMeta({ flair_id: value })}
          />
        </>
      ) : null}

      {platform === 'google_business' ? (
        <>
          <MetaField
            label="Location ID"
            value={(meta.gbp_location_id as string) || ''}
            placeholder="Google Business location ID"
            onChange={(value) => setMeta({ gbp_location_id: value })}
          />
          <div className="ss__field ss__field--row">
            <label className="ss__lbl">CTA type</label>
            <select
              className="ss__input"
              title="CTA type"
              aria-label="CTA type"
              value={(meta.cta_type as string) || ''}
              onChange={(event) => setMeta({ cta_type: event.target.value })}
            >
              <option value="">None</option>
              <option value="BOOK">Book</option>
              <option value="ORDER">Order online</option>
              <option value="SHOP">Shop</option>
              <option value="LEARN_MORE">Learn more</option>
              <option value="SIGN_UP">Sign up</option>
            </select>
          </div>
          <MetaField
            label="CTA URL"
            value={(meta.cta_url as string) || ''}
            placeholder="https://..."
            onChange={(value) => setMeta({ cta_url: value })}
          />
        </>
      ) : null}

      {platform === 'x' ? (
        <MetaField
          label="Thread posts"
          value={Array.isArray(meta.thread) ? (meta.thread as string[]).join('\n') : ''}
          placeholder="Write extra thread replies on new lines"
          multiline
          onChange={(value) => setMeta({ thread: value.split('\n').map((line) => line.trim()).filter(Boolean) })}
        />
      ) : null}

      {(platform === 'threads' || platform === 'bluesky') ? (
        <div className="ss__hint">No extra settings required for this destination right now.</div>
      ) : null}
    </section>
  );
}

function PlatformOverrides(props: {
  composer: ComposerDraft;
  onUpdate: (patch: Partial<ComposerDraft>) => void | Promise<void>;
}) {
  const { composer, onUpdate } = props;

  return (
    <div className="ss__settings-stack">
      <div className="ss__section-kicker">Per-platform overrides</div>
      {composer.activePlatforms.map((platform) => {
        const override = composer.platformOverrides?.[platform] || {};
        return (
          <section key={platform} className="ss__settings-card">
            <div className="ss__settings-card-head">
              <span className="ss__settings-icon">{PLATFORM_GLYPHS[platform] || platform.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{platformDisplayName(platform)}</strong>
                <div className="ss__hint">Override the default copy for just this destination if needed.</div>
              </div>
            </div>
            <div className="ss__field">
              <label className="ss__lbl">Caption override</label>
              <textarea
                className="ss__textarea ss__textarea--compact"
                rows={3}
                placeholder="Optional caption override"
                value={override.caption || ''}
                onChange={(event) => void onUpdate({
                  platformOverrides: {
                    ...composer.platformOverrides,
                    [platform]: {
                      ...override,
                      caption: event.target.value,
                    },
                  },
                })}
              />
            </div>
            {['youtube', 'linkedin', 'pinterest', 'reddit'].includes(platform) ? (
              <MetaField
                label="Title override"
                value={override.title || ''}
                placeholder="Optional title override"
                onChange={(value) => void onUpdate({
                  platformOverrides: {
                    ...composer.platformOverrides,
                    [platform]: {
                      ...override,
                      title: value,
                    },
                  },
                })}
              />
            ) : null}
            <MetaField
              label="First comment override"
              value={override.firstComment || ''}
              placeholder="Optional first comment override"
              onChange={(value) => void onUpdate({
                platformOverrides: {
                  ...composer.platformOverrides,
                  [platform]: {
                    ...override,
                    firstComment: value,
                  },
                },
              })}
            />
          </section>
        );
      })}
    </div>
  );
}

function MetaField(props: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  if (props.multiline) {
    return (
      <div className="ss__field">
        <label className="ss__lbl">{props.label}</label>
        <textarea
          className="ss__textarea ss__textarea--compact"
          rows={3}
          placeholder={props.placeholder || props.label}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="ss__field">
      <label className="ss__lbl">{props.label}</label>
      <input
        className="ss__input"
        type="text"
        title={props.label}
        aria-label={props.label}
        placeholder={props.placeholder || props.label}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ss__toggle">
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

function Scheduler(props: {
  posts: PostItem[];
  onUpdatePost: (id: string, patch: Partial<PostItem>) => void | Promise<void>;
  onDeletePost: (id: string) => void | Promise<void>;
}) {
  const scheduled = props.posts.filter((post) => post.status === 'scheduled');
  return (
    <div className="ss__scheduler">
      <div className="ss__sec-head">Scheduled posts</div>
      {scheduled.length === 0 ? (
        <div className="ss__empty">Nothing scheduled.</div>
      ) : (
        <ul className="ss__sched-list">
          {scheduled.map((post) => (
            <li key={post.id} className="ss__sched-item">
              <div className="ss__sched-row">
                <span className="ss__pill ss__pill--scheduled">scheduled</span>
                <span className="ss__sched-when">{(post.scheduledFor || '').replace('T', ' ').slice(0, 16) || 'queued'}</span>
              </div>
              <input
                className="ss__input"
                type="datetime-local"
                title="Scheduled time"
                aria-label="Scheduled time"
                value={post.scheduledFor ? post.scheduledFor.slice(0, 16) : ''}
                onChange={(event) => void props.onUpdatePost(post.id, { scheduledFor: event.target.value })}
              />
              <textarea
                className="ss__textarea"
                rows={2}
                title="Caption"
                aria-label="Caption"
                value={post.caption}
                onChange={(event) => void props.onUpdatePost(post.id, { caption: event.target.value })}
              />
              <div className="ss__sched-foot">
                <span className="ss__hint">{post.platforms.join(' | ')}</span>
                <button type="button" className="ss__btn ss__btn--mini ss__btn--danger" onClick={() => void props.onDeletePost(post.id)}>
                  Cancel
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedPanel(props: {
  posts: PostItem[];
  feedFilter: string;
  onSetFilter: (f: string) => void | Promise<void>;
  onDeletePost: (id: string) => void | Promise<void>;
  rssFeeds: RssFeed[];
  previewEntries: Array<{ title: string; link: string; publishedAt: string }>;
  rssError: string | null;
  rssUrlInput: string;
  rssNameInput: string;
  setRssUrlInput: (value: string) => void;
  setRssNameInput: (value: string) => void;
  onAddRss: () => Promise<void>;
  onRemoveRss: (id: string) => void | Promise<void>;
  onPreviewRss: (url: string) => void | Promise<void>;
}) {
  return (
    <div className="ss__feed">
      <div className="ss__sec-head">History</div>
      <div className="ss__filter-row">
        {FEED_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`ss__filter-chip ${props.feedFilter === filter.key ? 'is-active' : ''}`}
            onClick={() => void props.onSetFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {props.posts.length === 0 ? (
        <div className="ss__empty">No posts yet.</div>
      ) : (
        <ul className="ss__feed-list">
          {props.posts.map((post) => (
            <li key={post.id} className="ss__feed-item">
              <div className="ss__feed-head">
                <span className={`ss__pill ss__pill--${statusTone(post.status)}`}>{post.status}</span>
                <span className="ss__hint">{post.platforms.join(' | ')}</span>
                <button type="button" className="ss__btn ss__btn--mini ss__btn--danger" onClick={() => void props.onDeletePost(post.id)}>x</button>
              </div>
              <div className="ss__feed-caption">{post.caption || '(no caption)'}</div>
              {post.lastError ? <div className="ss__feed-err">{post.lastError}</div> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="ss__sec-head ss__sec-head--sp">RSS sources</div>
      <div className="ss__rss-add">
        <input
          className="ss__input ss__input--sm"
          type="text"
          placeholder="Name"
          value={props.rssNameInput}
          onChange={(event) => props.setRssNameInput(event.target.value)}
        />
        <input
          className="ss__input"
          type="url"
          placeholder="https://example.com/feed.xml"
          value={props.rssUrlInput}
          onChange={(event) => props.setRssUrlInput(event.target.value)}
        />
        <button type="button" className="ss__btn ss__btn--primary ss__btn--mini" onClick={() => void props.onAddRss()}>Add</button>
      </div>

      {props.rssFeeds.length === 0 ? (
        <div className="ss__empty">No RSS feeds configured.</div>
      ) : (
        <ul className="ss__rss-list">
          {props.rssFeeds.map((feed) => (
            <li key={feed.id} className="ss__rss-item">
              <div className="ss__rss-row">
                <strong className="ss__rss-name">{feed.name}</strong>
                <span className={`ss__pill ${feed.enabled ? 'ss__pill--published' : 'ss__pill--draft'}`}>{feed.enabled ? 'on' : 'off'}</span>
              </div>
              <div className="ss__rss-url">{feed.url}</div>
              <div className="ss__rss-actions">
                <button type="button" className="ss__btn ss__btn--ghost ss__btn--mini" onClick={() => void props.onPreviewRss(feed.url)}>Preview</button>
                <button type="button" className="ss__btn ss__btn--mini ss__btn--danger" onClick={() => void props.onRemoveRss(feed.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {props.previewEntries.length > 0 ? (
        <>
          <div className="ss__sec-head ss__sec-head--sp">Preview</div>
          <ul className="ss__rss-preview">
            {props.previewEntries.slice(0, 8).map((entry, idx) => (
              <li key={idx} className="ss__rss-entry">
                <a href={entry.link} target="_blank" rel="noreferrer">{entry.title || '(untitled)'}</a>
                <span className="ss__hint">{entry.publishedAt}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {props.rssError ? <div className="ss__feed-err">{props.rssError}</div> : null}
    </div>
  );
}

function ImageEditorModal(props: {
  asset: MediaAsset;
  onClose: () => void;
  onSave: (assetId: string, patch: Partial<MediaAsset>) => void | Promise<void>;
}) {
  const { asset, onClose, onSave } = props;
  const [editor, setEditor] = useState<EditorState>({
    cropPreset: 'original',
    filterPreset: 'none',
    zoom: 1,
    rotation: 0,
    textOverlay: '',
    textPosition: 'bottom',
    brightness: 1,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const previewStyle = useMemo(() => ({
    filter: editorFilterCss(editor.filterPreset, editor.brightness),
    transform: `scale(${editor.zoom}) rotate(${editor.rotation}deg)`,
  }), [editor]);

  const aspectClass = `is-${editor.cropPreset}`;

  const handleSave = async () => {
    setIsSaving(true);
    setEditorError(null);
    try {
      const dataUrl = await renderEditedImage(asset, editor);
      await onSave(asset.id, { dataUrl, thumbnailUrl: dataUrl });
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Could not update image');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ss__modal-backdrop" onClick={onClose}>
      <div className="ss__modal" onClick={(event) => event.stopPropagation()}>
        <div className="ss__modal-head">
          <div>
            <div className="ss__section-kicker">Edit image</div>
            <strong>{asset.name}</strong>
          </div>
          <button type="button" className="ss__btn ss__btn--ghost" onClick={onClose}>Close</button>
        </div>
        <div className="ss__modal-body">
          <div className="ss__editor-tools">
            <div className="ss__field">
              <label className="ss__lbl">Crop</label>
              <div className="ss__editor-option-grid">
                {(['original', 'square', 'landscape', 'portrait', 'story'] as CropPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`ss__editor-option ${editor.cropPreset === preset ? 'is-active' : ''}`}
                    onClick={() => setEditor((prev) => ({ ...prev, cropPreset: preset }))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Filters</label>
              <div className="ss__editor-option-grid">
                {(['none', 'warm', 'mono', 'vivid', 'fade'] as EditorFilter[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`ss__editor-option ${editor.filterPreset === preset ? 'is-active' : ''}`}
                    onClick={() => setEditor((prev) => ({ ...prev, filterPreset: preset }))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Zoom</label>
              <input
                className="ss__range"
                type="range"
                min="1"
                max="2"
                step="0.05"
                value={editor.zoom}
                onChange={(event) => setEditor((prev) => ({ ...prev, zoom: Number(event.target.value) }))}
              />
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Brightness</label>
              <input
                className="ss__range"
                type="range"
                min="0.8"
                max="1.35"
                step="0.05"
                value={editor.brightness}
                onChange={(event) => setEditor((prev) => ({ ...prev, brightness: Number(event.target.value) }))}
              />
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Rotate</label>
              <div className="ss__editor-option-grid">
                {[0, 90, 180, 270].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`ss__editor-option ${editor.rotation === value ? 'is-active' : ''}`}
                    onClick={() => setEditor((prev) => ({ ...prev, rotation: value as EditorState['rotation'] }))}
                  >
                    {value} deg
                  </button>
                ))}
              </div>
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Overlay text</label>
              <textarea
                className="ss__textarea ss__textarea--compact"
                rows={3}
                placeholder="Optional text overlay"
                value={editor.textOverlay}
                onChange={(event) => setEditor((prev) => ({ ...prev, textOverlay: event.target.value }))}
              />
            </div>

            <div className="ss__field">
              <label className="ss__lbl">Text position</label>
              <div className="ss__editor-option-grid">
                {(['top', 'center', 'bottom'] as TextPosition[]).map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={`ss__editor-option ${editor.textPosition === position ? 'is-active' : ''}`}
                    onClick={() => setEditor((prev) => ({ ...prev, textPosition: position }))}
                  >
                    {position}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ss__editor-stage">
            <div className={`ss__editor-canvas ${aspectClass}`}>
              <img src={asset.dataUrl} alt={asset.altText || asset.name} style={previewStyle} />
              {editor.textOverlay.trim() ? (
                <div className={`ss__editor-overlay ss__editor-overlay--${editor.textPosition}`}>{editor.textOverlay}</div>
              ) : null}
            </div>
            <div className="ss__hint">Click update image to bake the crop, filter, brightness, rotation, and text into the media asset.</div>
            {editorError ? <div className="ss__feed-err">{editorError}</div> : null}
          </div>
        </div>
        <div className="ss__modal-foot">
          <button type="button" className="ss__btn ss__btn--ghost" onClick={onClose}>Discard changes</button>
          <button type="button" className="ss__btn ss__btn--primary" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? 'Updating...' : 'Update image'}
          </button>
        </div>
      </div>
    </div>
  );
}
