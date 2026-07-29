import React from 'react';
import { Button, Form } from 'react-bootstrap';
import { RANGE_PRESETS, toDatetimeLocalValue } from '../../constants/rangePresets';
import styles from './VehicleRangeBar.module.css';

export default function VehicleRangeBar({
  preset,
  from,
  to,
  customFromLocal,
  customToLocal,
  onPreset,
  onCustomFrom,
  onCustomTo,
  onApplyCustom,
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.presets}>
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.preset} ${preset === p.key ? styles.active : ''}`}
            onClick={() => onPreset?.(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className={styles.custom}>
          <Form.Control
            type="datetime-local"
            size="sm"
            value={customFromLocal || toDatetimeLocalValue(from)}
            onChange={(e) => onCustomFrom?.(e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            to
          </span>
          <Form.Control
            type="datetime-local"
            size="sm"
            value={customToLocal || toDatetimeLocalValue(to)}
            onChange={(e) => onCustomTo?.(e.target.value)}
          />
          <Button size="sm" variant="primary" onClick={onApplyCustom}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
