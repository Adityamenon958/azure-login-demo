import React from 'react';
import { Col, Row } from 'react-bootstrap';
import { formatHoursFromMs } from '../../utils/analyticsFormatters';
import styles from './VehicleRankings.module.css';

function RankList({ title, items, valueFmt, onSelect }) {
  const max = Math.max(...(items || []).map((i) => Number(i.value) || 0), 1);
  return (
    <div className={styles.wrap}>
      <h6 className={styles.title}>{title}</h6>
      {!items?.length ? (
        <div className={styles.empty}>No data</div>
      ) : (
        items.map((item) => (
          <button
            type="button"
            key={item.deviceId}
            className={styles.row}
            onClick={() => onSelect?.(item.deviceId)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.name}>{item.displayName || item.deviceId}</div>
              <div className={styles.meta}>{item.deviceId}</div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${Math.min(100, ((item.value || 0) / max) * 100)}%` }}
                />
              </div>
            </div>
            <div className={styles.value}>{valueFmt(item)}</div>
          </button>
        ))
      )}
    </div>
  );
}

export default function VehicleRankings({ rankings, offline, onSelect }) {
  const top = rankings?.top || [];
  const bottom = rankings?.bottom || [];
  const longest =
    rankings?.longestOffline?.length
      ? rankings.longestOffline
      : offline?.longestOffline
        ? [offline.longestOffline]
        : [];

  return (
    <Row className="g-2 mb-3">
      <Col xs={12} md={4}>
        <RankList
          title="Top 10 most used (Engine ON)"
          items={top}
          valueFmt={(i) => formatHoursFromMs(i.value)}
          onSelect={onSelect}
        />
      </Col>
      <Col xs={12} md={4}>
        <RankList
          title="Top 10 least used"
          items={bottom}
          valueFmt={(i) => formatHoursFromMs(i.value)}
          onSelect={onSelect}
        />
      </Col>
      <Col xs={12} md={4}>
        <div className={styles.wrap}>
          <h6 className={styles.title}>Longest offline</h6>
          {!longest?.length ? (
            <div className={styles.empty}>All vehicles online</div>
          ) : (
            longest.map((item) => (
              <button
                type="button"
                key={item.deviceId}
                className={styles.row}
                onClick={() => onSelect?.(item.deviceId)}
              >
                <div>
                  <div className={styles.name}>{item.displayName || item.deviceId}</div>
                  <div className={styles.meta}>{item.deviceId}</div>
                </div>
                <div className={styles.value}>
                  {item.offlineDays != null ? `${item.offlineDays}d` : '—'}
                </div>
              </button>
            ))
          )}
        </div>
      </Col>
    </Row>
  );
}
