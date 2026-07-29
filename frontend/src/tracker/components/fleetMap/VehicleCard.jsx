import React, { memo } from 'react';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatRelativeTime, formatSpeed } from '../../utils/formatters';
import { STATUS_COLORS, normalizeStatus } from '../../constants/trackerStatus';
import styles from './VehicleCard.module.css';

function VehicleCard({ item, selected, onSelect, now }) {
  const statusKey = normalizeStatus(item.status) || 'needsAttention';
  const accent = STATUS_COLORS[statusKey] || STATUS_COLORS.needsAttention;

  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      style={{ borderLeftColor: accent }}
      onClick={() => onSelect?.(item.deviceId)}
      aria-pressed={selected}
    >
      <div className={styles.top}>
        <TrackerStatusBadge status={item.status} />
        <span className={styles.speed}>{formatSpeed(item.speed)}</span>
      </div>
      <div className={styles.name}>{item.displayName || item.deviceId}</div>
      <div className={styles.meta}>
        <span>
          {item.deviceModel ? `${item.deviceModel} · ` : ''}
          {item.deviceId}
        </span>
        <span className={styles.ago}>{formatRelativeTime(item.lastSeenAt)}</span>
      </div>
      {/* now tick forces relative-time refresh via memo compare */}
      <span className="visually-hidden" aria-hidden>
        {now}
      </span>
    </button>
  );
}

function cardPropsEqual(prev, next) {
  return (
    prev.selected === next.selected &&
    prev.onSelect === next.onSelect &&
    prev.now === next.now &&
    prev.item.deviceId === next.item.deviceId &&
    prev.item.displayName === next.item.displayName &&
    prev.item.status === next.item.status &&
    prev.item.speed === next.item.speed &&
    prev.item.lastSeenAt === next.item.lastSeenAt &&
    prev.item.deviceModel === next.item.deviceModel
  );
}

export default memo(VehicleCard, cardPropsEqual);
