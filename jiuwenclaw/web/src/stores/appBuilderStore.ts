import { create } from 'zustand';
import { webRequest } from '../services/webClient';
import { mirrorFeatureState } from '../services/piMirror';
import type { WebRequestOptions } from '../types/websocket';

// Must mirror jiuwenclaw/pi_agent/app_builder.py

export type PreviewMode = 'preview' | 'code' | 'projects' | 'templates';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  summary?: string | null;
  opsApplied?: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  htmlPreview: string;
}

export interface AppBuilderSnapshot {
  files: Record<string, string>;
  activeFile: string;
  previewMode: PreviewMode;
  chat: ChatMessage[];
  busy: boolean;
  lastError: string | null;
  llmReady: boolean;
  updatedAt: string;
  currentProjectId: string | null;
  projectName: string;
  workspaceId?: string;
  workspaceDir?: string;
  lastCommand?: AppBuilderCommandResult | null;
  lastAudit?: AppBuilderAuditResult | null;
  commandPolicy?: AppBuilderCommandPolicy;
  devServer?: AppBuilderDevServer | null;
  lastScreenshot?: AppBuilderScreenshotResult | null;
  lastArtifact?: AppBuilderArtifact | null;
  buildPlan?: AppBuilderPlan | null;
}

function summarizeBuilderState(state: AppBuilderSnapshot) {
  return JSON.stringify({
    updatedAt: state.updatedAt,
    busy: state.busy,
    fileNames: Object.keys(state.files).sort(),
    chatCount: state.chat.length,
    lastChatId: state.chat[state.chat.length - 1]?.id ?? '',
    lastChatRole: state.chat[state.chat.length - 1]?.role ?? '',
    lastError: state.lastError ?? null,
  });
}

function stripBuildStudioAutoContext(content: string): string {
  const trimmed = (content || '').trim();
  if (!trimmed.toLowerCase().startsWith('build studio auto mode:')) {
    return trimmed;
  }
  const parts = trimmed.split(/\nUser request:\s*/i);
  return parts.length > 1 ? parts.slice(1).join('\nUser request:\n').trim() : trimmed;
}

function inferVisibleBuildMode(message: string): string {
  const text = message.toLowerCase();
  if (/\b(dashboard|analytics|kpi|metric|admin|reporting|crm|pipeline|command center|ops center|live artifact|data console)\b/.test(text)) {
    return 'live dashboard';
  }
  if (/\b(slide deck|deck|presentation|pitch|weekly update|magazine deck|ppt)\b/.test(text)) {
    return 'slide deck';
  }
  if (/\b(hyperframes?|motion graphics?|storyboard|animation|video)\b/.test(text)) {
    return text.includes('hyperframe') ? 'HyperFrames motion piece' : 'video artifact';
  }
  if (/\b(image|photo|picture|mockup|visual asset|edit this image)\b/.test(text)) {
    return 'image artifact';
  }
  if (/\b(marketing|campaign|cro|copywriting|copy|seo|ads?|ad creative|funnel|launch|email sequence|social content|pricing|positioning|sales enablement|lead magnet|landing angle)\b/.test(text)) {
    return 'marketing system';
  }
  if (/\b(app|tool|portal|workspace)\b/.test(text)) {
    return 'interactive app';
  }
  return 'prototype';
}

function optimisticBuilderMessage(message: string): string {
  const mode = inferVisibleBuildMode(message);
  if (mode === 'live dashboard') {
    return "Got it. I’ll build this as a real live dashboard, not a landing page: app shell, KPI cards, charts, filters, pipeline/activity views, and useful interactions in the Preview.";
  }
  if (mode === 'slide deck') {
    return "Got it. I’ll build this as a proper slide deck with presentation structure, navigation, and a polished visual system.";
  }
  if (mode === 'image artifact') {
    return "Got it. I’ll treat this as an image-focused artifact and keep the result previewable so we can keep iterating from chat.";
  }
  if (mode.includes('video') || mode.includes('HyperFrames')) {
    return "Got it. I’ll shape this as a motion artifact with frames/timeline structure rather than a static page.";
  }
  return "Got it. I’ll build the first version in the Preview, then we can refine it together from here.";
}

