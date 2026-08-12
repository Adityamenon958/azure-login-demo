import React, { useMemo } from 'react';
import {
  formatDistanceKm,
  formatSpeed,
} from '../../utils/formatters';
import { formatHoursFromMs, formatPct } from '../../utils/analyticsFormatters';
import { STATUS_COLORS } from '../../constants/trackerStatus';
import { RANGE_PRESETS } from '../../constants/rangePresets';
import styles from './VehicleTripStats.module.css';

// ✅ Visual targets (same idea as energy dashboard bars)
const AVAIL_TARGET = 90;
const UTIL_TARGET = 85;

function rangeSuffix(preset) {
  if (!preset || preset === 'custom') return 'selected range';
  const found = RANGE_PRESETS.find((p) => p.key === preset);
  return found?.label?.toLowerCase() || 'selected range';
}

function pctOf(partMs, totalMs) {
  if (!totalMs || totalMs <= 0 || partMs == null) return 0;
  return Math.max(0, Math.min(100, (Number(partMs) / totalMs) * 100));
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/**
 * Availability & Utilization + Hours breakdown for the selected journey range.
 * Utilization = Moving only ÷ selected range.
 */
export default function VehicleTripStats({ summary, loading, from, to, preset }) {
  const computed = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const rangeMs =
      Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs
        ? toMs - fromMs
        : 0;

    const movingMs = Number(summary?.drivingMs) || 0;
    const idleMs = Number(summary?.idleMs) || 0;
    const parkedMs = Number(summary?.parkedMs) || 0;
    const knownMs = movingMs + idleMs + parkedMs;
    // ❗ Time in range with no classified status (gaps / offline)
    const offlineMs = Math.max(0, rangeMs - knownMs);

    // Availability = time we know the vehicle state ÷ selected range
    const availabilityPct = round1(pctOf(knownMs, rangeMs));
    // Utilization = Moving only ÷ selected range (per product choice)
    const utilizationPct = round1(pctOf(movingMs, rangeMs));

    const hourRows = [
      { key: 'moving', label: 'Moving', ms: movingMs, color: STATUS_COLORS.moving },
      { key: 'idle', label: 'Idle', ms: idleMs, color: STATUS_COLORS.idle },
      { key: 'parked', label: 'Parked', ms: parkedMs, color: STATUS_COLORS.parked },
      {
        key: 'offline',
        label: 'Offline / gap',
        ms: offlineMs,
        color: STATUS_COLORS.needsAttention,
      },
    ];
    const maxBarMs = Math.max(...hourRows.map((r) => r.ms), 1);

    const tiles = [
      {
        key: 'distance',
        label: 'Distance',
        value: formatDistanceKm(summary?.distanceKm),
      },
      {
        key: 'avg',
        label: 'Avg speed',
        value: formatSpeed(summary?.avgSpeedKmh),
      },
      {
        key: 'max',
        label: 'Max speed',
        value: formatSpeed(summary?.maxSpeedKmh),
      },
      {
        key: 'trips',
        label: 'Trips',
        value: summary?.tripCount != null ? String(summary.tripCount) : '—',
      },
    ];

    return {
      availabilityPct,
      utilizationPct,
      hourRows,
      maxBarMs,
      tiles,
      suffix: rangeSuffix(preset),
    };
  }, [summary, from, to, preset]);

  const sourceNote =
    summary?.distanceSource === 'odometer'
      ? 'Distance from odometer'
      : summary?.distanceSource === 'haversine'
        ? 'Distance estimated from GPS'
        : null;

  return (
    <div className={styles.panelRow}>
      {/* Card 1 — Availability & Utilization */}
      <section className={styles.card}>
        <h6 className={styles.cardTitle}>
          Availability &amp; Utilization
          <span className={styles.cardSuffix}> · {computed.suffix}</span>
        </h6>

        <div className={styles.progressBlock}>
          <ProgressRow
            label="Availability"
            valuePct={loading ? null : computed.availabilityPct}
            targetPct={AVAIL_TARGET}
          />
          <ProgressRow
            label="Utilization"
            valuePct={loading ? null : computed.utilizationPct}
            targetPct={UTIL_TARGET}
            hint="Moving ÷ selected range"
          />
        </div>

        <div className={styles.tileGrid}>
          {computed.tiles.map((t) => (
            <div key={t.key} className={styles.tile}>
              <div className={styles.tileLabel}>{t.label}</div>
              <div className={styles.tileValue}>{loading ? '…' : t.value}</div>
            </div>
          ))}
        </div>

        {sourceNote && <div className={styles.note}>{sourceNote}</div>}
      </section>

      {/* Card 2 — Hours breakdown */}
      <section className={styles.card}>
        <h6 className={styles.cardTitle}>
          Hours breakdown
          <span className={styles.cardSuffix}> · {computed.suffix}</span>
        </h6>

        <div className={styles.hoursList}>
          {computed.hourRows.map((row) => {
            const widthPct = loading
              ? 0
              : Math.max(2, (row.ms / computed.maxBarMs) * 100);
            return (
              <div key={row.key} className={styles.hourRow}>
                <span className={styles.hourLabel}>{row.label}</span>
                <div className={styles.hourTrack}>
                  <div
                    className={styles.hourBar}
                    style={{
                      width: `${widthPct}%`,
                      background: row.color,
                      opacity: loading ? 0.25 : 1,
                    }}
                  />
                </div>
                <span className={styles.hourValue}>
                  {loading ? '…' : formatHoursFromMs(row.ms)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProgressRow({ label, valuePct, targetPct, hint }) {
  const show = valuePct != null;
  const fill = show ? Math.min(100, valuePct) : 0;
  const belowTarget = show && valuePct < targetPct;

  return (
    <div className={styles.progressRow}>
      <div className={styles.progressHead}>
        <span className={styles.progressLabel}>{label}</span>
        <span className={styles.progressMeta}>
          {show ? formatPct(valuePct) : '…'}
          <span className={styles.targetHint}> / {targetPct}%</span>
        </span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{
            width: `${fill}%`,
            background: belowTarget ? '#ea580c' : '#15803d',
          }}
        />
      </div>
      {hint && <div className={styles.progressHint}>{hint}</div>}
    </div>
  );
}
