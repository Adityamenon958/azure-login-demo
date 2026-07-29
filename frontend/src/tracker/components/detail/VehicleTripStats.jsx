import React from 'react';
import {
  formatDistanceKm,
  formatDurationMs,
  formatSpeed,
} from '../../utils/formatters';
import styles from './VehicleTripStats.module.css';

const PRIMARY = [
  { key: 'distance', label: 'Distance', get: (s) => formatDistanceKm(s?.distanceKm) },
  { key: 'driving', label: 'Driving', get: (s) => formatDurationMs(s?.drivingMs) },
  { key: 'idle', label: 'Idle', get: (s) => formatDurationMs(s?.idleMs) },
  { key: 'parked', label: 'Parked', get: (s) => formatDurationMs(s?.parkedMs) },
];

const SECONDARY = [
  { key: 'avg', label: 'Avg speed', get: (s) => formatSpeed(s?.avgSpeedKmh) },
  { key: 'max', label: 'Max speed', get: (s) => formatSpeed(s?.maxSpeedKmh) },
  { key: 'trips', label: 'Trips', get: (s) => (s?.tripCount != null ? String(s.tripCount) : '—') },
  { key: 'stops', label: 'Stops', get: (s) => (s?.stopCount != null ? String(s.stopCount) : '—') },
];

export default function VehicleTripStats({ summary, loading }) {
  const sourceNote =
    summary?.distanceSource === 'odometer'
      ? 'Distance from odometer'
      : summary?.distanceSource === 'haversine'
        ? 'Distance estimated from GPS'
        : null;

  return (
    <div className={styles.wrap}>
      <h6 className={styles.title}>Trip statistics</h6>
      <div className={styles.grid}>
        {PRIMARY.map((c) => (
          <div key={c.key} className={styles.card}>
            <div className={styles.value}>{loading ? '…' : c.get(summary)}</div>
            <div className={styles.label}>{c.label}</div>
          </div>
        ))}
      </div>
      <div className={styles.secondary}>
        {SECONDARY.map((c) => (
          <div key={c.key} className={styles.secItem}>
            <span className={styles.secLabel}>{c.label}</span>
            <span className={styles.secValue}>{loading ? '…' : c.get(summary)}</span>
          </div>
        ))}
      </div>
      {sourceNote && <div className={styles.note}>{sourceNote}</div>}
    </div>
  );
}
