/**
 * Vehicle state machine for fleet behaviour sim.
 */

const STATES = {
  OFFLINE: 'OFFLINE',
  ENGINE_ON: 'ENGINE_ON',
  MOVING: 'MOVING',
  ARRIVED: 'ARRIVED',
  IDLE: 'IDLE',
  PARKED: 'PARKED',
  RETURN_HOME: 'RETURN_HOME',
};

/** Map state → Teltonika-compatible motion signals */
function signalsForState(state, speedKmh = 0) {
  switch (state) {
    case STATES.MOVING:
    case STATES.RETURN_HOME:
      return {
        ignition: true,
        movement: true,
        speed: Math.max(speedKmh, 8),
      };
    case STATES.ENGINE_ON:
    case STATES.ARRIVED:
    case STATES.IDLE:
      return { ignition: true, movement: false, speed: 0 };
    case STATES.PARKED:
    case STATES.OFFLINE:
    default:
      return { ignition: false, movement: false, speed: 0 };
  }
}

function minutesInState(sim, now = new Date()) {
  if (!sim.stateEnteredAt) return 999;
  return (now.getTime() - new Date(sim.stateEnteredAt).getTime()) / 60000;
}

module.exports = { STATES, signalsForState, minutesInState };
