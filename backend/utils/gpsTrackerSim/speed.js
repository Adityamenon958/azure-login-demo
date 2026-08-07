/**
 * Speed profiles with smooth variation.
 */

const RANGES = {
  slow: { min: 15, max: 30 },
  city: { min: 25, max: 45 },
  highway: { min: 50, max: 80 },
  random: { min: 20, max: 70 },
};

function pickSpeed(speedProfile, previousSpeed = null, nearStop = false) {
  const key = RANGES[speedProfile] ? speedProfile : 'city';
  const { min, max } = RANGES[key];
  if (nearStop) {
    return Math.max(8, min * 0.45);
  }
  let next;
  if (previousSpeed == null || previousSpeed <= 0) {
    next = min + Math.random() * (max - min);
  } else {
    const delta = (Math.random() - 0.5) * 8;
    next = Math.min(max, Math.max(min, previousSpeed + delta));
  }
  return Math.round(next * 10) / 10;
}

module.exports = { RANGES, pickSpeed };
