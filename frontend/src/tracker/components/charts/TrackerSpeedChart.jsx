import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Spinner } from 'react-bootstrap';

export default function TrackerSpeedChart({ series = [], loading }) {
  const data = useMemo(
    () =>
      (series || []).map((s) => ({
        time: new Date(s.bucketStart).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        }),
        avgSpeed: s.avgSpeed,
        maxSpeed: s.maxSpeed,
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
        No speed data for this range
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit=" km/h" width={48} />
          <Tooltip />
          <Line type="monotone" dataKey="avgSpeed" name="Avg speed" stroke="#0d6efd" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="maxSpeed" name="Max speed" stroke="#198754" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
