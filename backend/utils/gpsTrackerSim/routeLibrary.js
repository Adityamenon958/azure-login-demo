/**
 * Route Library — architecture stub for V1.
 * Future: save reusable routes (Office Delivery, Airport Shuttle, …)
 * and reference via SimulatorDevice.routeLibraryId.
 * Tick engine always consumes waypoints[] only — no redesign required.
 */

/**
 * @typedef {Object} SimRouteLibraryDoc
 * @property {string} name
 * @property {string} [companyName]
 * @property {boolean} [isSharedTemplate]
 * @property {'circular'|'aToBReturn'|'multiStop'|'custom'} routeType
 * @property {Array<{id?:string,name:string,lat:number,lon:number,stopDurationMinutes?:number,placeQuery?:string}>} waypoints
 * @property {string} [createdBy]
 * @property {Date} [updatedAt]
 */

/** @returns {null} V1 does not persist library docs yet */
function getRouteById(/* routeLibraryId */) {
  return null;
}

/** Copy library waypoints onto a sim config shape (no-op until CRUD exists). */
function copyWaypointsFromLibrary(libraryDoc) {
  if (!libraryDoc || !Array.isArray(libraryDoc.waypoints)) return [];
  return libraryDoc.waypoints.map((w, i) => ({
    id: w.id || `lib-${i}`,
    name: w.name || `Stop ${i + 1}`,
    lat: Number(w.lat),
    lon: Number(w.lon),
    stopDurationMinutes: w.stopDurationMinutes != null ? Number(w.stopDurationMinutes) : 12,
    placeQuery: w.placeQuery || w.name || '',
  }));
}

module.exports = {
  getRouteById,
  copyWaypointsFromLibrary,
};
