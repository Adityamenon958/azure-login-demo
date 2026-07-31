import React, { useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { fetchAnalyticsVehicleDetail } from '../../services/trackerApi';
import { formatHoursFromMs, formatPct, formatHealth } from '../../utils/analyticsFormatters';
import { formatDistanceKm } from '../../utils/formatters';
import styles from './VehicleDrilldown.module.css';

/**
 * Phase 4 — per-vehicle analytics drill-down panel.
 */
export default function VehicleDrilldown({ deviceId, from, to, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!deviceId || !from || !to) return undefined;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchAnalyticsVehicleDetail(deviceId, { from, to });
        if (!alive) return;
        if (res?.success === false) throw new Error(res.error?.message || 'Failed');
        setData(res?.data ?? res);
        setError(null);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load vehicle analytics');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [deviceId, from, to]);

  if (!deviceId) return null;

  const s = data?.summary;
  const device = data?.device;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h6 className={styles.title}>
            {device?.displayName || deviceId}
            {loading && <Spinner animation="border" size="sm" className="ms-2" />}
          </h6>
          <div className={styles.meta}>
            {deviceId}
            {device?.deviceModel ? ` · ${device.deviceModel}` : ''}
            {data?.monthly?.length ? ` · ${data.monthly.length} month rollup(s)` : ''}
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => navigate(`/dashboard/tracker/${encodeURIComponent(deviceId)}`)}
          >
            Open detail
          </button>
          <button type="button" className={styles.btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error && (
        <div className="text-danger mb-2" style={{ fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {s && (
        <div className={styles.grid}>
          <div>
            <p className={styles.statLabel}>Working</p>
            <p className={styles.statValue}>{formatHoursFromMs(s.engineOnMs)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Moving</p>
            <p className={styles.statValue}>{formatHoursFromMs(s.movingMs)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Distance</p>
            <p className={styles.statValue}>{formatDistanceKm(s.distanceKm)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Utilization</p>
            <p className={styles.statValue}>{formatPct(s.utilizationPct)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Health</p>
            <p className={styles.statValue}>{formatHealth(s.healthScore)}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Avg daily</p>
            <p className={styles.statValue}>{s.avgDailyWorkingHours ?? 0} h</p>
          </div>
          <div>
            <p className={styles.statLabel}>Trips</p>
            <p className={styles.statValue}>{s.tripCount ?? 0}</p>
          </div>
          <div>
            <p className={styles.statLabel}>Maint. remaining</p>
            <p className={styles.statValue}>
              {s.maintenanceRemainingHours == null
                ? '—'
                : `${s.maintenanceRemainingHours} h`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
