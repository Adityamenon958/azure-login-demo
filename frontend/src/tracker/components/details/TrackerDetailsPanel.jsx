import React from 'react';
import { Button, Card, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatCoords, formatIst, formatSpeed } from '../../utils/formatters';
import { getGoogleMapsUrl } from '../../utils/mapHelpers';

export default function TrackerDetailsPanel({ deviceId, detail, loading }) {
  const navigate = useNavigate();

  if (!deviceId) {
    return (
      <Card className="border-0 shadow-sm h-100">
        <Card.Body className="d-flex align-items-center justify-content-center text-muted" style={{ minHeight: 180 }}>
          Select a tracker from the table or map
        </Card.Body>
      </Card>
    );
  }

  const device = detail?.device;
  const state = detail?.state;
  const mapsUrl = state ? getGoogleMapsUrl(state.latitude, state.longitude) : null;

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="py-2 bg-white d-flex justify-content-between align-items-center">
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Device Details
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </Card.Header>
      <Card.Body className="p-3" style={{ fontSize: '0.8rem' }}>
        {!detail && loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div className="fw-bold">{device?.displayName || device?.deviceId || deviceId}</div>
                <div className="text-muted">
                  {device?.deviceModel ? `${device.deviceModel} · ` : ''}
                  {device?.deviceId || deviceId}
                </div>
                <div className="text-muted">{device?.uid}</div>
                <div className="text-muted">IMEI {device?.imeiMasked || '—'}</div>
              </div>
              <TrackerStatusBadge status={state?.status} />
            </div>
            <ul className="list-unstyled mb-3">
              <li className="mb-1">
                <span className="text-muted">Speed:&nbsp;</span>
                {formatSpeed(state?.speed)}
              </li>
              <li className="mb-1">
                <span className="text-muted">Ignition:&nbsp;</span>
                {state?.ignition ? 'ON' : 'OFF'}
              </li>
              <li className="mb-1">
                <span className="text-muted">Movement:&nbsp;</span>
                {state?.movement ? 'Moving' : 'Stationary'}
              </li>
              <li className="mb-1">
                <span className="text-muted">Satellites:&nbsp;</span>
                {state?.satellites ?? '—'}
              </li>
              <li className="mb-1">
                <span className="text-muted">Location:&nbsp;</span>
                {formatCoords(state?.latitude, state?.longitude)}
              </li>
              <li className="mb-1">
                <span className="text-muted">Last fix:&nbsp;</span>
                {formatIst(state?.lastSeenAt)}
              </li>
            </ul>
            <div className="d-flex gap-2 flex-wrap">
              {mapsUrl && (
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open in Maps
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => navigate(`/dashboard/tracker/${encodeURIComponent(deviceId)}`)}
              >
                Open vehicle detail
              </Button>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
