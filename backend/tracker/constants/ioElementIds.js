/**
 * ✅ Phase 0 — Locked Teltonika AVL IO ID profile (FMC/FMB family common IDs).
 * Align with Teltonika_Tracker team if device models differ.
 * Frontend never sees these IDs — only named fields from avlMapper.
 */
module.exports = {
  IGNITION: 239,
  MOVEMENT: 240,
  EXTERNAL_VOLTAGE: 66, // often millivolts
  BATTERY_VOLTAGE: 67, // often millivolts
  GSM_SIGNAL: 21,
  GNSS_STATUS: 69,
  SLEEP_MODE: 200,
  PDOP: 181,
  HDOP: 182,
  TOTAL_ODOMETER: 16,
  TRIP_ODOMETER: 199,
};
