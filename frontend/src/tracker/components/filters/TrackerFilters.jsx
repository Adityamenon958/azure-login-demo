import React, { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

export default function TrackerFilters({ show, onHide, filters, onApply, onReset }) {
  const [draft, setDraft] = useState(filters || { search: '', status: 'all' });

  React.useEffect(() => {
    if (show) setDraft(filters || { search: '', status: 'all' });
  }, [show, filters]);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem' }}>Tracker Filters</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Search</Form.Label>
          <Form.Control
            size="sm"
            placeholder="Device ID, UID, IMEI…"
            value={draft.search || ''}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Status</Form.Label>
          <Form.Select
            size="sm"
            value={draft.status || 'all'}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
          >
            <option value="all">All</option>
            <option value="online">Online</option>
            <option value="moving">Moving</option>
            <option value="idle">Idle</option>
            <option value="offline">Offline</option>
          </Form.Select>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => {
            onReset?.();
            onHide?.();
          }}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onApply?.(draft);
            onHide?.();
          }}
        >
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
