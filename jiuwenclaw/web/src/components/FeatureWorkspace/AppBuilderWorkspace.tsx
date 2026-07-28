import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  BarChart3,
  Clapperboard,
  Download,
  Image as ImageIcon,
  Maximize2,
  Megaphone,
  Minimize2,
  Search,
  type LucideIcon,
  MonitorSmartphone,
  Presentation,
  Sparkles,
  Wand2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useAppBuilderStore,
  type ChatMessage,
  type OpenDesignCatalogItem,
  type ProjectSummary,
} from '../../stores/appBuilderStore';
import './AppBuilderWorkspace.css';

type StudioModeId = 'prototype' | 'live-artifact' | 'deck' | 'image' | 'video' | 'hyperframes' | 'marketing';
type TemplateKind = StudioModeId | 'audio';
type TemplateTone = 'teal' | 'blue' | 'lime' | 'amber' | 'violet' | 'rose';

const DEFAULT_OPEN_DESIGN_BASE_URL = 'http://127.0.0.1:7456';

interface BuildTemplate {
  id: string;
  title: string;
  author: string;
  source: string;
  kind: TemplateKind;
  scene: string;
  description: string;
  prompt: string;
  tone: TemplateTone;
  tags: string[];
  previewUrl?: string;
  previewUrls?: string[];
  previewHtmlSrc?: string;
}

const STUDIO_MODES: Array<{
  id: StudioModeId;
  label: string;
  context: string;
  Icon: LucideIcon;
}> = [
  {
    id: 'prototype',
    label: 'Prototype',
    context: 'High-fidelity web, desktop, or mobile prototype. Use this for landing pages, websites, apps, tools, and product screens.',
    Icon: MonitorSmartphone,
  },
  {
    id: 'live-artifact',
    label: 'Live artifact',
    context: 'Live artifact or dashboard. Use this for analytics, reports, KPI screens, admin views, data tools, and interactive artifacts.',
    Icon: BarChart3,
  },
  {
    id: 'deck',
    label: 'Slide deck',
    context: 'Slide deck. Use this for magazine decks, weekly updates, pitch decks, book summaries, sales decks, and presentations.',
    Icon: Presentation,
  },
  {
    id: 'image',
    label: 'Image',
    context: 'Image generation or image editing. Use this for hero images, product mockups, visual assets, and image transformations.',
    Icon: ImageIcon,
  },
  {
    id: 'video',
    label: 'Video',
    context: 'Video or motion output. Use this for short videos, animated explainers, visual sequences, and motion graphics.',
    Icon: Clapperboard,
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    context: 'HyperFrames agent-native motion graphics. Use this for programmable motion, animated frames, and exportable motion artifacts.',
    Icon: Sparkles,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    context: 'Marketing strategy and growth artifacts. Use this for CRO, copywriting, SEO, ad creative, funnels, launches, email, social, sales enablement, pricing, and campaign assets.',
    Icon: Megaphone,
  },
];

const TEMPLATE_KIND_LABELS: Record<TemplateKind | 'all', string> = {
  all: 'All',
  prototype: 'Prototype',
  'live-artifact': 'Live Artifact',
  deck: 'Slides',
  image: 'Image',
  video: 'Video',
  hyperframes: 'HyperFrames',
  marketing: 'Marketing',
  audio: 'Audio',
};

const FALLBACK_STUDIO_TEMPLATES: BuildTemplate[] = [
  {
    id: 'sales-command-live-dashboard',
    title: 'Sales Command Live Dashboard',
    author: '@deep-canvas',
    source: 'Deep Canvas',
    kind: 'live-artifact',
    scene: 'Dashboards',
    description: 'Pipeline health, quota pacing, account risk, forecast views, and manager alerts in a full app shell.',
    prompt: 'Use the Sales Command Live Dashboard template for a sales team with KPI cards, charts, filters, pipeline table, alerts, and drilldowns.',
    tone: 'teal',
    tags: ['dashboard', 'sales', 'live-artifact'],
  },
  {
    id: 'founder-pitch-deck',
    title: 'Founder Pitch Deck',
    author: '@open-design',
    source: 'Open Design',
    kind: 'deck',
    scene: 'Pitch & business',
    description: 'A polished investor narrative with problem, traction, market, product, business model, and ask slides.',
    prompt: 'Use the Founder Pitch Deck template and create a polished investor pitch deck with strong story flow and presentation controls.',
    tone: 'blue',
    tags: ['deck', 'pitch', 'business'],
  },
  {
    id: 'saas-landing-prototype',
    title: 'Premium SaaS Landing Page',
    author: '@deep-canvas',
    source: 'Deep Canvas',
    kind: 'prototype',
    scene: 'Landing & marketing',
    description: 'Conversion-focused landing page with hero, product visual, social proof, pricing, FAQ, and polished interactions.',
    prompt: 'Use the Premium SaaS Landing Page template and build a high-converting SaaS landing page with a complete visual system.',
    tone: 'violet',
    tags: ['prototype', 'landing', 'marketing'],
  },
  {
    id: 'analytics-board',
    title: 'Executive Analytics Board',
    author: '@open-design',
    source: 'Open Design',
    kind: 'live-artifact',
    scene: 'Dashboards',
    description: 'Board-ready operating dashboard with KPI rollups, variance notes, segmented charts, and forecast panels.',
    prompt: 'Use the Executive Analytics Board template for a live business dashboard with board-level KPIs, charts, filters, and notes.',
    tone: 'amber',
    tags: ['dashboard', 'analytics', 'live-artifact'],
  },
  {
    id: 'mobile-onboarding',
    title: 'Mobile App Onboarding',
    author: '@deep-canvas',
    source: 'Deep Canvas',
    kind: 'prototype',
    scene: 'Apps',
    description: 'High-fidelity mobile onboarding flow with welcome, personalization, permissions, progress, and final activation.',
    prompt: 'Use the Mobile App Onboarding template and create a polished mobile onboarding prototype with multiple screens and interactions.',
    tone: 'rose',
    tags: ['prototype', 'mobile', 'app'],
  },
  {
    id: 'image-poster-system',
    title: 'Campaign Poster System',
    author: '@open-design',
    source: 'Open Design',
    kind: 'image',
    scene: 'Marketing images',
    description: 'Image-led campaign concept with art direction, poster variants, headline lockups, and export-ready compositions.',
    prompt: 'Use the Campaign Poster System template and create image-led campaign poster concepts with strong art direction.',
    tone: 'lime',
    tags: ['image', 'campaign', 'poster'],
  },
  {
    id: 'hyperframes-launch-motion',
    title: 'Launch Motion Frames',
    author: '@deep-canvas',
    source: 'Deep Canvas',
    kind: 'hyperframes',
    scene: 'Product promos',
    description: 'Agent-native motion frames for product launches, with beat structure, frame captions, and visual transitions.',
    prompt: 'Use the Launch Motion Frames template and build HyperFrames-style motion graphics for a product launch.',
    tone: 'blue',
    tags: ['hyperframes', 'motion', 'launch'],
  },
  {
    id: 'shortform-video-storyboard',
    title: 'Shortform Video Storyboard',
    author: '@open-design',
    source: 'Open Design',
    kind: 'video',
    scene: 'Product promos',
    description: 'A structured shortform video concept with scenes, captions, pacing, hooks, and visual treatment.',
    prompt: 'Use the Shortform Video Storyboard template and create a video artifact with scenes, captions, pacing, and frame direction.',
    tone: 'teal',
    tags: ['video', 'storyboard', 'shortform'],
  },
  {
    id: 'weekly-update-deck',
    title: 'Weekly Update Deck',
    author: '@deep-canvas',
    source: 'Deep Canvas',
    kind: 'deck',
    scene: 'Product & sales',
    description: 'A crisp operating update deck with wins, misses, metrics, blockers, decisions, and next-week priorities.',
    prompt: 'Use the Weekly Update Deck template and create a concise operating update deck with metrics and decision slides.',
    tone: 'amber',
    tags: ['deck', 'weekly update', 'sales'],
  },
  {
    id: 'growth-campaign-system',
    title: 'Growth Campaign System',
    author: '@deep-canvas',
    source: 'Marketing Skills',
    kind: 'marketing',
    scene: 'Campaigns',
    description: 'Positioning, hooks, landing page angle, ad creative, email/social rollout, and conversion plan in one campaign workspace.',
    prompt: 'Use the Growth Campaign System template and build a complete marketing campaign with positioning, CRO-focused landing direction, ad creative, email/social assets, and launch plan.',
    tone: 'rose',
    tags: ['marketing', 'campaign', 'cro'],
  },
];

