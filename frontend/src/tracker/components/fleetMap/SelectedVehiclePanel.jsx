import React from 'react';
import { Button } from 'react-bootstrap';
import { Crosshair, ExternalLink } from 'lucide-react';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatCoords, formatRelativeTime, formatSpeed } from '../../utils/formatters';
import styles from './SelectedVehiclePanel.module.css';

/**
 * Fixed bottom selected-vehicle summary. Outside the scroll list (virtualization-safe).
 */
export default function SelectedVehiclePanel({
  deviceId,
  detail,
  fallback,
  loading,
  onOpenDetail,
  onCenterMap,
  onClear,
}) {
  const open = Boolean(deviceId);
  const device = detail?.device || {};
  const live = detail?.state || detail?.liveState || {};
  const displayName =
    device.displayName || fallback?.displayName || deviceId || '—';
  const status = live.status || device.status || fallback?.status;
  const speed = live.speed ?? fallback?.speed;
  const lastSeenAt = live.lastSeenAt || fallback?.lastSeenAt;
  const lat = live.latitude ?? fallback?.latitude;
  const lon = live.longitude ?? fallback?.longitude;
  const coords = formatCoords(lat, lon);

  const copyCoords = async () => {
    if (coords === '—' || coords === 'No fix') return;
    try {
      await navigator.clipboard.writeText(coords);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`${styles.wrap} ${open ? styles.open : ''}`} aria-hidden={!open}>
      {open && (
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.titleBlock}>
              <div className={styles.name}>{displayName}</div>
              <div className={styles.badges}>
                <TrackerStatusBadge status={status} />
                {loading && <span className={styles.loading}>Updating…</span>}
              </div>
            </div>
            <button type="button" className={styles.close} onClick={onClear} aria-label="Clear selection">
              ×
            </button>
          </div>

          <div className={styles.grid}>
            <div>
              <div className={styles.label}>Speed</div>
              <div className={styles.value}>{formatSpeed(speed)}</div>
            </div>
            <div>
              <div className={styles.label}>Last seen</div>
              <div className={styles.value}>{formatRelativeTime(lastSeenAt)}</div>
            </div>
            <div className={styles.coordsCell}>
              <div className={styles.label}>Coordinates</div>
              <button type="button" className={styles.coordsBtn} onClick={copyCoords} title="Copy">
                {coords}
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              size="sm"
              variant="outline-secondary"
              className={styles.actionBtn}
              onClick={onCenterMap}
              disabled={coords === '—' || coords === 'No fix'}
            >
              <Crosshair size={14} className="me-1" />
              Centre Map
            </Button>
            <Button size="sm" variant="primary" className={styles.actionBtn} onClick={onOpenDetail}>
              <ExternalLink size={14} className="me-1" />
              Open Detail
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
