import { useEffect, useMemo, useState } from 'react';
import {
  LEAD_GEN_DEFAULT_COLUMNS,
  LEAD_GEN_SOURCE_OPTIONS,
  type LeadGenProspect,
  type LeadGenSourceKey,
  useLeadGenStore,
} from '../../stores/leadGenStore';
import { useCrmStore, type CreateLeadInput } from '../../stores/crmStore';
import './LeadGenWorkspace.css';

type LeadGenPanelTab = 'search' | 'details';
type LeadGenColumnKey = (typeof LEAD_GEN_DEFAULT_COLUMNS)[number] | 'industry' | 'summary';

const SHEET_COLUMNS: Array<{ key: LeadGenColumnKey; label: string; width: string }> = [
  { key: 'name', label: 'Lead', width: 'minmax(14rem, 1.25fr)' },
  { key: 'company', label: 'Company', width: 'minmax(11rem, 1fr)' },
  { key: 'role', label: 'Role', width: 'minmax(11rem, 1fr)' },
  { key: 'source', label: 'Source', width: '7rem' },
  { key: 'score', label: 'Score', width: '5rem' },
  { key: 'location', label: 'Location', width: '9rem' },
  { key: 'industry', label: 'Industry', width: '10rem' },
  { key: 'profileUrl', label: 'Profile', width: 'minmax(13rem, 1fr)' },
  { key: 'nextAction', label: 'Next Action', width: 'minmax(14rem, 1.2fr)' },
  { key: 'summary', label: 'Summary', width: 'minmax(16rem, 1.4fr)' },
];

function valueForColumn(prospect: LeadGenProspect, column: LeadGenColumnKey): string {
  if (column === 'score') return String(prospect.score || 0);
  if (column === 'source') return prospect.sourceLabel || prospect.source || '';
  const value = prospect[column];
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}

