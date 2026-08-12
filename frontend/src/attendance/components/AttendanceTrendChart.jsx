import React, { useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import styles from './AttendanceTrendChart.module.css';

const AXIS = { fontSize: 10, fill: '#64748b' };
const GRID = { stroke: '#e2e8f0', strokeDasharray: '4 4' };

function formatDayLabel(ymd) {
  if (!ymd || ymd.length < 10) return ymd || '';
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return ymd.slice(5);
  }
}

export default function AttendanceTrendChart({ series = [], loading }) {
  const data = useMemo(
    () =>
      (series || []).map((s) => ({
        label: formatDayLabel(s.date),
        present: s.present ?? 0,
        absent: s.absent ?? 0,
        attendancePct: s.attendancePct ?? 0,
      })),
    [series]
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h6 className={styles.title}>Attendance trend (7 days)</h6>
        <span className={styles.hint}>Present / absent + attendance %</span>
      </div>
      <div className={styles.chart}>
        {loading ? (
          <div className={styles.loading}>
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis yAxisId="count" tick={AXIS} axisLine={false} tickLine={false} width={32} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="count"
                dataKey="present"
                name="Present"
                fill="#34d399"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                yAxisId="count"
                dataKey="absent"
                name="Absent"
                fill="#fca5a5"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="attendancePct"
                name="Attendance %"
                stroke="#0d7377"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
