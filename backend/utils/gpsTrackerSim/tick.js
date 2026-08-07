const { getProfile } = require('./profiles');
const {
  buildWaypoints,
  haversineMeters,
  bearingDegrees,
  interpolate,
  nextIndex,
} = require('./routes');
const { getDayPhase } = require('./schedule');
const { pickSpeed } = require('./speed');
const { STATES, signalsForState, minutesInState } = require('./stateMachine');
const { buildAvlRecordDoc } = require('./avlBuilder');

function ensureWaypoints(sim) {
  if (Array.isArray(sim.waypoints) && sim.waypoints.length >= 2) {
    return sim.waypoints;
  }
  const profile = getProfile(sim.behaviourProfile);
  return buildWaypoints({
    routeType: sim.routeType || profile.routeType,
    baseLat: sim.latitude,
    baseLon: sim.longitude,
    customWaypoints: sim.waypoints,
    defaultStopMinutes: sim.defaultStopMinutes || profile.defaultStopMinutes,
  });
}

function setState(runtime, state, now) {
  if (runtime.fleetState !== state) {
    runtime.fleetState = state;
    runtime.stateEnteredAt = now;
  }
}

/**
 * Advance one simulation tick. Returns { avlDoc fields inputs, runtimePatch }.
 */
function advanceTick(sim, { now = new Date(), intervalSeconds = 60 } = {}) {
  const waypoints = ensureWaypoints(sim);
  const profile = getProfile(sim.behaviourProfile);
  const speedProfile = sim.speedProfile || profile.speedProfile;
  const stopMins = Number(sim.defaultStopMinutes) || profile.defaultStopMinutes || 15;

  const runtime = {
    fleetState: sim.fleetState || STATES.OFFLINE,
    stateEnteredAt: sim.stateEnteredAt ? new Date(sim.stateEnteredAt) : now,
    currentWaypointIndex: sim.currentWaypointIndex || 0,
    segmentProgress: sim.segmentProgress || 0,
    currentLat: sim.currentLat != null ? sim.currentLat : waypoints[0].lat,
    currentLon: sim.currentLon != null ? sim.currentLon : waypoints[0].lon,
    currentSpeedKmh: sim.currentSpeedKmh || 0,
    odometerMeters: sim.odometerMeters || 0,
    tripDistanceMeters: sim.tripDistanceMeters || 0,
    tripId: sim.tripId || '',
    overrideState: sim.overrideState,
    overrideTicksLeft: sim.overrideTicksLeft || 0,
  };

  // Live override for demos
  if (runtime.overrideState && runtime.overrideTicksLeft > 0) {
    setState(runtime, runtime.overrideState, now);
    runtime.overrideTicksLeft -= 1;
    if (runtime.overrideTicksLeft <= 0) runtime.overrideState = null;
  } else {
    const phase = getDayPhase(sim, now);
    const idx = Math.min(runtime.currentWaypointIndex, waypoints.length - 1);
    const here = waypoints[idx];
    const nextIdx = nextIndex(idx, waypoints.length);
    const next = waypoints[nextIdx];
    const isLastLegHome =
      nextIdx === 0 || (next.name || '').toLowerCase().includes('warehouse') || nextIdx === waypoints.length - 1;

    if (phase === 'beforeWork' || phase === 'afterWork') {
      setState(runtime, STATES.OFFLINE, now);
      runtime.currentLat = waypoints[0].lat;
      runtime.currentLon = waypoints[0].lon;
      runtime.currentSpeedKmh = 0;
      runtime.segmentProgress = 0;
      runtime.currentWaypointIndex = 0;
    } else if (phase === 'lunch') {
      setState(runtime, STATES.PARKED, now);
      runtime.currentSpeedKmh = 0;
    } else {
      // working
      switch (runtime.fleetState) {
        case STATES.OFFLINE:
          setState(runtime, STATES.ENGINE_ON, now);
          runtime.tripId = `T-${Date.now()}`;
          runtime.tripDistanceMeters = 0;
          break;
        case STATES.ENGINE_ON:
          if (minutesInState(runtime, now) >= 0.5) {
            setState(runtime, STATES.MOVING, now);
            runtime.segmentProgress = 0;
          }
          break;
        case STATES.MOVING:
        case STATES.RETURN_HOME: {
          const dist = haversineMeters(here.lat, here.lon, next.lat, next.lon) || 1;
          const nearStop = runtime.segmentProgress > 0.88;
          const speed = pickSpeed(speedProfile, runtime.currentSpeedKmh, nearStop);
          runtime.currentSpeedKmh = speed;
          const stepMeters = (speed * 1000 * intervalSeconds) / 3600;
          const delta = stepMeters / dist;
          runtime.segmentProgress = Math.min(1, runtime.segmentProgress + delta);
          const pos = interpolate(here.lat, here.lon, next.lat, next.lon, runtime.segmentProgress);
          const moved = haversineMeters(runtime.currentLat, runtime.currentLon, pos.lat, pos.lon);
          runtime.currentLat = pos.lat;
          runtime.currentLon = pos.lon;
          runtime.odometerMeters += moved;
          runtime.tripDistanceMeters += moved;
          if (isLastLegHome && idx >= waypoints.length - 2) {
            setState(runtime, STATES.RETURN_HOME, now);
          }
          if (runtime.segmentProgress >= 1) {
            setState(runtime, STATES.ARRIVED, now);
            runtime.currentWaypointIndex = nextIdx;
            runtime.segmentProgress = 0;
            runtime.currentLat = next.lat;
            runtime.currentLon = next.lon;
            runtime.currentSpeedKmh = 0;
          }
          break;
        }
        case STATES.ARRIVED:
          setState(runtime, STATES.IDLE, now);
          break;
        case STATES.IDLE: {
          const dwell = here.stopDurationMinutes != null ? here.stopDurationMinutes : stopMins;
          if (minutesInState(runtime, now) >= Math.min(dwell, 8)) {
            // brief parked then go — or stay idle then move
            if (minutesInState(runtime, now) >= dwell) {
              if (runtime.currentWaypointIndex === 0 && runtime.tripDistanceMeters > 500) {
                setState(runtime, STATES.PARKED, now);
              } else {
                setState(runtime, STATES.MOVING, now);
                runtime.segmentProgress = 0;
              }
            } else if (minutesInState(runtime, now) >= 3) {
              setState(runtime, STATES.PARKED, now);
            }
          }
          break;
        }
        case STATES.PARKED: {
          const dwell = here.stopDurationMinutes != null ? here.stopDurationMinutes : stopMins;
          if (minutesInState(runtime, now) >= Math.max(2, dwell * 0.35)) {
            // Resume route unless we're home after a trip near end of day handled by phase
            if (runtime.currentWaypointIndex === 0 && runtime.tripDistanceMeters > 1000) {
              // completed loop — start next loop
              runtime.tripDistanceMeters = 0;
              runtime.tripId = `T-${Date.now()}`;
            }
            setState(runtime, STATES.MOVING, now);
            runtime.segmentProgress = 0;
          }
          break;
        }
        default:
          setState(runtime, STATES.ENGINE_ON, now);
      }
    }
  }

  const idx = Math.min(runtime.currentWaypointIndex, waypoints.length - 1);
  const nextIdx = nextIndex(idx, waypoints.length);
  const here = waypoints[idx];
  const next = waypoints[nextIdx];
  const heading = bearingDegrees(
    runtime.currentLat,
    runtime.currentLon,
    next.lat,
    next.lon
  );
  const sig = signalsForState(runtime.fleetState, runtime.currentSpeedKmh);
  const distRemain = haversineMeters(runtime.currentLat, runtime.currentLon, next.lat, next.lon);
  const etaMs =
    sig.speed > 0 ? (distRemain / ((sig.speed * 1000) / 3600)) * 1000 : null;

  return {
    runtime,
    waypoints,
    telemetry: {
      lat: runtime.currentLat,
      lon: runtime.currentLon,
      speedKmh: sig.speed,
      heading,
      ignition: sig.ignition,
      movement: sig.movement,
      odometerMeters: runtime.odometerMeters,
    },
    meta: {
      nextWaypointName: next.name,
      currentWaypointName: here.name,
      etaMs,
      state: runtime.fleetState,
    },
  };
}

function buildAvlFromTick(sim, deviceObjectId, tickResult, timestamp = new Date()) {
  const t = tickResult.telemetry;
  return buildAvlRecordDoc({
    deviceObjectId,
    imei: sim.imei,
    timestamp,
    lat: t.lat,
    lon: t.lon,
    speedKmh: t.speedKmh,
    heading: t.heading,
    ignition: t.ignition,
    movement: t.movement,
    odometerMeters: t.odometerMeters,
  });
}

module.exports = {
  advanceTick,
  buildAvlFromTick,
  ensureWaypoints,
};