/**
 * AppBuilderWorkspace - AI-powered landing-page / website / app builder.
 * Layout: left = Code / Preview / Projects tabs. Right = builder chat.
 */
export function AppBuilderWorkspace(_props: { onExit: () => void }) {
  const s = useAppBuilderStore();
  const {
    files, activeFile, previewMode, chat, busy, llmReady,
    currentProjectId, projectName, projects, lastError,
    isLoaded, isLoading, sending, error, backgroundNotice, creatingArtifact,
    openDesign, loadingOpenDesign,
    loadState, clearError,
    loadOpenDesignCatalog,
    setActiveFile, setPreviewMode,
    createFile, updateFile, deleteFile, renameFile,
    resetProject, sendChat, clearChat,
    downloadZip,
    saveProject, loadProject, deleteProject, renameProject, duplicateProject, newProject,
  } = s;

  useEffect(() => {
    if (!isLoaded && !isLoading) void loadState();
  }, [isLoaded, isLoading, loadState]);

  const [chatInput, setChatInput] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [studioMode, setStudioMode] = useState<StudioModeId>('prototype');
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [templateKind, setTemplateKind] = useState<TemplateKind | 'all'>('all');
  const [templateScene, setTemplateScene] = useState('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const didForceEditorDefaultRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || didForceEditorDefaultRef.current) return;
    didForceEditorDefaultRef.current = true;
    if (previewMode !== 'code') void setPreviewMode('code');
  }, [isLoaded, previewMode, setPreviewMode]);

  useEffect(() => {
    if (previewMode === 'templates' && !openDesign?.catalog?.plugins?.length && !loadingOpenDesign) {
      void loadOpenDesignCatalog();
    }
  }, [loadOpenDesignCatalog, loadingOpenDesign, openDesign?.catalog?.plugins?.length, previewMode]);

  // Sync draft content when active file changes and we're not mid-edit.
  useEffect(() => {
    if (!activeFile) {
      setDraftContent('');
      setIsEditingFile(false);
      return;
    }
    if (!isEditingFile) {
      setDraftContent(files[activeFile] ?? '');
    }
  }, [activeFile, files, isEditingFile]);

  const sortedPaths = useMemo(() => Object.keys(files).sort(), [files]);
  const fileTree = useMemo(() => buildFileTree(sortedPaths), [sortedPaths]);
  const previewSrc = useMemo(() => buildPreviewSrcDoc(files), [files]);
  const fileCount = sortedPaths.length;
  const studioTemplates = useMemo(
    () => buildTemplateCatalog(openDesign?.catalog?.plugins ?? [], openDesign?.baseUrl),
    [openDesign?.baseUrl, openDesign?.catalog?.plugins],
  );
  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    return studioTemplates.filter((template) => {
      const matchesKind = templateKind === 'all' || template.kind === templateKind;
      if (!matchesKind) return false;
      const matchesScene = templateScene === 'all' || template.scene === templateScene;
      if (!matchesScene) return false;
      if (!query) return true;
      return [
        template.title,
        template.author,
        template.source,
        template.scene,
        template.description,
        ...template.tags,
        TEMPLATE_KIND_LABELS[template.kind],
      ].join(' ').toLowerCase().includes(query);
    });
  }, [studioTemplates, templateKind, templateScene, templateSearch]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, busy]);

  const [progressElapsedMs, setProgressElapsedMs] = useState(0);
  const progressActive = sending || busy || Boolean(backgroundNotice);

  useEffect(() => {
    if (!progressActive) {
      setProgressElapsedMs(0);
      return undefined;
    }
    const startedAt = Date.now();
    setProgressElapsedMs(0);
    const timer = window.setInterval(() => {
      setProgressElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [progressActive, chat.length]);

  const progressSteps = useMemo(() => {
    const seconds = Math.floor(progressElapsedMs / 1000);
    const requestedEdit = fileCount > 0;
    const labels = requestedEdit
      ? ['Reviewing files', 'Planning edits', 'Updating project', 'Applying changes']
      : ['Reading brief', 'Planning layout', 'Writing files', 'Applying changes'];

    const activeIndex = backgroundNotice
      ? 3
      : seconds < 6
        ? 0
        : seconds < 16
          ? 1
          : seconds < 36
            ? 2
            : 3;

    return labels.map((label, index) => ({
      label,
      status: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
    }));
  }, [backgroundNotice, fileCount, progressElapsedMs]);

  const progressHeadline = useMemo(() => {
    const activeStep = progressSteps.find((step) => step.status === 'active')?.label ?? progressSteps[progressSteps.length - 1]?.label ?? 'Working';
    if (backgroundNotice) return 'Still finishing in background';
    if (busy || sending) return activeStep;
    return '';
  }, [backgroundNotice, busy, progressSteps, sending]);

  const handleSend = async () => {
    const msg = chatInput.trim();
    if (!msg || sending || !llmReady) return;
    setChatInput('');
    if (isEditingFile && activeFile) {
      await updateFile(activeFile, draftContent);
      setIsEditingFile(false);
    }
    const effectiveMode = inferStudioModeFromMessage(msg, studioMode);
    if (effectiveMode !== studioMode) {
      setStudioMode(effectiveMode);
    }
    if (previewMode !== 'preview') {
      await setPreviewMode('preview');
    }
    await sendChat(withBuildStudioAutoContext(msg, effectiveMode));
  };

  const handleModeChange = async (mode: 'code' | 'preview' | 'projects' | 'templates') => {
    if (isEditingFile && activeFile) {
      await updateFile(activeFile, draftContent);
      setIsEditingFile(false);
    }
    if (mode !== 'preview') {
      setIsPreviewExpanded(false);
    }
    await setPreviewMode(mode);
  };

  const handleSelectFile = async (path: string) => {
    if (path === activeFile) return;
    if (isEditingFile && activeFile) {
      await updateFile(activeFile, draftContent);
      setIsEditingFile(false);
    }
    await setActiveFile(path);
  };

  const handleAddFile = async () => {
    const name = window.prompt('New file path (e.g. "about.html" or "src/hero.js")');
    if (!name) return;
    await createFile(name.trim(), '');
  };

  const handleRename = async (path: string) => {
    const to = window.prompt('Rename to:', path);
    if (!to || to === path) return;
    await renameFile(path, to.trim());
  };

  const handleDelete = async (path: string) => {
    if (!window.confirm(`Delete ${path}?`)) return;
    await deleteFile(path);
  };

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleReset = async () => {
    if (!window.confirm('Clear this workspace and remove all current files/folders? Saved projects will not be deleted.')) return;
    setCollapsedFolders({});
    await resetProject();
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    await updateFile(activeFile, draftContent);
    setIsEditingFile(false);
  };

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${draftContent.slice(0, start)}  ${draftContent.slice(end)}`;
      setDraftContent(next);
      setIsEditingFile(true);
      requestAnimationFrame(() => {
        editorRef.current?.setSelectionRange(start + 2, start + 2);
      });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSaveFile();
    }
  };

  const handleRevertFile = () => {
    setDraftContent(files[activeFile] ?? '');
    setIsEditingFile(false);
  };

  const handleUseTemplate = (template: BuildTemplate) => {
    setStudioMode(template.kind === 'audio' ? 'video' : template.kind);
    setChatInput(template.prompt);
  };

  const handleSaveProject = async () => {
    if (currentProjectId) {
      // Overwrite current saved project silently
      await saveProject({ id: currentProjectId, name: projectName });
      return;
    }
    const name = window.prompt('Name this project:', projectName || 'Untitled project');
    if (!name || !name.trim()) return;
    await saveProject({ name: name.trim() });
  };

  const handleSaveAs = async () => {
    const name = window.prompt('Save as new project. Name:', `${projectName || 'Untitled project'} (copy)`);
    if (!name || !name.trim()) return;
    await saveProject({ name: name.trim() });
  };

  const handleDownloadProject = async () => {
    if (sortedPaths.length === 0) return;
    if (isEditingFile && activeFile) {
      await updateFile(activeFile, draftContent);
      setIsEditingFile(false);
    }
    await downloadZip();
  };

  const handleNewProject = async () => {
    if (!window.confirm('Start a new blank project? Unsaved changes will be lost.')) return;
    await newProject();
  };

  const handleRenameProjectInline = async () => {
    if (!currentProjectId) return;
    const name = window.prompt('Rename project:', projectName);
    if (!name || !name.trim() || name.trim() === projectName) return;
    await renameProject(currentProjectId, name.trim());
  };

  return (
    <div className={`ab animate-rise ${isPreviewExpanded ? 'is-preview-expanded' : ''}`}>
      {error ? (
        <div className="ab__banner ab__banner--error">
          <span>{error}</span>
          <button type="button" className="ab__btn ab__btn--mini" onClick={clearError}>dismiss</button>
        </div>
      ) : null}

      {backgroundNotice ? (
        <div className="ab__banner ab__banner--warn">
          <span>{backgroundNotice}</span>
          <button type="button" className="ab__btn ab__btn--mini" onClick={clearError}>dismiss</button>
        </div>
      ) : null}

      {lastError ? (
        <div className="ab__banner ab__banner--error">
          <span>{lastError}</span>
        </div>
      ) : null}

      <div className="ab__layout">
        {/* LEFT: code / preview / projects */}
        <section className="ab__main">
          <nav className="ab__mode-tabs" aria-label="View mode">
            <button
              type="button"
              className={`ab__mode-tab ${previewMode === 'code' ? 'is-active' : ''}`}
              onClick={() => void handleModeChange('code')}
            >
              Code
            </button>
            <button
              type="button"
              className={`ab__mode-tab ${previewMode === 'preview' ? 'is-active' : ''}`}
              onClick={() => void handleModeChange('preview')}
            >
              Preview
            </button>
            <button
              type="button"
              className={`ab__mode-tab ${previewMode === 'projects' ? 'is-active' : ''}`}
              onClick={() => void handleModeChange('projects')}
            >
              Projects
              {projects.length > 0 ? (
                <span className="ab__mode-tab-count">{projects.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={`ab__mode-tab ${previewMode === 'templates' ? 'is-active' : ''}`}
              onClick={() => void handleModeChange('templates')}
            >
              Templates
            </button>
            <button
              type="button"
              className="ab__mode-action"
              onClick={() => void handleDownloadProject()}
              disabled={creatingArtifact || sortedPaths.length === 0}
              title={sortedPaths.length === 0 ? 'Build something before downloading code' : 'Download project code as a zip'}
            >
              <Download size={14} aria-hidden="true" />
              <span>{creatingArtifact ? 'Packaging...' : 'Download'}</span>
            </button>
            <button
              type="button"
              className="ab__btn ab__btn--ghost ab__btn--mini ab__mode-clear"
              onClick={handleReset}
              title="Clear workspace files and folders"
            >
              Clear
            </button>
            <div className="ab__mode-spacer" />
            <div className={`ab__progress ${progressActive ? 'is-active' : ''}`} aria-live="polite">
              {progressActive ? (
                <>
                  <div className="ab__progress-headline">{progressHeadline}</div>
                  <div className="ab__progress-track">
                    {progressSteps.map((step) => (
                      <span key={step.label} className={`ab__progress-step is-${step.status}`}>
                        {step.label}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            {previewMode === 'preview' ? (
              <button
                type="button"
                className="ab__expand-btn"
                onClick={() => setIsPreviewExpanded((value) => !value)}
                title={isPreviewExpanded ? 'Exit fullscreen preview' : 'Expand preview'}
                aria-label={isPreviewExpanded ? 'Exit fullscreen preview' : 'Expand preview'}
              >
                {isPreviewExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            ) : null}
            <button
              type="button"
              className="ab__project-chip"
              onClick={handleRenameProjectInline}
              title={currentProjectId ? 'Rename this saved project' : 'Unsaved - click Save to store it'}
            >
              <span className={`ab__project-dot ${currentProjectId ? 'is-saved' : 'is-unsaved'}`} />
              <span className="ab__project-name">{projectName || 'Untitled project'}</span>
              {!currentProjectId ? <span className="ab__project-tag">unsaved</span> : null}
            </button>
            <button type="button" className="ab__btn ab__btn--mini" onClick={handleNewProject} title="Start a fresh blank project">
              New
            </button>
            <button type="button" className="ab__btn ab__btn--mini" onClick={handleSaveAs} title="Save as a new project">
              Save as
            </button>
            <button type="button" className="ab__btn ab__btn--primary ab__btn--mini" onClick={handleSaveProject}>
              {currentProjectId ? 'Save' : 'Save project'}
            </button>
            <button type="button" className="ab__btn ab__btn--ghost ab__btn--mini" onClick={handleReset} title="Reset to blank project">
              Reset
            </button>
          </nav>

          {previewMode === 'preview' ? (
            <iframe
              className="ab__preview-frame"
              title="Live preview"
              srcDoc={previewSrc}
              sandbox="allow-scripts allow-forms allow-same-origin"
            />
          ) : previewMode === 'templates' ? (
            <TemplatesGallery
              templates={filteredTemplates}
              allTemplates={studioTemplates}
              activeKind={templateKind}
              activeScene={templateScene}
              search={templateSearch}
              onKindChange={(kind) => {
                setTemplateKind(kind);
                setTemplateScene('all');
              }}
              onSceneChange={setTemplateScene}
              onSearchChange={setTemplateSearch}
              onUseTemplate={handleUseTemplate}
            />
          ) : previewMode === 'projects' ? (
            <ProjectsGallery
              projects={projects}
              currentId={currentProjectId}
              onOpen={(id) => void loadProject(id)}
              onDelete={async (id, name) => {
                if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
                await deleteProject(id);
              }}
              onRename={async (id, current) => {
                const name = window.prompt('Rename project:', current);
                if (!name || !name.trim() || name.trim() === current) return;
                await renameProject(id, name.trim());
              }}
              onDuplicate={(id) => void duplicateProject(id)}
              onNew={handleNewProject}
            />
          ) : (
            <div className="ab__code">
              <aside className="ab__tree">
                <div className="ab__tree-head">
                  <span className="ab__lbl">Files</span>
                  <button type="button" className="ab__btn ab__btn--mini" onClick={handleAddFile} title="New file">+ New</button>
                </div>
                <ul className="ab__tree-list" aria-label="Project files">
                  {sortedPaths.length === 0 ? (
                    <li className="ab__tree-empty">No files</li>
                  ) : null}
                  <FileTree
                    nodes={fileTree}
                    activeFile={activeFile}
                    collapsedFolders={collapsedFolders}
                    onToggleFolder={toggleFolder}
                    onSelectFile={(path) => void handleSelectFile(path)}
                    onRenameFile={(path) => void handleRename(path)}
                    onDeleteFile={(path) => void handleDelete(path)}
                  />
                </ul>
              </aside>
              <div className="ab__editor-pane">
                <div className="ab__file-tabs" aria-label="Open project files">
                  {sortedPaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      className={`ab__file-tab ${path === activeFile ? 'is-active' : ''}`}
                      onClick={() => void handleSelectFile(path)}
                      title={path}
                    >
                      <FileGlyph path={path} />
                      <span>{path}</span>
                    </button>
                  ))}
                </div>
                <div className="ab__editor-head">
                  <div className="ab__editor-title">
                    <span className="ab__editor-path">{activeFile || '(no file)'}</span>
                    <span className={`ab__editor-state ${isEditingFile ? 'is-dirty' : 'is-saved'}`}>
                      {isEditingFile ? 'unsaved edits' : 'saved'}
                    </span>
                  </div>
                  <div className="ab__editor-actions">
                    <button type="button" className="ab__btn ab__btn--mini" onClick={handleAddFile}>New file</button>
                    {isEditingFile ? (
                      <>
                        <button type="button" className="ab__btn ab__btn--mini" onClick={handleRevertFile}>Revert</button>
                        <button type="button" className="ab__btn ab__btn--primary ab__btn--mini" onClick={() => void handleSaveFile()}>Save</button>
                      </>
                    ) : null}
                  </div>
                </div>
                <textarea
                  ref={editorRef}
                  className="ab__editor"
                  value={draftContent}
                  placeholder={activeFile ? '' : 'Select a file on the left to view its contents.'}
                  spellCheck={false}
                  disabled={!activeFile}
                  onKeyDown={handleEditorKeyDown}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    setIsEditingFile(true);
                  }}
                  aria-label="File contents"
                />
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: builder chat */}
        <aside className="ab__chat">
          <header className="ab__chat-head">
            <div className="ab__chat-project-actions">
              <button
                type="button"
                className="ab__project-chip"
                onClick={handleRenameProjectInline}
                title={currentProjectId ? 'Rename this saved project' : 'Unsaved - click Save to store it'}
              >
                <span className={`ab__project-dot ${currentProjectId ? 'is-saved' : 'is-unsaved'}`} />
                <span className="ab__project-name">{projectName || 'Untitled project'}</span>
                {!currentProjectId ? <span className="ab__project-tag">unsaved</span> : null}
              </button>
              <button type="button" className="ab__btn ab__btn--mini" onClick={handleNewProject} title="Start a fresh blank project">
                New
              </button>
              <button type="button" className="ab__btn ab__btn--primary ab__btn--mini" onClick={handleSaveProject}>
                {currentProjectId ? 'Save' : 'Save project'}
              </button>
              <button
                type="button"
                className="ab__btn ab__btn--mini"
                onClick={() => void handleDownloadProject()}
                disabled={creatingArtifact || sortedPaths.length === 0}
                title={sortedPaths.length === 0 ? 'Build something before downloading code' : 'Download project code as a zip'}
              >
                {creatingArtifact ? 'Packaging...' : 'Download'}
              </button>
              <button type="button" className="ab__btn ab__btn--ghost ab__btn--mini" onClick={() => void clearChat()} title="Clear conversation">
                Clear
              </button>
            </div>
          </header>

          <div className="ab__chat-scroll">
            <div className="ab__studio-modes" aria-label="Build type">
              {STUDIO_MODES.map(({ id, label, context, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`ab__studio-mode ${studioMode === id ? 'is-active' : ''}`}
                  onClick={() => setStudioMode(id)}
                  title={context}
                  aria-pressed={studioMode === id}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {chat.length === 0 ? (
              <div className="ab__chat-empty">
                <strong>Describe what you want built.</strong>
                <span>Landing pages, polished websites, dashboards, and small apps should come out clean, structured, and production-ready.</span>
              </div>
            ) : null}
            {chat.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            <div ref={chatEndRef} />
          </div>

          <form
            className="ab__chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            {!llmReady ? <div className="ab__chat-note">Builder LLM needs to be configured in Settings before it can generate.</div> : null}
            <textarea
              className="ab__chat-input"
              placeholder="Describe the page or app you want to build..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={4}
              aria-label="Chat message"
            />
            <div className="ab__chat-actions">
              <button
                type="submit"
                className="ab__btn ab__btn--primary"
                disabled={sending || !chatInput.trim() || !llmReady}
              >
                {sending || busy ? 'Thinking...' : llmReady ? 'Send' : 'Configure LLM'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function withBuildStudioAutoContext(message: string, modeId: StudioModeId): string {
  const mode = STUDIO_MODES.find((item) => item.id === modeId) ?? STUDIO_MODES[0];
  return `Build Studio auto mode:
- Infer the artifact from the user's plain-language request.
- Effective mode id: ${mode.id}.
- Effective build type: ${mode.label}.
- Effective type guidance: ${mode.context}
- Open Design scenario route:
  - Prototype: use the default Open Design generation/router path ('od-default' when free-form, 'od-new-generation' for direct prototype generation).
  - Live artifact: use dashboard/live-artifact templates and data-artifact skills; build an actual app/dashboard surface.
  - Slide deck: use deck templates and presentation skills; use 'example-pptx-html-fidelity-audit' only when auditing or exporting PPTX quality.
  - Image: use 'od-media-generation' and the configured image provider from Configuration; render the actual image in Preview.
  - Video: use 'od-media-generation' with configured video providers; render playable output in Preview.
  - HyperFrames: use the local HTML-video/HyperFrames workflow and templates; render the motion/composition surface in Preview.
  - Marketing: use the marketing skill family first: product-marketing, copywriting, CRO, ad-creative, ads, SEO/content, analytics, pricing, launch, email, social, sales-enablement, screenshots-marketing, and marketing-psychology. Build previewable campaign assets, pages, decks, emails, social cards, or plans.
  - Export requests: use 'od-react-export' or 'od-nextjs-export' only when the user asks to hand off/export.
  - Figma/code migration: use 'od-figma-migration' or 'od-code-migration' only when the user gives a Figma source, URL, repo, or existing codebase migration request.
- If the user's request explicitly asks for a different artifact type, honor the user's words over the selected type.
- Dashboard, analytics, KPI, admin, reporting, CRM, pipeline, or command-center requests must be treated as Live artifact dashboards, not landing pages or marketing prototypes.
- Default to high-fidelity prototypes for web, desktop, and mobile when the request is ambiguous.
- Also support live artifacts and dashboards; decks including magazine decks, weekly updates, and pitches; images; video; and HyperFrames motion graphics.
- Keep the user experience chat-first. Do not ask the user to pick plugins, skills, design systems, models, or output modes unless absolutely necessary.
- Emit every result as previewable project files so the Preview tab renders the output immediately, then continue collaborating through chat for edits and additions.
- Never hand off image, video, or HyperFrames output as only a link. The output must be a file in the project and/or an index.html wrapper that renders the actual media in Preview.
- For Image mode, the Preview must show the image itself. For Video mode, the Preview must show a playable video or motion preview. For HyperFrames, the Preview must show the motion/composition surface.

User request:
${message}`;
}

function inferStudioModeFromMessage(message: string, fallback: StudioModeId): StudioModeId {
  const text = message.toLowerCase();
  if (/\b(dashboard|analytics|kpi|metric|admin|reporting|crm|pipeline|command center|ops center|live artifact|data console)\b/.test(text)) {
    return 'live-artifact';
  }
  if (/\b(slide deck|deck|presentation|pitch|weekly update|magazine deck|ppt)\b/.test(text)) {
    return 'deck';
  }
  if (/\b(hyperframes?|motion graphics?|storyboard|animation|video)\b/.test(text)) {
    return text.includes('hyperframe') ? 'hyperframes' : 'video';
  }
  if (/\b(image|photo|picture|mockup|visual asset|edit this image)\b/.test(text)) {
    return 'image';
  }
  if (/\b(marketing|campaign|cro|copywriting|copy|seo|ads?|ad creative|funnel|launch|email sequence|social content|pricing|positioning|sales enablement|lead magnet|landing angle)\b/.test(text)) {
    return 'marketing';
  }
  if (/\b(landing page|website|homepage|prototype|mobile app|desktop app|web app)\b/.test(text)) {
    return 'prototype';
  }
  return fallback;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: FileTreeNode[];
}

function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', type: 'folder', children: [] };
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const nodePath = parts.slice(0, index + 1).join('/');
      let next = current.children.find((child) => child.name === part && child.type === (isFile ? 'file' : 'folder'));
      if (!next) {
        next = { name: part, path: nodePath, type: isFile ? 'file' : 'folder', children: [] };
        current.children.push(next);
        current.children.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }
      current = next;
    });
  }
  return root.children;
}

function FileTree({
  nodes,
  activeFile,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  onRenameFile,
  onDeleteFile,
  depth = 0,
}: {
  nodes: FileTreeNode[];
  activeFile: string;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRenameFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'folder') {
          const collapsed = Boolean(collapsedFolders[node.path]);
          return (
            <li key={`folder:${node.path}`} className="ab__tree-group">
              <button
                type="button"
                className={`ab__tree-folder ab__tree-depth-${Math.min(depth, 8)}`}
                onClick={() => onToggleFolder(node.path)}
                title={node.path}
              >
                <span className={`ab__tree-chevron ${collapsed ? '' : 'is-open'}`} aria-hidden="true">&gt;</span>
                <span className="ab__tree-folder-icon" aria-hidden="true">dir</span>
                <span>{node.name}</span>
              </button>
              {!collapsed ? (
                <ul className="ab__tree-branch">
                  <FileTree
                    nodes={node.children}
                    activeFile={activeFile}
                    collapsedFolders={collapsedFolders}
                    onToggleFolder={onToggleFolder}
                    onSelectFile={onSelectFile}
                    onRenameFile={onRenameFile}
                    onDeleteFile={onDeleteFile}
                    depth={depth + 1}
                  />
                </ul>
              ) : null}
            </li>
          );
        }
        return (
          <li
            key={`file:${node.path}`}
            className={`ab__tree-item ${node.path === activeFile ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className={`ab__tree-name ab__tree-depth-${Math.min(depth, 8)}`}
              onClick={() => onSelectFile(node.path)}
              title={node.path}
            >
              <FileGlyph path={node.path} />
              <span>{node.name}</span>
            </button>
            <div className="ab__tree-actions">
              <button
                type="button"
                className="ab__btn ab__btn--icon"
                title="Rename"
                onClick={() => onRenameFile(node.path)}
              >✎</button>
              <button
                type="button"
                className="ab__btn ab__btn--icon ab__btn--danger"
                title="Delete"
                onClick={() => onDeleteFile(node.path)}
              >×</button>
            </div>
          </li>
        );
      })}
    </>
  );
}

