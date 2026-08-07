import React from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
import { Award, Gauge, WifiOff, Wrench } from 'lucide-react';
import { formatPct } from '../../utils/analyticsFormatters';
import styles from './FleetKpiCards.module.css';

// Summary strip: health + attention only
const CARDS = [
  {
    key: 'fleetScore',
    label: 'Fleet Score',
    subtitle: 'Overall fleet health',
    icon: Award,
    accent: '#0d6efd',
    format: (k) => `${k.fleetScore ?? '—'} / 100`,
  },
  {
    key: 'fleetUtilizationPct',
    label: 'Utilization',
    subtitle: 'Engine ON vs capacity',
    icon: Gauge,
    accent: '#15803d',
    format: (k) => formatPct(k.fleetUtilizationPct),
  },
  {
    key: 'offlineVehicles',
    label: 'Offline Vehicles',
    subtitle: (k) => `of ${k.totalVehicles ?? 0}`,
    icon: WifiOff,
    accent: '#dc2626',
    format: (k) => k.offlineVehicles ?? 0,
  },
  {
    key: 'maintenanceDue',
    label: 'Maintenance Due',
    subtitle: 'Overdue schedules',
    icon: Wrench,
    accent: '#ca8a04',
    format: (k) => k.maintenanceDue ?? 0,
  },
];

export default function FleetKpiCards({ kpis, loading }) {
  const data = kpis || {};

  return (
    <Row className="mb-3 g-2">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const subtitle =
          typeof card.subtitle === 'function' ? card.subtitle(data) : card.subtitle;
        return (
          <Col xs={6} md={3} key={card.key}>
            <div className={styles.card} style={{ borderLeftColor: card.accent }}>
              <div>
                <h3 className={styles.value}>
                  {loading ? <Spinner animation="border" size="sm" /> : card.format(data)}
                </h3>
                <p className={styles.label}>{card.label}</p>
                <p className={styles.subtitle}>{subtitle}</p>
              </div>
              <div
                className={styles.chip}
                style={{ background: `${card.accent}18`, color: card.accent }}
              >
                <Icon size={16} />
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
