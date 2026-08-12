import React from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
import { Radio, Navigation, ParkingSquare, WifiOff } from 'lucide-react';
import styles from './FleetKpiCards.module.css';

/**
 * Live fleet status strip (mutually exclusive buckets).
 * Counts come from live locations + totalVehicles — not score math.
 */
const CARDS = [
  {
    key: 'online',
    label: 'Online',
    subtitle: (k) => `of ${k.totalVehicles ?? 0}`,
    icon: Radio,
    accent: '#0d6efd',
    format: (k) => k.online ?? 0,
  },
  {
    key: 'moving',
    label: 'Moving',
    subtitle: 'In transit now',
    icon: Navigation,
    accent: '#15803d',
    format: (k) => k.moving ?? 0,
  },
  {
    key: 'idleParked',
    label: 'Idle / Parked',
    subtitle: 'Online, not moving',
    icon: ParkingSquare,
    accent: '#b45309',
    format: (k) => k.idleParked ?? 0,
  },
  {
    key: 'offline',
    label: 'Offline',
    subtitle: (k) => `of ${k.totalVehicles ?? 0}`,
    icon: WifiOff,
    accent: '#dc2626',
    format: (k) => k.offline ?? 0,
  },
];

/**
 * Build live status KPI counts for Fleet Analytics cards.
 * @param {Record<string, { status?: string }>} liveById
 * @param {number} totalVehicles
 */
export function buildLiveStatusKpis(liveById = {}, totalVehicles = 0) {
  let moving = 0;
  let idle = 0;
  let parked = 0;
  let needsAttention = 0;

  const locations = Object.values(liveById || {});
  for (const loc of locations) {
    const s = loc?.status;
    if (s === 'moving') moving += 1;
    else if (s === 'idle') idle += 1;
    else if (s === 'parked') parked += 1;
    else needsAttention += 1;
  }

  const online = moving + idle + parked;
  const liveCount = locations.length;
  const total = Math.max(0, Number(totalVehicles) || 0);
  // Offline = needsAttention in live feed + fleet vehicles with no live point
  const offline = needsAttention + Math.max(0, total - liveCount);

  return {
    online,
    moving,
    idleParked: idle + parked,
    offline,
    totalVehicles: total,
  };
}

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
