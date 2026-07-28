/**
 * ✅ Haversine distance in meters (tracker-owned; independent of crane utils).
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

function isValidCoordinates(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  return (
    Number.isFinite(latNum) &&
    Number.isFinite(lonNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lonNum >= -180 &&
    lonNum <= 180 &&
    !(latNum === 0 && lonNum === 0)
  );
}

module.exports = {
  calculateDistanceMeters,
  isValidCoordinates,
};
