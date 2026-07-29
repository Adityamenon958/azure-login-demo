import React from 'react';
import { STATUS_COLORS, STATUS_LABELS, normalizeStatus } from '../../constants/trackerStatus';

export default function TrackerStatusBadge({ status }) {
  const key = normalizeStatus(status);
  const color = STATUS_COLORS[key] || STATUS_COLORS.needsAttention;
  const label = STATUS_LABELS[key] || status || 'Unknown';
  const textColor = key === 'idle' ? '#78350F' : '#fff';

  return (
    <span
      className="badge"
      style={{
        backgroundColor: color,
        color: textColor,
        fontWeight: 600,
        fontSize: '0.72rem',
        padding: '0.4em 0.65em',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  );
}
