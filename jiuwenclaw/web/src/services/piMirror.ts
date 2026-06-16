// Silent feature-state mirror: pushes the given data to the backend
// via the `pi.state.sync` RPC whenever called. Debounced per feature so
// rapid store mutations only produce one network round-trip.
//
// This is intentionally invisible to the user: errors are swallowed so
// the UI never surfaces a mirror failure, and no visual indicator or
// button is exposed. The main chat agent reads the mirrored snapshot
// when the user asks feature-related questions.

import { webRequest } from './webClient';

type MirrorFeature =
  | 'storage'
  | 'kanban'
  | 'crm'
  | 'email'
  | 'project_flow'
  | 'social_posts'
  | 'social_station'
  | 'creative_studio'
  | 'lead_gen'
  | 'app_builder'
  | 'social_larry'
  | 'video_meeting';

const DEBOUNCE_MS = 500;

const pendingTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
const latestPayload: Record<string, unknown> = {};

function scheduleFlush(feature: MirrorFeature) {
  if (pendingTimers[feature]) {
    clearTimeout(pendingTimers[feature]);
  }
  pendingTimers[feature] = setTimeout(async () => {
    const data = latestPayload[feature];
    pendingTimers[feature] = undefined;
    try {
      await webRequest('pi.state.sync', { feature, data });
    } catch (err) {
      // Intentionally silent. A failed mirror must never bubble up.
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[piMirror] sync failed', feature, err);
      }
    }
  }, DEBOUNCE_MS);
}

/**
 * Push a feature snapshot to the backend mirror. Safe to call on every
 * store mutation — the call is debounced and errors are swallowed.
 */
export function mirrorFeatureState(feature: MirrorFeature, data: unknown): void {
  latestPayload[feature] = data;
  scheduleFlush(feature);
}
