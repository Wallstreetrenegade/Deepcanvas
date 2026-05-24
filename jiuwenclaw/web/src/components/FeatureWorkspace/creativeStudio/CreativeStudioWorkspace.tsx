import { useEffect, useMemo, useRef, useState } from 'react';
import CreativeEditorSDK, { type Configuration } from '@cesdk/cesdk-js';
import { initAdvancedVideoEditor } from '../../../imgly';
import './CreativeStudioWorkspace.css';

type CreativeStudioWorkspaceProps = {
  onExit: () => void;
};

function buildCesdkBaseURL(version: string): string {
  return import.meta.env.VITE_CESDK_BASE_URL?.trim() || `/cesdk/${version}/`;
}

export function CreativeStudioWorkspace({ onExit: _onExit }: CreativeStudioWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState<string>('Starting editor...');

  const config = useMemo<Configuration>(() => {
    const license = import.meta.env.VITE_CESDK_LICENSE?.trim() || '';
    const baseURL = buildCesdkBaseURL(CreativeEditorSDK.version);

    return {
      userId: 'creative-studio-user',
      baseURL,
      core: {
        baseURL: 'core/',
      },
      devMode: true,
      license,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let instance: CreativeEditorSDK | null = null;

    async function boot() {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const assetBaseURL = new URL(buildCesdkBaseURL(CreativeEditorSDK.version), window.location.href).href;
      const attempts: Array<{ label: string; createConfig: Configuration }> = [
        { label: 'Starting editor...', createConfig: config },
        { label: 'Retrying with WebGL1 fallback...', createConfig: { ...config, forceWebGL1: true } },
      ];

      try {
        let lastError: unknown = null;

        for (const attempt of attempts) {
          setBootAttempt(attempt.label);
          container.replaceChildren();
          try {
            const cesdk = await CreativeEditorSDK.create(container, attempt.createConfig);
            if (cancelled) {
              cesdk.dispose();
              return;
            }

            instance = cesdk;
            await initAdvancedVideoEditor(cesdk, assetBaseURL);
            await cesdk.actions.run('scene.create', { mode: 'Video' });
            setLoadError(null);
            setBootAttempt('Editor ready.');
            return;
          } catch (error) {
            lastError = error;
            console.warn(`Creative Studio boot attempt failed: ${attempt.label}`, error);
            if (instance) {
              instance.dispose();
              instance = null;
            }
          }
        }

        throw lastError;
      } catch (error) {
        console.error('Failed to initialize Creative Studio:', error);
        if (!cancelled) {
          setLoadError('Editor engine could not be loaded.');
          setBootAttempt('Editor failed to start.');
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (instance) {
        instance.dispose();
      }
    };
  }, [config]);

  return (
    <section className="creative-studio animate-rise">
      <div ref={containerRef} className="creative-studio__editor" />
      {loadError ? (
        <div className="creative-studio__error">
          <strong>{loadError}</strong>
          <span>{bootAttempt}</span>
          <span>Check the browser console for the first CE.SDK error if this still appears.</span>
        </div>
      ) : null}
    </section>
  );
}
