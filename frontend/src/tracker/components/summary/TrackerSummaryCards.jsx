import React from 'react';
import { Card, Col, Row, Spinner } from 'react-bootstrap';
import { Radio, Navigation, PauseCircle, WifiOff } from 'lucide-react';

const CARD_DEFS = [
  { key: 'online', label: 'Online', icon: Radio, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { key: 'moving', label: 'Moving', icon: Navigation, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { key: 'idle', label: 'Idle', icon: PauseCircle, gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { key: 'offline', label: 'Offline', icon: WifiOff, gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
];

export default function TrackerSummaryCards({ kpis, loading }) {
  const totals = kpis || { online: 0, moving: 0, idle: 0, offline: 0, total: 0 };

  return (
    <Row className="mb-3 g-2">
      {CARD_DEFS.map((card) => {
        const Icon = card.icon;
        return (
          <Col xs={6} md={3} key={card.key}>
            <Card className="border-0 shadow-sm h-100 text-white" style={{ background: card.gradient, minHeight: 100 }}>
              <Card.Body className="p-3 d-flex justify-content-between align-items-start">
                <div>
                  <h3 className="mb-1 fw-bold" style={{ fontSize: '1.6rem' }}>
                    {loading ? <Spinner animation="border" size="sm" /> : totals[card.key] ?? 0}
                  </h3>
                  <p className="mb-0" style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                    {card.label}
                    {totals.total != null ? ` / ${totals.total}` : ''}
                  </p>
                </div>
                <Icon size={36} style={{ opacity: 0.85 }} />
              </Card.Body>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
