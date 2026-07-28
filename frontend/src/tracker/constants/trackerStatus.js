export const TRACKER_STATUSES = {
  MOVING: 'moving',
  IDLE: 'idle',
  PARKED: 'parked',
  NEEDS_ATTENTION: 'needsAttention',
};

export const STATUS_LABELS = {
  moving: 'Moving',
  idle: 'Idle',
  parked: 'Parked',
  needsAttention: 'Needs Attention',
  // ✅ Legacy aliases (older clients / cached filters)
  online: 'Parked',
  offline: 'Needs Attention',
};

/** Accent colors for badges / map markers (enterprise muted) */
export const STATUS_COLORS = {
  moving: '#15803D',
  idle: '#B45309',
  parked: '#334155',
  needsAttention: '#B91C1C',
  online: '#334155',
  offline: '#B91C1C',
};

export const STATUS_CHIP_BG = {
  moving: '#F0FDF4',
  idle: '#FFFBEB',
  parked: '#F8FAFC',
  needsAttention: '#FEF2F2',
};

export const STATUS_SUBTITLES = {
  moving: 'In transit',
  idle: 'Ignition on',
  parked: 'Ignition off',
  needsAttention: 'No recent signal',
};

/** Normalize legacy status keys to current taxonomy */
export function normalizeStatus(status) {
  if (status === 'online') return 'parked';
  if (status === 'offline') return 'needsAttention';
  return status;
}
