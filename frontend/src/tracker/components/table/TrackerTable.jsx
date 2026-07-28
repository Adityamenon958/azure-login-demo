import React, { useMemo, useState } from 'react';
import { Spinner, Table } from 'react-bootstrap';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import { formatRelativeTime, formatSpeed } from '../../utils/formatters';

export default function TrackerTable({
  devices = [],
  loading,
  selectedDeviceId,
  onSelect,
  search,
  statusFilter,
}) {
  const [sortKey, setSortKey] = useState('displayName');
  const [sortDir, setSortDir] = useState('asc');

  const filtered = useMemo(() => {
    let rows = [...devices];
    const q = (search || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (d) =>
          String(d.displayName || '').toLowerCase().includes(q) ||
          String(d.deviceId || '').toLowerCase().includes(q) ||
          String(d.uid || '').toLowerCase().includes(q) ||
          String(d.deviceModel || '').toLowerCase().includes(q) ||
          String(d.imeiMasked || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter((d) => d.status === statusFilter);
    }
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [devices, search, statusFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="bg-white border-0 shadow-sm rounded h-100 p-2" style={{ minHeight: 320 }}>
      <div className="d-flex justify-content-between align-items-center mb-2 px-1">
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Trackers ({filtered.length})
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </div>
      <div className="table-responsive" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <Table hover size="sm" className="mb-0 align-middle">
          <thead className="table-light sticky-top">
            <tr style={{ fontSize: '0.7rem' }}>
              <th role="button" onClick={() => toggleSort('displayName')}>Vehicle</th>
              <th role="button" onClick={() => toggleSort('status')}>Status</th>
              <th role="button" onClick={() => toggleSort('speed')}>Speed</th>
              <th role="button" onClick={() => toggleSort('lastSeenAt')}>Last seen</th>
            </tr>
          </thead>
          <tbody style={{ fontSize: '0.75rem' }}>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  No trackers found
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.deviceId}
                  onClick={() => onSelect?.(row.deviceId)}
                  style={{
                    cursor: 'pointer',
                    background:
                      selectedDeviceId === row.deviceId ? 'rgba(13,110,253,0.08)' : undefined,
                  }}
                >
                  <td>
                    <div className="fw-semibold">{row.displayName || row.deviceId}</div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>
                      {row.deviceModel ? `${row.deviceModel} · ` : ''}
                      {row.deviceId}
                    </div>
                  </td>
                  <td>
                    <TrackerStatusBadge status={row.status} />
                  </td>
                  <td>{formatSpeed(row.speed)}</td>
                  <td>{formatRelativeTime(row.lastSeenAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
