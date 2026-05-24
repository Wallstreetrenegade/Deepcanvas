import { useEffect, useMemo, useRef, useState } from 'react';
import { useLarryStore, type LarryConfig, type LarryPlan, type LarryReport } from '../../stores/larryStore';
import { PLATFORM_FALLBACK, PLATFORM_GLYPHS, useSocialStationStore } from '../../stores/socialStationStore';
import './LarryAutoPanel.css';

const CATEGORY_OPTIONS: Array<{ key: LarryConfig['app']['category']; label: string }> = [
  { key: 'home', label: 'Home / Interior' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'food', label: 'Food' },
  { key: 'other', label: 'Other' },
];

const VERDICT_TONE: Record<string, string> = {
  SCALE: 'ok',
  FIX_CTA: 'warn',
  FIX_HOOKS: 'warn',
  FULL_RESET: 'danger',
  APP_ISSUE: 'danger',
  NEEDS_DATA: 'info',
};

function PlanCard({ plan, onDelete, onSend, busy }: { plan: LarryPlan; onDelete: () => void; onSend: () => void; busy: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isPosted = plan.status === 'posted';
  const isFailed = plan.status === 'render_failed' || plan.status === 'upload_failed';
  const isBusy = plan.status === 'rendering' || busy;
  const buttonLabel = isPosted ? 'Posted' : isBusy ? 'Posting…' : 'Post now';
  return (
    <div className="lr__plan">
      <header className="lr__plan-head">
        <div>
          <div className="lr__plan-title">
            {plan.title || 'Untitled plan'}
            {plan.autonomous ? <span className="lr__plan-auto" title="Autonomously generated"> auto</span> : null}
          </div>
          <div className="lr__plan-meta">
            <span className={`lr__tier lr__tier--${plan.hookTier || 'tier1'}`}>{plan.hookTier || 'tier1'}</span>
            {plan.hookCategory ? <span className="lr__plan-cat">{plan.hookCategory}</span> : null}
            <span className={`lr__plan-status lr__plan-status--${isPosted ? 'ok' : isFailed ? 'bad' : 'info'}`}>{plan.status}</span>
            {plan.requestId ? <span className="lr__plan-rid" title="Upload-Post request id">#{plan.requestId.slice(0, 8)}</span> : null}
          </div>
        </div>
        <div className="lr__plan-actions">
          <button type="button" className="lr__btn lr__btn--ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : 'Open'}
          </button>
          <button
            type="button"
            className="lr__btn lr__btn--primary"
            onClick={onSend}
            disabled={isBusy || isPosted}
            title={isPosted ? 'Already posted' : 'Render slides and post via Upload-Post'}
          >
            {buttonLabel}
          </button>
          <button type="button" className="lr__btn lr__btn--ghost" onClick={onDelete} title="Delete plan">×</button>
        </div>
      </header>
      {plan.lastError ? <div className="lr__plan-error">{plan.lastError}</div> : null}
      {expanded ? (
        <div className="lr__plan-body">
          <div className="lr__slides">
            {plan.slides.map((s) => (
              <div key={s.slide} className="lr__slide">
                <div className="lr__slide-head">
                  <span className="lr__slide-n">#{s.slide}</span>
                  <span className="lr__slide-role">{s.role}</span>
                </div>
                <div className="lr__slide-overlay">{s.overlay}</div>
                <div className="lr__slide-prompt">
                  <div className="lr__label">Image prompt</div>
                  <div>{s.imagePrompt}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="lr__caption-block">
            <div className="lr__label">Caption</div>
            <div className="lr__caption">{plan.caption}</div>
          </div>
          <div className="lr__plan-footer">
            <div><span className="lr__label">CTA</span> {plan.cta}</div>
            <div><span className="lr__label">Platforms</span> {plan.platforms.join(', ')}</div>
          </div>
          {plan.notes ? <div className="lr__notes">💡 {plan.notes}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: LarryReport }) {
  const tone = VERDICT_TONE[report.verdict] || 'info';
  return (
    <div className={`lr__report lr__report--${tone}`}>
      <div className="lr__report-head">
        <span className="lr__report-date">{report.date}</span>
        <span className={`lr__verdict lr__verdict--${tone}`}>{report.verdict}</span>
      </div>
      <div className="lr__report-headline">{report.headline}</div>
      {report.metrics ? (
        <div className="lr__metrics">
          {Object.entries(report.metrics).map(([k, v]) => (
            <div key={k} className="lr__metric">
              <div className="lr__metric-val">{v ?? '—'}</div>
              <div className="lr__metric-key">{k}</div>
            </div>
          ))}
        </div>
      ) : null}
      {report.whatIsWorking && report.whatIsWorking.length ? (
        <div className="lr__report-col">
          <div className="lr__label">What's working</div>
          <ul>{report.whatIsWorking.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      {report.whatToChange && report.whatToChange.length ? (
        <div className="lr__report-col">
          <div className="lr__label">What to change</div>
          <ul>{report.whatToChange.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      {report.suggestedHooks && report.suggestedHooks.length ? (
        <div className="lr__report-col">
          <div className="lr__label">Suggested hooks</div>
          <ul>{report.suggestedHooks.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      {report.ctaRecommendation ? (
        <div className="lr__cta-rec">
          <span className="lr__label">Next CTA</span> {report.ctaRecommendation}
        </div>
      ) : null}
    </div>
  );
}

export function LarryAutoPanel() {
  const s = useLarryStore();
  const social = useSocialStationStore();
  const {
    config, plans, reports, chat, autoEnabled, busy, lastError,
    llmReady, uploadPostReady, currentProfile, isLoaded,
    loadState, saveConfig, toggleAuto, sendChat, clearChat,
    generatePlan, deletePlan, postPlan, runDailyReport,
  } = s;

  const [guidance, setGuidance] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [appDraft, setAppDraft] = useState(config.app);
  const [scheduleDraft, setScheduleDraft] = useState<string>(config.posting.schedule.join(', '));
  const [crossPostDraft, setCrossPostDraft] = useState<Set<string>>(new Set(config.posting.crossPost));
  const [imageGenDraft, setImageGenDraft] = useState(config.imageGen);
  const [llmDraft, setLlmDraft] = useState(config.llm);
  const [researchDraft, setResearchDraft] = useState(config.competitorResearch);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoaded) void loadState();
  }, [isLoaded, loadState]);

  // Re-sync local drafts when the snapshot changes (e.g. after save)
  useEffect(() => { setAppDraft(config.app); }, [config.app]);
  useEffect(() => { setScheduleDraft(config.posting.schedule.join(', ')); }, [config.posting.schedule]);
  useEffect(() => { setCrossPostDraft(new Set(config.posting.crossPost)); }, [config.posting.crossPost]);
  useEffect(() => { setImageGenDraft(config.imageGen); }, [config.imageGen]);
  useEffect(() => { setLlmDraft(config.llm); }, [config.llm]);
  useEffect(() => { setResearchDraft(config.competitorResearch); }, [config.competitorResearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);

  const orderedPlans = useMemo(() => [...plans].reverse(), [plans]);
  const latestReport = reports[0];
  const connectedPlatforms = useMemo(() => {
    const platforms = social.platforms?.length ? social.platforms : PLATFORM_FALLBACK;
    return platforms.filter((platform) => social.connections?.[platform.key]?.connected);
  }, [social.connections, social.platforms]);
  const connectedPlatformKeys = useMemo(
    () => new Set<string>(connectedPlatforms.map((platform) => platform.key)),
    [connectedPlatforms],
  );
  const scheduleReady = useMemo(() => scheduleDraft
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .some((slot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot)), [scheduleDraft]);
  const appReady = Boolean(
    appDraft.name.trim()
    && appDraft.description.trim()
    && appDraft.audience.trim()
    && appDraft.problem.trim(),
  );
  const imageReady = imageGenDraft.provider === 'local'
    || Boolean((imageGenDraft.apiKey || '').trim())
    || (imageGenDraft.provider === 'openai' && llmReady);
  const readiness = [
    { label: 'App profile', ready: appReady },
    { label: 'Larry LLM', ready: llmReady },
    { label: 'Image generation', ready: imageReady },
    { label: 'Upload-Post profile', ready: uploadPostReady && Boolean(currentProfile) },
    { label: 'Connected destinations', ready: connectedPlatforms.length > 0 },
    { label: 'Schedule', ready: scheduleReady },
  ];

  async function handleSaveAppProfile() {
    await saveConfig({ app: appDraft });
  }

  async function handleSavePosting() {
    const schedule = scheduleDraft
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const selectedPlatforms = Array.from(crossPostDraft).filter((platform) => connectedPlatformKeys.has(platform));
    await saveConfig({
      posting: {
        schedule: schedule.length ? schedule : ['07:30', '16:30', '21:00'],
        timezone: config.posting.timezone,
        crossPost: selectedPlatforms,
      },
    });
  }

  async function handleSaveImageGen() {
    await saveConfig({ imageGen: imageGenDraft });
  }

  async function handleSaveLLM() {
    await saveConfig({ llm: llmDraft });
  }

  async function handleSaveResearch() {
    await saveConfig({ competitorResearch: researchDraft });
  }

  function toggleCrossPost(k: string) {
    setCrossPostDraft((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleGenerate() {
    const id = await generatePlan(guidance.trim() || undefined);
    if (id) setGuidance('');
  }

  async function handleSendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    await sendChat(msg);
  }

  const canGenerate = Boolean(llmReady && appDraft.name.trim() && appDraft.description.trim() && !busy);

  return (
    <div className="lr">
      {/* ───── Status strip ───── */}
      <div className="lr__status">
        <div className={`lr__chip ${llmReady ? 'is-ok' : 'is-bad'}`}>
          <span className="lr__dot" /> LLM {llmReady ? 'ready' : 'not configured'}
        </div>
        <div className={`lr__chip ${uploadPostReady ? 'is-ok' : 'is-bad'}`}>
          <span className="lr__dot" /> Publishing {uploadPostReady ? `(${currentProfile || 'default'})` : 'not configured in Social Station'}
        </div>
        <label className="lr__auto-toggle">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => void toggleAuto(e.target.checked)}
          />
          <span>Autonomous mode</span>
        </label>
      </div>

      {lastError ? <div className="lr__error">{lastError}</div> : null}

      <div className="lr__grid">
        {/* ───── Left column: Config ───── */}
        <section className="lr__col">
          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Launch readiness</h3>
              <span className={`lr__ready-count ${readiness.every((item) => item.ready) ? 'is-ok' : ''}`}>
                {readiness.filter((item) => item.ready).length}/{readiness.length}
              </span>
            </header>
            <div className="lr__checklist">
              {readiness.map((item) => (
                <div key={item.label} className={`lr__check ${item.ready ? 'is-ready' : ''}`}>
                  <span className="lr__check-dot" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="lr__warmup">
              <span>Warmup</span>
              <strong>3 posts/day for the first 7 days, TikTok as draft, add a trending sound manually, then judge hooks after 24-72h.</strong>
            </div>
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>App profile</h3>
              <button type="button" className="lr__btn lr__btn--primary" onClick={handleSaveAppProfile}>Save</button>
            </header>
            <div className="lr__form">
              <label className="lr__field">
                <span>App name</span>
                <input
                  type="text"
                  value={appDraft.name}
                  onChange={(e) => setAppDraft({ ...appDraft, name: e.target.value })}
                  placeholder="e.g. Snugly"
                />
              </label>
              <label className="lr__field">
                <span>One-line description</span>
                <input
                  type="text"
                  value={appDraft.description}
                  onChange={(e) => setAppDraft({ ...appDraft, description: e.target.value })}
                  placeholder="AI redesign for any room from a single photo"
                />
              </label>
              <label className="lr__field">
                <span>Audience</span>
                <input
                  type="text"
                  value={appDraft.audience}
                  onChange={(e) => setAppDraft({ ...appDraft, audience: e.target.value })}
                  placeholder="Gen-Z renters who can't remodel"
                />
              </label>
              <label className="lr__field">
                <span>Main pain point</span>
                <input
                  type="text"
                  value={appDraft.problem}
                  onChange={(e) => setAppDraft({ ...appDraft, problem: e.target.value })}
                  placeholder="My place looks ugly and I can't afford a designer"
                />
              </label>
              <label className="lr__field">
                <span>Differentiator</span>
                <input
                  type="text"
                  value={appDraft.differentiator}
                  onChange={(e) => setAppDraft({ ...appDraft, differentiator: e.target.value })}
                  placeholder="One photo, 20 styles, instant"
                />
              </label>
              <label className="lr__field">
                <span>App Store / landing URL</span>
                <input
                  type="url"
                  value={appDraft.appStoreUrl}
                  onChange={(e) => setAppDraft({ ...appDraft, appStoreUrl: e.target.value })}
                  placeholder="https://..."
                />
              </label>
              <div className="lr__row">
                <label className="lr__field">
                  <span>Category</span>
                  <select
                    value={appDraft.category}
                    onChange={(e) => setAppDraft({ ...appDraft, category: e.target.value as LarryConfig['app']['category'] })}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="lr__field lr__field--check">
                  <input
                    type="checkbox"
                    checked={appDraft.isMobileApp}
                    onChange={(e) => setAppDraft({ ...appDraft, isMobileApp: e.target.checked })}
                  />
                  <span>Mobile app</span>
                </label>
              </div>
            </div>
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>LLM (Larry's brain)</h3>
              <button type="button" className="lr__btn lr__btn--primary" onClick={handleSaveLLM}>Save</button>
            </header>
            <div className="lr__form">
              <div className="lr__row">
                <label className="lr__field">
                  <span>Provider</span>
                  <select
                    value={llmDraft.provider}
                    onChange={(e) => setLlmDraft({ ...llmDraft, provider: e.target.value as LarryConfig['llm']['provider'] })}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </label>
                <label className="lr__field">
                  <span>Model</span>
                  <input
                    type="text"
                    value={llmDraft.model}
                    onChange={(e) => setLlmDraft({ ...llmDraft, model: e.target.value })}
                    placeholder="gpt-4o, claude-sonnet-4-5, gemini-2.5-pro..."
                  />
                </label>
              </div>
              <label className="lr__field">
                <span>Base URL (OpenAI-compatible /v1 endpoint)</span>
                <input
                  type="text"
                  value={llmDraft.baseUrl}
                  onChange={(e) => setLlmDraft({ ...llmDraft, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="lr__field">
                <span>API key (falls back to API_KEY env var)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={llmDraft.apiKey}
                  onChange={(e) => setLlmDraft({ ...llmDraft, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>
              <div className="lr__hint">
                Larry uses this for plan generation, daily reports, and chat. If left blank,
                falls back to the global <code>API_BASE</code>/<code>API_KEY</code>/<code>MODEL_NAME</code> env vars.
              </div>
            </div>
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Image generation</h3>
              <button type="button" className="lr__btn lr__btn--primary" onClick={handleSaveImageGen}>Save</button>
            </header>
            <div className="lr__form">
              <div className="lr__row">
                <label className="lr__field">
                  <span>Provider</span>
                  <select
                    value={imageGenDraft.provider}
                    onChange={(e) => setImageGenDraft({ ...imageGenDraft, provider: e.target.value as LarryConfig['imageGen']['provider'] })}
                  >
                    <option value="openai">OpenAI (recommended)</option>
                    <option value="stability">Stability AI</option>
                    <option value="replicate">Replicate</option>
                    <option value="local">Local / BYO</option>
                  </select>
                </label>
                <label className="lr__field">
                  <span>Model</span>
                  <input
                    type="text"
                    value={imageGenDraft.model}
                    onChange={(e) => setImageGenDraft({ ...imageGenDraft, model: e.target.value })}
                    placeholder="gpt-image-1.5"
                  />
                </label>
              </div>
              <label className="lr__field">
                <span>Base image prompt (locked across all slides)</span>
                <textarea
                  rows={4}
                  value={imageGenDraft.basePrompt}
                  onChange={(e) => setImageGenDraft({ ...imageGenDraft, basePrompt: e.target.value })}
                  placeholder="iPhone photo of a small galley kitchen with white cabinets, window above the sink on left wall, wooden coffee table..."
                />
              </label>
              <label className="lr__field">
                <span>API key (falls back to OPENAI_API_KEY env var)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={imageGenDraft.apiKey ?? ''}
                  onChange={(e) => setImageGenDraft({ ...imageGenDraft, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>
            </div>
          </div>

        </section>

        {/* ───── Middle column: Plans + Report ───── */}
        <section className="lr__col">
          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Generate a post plan</h3>
            </header>
            <div className="lr__form">
              <label className="lr__field">
                <span>Optional guidance to Larry (hook direction, angle, etc.)</span>
                <textarea
                  rows={3}
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="Try a landlord-conflict hook, kitchen angle, Tier 1..."
                />
              </label>
              <div className="lr__row lr__row--end">
                <button
                  type="button"
                  className="lr__btn lr__btn--primary lr__btn--lg"
                  disabled={!canGenerate}
                  onClick={handleGenerate}
                  title={canGenerate ? 'Generate a 6-slide plan' : 'Fill app name + description and configure LLM first'}
                >
                  {busy ? 'Generating…' : 'Generate 6-slide plan'}
                </button>
              </div>
            </div>
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Plans ({plans.length})</h3>
            </header>
            {orderedPlans.length === 0 ? (
              <div className="lr__empty">No plans yet. Generate one above.</div>
            ) : (
              <div className="lr__plan-list">
                {orderedPlans.map((pl) => (
                  <PlanCard
                    key={pl.id}
                    plan={pl}
                    onDelete={() => void deletePlan(pl.id)}
                    onSend={() => void postPlan(pl.id)}
                    busy={busy}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Daily report</h3>
              <button
                type="button"
                className="lr__btn lr__btn--primary"
                disabled={busy || !llmReady}
                onClick={() => void runDailyReport(3)}
              >
                {busy ? 'Running…' : 'Run now'}
              </button>
            </header>
            {latestReport ? <ReportCard report={latestReport} /> : (
              <div className="lr__empty">No reports yet. Post a few times, then click Run now.</div>
            )}
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Posting</h3>
              <button type="button" className="lr__btn lr__btn--primary" onClick={handleSavePosting}>Save</button>
            </header>
            <div className="lr__form">
              <div className="lr__hint">
                Publishing credentials and account connections are inherited from Social Station.
                Connect accounts there, then choose which connected platforms Auto may post to here.
              </div>
              <label className="lr__field">
                <span>Daily schedule (comma-separated, user timezone)</span>
                <input
                  type="text"
                  value={scheduleDraft}
                  onChange={(e) => setScheduleDraft(e.target.value)}
                  placeholder="07:30, 16:30, 21:00"
                />
              </label>
              <div className="lr__field">
                <span>Connected destinations</span>
                {connectedPlatforms.length === 0 ? (
                  <div className="lr__empty lr__empty--tight">
                    No connected accounts yet. Use the Social Station account chips above to connect TikTok,
                    Instagram, YouTube, and the other destinations first.
                  </div>
                ) : (
                  <div className="lr__platform-grid">
                    {connectedPlatforms.map((platform) => (
                      <button
                        key={platform.key}
                        type="button"
                        className={`lr__platform-chip ${crossPostDraft.has(platform.key) ? 'is-on' : ''}`}
                        onClick={() => toggleCrossPost(platform.key)}
                        title={`Allow Auto to post to ${platform.label}`}
                      >
                        <span className="lr__platform-glyph">{PLATFORM_GLYPHS[platform.key] || platform.key.slice(0, 2).toUpperCase()}</span>
                        <span className="lr__platform-name">{platform.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lr__card">
            <header className="lr__card-head">
              <h3>Competitor research</h3>
              <button type="button" className="lr__btn lr__btn--primary" onClick={handleSaveResearch}>Save</button>
            </header>
            <div className="lr__form">
              <div className="lr__hint">
                Larry references this when generating plans and daily reports — list
                competitors and hashtags you want him to keep an eye on.
              </div>
              <label className="lr__field">
                <span>Competitor handles (one per line — <code>handle@platform</code>)</span>
                <textarea
                  rows={4}
                  value={(researchDraft.competitors || [])
                    .map((c) => `${c.handle}@${c.platform}${c.notes ? ' — ' + c.notes : ''}`)
                    .join('\n')}
                  onChange={(e) => {
                    const lines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
                    const competitors = lines.map((l) => {
                      const [head, ...notesParts] = l.split(' — ');
                      const [handle, platform = 'tiktok'] = head.split('@');
                      return {
                        handle: (handle || '').trim(),
                        platform: (platform || 'tiktok').trim(),
                        notes: notesParts.join(' — ').trim() || undefined,
                      };
                    });
                    setResearchDraft({ ...researchDraft, competitors });
                  }}
                  placeholder={'@designwithdoris@tiktok — kitchen makeover queen\n@homehacks@instagram'}
                />
              </label>
              <label className="lr__field">
                <span>Tracked hashtags (comma-separated)</span>
                <input
                  type="text"
                  value={(researchDraft.trackedHashtags || []).join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
                    setResearchDraft({ ...researchDraft, trackedHashtags: tags });
                  }}
                  placeholder="#smallkitchen, #renterhacks, #aidesign"
                />
              </label>
              <label className="lr__field">
                <span>Niche insights (Larry will reference these)</span>
                <textarea
                  rows={3}
                  value={researchDraft.nicheInsights || ''}
                  onChange={(e) => setResearchDraft({ ...researchDraft, nicheInsights: e.target.value })}
                  placeholder="Tier 1 hooks crushing in this niche right now: 'I broke my lease over...', 'My landlord is going to kill me...'"
                />
              </label>
            </div>
          </div>
        </section>

        {/* ───── Right column: Chat with Larry ───── */}
        <section className="lr__col lr__col--chat">
          <div className="lr__card lr__card--chat">
            <header className="lr__card-head">
              <h3>Chat with Larry</h3>
              <button type="button" className="lr__btn lr__btn--ghost" onClick={() => void clearChat()}>Clear</button>
            </header>
            <div className="lr__chat">
              {chat.length === 0 ? (
                <div className="lr__empty">Ask for hook ideas, CTA tweaks, or "what should I post next?"</div>
              ) : (
                chat.map((m, i) => (
                  <div key={i} className={`lr__msg lr__msg--${m.role}`}>
                    <div className="lr__msg-role">{m.role === 'user' ? 'You' : 'Larry'}</div>
                    <div className="lr__msg-body">{m.content}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="lr__chat-compose">
              <textarea
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendChat();
                  }
                }}
                placeholder="Ask Larry anything…"
                disabled={!llmReady || s.sending}
              />
              <button
                type="button"
                className="lr__btn lr__btn--primary"
                disabled={!llmReady || s.sending || !chatInput.trim()}
                onClick={() => void handleSendChat()}
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
