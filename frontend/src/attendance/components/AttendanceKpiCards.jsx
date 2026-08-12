import React from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
import {
  Users,
  UserCheck,
  UserX,
  MapPin,
  Clock,
  Percent,
} from 'lucide-react';
import styles from './AttendanceKpiCards.module.css';

const CARDS = [
  {
    key: 'totalEmployees',
    label: 'Total employees',
    subtitle: 'On roster',
    icon: Users,
    accent: '#64748b',
    format: (k) => k.totalEmployees ?? 0,
  },
  {
    key: 'present',
    label: 'Present',
    subtitle: 'Checked in today',
    icon: UserCheck,
    accent: '#15803d',
    format: (k) => k.present ?? 0,
  },
  {
    key: 'absent',
    label: 'Absent',
    subtitle: 'No check-in',
    icon: UserX,
    accent: '#dc2626',
    format: (k) => k.absent ?? 0,
  },
  {
    key: 'onSite',
    label: 'On site',
    subtitle: 'Still checked in',
    icon: MapPin,
    accent: '#0d6efd',
    format: (k) => k.onSite ?? 0,
  },
  {
    key: 'late',
    label: 'Late',
    subtitle: 'Arrived late',
    icon: Clock,
    accent: '#b45309',
    format: (k) => k.late ?? 0,
  },
  {
    key: 'attendancePct',
    label: 'Attendance',
    subtitle: 'Of roster',
    icon: Percent,
    accent: '#0d7377',
    format: (k) => `${k.attendancePct ?? 0}%`,
  },
];

export default function AttendanceKpiCards({ kpis, loading }) {
  const data = kpis || {};

  return (
    <Row className="mb-3 g-2">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <Col xs={6} md={4} lg={2} key={card.key}>
            <div className={styles.card} style={{ borderLeftColor: card.accent }}>
              <div>
                <h3 className={styles.value}>
                  {loading ? <Spinner animation="border" size="sm" /> : card.format(data)}
                </h3>
                <p className={styles.label}>{card.label}</p>
                <p className={styles.subtitle}>{card.subtitle}</p>
              </div>
              <div
                className={styles.chip}
                style={{ background: `${card.accent}18`, color: card.accent }}
              >
                <Icon size={16} strokeWidth={1.75} />
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
