# Deep Canvas Feature Production Plan

## Current Feature Gaps

- Build Studio is the strongest feature today. It has real backend support, Open Design routing, projects, preview, templates, media categories, and downloads. It still needs QA across artifact types.
- Storage has real backend support for files, folders, categories, blobs, and Google Drive/OneDrive device auth. It needs OAuth edge-case testing and production file handling polish.
- Social Station has real backend support for posts, media, RSS, platform settings, and Upload-Post. The UX needs simplification.
- Larry automation has real backend support for LLM planning, image generation, posting, reports, and chat. It needs to be merged cleanly into the Social Station product flow.
- Project Flow has URL/GitHub ingest, AI nodes, media generation, transcription, and workflow runners. It is powerful but still too technical for beginner users.
- Video Meeting is functional through Jitsi and has persisted settings. It needs production invite/share/calendar polish.
- CRM has a strong frontend experience with CSV import/export, notes, custom fields, filtering, batch views, and email handoff. It uses the PI state mirror for backend persistence and now needs deeper campaign/audience integration with Email.
- Kanban is a solid frontend board with local persistence and generic state mirroring. It needs dedicated backend persistence and agent/task integration.
- Lead Gen now has a rebuilt production-oriented UI connected to `lead_gen.search`: right-side search rail, source selection, parameter controls, sheet-style results, row selection, details tab, configurable columns, and named batch save into CRM.
- Email has backend support for Plunk, sending, templates, campaigns, sync, and domains, but the active UI is mostly an embedded Plunk iframe instead of a native Deep Canvas email workspace.

## Production Priorities

1. Finish the business workflow: Lead Gen -> CRM -> Email.
2. QA Lead Gen with real Apify credentials and missing-key states.
3. Replace the Email iframe with a native workspace that uses the existing email backend.
4. Give CRM, Lead Gen, Kanban, and Project Flow proper backend persistence where needed.
5. Simplify Project Flow and Social Station so advanced controls do not overwhelm beginners.
6. QA Build Studio across prototypes, live dashboards, decks, images, video, HyperFrames, and marketing artifacts.
7. Replace remaining browser prompts/confirms with proper in-app modals.

## Lead Gen Recovery Plan

### Goal

Recover or rebuild the newer Lead Gen experience, then connect it to the existing backend search workflow, CRM, and Email.

### Current Finding

- Active frontend files are:
  - `jiuwenclaw/web/src/components/FeatureWorkspace/LeadGenWorkspace.tsx`
  - `jiuwenclaw/web/src/components/FeatureWorkspace/LeadGenWorkspace.css`
  - `jiuwenclaw/web/src/stores/leadGenStore.ts`
- Those files were the old manual prospecting UI and have now been replaced.
- The active backend has `lead_gen.search`, which uses Apify/Instagram and Apify RAG web search.
- Git is not installed on this PC, but direct GitHub checks showed only two branches: `main` and `deepcanvas-export-2026-06-16`.
- Both remote branches contained the same old Lead Gen UI before this rebuild.

### Completed

- Rebuilt Lead Gen into a two-pane production layout.
- Added source selection for Instagram, Facebook, TikTok, LinkedIn, Web, Maps, Reddit, X, and YouTube.
- Wired the UI to `lead_gen.search`, `lead_gen.catalog`, and `lead_gen.usage`.
- Added persistent search result state separate from saved prospects.
- Added sheet-style rows with selectable leads.
- Added configurable sheet columns.
- Added details tab for the selected lead.
- Added save selected/save all into CRM with a named batch.
- Preserved source URL, location, industry, summary, tags, score, and signals where returned by the backend.
- Added basic dedupe through Lead Gen fingerprints and existing CRM duplicate handling.
- Added an Apify MCP source registry with default native actors for Instagram, Facebook search, TikTok, LinkedIn company enrichment, Google Maps, Reddit, X/Twitter, and YouTube, plus RAG browser fallback.
- Added backend source capability metadata so the UI can show provider readiness without exposing raw scraper complexity.
- Added advanced search inputs for direct URLs/handles, result type, community, and max posts.
- Added app-credit metering hooks. Local/dev defaults to preview mode; hosted SaaS billing can enable `LEAD_GEN_CREDITS_ENABLED`, default balances, and per-search credit pricing.
- Saved the Apify organization key into the active app env as `APIFY_API_KEY`.
- Live-tested Apify authentication, MCP actor tool loading, and an Instagram direct-profile scrape.
- Fixed MCP dataset handling: Actor runs return dataset IDs through MCP, then the adapter fetches structured dataset items through Apify REST before normalizing leads.
- Added customer-facing credit packages and checkout RPC hooks: `lead_gen.credit_packages` and `lead_gen.checkout`.
- Moved credits into the Lead Sheet header and added an Add Credits package modal.
- Added URL scraping as a first-class source with direct URL fallback fetching.
- Added real estate source buttons and filters for Zillow, Realtor, Redfin, and LoopNet.
- Added source provenance to every Lead Gen result: source key, label, query, URL, scraper mode, actor id, and scraped timestamp.
- Carried source provenance through the frontend store, lead details panel, sheet source column, and CRM custom fields.
- Simplified the Lead Gen search rail to hide technical scraper controls. Users now see brief, sources, geography, include/exclude terms, optional URLs/handles, and credits.
- Fixed URL source behavior so pasted URLs are scraped directly first instead of being treated as general web search hints.

### Next Lead Gen Work

- QA every native actor input with real Apify runs and adjust per-actor payloads if any Store actor changes its schema. Instagram direct-profile is confirmed working.
- Decide hosted credit packages and monthly replenishment rules, then connect `lead_gen.usage` to the real user/account billing table instead of the local JSON ledger.
- Connect `LEAD_GEN_CREDITS_CHECKOUT_URL` to Stripe or the final checkout provider. Until then, the Add Credits modal shows packages and reports checkout not configured.
- QA Zillow, Realtor, Redfin, and LoopNet searches with realistic customer prompts and decide which real-estate sources need native paid Actors instead of web/RAG fallback.
- Add a first-class CRM batch object if we want batch-level management instead of tags/custom fields.
- Add export/download for the active lead sheet.
- Add tests for search normalization, result selection, and CRM save mapping.
- Connect saved batches into Email campaign audience creation.

## CRM Production Pass

### Completed

- CRM now preserves a saved Lead Gen batch filter in local cache and PI mirrored state.
- Leads saved from Lead Gen automatically create matching CRM custom-field columns for batch/source provenance instead of hiding those fields.
- Source and score are visible by default for new CRM tables.
- Added Lead Gen batch filtering in CRM view controls.
- Added a Lead Gen batches panel with batch counts, hot-lead counts, and follow-up counts.
- CRM custom fields use exact saved field keys, so Lead Gen provenance fields remain editable and exportable.
- CSV imports now require/support a named batch before import.
- Users can assign selected leads to a new or existing batch.
- Users can rename an existing batch across all leads in that batch.
- Users can remove a batch label without deleting the underlying leads.

### Next CRM Work

- Add a true backend batch object if we want richer metadata such as batch owner, notes, archive status, and import source history.
- Add bulk stage/status actions for selected leads.
- Connect CRM batch selection directly into Email campaign audience creation.
- QA CRM persistence across sign out/sign in and multi-user switching.
