import React from 'react';
import { Spinner } from 'react-bootstrap';
import {
  formatHoursFromMs,
  formatPct,
  healthEmoji,
  healthLabel,
} from '../../utils/analyticsFormatters';
import styles from './VehicleAnalyticsTable.module.css';

const COLUMNS = [
  { key: 'displayName', label: 'Vehicle' },
  { key: 'engineOnMs', label: 'Engine ON' },
  { key: 'movingMs', label: 'Moving' },
  { key: 'idleMs', label: 'Idle' },
  { key: 'parkedMs', label: 'Parked' },
  { key: 'distanceKm', label: 'Distance' },
  { key: 'tripCount', label: 'Trips' },
  { key: 'utilizationPct', label: 'Util %' },
  { key: 'healthScore', label: 'Health' },
  { key: 'maintenanceDue', label: 'Maint.' },
  { key: 'lastOnline', label: 'Last online' },
];

function cellValue(row, key) {
  switch (key) {
    case 'displayName':
      return (
        <div>
          <div style={{ fontWeight: 600 }}>{row.displayName}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{row.deviceId}</div>
        </div>
      );
    case 'engineOnMs':
    case 'movingMs':
    case 'idleMs':
    case 'parkedMs':
      return formatHoursFromMs(row[key]);
    case 'distanceKm':
      return `${Number(row.distanceKm || 0).toFixed(1)} km`;
    case 'utilizationPct':
      return formatPct(row.utilizationPct);
    case 'healthScore':
      return (
        <span className={styles.badge} title={`Score ${row.healthScore}`}>
          {healthEmoji(row.healthStatus)} {healthLabel(row.healthStatus)}
        </span>
      );
    case 'maintenanceDue':
      if (row.maintenanceDue) return 'Due';
      if (row.maintenanceSoon) return 'Soon';
      return 'OK';
    case 'lastOnline':
      return row.lastOnline
        ? new Date(row.lastOnline).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
    default:
      return row[key] ?? '—';
  }
}

export default function VehicleAnalyticsTable({
  data,
  loading,
  sort,
  onSort,
  page,
  onPage,
  selectedId,
  onSelect,
}) {
  const items = data?.items || [];
  const total = data?.total || 0;
  const limit = data?.limit || 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className={styles.title}>
          Vehicle analytics {loading && <Spinner animation="border" size="sm" className="ms-2" />}
        </h6>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          {total} vehicle{total === 1 ? '' : 's'}
        </span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => onSort?.(col.key)}>
                  {col.label}
                  {sort?.key === col.key ? (sort.order === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} style={{ textAlign: 'center', color: '#64748b' }}>
                  No vehicles in this range
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.deviceId}
                  className={selectedId === row.deviceId ? styles.selected : ''}
                  onClick={() => onSelect?.(row.deviceId)}
                >
                  {COLUMNS.map((col) => (
                    <td key={col.key}>{cellValue(row, col.key)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pager}>
        <button
          type="button"
          className={styles.pagerBtn}
          disabled={page <= 1}
          onClick={() => onPage?.(page - 1)}
        >
          Prev
        </button>
        <span style={{ fontSize: '0.72rem', color: '#64748b', alignSelf: 'center' }}>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className={styles.pagerBtn}
          disabled={page >= totalPages}
          onClick={() => onPage?.(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
