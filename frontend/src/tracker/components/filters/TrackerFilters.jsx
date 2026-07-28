import React, { useState, useEffect } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

export default function TrackerFilters({ show, onHide, filters, onApply, onReset }) {
  const [draft, setDraft] = useState(filters || { search: '', status: 'all' });

  useEffect(() => {
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
            placeholder="Vehicle, Device ID, UID, IMEI…"
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
            <option value="moving">Moving</option>
            <option value="idle">Idle</option>
            <option value="parked">Parked</option>
            <option value="needsAttention">Needs Attention</option>
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
