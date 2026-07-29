import React, { useEffect, useState } from 'react';
import { STATUS_LABELS } from '../../constants/trackerStatus';
import styles from './FleetMapFilterBar.module.css';

const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'moving', label: STATUS_LABELS.moving },
  { key: 'idle', label: STATUS_LABELS.idle },
  { key: 'parked', label: STATUS_LABELS.parked },
  { key: 'needsAttention', label: 'Attention' },
];

/**
 * Debounced search + status pills. Writes into shared tracker filters context via callbacks.
 */
export default function FleetMapFilterBar({
  search = '',
  status = 'all',
  kpis,
  onSearchChange,
  onStatusClick,
}) {
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  // ✅ Debounce 200ms — avoid per-keystroke list/map refilter on large fleets
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== search) onSearchChange?.(draft);
    }, 200);
    return () => clearTimeout(t);
  }, [draft, search, onSearchChange]);

  const counts = {
    all: kpis?.total ?? 0,
    moving: kpis?.moving ?? 0,
    idle: kpis?.idle ?? 0,
    parked: kpis?.parked ?? 0,
    needsAttention: kpis?.needsAttention ?? 0,
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search name, ID, IMEI, model…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Search vehicles"
        />
        {draft ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setDraft('');
              onSearchChange?.('');
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className={styles.pills} role="group" aria-label="Status filter">
        {PILLS.map((p) => {
          const active = status === p.key;
          return (
            <button
              key={p.key}
              type="button"
              className={`${styles.pill} ${active ? styles.pillActive : ''}`}
              onClick={() => onStatusClick?.(p.key)}
              aria-pressed={active}
            >
              {p.label}
              <span className={styles.count}>{counts[p.key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
