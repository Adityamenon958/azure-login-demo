import React, { useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { formatIst } from '../../utils/formatters';
import { getDeviceCapabilities } from '../../constants/deviceCapabilities';
import styles from './VehicleEvents.module.css';

const BASE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'driving', label: 'Driving' },
  { key: 'ignition', label: 'Ignition' },
  { key: 'gps', label: 'GPS' },
  { key: 'stop', label: 'Stops' },
];

export default function VehicleEvents({
  events = [],
  loading,
  deviceModel,
  selectedId,
  onSelect,
}) {
  const [filter, setFilter] = useState('all');
  const caps = getDeviceCapabilities(deviceModel);

  const filters = useMemo(() => {
    const list = [...BASE_FILTERS];
    if (caps.alerts) list.push({ key: 'alert', label: 'Alerts' });
    if (caps.geofence) list.push({ key: 'geofence', label: 'Geofence' });
    return list;
  }, [caps]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Events
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
      <div className={styles.body}>
        {filtered.length === 0 && !loading ? (
          <div className={styles.empty}>No events in this range</div>
        ) : (
          filtered.map((ev) => (
            <button
              type="button"
              key={ev.id}
              className={`${styles.row} ${selectedId === ev.id ? styles.selected : ''}`}
              onClick={() => onSelect?.(ev)}
            >
              <div>
                <div className={styles.title}>{ev.title || ev.type}</div>
                <div className={styles.summary}>{ev.summary}</div>
              </div>
              <div className={styles.meta}>
                <span className={styles.cat}>{ev.category}</span>
                <span>{formatIst(ev.timestamp)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
