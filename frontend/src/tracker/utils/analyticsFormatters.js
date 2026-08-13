/** Fleet Analytics formatting helpers */

export function formatHoursFromMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const h = Number(ms) / 3600000;
  // ✅ Under 1 hour → minutes (e.g. 0.8 h → 48 mins)
  if (h < 1) {
    const mins = Math.max(0, Math.round(h * 60));
    return `${mins} mins`;
  }
  return `${Math.round(h * 10) / 10} h`;
}

/** 1.3 hours → "1 hr 18 min" (chart tooltips) */
export function formatHoursAndMins(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return '—';
  const totalMins = Math.max(0, Math.round(Number(hours) * 60));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr${h === 1 ? '' : 's'} ${m} min`;
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

export function defaultAnalyticsRange(preset = 'today') {
  const to = new Date();
  const from = new Date(to);
  if (preset === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (preset === '7d') {
    // Week
    from.setTime(to.getTime() - 7 * 86400000);
  } else if (preset === '30d') {
    // Month
    from.setTime(to.getTime() - 30 * 86400000);
  } else {
    // Fallback / unknown → Week
    from.setTime(to.getTime() - 7 * 86400000);
  }
  return { from: from.toISOString(), to: to.toISOString(), preset };
}

/** Display date for compact day selector — DD MMM YYYY */
export function formatAnalyticsDayLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Shift existing from/to by N calendar days (same duration).
 * Clamps so `to` does not go past now.
 */
export function shiftAnalyticsRange(range, dayDelta) {
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return range;

  from.setDate(from.getDate() + dayDelta);
  to.setDate(to.getDate() + dayDelta);

  const now = new Date();
  if (to.getTime() > now.getTime()) {
    const overshoot = to.getTime() - now.getTime();
    to.setTime(now.getTime());
    from.setTime(from.getTime() - overshoot);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    preset: range.preset,
  };
}

/** ISO → yyyy-mm-dd for <input type="date"> (IST calendar day) */
export function isoToDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

/**
 * Build custom range from two yyyy-mm-dd strings (start of from-day → end of to-day).
 * Reuses same { from, to, preset } shape.
 */
export function customAnalyticsRange(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;
  const from = new Date(`${fromYmd}T00:00:00+05:30`);
  let to = new Date(`${toYmd}T23:59:59.999+05:30`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to < from) {
    // swap if user picked reversed
    const tmp = new Date(`${toYmd}T00:00:00+05:30`);
    to = new Date(`${fromYmd}T23:59:59.999+05:30`);
    return { from: tmp.toISOString(), to: to.toISOString(), preset: 'custom' };
  }
  const now = new Date();
  if (to > now) to = now;
  return { from: from.toISOString(), to: to.toISOString(), preset: 'custom' };
}
