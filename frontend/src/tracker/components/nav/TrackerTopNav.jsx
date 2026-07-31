import React from 'react';
import { NavLink } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import styles from './TrackerTopNav.module.css';

// ✅ Module sections — add future Tracker pages here
const NAV_ITEMS = [
  { to: '/dashboard/tracker-overview', label: 'Tracker Overview' },
  { to: '/dashboard/fleet-analytics', label: 'Fleet Analytics' },
];

/**
 * Tracker module header bar — navigation tabs (left) + actions (right).
 * Acts as the page header itself; pages should not render a separate heading.
 *
 * @param {Date|null}  lastUpdated  — optional "Updated hh:mm:ss" hint
 * @param {function}   onRefresh    — optional Refresh action
 * @param {ReactNode}  rightContent — optional extra actions (chips, fab…)
 */
export default function TrackerTopNav({ lastUpdated, onRefresh, rightContent }) {
  return (
    <header className={styles.bar}>
      <nav className={styles.tabs} aria-label="Tracker sections">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.active : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.right}>
        {lastUpdated && (
          <span className={styles.updated}>
            Updated{' '}
            {lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
        )}
        {onRefresh && (
          <button type="button" className={styles.refresh} onClick={onRefresh}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        )}
        {rightContent}
      </div>
    </header>
  );
}
