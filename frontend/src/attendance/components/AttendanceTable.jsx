import React, { useMemo, useState } from 'react';
import styles from './AttendanceTable.module.css';

const STATUS_META = {
  present: { label: 'Present', className: styles.statusPresent },
  on_site: { label: 'On site', className: styles.statusOnSite },
  checked_out: { label: 'Checked out', className: styles.statusCheckedOut },
  late: { label: 'Late', className: styles.statusLate },
  absent: { label: 'Absent', className: styles.statusAbsent },
};

function formatHours(h) {
  if (h == null || h === 0) return '—';
  return `${h} h`;
}

export default function AttendanceTable({ employees = [], loading }) {
  const [sort, setSort] = useState({ key: 'name', order: 'asc' });

  const rows = useMemo(() => {
    const list = [...(employees || [])];
    const { key, order } = sort;
    list.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return order === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return order === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [employees, sort]);

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'asc' }
    );
  };

  const sortMark = (key) => {
    if (sort.key !== key) return '';
    return sort.order === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className={styles.title}>Employee attendance</h6>
        <span className={styles.count}>
          {loading ? '…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')}>Employee{sortMark('name')}</th>
              <th onClick={() => toggleSort('department')}>Department / Role{sortMark('department')}</th>
              <th onClick={() => toggleSort('siteType')}>Site{sortMark('siteType')}</th>
              <th onClick={() => toggleSort('checkIn')}>Check-in{sortMark('checkIn')}</th>
              <th onClick={() => toggleSort('checkOut')}>Check-out{sortMark('checkOut')}</th>
              <th onClick={() => toggleSort('status')}>Status{sortMark('status')}</th>
              <th onClick={() => toggleSort('hoursWorked')}>Hours{sortMark('hoursWorked')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  No employees match your filters.
                </td>
              </tr>
            ) : (
              rows.map((e) => {
                const meta = STATUS_META[e.status] || {
                  label: e.status || '—',
                  className: '',
                };
                return (
                  <tr key={e.id}>
                    <td>
                      <div className={styles.name}>{e.name}</div>
                      <div className={styles.sub}>{e.id}</div>
                    </td>
                    <td>
                      <div>{e.department}</div>
                      <div className={styles.sub}>{e.role}</div>
                    </td>
                    <td>
                      <span
                        className={`${styles.siteChip} ${
                          e.siteType === 'fleet' ? styles.siteFleet : styles.siteOffice
                        }`}
                      >
                        {e.siteType === 'fleet' ? 'Fleet' : 'Office'}
                      </span>
                      {e.siteLabel ? (
                        <div className={styles.sub}>{e.siteLabel}</div>
                      ) : null}
                    </td>
                    <td>{e.checkIn || '—'}</td>
                    <td>{e.checkOut || '—'}</td>
                    <td>
                      <span className={`${styles.status} ${meta.className}`}>{meta.label}</span>
                    </td>
                    <td>{formatHours(e.hoursWorked)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
