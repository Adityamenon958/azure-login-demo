import React, { useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import styles from './AnalyticsCharts.module.css';

function periodLabel(key) {
  if (!key) return '';
  if (key.length === 10) {
    try {
      return new Date(`${key}T00:00:00+05:30`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return key.slice(5);
    }
  }
  return key;
}

/** Secondary analysis band — Hours primary, Distance via tab. */
export default function AnalyticsCharts({ series = [], loading }) {
  const [tab, setTab] = useState('hours');

  const hoursData = useMemo(
    () =>
      (series || []).map((s) => ({
        label: periodLabel(s.periodKey),
        moving: Math.round(((s.movingMs || 0) / 3600000) * 10) / 10,
        idle: Math.round(((s.idleMs || 0) / 3600000) * 10) / 10,
        parked: Math.round(((s.parkedMs || 0) / 3600000) * 10) / 10,
        engineOn: Math.round(((s.engineOnMs || 0) / 3600000) * 10) / 10,
        distance: s.distanceKm || 0,
      })),
    [series]
  );

  if (loading) {
    return (
      <div className={styles.empty}>
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} mb-3`}>
      <div className={styles.headerRow}>
        <h6 className={styles.title}>Fleet trends</h6>
        <div className={styles.tabs} role="tablist" aria-label="Trend chart">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'hours'}
            className={`${styles.tab} ${tab === 'hours' ? styles.tabActive : ''}`}
            onClick={() => setTab('hours')}
          >
            Hours
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'distance'}
            className={`${styles.tab} ${tab === 'distance' ? styles.tabActive : ''}`}
            onClick={() => setTab('distance')}
          >
            Distance
          </button>
        </div>
      </div>

      {hoursData.length === 0 ? (
        <div className={styles.empty}>No series data</div>
      ) : tab === 'hours' ? (
        <div className={styles.chartBoxPrimary}>
          <ResponsiveContainer>
            <ComposedChart data={hoursData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="moving" stackId="a" fill="#15803d" name="Moving" />
              <Bar dataKey="idle" stackId="a" fill="#ca8a04" name="Idle" />
              <Bar dataKey="parked" stackId="a" fill="#334155" name="Parked" />
              <Line
                type="monotone"
                dataKey="engineOn"
                stroke="#0d6efd"
                strokeWidth={2}
                name="Engine ON"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className={styles.chartBoxPrimary}>
          <ResponsiveContainer>
            <LineChart data={hoursData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="distance"
                stroke="#0369a1"
                strokeWidth={2}
                name="km"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