export interface AppBuilderCommandResult {
  command: string[] | string;
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface AppBuilderAuditResult {
  passed: boolean;
  issues: string[];
  checkedAt: string;
  fileCount: number;
}

export interface AppBuilderCommandPolicy {
  allowedCommands: string[];
  allowPackageInstall: boolean;
  allowPythonPackageInstall: boolean;
  allowDevServer: boolean;
  allowNetworkCommands: boolean;
}

export interface AppBuilderDevServer {
  command: string[] | string;
  port: number;
  url: string;
  status: 'running' | 'stopped' | string;
  pid?: number;
  logPath?: string;
  log?: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface AppBuilderArtifact {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  mimeType?: string;
  base64?: string;
}

export interface AppBuilderScreenshotResult {
  ok: boolean;
  url: string;
  checkedAt: string;
  screenshots: string[];
  errors: string[];
  metrics: Record<string, unknown>;
  status?: number | null;
  details?: string;
}

export interface AppBuilderPlanStep {
  id: string;
  title: string;
  detail: string;
  status: string;
}

export interface AppBuilderPlan {
  id: string;
  request: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  basedOnExistingFiles: boolean;
  steps: AppBuilderPlanStep[];
}

export interface OpenDesignCatalogItem {
  id: string;
  name: string;
  title?: string;
  description?: string;
  tags?: string[];
  mode?: string | null;
  scenario?: string | null;
  surface?: string | null;
  preview?: { type?: string; image?: string; poster?: string; video?: string; gif?: string; entry?: string } | null;
  bakedPreview?: { poster?: string; video?: string; holdMs?: number } | null;
  exampleOutputs?: Array<{ path?: string; title?: string }>;
  author?: string;
  source?: string;
  sourceKind?: string;
  installed?: boolean | null;
}

export interface OpenDesignStatus {
  available: boolean;
  baseUrl: string;
  checkedAt: string;
  message: string;
  checks?: Record<string, boolean>;
  nodePath?: string | null;
  pnpmPath?: string | null;
  health?: unknown;
  catalog?: {
    skills?: OpenDesignCatalogItem[];
    plugins?: OpenDesignCatalogItem[];
    designSystems?: OpenDesignCatalogItem[];
    mediaModels?: OpenDesignCatalogItem[];
  };
  catalogErrors?: Record<string, string>;
}

export interface AppBuilderShipReport {
  startedAt: string;
  finishedAt: string;
  steps: Array<{
    key: string;
    label: string;
    status: 'passed' | 'failed' | 'skipped';
    detail: string;
  }>;
  passed: boolean;
}

interface RpcResponse {
  state: AppBuilderSnapshot;
  projects?: ProjectSummary[];
  savedProjectId?: string;
  workspace?: { workspaceDir: string; written: string[]; fileCount: number };
  command?: AppBuilderCommandResult;
  audit?: AppBuilderAuditResult;
  policy?: AppBuilderCommandPolicy;
  devServer?: AppBuilderDevServer | null;
  screenshot?: AppBuilderScreenshotResult;
  artifact?: AppBuilderArtifact;
  plan?: AppBuilderPlan;
  openDesign?: OpenDesignStatus;
}

interface AppBuilderState extends AppBuilderSnapshot {
  isLoaded: boolean;
  isLoading: boolean;
  sending: boolean;
  runningCommand: boolean;
  runningServer: boolean;
  runningQa: boolean;
  creatingArtifact: boolean;
  shipping: boolean;
  loadingOpenDesign: boolean;
  error: string | null;
  backgroundNotice: string | null;
  projects: ProjectSummary[];
  lastShipReport: AppBuilderShipReport | null;
  openDesign: OpenDesignStatus | null;

  loadState: () => Promise<void>;
  refreshState: () => Promise<void>;
  clearError: () => void;

