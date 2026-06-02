import { useEffect, useMemo, useState } from 'react';
import { useEmailStore } from '../../stores/emailStore';
import './EmailWorkspace.css';

interface Props {
  onExit: () => void;
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const deltaMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h`;
  return `${Math.round(deltaHours / 24)}d`;
}

function labelFromDraft(subject: string, fallback: string): string {
  return subject.trim() || fallback;
}

export function EmailWorkspace(_: Props) {
  const {
    draft,
    inbox,
    sent,
    templates,
    campaigns,
    selectedInboxId,
    rightPanel,
    hydrationStatus,
    hydrationError,
    hydrate,
    setRightPanel,
    setSelectedInboxId,
    updateDraftField,
    clearDraft,
    applyTemplate,
    saveTemplateFromDraft,
    createCampaignFromDraft,
    sendDraft,
    testEngine,
  } = useEmailStore();

  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const selectedInbox = useMemo(
    () => inbox.find((item) => item.id === selectedInboxId) ?? inbox[0] ?? null,
    [inbox, selectedInboxId]
  );

  const recipientCount = useMemo(
    () => draft.to.split(',').map((item) => item.trim()).filter(Boolean).length,
    [draft.to]
  );

  async function handleSend() {
    try {
      const sentItem = await sendDraft();
      if (!sentItem) {
        setStatusMessage('Add recipients, subject, and body.');
        return;
      }
      setStatusMessage(sentItem.status === 'queued' ? 'Queued' : 'Sent');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Send failed');
    }
  }

  async function handleTest() {
    try {
      const message = await testEngine();
      setStatusMessage(message);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Test failed');
    }
  }

  function handleSaveTemplate() {
    const saved = saveTemplateFromDraft(labelFromDraft(draft.subject, 'Template'));
    setStatusMessage(saved ? 'Template saved' : 'Template needs a name');
  }

  function handleCreateCampaign() {
    const campaign = createCampaignFromDraft(labelFromDraft(draft.subject, 'Campaign'));
    setStatusMessage(campaign ? 'Campaign created' : 'Campaign needs a name');
  }

  return (
    <div className="feature-email">
      <section className="feature-email__composer">
        <div className="feature-email__toolbar">
          <input
            value={draft.from}
            onChange={(event) => updateDraftField('from', event.target.value)}
            placeholder="From"
            title="From"
            aria-label="From"
          />
          <button type="button" onClick={() => void handleTest()}>Test</button>
          <button type="button" onClick={clearDraft}>Clear</button>
          <button type="button" className="feature-email__primary" onClick={() => void handleSend()}>Send</button>
        </div>

        <div className="feature-email__fields">
          <input
            value={draft.to}
            onChange={(event) => updateDraftField('to', event.target.value)}
            placeholder="To"
            title="To"
            aria-label="To"
          />
          <input
            value={draft.cc}
            onChange={(event) => updateDraftField('cc', event.target.value)}
            placeholder="Cc"
            title="Cc"
            aria-label="Cc"
          />
          <input
            value={draft.bcc}
            onChange={(event) => updateDraftField('bcc', event.target.value)}
            placeholder="Bcc"
            title="Bcc"
            aria-label="Bcc"
          />
          <input
            value={draft.subject}
            onChange={(event) => updateDraftField('subject', event.target.value)}
            placeholder="Subject"
            title="Subject"
            aria-label="Subject"
          />
        </div>

        <textarea
          className="feature-email__body"
          value={draft.body}
          onChange={(event) => updateDraftField('body', event.target.value)}
          placeholder="Write email"
          aria-label="Email body"
        />

        <div className="feature-email__footer">
          <div className="feature-email__meta">
            <span>{recipientCount} recipients</span>
            {hydrationStatus === 'error' ? <span>{hydrationError || 'Local cache'}</span> : null}
            {statusMessage ? <span>{statusMessage}</span> : null}
          </div>
          <div className="feature-email__actions">
            <button type="button" onClick={handleSaveTemplate}>Save template</button>
            <button type="button" onClick={handleCreateCampaign}>Create campaign</button>
          </div>
        </div>
      </section>

      <section className="feature-email__workspace">
        <div className="feature-email__tabs">
          {(['inbox', 'templates', 'campaigns'] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              className={rightPanel === panel ? 'is-active' : ''}
              onClick={() => setRightPanel(panel)}
            >
              {panel.charAt(0).toUpperCase() + panel.slice(1)}
            </button>
          ))}
        </div>

        <div className="feature-email__panel">
          {rightPanel === 'inbox' && (
            <div className="feature-email__list">
              {inbox.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`feature-email__list-item ${item.id === selectedInbox?.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedInboxId(item.id)}
                >
                  <div className="feature-email__list-head">
                    <strong>{item.subject}</strong>
                    <span>{formatRelativeTime(item.receivedAt)}</span>
                  </div>
                  <span>{item.from}</span>
                  <p>{item.preview}</p>
                </button>
              ))}
            </div>
          )}

          {rightPanel === 'templates' && (
            <div className="feature-email__stack">
              <div className="feature-email__list">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="feature-email__list-item"
                    onClick={() => applyTemplate(item.id)}
                  >
                    <div className="feature-email__list-head">
                      <strong>{item.name}</strong>
                      <span>{formatRelativeTime(item.updatedAt)}</span>
                    </div>
                    <span>{item.subject || 'No subject'}</span>
                    <p>{item.body.slice(0, 120)}</p>
                  </button>
                ))}
                {templates.length === 0 ? <div className="feature-email__empty">No templates</div> : null}
              </div>
            </div>
          )}

          {rightPanel === 'campaigns' && (
            <div className="feature-email__stack">
              <div className="feature-email__list">
                {campaigns.map((item) => (
                  <div key={item.id} className="feature-email__list-item">
                    <div className="feature-email__list-head">
                      <strong>{item.name}</strong>
                      <span>{formatRelativeTime(item.updatedAt)}</span>
                    </div>
                    <span>{item.subject || 'No subject'}</span>
                    <p>{item.recipientCount} recipients · {item.status}</p>
                  </div>
                ))}
                {campaigns.length === 0 ? <div className="feature-email__empty">No campaigns</div> : null}
              </div>
            </div>
          )}
        </div>

        <div className="feature-email__rail-footer">
          <div className="feature-email__sent-head">
            <strong>Sent</strong>
            <span>{sent.length}</span>
          </div>
          <div className="feature-email__sent-list">
            {sent.slice(0, 4).map((item) => (
              <div key={item.id} className="feature-email__sent-item">
                <strong>{item.subject || 'No subject'}</strong>
                <span>{item.to.join(', ')}</span>
              </div>
            ))}
            {sent.length === 0 ? <div className="feature-email__empty">No sent mail</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
