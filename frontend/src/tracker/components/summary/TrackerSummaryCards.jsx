import React from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
import { Navigation, Timer, ParkingSquare, TriangleAlert } from 'lucide-react';
import {
  STATUS_COLORS,
  STATUS_CHIP_BG,
  STATUS_LABELS,
  STATUS_SUBTITLES,
} from '../../constants/trackerStatus';
import styles from './TrackerSummaryCards.module.css';

// ✅ Locked V1 KPI set — mutually exclusive operational buckets
const CARD_DEFS = [
  { key: 'moving', icon: Navigation },
  { key: 'idle', icon: Timer },
  { key: 'parked', icon: ParkingSquare },
  { key: 'needsAttention', icon: TriangleAlert },
];

/**
 * Enterprise KPI cards. Click toggles overview status filter (single-select).
 * @param {{ kpis?: object, loading?: boolean, selectedStatus?: string, onStatusClick?: (key: string) => void }} props
 */
export default function TrackerSummaryCards({
  kpis,
  loading,
  selectedStatus = 'all',
  onStatusClick,
}) {
  const totals = kpis || {
    moving: 0,
    idle: 0,
    parked: 0,
    needsAttention: 0,
    total: 0,
  };

  return (
    <Row className="mb-3 g-3">
      {CARD_DEFS.map((card) => {
        const Icon = card.icon;
        const accent = STATUS_COLORS[card.key];
        const chipBg = STATUS_CHIP_BG[card.key];
        const isSelected = selectedStatus === card.key;
        const count = totals[card.key] ?? 0;

        return (
          <Col xs={6} md={3} key={card.key}>
            <div
              className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
              style={{
                borderLeftColor: accent,
                ...(isSelected
                  ? {
                      borderColor: accent,
                      backgroundColor: `${accent}0F`, // ~6% opacity hex
                    }
                  : {}),
                color: accent, // for focus-visible outline
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Filter by ${STATUS_LABELS[card.key]}`}
              onClick={() => onStatusClick?.(card.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onStatusClick?.(card.key);
                }
              }}
            >
              <div className={styles.body}>
                <div>
                  <h3 className={styles.value}>
                    {loading ? <Spinner animation="border" size="sm" /> : count}
                  </h3>
                  <p className={styles.label}>{STATUS_LABELS[card.key]}</p>
                  <p className={styles.subtitle}>{STATUS_SUBTITLES[card.key]}</p>
                  {totals.total != null && (
                    <p className={styles.fraction}>
                      of {totals.total}
                    </p>
                  )}
                </div>
                <div className={styles.chip} style={{ backgroundColor: chipBg, color: accent }}>
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                </div>
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
