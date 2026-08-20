import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useKioskMode } from '../../../context/KioskModeContext';
import styles from './TrackerTopNav.module.css';

// ✅ Module sections — add future Tracker pages here
const NAV_ITEMS = [
  { to: '/dashboard/fleet-analytics', label: 'Fleet Monitor' },
  { to: '/dashboard/tracker-overview', label: 'Fleet Map' },
  { to: '/dashboard/attendance', label: 'Attendance' },
];

/**
 * Tracker module header bar — navigation tabs (left) + actions (right).
 * Acts as the page header itself; pages should not render a separate heading.
 *
 * @param {Date|string|null}  lastUpdated  — API freshness preferred
 * @param {function}   onRefresh    — optional Refresh action
 * @param {ReactNode}  rightContent — optional extra actions (chips, fab…)
 */
export default function TrackerTopNav({ lastUpdated, onRefresh, rightContent }) {
  const { isKiosk } = useKioskMode();
  // ✅ Live clock — only in kiosk (app Topbar is hidden then)
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isKiosk) return undefined;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isKiosk]);

  const clockLabel = now.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const updatedDate =
    lastUpdated instanceof Date
      ? lastUpdated
      : lastUpdated
        ? new Date(lastUpdated)
        : null;
  const updatedValid = updatedDate && !Number.isNaN(updatedDate.getTime());

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
        {/* ✅ Kiosk only — Topbar clock is gone when chrome is hidden */}
        {isKiosk && (
          <time
            className={styles.liveClock}
            dateTime={now.toISOString()}
            title={now.toLocaleString()}
            aria-label={`Current time ${clockLabel}`}
          >
            {clockLabel}
          </time>
        )}
        {updatedValid && (
          <span className={styles.updated}>
            Updated{' '}
            {updatedDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
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
