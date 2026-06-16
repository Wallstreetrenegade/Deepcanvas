import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  useAppBuilderStore,
  type ChatMessage,
  type ProjectSummary,
} from '../../stores/appBuilderStore';
import './AppBuilderWorkspace.css';

type BuildStudioSelectorKey = 'artifact' | 'designSystem' | 'plugin' | 'output' | 'skill';

const BUILD_STUDIO_SELECTORS: Array<{
  key: BuildStudioSelectorKey;
  label: string;
  options: string[];
}> = [
  {
    key: 'artifact',
    label: 'Artifact',
    options: ['Auto', 'Landing page', 'Web app', 'Dashboard', 'Mobile app', 'Pitch deck', 'Social post', 'Marketing email', 'PM spec', 'OKR scorecard'],
  },
  {
    key: 'designSystem',
    label: 'Design systems',
    options: ['Auto', 'Brand from brief', 'Imported brand', 'SaaS clean', 'Editorial', 'Executive', 'Playful', 'Luxury', 'Dark premium'],
  },
  {
    key: 'plugin',
    label: 'Plugin',
    options: ['Auto', 'Default generation', 'Figma migration', 'Code migration', 'React export', 'Next.js export', 'Vue export', 'Media generation', 'Design refine'],
  },
  {
    key: 'output',
    label: 'Output',
    options: ['Auto', 'HTML/CSS/JS', 'React', 'Next.js', 'Vue', 'PDF', 'PPTX', 'MP4'],
  },
  {
    key: 'skill',
    label: 'Skill',
    options: ['Auto', 'web-prototype', 'saas-landing', 'dashboard', 'mobile-app', 'mobile-onboarding', 'social-carousel', 'email-marketing', 'pm-spec', 'team-okrs', 'html-ppt', 'hyperframes'],
  },
];

const DEFAULT_BUILD_STUDIO_SELECTIONS: Record<BuildStudioSelectorKey, string> = {
  artifact: 'Auto',
  designSystem: 'Auto',
  plugin: 'Auto',
  output: 'Auto',
  skill: 'Auto',
};

/**
 * AppBuilderWorkspace - AI-powered landing-page / website / app builder.
 * Layout: left = Code / Preview / Projects tabs. Right = builder chat.
 */
export function AppBuilderWorkspace(_props: { onExit: () => void }) {
  const s = useAppBuilderStore();
  const {
    files, activeFile, previewMode, chat, busy, llmReady,
    currentProjectId, projectName, projects, lastError,
    isLoaded, isLoading, sending, error, backgroundNotice,
    loadState, clearError,
    setActiveFile, setPreviewMode,
    createFile, updateFile, deleteFile, renameFile,
    resetProject, sendChat, clearChat,
    saveProject, loadProject, deleteProject, renameProject, duplicateProject, newProject,
  } = s;

  useEffect(() => {
    if (!isLoaded && !isLoading) void loadState();
  }, [isLoaded, isLoading, loadState]);

  const [chatInput, setChatInput] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [buildSelections, setBuildSelections] = useState<Record<BuildStudioSelectorKey, string>>(DEFAULT_BUILD_STUDIO_SELECTIONS);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const didForceEditorDefaultRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || didForceEditorDefaultRef.current) return;
    didForceEditorDefaultRef.current = true;
    if (previewMode !== 'code') void setPreviewMode('code');
  }, [isLoaded, previewMode, setPreviewMode]);

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
    if (previewMode !== 'code') {
      await setPreviewMode('code');
    }
    await sendChat(withBuildStudioSelections(msg, buildSelections));
  };

  const handleModeChange = async (mode: 'code' | 'preview' | 'projects') => {
    if (isEditingFile && activeFile) {
      await updateFile(activeFile, draftContent);
      setIsEditingFile(false);
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
    setBuildSelections(DEFAULT_BUILD_STUDIO_SELECTIONS);
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
    <div className="ab animate-rise">
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
            <button
              type="button"
              className="ab__project-chip"
              onClick={handleRenameProjectInline}
              title={currentProjectId ? 'Rename this saved project' : 'Unsaved — click Save to store it'}
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

          <div className="ab__od-controls" aria-label="Open Design build controls">
            {BUILD_STUDIO_SELECTORS.map((item) => (
              <label key={item.key} className="ab__od-field">
                <span>{item.label}</span>
                <select
                  value={buildSelections[item.key]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setBuildSelections((prev) => ({ ...prev, [item.key]: value }));
                  }}
                >
                  {item.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {previewMode === 'preview' ? (
            <iframe
              className="ab__preview-frame"
              title="Live preview"
              srcDoc={previewSrc}
              sandbox="allow-scripts allow-forms allow-same-origin"
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
              <button type="button" className="ab__btn ab__btn--ghost ab__btn--mini" onClick={() => void clearChat()} title="Clear conversation">
                Clear
              </button>
            </div>
          </header>

          <div className="ab__chat-scroll">
            {chat.length === 0 ? (
              <div className="ab__chat-empty">
                <strong>Describe what you want built.</strong>
                <span>Landing pages, polished websites, dashboards, and small apps should come out clean, structured, and production-ready.</span>
              </div>
            ) : null}
            {chat.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {busy || sending ? (
              <div className="ab__chat-busy">
                <div className="ab__chat-busy-head">
                  <span className="ab__chat-busy-title">{progressHeadline || 'Working'}</span>
                  <span className="ab__chat-busy-time">{Math.max(1, Math.floor(progressElapsedMs / 1000))}s</span>
                </div>
                <div className="ab__chat-busy-steps">
                  {progressSteps.map((step) => (
                    <span key={step.label} className={`ab__chat-busy-step is-${step.status}`}>
                      {step.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
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

function withBuildStudioSelections(message: string, selections: Record<BuildStudioSelectorKey, string>): string {
  const active = BUILD_STUDIO_SELECTORS
    .map((item) => [item.label, selections[item.key]] as const)
    .filter(([, value]) => value && value !== 'Auto');

  if (active.length === 0) return message;

  const guidance = active.map(([label, value]) => `- ${label}: ${value}`).join('\n');
  return `Build Studio controls (treat non-Auto values as build constraints; use Open Design skills, plugins, design systems, and output modes when available):\n${guidance}\n\nUser request:\n${message}`;
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
  const body = isUser ? message.content : stripOpsPayload(message.content);
  return (
    <div className={`ab__msg ${isUser ? 'ab__msg--user' : 'ab__msg--assistant'}`}>
      <div className="ab__msg-role">{isUser ? 'You' : 'Builder'}</div>
      {body ? <div className="ab__msg-body">{body}</div> : null}
      {!isUser && message.opsApplied && message.opsApplied.length > 0 ? (
        <ul className="ab__msg-ops">
          {message.opsApplied.map((op, i) => (
            <li key={i}><code>{op}</code></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function stripOpsPayload(content: string): string {
  if (!content) return '';
  return content
    .replace(/```\s*json-ops[\s\S]*?```/gi, '')
    .replace(/```\s*json-ops[\s\S]*$/gi, '')
    .trim();
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
  return null;
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
