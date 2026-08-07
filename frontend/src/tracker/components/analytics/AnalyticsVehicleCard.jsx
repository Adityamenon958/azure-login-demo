import React, { memo } from 'react';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatRelativeTime, formatSpeed } from '../../utils/formatters';
import { formatPct, healthLabel } from '../../utils/analyticsFormatters';
import { STATUS_COLORS, normalizeStatus } from '../../constants/trackerStatus';
import { engineStateFromStatus } from '../../utils/mergeAnalyticsWithLive';
import styles from './AnalyticsVehicleCard.module.css';

const HEALTH_COLORS = {
  healthy: '#15803d',
  attention: '#ca8a04',
  critical: '#dc2626',
};

function AnalyticsVehicleCard({ item, selected, onSelect, now, distanceLabel }) {
  const statusKey = normalizeStatus(item.status) || 'needsAttention';
  const accent = item.liveAvailable
    ? STATUS_COLORS[statusKey] || STATUS_COLORS.needsAttention
    : '#94a3b8';
  const engine = engineStateFromStatus(item.status);
  const health = item.healthStatus || null;
  const healthColor = HEALTH_COLORS[health] || '#64748b';

  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      style={{ borderLeftColor: accent }}
      onClick={() => onSelect?.(item.deviceId)}
      aria-pressed={selected}
    >
      {/* Band 1 — identity + status */}
      <div className={styles.band1}>
        <div className={styles.identity}>
          <div className={styles.name}>{item.displayName || item.deviceId}</div>
          <div className={styles.deviceId}>{item.deviceId}</div>
        </div>
        <div className={styles.badges}>
          {item.liveAvailable ? (
            <TrackerStatusBadge status={item.status} />
          ) : (
            <span className={styles.mutedBadge}>No live</span>
          )}
          {health && (
            <span
              className={styles.healthChip}
              style={{ color: healthColor, background: `${healthColor}18` }}
              title={item.healthScore != null ? `Score ${item.healthScore}` : undefined}
            >
              {healthLabel(health)}
            </span>
          )}
        </div>
      </div>

      {/* Band 2 — live ops */}
      <div className={styles.band2}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Engine</span>
          <span
            className={styles.metricValue}
            title="Derived from live status"
            style={{
              color:
                engine === 'ON' ? '#15803d' : engine === 'OFF' ? '#64748b' : '#94a3b8',
            }}
          >
            {engine || '—'}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Speed</span>
          <span className={`${styles.metricValue} ${!item.liveAvailable ? styles.muted : ''}`}>
            {formatSpeed(item.speed)}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Last seen</span>
          <span className={`${styles.metricValue} ${!item.liveAvailable ? styles.muted : ''}`}>
            {formatRelativeTime(item.lastSeenAt)}
          </span>
        </div>
      </div>

      {/* Band 3 — range analytics + alerts */}
      <div className={styles.band3}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{distanceLabel}</span>
          <span className={styles.metricValue}>
            {Number(item.distanceKm || 0).toFixed(1)} km
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Util</span>
          <span className={styles.metricValue}>{formatPct(item.utilizationPct)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Maint</span>
          <span
            className={styles.metricValue}
            style={{ color: item.maintenanceDue ? '#dc2626' : undefined }}
          >
            {item.maintenanceDue ? 'Due' : item.maintenanceSoon ? 'Soon' : 'OK'}
          </span>
        </div>
      </div>

      {/* now tick forces relative-time refresh via memo */}
      <span className="visually-hidden" aria-hidden>
        {now}
      </span>
    </button>
  );
}

function propsEqual(prev, next) {
  const a = prev.item;
  const b = next.item;
  return (
    prev.selected === next.selected &&
    prev.now === next.now &&
    prev.distanceLabel === next.distanceLabel &&
    a.deviceId === b.deviceId &&
    a.displayName === b.displayName &&
    a.status === b.status &&
    a.speed === b.speed &&
    a.lastSeenAt === b.lastSeenAt &&
    a.liveAvailable === b.liveAvailable &&
    a.distanceKm === b.distanceKm &&
    a.utilizationPct === b.utilizationPct &&
    a.healthStatus === b.healthStatus &&
    a.maintenanceDue === b.maintenanceDue &&
    a.maintenanceSoon === b.maintenanceSoon
  );
}

export default memo(AnalyticsVehicleCard, propsEqual);
