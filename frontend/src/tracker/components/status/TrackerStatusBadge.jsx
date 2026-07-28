import React from 'react';
import { STATUS_COLORS, STATUS_LABELS, normalizeStatus } from '../../constants/trackerStatus';

export default function TrackerStatusBadge({ status }) {
  const key = normalizeStatus(status);
  const color = STATUS_COLORS[key] || STATUS_COLORS.needsAttention;
  const label = STATUS_LABELS[key] || status || 'Unknown';
  // ✅ Idle amber needs dark text for contrast; others use white on accent
  const textColor = key === 'idle' ? '#78350F' : '#fff';

  return (
    <span
      className="badge"
      style={{
        backgroundColor: color,
        color: textColor,
        fontWeight: 600,
        fontSize: '0.7rem',
      }}
    >
      {label}
    </span>
  );
}
