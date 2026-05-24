import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CRM_MAX_IMPORT_BYTES,
  CRM_MAX_IMPORT_ROWS,
  CRM_IMPORTABLE_FIELDS,
  CRM_STAGE_OPTIONS,
  CRM_STATUS_OPTIONS,
  CRM_VIEW_PRESETS,
  buildCrmCsv,
  getDefaultCrmImportMappings,
  getCrmSourceOptions,
  parseCrmCsv,
  useCrmStore,
  type CreateLeadInput,
  type CrmImportMapping,
  type CrmImportTarget,
  type CrmLead,
  type CrmLeadStage,
  type CrmLeadStatus,
  type CrmViewPreset,
} from '../../stores/crmStore';
import { useEmailStore } from '../../stores/emailStore';
import { useFeatureStore } from '../../stores/featureStore';
import './CrmWorkspace.css';

const EMPTY_LEAD_DRAFT: CreateLeadInput = {
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  owner: '',
  source: 'Website',
  stage: 'new',
  status: 'active',
  score: 50,
  nextAction: '',
  lastContactAt: '',
  tags: [],
};

function getLeadFieldValue(lead: CrmLead, key: string): string | number {
  if (key in lead) {
    const value = lead[key as keyof CrmLead];
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value;
  }

  return lead.customFields[key] ?? '';
}

function formatColumnValue(lead: CrmLead, key: string): string {
  const value = getLeadFieldValue(lead, key);
  if (typeof value === 'number') return String(value);
  if (key === 'updatedAt' && value) return new Date(value).toLocaleDateString();
  return value || '—';
}

function formatDateLabel(value: string): string {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function compareLeads(left: CrmLead, right: CrmLead, sortKey: string, direction: 'asc' | 'desc'): number {
  const leftValue = getLeadFieldValue(left, sortKey);
  const rightValue = getLeadFieldValue(right, sortKey);
  const order = direction === 'asc' ? 1 : -1;

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return (leftValue - rightValue) * order;
  }

  return String(leftValue).localeCompare(String(rightValue)) * order;
}

function matchesPreset(lead: CrmLead, preset: CrmViewPreset): boolean {
  switch (preset) {
    case 'hot':
      return lead.score >= 80 && lead.status !== 'closed';
    case 'follow-up':
      return lead.status === 'follow-up' || lead.nextAction.length > 0;
    case 'pipeline':
      return !['won', 'lost'].includes(lead.stage);
    case 'closed':
      return lead.status === 'closed' || ['won', 'lost'].includes(lead.stage);
    case 'all':
    default:
      return true;
  }
}

interface CrmWorkspaceProps {
  onExit: () => void;
}

