import React from 'react';
import { Form } from 'react-bootstrap';
import styles from './AttendanceFilterBar.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'present', label: 'Present' },
  { value: 'on_site', label: 'On site' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
];

const SITE_OPTIONS = [
  { value: 'all', label: 'All sites' },
  { value: 'office', label: 'Office' },
  { value: 'fleet', label: 'Fleet' },
];

export default function AttendanceFilterBar({
  selectedDate,
  onDateChange,
  search,
  onSearch,
  statusFilter,
  onStatusChange,
  siteFilter,
  onSiteChange,
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <Form.Control
          type="date"
          size="sm"
          className={styles.dateInput}
          value={selectedDate || ''}
          onChange={(e) => onDateChange?.(e.target.value)}
          aria-label="Attendance date"
        />
        <Form.Control
          type="search"
          size="sm"
          className={styles.search}
          placeholder="Search name, ID, department…"
          value={search || ''}
          onChange={(e) => onSearch?.(e.target.value)}
          aria-label="Search employees"
        />
      </div>
      <div className={styles.right}>
        <Form.Select
          size="sm"
          className={styles.select}
          value={statusFilter || 'all'}
          onChange={(e) => onStatusChange?.(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Form.Select>
        <Form.Select
          size="sm"
          className={styles.select}
          value={siteFilter || 'all'}
          onChange={(e) => onSiteChange?.(e.target.value)}
          aria-label="Filter by site type"
        >
          {SITE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Form.Select>
      </div>
    </div>
  );
}
