import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Spinner } from 'react-bootstrap';

export default function TrackerActivityChart({ series = [], loading }) {
  const data = useMemo(
    () =>
      (series || []).map((s) => ({
        time: new Date(s.bucketStart).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        }),
        movingMinutes: s.movingMinutes,
      })),
    [series]
  );

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: 220 }}>
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-muted text-center py-5" style={{ fontSize: '0.8rem' }}>
        No activity data for this range
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit=" m" width={40} />
          <Tooltip />
          <Bar dataKey="movingMinutes" name="Moving minutes" fill="#43e97b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