export function CrmWorkspace({ onExit }: CrmWorkspaceProps) {
  const openFeature = useFeatureStore((state) => state.openFeature);
  const composeForRecipients = useEmailStore((state) => state.composeForRecipients);
  const {
    columns,
    leads,
    searchQuery,
    stageFilter,
    statusFilter,
    sourceFilter,
    viewPreset,
    density,
    sortKey,
    sortDirection,
    detailLeadId,
    hydrationStatus,
    hydrationError,
    hydrate,
    setSearchQuery,
    setStageFilter,
    setStatusFilter,
    setSourceFilter,
    setViewPreset,
    setDensity,
    setSort,
    toggleColumnVisibility,
    addCustomColumn,
    addLead,
    updateLead,
    updateLeadCustomField,
    addLeadNote,
    deleteLead,
    openLead,
    closeLead,
    importMappedCsv,
  } = useCrmStore();

  const [leadDraft, setLeadDraft] = useState<CreateLeadInput>(EMPTY_LEAD_DRAFT);
  const [leadFormError, setLeadFormError] = useState('');
  const [customColumnLabel, setCustomColumnLabel] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [deleteConfirmLeadId, setDeleteConfirmLeadId] = useState<string | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportName, setCsvImportName] = useState('');
  const [csvImportContent, setCsvImportContent] = useState('');
  const [csvImportHeaders, setCsvImportHeaders] = useState<string[]>([]);
  const [csvImportRows, setCsvImportRows] = useState<string[][]>([]);
  const [csvImportMappings, setCsvImportMappings] = useState<CrmImportMapping[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const bulkUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const sourceOptions = useMemo(() => getCrmSourceOptions(leads), [leads]);
  const customColumns = useMemo(() => columns.filter((column) => column.kind === 'custom'), [columns]);
  const importTargetOptions = useMemo(
    () => [
      { value: '__ignore__' as CrmImportTarget, label: 'Ignore column' },
      ...CRM_IMPORTABLE_FIELDS.map((field) => ({ value: field.key as CrmImportTarget, label: field.label })),
      { value: 'custom:new', label: 'Create custom field from header' },
      ...customColumns.map((column) => ({ value: `custom:${column.label}` as CrmImportTarget, label: `Custom: ${column.label}` })),
    ],
    [customColumns]
  );

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...leads]
      .filter((lead) => matchesPreset(lead, viewPreset))
      .filter((lead) => (stageFilter === 'all' ? true : lead.stage === stageFilter))
      .filter((lead) => (statusFilter === 'all' ? true : lead.status === statusFilter))
      .filter((lead) => (sourceFilter === 'all' ? true : lead.source === sourceFilter))
      .filter((lead) => {
        if (!query) return true;

        return [
          lead.name,
          lead.company,
          lead.email,
          lead.phone,
          lead.address,
          lead.owner,
          lead.source,
          lead.tags.join(' '),
          ...Object.values(lead.customFields),
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => compareLeads(left, right, sortKey, sortDirection));
  }, [leads, searchQuery, sourceFilter, sortDirection, sortKey, stageFilter, statusFilter, viewPreset]);

  const selectedLead = leads.find((lead) => lead.id === detailLeadId) ?? null;
  const selectedLeads = useMemo(
    () => filteredLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [filteredLeads, selectedLeadIds]
  );

  useEffect(() => {
    setDeleteConfirmLeadId(null);
  }, [selectedLead?.id]);

  useEffect(() => {
    setSelectedLeadIds((current) => current.filter((leadId) => leads.some((lead) => lead.id === leadId)));
  }, [leads]);

  const totalLeads = leads.length;
  const hotCount = leads.filter((lead) => lead.score >= 80 && lead.status !== 'closed').length;
  const followUpCount = leads.filter((lead) => lead.status === 'follow-up').length;
  const closedCount = leads.filter((lead) => lead.status === 'closed' || ['won', 'lost'].includes(lead.stage)).length;

  function updateDraftField<Key extends keyof CreateLeadInput>(key: Key, value: CreateLeadInput[Key]) {
    setLeadDraft((current) => ({ ...current, [key]: value }));
  }

  function handleCreateLead() {
    if (!leadDraft.name?.trim()) {
      setLeadFormError('Lead name is required.');
      return;
    }

    const createdLead = addLead({
      ...leadDraft,
      tags: leadDraft.tags,
      score: Number(leadDraft.score ?? 0),
    });
    if (!createdLead) {
      setLeadFormError('A lead with the same email, phone, or name already exists.');
      return;
    }

    setLeadFormError('');
    setImportMessage(`Created lead ${createdLead.name}.`);
    setLeadDraft(EMPTY_LEAD_DRAFT);
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    if (file.size > CRM_MAX_IMPORT_BYTES) {
      setImportMessage(`CSV is too large. Upload a file under ${Math.round(CRM_MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    const content = await file.text();
    const parsed = parseCrmCsv(content);

    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setImportMessage(`No leads were found in ${file.name}.`);
      return;
    }

    setCsvImportName(file.name);
    setCsvImportContent(content);
    setCsvImportHeaders(parsed.headers);
    setCsvImportRows(parsed.rows.slice(0, 4));
    setCsvImportMappings(getDefaultCrmImportMappings(parsed.headers));
    setImportMessage(parsed.rows.length > CRM_MAX_IMPORT_ROWS ? `Only the first ${CRM_MAX_IMPORT_ROWS} rows will be imported from ${file.name}.` : '');
    setCsvImportOpen(true);
  }

  function handleAddCustomColumn() {
    if (!customColumnLabel.trim()) return;
    addCustomColumn(customColumnLabel);
    setCustomColumnLabel('');
  }

  function handleAddNote() {
    if (!selectedLead || !noteDraft.trim()) return;
    addLeadNote(selectedLead.id, noteDraft);
    setNoteDraft('');
  }

  function handleImportMappingChange(header: string, target: string) {
    setCsvImportMappings((current) =>
      current.map((mapping) =>
        mapping.header === header
          ? {
              ...mapping,
              target: target === 'custom:new' ? (`custom:${header}` as CrmImportTarget) : (target as CrmImportTarget),
            }
          : mapping
      )
    );
  }

  function handleConfirmImport() {
    const result = importMappedCsv(csvImportContent, csvImportMappings);
    const skippedParts = [
      result.skippedDuplicateCount > 0 ? `${result.skippedDuplicateCount} duplicates skipped` : '',
      result.skippedInvalidCount > 0 ? `${result.skippedInvalidCount} invalid rows skipped` : '',
      result.skippedLimitCount > 0 ? `${result.skippedLimitCount} rows over the import limit skipped` : '',
    ].filter(Boolean);
    setImportMessage(
      result.importedCount > 0
        ? `Imported ${result.importedCount} leads from ${csvImportName}.${skippedParts.length ? ` ${skippedParts.join(', ')}.` : ''}`
        : `No leads were imported from ${csvImportName}.${skippedParts.length ? ` ${skippedParts.join(', ')}.` : ''}`
    );
    setCsvImportOpen(false);
    setCsvImportName('');
    setCsvImportContent('');
    setCsvImportHeaders([]);
    setCsvImportRows([]);
    setCsvImportMappings([]);
  }

  function handleExportCsv() {
    const csv = buildCrmCsv(filteredLeads, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setImportMessage(`Exported ${filteredLeads.length} leads.`);
  }

  function handleDeleteSelectedLead() {
    if (!selectedLead) return;
    if (deleteConfirmLeadId !== selectedLead.id) {
      setDeleteConfirmLeadId(selectedLead.id);
      return;
    }
    deleteLead(selectedLead.id);
    setDeleteConfirmLeadId(null);
    setImportMessage(`Deleted lead ${selectedLead.name}.`);
  }

  function handleToggleLeadSelection(leadId: string, checked: boolean) {
    setSelectedLeadIds((current) => checked ? Array.from(new Set([...current, leadId])) : current.filter((id) => id !== leadId));
  }

  function handleSelectAllVisible(checked: boolean) {
    setSelectedLeadIds(checked ? filteredLeads.map((lead) => lead.id) : []);
  }

  function handleComposeLeads(targetLeads: CrmLead[]) {
    const recipients = targetLeads
      .filter((lead) => lead.email.trim())
      .map((lead) => ({ email: lead.email, name: lead.name, leadId: lead.id }));
    if (!recipients.length) {
      setImportMessage('Selected leads need email addresses first.');
      return;
    }
    composeForRecipients(recipients, targetLeads.length === 1 ? `Hi ${targetLeads[0].name}` : '');
    openFeature('email');
  }

  const statusMessage = hydrationStatus === 'loading'
    ? 'Loading saved CRM data...'
    : hydrationStatus === 'error'
      ? `CRM is using local cache. ${hydrationError ?? ''}`
      : importMessage;

  return (
    <div className="feature-crm">
      <section className="feature-crm__table-shell">
        <header className="feature-crm__header">
          <div className="feature-crm__header-actions">
            <button type="button" className="feature-crm__back" onClick={onExit}>
              Back to workspace
            </button>
            <button
              type="button"
              className="feature-crm__bulk-button"
              onClick={() => handleComposeLeads(selectedLeads)}
              disabled={selectedLeads.length === 0}
            >
              Email selected
            </button>
            <button type="button" className="feature-crm__bulk-button" onClick={() => bulkUploadRef.current?.click()}>
              Bulk leads
            </button>
            <button type="button" className="feature-crm__bulk-button" onClick={handleExportCsv} disabled={filteredLeads.length === 0}>
              Export CSV
            </button>
            <input
              ref={bulkUploadRef}
              type="file"
              className="feature-crm__hidden-upload"
              accept=".csv,text/csv"
              aria-label="Bulk lead CSV upload"
              title="Bulk lead CSV upload"
              onChange={(event) => {
                void handleImportFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />
            {statusMessage ? <p className="feature-crm__header-message">{statusMessage}</p> : null}
          </div>
          <div className="feature-crm__stats">
            <div>
              <span>Total</span>
              <strong>{totalLeads}</strong>
            </div>
            <div>
              <span>Hot</span>
              <strong>{hotCount}</strong>
            </div>
            <div>
              <span>Follow-up</span>
              <strong>{followUpCount}</strong>
            </div>
            <div>
              <span>Closed</span>
              <strong>{closedCount}</strong>
            </div>
          </div>
        </header>

        <div className="feature-crm__table-wrap">
          <table className={`feature-crm__table feature-crm__table--${density}`}>
            <thead>
              <tr>
                <th className="feature-crm__check-column">
                  <label className="feature-crm__check-head">
                    <input
                      type="checkbox"
                      checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                      onChange={(event) => handleSelectAllVisible(event.target.checked)}
                    />
                  </label>
                </th>
                {visibleColumns.map((column) => (
                  <th key={column.key}>
                    <button type="button" className="feature-crm__sort" onClick={() => setSort(column.key)}>
                      <span>{column.label}</span>
                      <small>{sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</small>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className={lead.id === detailLeadId ? 'is-active' : ''}>
                  <td className="feature-crm__check-column">
                    <label className="feature-crm__check-head">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={(event) => handleToggleLeadSelection(lead.id, event.target.checked)}
                      />
                    </label>
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column.key}>
                      {column.key === 'name' ? (
                        <div className="feature-crm__lead-cell">
                          <button type="button" className="feature-crm__lead-trigger" onClick={() => openLead(lead.id)}>
                            <span>{lead.name}</span>
                            <small>{lead.company || lead.source}</small>
                          </button>
                          <button
                            type="button"
                            className="feature-crm__mail-action"
                            onClick={() => handleComposeLeads([lead])}
                            title="Send email"
                            aria-label={`Send email to ${lead.name}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h12A2.25 2.25 0 0 1 20.25 6.75v10.5A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z" />
                              <path d="m4.5 7.5 7.5 6 7.5-6" />
                            </svg>
                          </button>
                        </div>
                      ) : column.key === 'stage' ? (
                        <span className={`feature-crm__badge is-${lead.stage}`}>{lead.stage}</span>
                      ) : column.key === 'status' ? (
                        <span className={`feature-crm__status is-${lead.status}`}>{lead.status}</span>
                      ) : (
                        <span className="feature-crm__cell">{formatColumnValue(lead, column.key)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLeads.length === 0 ? (
            <div className="feature-crm__empty">
              <h3>{totalLeads === 0 ? 'No leads yet' : 'No leads match this view'}</h3>
              <p>{totalLeads === 0 ? 'Import a CSV or add a verified lead manually.' : 'Adjust the filters on the right, import a CSV, or add a lead manually.'}</p>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="feature-crm__rail">
        <section className="feature-crm__panel">
          <div className="feature-crm__panel-head">
            <h3>View controls</h3>
            <span>{filteredLeads.length} shown</span>
          </div>
          <label className="feature-crm__field">
            <span>Search</span>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, company, phone, tags" />
          </label>
          <div className="feature-crm__preset-strip">
            {CRM_VIEW_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={viewPreset === preset ? 'is-active' : ''}
                onClick={() => setViewPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="feature-crm__field-grid">
            <label className="feature-crm__field">
              <span>Stage</span>
              <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as CrmLeadStage | 'all')}>
                <option value="all">All stages</option>
                {CRM_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-crm__field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CrmLeadStatus | 'all')}>
                <option value="all">All statuses</option>
                {CRM_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-crm__field">
              <span>Source</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All sources</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-crm__field">
              <span>Row density</span>
              <select value={density} onChange={(event) => setDensity(event.target.value as 'compact' | 'cozy')}>
                <option value="compact">Compact</option>
                <option value="cozy">Cozy</option>
              </select>
            </label>
          </div>
        </section>

        <section className="feature-crm__panel">
          <div className="feature-crm__panel-head">
            <h3>Visible columns</h3>
            <span>{visibleColumns.length} active</span>
          </div>
          <div className="feature-crm__column-list">
            {columns.map((column) => (
              <label key={column.key} className="feature-crm__toggle">
                <input type="checkbox" checked={column.visible} onChange={() => toggleColumnVisibility(column.key)} />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
          <div className="feature-crm__inline-field">
            <input
              value={customColumnLabel}
              onChange={(event) => setCustomColumnLabel(event.target.value)}
              placeholder="New custom column"
              title="New custom column"
              aria-label="New custom column"
            />
            <button type="button" onClick={handleAddCustomColumn}>
              Add
            </button>
          </div>
          {customColumns.length > 0 ? (
            <p className="feature-crm__helper">Custom fields stay available in the lead drawer and import automatically from matching CSV headers.</p>
          ) : null}
        </section>

        <section className="feature-crm__panel">
          <div className="feature-crm__panel-head">
            <h3>Add lead</h3>
            <span>Single entry</span>
          </div>
          <div className="feature-crm__field-grid">
            <label className="feature-crm__field">
              <span>Name</span>
              <input value={leadDraft.name ?? ''} onChange={(event) => updateDraftField('name', event.target.value)} placeholder="Lead name" />
            </label>
            <label className="feature-crm__field">
              <span>Company</span>
              <input value={leadDraft.company ?? ''} onChange={(event) => updateDraftField('company', event.target.value)} placeholder="Company" />
            </label>
            <label className="feature-crm__field">
              <span>Email</span>
              <input value={leadDraft.email ?? ''} onChange={(event) => updateDraftField('email', event.target.value)} placeholder="Email" />
            </label>
            <label className="feature-crm__field">
              <span>Phone</span>
              <input value={leadDraft.phone ?? ''} onChange={(event) => updateDraftField('phone', event.target.value)} placeholder="Phone" />
            </label>
            <label className="feature-crm__field feature-crm__field--wide">
              <span>Address</span>
              <input value={leadDraft.address ?? ''} onChange={(event) => updateDraftField('address', event.target.value)} placeholder="Address" />
            </label>
            <label className="feature-crm__field">
              <span>Owner</span>
              <input value={leadDraft.owner ?? ''} onChange={(event) => updateDraftField('owner', event.target.value)} placeholder="Owner" />
            </label>
            <label className="feature-crm__field">
              <span>Source</span>
              <input value={leadDraft.source ?? ''} onChange={(event) => updateDraftField('source', event.target.value)} placeholder="Source" />
            </label>
            <label className="feature-crm__field">
              <span>Stage</span>
              <select value={leadDraft.stage} onChange={(event) => updateDraftField('stage', event.target.value as CrmLeadStage)}>
                {CRM_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-crm__field">
              <span>Status</span>
              <select value={leadDraft.status} onChange={(event) => updateDraftField('status', event.target.value as CrmLeadStatus)}>
                {CRM_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="feature-crm__field">
              <span>Score</span>
              <input
                type="number"
                min={0}
                max={100}
                value={leadDraft.score ?? 0}
                onChange={(event) => updateDraftField('score', Number(event.target.value))}
              />
            </label>
            <label className="feature-crm__field feature-crm__field--wide">
              <span>Next action</span>
              <input value={leadDraft.nextAction ?? ''} onChange={(event) => updateDraftField('nextAction', event.target.value)} placeholder="Next step" />
            </label>
          </div>
          <button type="button" className="feature-crm__primary" onClick={handleCreateLead}>
            Create lead
          </button>
          {leadFormError ? <p className="feature-crm__form-error">{leadFormError}</p> : null}
        </section>

      </aside>

      {csvImportOpen ? (
        <>
          <button type="button" className="feature-crm__drawer-backdrop" onClick={() => setCsvImportOpen(false)} aria-label="Close bulk import" />
          <aside className="feature-crm__import-modal">
            <div className="feature-crm__drawer-head">
              <div>
                <h3>Map bulk lead columns</h3>
                <p className="feature-crm__helper">Review {csvImportName} and match each uploaded column before import.</p>
              </div>
              <button type="button" className="feature-crm__close" onClick={() => setCsvImportOpen(false)}>
                Close
              </button>
            </div>

            <div className="feature-crm__mapping-list">
              {csvImportHeaders.map((header, index) => (
                <div key={header} className="feature-crm__mapping-row">
                  <div className="feature-crm__mapping-meta">
                    <strong>{header}</strong>
                    <span>{csvImportRows[0]?.[index] || 'No sample value'}</span>
                  </div>
                  <select
                    value={csvImportMappings.find((mapping) => mapping.header === header)?.target ?? '__ignore__'}
                    onChange={(event) => handleImportMappingChange(header, event.target.value)}
                    title={`Import mapping for ${header}`}
                    aria-label={`Import mapping for ${header}`}
                  >
                    {importTargetOptions.map((option) => (
                      <option key={`${header}_${option.value}`} value={option.value}>
                        {option.value === 'custom:new' ? `Custom: ${header}` : option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="feature-crm__import-preview">
              <div className="feature-crm__panel-head">
                <h4>Preview</h4>
                <span>{csvImportRows.length} sample rows</span>
              </div>
              <div className="feature-crm__preview-table-wrap">
                <table className="feature-crm__preview-table">
                  <thead>
                    <tr>
                      {csvImportHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvImportRows.map((row, rowIndex) => (
                      <tr key={`preview_${rowIndex}`}>
                        {csvImportHeaders.map((header, columnIndex) => (
                          <td key={`${header}_${rowIndex}`}>{row[columnIndex] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="feature-crm__import-actions">
              <button type="button" className="feature-crm__close" onClick={() => setCsvImportOpen(false)}>
                Cancel
              </button>
              <button type="button" className="feature-crm__primary feature-crm__primary--auto" onClick={handleConfirmImport}>
                Import leads
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {selectedLead ? (
        <>
          <button type="button" className="feature-crm__drawer-backdrop" onClick={closeLead} aria-label="Close lead details" />
          <aside className="feature-crm__drawer">
            <div className="feature-crm__drawer-head">
              <div>
                <p className="feature-crm__eyebrow">Lead detail</p>
                <h3>{selectedLead.name}</h3>
              </div>
              <button type="button" className="feature-crm__close" onClick={closeLead}>
                Close
              </button>
            </div>
            <div className="feature-crm__drawer-actions">
              <button type="button" className="feature-crm__bulk-button" onClick={() => handleComposeLeads([selectedLead])}>
                Email lead
              </button>
              <button type="button" className="feature-crm__danger" onClick={handleDeleteSelectedLead}>
                {deleteConfirmLeadId === selectedLead.id ? 'Confirm delete' : 'Delete lead'}
              </button>
            </div>

            <div className="feature-crm__drawer-meta">
              <span className={`feature-crm__badge is-${selectedLead.stage}`}>{selectedLead.stage}</span>
              <span className={`feature-crm__status is-${selectedLead.status}`}>{selectedLead.status}</span>
              <strong>{selectedLead.score}</strong>
            </div>

            <div className="feature-crm__detail-grid">
              <label className="feature-crm__field">
                <span>Name</span>
                <input value={selectedLead.name} onChange={(event) => updateLead(selectedLead.id, { name: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Company</span>
                <input value={selectedLead.company} onChange={(event) => updateLead(selectedLead.id, { company: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Email</span>
                <input value={selectedLead.email} onChange={(event) => updateLead(selectedLead.id, { email: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Phone</span>
                <input value={selectedLead.phone} onChange={(event) => updateLead(selectedLead.id, { phone: event.target.value })} />
              </label>
              <label className="feature-crm__field feature-crm__field--wide">
                <span>Address</span>
                <input value={selectedLead.address} onChange={(event) => updateLead(selectedLead.id, { address: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Website</span>
                <input value={selectedLead.website} onChange={(event) => updateLead(selectedLead.id, { website: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Owner</span>
                <input value={selectedLead.owner} onChange={(event) => updateLead(selectedLead.id, { owner: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Source</span>
                <input value={selectedLead.source} onChange={(event) => updateLead(selectedLead.id, { source: event.target.value })} />
              </label>
              <label className="feature-crm__field">
                <span>Stage</span>
                <select value={selectedLead.stage} onChange={(event) => updateLead(selectedLead.id, { stage: event.target.value as CrmLeadStage })}>
                  {CRM_STAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feature-crm__field">
                <span>Status</span>
                <select value={selectedLead.status} onChange={(event) => updateLead(selectedLead.id, { status: event.target.value as CrmLeadStatus })}>
                  {CRM_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feature-crm__field">
                <span>Score</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedLead.score}
                  onChange={(event) => updateLead(selectedLead.id, { score: Number(event.target.value) })}
                />
              </label>
              <label className="feature-crm__field">
                <span>Last contact</span>
                <input
                  type="date"
                  value={selectedLead.lastContactAt}
                  onChange={(event) => updateLead(selectedLead.id, { lastContactAt: event.target.value })}
                />
              </label>
              <label className="feature-crm__field feature-crm__field--wide">
                <span>Next action</span>
                <input value={selectedLead.nextAction} onChange={(event) => updateLead(selectedLead.id, { nextAction: event.target.value })} />
              </label>
              <label className="feature-crm__field feature-crm__field--wide">
                <span>Tags</span>
                <input
                  value={selectedLead.tags.join(', ')}
                  onChange={(event) =>
                    updateLead(selectedLead.id, {
                      tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                    })
                  }
                />
              </label>
            </div>

            {customColumns.length > 0 ? (
              <section className="feature-crm__drawer-section">
                <div className="feature-crm__panel-head">
                  <h4>Custom fields</h4>
                  <span>{customColumns.length}</span>
                </div>
                <div className="feature-crm__detail-grid">
                  {customColumns.map((column) => (
                    <label key={column.key} className="feature-crm__field">
                      <span>{column.label}</span>
                      <input
                        value={selectedLead.customFields[column.key] ?? ''}
                        onChange={(event) => updateLeadCustomField(selectedLead.id, column.key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="feature-crm__drawer-section">
              <div className="feature-crm__panel-head">
                <h4>Notes</h4>
                <span>{selectedLead.notes.length}</span>
              </div>
              <div className="feature-crm__note-entry">
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add note" rows={3} />
                <button type="button" className="feature-crm__primary feature-crm__primary--auto" onClick={handleAddNote}>
                  Save note
                </button>
              </div>
              <div className="feature-crm__note-list">
                {selectedLead.notes.map((note) => (
                  <article key={note.id} className="feature-crm__note-card">
                    <p>{note.body}</p>
                    <span>{formatDateLabel(note.createdAt)}</span>
                  </article>
                ))}
                {selectedLead.notes.length === 0 ? <p className="feature-crm__helper">No notes yet.</p> : null}
              </div>
            </section>
          </aside>
        </>
      ) : null}
    </div>
  );
}