function FileGlyph({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'H',
    css: 'C',
    js: 'JS',
    mjs: 'JS',
    ts: 'TS',
    tsx: 'TS',
    jsx: 'JS',
    json: '{}',
    md: 'M',
    svg: 'SV',
    png: 'IM',
    jpg: 'IM',
    jpeg: 'IM',
    webp: 'IM',
    gif: 'IM',
  };
  return <span className="ab__file-glyph" aria-hidden="true">{map[ext] || '·'}</span>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const body = normalizeChatBody(isUser ? stripBuildStudioAutoContext(message.content) : stripOpsPayload(message.content));
  return (
    <div className={`ab__msg ${isUser ? 'ab__msg--user' : 'ab__msg--assistant'}`}>
      <div className="ab__msg-role">{isUser ? 'You' : 'Builder'}</div>
      {body ? (
        <div className={`ab__msg-body ${isUser ? '' : 'ab__msg-body--markdown'}`}>
          {isUser ? body : <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>}
        </div>
      ) : null}
    </div>
  );
}

function stripBuildStudioAutoContext(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (!trimmed.toLowerCase().startsWith('build studio auto mode:')) {
    return trimmed;
  }
  const parts = trimmed.split(/\nUser request:\s*/i);
  if (parts.length > 1) {
    return parts.slice(1).join('\nUser request:\n').trim();
  }
  return trimmed;
}

