import React from 'react';
import { Card, ListGroup, Spinner } from 'react-bootstrap';
import { formatRelativeTime } from '../../utils/formatters';
import TrackerStatusBadge from '../status/TrackerStatusBadge';

export default function TrackerRecentActivity({ events = [], loading, title = 'Recent Activity' }) {
  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="py-2 bg-white d-flex justify-content-between align-items-center">
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          {title}
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </Card.Header>
      <Card.Body className="p-0" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div className="text-muted text-center py-4" style={{ fontSize: '0.8rem' }}>
            No recent activity
          </div>
        ) : (
          <ListGroup variant="flush">
            {events.map((ev, idx) => (
              <ListGroup.Item key={`${ev.deviceId}-${ev.timestamp}-${idx}`} className="py-2 px-3">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div style={{ fontSize: '0.75rem' }}>
                    <div className="fw-semibold">{ev.deviceId}</div>
                    <div className="text-muted">{ev.summary}</div>
                  </div>
                  <div className="text-end">
                    <TrackerStatusBadge status={ev.type === 'moving' ? 'moving' : ev.type === 'idle' ? 'idle' : ev.type === 'offline' ? 'offline' : 'online'} />
                    <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>
                      {formatRelativeTime(ev.timestamp)}
                    </div>
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}
