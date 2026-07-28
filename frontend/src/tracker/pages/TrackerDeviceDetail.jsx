import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { useTrackerDevice } from '../hooks/useTrackerDevice';
import { useTrackerHistory } from '../hooks/useTrackerHistory';
import { useTrackerStats } from '../hooks/useTrackerStats';
import { DEVICE_DETAIL_POLL_MS } from '../constants/pollIntervals';
import TrackerDetailsPanel from '../components/details/TrackerDetailsPanel';
import TrackerLiveMap from '../components/map/TrackerLiveMap';
import styles from '../styles/TrackerOverview.module.css';

const TrackerSpeedChart = lazy(() => import('../components/charts/TrackerSpeedChart'));
const TrackerActivityChart = lazy(() => import('../components/charts/TrackerActivityChart'));

function toInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrackerDeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const decodedId = decodeURIComponent(deviceId || '');

  const initialTo = useMemo(() => new Date(), []);
  const initialFrom = useMemo(
    () => new Date(initialTo.getTime() - 24 * 60 * 60 * 1000),
    [initialTo]
  );

  const [fromLocal, setFromLocal] = useState(toInputValue(initialFrom));
  const [toLocal, setToLocal] = useState(toInputValue(initialTo));
  const [applied, setApplied] = useState({
    from: initialFrom.toISOString(),
    to: initialTo.toISOString(),
  });

  const detail = useTrackerDevice(decodedId, DEVICE_DETAIL_POLL_MS);
  const history = useTrackerHistory(decodedId, applied.from, applied.to);
  const stats = useTrackerStats(decodedId, applied.from, applied.to, '5m', true);

  const mapLocations = useMemo(() => {
    const state = detail.data?.state;
    if (!state) return [];
    return [
      {
        deviceId: decodedId,
        uid: detail.data?.device?.uid,
        latitude: state.latitude,
        longitude: state.longitude,
        status: state.status,
        speed: state.speed,
        heading: state.heading,
        lastSeenAt: state.lastSeenAt,
      },
    ];
  }, [detail.data, decodedId]);

  const trailLocations = useMemo(() => {
    const points = history.data?.points || [];
    // Show latest point as marker set for map simplicity; full polyline can come later
    if (points.length === 0) return mapLocations;
    const latest = points[0];
    return [
      {
        deviceId: decodedId,
        uid: detail.data?.device?.uid,
        latitude: latest.latitude,
        longitude: latest.longitude,
        status: detail.data?.state?.status || 'parked',
        speed: latest.speed,
        heading: latest.heading,
        lastSeenAt: latest.timestamp,
      },
    ];
  }, [history.data, mapLocations, decodedId, detail.data]);

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <div className="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <Button variant="link" className="p-0 mb-1" onClick={() => navigate('/dashboard/tracker-overview')}>
            ← Back to Tracker Overview
          </Button>
          <h6 className="mb-0">Tracker · {detail.data?.device?.displayName || decodedId}</h6>
        </div>
      </div>

      {detail.error && (
        <Alert variant="danger" className="py-2" style={{ fontSize: '0.8rem' }}>
          {detail.error}
        </Alert>
      )}

      <Row className="g-2 mb-3">
        <Col xs={12} lg={5}>
          <TrackerDetailsPanel
            deviceId={decodedId}
            detail={detail.data}
            loading={detail.loading}
          />
        </Col>
        <Col xs={12} lg={7}>
          <TrackerLiveMap
            locations={trailLocations}
            loading={detail.loading && !detail.data}
            selectedDeviceId={decodedId}
          />
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="py-2 bg-white">
          <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
            History range
          </h6>
        </Card.Header>
        <Card.Body className="py-2">
          <Row className="g-2 align-items-end">
            <Col xs={12} md={4}>
              <Form.Label className="mb-1" style={{ fontSize: '0.75rem' }}>
                From
              </Form.Label>
              <Form.Control
                type="datetime-local"
                size="sm"
                value={fromLocal}
                onChange={(e) => setFromLocal(e.target.value)}
              />
            </Col>
            <Col xs={12} md={4}>
              <Form.Label className="mb-1" style={{ fontSize: '0.75rem' }}>
                To
              </Form.Label>
              <Form.Control
                type="datetime-local"
                size="sm"
                value={toLocal}
                onChange={(e) => setToLocal(e.target.value)}
              />
            </Col>
            <Col xs={12} md={4}>
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  setApplied({
                    from: new Date(fromLocal).toISOString(),
                    to: new Date(toLocal).toISOString(),
                  })
                }
              >
                Apply range
              </Button>
            </Col>
          </Row>
          {history.error && (
            <Alert variant="warning" className="mt-2 mb-0 py-2" style={{ fontSize: '0.75rem' }}>
              {history.error}
            </Alert>
          )}
          <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
            Points loaded: {history.data?.points?.length ?? 0}
            {history.loading ? ' (loading…)' : ''}
          </div>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="py-2 bg-white">
          <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
            Charts
          </h6>
        </Card.Header>
        <Card.Body>
          <Suspense
            fallback={
              <div className="text-center py-4">
                <Spinner animation="border" size="sm" />
              </div>
            }
          >
            <Row className="g-2">
              <Col xs={12} md={6}>
                <TrackerSpeedChart series={stats.data?.series || []} loading={stats.loading} />
              </Col>
              <Col xs={12} md={6}>
                <TrackerActivityChart series={stats.data?.series || []} loading={stats.loading} />
              </Col>
            </Row>
          </Suspense>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm">
        <Card.Header className="py-2 bg-white">
          <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
            History points (latest first)
          </h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive" style={{ maxHeight: 320 }}>
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
                {(history.data?.points || []).slice(0, 200).map((p, i) => (
                  <tr key={`${p.timestamp}-${i}`}>
                    <td>{p.timestamp ? new Date(p.timestamp).toLocaleString('en-IN') : '—'}</td>
                    <td>{p.latitude}</td>
                    <td>{p.longitude}</td>
                    <td>{p.speed}</td>
                    <td>{p.ignition ? 'ON' : 'OFF'}</td>
                  </tr>
                ))}
                {!history.loading && (history.data?.points || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-3">
                      No points in range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card.Body>
      </Card>
    </Col>
  );
}
