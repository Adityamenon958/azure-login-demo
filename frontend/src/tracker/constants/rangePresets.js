/** Shared time-range presets for Vehicle Detail (URL-synced). */

export const RANGE_PRESETS = [
  { key: 'today', label: 'Today', ms: null, rolling: true },
  { key: '1h', label: '1 Hour', ms: 1 * 60 * 60 * 1000, rolling: true },
  { key: '3h', label: '3 Hours', ms: 3 * 60 * 60 * 1000, rolling: true },
  { key: '6h', label: '6 Hours', ms: 6 * 60 * 60 * 1000, rolling: true },
  { key: '12h', label: '12 Hours', ms: 12 * 60 * 60 * 1000, rolling: true },
  { key: '24h', label: '24 Hours', ms: 24 * 60 * 60 * 1000, rolling: true },
  { key: '7d', label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000, rolling: true },
  { key: 'custom', label: 'Custom', ms: null, rolling: false },
];

export const DEFAULT_PRESET = 'today';

/** Rolling presets auto-slide `to = now`; custom stays fixed. */
export function isRollingPreset(presetKey) {
  const preset = RANGE_PRESETS.find((p) => p.key === presetKey);
  return Boolean(preset?.rolling);
}

/** Calendar today = local midnight → now (same idea as Fleet Analytics). */
function rangeForToday(now = new Date()) {
  const to = now;
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString(), preset: 'today' };
}

export function rangeFromPreset(presetKey, now = new Date()) {
  if (presetKey === 'today') return rangeForToday(now);

  const preset = RANGE_PRESETS.find((p) => p.key === presetKey);
  if (!preset || !preset.ms) {
    return rangeForToday(now);
  }
  const to = now;
  const from = new Date(to.getTime() - preset.ms);
  return { from: from.toISOString(), to: to.toISOString(), preset: preset.key };
}

export function statsIntervalForRange(fromIso, toIso) {
  const ms = new Date(toIso) - new Date(fromIso);
  if (ms <= 6 * 60 * 60 * 1000) return '5m';
  if (ms <= 24 * 60 * 60 * 1000) return '5m';
  return '1h';
}

export function toDatetimeLocalValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
