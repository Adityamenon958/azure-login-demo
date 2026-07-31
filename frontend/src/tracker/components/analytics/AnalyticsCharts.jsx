import React, { useMemo } from 'react';
import { Col, Row, Spinner } from 'react-bootstrap';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import styles from './AnalyticsCharts.module.css';

const PIE_COLORS = ['#15803d', '#ca8a04', '#dc2626', '#64748b'];

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

export default function AnalyticsCharts({ series = [], kpis, loading }) {
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

  const utilPie = useMemo(() => {
    const k = kpis || {};
    return [
      { name: 'Active', value: k.activeVehicles || 0 },
      { name: 'Underutilized', value: k.underutilized || 0 },
      { name: 'Overworked', value: k.overworked || 0 },
      {
        name: 'Other',
        value: Math.max(
          0,
          (k.totalVehicles || 0) -
            (k.activeVehicles || 0) -
            (k.underutilized || 0) -
            (k.overworked || 0)
        ),
      },
    ].filter((d) => d.value > 0);
  }, [kpis]);

  if (loading) {
    return (
      <div className={styles.empty}>
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  return (
    <Row className="g-2 mb-3">
      <Col xs={12} lg={5}>
        <div className={styles.wrap}>
          <h6 className={styles.title}>Fleet hours by period</h6>
          {hoursData.length === 0 ? (
            <div className={styles.empty}>No series data</div>
          ) : (
            <div className={styles.chartBox}>
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
          )}
        </div>
      </Col>
      <Col xs={12} lg={4}>
        <div className={styles.wrap}>
          <h6 className={styles.title}>Distance trend</h6>
          {hoursData.length === 0 ? (
            <div className={styles.empty}>No series data</div>
          ) : (
            <div className={styles.chartBox}>
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
      </Col>
      <Col xs={12} lg={3}>
        <div className={styles.wrap}>
          <h6 className={styles.title}>Utilization mix</h6>
          {utilPie.length === 0 ? (
            <div className={styles.empty}>No KPI data</div>
          ) : (
            <div className={styles.chartBox}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={utilPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {utilPie.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Col>
    </Row>
  );
}
