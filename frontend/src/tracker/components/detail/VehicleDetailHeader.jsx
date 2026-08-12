import React from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatIst, formatRelativeTime, formatSpeed } from '../../utils/formatters';
import { getGoogleMapsUrl } from '../../utils/mapHelpers';
import styles from './VehicleDetailHeader.module.css';

export default function VehicleDetailHeader({
  device,
  state,
  loading,
  lastRefreshed,
  onBack,
  onRefresh,
  backLabel = 'Fleet Analytics',
}) {
  const title = device?.displayName || device?.deviceId || 'Vehicle';
  const mapsUrl = state ? getGoogleMapsUrl(state.latitude, state.longitude) : null;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(device?.deviceId || '');
    } catch {
      /* ignore */
    }
  };

  return (
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack}>
        ← Back to {backLabel}
      </button>

      <div className={styles.row}>
        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            <TrackerStatusBadge status={state?.status} />
            {state?.status === 'moving' && (
              <span className={styles.liveSpeed}>{formatSpeed(state?.speed)}</span>
            )}
            {loading && <Spinner animation="border" size="sm" />}
          </div>

          <div className={styles.meta}>
            {device?.deviceModel && <span className={styles.chip}>{device.deviceModel}</span>}
            <span className={styles.chip}>Fleet Tracker</span>
            {device?.companyName && (
              <span className={styles.company}>{device.companyName}</span>
            )}
          </div>

          <div
            className={styles.updated}
            title={formatIst(state?.lastSeenAt)}
          >
            Last updated {formatRelativeTime(state?.lastSeenAt)}
          </div>

          <div className={styles.ids}>
            <span>
              <em>Device ID</em> {device?.deviceId || '—'}
            </span>
            <span>
              <em>UID</em> {device?.uid || '—'}
            </span>
            <span>
              <em>IMEI</em> {device?.imeiMasked || '—'}
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <Button size="sm" variant="outline-secondary" className={styles.actionBtn} onClick={onRefresh}>
            <RefreshCw size={14} strokeWidth={1.75} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            className={styles.actionBtn}
            onClick={copyId}
            disabled={!device?.deviceId}
          >
            <Copy size={14} strokeWidth={1.75} />
            Copy ID
          </Button>
          {mapsUrl && (
            <Button
              size="sm"
              variant="outline-secondary"
              className={styles.actionBtn}
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
              Maps
            </Button>
          )}
          {lastRefreshed && (
            <div className={styles.refreshMeta} title={formatIst(lastRefreshed.toISOString?.() || lastRefreshed)}>
              Refreshed {formatRelativeTime(lastRefreshed)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
