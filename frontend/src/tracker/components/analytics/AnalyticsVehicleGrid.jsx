import React from 'react';
import { Spinner } from 'react-bootstrap';
import AnalyticsVehicleCard from './AnalyticsVehicleCard';
import {
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../constants/trackerStatus';
import styles from './AnalyticsVehicleGrid.module.css';

// ✅ Status key legend — matches live card badges (same colors as Tracker Overview)
const STATUS_LEGEND = [
  { key: 'moving', label: STATUS_LABELS.moving },
  { key: 'idle', label: STATUS_LABELS.idle },
  { key: 'parked', label: STATUS_LABELS.parked },
  { key: 'needsAttention', label: STATUS_LABELS.needsAttention },
];

function VehiclesSectionHeader() {
  return (
    <div className={styles.header}>
      <ul className={styles.legend} aria-label="Vehicle status legend">
        {STATUS_LEGEND.map((item) => (
          <li key={item.key} className={styles.legendItem}>
            <span
              className={styles.legendSwatch}
              style={{ backgroundColor: STATUS_COLORS[item.key] }}
              aria-hidden
            />
            <span className={styles.legendLabel}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Primary Fleet Analytics vehicle wall — responsive compact card grid.
 */
export default function AnalyticsVehicleGrid({
  items = [],
  loading,
  selectedId,
  onSelect,
  now,
  distanceLabel = 'In range',
  total = 0,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  if (loading && items.length === 0) {
    return (
      <div className={styles.section}>
        <VehiclesSectionHeader />
        <div className={styles.empty}>
          <Spinner animation="border" size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <VehiclesSectionHeader />

      {items.length === 0 ? (
        <div className={styles.empty}>No vehicles match this range or search</div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <AnalyticsVehicleCard
              key={item.deviceId}
              item={item}
              selected={selectedId === item.deviceId}
              onSelect={onSelect}
              now={now}
              distanceLabel={distanceLabel}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMore}
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more vehicles'}
          </button>
        </div>
      )}
    </div>
  );
}
