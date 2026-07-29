/** Shared time-range presets for Vehicle Detail (URL-synced). */

export const RANGE_PRESETS = [
  { key: '1h', label: '1 Hour', ms: 1 * 60 * 60 * 1000 },
  { key: '3h', label: '3 Hours', ms: 3 * 60 * 60 * 1000 },
  { key: '6h', label: '6 Hours', ms: 6 * 60 * 60 * 1000 },
  { key: '12h', label: '12 Hours', ms: 12 * 60 * 60 * 1000 },
  { key: '24h', label: '24 Hours', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: 'custom', label: 'Custom', ms: null },
];

export const DEFAULT_PRESET = '24h';

/** Rolling presets auto-slide `to = now`; custom stays fixed. */
export function isRollingPreset(presetKey) {
  const preset = RANGE_PRESETS.find((p) => p.key === presetKey);
  return Boolean(preset && preset.ms != null);
}

export function rangeFromPreset(presetKey, now = new Date()) {
  const preset = RANGE_PRESETS.find((p) => p.key === presetKey);
  if (!preset || !preset.ms) {
    const to = now;
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString(), preset: '24h' };
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
