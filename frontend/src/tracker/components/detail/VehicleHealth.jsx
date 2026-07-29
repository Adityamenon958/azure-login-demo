import React, { useState } from 'react';
import { formatVoltage } from '../../utils/formatters';
import { formatGnssStatus, formatGsmSignal } from '../../utils/liveStatusLabels';
import { getDeviceCapabilities } from '../../constants/deviceCapabilities';
import styles from './VehicleHealth.module.css';

export default function VehicleHealth({ state, deviceModel }) {
  const [open, setOpen] = useState(false);
  const caps = getDeviceCapabilities(deviceModel);
  const health = caps.health || [];

  const rows = [];
  if (health.includes('gsmSignal')) {
    rows.push({
      label: 'GSM signal',
      value: state?.gsmSignalLabel || formatGsmSignal(state?.gsmSignal),
    });
  }
  if (health.includes('gnssStatus')) {
    rows.push({
      label: 'GPS',
      value:
        state?.gnssStatusLabel ||
        formatGnssStatus(state?.gnssStatus, {
          latitude: state?.latitude,
          longitude: state?.longitude,
        }),
    });
  }
  if (health.includes('sleepMode')) {
    rows.push({ label: 'Sleep mode', value: state?.sleepMode ? 'Yes' : 'No' });
  }
  if (health.includes('battery')) {
    rows.push({ label: 'Battery', value: formatVoltage(state?.batteryVoltage) });
  }
  if (health.includes('externalVoltage')) {
    rows.push({ label: 'External Power', value: formatVoltage(state?.externalVoltage) });
  }
  if (health.includes('pdop')) {
    rows.push({ label: 'PDOP', value: state?.pdop ?? '—' });
  }
  if (health.includes('hdop')) {
    rows.push({ label: 'HDOP', value: state?.hdop ?? '—' });
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.head} onClick={() => setOpen((v) => !v)}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Tracker health
        </h6>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          {open ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>
      {open && (
        <div className={styles.body}>
          {rows.map((r) => (
            <div key={r.label} className={styles.row}>
              <span>{r.label}</span>
              <strong>{r.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
