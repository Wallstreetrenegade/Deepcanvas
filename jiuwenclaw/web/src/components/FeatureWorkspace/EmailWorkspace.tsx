import './EmailWorkspace.css';

interface Props {
  onExit: () => void;
}

function resolvePlunkUrl(): string {
  const configuredUrl = import.meta.env.VITE_PLUNK_WEB_URL?.trim();
  if (configuredUrl) return configuredUrl;

  if (import.meta.env.DEV) {
    return '/mail/';
  }

  return '/mail';
}

export function EmailWorkspace(_: Props) {
  const plunkUrl = resolvePlunkUrl();

  return (
    <div className="feature-email">
      <iframe
        key={plunkUrl}
        className="feature-email__frame"
        src={plunkUrl}
        title="Deep Canvas Mail"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
