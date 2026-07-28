/**
 * ✅ Tracker status derivation rules (server-side only).
 */
const OFFLINE_AFTER_MS = 15 * 60 * 1000; // 15 minutes
const MOVING_SPEED_KMH = 3;

const STATUSES = Object.freeze({
  ONLINE: 'online',
  MOVING: 'moving',
  IDLE: 'idle',
  OFFLINE: 'offline',
});

/**
 * @param {{ lastSeenAt: Date|null, speed?: number, ignition?: boolean, movement?: boolean }} input
 * @param {Date} [now]
 * @returns {'online'|'moving'|'idle'|'offline'}
 */
function deriveStatus(input, now = new Date()) {
  const lastSeenAt = input.lastSeenAt ? new Date(input.lastSeenAt) : null;
  if (!lastSeenAt || Number.isNaN(lastSeenAt.getTime())) {
    return STATUSES.OFFLINE;
  }

  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs > OFFLINE_AFTER_MS) {
    return STATUSES.OFFLINE;
  }

  const speed = Number(input.speed) || 0;
  const movingFlag = input.movement === true;
  if (speed >= MOVING_SPEED_KMH || movingFlag) {
    return STATUSES.MOVING;
  }

  if (input.ignition === true) {
    return STATUSES.IDLE;
  }

  return STATUSES.ONLINE;
}

module.exports = {
  OFFLINE_AFTER_MS,
  MOVING_SPEED_KMH,
  STATUSES,
  deriveStatus,
};
