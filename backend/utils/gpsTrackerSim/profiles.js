/**
 * Fleet Behaviour Profiles — vehicle-class agnostic defaults.
 */
const PROFILES = {
  delivery: {
    label: 'Delivery Vehicle',
    speedProfile: 'city',
    defaultStopMinutes: 18,
    routeType: 'multiStop',
    workStart: '08:30',
    workEnd: '17:30',
    lunchStart: '13:00',
    lunchMinutes: 45,
  },
  sales: {
    label: 'Sales Vehicle',
    speedProfile: 'city',
    defaultStopMinutes: 25,
    routeType: 'multiStop',
    workStart: '09:00',
    workEnd: '18:00',
    lunchStart: '13:00',
    lunchMinutes: 60,
  },
  taxi: {
    label: 'Taxi',
    speedProfile: 'city',
    defaultStopMinutes: 5,
    routeType: 'circular',
    workStart: '07:00',
    workEnd: '22:00',
    lunchStart: '14:00',
    lunchMinutes: 30,
  },
  serviceEngineer: {
    label: 'Service Engineer',
    speedProfile: 'city',
    defaultStopMinutes: 40,
    routeType: 'aToBReturn',
    workStart: '08:00',
    workEnd: '17:00',
    lunchStart: '12:30',
    lunchMinutes: 45,
  },
  patrol: {
    label: 'Patrol Vehicle',
    speedProfile: 'slow',
    defaultStopMinutes: 3,
    routeType: 'circular',
    workStart: '06:00',
    workEnd: '18:00',
    lunchStart: '12:00',
    lunchMinutes: 30,
  },
  shuttle: {
    label: 'Shuttle',
    speedProfile: 'city',
    defaultStopMinutes: 8,
    routeType: 'aToBReturn',
    workStart: '07:30',
    workEnd: '20:00',
    lunchStart: '13:00',
    lunchMinutes: 40,
  },
  custom: {
    label: 'Custom',
    speedProfile: 'city',
    defaultStopMinutes: 15,
    routeType: 'multiStop',
    workStart: '08:30',
    workEnd: '17:30',
    lunchStart: '13:00',
    lunchMinutes: 45,
  },
};

function getProfile(key) {
  return PROFILES[key] || PROFILES.delivery;
}

function listProfiles() {
  return Object.entries(PROFILES).map(([key, v]) => ({ key, ...v }));
}

module.exports = { PROFILES, getProfile, listProfiles };