function truncate(value: string, length = 90): string {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function normalizeWebsite(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function toCrmLead(prospect: LeadGenProspect, batchName: string): CreateLeadInput {
  const tags = Array.from(new Set([
    ...prospect.tags,
    prospect.source,
    batchName ? `Batch: ${batchName}` : '',
  ].filter(Boolean)));
  return {
    name: prospect.name,
    company: prospect.company,
    email: prospect.email,
    website: prospect.profileUrl ? normalizeWebsite(prospect.profileUrl) : '',
    source: prospect.source || 'Lead Gen',
    stage: prospect.score >= 75 ? 'qualified' : 'new',
    status: prospect.score >= 75 ? 'follow-up' : 'active',
    score: prospect.score,
    nextAction: prospect.nextAction || 'Review fit and prepare outreach',
    tags,
    customFields: {
      lead_gen_batch: batchName,
      lead_gen_profile_url: prospect.profileUrl || '',
      lead_gen_location: prospect.location || '',
      lead_gen_industry: prospect.industry || '',
      lead_gen_summary: prospect.summary || '',
      lead_gen_source_key: prospect.sourceKey || '',
      lead_gen_source_label: prospect.sourceLabel || prospect.source || '',
      lead_gen_source_url: prospect.sourceUrl || prospect.profileUrl || '',
      lead_gen_source_query: prospect.sourceQuery || '',
      lead_gen_source_mode: prospect.sourceMode || '',
      lead_gen_source_actor: prospect.sourceActorId || '',
      lead_gen_scraped_at: prospect.scrapedAt || '',
    },
  };
}

function SourceButton(props: {
  source: { key: LeadGenSourceKey; label: string };
  active: boolean;
  onToggle: (source: LeadGenSourceKey) => void;
}) {
  return (
    <button
      type="button"
      className={`feature-leadgen__source ${props.active ? 'is-active' : ''}`}
      onClick={() => props.onToggle(props.source.key)}
    >
      {props.source.label}
    </button>
  );
}

function LeadDetails({ prospect }: { prospect: LeadGenProspect | null }) {
  if (!prospect) {
    return (
      <div className="feature-leadgen__detail-empty">
        <strong>No lead selected</strong>
        <span>Select a row in the sheet to review profile details, signals, and source context.</span>
      </div>
    );
  }

  return (
    <div className="feature-leadgen__details">
      <div className="feature-leadgen__person">
        <span className="feature-leadgen__avatar" style={{ background: prospect.avatarColor || '#254047' }}>
          {prospect.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h3>{prospect.name}</h3>
          <p>{[prospect.role, prospect.company].filter(Boolean).join(' at ') || prospect.source}</p>
        </div>
      </div>

      <div className="feature-leadgen__score-card">
        <span>Lead Score</span>
        <strong>{prospect.score || 0}</strong>
      </div>

      <dl className="feature-leadgen__detail-grid">
        <div><dt>Source</dt><dd>{prospect.sourceLabel || prospect.source || '-'}</dd></div>
        <div><dt>Source Mode</dt><dd>{prospect.sourceMode || '-'}</dd></div>
        <div><dt>Location</dt><dd>{prospect.location || '-'}</dd></div>
        <div><dt>Industry</dt><dd>{prospect.industry || '-'}</dd></div>
        <div><dt>Experience</dt><dd>{prospect.experience || '-'}</dd></div>
        <div className="feature-leadgen__detail-wide"><dt>Profile</dt><dd>{prospect.profileUrl || '-'}</dd></div>
        <div className="feature-leadgen__detail-wide"><dt>Source URL</dt><dd>{prospect.sourceUrl || prospect.profileUrl || '-'}</dd></div>
        <div className="feature-leadgen__detail-wide"><dt>Scraped</dt><dd>{prospect.scrapedAt || '-'}</dd></div>
        <div className="feature-leadgen__detail-wide"><dt>Next Action</dt><dd>{prospect.nextAction || '-'}</dd></div>
      </dl>

      {prospect.summary ? (
        <section className="feature-leadgen__detail-section">
          <h4>Summary</h4>
          <p>{prospect.summary}</p>
        </section>
      ) : null}

      {prospect.signals?.length ? (
        <section className="feature-leadgen__detail-section">
          <h4>Signals</h4>
          <div className="feature-leadgen__signal-list">
            {prospect.signals.map((signal) => (
              <div key={signal.id} className="feature-leadgen__signal">
                <strong>{signal.label}</strong>
                <span>{signal.detail}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {prospect.tags.length ? (
        <section className="feature-leadgen__detail-section">
          <h4>Tags</h4>
          <div className="feature-leadgen__tags">
            {prospect.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function LeadGenWorkspace({ onExit }: { onExit: () => void }) {
  const {
    prospects,
    searchResults,
    selectedResultIds,
    activeResultId,
    searchCriteria,
    catalog,
    usage,
    creditPackages,
    isSearching,
    searchError,
    checkoutMessage,
    checkoutError,
    lastSearchMessage,
    setSearchCriteria,
    setActiveResult,
    toggleResultSelection,
    selectAllResults,
    clearResultSelection,
    clearResults,
    loadCatalog,
    loadCreditPackages,
    startCreditCheckout,
    runSearch,
    addProspectsFromResults,
  } = useLeadGenStore();
  const crmHydrate = useCrmStore((state) => state.hydrate);
  const addCrmLead = useCrmStore((state) => state.addLead);
  const [panelTab, setPanelTab] = useState<LeadGenPanelTab>('search');
  const [batchName, setBatchName] = useState(() => `Lead batch ${new Date().toLocaleDateString()}`);
  const [visibleColumns, setVisibleColumns] = useState<LeadGenColumnKey[]>([...LEAD_GEN_DEFAULT_COLUMNS]);
  const [saveMessage, setSaveMessage] = useState('');
  const [creditsOpen, setCreditsOpen] = useState(false);

  useEffect(() => {
    void crmHydrate();
  }, [crmHydrate]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (creditsOpen && creditPackages.length === 0) {
      void loadCreditPackages();
    }
  }, [creditPackages.length, creditsOpen, loadCreditPackages]);

  const activeResult = useMemo(
    () => searchResults.find((result) => result.id === activeResultId) ?? null,
    [activeResultId, searchResults]
  );

  const selectedResults = useMemo(() => {
    const selected = new Set(selectedResultIds);
    return searchResults.filter((result) => selected.has(result.id));
  }, [searchResults, selectedResultIds]);

  const sheetTemplate = useMemo(() => {
    const columns = SHEET_COLUMNS.filter((column) => visibleColumns.includes(column.key));
    return `2.6rem ${columns.map((column) => column.width).join(' ')}`;
  }, [visibleColumns]);

  const highIntentCount = searchResults.filter((result) => result.score >= 75).length;
  const creditsAvailable = usage?.creditsRemaining ?? catalog?.usage?.creditsRemaining ?? 500;

  function toggleSource(source: LeadGenSourceKey) {
    const current = new Set(searchCriteria.sources);
    if (current.has(source)) current.delete(source);
    else current.add(source);
    setSearchCriteria({ sources: Array.from(current) as LeadGenSourceKey[] });
  }

  function selectEverySource() {
    setSearchCriteria({ sources: LEAD_GEN_SOURCE_OPTIONS.map((source) => source.key) });
  }

  function clearSources() {
    setSearchCriteria({ sources: [] });
  }

  function toggleColumn(column: LeadGenColumnKey) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        return current.length === 1 ? current : current.filter((item) => item !== column);
      }
      return [...current, column];
    });
  }

  async function handleSearch() {
    setSaveMessage('');
    await runSearch();
  }

  function handleOpenResult(result: LeadGenProspect) {
    setActiveResult(result.id);
    setPanelTab('details');
  }

  function handleSaveToCrm(targets: LeadGenProspect[]) {
    const cleanBatchName = batchName.trim() || `Lead batch ${new Date().toLocaleDateString()}`;
    if (targets.length === 0) {
      setSaveMessage('Select at least one lead to save.');
      return;
    }
    const savedLocally = addProspectsFromResults(targets, cleanBatchName);
    let crmCreated = 0;
    targets.forEach((prospect) => {
      const created = addCrmLead(toCrmLead(prospect, cleanBatchName));
      if (created) crmCreated += 1;
    });
    setSaveMessage(`Saved ${crmCreated} to CRM in "${cleanBatchName}". ${savedLocally.length} added to this lead sheet.`);
  }

  async function handleCreditPackage(packageId: string) {
    const response = await startCreditCheckout(packageId);
    if (response?.checkoutUrl) {
      window.location.href = response.checkoutUrl;
      return;
    }
    if (response?.status === 'credited') {
      setCreditsOpen(false);
    }
  }

  return (
    <div className="feature-leadgen">
      <section className="feature-leadgen__sheet-shell">
        <header className="feature-leadgen__sheet-head">
          <div>
            <p className="feature-leadgen__eyebrow">Lead Sheet</p>
            <h2>{searchResults.length ? `${searchResults.length} discovered leads` : 'No active search results'}</h2>
          </div>
          <div className="feature-leadgen__stats">
            <div><span>Selected</span><strong>{selectedResultIds.length}</strong></div>
            <div><span>High Intent</span><strong>{highIntentCount}</strong></div>
            <div><span>Saved</span><strong>{prospects.length}</strong></div>
          </div>
          <div className="feature-leadgen__credits">
            <div>
              <span>Credits Available</span>
              <strong>{creditsAvailable.toLocaleString()}</strong>
            </div>
            <button type="button" onClick={() => setCreditsOpen(true)}>Add credits</button>
          </div>
        </header>

        {creditsOpen ? (
          <div className="feature-leadgen__credit-popover" role="dialog" aria-label="Add lead credits">
            <div className="feature-leadgen__credit-head">
              <div>
                <p className="feature-leadgen__eyebrow">Credits</p>
                <h3>Add search credits</h3>
              </div>
              <button type="button" className="feature-leadgen__quiet" onClick={() => setCreditsOpen(false)}>Close</button>
            </div>
            <div className="feature-leadgen__credit-packages">
              {(creditPackages.length ? creditPackages : catalog?.creditPackages ?? []).map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  className={pkg.highlight ? 'is-highlight' : ''}
                  onClick={() => void handleCreditPackage(pkg.id)}
                >
                  <span>{pkg.label}</span>
                  <strong>{pkg.credits.toLocaleString()}</strong>
                  <small>{pkg.price}</small>
                </button>
              ))}
            </div>
            {(checkoutMessage || checkoutError) ? (
              <p className={`feature-leadgen__credit-note ${checkoutError ? 'is-error' : ''}`}>
                {checkoutError || checkoutMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="feature-leadgen__sheet-toolbar">
          <div className="feature-leadgen__column-menu">
            {SHEET_COLUMNS.map((column) => (
              <button
                key={column.key}
                type="button"
                className={visibleColumns.includes(column.key) ? 'is-active' : ''}
                onClick={() => toggleColumn(column.key)}
              >
                {column.label}
              </button>
            ))}
          </div>
          <div className="feature-leadgen__save-strip">
            <input value={batchName} onChange={(event) => setBatchName(event.target.value)} aria-label="Batch name" />
            <button type="button" onClick={() => handleSaveToCrm(selectedResults)} disabled={selectedResults.length === 0}>Save Selected</button>
            <button type="button" onClick={() => handleSaveToCrm(searchResults)} disabled={searchResults.length === 0}>Save All</button>
            <button type="button" className="feature-leadgen__quiet" onClick={clearResults} disabled={searchResults.length === 0}>Clear</button>
          </div>
        </div>

        {(lastSearchMessage || saveMessage) ? (
          <div className="feature-leadgen__message">
            <span>{saveMessage || lastSearchMessage}</span>
          </div>
        ) : null}

        <div className="feature-leadgen__sheet">
          <div className="feature-leadgen__row feature-leadgen__row--head" style={{ gridTemplateColumns: sheetTemplate }}>
            <button
              type="button"
              className="feature-leadgen__check"
              onClick={selectedResultIds.length === searchResults.length && searchResults.length > 0 ? clearResultSelection : selectAllResults}
              aria-label="Toggle all leads"
            >
              {selectedResultIds.length === searchResults.length && searchResults.length > 0 ? '-' : '+'}
            </button>
            {SHEET_COLUMNS.filter((column) => visibleColumns.includes(column.key)).map((column) => (
              <span key={column.key}>{column.label}</span>
            ))}
          </div>

          {searchResults.length === 0 ? (
            <div className="feature-leadgen__empty">
              <strong>Run a search to build a lead sheet.</strong>
              <span>Select one or more sources, describe the lead profile, then review and save the best rows into CRM as a named batch.</span>
            </div>
          ) : (
            <div className="feature-leadgen__rows">
              {searchResults.map((prospect) => {
                const selected = selectedResultIds.includes(prospect.id);
                return (
                  <div
                    key={prospect.id}
                    className={`feature-leadgen__row ${activeResultId === prospect.id ? 'is-active' : ''}`}
                    style={{ gridTemplateColumns: sheetTemplate }}
                  >
                    <button
                      type="button"
                      className={`feature-leadgen__check ${selected ? 'is-active' : ''}`}
                      onClick={() => toggleResultSelection(prospect.id)}
                      aria-label={`Select ${prospect.name}`}
                    >
                      {selected ? 'x' : ''}
                    </button>
                    {SHEET_COLUMNS.filter((column) => visibleColumns.includes(column.key)).map((column) => {
                      const value = valueForColumn(prospect, column.key);
                      if (column.key === 'name') {
                        return (
                          <button key={column.key} type="button" className="feature-leadgen__lead-link" onClick={() => handleOpenResult(prospect)}>
                            <strong>{prospect.name}</strong>
                            <small>{prospect.email || prospect.profileUrl || prospect.source}</small>
                          </button>
                        );
                      }
                      if (column.key === 'score') {
                        return <span key={column.key} className={`feature-leadgen__score feature-leadgen__score--${prospect.score >= 75 ? 'hot' : prospect.score >= 55 ? 'warm' : 'cold'}`}>{value}</span>;
                      }
                      if (column.key === 'profileUrl' && value) {
                        return <span key={column.key} title={value}>{truncate(value, 52)}</span>;
                      }
                      return <span key={column.key} title={value}>{truncate(value)}</span>;
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="feature-leadgen__rail">
        <header className="feature-leadgen__rail-head">
          <div>
            <p className="feature-leadgen__eyebrow">Lead Gen</p>
            <h2>Prospect Search</h2>
          </div>
          <button type="button" className="feature-leadgen__quiet" onClick={onExit}>Close</button>
        </header>

        <div className="feature-leadgen__tabs">
          <button type="button" className={panelTab === 'search' ? 'is-active' : ''} onClick={() => setPanelTab('search')}>Search</button>
          <button type="button" className={panelTab === 'details' ? 'is-active' : ''} onClick={() => setPanelTab('details')}>Details</button>
        </div>

        {panelTab === 'search' ? (
          <div className="feature-leadgen__rail-body">
            <label className="feature-leadgen__field">
              <span>Search brief</span>
              <textarea
                value={searchCriteria.request}
                onChange={(event) => setSearchCriteria({ request: event.target.value })}
                placeholder="Example: boutique fitness studios that need better local marketing"
                rows={5}
              />
            </label>

            <div className="feature-leadgen__source-head">
              <span>Sources</span>
              <div>
                <button type="button" onClick={selectEverySource}>All</button>
                <button type="button" onClick={clearSources}>None</button>
              </div>
            </div>
            <div className="feature-leadgen__sources">
              {LEAD_GEN_SOURCE_OPTIONS.map((source) => (
                <SourceButton
                  key={source.key}
                  source={source}
                  active={searchCriteria.sources.includes(source.key)}
                  onToggle={toggleSource}
                />
              ))}
            </div>

            <label className="feature-leadgen__field">
              <span>Geography</span>
              <input value={searchCriteria.geography} onChange={(event) => setSearchCriteria({ geography: event.target.value })} placeholder="Austin, national, remote, etc." />
            </label>
            <label className="feature-leadgen__field">
              <span>Include</span>
              <input value={searchCriteria.includeKeywords} onChange={(event) => setSearchCriteria({ includeKeywords: event.target.value })} placeholder="keywords, niches, buying signals" />
            </label>
            <label className="feature-leadgen__field">
              <span>Exclude</span>
              <input value={searchCriteria.excludeKeywords} onChange={(event) => setSearchCriteria({ excludeKeywords: event.target.value })} placeholder="agencies, franchises, jobs" />
            </label>
            <label className="feature-leadgen__field">
              <span>URL / handles</span>
              <textarea
                value={searchCriteria.directUrls}
                onChange={(event) => setSearchCriteria({ directUrls: event.target.value })}
                placeholder="Paste one URL, profile, company, channel, or listing per line"
                rows={3}
              />
            </label>
            <button type="button" className="feature-leadgen__primary" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Run Search'}
            </button>
            {searchError ? <p className="feature-leadgen__error">{searchError}</p> : null}
          </div>
        ) : (
          <div className="feature-leadgen__rail-body">
            <LeadDetails prospect={activeResult} />
          </div>
        )}
      </aside>
    </div>
  );
}
