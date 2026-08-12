/** Poll intervals (ms) — keep charts/history on-demand only */
export const OVERVIEW_POLL_MS = 45000;
export const LIVE_LOCATIONS_POLL_MS = 18000;
/** Fleet Analytics — summary + chart (silent background refresh) */
export const ANALYTICS_POLL_MS = 18000;
/** ✅ Vehicle Detail live state — 15s for responsive ops feel */
export const DEVICE_DETAIL_POLL_MS = 15000;
export const ACTIVITY_POLL_MS = 60000;
/** Rolling journey window slide (Vehicle Detail) */
export const JOURNEY_SLIDE_MS = 60000;
/** Shared client tick for relative "Xs ago" labels (not an API poll) */
export const TIMESTAMP_TICK_MS = 10000;