  setActiveFile: (path: string) => Promise<void>;
  setPreviewMode: (mode: PreviewMode) => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  updateFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (from: string, to: string) => Promise<void>;
  resetProject: () => Promise<void>;
  sendChat: (message: string) => Promise<void>;
  clearChat: () => Promise<void>;
  exportWorkspace: (clean?: boolean) => Promise<string | null>;
  runCommand: (command: string, timeoutSec?: number) => Promise<AppBuilderCommandResult | null>;
  auditProject: () => Promise<AppBuilderAuditResult | null>;
  updatePolicy: (policy: Partial<AppBuilderCommandPolicy>) => Promise<AppBuilderCommandPolicy | null>;
  startDevServer: (command?: string, port?: number) => Promise<AppBuilderDevServer | null>;
  stopDevServer: () => Promise<AppBuilderDevServer | null>;
  refreshDevServer: () => Promise<AppBuilderDevServer | null>;
  runScreenshotQA: (url?: string) => Promise<AppBuilderScreenshotResult | null>;
  createZip: () => Promise<AppBuilderArtifact | null>;
  downloadZip: () => Promise<AppBuilderArtifact | null>;
  createPlan: (prompt: string) => Promise<AppBuilderPlan | null>;
  shipProject: () => Promise<AppBuilderShipReport | null>;
  loadOpenDesignStatus: () => Promise<OpenDesignStatus | null>;
  loadOpenDesignCatalog: () => Promise<OpenDesignStatus | null>;

  // Projects library
  listProjects: () => Promise<void>;
  saveProject: (opts: { id?: string; name?: string; description?: string }) => Promise<string | null>;
  loadProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  newProject: (name?: string) => Promise<void>;
}

const EMPTY_SNAPSHOT: AppBuilderSnapshot = {
  files: {},
  activeFile: '',
  previewMode: 'code',
  chat: [],
  busy: false,
  lastError: null,
  llmReady: false,
  updatedAt: '',
  currentProjectId: null,
  projectName: 'Untitled project',
  workspaceId: '',
  workspaceDir: '',
  lastCommand: null,
  lastAudit: null,
  commandPolicy: {
    allowedCommands: ['node', 'node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd', 'pnpm', 'pnpm.cmd', 'yarn', 'yarn.cmd', 'python', 'python.exe', 'python3', 'pip', 'pip.exe', 'pip3'],
    allowPackageInstall: true,
    allowPythonPackageInstall: true,
    allowDevServer: true,
    allowNetworkCommands: true,
  },
  devServer: null,
  lastScreenshot: null,
  lastArtifact: null,
  buildPlan: null,
};

function applySnapshot(snap: AppBuilderSnapshot, forceCodeMode = false) {
  if (forceCodeMode) {
    snap = { ...snap, previewMode: 'code' };
  }
  mirrorFeatureState('app_builder', snap);
  return snap;
}

export const useAppBuilderStore = create<AppBuilderState>((set, get) => {
  async function callAndApply(method: string, params?: Record<string, unknown>, options?: WebRequestOptions): Promise<RpcResponse | null> {
    const resp = await webRequest<RpcResponse>(method, params ?? {}, options);
    if (!resp) return null;
    const snap = resp.state;
    if (snap) {
      const forceCodeMode = method === 'app.builder.reset_project'
        || method === 'app.builder.load_project'
        || method === 'app.builder.new_project';
      const patch: Partial<AppBuilderState> = {
        ...applySnapshot(snap, forceCodeMode),
        isLoaded: true,
        error: null,
        backgroundNotice: null,
      };
      if (Array.isArray(resp.projects)) {
        patch.projects = resp.projects;
      }
      if (resp.openDesign) {
        patch.openDesign = resp.openDesign;
      }
      set(patch);
    }
    return resp;
  }

  return {
    ...EMPTY_SNAPSHOT,
    isLoaded: false,
    isLoading: false,
    sending: false,
    runningCommand: false,
    runningServer: false,
    runningQa: false,
    creatingArtifact: false,
    shipping: false,
    loadingOpenDesign: false,
    error: null,
    backgroundNotice: null,
    projects: [],
    lastShipReport: null,
    openDesign: null,

    loadState: async () => {
      if (get().isLoading) return;
      set({ isLoading: true, error: null });
      try {
        await callAndApply('app.builder.get_state');
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ isLoading: false });
      }
    },
    refreshState: async () => {
      try {
        await callAndApply('app.builder.get_state');
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    clearError: () => set({ error: null, backgroundNotice: null }),

    loadOpenDesignStatus: async () => {
      if (get().loadingOpenDesign) return get().openDesign;
      set({ loadingOpenDesign: true });
      try {
        const resp = await callAndApply('app.builder.open_design_status', {}, { timeoutMs: 12000 });
        return resp?.openDesign ?? get().openDesign ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ loadingOpenDesign: false });
      }
    },
    loadOpenDesignCatalog: async () => {
      if (get().loadingOpenDesign) return get().openDesign;
      set({ loadingOpenDesign: true });
      try {
        const resp = await callAndApply('app.builder.open_design_catalog', {}, { timeoutMs: 20000 });
        return resp?.openDesign ?? get().openDesign ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ loadingOpenDesign: false });
      }
    },

