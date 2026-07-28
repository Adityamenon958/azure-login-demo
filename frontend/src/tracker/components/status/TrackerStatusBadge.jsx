import React from 'react';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/trackerStatus';

export default function TrackerStatusBadge({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  const label = STATUS_LABELS[status] || status || 'Unknown';
  return (
    <span
      className="badge"
      style={{
        backgroundColor: color,
        color: status === 'idle' ? '#212529' : '#fff',
        fontWeight: 600,
        fontSize: '0.7rem',
      }}
    >
      {label}
    </span>
  );
}