function stripOpsPayload(content: string): string {
  if (!content) return '';
  return content
    .replace(/```\s*json-ops[\s\S]*?```/gi, '')
    .replace(/```\s*json-ops[\s\S]*$/gi, '')
    .trim();
}

function normalizeChatBody(content: string): string {
  return (content || '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build a self-contained HTML doc for the preview iframe. If an `index.html`
 * exists, it's used as the base and `<link rel="stylesheet" href="x.css">` /
 * `<script src="x.js">` references are inlined from the virtual file map.
 * If no index.html, show a friendly placeholder.
 */
function buildPreviewSrcDoc(files: Record<string, string>): string {
  const indexHtml = files['index.html'];
  if (!indexHtml) {
    const mediaPath = pickPrimaryMediaFile(files);
    if (mediaPath) {
      return buildMediaPreviewDoc(mediaPath, files);
    }
    return `<!doctype html><html><body style="font-family:system-ui;padding:24px;background:#0b0d10;color:#9aa3ad"><h2 style="color:#f5f5f7">No index.html</h2><p>Ask the builder to create an <code>index.html</code> to see a preview.</p></body></html>`;
  }
  let out = indexHtml;

  // Inline CSS: <link href="x.css" rel="stylesheet"> or rel-first variants -> <style>...</style>
  out = out.replace(
    /<link\b[^>]*>/gi,
    (match: string) => {
      if (!/\brel=["'][^"']*\bstylesheet\b[^"']*["']/i.test(match)) return match;
      const href = match.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href) return match;
      const key = resolveAsset(href, files);
      if (key && files[key] !== undefined) {
        return `<style>\n${files[key]}\n</style>`;
      }
      return match;
    },
  );

  // Inline JS: <script src="x.js"></script> -> <script>...</script>
  out = out.replace(
    /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src: string) => {
      const key = resolveAsset(src, files);
      if (key && files[key] !== undefined) {
        return `<script>\n${files[key]}\n</script>`;
      }
      return match;
    },
  );

  // Inline local images so generated project assets render inside srcDoc previews.
  out = out.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const asset = inlinePreviewAsset(src, files);
      return asset ? `${prefix}${asset}${suffix}` : match;
    },
  );

  // Inline local media so generated videos/audio render in the preview iframe.
  out = out.replace(
    /(<(?:video|audio)\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const asset = inlinePreviewAsset(src, files);
      return asset ? `${prefix}${asset}${suffix}` : match;
    },
  );
  out = out.replace(
    /(<source\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const asset = inlinePreviewAsset(src, files);
      return asset ? `${prefix}${asset}${suffix}` : match;
    },
  );

  // Inline local CSS url(...) asset references after stylesheets are embedded.
  out = out.replace(
    /url\((['"]?)([^'")]+)\1\)/gi,
    (match, _quote: string, src: string) => {
      const asset = inlinePreviewAsset(src, files);
      return asset ? `url("${asset}")` : match;
    },
  );

  return out;
}

const IMAGE_EXTENSIONS = new Set(['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a']);

function pickPrimaryMediaFile(files: Record<string, string>): string | null {
  const paths = Object.keys(files).sort();
  const preferred = paths.filter((path) => /(^|\/)(result|output|preview|generated|image|video|hyperframes|motion|poster|hero)\./i.test(path));
  const candidates = [...preferred, ...paths];
  for (const path of candidates) {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
      return path;
    }
  }
  return null;
}

function buildMediaPreviewDoc(path: string, files: Record<string, string>): string {
  const src = inlinePreviewAsset(path, files);
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const safeName = escapeHtml(path);
  let body = `<div class="empty">The media output could not be rendered.</div>`;
  if (src && IMAGE_EXTENSIONS.has(ext)) {
    body = `<img class="media image" src="${src}" alt="${safeName}" />`;
  } else if (src && VIDEO_EXTENSIONS.has(ext)) {
    body = `<video class="media video" src="${src}" controls playsinline autoplay muted loop></video>`;
  } else if (src && AUDIO_EXTENSIONS.has(ext)) {
    body = `<audio class="audio" src="${src}" controls></audio>`;
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #05070a; color: #e8eef2; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
      .shell { width: min(100%, 1440px); min-height: calc(100vh - 48px); display: grid; grid-template-rows: auto 1fr; gap: 16px; }
      .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: #9aa7ad; font-size: 13px; letter-spacing: 0; }
      .name { color: #eef7f8; font-weight: 700; overflow-wrap: anywhere; }
      .stage { min-height: 0; display: grid; place-items: center; border: 1px solid rgba(32, 224, 211, 0.18); background: radial-gradient(circle at 50% 0%, rgba(32, 224, 211, 0.08), transparent 38%), #090d10; overflow: hidden; }
      .media { max-width: 100%; max-height: calc(100vh - 120px); display: block; object-fit: contain; }
      .image { width: auto; height: auto; }
      .video { width: 100%; height: 100%; }
      .audio { width: min(720px, 92vw); }
      .empty { color: #9aa7ad; }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="bar"><span class="name">${safeName}</span><span>Preview</span></div>
      <section class="stage">${body}</section>
    </main>
  </body>
</html>`;
}

function inlinePreviewAsset(ref: string, files: Record<string, string>): string | null {
  const key = resolveAsset(ref, files);
  if (!key) return null;
  const content = files[key];
  if (!content) return null;
  if (/^data:/i.test(content.trim())) return content.trim();

  const ext = key.split('.').pop()?.toLowerCase() || '';
  if (ext === 'svg') {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(content)))}`;
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') {
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.trim())) {
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mime};base64,${content.trim()}`;
    }
  }
  if (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'm4v') {
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.trim())) {
      const mime = ext === 'mov' || ext === 'm4v' ? 'mp4' : ext;
      return `data:video/${mime};base64,${content.trim()}`;
    }
  }
  if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || ext === 'm4a') {
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.trim())) {
      const mime = ext === 'm4a' ? 'mp4' : ext;
      return `data:audio/${mime};base64,${content.trim()}`;
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveAsset(ref: string, files: Record<string, string>): string | null {
  if (!ref) return null;
  if (/^(https?:|data:|\/\/)/i.test(ref)) return null;
  const cleaned = ref
    .split('#', 1)[0]
    .split('?', 1)[0]
    .replace(/^\.\//, '')
    .replace(/^\//, '');
  if (files[cleaned] !== undefined) return cleaned;
  const withoutDist = cleaned.replace(/^dist\//, '').replace(/^public\//, '');
  if (files[withoutDist] !== undefined) return withoutDist;
  return null;
}

// --------------------------------------------------------------------------
// Templates gallery
// --------------------------------------------------------------------------

const TEMPLATE_PAGE_COPY: Record<TemplateKind | 'all', string> = {
  all: 'Open Design starting points for prototypes, dashboards, decks, images, video, HyperFrames, audio, and marketing artifacts.',
  prototype: 'Interactive product mockups: dashboards, apps, landing pages, internal tools, and stakeholder-ready screens.',
  'live-artifact': 'Live artifacts and dashboards with real data surfaces, filters, charts, reports, and operational views.',
  deck: 'Polished slide decks from a narrative brief: pitch decks, course modules, weekly reports, and product launches.',
  image: 'Image-led artifacts: posters, social cards, infographics, campaign visuals, and product mockups.',
  video: 'Video templates for product promos, explainers, cinematic sequences, and shortform storyboards.',
  hyperframes: 'Agent-native HTML video and motion graphics: frame systems, timelines, promos, and MP4-ready compositions.',
  audio: 'Audio artifacts for jingles, voiceover beds, sonic identity, and campaign sound.',
  marketing: 'Growth and marketing systems: positioning, ads, CRO, email, social, launch, pricing, SEO, and sales enablement.',
};

const TEMPLATE_TONES: TemplateTone[] = ['teal', 'blue', 'lime', 'amber', 'violet', 'rose'];

function buildTemplateCatalog(items: OpenDesignCatalogItem[], openDesignBaseUrl?: string | null): BuildTemplate[] {
  const baseUrl = normalizeOpenDesignBaseUrl(openDesignBaseUrl);
  const fromOpenDesign = items
    .map((item, index) => catalogItemToTemplate(item, index, baseUrl))
    .filter((template): template is BuildTemplate => Boolean(template));
  if (fromOpenDesign.length === 0) {
    return FALLBACK_STUDIO_TEMPLATES;
  }
  const merged = [...fromOpenDesign, ...FALLBACK_STUDIO_TEMPLATES];
  const seen = new Set<string>();
  return merged.filter((template) => {
    const key = template.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function catalogItemToTemplate(item: OpenDesignCatalogItem, index: number, openDesignBaseUrl: string): BuildTemplate | null {
  const tags = (item.tags ?? []).map((tag) => String(tag).toLowerCase());
  const id = String(item.id || item.name || '').trim();
  if (!id) return null;
  const title = prettifyTemplateTitle(item.title || item.name || id);
  const description = (item.description || '').trim();
  const haystack = `${id} ${title} ${description} ${tags.join(' ')} ${item.mode ?? ''} ${item.scenario ?? ''}`.toLowerCase();
  const kind = inferTemplateKind(item, haystack, tags);
  if (!kind) return null;
  if (!isTemplateLike(haystack, kind)) return null;
  const scene = inferTemplateScene(kind, haystack, tags);
  const author = item.author ? `@${String(item.author).replace(/^@/, '')}` : inferTemplateAuthor(id, item.sourceKind);
  const source = item.sourceKind === 'bundled' || item.source === 'official' ? 'Open Design' : (item.source || 'Open Design');
  const previewUrls = templatePreviewUrls(item, openDesignBaseUrl);
  return {
    id,
    title,
    author,
    source,
    kind,
    scene,
    description: description || `Open Design ${TEMPLATE_KIND_LABELS[kind].toLowerCase()} template.`,
    prompt: `Use the "${title}" Open Design template. ${description || `Create a polished ${TEMPLATE_KIND_LABELS[kind].toLowerCase()} artifact from my brief.`}`,
    tone: TEMPLATE_TONES[index % TEMPLATE_TONES.length],
    tags,
    previewUrls,
    previewUrl: previewUrls[0],
    previewHtmlSrc: templatePreviewHtmlSrc(item, id, openDesignBaseUrl),
  };
}

function inferTemplateKind(item: OpenDesignCatalogItem, haystack: string, tags: string[]): TemplateKind | null {
  const mode = String(item.mode || '').toLowerCase();
  const previewType = String(item.preview?.type || '').toLowerCase();
  if (mode === 'audio' || previewType === 'audio' || tags.includes('audio')) return 'audio';
  if (haystack.includes('hyperframes') || haystack.includes('html-video')) return 'hyperframes';
  if (mode === 'video' || previewType === 'video' || tags.includes('video') || tags.includes('video-template')) return 'video';
  if (mode === 'image' || previewType === 'image' || tags.includes('image') || tags.includes('image-template')) return 'image';
  if (mode === 'deck' || tags.includes('deck') || haystack.includes('slide deck') || haystack.includes('html-ppt') || haystack.includes('presentation')) return 'deck';
  if (mode === 'live-artifact' || tags.includes('live-artifact') || haystack.includes('live artifact')) return 'live-artifact';
  if (mode === 'prototype' || tags.includes('prototype') || tags.includes('template') || tags.includes('example')) return 'prototype';
  if (haystack.includes('marketing') || haystack.includes('campaign')) return 'marketing';
  return null;
}

function isTemplateLike(haystack: string, kind: TemplateKind): boolean {
  if (kind === 'live-artifact' || kind === 'marketing') return true;
  if (haystack.includes('design-system') || haystack.includes('scenario') && haystack.includes('default')) return false;
  return (
    haystack.includes('template')
    || haystack.includes('example')
    || haystack.includes('deck')
    || haystack.includes('landing')
    || haystack.includes('dashboard')
    || haystack.includes('poster')
    || haystack.includes('card')
    || haystack.includes('report')
    || haystack.includes('email')
    || haystack.includes('video')
  );
}

function inferTemplateScene(kind: TemplateKind, haystack: string, tags: string[]): string {
  if (kind === 'deck') {
    if (haystack.includes('pitch') || haystack.includes('business') || haystack.includes('investor')) return 'Pitch & business';
    if (haystack.includes('course') || haystack.includes('training') || haystack.includes('education')) return 'Course & training';
    if (haystack.includes('product') || haystack.includes('sales') || haystack.includes('weekly') || haystack.includes('launch')) return 'Product & sales';
    if (haystack.includes('engineering') || haystack.includes('technical') || haystack.includes('runbook')) return 'Engineering talks';
    return 'Creative decks';
  }
  if (kind === 'prototype') {
    if (haystack.includes('dashboard') || haystack.includes('admin') || haystack.includes('analytics')) return 'Dashboards';
    if (haystack.includes('app') || haystack.includes('mobile') || haystack.includes('onboarding') || haystack.includes('kanban')) return 'Apps';
    if (haystack.includes('landing') || haystack.includes('marketing') || haystack.includes('email') || haystack.includes('poster')) return 'Landing & marketing';
    if (haystack.includes('developer') || haystack.includes('docs') || haystack.includes('github') || haystack.includes('coding')) return 'Developer tools';
    if (haystack.includes('report') || haystack.includes('invoice') || haystack.includes('meeting') || haystack.includes('runbook')) return 'Docs & reports';
    return 'Brand & design';
  }
  if (kind === 'live-artifact') return haystack.includes('report') ? 'Reports' : 'Dashboards';
  if (kind === 'image') {
    if (haystack.includes('infographic')) return 'Infographics';
    if (haystack.includes('poster') || haystack.includes('marketing')) return 'Marketing images';
    if (haystack.includes('card') || haystack.includes('social')) return 'Social cards';
    return 'Visual assets';
  }
  if (kind === 'video' || kind === 'hyperframes') {
    if (haystack.includes('website') || haystack.includes('product') || haystack.includes('launch') || haystack.includes('promo')) return 'Product promos';
    if (haystack.includes('cinematic')) return 'Cinematic';
    if (haystack.includes('social') || haystack.includes('shortform')) return 'Shortform';
    return kind === 'hyperframes' ? 'Motion frames' : 'Video templates';
  }
  if (kind === 'audio') return haystack.includes('jingle') ? 'Jingles' : 'Audio beds';
  if (tags.includes('marketing')) return 'Campaigns';
  return 'Marketing systems';
}

function normalizeOpenDesignBaseUrl(value?: string | null): string {
  return (value || DEFAULT_OPEN_DESIGN_BASE_URL).replace(/\/+$/, '');
}

function absolutizeOpenDesignUrl(value: string | undefined, openDesignBaseUrl: string): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('/')) return `${openDesignBaseUrl}${raw}`;
  return `${openDesignBaseUrl}/${raw.replace(/^\.?\//, '')}`;
}

function openDesignAssetCacheUrl(url: string, openDesignBaseUrl: string): string | undefined {
  if (!/^https?:\/\//i.test(url)) return undefined;
  return `${openDesignBaseUrl}/api/asset-cache?url=${encodeURIComponent(url)}`;
}

function templatePreviewUrls(item: OpenDesignCatalogItem, openDesignBaseUrl: string): string[] {
  const bakedPoster = item.bakedPreview?.poster;
  const preview = item.preview;
  const rawUrl = bakedPoster || preview?.image || preview?.poster || preview?.gif;
  const absoluteUrl = absolutizeOpenDesignUrl(rawUrl, openDesignBaseUrl);
  if (!absoluteUrl) return [];
  const proxiedUrl = openDesignAssetCacheUrl(absoluteUrl, openDesignBaseUrl);
  return Array.from(new Set([proxiedUrl, absoluteUrl].filter((url): url is string => Boolean(url))));
}

function templatePreviewHtmlSrc(item: OpenDesignCatalogItem, id: string, openDesignBaseUrl: string): string | undefined {
  const previewType = String(item.preview?.type || '').toLowerCase();
  if (previewType === 'html' && item.preview?.entry) {
    return `${openDesignBaseUrl}/api/plugins/${encodeURIComponent(id)}/preview`;
  }
  const example = item.exampleOutputs?.find((entry) => typeof entry?.path === 'string' && entry.path.trim());
  const path = example?.path || '';
  const stem = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '');
  if (!stem) return undefined;
  return `${openDesignBaseUrl}/api/plugins/${encodeURIComponent(id)}/example/${encodeURIComponent(stem)}`;
}

function inferTemplateAuthor(id: string, sourceKind?: string): string {
  if (sourceKind === 'bundled') return '@open-design';
  if (id.includes('eli') || id.includes('aero') || id.includes('landing')) return '@eli';
  return '@open-design';
}

function prettifyTemplateTitle(value: string): string {
  const raw = value.replace(/^example[-_]/, '').replace(/^video-template[-_]/, '').replace(/^image-template[-_]/, '');
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.length <= 3 && part === part.toLowerCase() ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bHtml\b/g, 'HTML')
    .replace(/\bPpt\b/g, 'PPT');
}

function TemplatesGallery({
  templates,
  allTemplates,
  activeKind,
  activeScene,
  search,
  onKindChange,
  onSceneChange,
  onSearchChange,
  onUseTemplate,
}: {
  templates: BuildTemplate[];
  allTemplates: BuildTemplate[];
  activeKind: TemplateKind | 'all';
  activeScene: string;
  search: string;
  onKindChange: (kind: TemplateKind | 'all') => void;
  onSceneChange: (scene: string) => void;
  onSearchChange: (value: string) => void;
  onUseTemplate: (template: BuildTemplate) => void;
}) {
  const kinds: Array<TemplateKind | 'all'> = ['all', 'prototype', 'live-artifact', 'deck', 'image', 'video', 'hyperframes', 'audio'];
  const counts = useMemo(() => {
    const next: Record<TemplateKind | 'all', number> = {
      all: allTemplates.length,
      prototype: 0,
      'live-artifact': 0,
      deck: 0,
      image: 0,
      video: 0,
      hyperframes: 0,
      marketing: 0,
      audio: 0,
    };
    allTemplates.forEach((template) => {
      next[template.kind] += 1;
    });
    return next;
  }, [allTemplates]);
  const sceneCounts = useMemo(() => {
    const pool = activeKind === 'all' ? allTemplates : allTemplates.filter((template) => template.kind === activeKind);
    const next = new Map<string, number>();
    pool.forEach((template) => {
      next.set(template.scene, (next.get(template.scene) ?? 0) + 1);
    });
    return Array.from(next.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [activeKind, allTemplates]);
  const heading = activeKind === 'all' ? 'Templates' : `${TEMPLATE_KIND_LABELS[activeKind]}.`;
  const subcopy = TEMPLATE_PAGE_COPY[activeKind] ?? TEMPLATE_PAGE_COPY.all;

  return (
    <div className="ab__templates">
      <header className="ab__templates-head">
        <div>
          <h2 className="ab__templates-title">{heading}</h2>
          <p className="ab__templates-sub">{subcopy}</p>
        </div>
      </header>

      <div className="ab__filter-strip" id="filter-strip">
        <div className="ab__filter-row">
          <span className="ab__filter-label">Artifact kind</span>
          <div className="ab__template-filters" aria-label="Artifact kind">
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`ab__template-filter ${activeKind === kind ? 'is-active' : ''}`}
            onClick={() => onKindChange(kind)}
          >
            <span>{TEMPLATE_KIND_LABELS[kind]}</span>
            <b>{counts[kind]}</b>
          </button>
        ))}
          </div>
        </div>
        <div className="ab__filter-row">
          <span className="ab__filter-label">Scene</span>
          <div className="ab__template-filters" aria-label="Template scene">
            <button
              type="button"
              className={`ab__template-filter ${activeScene === 'all' ? 'is-active' : ''}`}
              onClick={() => onSceneChange('all')}
            >
              <span>All</span>
              <b>{activeKind === 'all' ? allTemplates.length : counts[activeKind]}</b>
            </button>
            {sceneCounts.map(([scene, count]) => (
              <button
                key={scene}
                type="button"
                className={`ab__template-filter ${activeScene === scene ? 'is-active' : ''}`}
                onClick={() => onSceneChange(scene)}
              >
                <span>{scene}</span>
                <b>{count}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="ab__template-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or keyword..."
        />
      </label>

      {templates.length === 0 ? (
        <div className="ab__templates-empty">No templates match that search.</div>
      ) : (
        <div className="ab__template-grid">
          {templates.map((template) => (
            <article key={template.id} className={`ab__template-card is-${template.tone}`}>
              <div className="ab__template-image">
                <TemplatePreview template={template} />
                <span className="ab__template-kind">{TEMPLATE_KIND_LABELS[template.kind]}</span>
              </div>
              <div className="ab__template-copy">
                <span className="ab__template-prompt">Read full prompt {'->'}</span>
                <h3>{template.title}</h3>
                <p>{template.description}</p>
              </div>
              <button
                type="button"
                className="ab__template-use"
                onClick={() => onUseTemplate(template)}
              >
                <Wand2 size={14} aria-hidden="true" />
                <span>Use this template</span>
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ template }: { template: BuildTemplate }) {
  const previewUrls = template.previewUrls?.length ? template.previewUrls : (template.previewUrl ? [template.previewUrl] : []);
  const [urlIndex, setUrlIndex] = useState(0);
  const currentPreviewUrl = previewUrls[urlIndex];

  useEffect(() => {
    setUrlIndex(0);
  }, [template.id, previewUrls.join('|')]);

  if (currentPreviewUrl) {
    return (
      <img
        src={currentPreviewUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setUrlIndex((index) => index + 1)}
      />
    );
  }

  if (template.previewHtmlSrc) {
    return (
      <iframe
        className="ab__template-frame"
        src={template.previewHtmlSrc}
        title={`${template.title} preview`}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  return (
    <div className="ab__template-empty-preview" aria-hidden="true" />
  );
}

// --------------------------------------------------------------------------
// Projects gallery
// --------------------------------------------------------------------------

interface GalleryProps {
  projects: ProjectSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, current: string) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
}

function ProjectsGallery({ projects, currentId, onOpen, onDelete, onRename, onDuplicate, onNew }: GalleryProps) {
  return (
    <div className="ab__projects">
      <header className="ab__projects-head">
        <div>
          <h2 className="ab__projects-title">Your projects</h2>
          <p className="ab__projects-sub">
            {projects.length === 0
              ? 'Saved builds will appear here. Click Save on any project to keep it.'
              : `${projects.length} saved ${projects.length === 1 ? 'build' : 'builds'}. Click a card to open and keep editing.`}
          </p>
        </div>
        <button type="button" className="ab__btn ab__btn--primary" onClick={onNew}>
          + New project
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="ab__projects-empty">
          <div className="ab__projects-empty-illus" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64">
              <rect x="6" y="12" width="52" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 22h52" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="17" r="1.6" fill="currentColor" />
              <circle cx="18" cy="17" r="1.6" fill="currentColor" />
              <circle cx="24" cy="17" r="1.6" fill="currentColor" />
              <path d="M18 34h28M18 40h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <strong>No saved projects yet</strong>
          <span>Describe a site or app to the builder, then click <b>Save project</b> at the top to keep it here.</span>
        </div>
      ) : (
        <div className="ab__projects-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              isCurrent={p.id === currentId}
              onOpen={() => onOpen(p.id)}
              onDelete={() => onDelete(p.id, p.name)}
              onRename={() => onRename(p.id, p.name)}
              onDuplicate={() => onDuplicate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project, isCurrent, onOpen, onDelete, onRename, onDuplicate,
}: {
  project: ProjectSummary;
  isCurrent: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDuplicate: () => void;
}) {
  const title = useMemo(() => extractTitle(project.htmlPreview) || project.name, [project.htmlPreview, project.name]);
  const tag = useMemo(() => extractHeroTag(project.htmlPreview), [project.htmlPreview]);

  return (
    <article className={`ab__card ${isCurrent ? 'is-current' : ''}`}>
      <button type="button" className="ab__card-thumb" onClick={onOpen} aria-label={`Open ${project.name}`}>
        <div className="ab__card-preview">
          <div className="ab__card-preview-bar">
            <span /><span /><span />
          </div>
          <div className="ab__card-preview-body">
            <div className="ab__card-preview-title">{truncate(title, 40)}</div>
            {tag ? <div className="ab__card-preview-sub">{truncate(tag, 70)}</div> : null}
            <div className="ab__card-preview-line" />
          </div>
        </div>
      </button>
      <div className="ab__card-body">
        <div className="ab__card-row">
          <h3 className="ab__card-title" title={project.name}>
            {project.name}
            {isCurrent ? <span className="ab__card-pill">open</span> : null}
          </h3>
        </div>
        <div className="ab__card-meta">
          <span>{project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}</span>
          <span className="ab__dot-sep">·</span>
          <span>{formatRelative(project.updatedAt)}</span>
        </div>
        <div className="ab__card-actions">
          <button type="button" className="ab__btn ab__btn--primary ab__btn--mini" onClick={onOpen}>Open</button>
          <button type="button" className="ab__btn ab__btn--mini" onClick={onRename}>Rename</button>
          <button type="button" className="ab__btn ab__btn--mini" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="ab__btn ab__btn--mini ab__btn--danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </article>
  );
}

function extractTitle(html: string): string {
  if (!html) return '';
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return m ? m[1].trim() : '';
}

function extractHeroTag(html: string): string {
  if (!html) return '';
  const m = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || html.match(/<p[^>]*>([^<]+)<\/p>/i);
  return m ? m[1].trim() : '';
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
