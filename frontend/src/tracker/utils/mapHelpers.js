export function isValidCoordinates(lat, lon) {
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

export function getGoogleMapsUrl(lat, lon) {
  if (!isValidCoordinates(lat, lon)) return null;
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

export function averageCenter(locations) {
  const valid = (locations || []).filter((l) =>
    isValidCoordinates(l.latitude, l.longitude)
  );
  if (valid.length === 0) return [20.5937, 78.9629]; // India default
  const lat =
    valid.reduce((s, l) => s + Number(l.latitude), 0) / valid.length;
  const lon =
    valid.reduce((s, l) => s + Number(l.longitude), 0) / valid.length;
  return [lat, lon];
}
