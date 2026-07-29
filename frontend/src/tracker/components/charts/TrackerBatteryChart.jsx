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

export default function TrackerBatteryChart({ series = [], loading }) {
  const data = useMemo(
    () =>
      (series || [])
        .filter((s) => s.avgBatteryVoltage != null)
        .map((s) => ({
          time: new Date(s.bucketStart).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          }),
          battery: s.avgBatteryVoltage,
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
        No battery data for this range
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit=" V" width={40} domain={['auto', 'auto']} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="battery"
            name="Battery V"
            stroke="#b45309"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