    setActiveFile: async (path) => {
      try { await callAndApply('app.builder.set_active_file', { path }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    setPreviewMode: async (mode) => {
      try { await callAndApply('app.builder.set_preview_mode', { mode }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    createFile: async (path, content = '') => {
      try { await callAndApply('app.builder.create_file', { path, content }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    updateFile: async (path, content) => {
      try { await callAndApply('app.builder.update_file', { path, content }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    deleteFile: async (path) => {
      try { await callAndApply('app.builder.delete_file', { path }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    renameFile: async (from, to) => {
      try { await callAndApply('app.builder.rename_file', { from, to }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    resetProject: async () => {
      try { await callAndApply('app.builder.reset_project'); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    sendChat: async (message) => {
      if (!message.trim() || get().sending) return;
      const visibleMessage = stripBuildStudioAutoContext(message);
      const now = new Date().toISOString();
      const optimisticUser: ChatMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: visibleMessage,
        at: now,
      };
      const optimisticAssistant: ChatMessage = {
        id: `local-builder-${Date.now()}`,
        role: 'assistant',
        content: optimisticBuilderMessage(visibleMessage),
        at: now,
      };
      set((state) => ({
        sending: true,
        busy: true,
        error: null,
        backgroundNotice: null,
        chat: [...state.chat, optimisticUser, optimisticAssistant],
      }));
      try {
        await callAndApply('app.builder.chat', { message }, { timeoutMs: 300000 });
        set({ backgroundNotice: null });
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        const code = typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';

        if (code === 'REQUEST_TIMEOUT') {
          const before = summarizeBuilderState(get());
          set({
            error: null,
            backgroundNotice: 'Builder is still working in the background. We will refresh the project automatically when the update lands.',
          });

          let resolvedInBackground = false;
          for (let attempt = 0; attempt < 18; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 4000));
            try {
              await callAndApply('app.builder.get_state', undefined, { timeoutMs: 20000 });
              const current = get();
              const assistantReplied = current.chat[current.chat.length - 1]?.role === 'assistant';
              const changed = summarizeBuilderState(current) !== before;
              if (!current.busy && assistantReplied && changed) {
                resolvedInBackground = true;
                set({ error: null, backgroundNotice: null });
                break;
              }
            } catch {
              // Keep polling quietly while the builder finishes.
            }
          }

          if (!resolvedInBackground) {
            set({
              backgroundNotice: 'Builder may still be finishing. If the latest files do not appear shortly, try the same edit again.',
            });
          }
        } else {
          set({ error: messageText, backgroundNotice: null, busy: false });
        }
      } finally {
        set({ sending: false });
      }
    },
    clearChat: async () => {
      try { await callAndApply('app.builder.clear_chat'); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    exportWorkspace: async (clean = true) => {
      try {
        const resp = await callAndApply('app.builder.export_workspace', { clean });
        return resp?.workspace?.workspaceDir ?? get().workspaceDir ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    runCommand: async (command, timeoutSec = 120) => {
      if (!command.trim() || get().runningCommand) return null;
      set({ runningCommand: true, error: null });
      try {
        const resp = await callAndApply('app.builder.run_command', { command, timeoutSec }, { timeoutMs: Math.max(30000, timeoutSec * 1000 + 10000) });
        return resp?.command ?? get().lastCommand ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ runningCommand: false });
      }
    },
    auditProject: async () => {
      try {
        const resp = await callAndApply('app.builder.audit_project');
        return resp?.audit ?? get().lastAudit ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    updatePolicy: async (policy) => {
      try {
        const resp = await callAndApply('app.builder.update_policy', { policy });
        return resp?.policy ?? get().commandPolicy ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    startDevServer: async (command = 'npm run dev -- --host 127.0.0.1 --port 5173', port = 5173) => {
      if (get().runningServer) return get().devServer ?? null;
      set({ runningServer: true, error: null });
      try {
        const resp = await callAndApply('app.builder.start_dev_server', { command, port }, { timeoutMs: 30000 });
        return resp?.devServer ?? get().devServer ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ runningServer: false });
      }
    },
    stopDevServer: async () => {
      if (get().runningServer) return get().devServer ?? null;
      set({ runningServer: true, error: null });
      try {
        const resp = await callAndApply('app.builder.stop_dev_server', {}, { timeoutMs: 30000 });
        return resp?.devServer ?? get().devServer ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ runningServer: false });
      }
    },
    refreshDevServer: async () => {
      try {
        const resp = await callAndApply('app.builder.dev_server_status');
        return resp?.devServer ?? get().devServer ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    runScreenshotQA: async (url) => {
      if (get().runningQa) return get().lastScreenshot ?? null;
      set({ runningQa: true, error: null });
      try {
        const resp = await callAndApply('app.builder.screenshot_qa', url ? { url } : {}, { timeoutMs: 90000 });
        return resp?.screenshot ?? get().lastScreenshot ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ runningQa: false });
      }
    },
    createZip: async () => {
      if (get().creatingArtifact) return get().lastArtifact ?? null;
      set({ creatingArtifact: true, error: null });
      try {
        const resp = await callAndApply('app.builder.create_zip');
        return resp?.artifact ?? get().lastArtifact ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ creatingArtifact: false });
      }
    },
    downloadZip: async () => {
      if (get().creatingArtifact) return get().lastArtifact ?? null;
      set({ creatingArtifact: true, error: null });
      try {
        const resp = await callAndApply('app.builder.get_artifact_blob', {}, { timeoutMs: 60000 });
        const artifact = resp?.artifact ?? get().lastArtifact ?? null;
        if (artifact?.base64) {
          const bytes = Uint8Array.from(atob(artifact.base64), (char) => char.charCodeAt(0));
          const blob = new Blob([bytes], { type: artifact.mimeType || 'application/zip' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = artifact.name || 'app-builder-project.zip';
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }
        return artifact;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        set({ creatingArtifact: false });
      }
    },
    createPlan: async (prompt) => {
      try {
        const resp = await callAndApply('app.builder.create_plan', { prompt });
        return resp?.plan ?? get().buildPlan ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    shipProject: async () => {
      if (get().shipping) return get().lastShipReport;
      set({ shipping: true, error: null });
      const startedAt = new Date().toISOString();
      const steps: AppBuilderShipReport['steps'] = [];

      const pushStep = (key: string, label: string, status: 'passed' | 'failed' | 'skipped', detail: string) => {
        steps.push({ key, label, status, detail });
      };

      try {
        const workspace = await get().exportWorkspace(true);
        pushStep('export', 'Export workspace', workspace ? 'passed' : 'failed', workspace || 'Workspace export failed.');
        if (!workspace) {
          const report = {
            startedAt,
            finishedAt: new Date().toISOString(),
            steps,
            passed: false,
          };
          set({ lastShipReport: report });
          return report;
        }

        const packageJsonRaw = get().files['package.json'];
        let packageScripts: Record<string, unknown> = {};
        if (packageJsonRaw) {
          try {
            const parsed = JSON.parse(packageJsonRaw) as { scripts?: Record<string, unknown> };
            packageScripts = typeof parsed.scripts === 'object' && parsed.scripts ? parsed.scripts : {};
          } catch {
            packageScripts = {};
          }
        }

        const hasPackageJson = Boolean(packageJsonRaw);
        if (hasPackageJson) {
          const install = await get().runCommand('npm install', 240);
          pushStep(
            'install',
            'Install dependencies',
            install && install.exitCode === 0 && !install.timedOut ? 'passed' : 'failed',
            install ? (install.output || 'Dependencies installed.') : 'Install did not run.',
          );
        } else {
          pushStep('install', 'Install dependencies', 'skipped', 'No package.json in this project.');
        }

        const hasBuildScript = typeof packageScripts.build === 'string' && String(packageScripts.build).trim().length > 0;
        if (hasBuildScript) {
          const build = await get().runCommand('npm run build', 240);
          pushStep(
            'build',
            'Build project',
            build && build.exitCode === 0 && !build.timedOut ? 'passed' : 'failed',
            build ? (build.output || 'Build completed.') : 'Build did not run.',
          );
        } else {
          pushStep('build', 'Build project', 'skipped', 'No build script found.');
        }

        const hasTestScript = typeof packageScripts.test === 'string' && String(packageScripts.test).trim().length > 0;
        if (hasTestScript) {
          const test = await get().runCommand('npm test', 180);
          pushStep(
            'test',
            'Run tests',
            test && test.exitCode === 0 && !test.timedOut ? 'passed' : 'failed',
            test ? (test.output || 'Tests completed.') : 'Tests did not run.',
          );
        } else {
          pushStep('test', 'Run tests', 'skipped', 'No test script found.');
        }

        const audit = await get().auditProject();
        pushStep(
          'audit',
          'Audit project quality',
          audit && audit.passed ? 'passed' : 'failed',
          audit ? (audit.passed ? 'Audit passed.' : audit.issues.join(' | ')) : 'Audit did not run.',
        );

        const screenshot = await get().runScreenshotQA();
        pushStep(
          'qa',
          'Run screenshot QA',
          screenshot && screenshot.ok ? 'passed' : 'failed',
          screenshot ? ((screenshot.errors && screenshot.errors.length > 0) ? screenshot.errors.join(' | ') : 'Screenshot QA passed.') : 'Screenshot QA did not run.',
        );

        const artifact = await get().createZip();
        pushStep(
          'package',
          'Create zip artifact',
          artifact ? 'passed' : 'failed',
          artifact ? `${artifact.name} (${artifact.sizeBytes} bytes)` : 'Artifact was not created.',
        );

        const report = {
          startedAt,
          finishedAt: new Date().toISOString(),
          steps,
          passed: steps.every((step) => step.status !== 'failed'),
        };
        set({ lastShipReport: report });
        return report;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        pushStep('ship', 'Ship check', 'failed', detail);
        const report = {
          startedAt,
          finishedAt: new Date().toISOString(),
          steps,
          passed: false,
        };
        set({ error: detail, lastShipReport: report });
        return report;
      } finally {
        set({ shipping: false });
      }
    },

    listProjects: async () => {
      try { await callAndApply('app.builder.list_projects'); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    saveProject: async ({ id, name, description }) => {
      try {
        const resp = await callAndApply('app.builder.save_project', {
          ...(id ? { id } : {}),
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        });
        return resp?.savedProjectId ?? null;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
    loadProject: async (id) => {
      try { await callAndApply('app.builder.load_project', { id }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    deleteProject: async (id) => {
      try { await callAndApply('app.builder.delete_project', { id }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    renameProject: async (id, name) => {
      try { await callAndApply('app.builder.rename_project', { id, name }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    duplicateProject: async (id) => {
      try { await callAndApply('app.builder.duplicate_project', { id }); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
    newProject: async (name) => {
      try { await callAndApply('app.builder.new_project', name ? { name } : {}); }
      catch (err) { set({ error: err instanceof Error ? err.message : String(err) }); }
    },
  };
});
