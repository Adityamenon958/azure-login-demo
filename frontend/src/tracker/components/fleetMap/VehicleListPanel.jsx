import React, { useEffect, useRef } from 'react';
import { Spinner } from 'react-bootstrap';
import VehicleCard from './VehicleCard';
import styles from './VehicleListPanel.module.css';

/**
 * Scroll host for vehicle cards.
 * Props boundary is virtualization-ready: items, selectedDeviceId, onSelect.
 * V1: map over items. Later: swap inner content for FixedSizeList.
 */
export default function VehicleListPanel({
  items = [],
  selectedDeviceId,
  onSelect,
  loading = false,
  now,
}) {
  const scrollRef = useRef(null);
  const scrollTopRef = useRef(0);

  // ✅ Preserve scroll position across data refreshes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      scrollTopRef.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = scrollTopRef.current;
  }, [items]);

  // Scroll selected card into view when selection changes from map
  useEffect(() => {
    if (!selectedDeviceId || !scrollRef.current) return;
    const node = scrollRef.current.querySelector(`[data-device-id="${CSS.escape(selectedDeviceId)}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedDeviceId]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span>Vehicles ({items.length})</span>
        {loading && <Spinner animation="border" size="sm" />}
      </div>
      <div className={styles.scroll} ref={scrollRef}>
        {items.length === 0 ? (
          <div className={styles.empty}>No vehicles match filters</div>
        ) : (
          items.map((item) => (
            <div key={item.deviceId} data-device-id={item.deviceId} className={styles.row}>
              <VehicleCard
                item={item}
                selected={selectedDeviceId === item.deviceId}
                onSelect={onSelect}
                now={now}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
