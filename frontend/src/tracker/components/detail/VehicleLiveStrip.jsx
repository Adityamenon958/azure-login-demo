import React, { useMemo } from 'react';
import { getDeviceCapabilities } from '../../constants/deviceCapabilities';
import {
  formatSpeed,
  formatVoltage,
} from '../../utils/formatters';
import {
  formatGnssStatus,
  formatGsmSignal,
  formatHeadingCardinal,
  formatMovement,
} from '../../utils/liveStatusLabels';
import styles from './VehicleLiveStrip.module.css';

function Chip({ label, value, valueClassName }) {
  return (
    <div className={styles.chip}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${valueClassName || ''}`}>{value}</span>
    </div>
  );
}

export default function VehicleLiveStrip({ state, deviceModel }) {
  const caps = useMemo(() => getDeviceCapabilities(deviceModel), [deviceModel]);
  const live = caps.live || [];

  const gpsLabel = formatGnssStatus(state?.gnssStatus, {
    latitude: state?.latitude,
    longitude: state?.longitude,
  });

  const chips = [];
  if (live.includes('speed')) {
    chips.push({ key: 'speed', label: 'Speed', value: formatSpeed(state?.speed) });
  }
  if (live.includes('ignition')) {
    chips.push({
      key: 'ignition',
      label: 'Ignition',
      value: state?.ignition ? 'ON' : 'OFF',
      valueClassName: state?.ignition ? styles.on : styles.off,
    });
  }
  if (live.includes('movement')) {
    chips.push({
      key: 'movement',
      label: 'Movement',
      value: formatMovement(state?.movement),
    });
  }
  if (live.includes('gps')) {
    chips.push({ key: 'gps', label: 'GPS', value: gpsLabel });
  }
  if (live.includes('satellites')) {
    chips.push({
      key: 'sats',
      label: 'Satellites',
      value: state?.satellites != null ? String(state.satellites) : '—',
    });
  }
  if (live.includes('battery')) {
    chips.push({ key: 'battery', label: 'Battery', value: formatVoltage(state?.batteryVoltage) });
  }
  if (live.includes('externalVoltage')) {
    chips.push({
      key: 'supply',
      label: 'External Power',
      value: formatVoltage(state?.externalVoltage),
    });
  }
  if (live.includes('heading')) {
    chips.push({
      key: 'heading',
      label: 'Heading',
      value: formatHeadingCardinal(state?.heading),
    });
  }
  if (live.includes('gsmSignal')) {
    chips.push({
      key: 'gsm',
      label: 'GSM',
      value: formatGsmSignal(state?.gsmSignal),
    });
  }
  if (live.includes('rpm') && state?.rpm != null) {
    chips.push({ key: 'rpm', label: 'RPM', value: String(state.rpm) });
  }
  if (live.includes('fuelLevel') && state?.fuelLevel != null) {
    chips.push({ key: 'fuel', label: 'Fuel', value: `${state.fuelLevel}%` });
  }

  return (
    <div className={styles.strip}>
      {chips.map((c) => (
        <Chip
          key={c.key}
          label={c.label}
          value={c.value}
          valueClassName={c.valueClassName}
        />
      ))}
    </div>
  );
}
