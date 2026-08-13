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
import { formatHoursAndMins } from '../../utils/analyticsFormatters';

/** Fleet trends palette — soft, readable stacked bars + distinct engine line */
const CHART_COLORS = {
  moving: '#34d399', // emerald-400
  idle: '#fbbf24', // amber-400
  parked: '#94a3b8', // slate-400 (lighter than old dark navy)
  engineOn: '#6366f1', // indigo-500 — stands out on bars
  distance: '#14b8a6', // teal-500
};

const AXIS = { fontSize: 10, fill: '#64748b' };
const GRID = { stroke: '#e2e8f0', strokeDasharray: '4 4' };

function periodLabel(key) {
  if (!key) return '';
  const hm = String(key).match(/T(\d{2}):(\d{2})$/);
  if (hm) return `${hm[1]}:${hm[2]}`;
  // ✅ Hourly: "2026-08-13T08" → 08:00
  const hourMatch = String(key).match(/T(\d{2})$/);
  if (hourMatch) return `${hourMatch[1]}:00`;
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
export default function AnalyticsCharts({
  series = [],
  loading,
  title = 'Fleet trends',
  showTodaySuffix = true,
}) {
  const [tab, setTab] = useState('hours');
  const grain = (series || [])[0]?.granularity;
  const isTimeAxis = grain === 'hour' || grain === '5m' || grain === '15m';
  const isHourly = grain === 'hour';

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
        <h6 className={styles.title}>
          {title}
          {showTodaySuffix && isHourly ? ' · today' : ''}
        </h6>
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
            <ComposedChart data={hoursData} barCategoryGap={isTimeAxis ? '10%' : '18%'}>
              <CartesianGrid {...GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                interval={isTimeAxis ? (hoursData.length > 16 ? 1 : 0) : 'preserveStartEnd'}
                angle={isTimeAxis ? -40 : 0}
                textAnchor={isTimeAxis ? 'end' : 'middle'}
                height={isTimeAxis ? 42 : 24}
              />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                formatter={(value) => formatHoursAndMins(value)}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
              <Bar
                dataKey="moving"
                stackId="a"
                fill={CHART_COLORS.moving}
                name="Moving"
                radius={[0, 0, 0, 0]}
              />
              <Bar dataKey="idle" stackId="a" fill={CHART_COLORS.idle} name="Idle" />
              <Bar
                dataKey="parked"
                stackId="a"
                fill={CHART_COLORS.parked}
                name="Parked"
                radius={[6, 6, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="engineOn"
                stroke={CHART_COLORS.engineOn}
                strokeWidth={2.5}
                name="Engine ON"
                dot={isTimeAxis ? false : { r: 3, fill: CHART_COLORS.engineOn, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className={styles.chartBoxPrimary}>
          <ResponsiveContainer>
            <LineChart data={hoursData}>
              <CartesianGrid {...GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                interval={isTimeAxis ? (hoursData.length > 16 ? 1 : 0) : 'preserveStartEnd'}
                angle={isTimeAxis ? -40 : 0}
                textAnchor={isTimeAxis ? 'end' : 'middle'}
                height={isTimeAxis ? 42 : 24}
              />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                }}
              />
              <Line
                type="monotone"
                dataKey="distance"
                stroke={CHART_COLORS.distance}
                strokeWidth={2.5}
                name="km"
                dot={isTimeAxis ? false : { r: 3, fill: CHART_COLORS.distance, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
