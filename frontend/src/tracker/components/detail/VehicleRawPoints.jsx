import React, { useCallback, useEffect, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { fetchHistory } from '../../services/trackerApi';
import { formatIst } from '../../utils/formatters';
import styles from './VehicleRawPoints.module.css';

export default function VehicleRawPoints({ deviceId, from, to }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (cursor = null, append = false) => {
      if (!deviceId || !from || !to) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchHistory(deviceId, {
          from,
          to,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        const data = res?.data ?? res;
        const batch = data?.points || [];
        setPoints((prev) => (append ? [...prev, ...batch] : batch));
        setNextCursor(data?.nextCursor || null);
      } catch (err) {
        setError(err.response?.data?.error?.message || err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [deviceId, from, to]
  );

  useEffect(() => {
    if (open) load(null, false);
  }, [open, load]);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.head} onClick={() => setOpen((v) => !v)}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Raw history points (advanced)
        </h6>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          {open ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>
      {open && (
        <div className={styles.body}>
          {error && <div className="text-danger mb-2" style={{ fontSize: '0.75rem' }}>{error}</div>}
          <div className="table-responsive" style={{ maxHeight: 280 }}>
            <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.75rem' }}>
              <thead className="table-light sticky-top">
                <tr>
                  <th>Time</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Speed</th>
                  <th>Ignition</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={`${p.timestamp}-${i}`}>
                    <td>{formatIst(p.timestamp)}</td>
                    <td>{p.latitude}</td>
                    <td>{p.longitude}</td>
                    <td>{p.speed}</td>
                    <td>{p.ignition ? 'ON' : 'OFF'}</td>
                  </tr>
                ))}
                {!loading && points.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-3">
                      No points
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="d-flex align-items-center gap-2 mt-2">
            {loading && <Spinner animation="border" size="sm" />}
            {nextCursor && (
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={loading}
                onClick={() => load(nextCursor, true)}
              >
                Load more
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
