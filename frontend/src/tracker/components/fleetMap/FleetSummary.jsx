import React from 'react';
import { STATUS_LABELS } from '../../constants/trackerStatus';
import styles from './FleetSummary.module.css';

const SEGMENTS = [
  { key: 'moving', label: STATUS_LABELS.moving },
  { key: 'idle', label: STATUS_LABELS.idle },
  { key: 'parked', label: STATUS_LABELS.parked },
  { key: 'needsAttention', label: 'Attention' },
];

/**
 * Compact fleet KPI strip — uses existing overview.kpis (no new API).
 * Counts are fleet totals, not search-filtered.
 */
export default function FleetSummary({ kpis, selectedStatus = 'all', onStatusClick }) {
  const totals = kpis || {
    moving: 0,
    idle: 0,
    parked: 0,
    needsAttention: 0,
    total: 0,
  };

  return (
    <div className={styles.wrap} aria-label="Fleet summary">
      <span className={styles.title}>Fleet</span>
      <span className={styles.sep}>·</span>
      <span className={styles.total}>{totals.total ?? 0} vehicles</span>
      {SEGMENTS.map((seg) => {
        const active = selectedStatus === seg.key;
        return (
          <button
            key={seg.key}
            type="button"
            className={`${styles.seg} ${styles[seg.key]} ${active ? styles.active : ''}`}
            onClick={() => onStatusClick?.(seg.key)}
            aria-pressed={active}
          >
            {seg.label} <strong>{totals[seg.key] ?? 0}</strong>
          </button>
        );
      })}
    </div>
  );
}
