import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { ArrowDownUp } from 'lucide-react';
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

/** Minutes from midnight in IST — same clock the timeline labels use. */
function istMinutes(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function parseHhmm(value) {
  if (!value) return null;
  const [h, m] = String(value).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function eventInTimeWindow(item, fromMins, toMins) {
  if (fromMins == null && toMins == null) return true;
  const start = istMinutes(item.timestamp);
  if (start == null) return false;
  const end = item.endTimestamp ? istMinutes(item.endTimestamp) : start;
  const windowStart = fromMins == null ? 0 : fromMins;
  const windowEnd = toMins == null ? 24 * 60 : toMins;
  const eventEnd = end == null ? start : end;
  return start <= windowEnd && eventEnd >= windowStart;
}

const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function toHhmm(hour, minute) {
  if (hour === '' || minute === '') return '';
  return `${hour}:${minute}`;
}

/** Small 24h hour:minute selects — avoids the native Windows time popup. */
function CompactTimeSelect({ value, onChange, ariaLabel }) {
  const mins = parseHhmm(value);
  const hour = mins == null ? '' : String(Math.floor(mins / 60)).padStart(2, '0');
  const minute = mins == null ? '' : String(mins % 60).padStart(2, '0');
  const minuteOptions = MINUTE_OPTS.includes(minute) || minute === ''
    ? MINUTE_OPTS
    : [...MINUTE_OPTS, minute].sort();

  return (
    <span className={styles.timePill} aria-label={ariaLabel}>
      <select
        className={styles.timeSelect}
        value={hour}
        onChange={(e) => {
          const h = e.target.value;
          onChange(h === '' ? '' : toHhmm(h, minute || '00'));
        }}
      >
        <option value="">––</option>
        {HOUR_OPTS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className={styles.timeColon}>:</span>
      <select
        className={styles.timeSelect}
        value={minute}
        onChange={(e) => {
          const m = e.target.value;
          onChange(m === '' ? '' : toHhmm(hour || '00', m));
        }}
      >
        <option value="">––</option>
        {minuteOptions.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </span>
  );
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
  // ✅ false = oldest at top (day story); true = latest at top
  const [newestFirst, setNewestFirst] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const selectedRef = useRef(null);
  const caps = getDeviceCapabilities(deviceModel);

  const filters = useMemo(() => {
    const list = [...BASE_FILTERS];
    if (caps.alerts) list.push({ key: 'alert', label: 'Alerts' });
    if (caps.geofence) list.push({ key: 'geofence', label: 'Geofence' });
    return list;
  }, [caps]);

  const filteredItems = useMemo(() => {
    const fromMins = parseHhmm(timeFrom);
    const toMins = parseHhmm(timeTo);
    return (items || []).filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      return eventInTimeWindow(item, fromMins, toMins);
    });
  }, [items, filter, timeFrom, timeTo]);

  const orderedItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      const delta = new Date(a.timestamp) - new Date(b.timestamp);
      return newestFirst ? -delta : delta;
    });
    return list;
  }, [filteredItems, newestFirst]);

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of orderedItems) {
      const key = dayKey(item.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries());
  }, [orderedItems]);

  const timeFilterOn = Boolean(timeFrom || timeTo);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Timeline
        </h6>
        <div className={styles.headRight}>
          {loading && <Spinner animation="border" size="sm" />}
          <button
            type="button"
            className={styles.sortBtn}
            onClick={() => setNewestFirst((prev) => !prev)}
            title={newestFirst ? 'Showing latest first. Click for oldest first.' : 'Showing oldest first. Click for latest first.'}
          >
            <ArrowDownUp size={12} strokeWidth={2} />
            {newestFirst ? 'Latest first' : 'Oldest first'}
          </button>
        </div>
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
        <span className={styles.timeSep} aria-hidden>
          |
        </span>
        <label className={styles.timeField}>
          <span>From</span>
          <CompactTimeSelect
            value={timeFrom}
            onChange={setTimeFrom}
            ariaLabel="Timeline from time"
          />
        </label>
        <label className={styles.timeField}>
          <span>To</span>
          <CompactTimeSelect
            value={timeTo}
            onChange={setTimeTo}
            ariaLabel="Timeline to time"
          />
        </label>
        {timeFilterOn && (
          <button
            type="button"
            className={styles.chip}
            onClick={() => {
              setTimeFrom('');
              setTimeTo('');
            }}
          >
            Clear time
          </button>
        )}
      </div>
      <div className={styles.body}>
        {orderedItems.length === 0 && !loading ? (
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
