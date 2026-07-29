import React, { useEffect, useMemo, useRef } from 'react';
import { Spinner } from 'react-bootstrap';
import { formatDurationMs } from '../../utils/formatters';
import { STATUS_COLORS } from '../../constants/trackerStatus';
import styles from './VehicleTimeline.module.css';

function categoryColor(category, type) {
  if (type === 'stop_idle' || category === 'idle') return STATUS_COLORS.idle;
  if (type === 'stop_parked' || category === 'stop') return STATUS_COLORS.parked;
  if (category === 'driving') return STATUS_COLORS.moving;
  if (category === 'gps' || category === 'health') return STATUS_COLORS.needsAttention;
  if (category === 'geofence') return '#0369a1';
  if (category === 'trip') return '#15803d';
  return '#64748b';
}

function dayKey(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '—';
  }
}

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Generic timeline — unknown categories still render via title/summary.
 */
export default function VehicleTimeline({
  items = [],
  loading,
  selectedId,
  onSelect,
}) {
  const selectedRef = useRef(null);

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = dayKey(item.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Timeline
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </div>
      <div className={styles.body}>
        {items.length === 0 && !loading ? (
          <div className={styles.empty}>No timeline events in this range</div>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day} className={styles.day}>
              <div className={styles.dayLabel}>{day}</div>
              {rows.map((item) => {
                const selected = selectedId === item.id;
                const color = categoryColor(item.category, item.type);
                const duration =
                  item.endTimestamp && item.timestamp
                    ? formatDurationMs(
                        new Date(item.endTimestamp) - new Date(item.timestamp)
                      )
                    : null;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`${styles.row} ${selected ? styles.selected : ''}`}
                    ref={selected ? selectedRef : null}
                    onClick={() => onSelect?.(item)}
                  >
                    <span className={styles.dot} style={{ background: color }} />
                    <span className={styles.time}>{timeLabel(item.timestamp)}</span>
                    <span className={styles.content}>
                      <span className={styles.itemTitle}>{item.title || item.type}</span>
                      {(item.summary || duration) && (
                        <span className={styles.summary}>
                          {item.summary}
                          {duration ? ` · ${duration}` : ''}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
