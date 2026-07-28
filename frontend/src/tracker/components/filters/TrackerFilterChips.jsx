import React from 'react';
import { STATUS_LABELS, normalizeStatus } from '../../constants/trackerStatus';

export default function TrackerFilterChips({ filters, onClick }) {
  const chips = [];
  if (filters?.search) chips.push(`Search: ${filters.search}`);
  if (filters?.status && filters.status !== 'all') {
    const key = normalizeStatus(filters.status);
    chips.push(`Status: ${STATUS_LABELS[key] || filters.status}`);
  }

  if (chips.length === 0) return null;

  return (
    <div className="d-flex flex-wrap gap-1" onClick={onClick} role="button">
      {chips.map((c) => (
        <span key={c} className="badge text-bg-light border" style={{ fontSize: '0.65rem' }}>
          {c}
        </span>
      ))}
    </div>
  );
}
