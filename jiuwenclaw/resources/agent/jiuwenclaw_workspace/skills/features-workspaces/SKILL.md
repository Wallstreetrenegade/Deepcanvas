---
name: features-workspaces
version: 1.0.0
description: Know and operate JiuwenClaw feature workspaces: Storage, Kanban, Creative Studio, Social Station, Larry Auto, App Builder, CRM, Lead Gen, Video Meeting, Project Flow, feature settings, live mirrored state, and backend feature workers. Use when the user asks what features exist, how features are wired, feature settings, storage/files, tasks/leads/social/app-builder/project-flow status, or which specialized worker manages a feature.
tags: [features, workspaces, storage, files, kanban, crm, social-station, larry, app-builder, project-flow, creative-studio, lead-gen, video-meeting, settings]
---

# Features Workspaces

Use this skill when the user asks about JiuwenClaw features, feature settings, workspaces, feature agents/workers, or live state inside Storage, Kanban, CRM, Project Flow, Social Station, Larry Auto, App Builder, Creative Studio, Lead Gen, or Video Meeting.

## Operating Model

The main chat agent is the front door and orchestrator. It should not tell the user it cannot know about features when feature tools are available.

Feature services are backend workers and state mirrors:

- `app.builder.*` powers App Builder: virtual files, saved projects, preview/code modes, and builder chat.
- `storage.*` powers Storage: disk-backed files, folders, categories, thumbnails, downloads, and Google Drive/OneDrive device authorization.
- `social.station.*` powers Social Station: account connections, composer, calendar/feed, RSS, and publishing.
- `social.larry.*` powers Larry Auto inside Social Station: app profile, plans, daily reports, hook performance, and autonomous posting.
- `pi.state.*` mirrors frontend workspace state into JSON snapshots that main-agent tools can inspect.

## Required First Step

For broad questions such as "what features do you have", "how are features wired", "what feature settings exist", or "who manages the features", call `features_catalog` or `features_overview` first.

For a specific feature, call the narrow tool first when available:

- Kanban: `features_kanban_summary`, then `features_kanban_list` when details are needed.
- Storage: `features_storage_summary`, then `features_state_get` when sanitized raw folder/file/provider detail is needed.
- CRM: `features_crm_list` or `features_crm_find`.
- Project Flow: `features_project_flow_list`.
- Social Station: `features_social_overview`.
- Larry Auto: `features_social_larry_summary`.
- App Builder: `features_app_builder_summary`.
- Any feature or alias: `features_state_get`.
- Feature model/API readiness: `features_settings_status`.

## Response Rules

- Treat live tool output as authoritative.
- If a feature is a UI workspace but has no mirrored backend state yet, say that clearly instead of inventing data.
- Never reveal API keys, tokens, passwords, bearer strings, OAuth tokens, or raw media/data URLs. The tools redact them; keep them redacted.
- Explain App Builder and Larry as specialized backend workers available through the main agent, not as separate user-facing chat agents the user must manually switch to.
- For Storage, raw file bytes, thumbnail data URLs, local disk paths, OAuth tokens, and device codes must stay hidden/redacted in normal answers.
- When the user asks for status across everything, combine `features_overview` with narrow tools only if the user needs detail.

## Feature Map

- Storage: user images, videos, audio, documents, folders, categories, thumbnails, local disk-backed file records, downloads, and optional Google Drive/OneDrive connection status.
- Kanban: tasks, cards, columns, subtasks, notes, board status.
- Creative Studio: UI workspace for creative/media work; backend mirror may be absent until implemented or opened.
- Social Station: social account connection state, composer drafts, scheduled/published posts, RSS feeds, Upload-Post readiness.
- Larry Auto: autonomous social marketing worker, app profile, TikTok-style slideshow plans, daily reports, cross-post schedule, hook performance.
- App Builder: AI site/app builder, virtual file tree, builder chat, preview/code modes, saved projects.
- CRM: leads, contacts, companies, statuses, pipeline and follow-up data.
- Lead Gen: UI workspace for lead generation; backend mirror may be absent until implemented or opened.
- Video Meeting: UI workspace for meetings; backend mirror may be absent until implemented or opened.
- Project Flow: workflow/diagram graph, nodes, edges, board title, and project structure.
