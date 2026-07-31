/** Street / neighbourhood zoom when focusing one vehicle */
export const MAP_FOCUS_ZOOM = 15;
/** Cap for Fit All / initial fleet bounds (avoids over-zooming on one point) */
export const MAP_FIT_MAX_ZOOM = 14;

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

/** Valid [lat, lon] pairs for Leaflet bounds / markers */
export function toLatLngs(locations) {
  return (locations || [])
    .filter((l) => isValidCoordinates(l.latitude, l.longitude))
    .map((l) => [Number(l.latitude), Number(l.longitude)]);
}

/** ✅ Zoom map to one vehicle (select / Centre Map) */
export function focusMapOnPoint(map, lat, lon, zoom = MAP_FOCUS_ZOOM) {
  if (!map || !isValidCoordinates(lat, lon)) return;
  map.flyTo([Number(lat), Number(lon)], zoom, { duration: 0.45 });
}

/** ✅ Frame all valid vehicles (Fit All / first load) */
export function fitMapToLocations(map, locations, options = {}) {
  if (!map) return false;
  const latLngs = toLatLngs(locations);
  if (latLngs.length === 0) return false;
  const maxZoom = options.maxZoom ?? MAP_FIT_MAX_ZOOM;
  const padding = options.padding ?? [40, 40];
  if (latLngs.length === 1) {
    map.setView(latLngs[0], maxZoom);
  } else {
    map.fitBounds(latLngs, { padding, maxZoom });
  }
  return true;
}
