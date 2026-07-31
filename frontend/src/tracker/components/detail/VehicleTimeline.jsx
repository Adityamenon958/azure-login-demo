import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { formatDurationMs } from '../../utils/formatters';
import { STATUS_COLORS } from '../../constants/trackerStatus';
import { getDeviceCapabilities } from '../../constants/deviceCapabilities';
import styles from './VehicleTimeline.module.css';

const BASE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'driving', label: 'Driving' },
  { key: 'ignition', label: 'Ignition' },
  { key: 'gps', label: 'GPS' },
  { key: 'stop', label: 'Stops' },
];

function categoryColor(category, type) {
  if (type === 'stop_idle' || category === 'idle') return STATUS_COLORS.idle;
  if (type === 'stop_parked' || category === 'stop') return STATUS_COLORS.parked;
  if (category === 'driving') return STATUS_COLORS.moving;
  if (category === 'gps' || category === 'health') return STATUS_COLORS.needsAttention;
  if (category === 'geofence') return '#0369a1';
  if (category === 'trip') return '#15803d';
  if (category === 'ignition') return '#64748b';
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
 * Single journey story list (replaces duplicate Timeline + Events panels).
 * Click a row → map flies to that place/time.
 */
export default function VehicleTimeline({
  items = [],
  loading,
  selectedId,
  onSelect,
  deviceModel,
}) {
  const [filter, setFilter] = useState('all');
  // ✅ Same as maps: inner list scroll only after a click, so page scroll isn't hijacked
  const [scrollUnlocked, setScrollUnlocked] = useState(false);
  const selectedRef = useRef(null);
  const caps = getDeviceCapabilities(deviceModel);

  const filters = useMemo(() => {
    const list = [...BASE_FILTERS];
    if (caps.alerts) list.push({ key: 'alert', label: 'Alerts' });
    if (caps.geofence) list.push({ key: 'geofence', label: 'Geofence' });
    return list;
  }, [caps]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.category === filter);
  }, [items, filter]);

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of filteredItems) {
      const key = dayKey(item.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Timeline
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </div>
      <div className={styles.filters}>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`${styles.chip} ${filter === f.key ? styles.active : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div
        className={`${styles.body} ${scrollUnlocked ? '' : styles.scrollLocked}`}
        onClick={() => setScrollUnlocked(true)}
        onMouseLeave={() => setScrollUnlocked(false)}
      >
        {filteredItems.length === 0 && !loading ? (
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
                    title="Show this moment on the map"
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
