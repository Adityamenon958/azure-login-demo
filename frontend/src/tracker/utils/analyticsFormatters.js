/** Fleet Analytics formatting helpers */

export function formatHoursFromMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const h = Number(ms) / 3600000;
  if (h < 0.1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h * 10) / 10} h`;
}

export function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Math.round(Number(n) * 10) / 10}%`;
}

export function formatHealth(score) {
  if (score == null) return '—';
  return `${Math.round(score)}`;
}

export function healthLabel(status) {
  if (status === 'critical') return 'Critical';
  if (status === 'attention') return 'Attention';
  if (status === 'healthy') return 'Healthy';
  return status || '—';
}

export function healthEmoji(status) {
  if (status === 'critical') return '🔴';
  if (status === 'attention') return '🟡';
  if (status === 'healthy') return '🟢';
  return '⚪';
}

export function defaultAnalyticsRange(preset = '7d') {
  const to = new Date();
  const from = new Date(to);
  if (preset === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (preset === '7d') {
    from.setTime(to.getTime() - 7 * 86400000);
  } else if (preset === '30d') {
    from.setTime(to.getTime() - 30 * 86400000);
  } else if (preset === '90d') {
    from.setTime(to.getTime() - 90 * 86400000);
  } else if (preset === '12mo') {
    from.setTime(to.getTime() - 365 * 86400000);
  } else {
    from.setTime(to.getTime() - 7 * 86400000);
  }
  return { from: from.toISOString(), to: to.toISOString(), preset };
}
