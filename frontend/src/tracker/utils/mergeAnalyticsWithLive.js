/**
 * Merge analytics vehicle rows with live-location DTOs by deviceId.
 * Live fields overlay: status, speed, lastSeenAt.
 */
export function mergeAnalyticsWithLive(analyticsItems = [], liveById = {}) {
  return (analyticsItems || []).map((row) => {
    const live = liveById[row.deviceId];
    if (!live) {
      return {
        ...row,
        status: null,
        speed: null,
        lastSeenAt: row.lastOnline || null,
        liveAvailable: false,
      };
    }
    return {
      ...row,
      status: live.status ?? null,
      speed: live.speed ?? null,
      lastSeenAt: live.lastSeenAt || row.lastOnline || null,
      displayName: row.displayName || live.displayName,
      deviceModel: row.deviceModel || live.deviceModel || null,
      liveAvailable: true,
    };
  });
}

/**
 * Derive Engine ON/OFF from live status (no per-card ignition API).
 * moving/idle → ON, parked → OFF, needsAttention/missing → —
 */
export function engineStateFromStatus(status) {
  if (status === 'moving' || status === 'idle') return 'ON';
  if (status === 'parked') return 'OFF';
  return null;
}

/**
 * Build a map of deviceId → live location from API envelope.
 */
export function liveLocationsToMap(liveResponse) {
  const locations =
    liveResponse?.data?.locations ||
    liveResponse?.locations ||
    [];
  const map = {};
  for (const loc of locations) {
    if (loc?.deviceId) map[loc.deviceId] = loc;
  }
  return map;
}
