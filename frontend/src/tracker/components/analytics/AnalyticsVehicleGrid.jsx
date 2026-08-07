import React from 'react';
import { Spinner } from 'react-bootstrap';
import AnalyticsVehicleCard from './AnalyticsVehicleCard';
import styles from './AnalyticsVehicleGrid.module.css';

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
        <div className={styles.header}>
          <h6 className={styles.title}>Vehicles</h6>
        </div>
        <div className={styles.empty}>
          <Spinner animation="border" size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h6 className={styles.title}>Vehicles</h6>
        <span className={styles.count}>
          {items.length}
          {total > items.length ? ` of ${total}` : total ? ` · ${total}` : ''}
        </span>
      </div>

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
