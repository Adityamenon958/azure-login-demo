require('dotenv').config();

// ✅ FIXED: All ChatGPT-suggested fixes implemented for cumulative working hours calculation
// - Fixed calculateConsecutivePeriods to properly filter by status type and handle time gaps
// - Added sanity checks for unrealistic periods (>14 hours)
// - Fixed period processing to only sum active periods for the requested status
// - Improved ongoing session detection with freshness checks
// - Fixed rounding to only occur at the final response level
// - ✅ NEW: Fixed line chart daily aggregation with prevLog seeding for carry-over state detection

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./backend/db');
const Device = require('./backend/models/Device');
const User = require('./backend/models/User');
const LevelSensor = require('./backend/models/LevelSensor');
const SimulatorDevice = require('./backend/models/SimulatorDevice');

const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Razorpay = require('razorpay');
const crypto = require('crypto');  // ✅ For webhook signature verification
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const Alarm = require("./backend/models/Alarm"); 
const { getErrorDetails, normalizeCode } = require("./backend/utils/errorCodeLookup");
const app = express();
const PORT = process.env.PORT || 8080;
/**  In-memory latch: { uid: true | false }  */
const alarmLatch = Object.create(null);
const sendEmail = require("./backend/utils/sendEmail");
const { alarmEmail } = require("./backend/utils/emailTemplates");

const isProd = process.env.NODE_ENV === 'production';
const DISABLE_PAYMENTS = process.env.DISABLE_PAYMENTS === 'true';
const BYPASS_SUBSCRIPTION_CHECK = process.env.BYPASS_SUBSCRIPTION_CHECK === 'true';
const CraneLog = require("./backend/models/CraneLog");
const CompanyDashboardAccess = require("./backend/models/CompanyDashboardAccess");
const { calculateAllCraneDistances, getCurrentDateString, validateGPSData, calculateDistance } = require("./backend/utils/locationUtils");
const ElevatorEvent = require("./backend/models/ElevatorEvent");
const ElevatorZone = require("./backend/models/ElevatorZone");
const EnergyMeterLog = require("./backend/models/EnergyMeterLog");
const EnergyMeterParameterMap = require("./backend/models/EnergyMeterParameterMap");
const {
  validateImeiForDeviceType,
  isImeiDuplicateKeyError,
} = require("./backend/utils/deviceImei");
const {
  validateDeviceModelForType,
  validateDisplayNameForType,
} = require("./backend/utils/deviceCatalog");
// ✅ Temporary Live Device Data Monitor — remove after demo
const demoLiveDataRouter = require('./backend/routes/demoLiveData');
const trackerRoutes = require('./backend/tracker/routes/trackerRoutes');
const {
  parseSampleValueString,
  extractMeterEntries,
  resolveDeviceForMeter,
  getParameterMap,
  buildReadings,
  isMeterOnline,
  formatRelativeTime,
  ensureDefaultParameterMap,
  pickChartMetric,
  pickSparklinePower,
  pickSparklineEnergy,
  buildSparklineSeries,
  buildConsumptionSparkline,
  pickDisplayReading,
  pickActivePowerKw,
  parseChartRange,
  assertValidDataSource,
  mergeMongoFilters,
  getCompanyEnergyViewMode,
  getSimulatorMeterIdsForCompany,
  buildLogVisibilityQuery,
  buildMeterVisibilityFilter,
  buildLogFilterForCompany,
  buildLogFilterForMeters,
  viewModeToShowSimulator,
  showSimulatorToViewMode,
  computeTodayEnergyConsumptionByMeter,
  pickReadingValue,
  computeFleetReadingAverages,
} = require("./backend/utils/energyMeterUtils");
const {
  buildElectricalHealthSummary,
  buildFleetMetricHistory,
} = require("./backend/utils/electricalHealthService");
const { buildMeterConsumptionInsights } = require("./backend/utils/meterConsumptionInsights");
const { buildMeterMetricInsights } = require("./backend/utils/meterMetricInsights");
const { buildFleetConsumptionInsights } = require("./backend/utils/fleetConsumptionInsights");
const { buildFleetMetricInsights } = require("./backend/utils/fleetMetricInsights");
const { buildFleetMetersTable } = require("./backend/utils/fleetMetersTable");
const { buildMeterParameterStats24h } = require("./backend/utils/meterParameterStats");
const {
  evaluateEnergyMeterAlarms,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  listEvents,
  listActiveEvents,
  buildAlarmSummary,
  acknowledgeEvents,
  acknowledgeSingleEvent,
  clearEvent,
  getMetricsMetadata,
  serializeRule,
} = require("./backend/utils/energyMeterAlarmService");
const { ALLOWED_METRIC_KEYS } = require("./backend/utils/electricalHealthMetrics");
const {
  buildEnergyMeterPayload,
  buildPayloadFromReadings,
  VALID_INTERVALS_SECONDS,
  getOverrideRemainingMs,
  isOverrideExpired,
} = require("./backend/utils/energyMeterSim");
const {
  loadEnabledRulesForMeter,
  buildAlarmTestPlan,
  resolveRuleSelections,
  computeBreachReadingsForBounds,
  buildExpectedOutcomes,
  planConsumptionBurst,
  formatReadingsSummary,
} = require("./backend/utils/energyAlarmTestUtils");
const {
  getCatalog,
  getRoomPresets,
  buildConfigSummary,
  validateEnergySimBody,
  pickEnergySimFields,
} = require("./backend/utils/energyApplianceCatalog");
const { generateEnergyReport, listReportHistory } = require('./backend/reports/energy/energyReportOrchestrator');
const { getStorageAdapter } = require('./backend/reports/energy/storage/reportStorageAdapter');

function getEffectiveSubscriptionStatus(user) {
  return BYPASS_SUBSCRIPTION_CHECK ? 'active' : (user.subscriptionStatus || 'inactive');
}

/** Limit device allowlist by optional zone filter (elevators only when filter active). */
function getDeviceAllowlistSet(allowedDevices, query) {
  const elevatorZoneId = query.elevatorZoneId;
  const zoneUnassigned = query.zoneUnassigned;
  const allIds = new Set(allowedDevices.map((d) => d.deviceId));

  if (elevatorZoneId && String(elevatorZoneId).trim()) {
    const filtered = allowedDevices.filter(
      (d) =>
        String(d.deviceType || "").toLowerCase() === "elevator" &&
        d.elevatorZoneId &&
        String(d.elevatorZoneId) === String(elevatorZoneId)
    );
    return new Set(filtered.map((d) => d.deviceId));
  }

  if (zoneUnassigned === "true") {
    const filtered = allowedDevices.filter(
      (d) =>
        String(d.deviceType || "").toLowerCase() === "elevator" && !d.elevatorZoneId
    );
    return new Set(filtered.map((d) => d.deviceId));
  }

  return allIds;
}

const {
  ENABLE_SIMULATOR,
  resolveSimulatorEnabled,
} = require('./backend/utils/simulatorEnv');

// ✅ Log simulator status
const _simEnv = resolveSimulatorEnabled();
if (ENABLE_SIMULATOR) {
  console.log(`[sim] 🚀 Simulator enabled (${_simEnv.reason})`);
} else {
  console.log(`[sim] ⏸️ Simulator disabled (${_simEnv.reason})`);
}

// Simulator state management (timers only - devices stored in database)
const simulatorTimers = new Map();  // DeviceID -> interval timer
const simulatorTickStatus = new Map(); // DeviceID -> { lastTickAt, lastStatus, lastError, consecutiveFailures }

const SIM_RETRY_ATTEMPTS = 3;
const SIM_RETRY_BASE_DELAY_MS = 2000;
const SIM_WATCHDOG_INTERVAL_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryAsync(fn, { retries = SIM_RETRY_ATTEMPTS, delayMs = SIM_RETRY_BASE_DELAY_MS, label = 'operation' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[sim] ⚠️ ${label} failed (attempt ${attempt}/${retries}): ${err.message}; retry in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

function recordTickSuccess(deviceId) {
  simulatorTickStatus.set(deviceId, {
    lastTickAt: new Date(),
    lastStatus: 'success',
    lastError: null,
    consecutiveFailures: 0,
  });
}

function recordTickError(deviceId, message) {
  const prev = simulatorTickStatus.get(deviceId) || { consecutiveFailures: 0 };
  simulatorTickStatus.set(deviceId, {
    lastTickAt: new Date(),
    lastStatus: 'error',
    lastError: message,
    consecutiveFailures: (prev.consecutiveFailures || 0) + 1,
  });
}

function clearSimulatorTimer(deviceId) {
  const timer = simulatorTimers.get(deviceId);
  if (timer) {
    clearInterval(timer);
    simulatorTimers.delete(deviceId);
  }
}

function attachSimulatorTimer(deviceId, device) {
  if (simulatorTimers.has(deviceId)) return false;
  const frequencyMs = getSimulatorIntervalMs(device);
  const timer = setInterval(() => simulatorTick(deviceId), frequencyMs);
  simulatorTimers.set(deviceId, timer);
  return true;
}

function getSimulatorIntervalLabel(device) {
  return device.deviceType === 'energyMeter'
    ? `${device.intervalSeconds || 60}s`
    : `${device.frequencyMinutes}m`;
}

// Simulator profiles for state mapping
const simulatorProfiles = {
  A: { working: [0, 1], maintenance: [1, 0], idle: [0, 0] },
  B: { working: [1, 0], maintenance: [0, 1], idle: [0, 0] }
};

// ✅ Build exact payload matching gateway format (crane only)
function buildSimulatorPayload(device) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timestampStr = device.padTimestamp ? `   ${timestamp}` : `${timestamp}`;
  
  const lat = (device.latitude != null) ? device.latitude : 0;
  const lon = (device.longitude != null) ? device.longitude : 0;
  let latVal = lat;
  let lonVal = lon;
  if (device.jitter) {
    latVal += (Math.random() - 0.5) * 0.0004; // ±0.0002
    lonVal += (Math.random() - 0.5) * 0.0004;
  }
  
  const profile = simulatorProfiles[device.profile] || simulatorProfiles.A;
  const [maintenance, ignition] = profile[device.state];
  
  return [
    { 
      craneCompany: device.name,
      DeviceID: device.deviceId,
      dataType: "Gps", 
      Timestamp: timestampStr, 
      data: `[${latVal.toFixed(6)},${lonVal.toFixed(6)}]` 
    },
    { 
      craneCompany: device.name,
      DeviceID: device.deviceId,
      dataType: "maintenance", 
      Timestamp: timestampStr, 
      data: `[${maintenance}]` 
    },
    { 
      craneCompany: device.name,
      DeviceID: device.deviceId,
      Timestamp: timestampStr, 
      dataType: "Ignition", 
      data: `[${ignition}]` 
    }
  ];
}

// ✅ Elevator register bits (same meaning as ElevatorOverview.jsx)
// Reg65: high byte = floor (0-24), low byte = primary status. Reg66: service + power.
// If overrideReg65/overrideReg66/overrideErrorCode are set on device, use those for demo.
function buildElevatorPayload(device) {
  let reg65;
  let reg66;
  if (device.overrideReg65 != null && Number.isFinite(Number(device.overrideReg65))) {
    reg65 = Math.max(0, Math.min(65535, Number(device.overrideReg65)));
  } else {
    const floor = Math.min(24, Math.max(0, device.elevatorCurrentFloor != null ? device.elevatorCurrentFloor : 0));
    reg65 = (floor << 8) | 0;
  }
  if (device.overrideReg66 != null && Number.isFinite(Number(device.overrideReg66))) {
    reg66 = Math.max(0, Math.min(65535, Number(device.overrideReg66)));
  } else {
    // NOTE: These constants are chosen to match the existing frontend decoder
    // in ElevatorOverview.jsx (processElevatorData), so that:
    // - Normal -> In Service + Comm Normal + Automatic + Normal Power
    // - Maintenance -> Maintenance ON
    // - Idle -> all bits 0 (Out of Service)
    if (device.state === 'working') {
      // High (66H): bits for In Service, Comm Normal, Automatic
      // Low  (66L): bit for Normal Power
      const high = 0b00010011;   // indexes 3,6,7 set
      const low  = 0b00001000;   // index 4 set
      reg66 = (high << 8) | low; // 4872 decimal
    } else if (device.state === 'maintenance') {
      // High: Maintenance ON only
      const high = 0b00000100;   // index 5 set
      const low  = 0;
      reg66 = (high << 8) | low; // 1024 decimal
    } else {
      // Idle / out of service: all bits 0
      reg66 = 0;
    }
  }
  const payload = {
    elevatorCompany: device.name,
    elevatorId: device.deviceId,
    location: device.location || 'Demo Location',
    timestamp: Math.floor(Date.now() / 1000),
    data: [String(reg65), String(reg66)]
  };
  const errCode = device.overrideErrorCode != null ? String(device.overrideErrorCode).trim() : '';
  if (errCode !== '') payload.errorCode = errCode;
  return payload;
}

function getSimulatorIntervalMs(device) {
  if ((device.deviceType || 'crane') === 'energyMeter') {
    return (device.intervalSeconds || 60) * 1000;
  }
  return device.frequencyMinutes * 60 * 1000;
}

async function clearExpiredEnergyOverride(deviceId) {
  const device = await SimulatorDevice.findOne({ deviceId });
  if (!device?.energyReadingOverride?.enabled) return false;
  if (!isOverrideExpired(device.energyReadingOverride)) return false;
  device.energyReadingOverride.enabled = false;
  device.energyReadingOverride.readings = {
    voltage: null,
    current: null,
    activePower: null,
    energy: null,
    powerFactor: null,
    frequency: null,
  };
  device.energyReadingOverride.durationMinutes = null;
  device.energyReadingOverride.startedAt = null;
  device.energyReadingOverride.sourceRuleIds = [];
  device.energyReadingOverride.label = '';
  await device.save();
  return true;
}

async function postEnergyMeterSimPayload(device) {
  await clearExpiredEnergyOverride(device.deviceId);
  const fresh = await SimulatorDevice.findOne({ deviceId: device.deviceId }).lean();
  const simDevice = fresh || device;
  const { payload, energyKwh } = buildEnergyMeterPayload(simDevice, { advanceReading: true });
  const deviceId = simDevice.deviceId;

  try {
    await retryAsync(async () => {
      await ingestEnergyMeterPayload(payload, 'simulator');
      await SimulatorDevice.updateOne({ deviceId }, { energyBaseReading: energyKwh });
    }, { label: `Energy meter ${deviceId} post` });

    recordTickSuccess(deviceId);
    console.log(`[sim] ✅ Energy meter ${deviceId}: posted ${JSON.stringify(payload)}`);
    return { success: true, payload, energyKwh };
  } catch (err) {
    recordTickError(deviceId, err.message);
    console.error(`[sim] ❌ Energy meter ${deviceId} post failed after ${SIM_RETRY_ATTEMPTS} attempts:`, err.message);
    return { success: false, payload, error: err.message || 'Post failed' };
  }
}

// ✅ Simulator tick - crane → /api/crane/log, elevator → /api/elevators/log, energyMeter → /api/energy-meter/log
async function simulatorTick(deviceId) {
  try {
    const device = await retryAsync(
      () => SimulatorDevice.findOne({ deviceId }).lean(),
      { label: `Load simulator device ${deviceId}` }
    );

    if (!device) {
      console.log(`[sim] Device ${deviceId} not found in database, stopping timer (device-not-found)`);
      await stopSimulator(deviceId, 'device-not-found');
      return;
    }

    const deviceType = device.deviceType || 'crane';

    if (deviceType === 'energyMeter') {
      await postEnergyMeterSimPayload(device);
      return;
    }

    if (deviceType === 'elevator') {
      const payload = [buildElevatorPayload(device)];
      await retryAsync(async () => {
        const response = await fetch(`http://localhost:${PORT}/api/elevators/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Elevator post failed: HTTP ${response.status}`);
        }
        return response;
      }, { label: `Elevator ${deviceId} post` });

      const nextFloor = ((device.elevatorCurrentFloor != null ? device.elevatorCurrentFloor : 0) + 1) % 25;
      await SimulatorDevice.updateOne({ deviceId }, { elevatorCurrentFloor: nextFloor });
      recordTickSuccess(deviceId);
      console.log(`[sim] ✅ Elevator ${deviceId}: posted floor ${device.elevatorCurrentFloor} (${device.state}), next ${nextFloor}`);
      return;
    }

    // Crane
    const payload = buildSimulatorPayload(device);
    await retryAsync(async () => {
      const response = await fetch(`http://localhost:${PORT}/api/crane/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Crane post failed: HTTP ${response.status}`);
      }
      return response;
    }, { label: `Crane ${deviceId} post` });

    const lat = (device.latitude != null) ? device.latitude : 0;
    const lon = (device.longitude != null) ? device.longitude : 0;
    recordTickSuccess(deviceId);
    console.log(`[sim] ✅ Crane ${deviceId}: ${device.state} at [${lat.toFixed(6)}, ${lon.toFixed(6)}]`);
  } catch (err) {
    recordTickError(deviceId, err.message);
    console.error(`[sim] ❌ Simulator tick error for ${deviceId} (timer still running, will retry next interval):`, err.message);
  }
}

// ✅ Start simulator for a device
async function startSimulator(deviceId) {
  const device = await SimulatorDevice.findOne({ deviceId }).lean();
  if (!device) {
    throw new Error(`Device ${deviceId} not found in database`);
  }

  if (simulatorTimers.has(deviceId)) {
    throw new Error(`Device ${deviceId} is already running`);
  }

  attachSimulatorTimer(deviceId, device);
  await SimulatorDevice.updateOne({ deviceId }, { isRunning: true });
  startSimulatorWatchdog();
  console.log(`[sim] 🚀 Started simulator for ${deviceId} (${getSimulatorIntervalLabel(device)} interval)`);
}

// ✅ Re-attach timer without marking device stopped (config update / watchdog)
async function restartSimulatorTimer(deviceId) {
  const device = await SimulatorDevice.findOne({ deviceId }).lean();
  if (!device) {
    throw new Error(`Device ${deviceId} not found in database`);
  }

  clearSimulatorTimer(deviceId);
  attachSimulatorTimer(deviceId, device);
  await SimulatorDevice.updateOne({ deviceId }, { isRunning: true });
  console.log(`[sim] 🔄 Restarted timer for ${deviceId} (${getSimulatorIntervalLabel(device)} interval)`);
}

// ✅ Stop simulator for a device (explicit stop / device removed only)
async function stopSimulator(deviceId, reason = 'manual') {
  clearSimulatorTimer(deviceId);
  await SimulatorDevice.updateOne({ deviceId }, { isRunning: false });
  simulatorTickStatus.delete(deviceId);
  console.log(`[sim] ⏹️ Stopped simulator for ${deviceId} (reason: ${reason})`);
}

// ✅ Re-attach timers when DB says running but in-memory timer was lost (Azure idle, crash, etc.)
async function simulatorWatchdog() {
  if (!ENABLE_SIMULATOR) return;

  try {
    const runningDevices = await SimulatorDevice.find({ isRunning: true }).lean();
    for (const device of runningDevices) {
      if (simulatorTimers.has(device.deviceId)) continue;
      try {
        attachSimulatorTimer(device.deviceId, device);
        console.log(`[sim] 🔄 Watchdog re-attached timer for ${device.deviceId} (${getSimulatorIntervalLabel(device)} interval)`);
      } catch (err) {
        console.error(`[sim] ❌ Watchdog failed for ${device.deviceId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[sim] ❌ Watchdog error:', err.message);
  }
}

let simulatorWatchdogTimer = null;

function startSimulatorWatchdog() {
  if (simulatorWatchdogTimer || !ENABLE_SIMULATOR) return;
  simulatorWatchdogTimer = setInterval(() => {
    simulatorWatchdog().catch((err) => console.error('[sim] ❌ Watchdog interval error:', err.message));
  }, SIM_WATCHDOG_INTERVAL_MS);
  console.log(`[sim] 🐕 Simulator watchdog started (every ${SIM_WATCHDOG_INTERVAL_MS / 1000}s)`);
}

// ✅ Auto-restart running devices on server start
async function restartRunningSimulators() {
  try {
    const runningDevices = await SimulatorDevice.find({ isRunning: true }).lean();
    console.log(`[sim] 🔄 Found ${runningDevices.length} running devices to restart`);

    for (const device of runningDevices) {
      try {
        if (attachSimulatorTimer(device.deviceId, device)) {
          console.log(`[sim] ✅ Auto-restarted simulator for ${device.deviceId} (${getSimulatorIntervalLabel(device)} interval)`);
        }
      } catch (err) {
        console.error(`[sim] ❌ Failed to auto-restart ${device.deviceId}:`, err.message);
        // Keep isRunning true — watchdog will retry
      }
    }

    startSimulatorWatchdog();
    await simulatorWatchdog();
  } catch (err) {
    console.error('[sim] ❌ Error during auto-restart:', err.message);
  }
}

// ✅ Time helpers (IST-anchored, environment-independent)
// Always interpret device timestamps as IST (UTC+05:30) regardless of server TZ (e.g., Azure UTC)
function getCurrentTimeInIST() {
  // Current instant in time; represented as a JS Date. Consumers compare Dates (instants),
  // so returning now() is correct and TZ-agnostic.
  return new Date();
}

// Convert a JS Date that represents an IST wall-clock time to the corresponding UTC instant
function convertISTToUTC(istTime) {
  // Subtract 5h30m from IST wall-clock to get UTC instant
  const IST_OFFSET_MINUTES = 330; // +05:30
  return new Date(istTime.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

// Create day boundaries for IST regardless of host timezone


// ✅ NEW: IST helpers for timezone-agnostic date parsing
const IST_OFFSET_MIN = 330; // +05:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

function getISTDateComponentsFromUtcDate(utcDate) {
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(), // 0-indexed
    day: istDate.getUTCDate()
  };
}

function istStartUtcFromYMD(y, m, d) {
  // 00:00:00 IST for that date, expressed in UTC
  return new Date(Date.UTC(y, m, d, -5, -30, 0));
}

function istEndUtcFromYMD(y, m, d) {
  // 23:59:59 IST for that date, expressed in UTC
  return new Date(Date.UTC(y, m, d, 18, 29, 59));
}

function getTodayStartIstUtc(now = new Date()) {
  const { year, month, day } = getISTDateComponentsFromUtcDate(now);
  return istStartUtcFromYMD(year, month, day);
}

// ✅ UPDATED: Timestamp is now a Date object, no parsing needed
// This function is kept for backward compatibility but now just returns the Date object
function parseTimestamp(timestamp) {
  // If timestamp is already a Date object, return it
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  // ✅ NEW: Handle Linux timestamps (numbers)
  if (typeof timestamp === 'number') {
    try {
      // ✅ Linux timestamp (seconds) → UTC Date object
      const dateObject = new Date(timestamp * 1000); // ✅ Simple UTC conversion
      console.log(`🔍 [parseTimestamp] Converted Linux timestamp ${timestamp} to UTC Date: ${dateObject.toISOString()}`);
      return dateObject;
    } catch (err) {
      console.error(`❌ Error converting Linux timestamp: ${timestamp}`, err);
      return null;
    }
  }
  
  // If it's still a string (fallback), parse it
  if (typeof timestamp === 'string') {
    try {
      const [datePart, timePart] = timestamp.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    
      // ✅ FIXED: Preserve IST time without UTC conversion
      // Since gateway sends IST timestamps, we keep them as IST
      const istDate = new Date(year, month - 1, day, hour, minute, second);
      console.log(`🔍 [parseTimestamp] Parsed IST timestamp: ${timestamp} → ${istDate.toISOString()}`);
      return istDate;
  } catch (err) {
      console.error(`❌ Error parsing timestamp string: ${timestamp}`, err);
    return null;
  }
}

  // If it's neither Date, number, nor string, return null
  console.error(`❌ Invalid timestamp type: ${typeof timestamp}`, timestamp);
  return null;
}

// ✅ FIXED: Helper function to calculate consecutive periods for periodic data with state change detection
// ✅ FIXED: Returns only the requested state with semantic labels
function calculateConsecutivePeriods(logs, statusType) {
  const periods = [];
  if (!Array.isArray(logs) || logs.length === 0) return periods;

  // Sort logs chronologically
  logs.sort((a, b) => {
    const ta = a.Timestamp instanceof Date ? a.Timestamp : new Date(a.Timestamp);
    const tb = b.Timestamp instanceof Date ? b.Timestamp : new Date(b.Timestamp);
    return ta - tb;
  });

  // Helper: compute the semantic label ("working" | "maintenance" | "idle") for a log
  const getLabel = (log) => {
    const d1 = log.DigitalInput1; // strings: "0" or "1"
    const d2 = log.DigitalInput2; // strings: "0" or "1"
    if (d1 === "1" && d2 === "0") return "working";
    if (d2 === "1") return "maintenance";
    return "idle"; // default: "0","0" or any other combo not matching above
  };

  let current = null;
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const ts = log.Timestamp instanceof Date ? log.Timestamp : new Date(log.Timestamp);
    const label = getLabel(log);

    // We only build/extend periods when the label == statusType we're interested in
    const matches = (label === statusType);

    if (!current) {
      // start a new period only when we're in the desired state
      if (matches) {
        current = {
          startTime: ts,
          endTime: null,
          duration: 0,
          status: statusType,     // semantic label
          isOngoing: true
        };
      }
      continue;
    }

    // If we're currently in a matching period but the new log changes state away, we close it
    if (current && !matches) {
      current.endTime = ts;
      current.isOngoing = false;
      current.duration = (current.endTime - current.startTime) / (1000 * 60 * 60);
      periods.push(current);
      current = null;
      continue;
    }

    // If we were not in a period and we re-enter the target state, start one
    if (!current && matches) {
      current = {
        startTime: ts,
        endTime: null,
        duration: 0,
        status: statusType,
        isOngoing: true
      };
    }
  }

  // Close any open period at "now"
  if (current) {
    current.endTime = new Date();
    current.isOngoing = true; // until closed by a new state
    current.duration = (current.endTime - current.startTime) / (1000 * 60 * 60);
    periods.push(current);
  }
  
  return periods;
}

// ✅ FIXED: Helper function to calculate period duration including ongoing sessions
function calculatePeriodDuration(startTime, endTime = null, isOngoing = false) {
  if (!startTime) return 0;
  
  const end = endTime || getCurrentTimeInIST();
  const duration = (end - startTime) / (1000 * 60 * 60);
  
  // ✅ Calculate duration for ongoing sessions
  
  return Math.max(0, duration); // Ensure non-negative
}

// ✅ Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));

// ✅ Standard JSON parser for all routes (capture raw body for webhook signature verification)
app.use(express.json({ 
  verify: (req, res, buf) => { 
    req.rawBody = buf; 
  }, 
  limit: '1mb' 
}));
app.use(cookieParser());



// ✅ JWT Authentication Middleware (fixed)
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err.message);
    return res.status(403).json({ message: "Forbidden" });
  }
}

// ✅ Connect MongoDB
connectDB().then(async () => {
  // MongoDB connected successfully
  console.log('✅ MongoDB connected successfully');
  
  // ✅ Auto-restart running simulators after database connection
  if (ENABLE_SIMULATOR) {
    console.log('[sim] 🔄 Restarting running simulators...');
    await restartRunningSimulators();
  }
}).catch((err) => {
  console.error('❌ MongoDB connection failed:', err);
});

// ✅ Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Webhook Signature Verification Function (Fixed: uses raw body)
function verifyWebhookSignature(req, rawBody) {
  const razorpaySignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  if (!razorpaySignature || !webhookSecret) {
    console.error('❌ Missing webhook signature or secret');
    return false;
  }
  
  // ✅ Use raw body buffer, not JSON.stringify
  const generatedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  
  // ✅ Length check before timing-safe compare
  if (generatedSignature.length !== razorpaySignature.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature),
    Buffer.from(razorpaySignature)
  );
}

// ✅ DISABLE_PAYMENTS Guard
if (DISABLE_PAYMENTS) {
  console.log('⚠️ PAYMENTS DISABLED via DISABLE_PAYMENTS env var');
}

// ✅ Expose Public Razorpay Key
app.get('/api/payment/config', async (req, res) => {
  res.json({ 
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_PLACEHOLDER'
  });
});

// ✅ Razorpay Subscription Route
app.post('/api/payment/subscription', async (req, res) => {
  // ✅ Check payment disable flag
  if (DISABLE_PAYMENTS) {
    return res.status(503).json({ message: 'Payments temporarily disabled' });
  }

  const { planType } = req.body;

  // map plan types to Razorpay plan_ids
  const planMap = {
    standard: 'plan_RZCt7fOEXCubvR', // ₹99 plan
    premium: 'plan_RZC6jyeDfEJyoI',  // ₹199 plan
  };

  const plan_id = planMap[planType];

  if (!plan_id) {
    return res.status(400).json({ message: 'Invalid plan type' });
  }

  try {
    // ✅ Get user from JWT cookie if available and create customer
    const token = req.cookies.token;
    let customerId = null;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
        const user = await User.findById(decoded.id);
        
        if (user && !user.razorpayCustomerId) {
          // Create customer in Razorpay
          const customer = await razorpay.customers.create({
            name: user.name || user.email,
            email: user.email,
            contact: user.contactInfo || ''
          });
          user.razorpayCustomerId = customer.id;
          await user.save();
          customerId = customer.id;
        } else if (user && user.razorpayCustomerId) {
          customerId = user.razorpayCustomerId;
        }
      } catch (err) {
        console.log("⚠️ Could not fetch user for customer creation:", err.message);
      }
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_id: customerId, // ✅ Use customer ID if available
      customer_notify: 1,
      total_count: 12, // optional: 12 months max billing
    });

    res.json(subscription);
  } catch (err) {
    console.error("Error creating subscription:", err);
    res.status(500).json({ message: "Subscription creation failed" });
  }
});

// POST /api/auth/update-subscription
app.post('/api/auth/update-subscription', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // `req.user` comes from JWT
    if (!user) return res.status(404).json({ message: "User not found" });

    // Re-issue updated JWT
    const tokenPayload = {
      id: user._id,
      role: user.role,
      companyName: user.companyName,
      subscriptionStatus: getEffectiveSubscriptionStatus(user),
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res
      .cookie('token', token, {
        httpOnly: true,
        // secure: true,
        secure   : isProd,          // ← localhost will now get a non-secure cookie
        // sameSite: 'None',
        sameSite : isProd ? 'None' : 'Lax',   // 'None' + secure for prod, 'Lax' for dev
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ message: "Subscription info updated" });
  } catch (err) {
    console.error("❌ Update subscription error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Check Subscription Status
app.get('/api/subscription/status', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    if (BYPASS_SUBSCRIPTION_CHECK) {
      return res.json({ active: true, status: 'active' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // If no subscription ID stored, it's inactive
    if (!user.subscriptionId) return res.json({ active: false });

    // 🔄 Call Razorpay to check real-time status
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorSub = await razorpay.subscriptions.fetch(user.subscriptionId);

    // If subscription is cancelled or completed
    if (razorSub.status !== 'active') {
      user.subscriptionStatus = 'inactive';
      await user.save();
      return res.json({ active: false });
    }

    // ✅ Check expiry using subscriptionEnd if available, else fallback to Razorpay
    const now = new Date();
    let expiryDate = null;
    
    if (user.subscriptionEnd) {
      expiryDate = user.subscriptionEnd;
    } else {
      // Fallback: fetch from Razorpay
      try {
        const razorSub = await razorpay.subscriptions.fetch(user.subscriptionId);
        if (razorSub.current_end) {
          expiryDate = new Date(razorSub.current_end * 1000);
        } else {
          // Last resort: subscriptionStart + 1 month
          expiryDate = new Date(user.subscriptionStart);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        }
      } catch (err) {
        // Last resort: subscriptionStart + 1 month
        expiryDate = new Date(user.subscriptionStart);
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      }
    }

    if (expiryDate && now > expiryDate) {
      user.subscriptionStatus = 'inactive';
      await user.save();
      return res.json({ active: false });
    }

    return res.json({ active: true });
  } catch (err) {
    console.error("Subscription check error:", err.message);
    res.status(500).json({ message: "Failed to check subscription" });
  }
});

app.get('/api/test-email', async (req, res) => {
  try {
    await sendEmail({
      to: process.env.GMAIL_USER,          // send to yourself for the test
      subject: 'Test mail from IoT app',
      html: '<p>If you are reading this, SMTP works 🎉</p>'
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('✉️  TEST MAIL FAILED:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ✅ Payment Signature Verification Helper
function verifyPaymentSignature(razorpayPaymentId, razorpaySubscriptionId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  
  // Note: Some implementations use subscription_id|payment_id - swap if verification fails
  const text = razorpayPaymentId + '|' + razorpaySubscriptionId;
  const generatedSignature = crypto.createHmac('sha256', secret)
    .update(text)
    .digest('hex');
  
  if (generatedSignature.length !== signature.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature),
    Buffer.from(signature)
  );
}

// ✅ Mark Subscription Active After Payment (with signature verification)
app.post('/api/payment/activate-subscription', authenticateToken, async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { 
      razorpay_payment_id, 
      razorpay_subscription_id, 
      razorpay_signature 
    } = req.body;
    
    // ✅ Verify payment signature
    if (razorpay_payment_id && razorpay_signature) {
      const isValid = verifyPaymentSignature(
        razorpay_payment_id, 
        razorpay_subscription_id, 
        razorpay_signature
      );
      
      if (!isValid) {
        console.error("❌ Invalid payment signature");
        return res.status(400).json({ 
          message: "Invalid payment signature",
          details: "Payment verification failed"
        });
      }
    }

    // Update DB fields
    user.subscriptionStatus = "active";
    user.subscriptionStart = new Date();
    user.subscriptionId = razorpay_subscription_id || req.body.subscriptionId || null;
    // Do NOT set subscriptionEnd here - webhook will set precise dates
    await user.save();

    // ✅ Re-issue JWT with updated subscriptionStatus
    const updatedToken = jwt.sign({
      id: user._id,
      role: user.role,
      companyName: user.companyName,
      subscriptionStatus: getEffectiveSubscriptionStatus(user),
    }, process.env.JWT_SECRET || 'supersecretkey', { expiresIn: '7d' });

    console.log("🔐 Activating subscription for user ID:", user._id);

    res.cookie('token', updatedToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    }).json({ message: "Subscription activated and token updated ✅" });

  } catch (err) {
    console.error("❌ Activation error:", err.message);
    res.status(500).json({ message: "Subscription activation failed" });
  }
});

// 🎯 Razorpay Webhook Endpoint (Fixed: uses captured raw body for signature verification)
app.post('/api/payment/webhook', async (req, res) => {
  console.log('📥 Webhook received from Razorpay');
  
  try {
    // ✅ Get raw body for signature verification (captured by express.json verify callback)
    const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body), 'utf8'));
    
    // ✅ Parse event from body (already parsed by express.json or use req.body)
    const event = req.body || JSON.parse(rawBody.toString('utf8'));
    const eventType = event.event;
    
    // ✅ Extract subscription ID robustly from various payload shapes
    let subscriptionId = null;
    if (event.payload?.subscription?.entity?.id) {
      subscriptionId = event.payload.subscription.entity.id;
    } else if (event.payload?.invoice?.entity?.subscription) {
      subscriptionId = event.payload.invoice.entity.subscription;
    } else if (event.payload?.payment?.entity?.subscription_id) {
      subscriptionId = event.payload.payment.entity.subscription_id;
    }
    
    if (!subscriptionId) {
      console.warn('⚠️ Could not extract subscription ID from webhook payload');
      return res.status(200).json({ received: true, message: 'Acknowledged but no subscription ID found' });
    }
    
    console.log(`🔔 Event: ${eventType} for subscription: ${subscriptionId}`);
    
    // ✅ Verify signature using raw body
    const isValid = verifyWebhookSignature(req, rawBody);
    if (!isValid) {
      console.error('❌ Invalid webhook signature - potential attack!');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Find user by subscriptionId
    const user = await User.findOne({ subscriptionId });
    
    if (!user) {
      console.warn(`⚠️ User not found for subscription: ${subscriptionId} - acknowledging to avoid retries`);
      return res.status(200).json({ received: true, message: 'User not found but acknowledged' });
    }
    
    console.log(`👤 Found user: ${user.email}`);
    
    // ✅ Handle different subscription events with idempotent updates
    switch (eventType) {
      
      case 'subscription.activated':
      case 'payment.captured':
        // User just paid for the first time
        user.subscriptionStatus = 'active';
        user.subscriptionStart = new Date();
        // Set subscriptionEnd from Razorpay if available
        if (event.payload.subscription?.entity?.current_end) {
          user.subscriptionEnd = new Date(event.payload.subscription.entity.current_end * 1000);
        }
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      case 'subscription.charged':
      case 'invoice.paid':
        // Monthly payment successful - renew for another month
        user.subscriptionStatus = 'active';
        user.subscriptionStart = new Date();
        // Set subscriptionEnd from Razorpay if available
        if (event.payload.subscription?.entity?.current_end) {
          user.subscriptionEnd = new Date(event.payload.subscription.entity.current_end * 1000);
        } else if (event.payload.invoice?.entity?.subscription_end) {
          user.subscriptionEnd = new Date(event.payload.invoice.entity.subscription_end * 1000);
        }
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      case 'subscription.cancelled':
        // User cancelled their subscription
        user.subscriptionStatus = 'inactive';
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      case 'subscription.halted':
      case 'invoice.payment_failed':
      case 'payment.failed':
        // Payment failed
        user.subscriptionStatus = 'inactive';
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      case 'subscription.paused':
        // Subscription paused by Razorpay
        user.subscriptionStatus = 'inactive';
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      case 'subscription.resumed':
        // Subscription resumed after being paused
        user.subscriptionStatus = 'active';
        if (event.payload.subscription?.entity?.current_end) {
          user.subscriptionEnd = new Date(event.payload.subscription.entity.current_end * 1000);
        }
        await user.save();
        console.log(`✅ Webhook processed ${eventType} for ${user.email} (${subscriptionId})`);
        break;
        
      default:
        console.log(`⚠️ Unhandled event type: ${eventType} for subscription: ${subscriptionId}`);
    }
    
    res.status(200).json({ received: true, message: `Processed ${eventType}` });
    
  } catch (err) {
    // ✅ Always return 200 to Razorpay to avoid retry storms
    console.error('❌ Webhook processing error:', err.message);
    res.status(200).json({ received: true, error: 'Processing failed but acknowledged' });
  }
});

// ✅ User Info from Token (via Cookie)
app.get('/api/auth/userinfo', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔄 Live check with Razorpay if subscriptionId exists
    if (user.subscriptionId) {
      try {
        const razorSub = await razorpay.subscriptions.fetch(user.subscriptionId);

        const now = new Date();
        
        // ✅ Use subscriptionEnd or fetch from Razorpay
        let expiryDate = user.subscriptionEnd;
        if (!expiryDate && razorSub.current_end) {
          expiryDate = new Date(razorSub.current_end * 1000);
        } else if (!expiryDate) {
          expiryDate = new Date(user.subscriptionStart);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        }

        if (razorSub.status !== 'active' || (expiryDate && now > expiryDate)) {
          user.subscriptionStatus = 'inactive';
          await user.save();
        }
      } catch (err) {
        console.warn(
          "⚠️ Razorpay check failed – keeping existing subscriptionStatus:",
          err.message
        );
        // Network/auth error → do NOT flip the status, just log and proceed
      }
    }


    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      contactInfo: user.contactInfo,
      subscriptionStatus: getEffectiveSubscriptionStatus(user),
      subscriptionStart: user.subscriptionStart,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(403).json({ message: "Forbidden" });
  }
});



// ✅ Superadmin Routes
app.get('/api/companies/count', async (req, res) => {
  try {
    const companies = await User.distinct("companyName");
    res.json({ totalCompanies: companies.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to count companies" });
  }
});

app.get('/api/users/count', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ totalUsers: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to count users" });
  }
});

app.get('/api/devices/count', async (req, res) => {
  try {
    const totalDevices = await Device.countDocuments();
    res.json({ totalDevices });
  } catch (err) {
    res.status(500).json({ message: "Error counting devices ❌" });
  }
});

// ✅ Admin Routes
app.get('/api/users/count/by-company', async (req, res) => {
  const { companyName } = req.query;
  try {
    const count = await User.countDocuments({ companyName });
    res.json({ totalUsersByCompany: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to count users by company" });
  }
});

app.get('/api/devices/count/by-company', async (req, res) => {
  const { companyName } = req.query;
  try {
    const count = await Device.countDocuments({ companyName });
    res.json({ totalDevicesByCompany: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to count devices by company" });
  }
});

// ✅ Device Routes
app.post('/api/devices', async (req, res) => {
  try {
    const { companyName, uid, deviceId, deviceType, elevatorZoneId,
      siteName, plantName, machineName, location, phaseType, imei,
      deviceModel, displayName } = req.body;

    if (!companyName || !uid || !deviceId || !deviceType) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // ✅ Fleet Tracker: model + displayName required
    const modelCheck = validateDeviceModelForType(deviceType, deviceModel);
    if (!modelCheck.ok) {
      return res.status(400).json({ message: modelCheck.message });
    }
    const nameCheck = validateDisplayNameForType(deviceType, displayName);
    if (!nameCheck.ok) {
      return res.status(400).json({ message: nameCheck.message });
    }

    // ✅ Fleet Tracker: IMEI required + format; other types: IMEI not required
    const imeiCheck = validateImeiForDeviceType(deviceType, imei);
    if (!imeiCheck.ok) {
      return res.status(400).json({ message: imeiCheck.message });
    }
    if (imeiCheck.imei) {
      const existingImei = await Device.findOne({ imei: imeiCheck.imei }).lean();
      if (existingImei) {
        return res.status(409).json({ message: `IMEI "${imeiCheck.imei}" is already registered to another device` });
      }
    }

    if (String(deviceType).toLowerCase() === 'energymeter') {
      const simConflict = await SimulatorDevice.findOne({
        deviceId,
        deviceType: 'energyMeter',
      }).lean();
      if (simConflict) {
        return res.status(409).json({
          message: `Device ID "${deviceId}" is already used by the energy meter simulator. Register the real meter with a different deviceId to avoid mixing demo and live data.`,
        });
      }
    }

    let zoneIdToSet = null;
    if (elevatorZoneId) {
      if (String(deviceType).toLowerCase() !== 'elevator') {
        return res.status(400).json({ message: 'elevatorZoneId is only valid for elevator device type' });
      }
      const zone = await ElevatorZone.findById(elevatorZoneId);
      if (!zone || zone.companyName !== companyName) {
        return res.status(400).json({ message: 'Invalid elevator zone for this company' });
      }
      zoneIdToSet = zone._id;
    }

    const newDevice = new Device({
      companyName,
      uid,
      deviceId,
      deviceType,
      ...(zoneIdToSet ? { elevatorZoneId: zoneIdToSet } : {}),
      ...(siteName !== undefined ? { siteName } : {}),
      ...(plantName !== undefined ? { plantName } : {}),
      ...(machineName !== undefined ? { machineName } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(phaseType !== undefined ? { phaseType } : {}),
      ...(imeiCheck.imei ? { imei: imeiCheck.imei } : {}),
      ...(modelCheck.deviceModel ? { deviceModel: modelCheck.deviceModel } : {}),
      ...(nameCheck.displayName ? { displayName: nameCheck.displayName } : {}),
    });

    await newDevice.save();
    res.status(201).json({ message: 'Device added successfully' });
  } catch (error) {
    console.error('Error adding device:', error);
    if (isImeiDuplicateKeyError(error)) {
      return res.status(409).json({ message: 'IMEI is already registered to another device' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/devices', async (req, res) => {
  const companyName = req.query.companyName;
  try {
    const query = companyName ? { companyName } : {};
    const devices = await Device.find(query).populate('elevatorZoneId', 'name companyName');
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ message: 'Failed to fetch devices' });
  }
});

// ✅ Update device (superadmin: any; admin: only within own company)
app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { role: actorRole, companyName: actorCompany } = req.user || {};
    if (!actorRole) return res.status(401).json({ message: 'Unauthorized' });

    const targetDevice = await Device.findById(req.params.id);
    if (!targetDevice) return res.status(404).json({ message: 'Device not found' });

    if (actorRole !== 'superadmin') {
      if (actorRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      if (targetDevice.companyName !== actorCompany) {
        return res.status(403).json({ message: 'Cross-company edit not allowed' });
      }
    }

    const { companyName, deviceId, deviceType, elevatorZoneId,
      siteName, plantName, machineName, location, phaseType, imei,
      deviceModel, displayName, uid } = req.body || {};
    const update = {};
    // superadmin can change companyName
    if (companyName !== undefined && actorRole === 'superadmin') update.companyName = companyName;
    if (deviceId !== undefined) update.deviceId = deviceId;
    if (deviceType !== undefined) update.deviceType = deviceType;
    if (siteName !== undefined) update.siteName = siteName;
    if (plantName !== undefined) update.plantName = plantName;
    if (machineName !== undefined) update.machineName = machineName;
    if (location !== undefined) update.location = location;
    if (phaseType !== undefined) update.phaseType = phaseType;

    // ✅ Allow UID update (linked to Device ID on the frontend)
    if (uid !== undefined) {
      const nextUid = String(uid || '').trim();
      if (!nextUid) {
        return res.status(400).json({ message: 'UID is required' });
      }
      if (nextUid !== targetDevice.uid) {
        const uidTaken = await Device.findOne({
          uid: nextUid,
          _id: { $ne: targetDevice._id },
        }).lean();
        if (uidTaken) {
          return res.status(409).json({
            message: `UID "${nextUid}" is already used by another device`,
          });
        }
      }
      update.uid = nextUid;
    }

    const nextCompany =
      companyName !== undefined && actorRole === 'superadmin'
        ? companyName
        : targetDevice.companyName;
    const effectiveType =
      deviceType !== undefined ? deviceType : targetDevice.deviceType;

    // ✅ Fleet Tracker model rules (clear model when leaving Fleet Tracker)
    const modelSource =
      deviceModel !== undefined
        ? deviceModel
        : (String(effectiveType).toLowerCase() === 'gpstracker' ? targetDevice.deviceModel : undefined);
    const modelCheck = validateDeviceModelForType(effectiveType, modelSource);
    if (!modelCheck.ok) {
      return res.status(400).json({ message: modelCheck.message });
    }
    if (modelCheck.clearModel) {
      await Device.updateOne({ _id: targetDevice._id }, { $unset: { deviceModel: 1 } });
    } else if (modelCheck.deviceModel) {
      update.deviceModel = modelCheck.deviceModel;
    }

    // ✅ displayName: required for Fleet Tracker; preserved across type changes
    const nameSource =
      displayName !== undefined ? displayName : targetDevice.displayName;
    const nameCheck = validateDisplayNameForType(effectiveType, nameSource);
    if (!nameCheck.ok) {
      return res.status(400).json({ message: nameCheck.message });
    }
    if (nameCheck.displayName) {
      update.displayName = nameCheck.displayName;
    }
    // Do NOT unset displayName when leaving Fleet Tracker (preserve)

    // ✅ Fleet Tracker IMEI rules (required only for gpsTracker)
    const imeiSource =
      imei !== undefined
        ? imei
        : (String(effectiveType).toLowerCase() === 'gpstracker' ? targetDevice.imei : undefined);
    const imeiCheck = validateImeiForDeviceType(effectiveType, imeiSource);
    if (!imeiCheck.ok) {
      return res.status(400).json({ message: imeiCheck.message });
    }
    if (imeiCheck.clearImei) {
      // Remove IMEI when device is not (or no longer) a Fleet Tracker
      await Device.updateOne({ _id: targetDevice._id }, { $unset: { imei: 1 } });
    } else if (imeiCheck.imei) {
      const existingImei = await Device.findOne({
        imei: imeiCheck.imei,
        _id: { $ne: targetDevice._id },
      }).lean();
      if (existingImei) {
        return res.status(409).json({
          message: `IMEI "${imeiCheck.imei}" is already registered to another device`,
        });
      }
      update.imei = imeiCheck.imei;
    }

    const nextDeviceId = deviceId !== undefined ? deviceId : targetDevice.deviceId;
    if (String(effectiveType).toLowerCase() === 'energymeter') {
      const simConflict = await SimulatorDevice.findOne({
        deviceId: nextDeviceId,
        deviceType: 'energyMeter',
      }).lean();
      if (simConflict) {
        return res.status(409).json({
          message: `Device ID "${nextDeviceId}" is already used by the energy meter simulator. Register the real meter with a different deviceId to avoid mixing demo and live data.`,
        });
      }
    }

    if (elevatorZoneId !== undefined) {
      if (elevatorZoneId === null || elevatorZoneId === '') {
        update.elevatorZoneId = null;
      } else {
        if (String(effectiveType).toLowerCase() !== 'elevator') {
          return res.status(400).json({ message: 'elevatorZoneId is only valid for elevator devices' });
        }
        const zone = await ElevatorZone.findById(elevatorZoneId);
        if (!zone || zone.companyName !== nextCompany) {
          return res.status(400).json({ message: 'Invalid elevator zone for this company' });
        }
        update.elevatorZoneId = zone._id;
      }
    }

    const updated = await Device.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate('elevatorZoneId', 'name companyName');
    return res.json({ success: true, message: 'Device updated successfully', device: updated });
  } catch (err) {
    console.error('Update device error:', err.message);
    if (isImeiDuplicateKeyError(err)) {
      return res.status(409).json({ message: 'IMEI is already registered to another device' });
    }
    if (err.code === 11000 && (err.keyPattern?.uid || String(err.message || '').includes('uid'))) {
      return res.status(409).json({ message: 'UID is already used by another device' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// ✅ User Routes
app.get('/api/users', async (req, res) => {
  const companyName = req.query.companyName;
  try {
    const query = companyName ? { companyName } : {};
    const users = await User.find(query);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  const { email, password, role, name, companyName, contactInfo } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const newUser = new User({ email, password, role, name, companyName, contactInfo });
    await newUser.save();

    res.status(201).json({ message: "User created successfully ✅" });
  } catch (err) {
    console.error("Add user error:", err.message);
    res.status(500).json({ message: "Server error ❌" });
  }
});

// ✅ Update current user's profile (name, contactInfo only)
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { name, contactInfo } = req.body;
    const update = {};
    
    if (name !== undefined) update.name = name;
    if (contactInfo !== undefined) update.contactInfo = contactInfo;

    // ✅ Only allow updating name and contactInfo for security
    const updated = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully', 
      user: updated 
    });
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Update user (superadmin: any; admin: only 'user' within own company)
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (actor.role !== 'superadmin') {
      if (actor.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      if (target.role !== 'user') return res.status(403).json({ message: 'Admins can edit only users' });
      if (actor.companyName !== target.companyName) return res.status(403).json({ message: 'Cross-company edit not allowed' });
    }

    const { email, password, role, name, companyName, contactInfo, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (contactInfo !== undefined) update.contactInfo = contactInfo;
    if (email !== undefined && actor.role === 'superadmin') update.email = email;
    if (companyName !== undefined && actor.role === 'superadmin') update.companyName = companyName;
    if (role !== undefined && actor.role === 'superadmin') update.role = role;
    if (password) update.password = password;
    if (isActive !== undefined) update.isActive = isActive;

    const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ success: true, message: 'User updated successfully', user: updated });
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Delete user with password confirmation (superadmin: any; admin: only 'user' within own company; block self-delete for non-superadmin)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });

    const { password } = req.body || {};
    if (!password || actor.password !== password) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    if (req.user.id === req.params.id && actor.role !== 'superadmin') {
      return res.status(403).json({ message: 'You cannot delete your own account' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (actor.role !== 'superadmin') {
      if (actor.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      if (target.role !== 'user') return res.status(403).json({ message: 'Admins can delete only users' });
      if (actor.companyName !== target.companyName) return res.status(403).json({ message: 'Cross-company delete not allowed' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Delete device (superadmin: any; admin: only within own company)
app.delete('/api/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { role: actorRole, companyName: actorCompany } = req.user || {};
    if (!actorRole) return res.status(401).json({ message: 'Unauthorized' });

    const targetDevice = await Device.findById(req.params.id);
    if (!targetDevice) return res.status(404).json({ message: 'Device not found' });

    if (actorRole !== 'superadmin') {
      if (actorRole !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      if (targetDevice.companyName !== actorCompany) {
        return res.status(403).json({ message: 'Cross-company delete not allowed' });
      }
    }

    const deleted =     await Device.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Device not found' });
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    console.error("❌ Delete failed:", err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Elevator zones: group elevator devices by site/region (admin CRUD; any logged-in user can list own company)
const ensureElevatorZoneAdmin = (req, res) => {
  const role = req.user?.role;
  if (!role || (role !== 'admin' && role !== 'superadmin')) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
};

app.get('/api/elevator-zones', authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const qCompany = req.query.companyName;
    const filter = {};
    if (role === 'superadmin') {
      if (qCompany) filter.companyName = qCompany;
    } else {
      filter.companyName = companyName;
    }
    const zones = await ElevatorZone.find(filter).sort({ name: 1 }).lean();
    res.json(zones);
  } catch (err) {
    console.error('List elevator zones error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/elevator-zones', authenticateToken, async (req, res) => {
  if (!ensureElevatorZoneAdmin(req, res)) return;
  try {
    const { role, companyName } = req.user;
    const { name, companyName: bodyCompany } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Zone name is required' });
    }
    const targetCompany =
      role === 'superadmin' ? bodyCompany || companyName : companyName;
    if (!targetCompany) {
      return res.status(400).json({ message: 'companyName is required for superadmin' });
    }
    const zone = await ElevatorZone.create({
      companyName: targetCompany,
      name: String(name).trim(),
    });
    res.status(201).json(zone);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A zone with this name already exists for this company' });
    }
    console.error('Create elevator zone error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/api/elevator-zones/:id', authenticateToken, async (req, res) => {
  if (!ensureElevatorZoneAdmin(req, res)) return;
  try {
    const zone = await ElevatorZone.findById(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });
    const { role, companyName } = req.user;
    if (role !== 'superadmin' && zone.companyName !== companyName) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Zone name is required' });
    }
    const conflict = await ElevatorZone.findOne({
      companyName: zone.companyName,
      name: String(name).trim(),
      _id: { $ne: zone._id },
    });
    if (conflict) {
      return res.status(400).json({ message: 'A zone with this name already exists' });
    }
    zone.name = String(name).trim();
    await zone.save();
    res.json(zone);
  } catch (err) {
    console.error('Patch elevator zone error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/elevator-zones/:id', authenticateToken, async (req, res) => {
  if (!ensureElevatorZoneAdmin(req, res)) return;
  try {
    const zone = await ElevatorZone.findById(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });
    const { role, companyName } = req.user;
    if (role !== 'superadmin' && zone.companyName !== companyName) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await Device.updateMany({ elevatorZoneId: zone._id }, { $unset: { elevatorZoneId: 1 } });
    await ElevatorZone.findByIdAndDelete(zone._id);
    res.json({ message: 'Zone deleted; elevators unassigned from this zone' });
  } catch (err) {
    console.error('Delete elevator zone error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ POST: Receive crane data from edge device/router (UPDATED FOR NEW FORMAT)
app.post("/api/crane/log", async (req, res) => {
  try {
      // Request debugging info removed for production
    
    let transformedData = null;
    
    // ✅ Check if this is the new format (array of objects with dataType)
    if (Array.isArray(req.body) && req.body.length > 0 && req.body[0].dataType) {
      // Processing NEW format data
      
      // ✅ Transform new format to old format
      transformedData = transformNewFormatToOld(req.body);
      
              // Data transformed successfully
      
    } else {
      // Processing OLD format data
    
      // ✅ Use existing format directly
      const { craneCompany, DeviceID, Uid, Timestamp, Longitude, Latitude, DigitalInput1, DigitalInput2 } = req.body;
      
      transformedData = {
      craneCompany,
      DeviceID,
      Uid,
      Timestamp,
      Longitude,
      Latitude,
      DigitalInput1,
      DigitalInput2
      };
    }
    
      // Final extracted values debugging removed for production
    
    // ✅ Validate required fields
    if (!transformedData.craneCompany || !transformedData.DeviceID || !transformedData.Timestamp || 
        !transformedData.Longitude || !transformedData.Latitude || 
        !transformedData.DigitalInput1 || !transformedData.DigitalInput2) {
      console.log('❌ Missing required fields after transformation:', { 
        craneCompany: !!transformedData.craneCompany, 
        DeviceID: !!transformedData.DeviceID, 
        Timestamp: !!transformedData.Timestamp, 
        Longitude: !!transformedData.Longitude, 
        Latitude: !!transformedData.Latitude, 
        DigitalInput1: !!transformedData.DigitalInput1, 
        DigitalInput2: !!transformedData.DigitalInput2 
      });
      return res.status(400).json({ error: "Missing required fields after transformation" });
    }

    // ✅ Create new crane log entry
    const craneLog = new CraneLog(transformedData);
    
    // ✅ Save to database
    const savedLog = await craneLog.save();
    
          // Crane log saved successfully

    // ✅ Return success response
    res.status(201).json({ 
      message: "Crane data saved successfully",
      logId: savedLog._id,
      deviceId: savedLog.DeviceID,
      timestamp: savedLog.Timestamp
    });
    
  } catch (err) {
    console.error("❌ Crane log save error:", err);
    res.status(500).json({ error: "Failed to save crane data" });
  }
});

// ✅ Helper: allow simulator (localhost) even when ELEVATOR_DATA_DISABLED is true
function isLocalElevatorRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const forwarded = req.get('x-forwarded-for');
  const check = (s) => s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1';
  if (check(ip)) return true;
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (check(first)) return true;
  }
  return false;
}

// ✅ Elevator data ingestion endpoint
app.post("/api/elevators/log", async (req, res) => {
  const requestId = Date.now() + Math.random().toString(36).substr(2, 9);
  
  const ELEVATOR_DATA_DISABLED = process.env.ELEVATOR_DATA_DISABLED === 'true';
  // ✅ When disabled, reject external gateways but allow simulator (localhost)
  if (ELEVATOR_DATA_DISABLED && !isLocalElevatorRequest(req)) {
    console.log(`⏸️ [${requestId}] ELEVATOR DATA DISABLED - Rejecting external request`);
    return res.status(503).json({ 
      message: "Elevator data collection temporarily disabled",
      requestId: requestId
    });
  }
  
  try {
    console.log(`\n🚀 [${requestId}] Gateway hit /api/elevators/log`);
    
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    // ✅ Validate and map data
    const docs = items.map((it, index) => {
      // Parse timestamp (Unix seconds to Date)
      const rawTs = it.timestamp != null ? String(it.timestamp) : "";
      const tsNum = Number(rawTs);
      const tsDate = Number.isFinite(tsNum) && tsNum > 1000000000 ? new Date(tsNum * 1000) : new Date();

      // Handle data array - can be array or stringified array
      let dataArray = [];
      if (Array.isArray(it.data)) {
        dataArray = it.data;
      } else if (typeof it.data === 'string') {
        try {
          // Try to parse stringified array like "[6161,34321,0,0]"
          dataArray = JSON.parse(it.data);
        } catch {
          // Fallback: treat as comma-separated string
          dataArray = it.data.split(',').map(v => v.trim());
        }
      }

      const normalizedCode = normalizeCode(it.errorCode ?? it.error_code ?? it.code);

      const processedDoc = {
        elevatorCompany: it.elevatorCompany || null,
        elevatorId: it.elevatorId || it.DeviceID || null,
        location: it.location || "Unknown Location",
        timestamp: tsDate,
        data: dataArray,
        errorCode: normalizedCode
      };
      
      return processedDoc;
    });

    // ✅ Filter valid documents
    const validDocs = docs.filter((d) => d.elevatorId);
    
    if (validDocs.length === 0) {
      return res.status(400).json({ message: "No valid items with elevatorId." });
    }

    // ✅ Insert into database
    const result = await ElevatorEvent.insertMany(validDocs, { ordered: false });
    
    return res.status(201).json({ ok: true, inserted: result.length });
  } catch (err) {
    console.error(`\n❌ [${requestId}] /api/elevators/log error:`, err);
    console.error(`❌ [${requestId}] Error details:`, {
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n')
    });
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Recent logs viewer (protected via JWT cookie) - Returns latest log per elevator
app.get("/api/elevators/recent", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user; // ✅ Get from JWT token (not query params)
    const { elevatorId, location, limit = 50 } = req.query;
    
    // ✅ 1. Build company filter (exactly like crane endpoints)
    const companyFilter = role !== "superadmin" ? { elevatorCompany: companyName } : {};
    
    // ✅ 2. Build device allowlist from Device collection (ONCE per request)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedDevicesById = getDeviceAllowlistSet(allowedDevices, req.query);
    
    // ✅ 3. Build match filter with company filtering
    const matchFilter = { ...companyFilter };
    if (elevatorId) matchFilter.elevatorId = elevatorId;
    if (location) matchFilter.location = new RegExp(location, 'i');
    
    // MongoDB aggregation pipeline to get latest log per elevator
    const pipeline = [
      // Match documents based on filters
      { $match: matchFilter },
      
      // Sort by elevatorId and timestamp (newest first)
      { $sort: { elevatorId: 1, timestamp: -1 } },
      
      // Group by elevatorId and get the latest document
      { 
        $group: { 
          _id: "$elevatorId", 
          latestLog: { $first: "$$ROOT" }
        }
      },
      
      // Replace root with the latest log document
      { $replaceRoot: { newRoot: "$latestLog" } },
      
      // Sort by timestamp (newest first) for final result
      { $sort: { timestamp: -1 } },
      
      // Apply limit
      { $limit: Math.min(Number(limit) || 50, 200) }
    ];
    
    const logs = await ElevatorEvent.aggregate(pipeline);
    
    // ✅ 4. Apply device allowlist filter (O(1) Set lookup)
    const filteredLogs = logs.filter(log => allowedDevicesById.has(log.elevatorId));
    
    // ✅ Calculate working hours for each elevator (use filteredLogs instead of logs)
    const logsWithWorkingHours = await Promise.all(filteredLogs.map(async (log) => {
      try {
        // Get all logs for this elevator, sorted by timestamp
        const allLogs = await ElevatorEvent.find({ elevatorId: log.elevatorId }).sort({ timestamp: 1 });
        
        
        let totalWorkingMs = 0;
        let lastWorkingTime = null;
        let currentWorkingStart = null;
        let currentSessionStart = null;
        let currentSessionDuration = 0;
        let firstWorkingLog = null;
        let sessionCount = 0;

        // ✅ Maintenance session tracking variables
        let currentMaintenanceStart = null;
        let totalMaintenanceMs = 0;
        let currentMaintenanceDuration = 0;
        let maintenanceSessionCount = 0;

        for (let i = 0; i < allLogs.length; i++) {
          const currentLog = allLogs[i];
          const nextLog = allLogs[i + 1];

          // Parse Reg66H bit0 (In Service status) and bit2 (Maintenance ON)
          const reg66 = parseInt(currentLog.data[1]) || 0;
          const reg66Binary = reg66.toString(2).padStart(16, '0');
          const reg66H = reg66Binary.substring(0, 8);
          const isWorking = reg66H[7] === '1'; // bit0 = rightmost character
          const isMaintenance = reg66H[5] === '1'; // bit2 = Maintenance ON

          if (isWorking) {
            // Start of working session
            if (currentWorkingStart === null) {
              currentWorkingStart = new Date(currentLog.timestamp);
              currentSessionStart = new Date(currentLog.timestamp);
              firstWorkingLog = currentLog;
              sessionCount++;
              // Working session logs removed for cleaner maintenance analysis
            }
            lastWorkingTime = new Date(currentLog.timestamp);

            // If this is the last log or next log is not working, end the session
            if (!nextLog) {
              // Last log - consider it as current working session
              const now = new Date();
              const sessionDuration = now - currentWorkingStart;
              totalWorkingMs += sessionDuration;
              currentSessionDuration = sessionDuration;
              currentWorkingStart = null;
            } else {
              // Check if next log is also working
              const nextReg66 = parseInt(nextLog.data[1]) || 0;
              const nextReg66Binary = nextReg66.toString(2).padStart(16, '0');
              const nextReg66H = nextReg66Binary.substring(0, 8);
              const nextIsWorking = nextReg66H[7] === '1';

              if (!nextIsWorking) {
                // End of working session
                const sessionEnd = new Date(nextLog.timestamp);
                const sessionDuration = sessionEnd - currentWorkingStart;
                totalWorkingMs += sessionDuration;
                currentWorkingStart = null;
                currentSessionStart = null;
              }
            }
          } else {
            // Not working - reset current working start
            currentWorkingStart = null;
            currentSessionStart = null;
          }

          // ✅ Maintenance session tracking (mirror working logic)
          if (isMaintenance) {
            // Start of maintenance session
            if (currentMaintenanceStart === null) {
              currentMaintenanceStart = new Date(currentLog.timestamp);
              maintenanceSessionCount++;
            }

            // If this is the last log or next log is not in maintenance, end the session
            if (!nextLog) {
              // Last log - consider it as current maintenance session
              const now = new Date();
              const sessionDuration = now - currentMaintenanceStart;
              totalMaintenanceMs += sessionDuration;
              currentMaintenanceDuration = sessionDuration;
            } else {
              // Check if next log is also in maintenance
              const nextReg66 = parseInt(nextLog.data[1]) || 0;
              const nextReg66Binary = nextReg66.toString(2).padStart(16, '0');
              const nextReg66H = nextReg66Binary.substring(0, 8);
              const nextIsMaintenance = nextReg66H[5] === '1';

              if (!nextIsMaintenance) {
                // End of maintenance session
                const sessionEnd = new Date(nextLog.timestamp);
                const sessionDuration = sessionEnd - currentMaintenanceStart;
                totalMaintenanceMs += sessionDuration;
                currentMaintenanceStart = null;
              }
            }
          } else {
            // Not in maintenance - reset current maintenance start
            currentMaintenanceStart = null;
          }
        }

        // Convert milliseconds to hours
        const totalWorkingHours = totalWorkingMs / (1000 * 60 * 60);
        const currentSessionHours = currentSessionDuration / (1000 * 60 * 60);
        const currentMaintenanceHours = currentMaintenanceDuration / (1000 * 60 * 60);

        // Format total working hours (days, hours, minutes)
        const days = Math.floor(totalWorkingHours / 24);
        const hours = Math.floor(totalWorkingHours % 24);
        const minutes = Math.floor((totalWorkingHours % 1) * 60);
        let workingHoursText = '';
        if (days > 0) workingHoursText += `${days}d `;
        if (hours > 0) workingHoursText += `${hours}h `;
        if (minutes > 0) workingHoursText += `${minutes}m`;
        if (workingHoursText === '') workingHoursText = '0m';

        // Format current session hours (days, hours, minutes)
        const sessDays = Math.floor(currentSessionHours / 24);
        const sessHours = Math.floor(currentSessionHours % 24);
        const sessMinutes = Math.floor((currentSessionHours % 1) * 60);
        let currentSessionText = '';
        if (sessDays > 0) currentSessionText += `${sessDays}d `;
        if (sessHours > 0) currentSessionText += `${sessHours}h `;
        if (sessMinutes > 0) currentSessionText += `${sessMinutes}m`;
        if (currentSessionText === '') currentSessionText = '0m';

        // Format session start time - Force IST timezone
        let sessionStartText = 'Not Working';
        if (currentSessionStart) {
          sessionStartText = currentSessionStart.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'  // ✅ Force IST timezone display
          });
        }

        // ✅ Format maintenance session hours (days, hours, minutes)
        const maintDays = Math.floor(currentMaintenanceHours / 24);
        const maintHours = Math.floor(currentMaintenanceHours % 24);
        const maintMinutes = Math.floor((currentMaintenanceHours % 1) * 60);
        let maintenanceSessionText = '';
        if (maintDays > 0) maintenanceSessionText += `${maintDays}d `;
        if (maintHours > 0) maintenanceSessionText += `${maintHours}h `;
        if (maintMinutes > 0) maintenanceSessionText += `${maintMinutes}m`;
        if (maintenanceSessionText === '') maintenanceSessionText = '0m';

        // ✅ Format maintenance session start time - Force IST timezone
        let maintenanceStartText = 'Not in Maintenance';
        if (currentMaintenanceStart) {
          maintenanceStartText = currentMaintenanceStart.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'  // ✅ Force IST timezone display
          });
        }


        const response = {
          ...log,
          errorCode: normalizeCode(log.errorCode),
          errorInfo: getErrorDetails(log.errorCode),
          workingHours: {
            total: totalWorkingHours,
            formatted: workingHoursText.trim(),
            currentSession: currentSessionStart ? {
              start: sessionStartText,
              duration: currentSessionHours,
              formatted: currentSessionText.trim()
            } : null
          },
          maintenanceHours: currentMaintenanceStart ? {
            currentSession: {
              start: maintenanceStartText,
              duration: currentMaintenanceHours,
              formatted: maintenanceSessionText.trim()
            }
          } : null
        };
        
        // ✅ DEBUG: Log what's being returned to frontend
        console.log(`🚀 [${log.elevatorId}] MAINTENANCE DATA TO FRONTEND:`, JSON.stringify(response.maintenanceHours, null, 2));
        
        return response;
      } catch (err) {
        console.error(`❌ Error calculating working hours for ${log.elevatorId}:`, err);
        return {
          ...log,
          workingHours: {
            total: 0,
            formatted: '0m',
            currentSession: null
          },
          maintenanceHours: null
        };
      }
    }));

    res.json({ logs: logsWithWorkingHours });
  } catch (err) {
    console.error("❌ /api/elevators/recent error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ OPTIMIZED: All logs viewer with aggregation (no N+1 issue)
app.get("/api/elevators/all-logs", authenticateToken, async (req, res) => {
  // ✅ TEMPORARY: Disable elevator table API for testing
  const ELEVATOR_TABLE_DISABLED = process.env.ELEVATOR_TABLE_DISABLED === 'true';
  
  if (ELEVATOR_TABLE_DISABLED) {
    console.log(`⏸️ ELEVATOR TABLE API TEMPORARILY DISABLED - Rejecting /api/elevators/all-logs request`);
    return res.status(503).json({ 
      message: "Elevator table API temporarily disabled for testing",
      disabled: true
    });
  }
  
  const requestId = Math.random().toString(36).slice(2, 9);
  const startTime = Date.now();
  
  try {
    const { 
      elevatorId, 
      location, 
      limit = 20,  // ✅ Default to 20 rows per page
      offset = 0, 
      hours = 24,
      sortBy = 'timestamp',
      sortDirection = 'desc',
      search = '',
      // ✅ New filter parameters
      inService,
      inMaintenance,
      status
    } = req.query;
    
    // ✅ Get user info from token (set by authenticateToken middleware)
    const userRole = req.user.role;
    const userCompany = req.user.companyName;
    
    console.log(`📊 [${requestId}] /api/elevators/all-logs - User: ${req.user.email}, Role: ${userRole}, Company: ${userCompany}`);
    
    // ✅ Build filter
    const filter = {};
    
    // ✅ IMPORTANT: Company filtering based on role
    if (userRole !== 'superadmin') {
      // Regular users and admins only see their company's data
      filter.elevatorCompany = userCompany;
      console.log(`🔒 [${requestId}] Filtering by company: ${userCompany}`);
    } else {
      console.log(`🔓 [${requestId}] Superadmin: Showing all companies`);
    }
    
    // ✅ Build device allowlist from Device collection (ONCE per request)
    const deviceQuery = userRole !== "superadmin" ? { companyName: userCompany } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedDevicesById = getDeviceAllowlistSet(allowedDevices, req.query);
    console.log(`📱 [${requestId}] Device allowlist: ${allowedDevicesById.size} devices`);
    
    // Time range filter (last X hours)
    if (hours) {
      const hoursAgo = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
      filter.timestamp = { $gte: hoursAgo };
      console.log(`⏰ [${requestId}] Filtering last ${hours} hours (since ${hoursAgo.toISOString()})`);
    }
    
    // Optional: Filter by specific elevator
    if (elevatorId) {
      filter.elevatorId = elevatorId;
      console.log(`🏢 [${requestId}] Filtering by elevator: ${elevatorId}`);
    }
    
    // Optional: Filter by location
    if (location) {
      filter.location = new RegExp(location, 'i');
      console.log(`📍 [${requestId}] Filtering by location: ${location}`);
    }
    
    // Optional: Search filter (basic fields only - register-based search will be applied later)
    // Note: We don't apply basic search filter here anymore since register-based search handles everything
    // This ensures floor numbers and status values can be found even if they don't match basic fields
    if (search) {
      console.log(`🔍 [${requestId}] Searching for: ${search} (will be processed in register-based search)`);
    }
    
    // ✅ Register-based filtering (inService, inMaintenance, status)
    // Note: These filters will be applied after fetching data since they require register parsing
    const registerFilters = {
      inService: inService ? inService === 'true' : null,
      inMaintenance: inMaintenance ? inMaintenance === 'true' : null,
      status: status || null
    };
    
    console.log(`🔍 [${requestId}] Register filters:`, registerFilters);
    console.log(`🔍 [${requestId}] Final filter:`, JSON.stringify(filter));
    
    // ✅ Fetch logs matching basic filters
    const fetchStartTime = Date.now();
    const sortOrder = sortDirection === 'asc' ? 1 : -1;
    const hasRegisterFilters = registerFilters.inService !== null || registerFilters.inMaintenance !== null || registerFilters.status !== null;
    const hasRegisterSearch = search && search.trim().length > 0;
    
    let allLogs;
    let totalMatchingCount = 0; // ✅ Total count for pagination
    let uniqueElevatorIdsFromAllMatching = []; // ✅ Store unique IDs for dropdown
    
    if (hasRegisterFilters || hasRegisterSearch) {
      // ✅ Fetch ALL logs if register-based filtering is needed
      allLogs = await ElevatorEvent.find(filter)
        .sort({ [sortBy]: sortOrder })
        .lean()
        .maxTimeMS(10000);
      console.log(`📦 [${requestId}] Fetched ${allLogs.length} total logs for register filtering (took ${Date.now() - fetchStartTime}ms)`);
    } else {
      // ✅ First, count total matching logs (with device allowlist applied)
      // Fetch all matching logs (just IDs and elevatorId for efficiency)
      const allMatchingLogs = await ElevatorEvent.find(filter)
        .select('_id elevatorId')
        .lean()
        .maxTimeMS(10000);
      
      // Apply device allowlist filter and count
      const deviceFilteredLogsForCount = allMatchingLogs.filter(log => allowedDevicesById.has(log.elevatorId));
      totalMatchingCount = deviceFilteredLogsForCount.length;
      
      // ✅ Extract unique elevator IDs from all matching logs (for dropdown)
      uniqueElevatorIdsFromAllMatching = [...new Set(deviceFilteredLogsForCount.map(log => log.elevatorId).filter(Boolean))].sort();
      
      console.log(`📊 [${requestId}] Total matching logs (with device filter): ${totalMatchingCount}`);
      console.log(`📋 [${requestId}] Unique elevator IDs from all matching: ${uniqueElevatorIdsFromAllMatching.length} elevators`);
      
      // ✅ Now fetch the actual paginated page
      allLogs = await ElevatorEvent.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean()
        .maxTimeMS(10000);
      console.log(`📦 [${requestId}] Fetched ${allLogs.length} paginated logs (no register filtering needed) (took ${Date.now() - fetchStartTime}ms)`);
    }
    
    // ✅ Apply device allowlist filter first (O(1) Set lookup)
    const deviceFilteredLogs = allLogs.filter(log => allowedDevicesById.has(log.elevatorId));
    console.log(`🔧 [${requestId}] Device filter: ${allLogs.length} → ${deviceFilteredLogs.length} logs`);
    
    // ✅ Apply register-based filtering and search if needed
    let filteredLogs = deviceFilteredLogs;
    
    if ((hasRegisterFilters || hasRegisterSearch) && deviceFilteredLogs.length > 0) {
      console.log(`🔧 [${requestId}] Applying register-based filters and search...`);
      const filterStartTime = Date.now();
      
      filteredLogs = deviceFilteredLogs.filter(log => {
        // Skip logs without register data
        if (!log.data || log.data.length < 2) {
          return false;
        }
        
        try {
          // Process register data (same logic as frontend)
          const reg65 = parseInt(log.data[0]) || 0;
          const reg66 = parseInt(log.data[1]) || 0;
          
          const reg65Binary = decimalToBinary(reg65, 16);
          const reg65Split = split16BitTo8Bit(reg65Binary);
          
          const reg66Binary = decimalToBinary(reg66, 16);
          const reg66Split = split16BitTo8Bit(reg66Binary);
          
          // 66H - Service status flags
          const serviceStatus = [];
          const reg66H = reg66Split.high;
          if (reg66H[7] === '1') serviceStatus.push('In Service');
          if (reg66H[6] === '1') serviceStatus.push('Comm Normal');
          if (reg66H[5] === '1') serviceStatus.push('Maintenance ON');
          if (reg66H[4] === '1') serviceStatus.push('Overload');
          if (reg66H[3] === '1') serviceStatus.push('Automatic');
          if (reg66H[2] === '1') serviceStatus.push('Car Walking');
          if (reg66H[1] === '1') serviceStatus.push('Earthquake');
          if (reg66H[0] === '1') serviceStatus.push('Safety Circuit');

          // 66L - Power status flags
          const powerStatus = [];
          const reg66L = reg66Split.low;
          if (reg66L[7] === '1') powerStatus.push('Fire Return');
          if (reg66L[6] === '1') powerStatus.push('Fire Return In Place');
          if (reg66L[5] === '1') powerStatus.push('Standby');
          if (reg66L[4] === '1') powerStatus.push('Normal Power');
          if (reg66L[3] === '1') powerStatus.push('OEPS');
          if (reg66L[2] === '1') powerStatus.push('Standby');
          if (reg66L[1] === '1') powerStatus.push('Standby');
          if (reg66L[0] === '1') powerStatus.push('Standby');

          // Calculate priority score (same logic as frontend)
          let maxScore = 0;
          let criticalStatus = '';

          // Critical/Emergency (Score 6)
          const criticalStatuses = ['Overload', 'Earthquake', 'OEPS', 'Fire Return', 'Fire Return In Place'];
          const criticalFound = [...serviceStatus, ...powerStatus].filter(status => criticalStatuses.includes(status));
          if (criticalFound.length > 0) {
            maxScore = Math.max(maxScore, 6);
            criticalStatus = criticalFound[0];
          }

          // Check for communication fault (Comm Normal = 0 means abnormal)
          if (serviceStatus.includes('Comm Normal') === false && reg66H[6] === '0') {
            maxScore = Math.max(maxScore, 6);
            criticalStatus = 'Comm Fault';
          }

          // Check for out of service (In Service = 0)
          if (serviceStatus.includes('In Service') === false && reg66H[7] === '0') {
            maxScore = Math.max(maxScore, 0);
            criticalStatus = 'Out of Service';
          }

          // Maintenance/Inspection (Score 4)
          if (serviceStatus.includes('Maintenance ON') && maxScore < 6) {
            maxScore = Math.max(maxScore, 4);
            criticalStatus = 'Maintenance ON';
          }

          // Normal/Running (Score 1)
          const normalStatuses = ['In Service', 'Automatic', 'Car Walking', 'Normal Power', 'Safety Circuit'];
          const normalFound = [...serviceStatus, ...powerStatus].filter(status => normalStatuses.includes(status));
          if (normalFound.length > 0 && maxScore < 4) {
            maxScore = Math.max(maxScore, 1);
            criticalStatus = normalFound[0];
          }

          // Determine final status
          let priorityStatus = 'Unknown';
          if (maxScore >= 6) {
            priorityStatus = criticalStatus;
          } else if (maxScore === 4) {
            priorityStatus = criticalStatus;
          } else if (maxScore === 1) {
            priorityStatus = criticalStatus;
          } else {
            priorityStatus = criticalStatus;
          }

          // Calculate floor from register 65H (high 8 bits converted to decimal)
          const floor = binaryToDecimal(reg65Split.high);

          // Apply filters
          let passesFilters = true;

          // In Service filter
          if (registerFilters.inService !== null) {
            const isInService = serviceStatus.includes('In Service');
            if (registerFilters.inService !== isInService) {
              passesFilters = false;
            }
          }

          // In Maintenance filter
          if (registerFilters.inMaintenance !== null) {
            const isInMaintenance = serviceStatus.includes('Maintenance ON');
            if (registerFilters.inMaintenance !== isInMaintenance) {
              passesFilters = false;
            }
          }

          // Status filter
          if (registerFilters.status !== null) {
            if (priorityStatus !== registerFilters.status) {
              passesFilters = false;
            }
          }

          // Enhanced register-based search (includes both basic fields and register data)
          if (hasRegisterSearch && passesFilters) {
            const searchLower = search.toLowerCase();
            let matchesSearch = false;

            // ✅ Search in basic fields first
            if (log.elevatorId && log.elevatorId.toLowerCase().includes(searchLower)) {
              matchesSearch = true;
            }
            if (log.location && log.location.toLowerCase().includes(searchLower)) {
              matchesSearch = true;
            }
            if (log.elevatorCompany && log.elevatorCompany.toLowerCase().includes(searchLower)) {
              matchesSearch = true;
            }

            // ✅ Search in status values
            const allStatuses = [...serviceStatus, ...powerStatus, priorityStatus];
            if (allStatuses.some(status => status.toLowerCase().includes(searchLower))) {
              matchesSearch = true;
            }

            // ✅ Search in error code and lookup details
            const normalizedErrorCode = normalizeCode(log.errorCode || '000');
            if (normalizedErrorCode.toLowerCase().includes(searchLower)) {
              matchesSearch = true;
            } else {
              const errorDetails = getErrorDetails(log.errorCode);
              if (
                (errorDetails.title && errorDetails.title.toLowerCase().includes(searchLower)) ||
                (errorDetails.description && errorDetails.description.toLowerCase().includes(searchLower))
              ) {
                matchesSearch = true;
              }
            }

            // ✅ Search in floor number (numeric search)
            if (!isNaN(search) && floor.toString().includes(search)) {
              console.log(`🔍 [${requestId}] Floor search match: search="${search}", floor=${floor}, logId=${log._id}`);
              matchesSearch = true;
            }

            // ✅ Search in specific status keywords
            const searchKeywords = [
              'oeps', 'overload', 'earthquake', 'maintenance', 'service', 'automatic', 
              'car walking', 'safety circuit', 'fire return', 'standby', 'normal power',
              'comm normal', 'critical', 'warning', 'normal', 'unknown'
            ];
            
            if (searchKeywords.some(keyword => keyword.includes(searchLower))) {
              matchesSearch = true;
            }

            // If search doesn't match any data, exclude this log
            if (!matchesSearch) {
              passesFilters = false;
            }
          }

          return passesFilters;
        } catch (error) {
          console.error(`❌ [${requestId}] Error processing register data for log ${log._id}:`, error);
          return false; // Skip logs with invalid data
        }
      });
      
      console.log(`🔧 [${requestId}] Register filtering and search: ${deviceFilteredLogs.length} → ${filteredLogs.length} logs (took ${Date.now() - filterStartTime}ms)`);
    }
    
    if (filteredLogs.length === 0) {
      console.log(`✅ [${requestId}] No logs found after filtering, returning empty array`);
      // ✅ Extract unique elevator IDs even when no logs (for empty state dropdown)
      let uniqueElevatorIds = [];
      if (!hasRegisterFilters && !hasRegisterSearch) {
        uniqueElevatorIds = uniqueElevatorIdsFromAllMatching;
      }
      return res.json({ 
        logs: [], 
        total: 0, 
        limit: parseInt(limit), 
        offset: parseInt(offset),
        hasMore: false,
        uniqueElevatorIds: uniqueElevatorIds,
        timing: Date.now() - startTime
      });
    }
    
    // ✅ Extract unique elevator IDs from all filtered logs (before pagination)
    let uniqueElevatorIds = [];
    if (hasRegisterFilters || hasRegisterSearch) {
      // ✅ Extract from all filtered logs (register filtering case)
      uniqueElevatorIds = [...new Set(filteredLogs.map(log => log.elevatorId).filter(Boolean))].sort();
    } else {
      // ✅ Use the pre-extracted unique IDs from the count query (no register filtering case)
      uniqueElevatorIds = uniqueElevatorIdsFromAllMatching;
    }
    console.log(`📋 [${requestId}] Unique elevator IDs: ${uniqueElevatorIds.length} elevators`);
    
    // ✅ Handle pagination based on whether register filtering was applied
    let finalLogs, totalCount, hasMore;
    const totalTime = Date.now() - startTime;
    
    if (hasRegisterFilters || hasRegisterSearch) {
      // ✅ Register filtering was applied - paginate the filtered results
      const totalFiltered = filteredLogs.length;
      const startIndex = parseInt(offset);
      const endIndex = startIndex + parseInt(limit);
      finalLogs = filteredLogs.slice(startIndex, endIndex);
      totalCount = totalFiltered;
      hasMore = endIndex < totalFiltered;
      
      console.log(`✅ [${requestId}] Returning ${finalLogs.length} logs from ${totalFiltered} filtered logs (offset: ${startIndex}, limit: ${parseInt(limit)})`);
    } else {
      // ✅ No register filtering - logs are already paginated
      finalLogs = filteredLogs;
      // ✅ Use the pre-calculated total count (with device allowlist applied)
      totalCount = totalMatchingCount;
      // ✅ Calculate hasMore based on actual total count
      hasMore = (parseInt(offset) + filteredLogs.length) < totalMatchingCount;
      
      console.log(`✅ [${requestId}] Returning ${finalLogs.length} paginated logs (total: ${totalMatchingCount}, offset: ${parseInt(offset)}, hasMore: ${hasMore})`);
    }
    
    const enrichedLogs = finalLogs.map((log) => ({
      ...log,
      errorCode: normalizeCode(log.errorCode),
      errorInfo: getErrorDetails(log.errorCode)
    }));

    res.json({ 
      logs: enrichedLogs, 
      total: totalCount, 
      limit: parseInt(limit), 
      offset: parseInt(offset), 
      hasMore,
      uniqueElevatorIds: uniqueElevatorIds,
      timing: totalTime
    });
    
  } catch (err) {
    console.error(`❌ [${requestId}] /api/elevators/all-logs error:`, err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ✅ HELPER FUNCTION: Calculate working hours for an elevator given all its logs
// This is extracted from the original logic to be reusable
function calculateElevatorWorkingHours(allLogs) {
  let totalWorkingMs = 0;
  let currentWorkingStart = null;
  let currentSessionStart = null;
  let currentSessionDuration = 0;
  let currentMaintenanceStart = null;
  let currentMaintenanceDuration = 0;

  for (let i = 0; i < allLogs.length; i++) {
    const currentLog = allLogs[i];
    const nextLog = allLogs[i + 1];

    // Parse Reg66H bit0 (In Service) and bit2 (Maintenance ON)
    const reg66 = parseInt(currentLog.data[1]) || 0;
    const reg66Binary = reg66.toString(2).padStart(16, '0');
    const reg66H = reg66Binary.substring(0, 8);
    const isWorking = reg66H[7] === '1';
    const isMaintenance = reg66H[5] === '1';

    // Working hours calculation
    if (isWorking) {
      if (currentWorkingStart === null) {
        currentWorkingStart = new Date(currentLog.timestamp);
        currentSessionStart = new Date(currentLog.timestamp);
      }

      if (!nextLog) {
        const now = new Date();
        const sessionDuration = now - currentWorkingStart;
        totalWorkingMs += sessionDuration;
        currentSessionDuration = sessionDuration;
      } else {
        const nextReg66 = parseInt(nextLog.data[1]) || 0;
        const nextReg66Binary = nextReg66.toString(2).padStart(16, '0');
        const nextReg66H = nextReg66Binary.substring(0, 8);
        const nextIsWorking = nextReg66H[7] === '1';

        if (!nextIsWorking) {
          const sessionEnd = new Date(nextLog.timestamp);
          const sessionDuration = sessionEnd - currentWorkingStart;
          totalWorkingMs += sessionDuration;
          currentWorkingStart = null;
          currentSessionStart = null;
        }
      }
    } else {
      currentWorkingStart = null;
      currentSessionStart = null;
    }

    // Maintenance hours calculation
    if (isMaintenance) {
      if (currentMaintenanceStart === null) {
        currentMaintenanceStart = new Date(currentLog.timestamp);
      }

      if (!nextLog) {
        const now = new Date();
        const sessionDuration = now - currentMaintenanceStart;
        currentMaintenanceDuration = sessionDuration;
      } else {
        const nextReg66 = parseInt(nextLog.data[1]) || 0;
        const nextReg66Binary = nextReg66.toString(2).padStart(16, '0');
        const nextReg66H = nextReg66Binary.substring(0, 8);
        const nextIsMaintenance = nextReg66H[5] === '1';

        if (!nextIsMaintenance) {
          currentMaintenanceStart = null;
        }
      }
    } else {
      currentMaintenanceStart = null;
    }
  }

  // Format working hours
  const totalWorkingHours = totalWorkingMs / (1000 * 60 * 60);
  const currentSessionHours = currentSessionDuration / (1000 * 60 * 60);
  const currentMaintenanceHours = currentMaintenanceDuration / (1000 * 60 * 60);

  const days = Math.floor(totalWorkingHours / 24);
  const hours = Math.floor(totalWorkingHours % 24);
  const minutes = Math.floor((totalWorkingHours % 1) * 60);
  let workingHoursText = '';
  if (days > 0) workingHoursText += `${days}d `;
  if (hours > 0) workingHoursText += `${hours}h `;
  if (minutes > 0) workingHoursText += `${minutes}m`;
  if (workingHoursText === '') workingHoursText = '0m';

  const sessDays = Math.floor(currentSessionHours / 24);
  const sessHours = Math.floor(currentSessionHours % 24);
  const sessMinutes = Math.floor((currentSessionHours % 1) * 60);
  let currentSessionText = '';
  if (sessDays > 0) currentSessionText += `${sessDays}d `;
  if (sessHours > 0) currentSessionText += `${sessHours}h `;
  if (sessMinutes > 0) currentSessionText += `${sessMinutes}m`;
  if (currentSessionText === '') currentSessionText = '0m';

  let sessionStartText = 'Not Working';
  if (currentSessionStart) {
    sessionStartText = currentSessionStart.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  }

  const maintDays = Math.floor(currentMaintenanceHours / 24);
  const maintHours = Math.floor(currentMaintenanceHours % 24);
  const maintMinutes = Math.floor((currentMaintenanceHours % 1) * 60);
  let maintenanceSessionText = '';
  if (maintDays > 0) maintenanceSessionText += `${maintDays}d `;
  if (maintHours > 0) maintenanceSessionText += `${maintHours}h `;
  if (maintMinutes > 0) maintenanceSessionText += `${maintMinutes}m`;
  if (maintenanceSessionText === '') maintenanceSessionText = '0m';

  let maintenanceStartText = 'Not in Maintenance';
  if (currentMaintenanceStart) {
    maintenanceStartText = currentMaintenanceStart.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  }

  return {
    workingHours: {
      total: totalWorkingHours,
      formatted: workingHoursText.trim(),
      currentSession: currentSessionStart ? {
        start: sessionStartText,
        duration: currentSessionHours,
        formatted: currentSessionText.trim()
      } : null
    },
    maintenanceHours: currentMaintenanceStart ? {
      currentSession: {
        start: maintenanceStartText,
        duration: currentMaintenanceHours,
        formatted: maintenanceSessionText.trim()
      }
    } : null
  };
}

// ✅ Helper function to transform new format to old format
function transformNewFormatToOld(dataArray) {
  try {
    // Starting transformation of new format data
    
    // ✅ Initialize with default values
    let transformedData = {
      craneCompany: null,
      DeviceID: null,
      Uid: null,
      Timestamp: null,
      Longitude: "0.000000",
      Latitude: "0.000000",
      DigitalInput1: "0",
      DigitalInput2: "0"
    };
    
    // ✅ Process each object in the array
    dataArray.forEach((item, index) => {
      // Processing item
      
      // ✅ Extract common fields (should be same for all items)
      if (!transformedData.craneCompany) transformedData.craneCompany = item.craneCompany;
      if (!transformedData.DeviceID) transformedData.DeviceID = item.DeviceID;
      if (!transformedData.Timestamp) {
        // ✅ FIX: Convert Linux timestamp string to UTC Date object here
        if (typeof item.Timestamp === 'string') {
          const timestampNum = parseInt(item.Timestamp);
          if (!isNaN(timestampNum)) {
            // ✅ Convert Linux timestamp (seconds) to UTC Date object
            transformedData.Timestamp = new Date(timestampNum * 1000);
            console.log(`🔍 [transform] Converting timestamp "${item.Timestamp}" to UTC Date: ${transformedData.Timestamp.toISOString()}`);
          } else {
            transformedData.Timestamp = item.Timestamp; // Keep original if parsing fails
          }
        } else {
          transformedData.Timestamp = item.Timestamp; // Keep original if not string
        }
      }
      if (!transformedData.Uid && (item.Uid || item.uid)) transformedData.Uid = item.Uid || item.uid;
      
      // ✅ Parse data based on dataType
      try {
        const parsedData = JSON.parse(item.data);
        
        switch (item.dataType) {
          case "Gps":
            if (Array.isArray(parsedData) && parsedData.length >= 2) {
              transformedData.Latitude = parsedData[0].toString();
              transformedData.Longitude = parsedData[1].toString();
              // GPS data parsed successfully
            }
            break;
            
          case "maintenance":
            if (Array.isArray(parsedData) && parsedData.length >= 1) {
              transformedData.DigitalInput2 = parsedData[0].toString();
              // Maintenance data parsed successfully
            }
            break;
            
          case "Ignition":
            if (Array.isArray(parsedData) && parsedData.length >= 1) {
              transformedData.DigitalInput1 = parsedData[0].toString();
              // Ignition data parsed successfully
            }
            break;
            
          default:
            // Unknown dataType encountered
        }
      } catch (parseError) {
        console.error(`❌ Error parsing data for ${item.dataType}:`, parseError);
      }
    });
    
    // Transformation completed successfully
    return transformedData;
    
  } catch (error) {
    console.error('❌ Error in transformNewFormatToOld:', error);
    throw error;
  }
}

// ✅ GET: Fetch crane overview data for dashboard (with periodic data logic)
app.get("/api/crane/overview", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    
    // User requesting crane data
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    const deviceIdToUid = new Map(allowedDevices.map(d => [d.deviceId, d.uid]));

    // ✅ Get all crane devices for this company only, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    if (craneDevices.length === 0) {
      return res.json({
        totalWorkingHours: 0,
        completedHours: 0,
        ongoingHours: 0,
        activeCranes: 0,
        inactiveCranes: 0,
        underMaintenance: 0,
        craneDevices: [], // ✅ Add crane devices to response
        // ✅ Add empty crane ID arrays for tooltips
        activeCraneIds: [],
        inactiveCraneIds: [],
        maintenanceCraneIds: [],
        quickStats: {
          today: { completed: 0, ongoing: 0, idle: 0, maintenance: 0 },
          thisWeek: { completed: 0, ongoing: 0, idle: 0, maintenance: 0 },
          thisMonth: { completed: 0, ongoing: 0, idle: 0, maintenance: 0 },
          thisYear: { completed: 0, ongoing: 0, idle: 0, maintenance: 0 }
        }
      });
    }

    // ✅ NEW: Calculate UTC date range for current month (1st of month to current time)
    const now = new Date(); // Current time
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0); // 1st of month 00:00 local time
    
    // ✅ Convert IST to UTC for MongoDB query (IST is UTC+5:30)
    const utcStart = new Date(currentMonthStart.getTime() - (5.5 * 60 * 60 * 1000)); // IST to UTC
    const utcEnd = now; // Current time (already in UTC)
    
    console.log(`🔍 [API] Current month range: IST ${currentMonthStart.toLocaleString('en-IN')} to ${now.toLocaleString('en-IN')}`);
    console.log(`🔍 [API] UTC query range: ${utcStart.toISOString()} to ${utcEnd.toISOString()}`);

    // ✅ Initialize monthly statistics
    let monthCompletedHours = 0;
    let monthOngoingHours = 0;
    let monthIdleHours = 0;
    let monthMaintenanceHours = 0;
    let activeCranes = 0;
    let inactiveCranes = 0;
    let underMaintenance = 0;
    
    // ✅ Initialize crane ID arrays for tooltips
    let activeCraneIds = [];
    let inactiveCraneIds = [];
    let maintenanceCraneIds = [];

    // ✅ Process each crane device for current month
    for (const deviceId of craneDevices) {
      const deviceFilter = { ...companyFilter, DeviceID: deviceId };
      
      // ✅ Query logs for current month only (UTC range)
      let deviceLogs = await CraneLog.find({
        ...deviceFilter,
        Timestamp: { $gte: utcStart, $lte: utcEnd }
      }).lean();

      // ✅ If logs contain Uid, enforce UID match when provided in logs
      const requiredUid = deviceIdToUid.get(deviceId);
      if (requiredUid) {
        deviceLogs = deviceLogs.filter(l => !l.Uid || l.Uid === requiredUid);
      }

      if (deviceLogs.length === 0) continue;

      // ✅ FIXED: Use improved periodic data logic with proper status filtering and gap handling
      const workingPeriods = calculateConsecutivePeriods(deviceLogs, 'working');
      const maintenancePeriods = calculateConsecutivePeriods(deviceLogs, 'maintenance');
      const idlePeriods = calculateConsecutivePeriods(deviceLogs, 'idle');
      
      // ✅ DEBUG: Log the periods found for this device
      console.log(`🔍 [overview] Device ${deviceId}: Found ${workingPeriods.length} working periods, ${maintenancePeriods.length} maintenance periods, ${idlePeriods.length} idle periods`);
      
      // ✅ DEBUG: Log working periods details (ChatGPT's suggestion)
      console.log('[overview] workingPeriods', workingPeriods.map(p => ({
        start: p.startTime?.toISOString(),
        end: p.endTime?.toISOString(),
        ongoing: p.isOngoing,
        status: p.status,
        durationH: +(p.duration?.toFixed?.(3) || 0)
      })));
      
      let deviceCompletedHours = 0;
      let deviceOngoingHours = 0;
      let deviceIdleHours = 0;
      let deviceMaintenanceHours = 0;
      let hasOngoingSession = false;

      // ✅ FIXED: Process working periods with proper clamping and sanity checks
      for (const p of workingPeriods) {
        const periodStart = p.startTime;
        const periodEnd = p.endTime;

        // ✅ Sanity check: flag unrealistic periods
        const periodDurationHours = (periodEnd - periodStart) / (1000 * 60 * 60);
        if (periodDurationHours > 14) {
          console.log(`⚠️ [overview] Device ${deviceId} - Unrealistic working period detected: ${periodDurationHours.toFixed(2)}h from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
        }

        const effectiveStart = periodStart < currentMonthStart ? currentMonthStart : periodStart;
        const effectiveEnd = periodEnd > now ? now : periodEnd;

        if (p.isOngoing) {
          // ✅ Count ongoing even with sparse pings, but cap it without recent heartbeats
          const lastLogTs = deviceLogs.length ? new Date(deviceLogs[deviceLogs.length - 1].Timestamp) : null;

          // 🔎 Add debug logs (temporarily) to verify behavior
          console.log('[ongoing] device', deviceId, {
            periodStart: p.startTime?.toISOString(),
            periodEnd: p.endTime?.toISOString(),
            isOngoing: p.isOngoing,
            lastLogTs: lastLogTs?.toISOString(),
            minutesSinceLastLog: lastLogTs ? ((now - lastLogTs) / 60000).toFixed(1) : null
          });

          // How long we're willing to keep counting after the last ping (tune as needed)
          const MAX_WITHOUT_PING_MIN = 1440; // e.g., 24 hours grace

          // Cap "now" to avoid infinite growth if device vanished
          let cappedNow = now;
          if (lastLogTs) {
            const maxAllowed = new Date(lastLogTs.getTime() + MAX_WITHOUT_PING_MIN * 60 * 1000);
            if (maxAllowed < cappedNow) cappedNow = maxAllowed;
          }

          const cappedEnd = (effectiveEnd > cappedNow) ? cappedNow : effectiveEnd;
          if (effectiveStart < cappedEnd) {
            const ongoingDuration = (cappedEnd - effectiveStart) / (1000 * 60 * 60);
        deviceOngoingHours += Math.max(0, ongoingDuration);
          hasOngoingSession = true;
            
            console.log(`🔍 [overview] Device ${deviceId} - Ongoing working session:`, {
              startTime: periodStart.toISOString(),
              ongoingDuration: ongoingDuration.toFixed(2),
              addedToOngoing: ongoingDuration.toFixed(2),
              lastLogTs: lastLogTs?.toISOString(),
              minutesSinceLastLog: lastLogTs ? ((now - lastLogTs) / 60000).toFixed(1) : null,
              cappedEnd: cappedEnd.toISOString()
            });
          }
        } else {
          if (effectiveStart < effectiveEnd) {
            const clampedDuration = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
            deviceCompletedHours += Math.max(0, clampedDuration);
            
            console.log(`🔍 [overview] Device ${deviceId} - Working period:`, {
              originalStart: periodStart.toISOString(),
              originalEnd: periodEnd.toISOString(),
              effectiveStart: effectiveStart.toISOString(),
              effectiveEnd: effectiveEnd.toISOString(),
              originalDuration: periodDurationHours.toFixed(2),
              clampedDuration: clampedDuration.toFixed(2),
              addedToCompleted: clampedDuration.toFixed(2)
            });
          }
        }
      }

      // ✅ FIXED: Process maintenance periods with proper clamping
      for (const p of maintenancePeriods) {
        if (!p.isOngoing) {
          const periodStart = p.startTime;
          const periodEnd = p.endTime;
          
          const effectiveStart = periodStart < currentMonthStart ? currentMonthStart : periodStart;
          const effectiveEnd = periodEnd > now ? now : periodEnd;
          
          if (effectiveStart < effectiveEnd) {
            const clampedDuration = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
            deviceMaintenanceHours += Math.max(0, clampedDuration);
          }
        }
      }

      // ✅ FIXED: Process idle periods with proper clamping
      for (const p of idlePeriods) {
        if (!p.isOngoing) {
          const periodStart = p.startTime;
          const periodEnd = p.endTime;
          
          const effectiveStart = periodStart < currentMonthStart ? currentMonthStart : periodStart;
          const effectiveEnd = periodEnd > now ? now : periodEnd;
          
          if (effectiveStart < effectiveEnd) {
            const clampedDuration = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
            deviceIdleHours += Math.max(0, clampedDuration);
          }
        }
      }

      // ✅ Add device hours to monthly totals
      monthCompletedHours += deviceCompletedHours;
      monthOngoingHours += deviceOngoingHours;
      monthIdleHours += deviceIdleHours;
      monthMaintenanceHours += deviceMaintenanceHours;
      
      // ✅ DEBUG: Log device totals
      console.log(`🔍 [overview] Device ${deviceId} totals:`, {
        completed: deviceCompletedHours.toFixed(2),
        ongoing: deviceOngoingHours.toFixed(2),
        idle: deviceIdleHours.toFixed(2),
        maintenance: deviceMaintenanceHours.toFixed(2)
      });

      // ✅ Update crane status counts based on CURRENT live status
      // Get the most recent log to check current status
      const latestLog = deviceLogs[deviceLogs.length - 1];
      const isCurrentlyInMaintenance = latestLog && latestLog.DigitalInput2 === '1';
      
      if (hasOngoingSession) {
        activeCranes++;
        activeCraneIds.push(deviceId);
      } else if (isCurrentlyInMaintenance) {
        underMaintenance++;
        maintenanceCraneIds.push(deviceId);
      } else {
        inactiveCranes++;
        inactiveCraneIds.push(deviceId);
      }
    }

    // ✅ Calculate total working hours
    const totalWorkingHours = monthCompletedHours + monthOngoingHours;
    
    // ✅ DEBUG: Log final monthly totals
    console.log(`🔍 [overview] Final monthly totals:`, {
      completed: monthCompletedHours.toFixed(2),
      ongoing: monthOngoingHours.toFixed(2),
      total: totalWorkingHours.toFixed(2),
      idle: monthIdleHours.toFixed(2),
      maintenance: monthMaintenanceHours.toFixed(2)
    });

    // ✅ Calculate period-based metrics (working, maintenance, idle)
    const { year: nowYear, month: nowMonth, day: nowDay } = getISTDateComponentsFromUtcDate(now);
    const todayBoundary = istStartUtcFromYMD(nowYear, nowMonth, nowDay);
    const weekAgo = new Date(todayBoundary.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodMonthStart = istStartUtcFromYMD(nowYear, nowMonth, 1); // ✅ First day of current month at IST midnight
    const yearStart = istStartUtcFromYMD(nowYear, 0, 1); // ✅ Jan 1st at IST midnight
    
    // Time boundaries calculated for period calculations

    function overlapHours(period, startDate, endDate) {
      // ✅ FIXED: Use the new period structure with durationHours
      const periodEnd = period.endTime ? period.endTime.getTime() : (period.startTime.getTime() + (period.durationHours * 60 * 60 * 1000));
      const periodStart = period.startTime.getTime();
      const queryStart = startDate.getTime();
      const queryEnd = endDate.getTime();
      
      if (periodStart < queryEnd && periodEnd > queryStart) {
        const overlapStart = Math.max(periodStart, queryStart);
        const overlapEnd = Math.min(periodEnd, queryEnd);
        return (overlapEnd - overlapStart) / (1000 * 60 * 60);
      }
      return 0;
    }

    async function calculateMetricsForPeriod(startDate, endDate) {
      let workingCompleted = 0, workingOngoing = 0;
      let maintenanceCompleted = 0, maintenanceOngoing = 0;
      let idleTotal = 0;
      const periodHours = (endDate - startDate) / (1000 * 60 * 60);

      for (const deviceId of craneDevices) {
        const deviceFilter = { ...companyFilter, DeviceID: deviceId };
        const allDeviceLogs = await CraneLog.find(deviceFilter).lean();
        allDeviceLogs.sort((a, b) => {
          const aTimestamp = parseTimestamp(a.Timestamp);
          const bTimestamp = parseTimestamp(b.Timestamp);
          if (!aTimestamp || !bTimestamp) return 0;
          return aTimestamp - bTimestamp;
        });

        // If no logs for this device → the entire period is idle for this device
        if (allDeviceLogs.length === 0) { 
          idleTotal += Math.max(0, periodHours); 
          continue; 
        }

        // ✅ FIXED: Use new period calculation with gap handling
        const workingPeriods = calculateConsecutivePeriods(allDeviceLogs, 'working');
        const maintenancePeriods = calculateConsecutivePeriods(allDeviceLogs, 'maintenance');

        // Per-device accumulators
        let dWorkingCompleted = 0, dWorkingOngoing = 0;
        let dMaintenanceCompleted = 0, dMaintenanceOngoing = 0;

        // ✅ FIXED: Working periods (per device) with new period structure
        workingPeriods.forEach(period => {
          if (!period.isOngoing) {
            const overlap = overlapHours(period, startDate, endDate);
            dWorkingCompleted += overlap;
          } else {
            // ✅ FIXED: For ongoing working sessions, use the actual period start time
            const effectiveStart = period.startTime >= startDate ? period.startTime : startDate;
            const duration = calculatePeriodDuration(effectiveStart, endDate, true);
            dWorkingOngoing += duration;
            
            // Ongoing working session details calculated
          }
        });

        // ✅ FIXED: Maintenance periods (per device) with new period structure
        maintenancePeriods.forEach(period => {
          if (!period.isOngoing) {
            const overlap = overlapHours(period, startDate, endDate);
            dMaintenanceCompleted += overlap;
          } else {
            // ✅ FIXED: For ongoing maintenance sessions, use smart start time logic
            let effectiveStart;
            
            if (period.startTime >= startDate) {
              // ✅ Ongoing maintenance started TODAY - use actual maintenance start time
              effectiveStart = period.startTime;
              console.log(`🔍 [overview] Ongoing maintenance started today at ${period.startTime.toISOString()}, using actual start time`);
            } else {
              // ✅ Ongoing maintenance started BEFORE today - use 00:00:00 of selected date
              effectiveStart = startDate;
              console.log(`🔍 [overview] Ongoing maintenance started before today (${period.startTime.toISOString()}), using 00:00:00 as start`);
            }
            
            const duration = calculatePeriodDuration(effectiveStart, endDate, true);
            dMaintenanceOngoing += duration;
            
            // ✅ DEBUG: Log the ongoing maintenance calculation
            console.log(`🔍 [overview] Ongoing maintenance calculation:`, {
              deviceId,
              periodStart: period.startTime.toISOString(),
              periodStartTime: period.startTime.toISOString(),
              startDate: startDate.toISOString(),
              effectiveStart: effectiveStart.toISOString(),
              endDate: endDate.toISOString(),
              durationHours: duration.toFixed(2),
              isStartedToday: period.startTime >= startDate
            });
            
            // Ongoing maintenance session details calculated
          }
        });

        // Compute per-device idle using per-device totals only
        const deviceWorking = dWorkingCompleted + dWorkingOngoing;
        const deviceMaintenance = dMaintenanceCompleted + dMaintenanceOngoing;
        const deviceIdle = Math.max(0, periodHours - deviceWorking - deviceMaintenance);
        idleTotal += deviceIdle;

        // Add per-device totals to global totals
        workingCompleted += dWorkingCompleted;
        workingOngoing += dWorkingOngoing;
        maintenanceCompleted += dMaintenanceCompleted;
        maintenanceOngoing += dMaintenanceOngoing;
      }

      const result = {
        working: {
          completed: Math.round(workingCompleted * 100) / 100,
          ongoing: Math.round(workingOngoing * 100) / 100,
          total: Math.round((workingCompleted + workingOngoing) * 100) / 100
        },
        maintenance: {
          completed: Math.round(maintenanceCompleted * 100) / 100,
          ongoing: Math.round(maintenanceOngoing * 100) / 100,
          total: Math.round((maintenanceCompleted + maintenanceOngoing) * 100) / 100
        },
        idle: Math.round(idleTotal * 100) / 100
      };
      
      // 🔍 DEBUG: Log final results for this period
      // Period results calculated
      
      return result;
    }

    // ✅ Calculate metrics for all periods in parallel
    const [todayMetrics, weekMetrics, monthMetrics, yearMetrics] = await Promise.all([
      calculateMetricsForPeriod(todayBoundary, now),
      calculateMetricsForPeriod(weekAgo, now),
      calculateMetricsForPeriod(periodMonthStart, now),
      calculateMetricsForPeriod(yearStart, now)
    ]);

    // Final totals calculated

    const finalResponse = {
      totalWorkingHours: +(monthCompletedHours + monthOngoingHours).toFixed(2),
      completedHours: +monthCompletedHours.toFixed(2),
      ongoingHours: +monthOngoingHours.toFixed(2),
      activeCranes,
      inactiveCranes,
      underMaintenance,
      craneDevices, // ✅ Add crane devices to response
      // ✅ Add crane ID arrays for tooltips
      activeCraneIds,
      inactiveCraneIds,
      maintenanceCraneIds,
      quickStats: {
        today: { completed: todayMetrics.working.completed, ongoing: todayMetrics.working.ongoing, maintenance: todayMetrics.maintenance.total, idle: todayMetrics.idle },
        thisWeek: { completed: weekMetrics.working.completed, ongoing: weekMetrics.working.ongoing, maintenance: todayMetrics.maintenance.total, idle: weekMetrics.idle },
        thisMonth: { completed: +monthCompletedHours.toFixed(2), ongoing: +monthOngoingHours.toFixed(2), maintenance: +monthMaintenanceHours.toFixed(2), idle: +monthIdleHours.toFixed(2) },
        thisYear: { completed: yearMetrics.working.completed, ongoing: yearMetrics.working.ongoing, maintenance: yearMetrics.maintenance.total, idle: yearMetrics.idle }
      }
    };
    
    // 🔍 DEBUG: Log the final Quick Stats being sent to frontend
    console.log('[overview] Final response quick stats:', finalResponse.quickStats);
    
    res.json(finalResponse);

  } catch (err) {
    console.error("❌ Crane overview fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch crane daily movement distances
app.get("/api/crane/movement", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { date } = req.query;
    
    // User requesting crane movement data
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Use provided date or current date
    const targetDate = date || getCurrentDateString();
    
    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    if (craneDevices.length === 0) {
      return res.json({
        date: targetDate,
        craneDistances: {},
        totalDistance: 0,
        averageDistance: 0
      });
    }
    
    // ✅ Get all crane logs for the target date
    const allCraneLogs = await CraneLog.find(companyFilter).lean();
    
    // ✅ Filter logs for the target date
    const dateFilteredLogs = allCraneLogs.filter(log => {
      const timestampParts = safeExtractTimestampParts(log.Timestamp);
      if (!timestampParts) return false;
      const logDate = timestampParts.datePart; // Extract date part
      return logDate === targetDate;
    });
    
    // ✅ Calculate distances using location utils
    const { craneDistances, totalDistance, averageDistance } = calculateAllCraneDistances(dateFilteredLogs, targetDate);
    
    // ✅ NEW: Ensure ALL cranes are included (even with 0m distance)
    const completeCraneDistances = {};
    
    // ✅ Add cranes with movement data
    Object.keys(craneDistances).forEach(deviceId => {
      completeCraneDistances[deviceId] = craneDistances[deviceId];
    });
    
    // ✅ Add cranes with 0m distance (no movement data)
    for (const deviceId of craneDevices) {
      if (!completeCraneDistances[deviceId]) {
        // ✅ Find any log for this crane to get location data (not just for target date)
        const craneLogs = allCraneLogs.filter(log => log.DeviceID === deviceId);
        
        if (craneLogs.length > 0) {
          // ✅ Use the most recent log for location data
          craneLogs.sort((a, b) => {
            const aTimestamp = parseTimestamp(a.Timestamp);
            const bTimestamp = parseTimestamp(b.Timestamp);
            if (!aTimestamp || !bTimestamp) return 0;
            return bTimestamp - aTimestamp; // Sort by most recent first
          });
          
          const mostRecentLog = craneLogs[0];
          completeCraneDistances[deviceId] = {
            deviceId,
            distance: 0,
            startLocation: {
              lat: mostRecentLog.Latitude,
              lon: mostRecentLog.Longitude,
              timestamp: mostRecentLog.Timestamp
            },
            endLocation: {
              lat: mostRecentLog.Latitude,
              lon: mostRecentLog.Longitude,
              timestamp: mostRecentLog.Timestamp
            }
          };
        } else {
          // ✅ No logs at all for this crane - skip it for now
          console.log(`⚠️ No logs found for crane ${deviceId}`);
          continue;
        }
      }
    }
    
    // Crane movement data calculated successfully
    
    res.json({
      date: targetDate,
      craneDistances: completeCraneDistances,
      totalDistance,
      averageDistance
    });
    
  } catch (err) {
    console.error("❌ Crane movement fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST: Export comprehensive crane analysis data for PDF generation
app.post("/api/export/crane-data", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { selectedCranes, selectedMonths } = req.body;
    
    // User requesting comprehensive export data
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Filter by selected cranes if specified
    const craneFilter = selectedCranes && selectedCranes.length > 0 
      ? { DeviceID: { $in: selectedCranes } } 
      : {};
    
    // ✅ Get all crane logs with filters
    const allCraneLogs = await CraneLog.find({ ...companyFilter, ...craneFilter }).lean();
    
    // ✅ Sort logs by timestamp
    allCraneLogs.sort((a, b) => {
      const aTimestamp = parseTimestamp(a.Timestamp);
      const bTimestamp = parseTimestamp(b.Timestamp);
      if (!aTimestamp || !bTimestamp) return 0;
      return aTimestamp - bTimestamp;
    });

    // ✅ 1. Generate Start/Stop Time Sessions
    const sessionsData = generateSessionsData(allCraneLogs, selectedCranes);
    
    // ✅ 2. Generate Cumulative Statistics
    const cumulativeStats = generateCumulativeStats(allCraneLogs, selectedCranes, selectedMonths);
    console.log('🔍 Cumulative stats generated:', cumulativeStats);
    
    // ✅ 3. Generate Movement Analysis
    const movementAnalysis = generateMovementAnalysis(allCraneLogs, selectedCranes, selectedMonths);
    
    // ✅ 4. Generate Monthly Movement Data
    const monthlyMovementData = generateMonthlyMovementData(allCraneLogs, selectedCranes, selectedMonths);
    
    // Comprehensive export data prepared successfully
    
    res.json({
      success: true,
      sessionsData,
      cumulativeStats,
      movementAnalysis,
      monthlyMovementData,
      summary: {
        totalCranes: selectedCranes ? selectedCranes.length : 0,
        totalMonths: selectedMonths ? selectedMonths.length : 0,
        totalSessions: sessionsData.length,
        totalLogs: allCraneLogs.length
      }
    });
    
  } catch (err) {
    console.error("❌ Comprehensive export data fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Helper function to generate sessions data (start/stop times)
function generateSessionsData(allCraneLogs, selectedCranes) {
  const sessionsData = [];
  
  for (const craneId of selectedCranes) {
    const craneLogs = allCraneLogs.filter(log => log.DeviceID === craneId);
    
    if (craneLogs.length === 0) continue;
    
    // Calculate consecutive periods
    const workingPeriods = calculateConsecutivePeriods(craneLogs, 'working');
    const maintenancePeriods = calculateConsecutivePeriods(craneLogs, 'maintenance');
    
    // ✅ Add working sessions (both completed and ongoing)
    workingPeriods.forEach(period => {
      const sessionData = {
        craneId,
        sessionType: 'Working',
        // Keep original formatted strings from logs to avoid Invalid Date
        startTime: period.startTimestamp,
        endTime: period.isOngoing ? 'Running' : period.endTimestamp,
        duration: period.duration,
        isOngoing: period.isOngoing,
        startLocation: {
          lat: period.logs[0]?.Latitude || 'N/A',
          lon: period.logs[0]?.Longitude || 'N/A'
        },
        endLocation: {
          lat: period.isOngoing ? 'N/A' : (period.logs[period.logs.length - 1]?.Latitude || 'N/A'),
          lon: period.isOngoing ? 'N/A' : (period.logs[period.logs.length - 1]?.Longitude || 'N/A')
        }
      };
      sessionsData.push(sessionData);
    });
    
    // ✅ Add maintenance sessions (both completed and ongoing)
    maintenancePeriods.forEach(period => {
      const sessionData = {
        craneId,
        sessionType: 'Maintenance',
        // Keep original formatted strings from logs to avoid Invalid Date
        startTime: period.startTimestamp,
        endTime: period.isOngoing ? 'Running' : period.endTimestamp,
        duration: period.duration,
        isOngoing: period.isOngoing,
        startLocation: {
          lat: period.logs[0]?.Latitude || 'N/A',
          lon: period.logs[0]?.Longitude || 'N/A'
        },
        endLocation: {
          lat: period.isOngoing ? 'N/A' : (period.logs[period.logs.length - 1]?.Latitude || 'N/A'),
          lon: period.isOngoing ? 'N/A' : (period.logs[period.logs.length - 1]?.Longitude || 'N/A')
        }
      };
      sessionsData.push(sessionData);
    });
  }
  
      // Sessions generated successfully
  return sessionsData;
}

// ✅ Helper function to generate cumulative statistics
function generateCumulativeStats(allCraneLogs, selectedCranes, selectedMonths) {
  const stats = {
    overall: { 
      working: 0, 
      workingCompleted: 0, 
      workingOngoing: 0,
      idle: 0, 
      maintenance: 0, 
      maintenanceCompleted: 0,
      maintenanceOngoing: 0,
      total: 0 
    },
    byCrane: {},
    byPeriod: {
      daily: {},
      monthly: {},
      yearly: {}
    }
  };
  
  for (const craneId of selectedCranes) {
    const craneLogs = allCraneLogs.filter(log => log.DeviceID === craneId);
    
    if (craneLogs.length === 0) continue;
    
    // Calculate periods for this crane
    const workingPeriods = calculateConsecutivePeriods(craneLogs, 'working');
    const maintenancePeriods = calculateConsecutivePeriods(craneLogs, 'maintenance');
    
    let craneWorkingCompleted = 0;
    let craneWorkingOngoing = 0;
    let craneMaintenanceCompleted = 0;
    let craneMaintenanceOngoing = 0;
    
    // Sum up working hours (separate completed vs ongoing)
    // Processing working periods for crane
    workingPeriods.forEach(period => {
      if (period.isOngoing) {
        craneWorkingOngoing += period.duration;
                  // Ongoing period calculated
      } else {
        craneWorkingCompleted += period.duration;
                  // Completed period calculated
      }
    });
    
    // Sum up maintenance hours (separate completed vs ongoing)
    maintenancePeriods.forEach(period => {
      if (period.isOngoing) {
        craneMaintenanceOngoing += period.duration;
      } else {
        craneMaintenanceCompleted += period.duration;
      }
    });
    
    const totalWorking = craneWorkingCompleted + craneWorkingOngoing;
    const totalMaintenance = craneMaintenanceCompleted + craneMaintenanceOngoing;
    
    // Calculate idle time (assuming 24 hours per day for the period)
    const totalDays = selectedMonths.length * 30; // Approximate
    const totalHours = totalDays * 24;
    const craneIdle = totalHours - totalWorking - totalMaintenance;
    
    // Store crane stats
    stats.byCrane[craneId] = {
      working: Math.round(totalWorking * 100) / 100,
      workingCompleted: Math.round(craneWorkingCompleted * 100) / 100,
      workingOngoing: Math.round(craneWorkingOngoing * 100) / 100,
      idle: Math.round(craneIdle * 100) / 100,
      maintenance: Math.round(totalMaintenance * 100) / 100,
      maintenanceCompleted: Math.round(craneMaintenanceCompleted * 100) / 100,
      maintenanceOngoing: Math.round(craneMaintenanceOngoing * 100) / 100,
      total: Math.round((totalWorking + craneIdle + totalMaintenance) * 100) / 100
    };
    
    // Add to overall stats
    stats.overall.working += totalWorking;
    stats.overall.workingCompleted += craneWorkingCompleted;
    stats.overall.workingOngoing += craneWorkingOngoing;
    stats.overall.idle += craneIdle;
    stats.overall.maintenance += totalMaintenance;
    stats.overall.maintenanceCompleted += craneMaintenanceCompleted;
    stats.overall.maintenanceOngoing += craneMaintenanceOngoing;
  }
  
  stats.overall.total = stats.overall.working + stats.overall.idle + stats.overall.maintenance;
  
  return stats;
}

// ✅ Helper function to generate movement analysis
function generateMovementAnalysis(allCraneLogs, selectedCranes, selectedMonths) {
  const movementData = {
    byCrane: {},
    byPeriod: {
      daily: {},
      weekly: {},
      monthly: {}
    }
  };
  
  for (const craneId of selectedCranes) {
    const craneLogs = allCraneLogs.filter(log => log.DeviceID === craneId);
    
    if (craneLogs.length === 0) continue;
    
    // Calculate total distance for this crane
    let totalDistance = 0;
    const movements = [];
    
    for (let i = 1; i < craneLogs.length; i++) {
      const prevLog = craneLogs[i - 1];
      const currLog = craneLogs[i];
      
      if (validateGPSData(prevLog.Latitude, prevLog.Longitude) && 
          validateGPSData(currLog.Latitude, currLog.Longitude)) {
        
        const distance = calculateDistance(
          parseFloat(prevLog.Latitude), 
          parseFloat(prevLog.Longitude),
          parseFloat(currLog.Latitude), 
          parseFloat(currLog.Longitude)
        );
        
        totalDistance += distance;
        
        movements.push({
          from: {
            lat: prevLog.Latitude,
            lon: prevLog.Longitude,
            timestamp: prevLog.Timestamp
          },
          to: {
            lat: currLog.Latitude,
            lon: currLog.Longitude,
            timestamp: currLog.Timestamp
          },
          distance: Math.round(distance * 100) / 100
        });
      }
    }
    
    movementData.byCrane[craneId] = {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalMovements: movements.length,
      averageDistancePerMovement: movements.length > 0 ? Math.round((totalDistance / movements.length) * 100) / 100 : 0,
      movements: movements
    };
  }
  
  return movementData;
}

// ✅ Helper function to generate monthly movement data
function generateMonthlyMovementData(allCraneLogs, selectedCranes, selectedMonths) {
  const monthlyData = {};
  
  for (const monthStr of selectedMonths) {
    try {
      const date = new Date(monthStr + ' 1, 2025');
      const targetDate = date.toLocaleDateString('en-GB');
      
      // Filter logs for this month
      const monthLogs = allCraneLogs.filter(log => {
        const timestampParts = safeExtractTimestampParts(log.Timestamp);
        if (!timestampParts) return false;
        const logDate = timestampParts.datePart;
        return logDate === targetDate;
      });
      
      if (monthLogs.length > 0) {
        // Calculate distances for this month
        const { craneDistances, totalDistance, averageDistance } = calculateAllCraneDistances(monthLogs, targetDate);
        
        monthlyData[monthStr] = {
          craneDistances,
          totalDistance,
          averageDistance,
          totalLogs: monthLogs.length
        };
      }
    } catch (err) {
      console.error(`❌ Error processing month ${monthStr}:`, err);
    }
  }
  
  return monthlyData;
}

// ✅ GET: Fetch crane logs for export functionality
app.get("/api/crane/logs", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    
    console.log('🔍 User requesting crane logs for export:', { role, companyName });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // ✅ Get crane logs only for allowed devices
    const craneLogs = await CraneLog.find({
      ...companyFilter,
      DeviceID: { $in: craneDevices }
    }).lean();
    
    // Crane logs fetched successfully
    
    res.json({
      success: true,
      logs: craneLogs,
      totalLogs: craneLogs.length
    });
    
  } catch (err) {
    console.error("❌ Crane logs fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch available months with data for specific cranes
app.get("/api/crane/available-months", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { cranes } = req.query; // Comma-separated crane IDs
    
    console.log('🔍 User requesting available months:', { role, companyName, cranes });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Filter by selected cranes if specified (only from allowed devices)
    let selectedCranes = [];
    if (cranes && cranes.length > 0) {
      const requestedCranes = cranes.split(',').map(s => s.trim()).filter(Boolean);
      selectedCranes = requestedCranes.filter(id => allowedById.has(id));
    }
    
    // ✅ Get crane logs with filters (only for allowed devices)
    const craneFilter = selectedCranes.length > 0 
      ? { DeviceID: { $in: selectedCranes } } 
      : {};
    
    // ✅ Get crane logs with filters
    const craneLogs = await CraneLog.find({ ...companyFilter, ...craneFilter }).lean();
    
    // ✅ Extract unique months from logs
    const monthSet = new Set();
    
    craneLogs.forEach(log => {
      try {
        const timestampParts = safeExtractTimestampParts(log.Timestamp);
        if (!timestampParts) return;
        const date = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day);
        const monthYear = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
        monthSet.add(monthYear);
      } catch (err) {
        console.error('❌ Error parsing timestamp:', log.Timestamp);
      }
    });
    
    // ✅ Convert to sorted array
    const availableMonths = Array.from(monthSet).sort((a, b) => {
      const dateA = new Date(a + ' 1, 2025');
      const dateB = new Date(b + ' 1, 2025');
      return dateA - dateB;
    });
    
    // Available months found successfully
    
    res.json({
      success: true,
      availableMonths,
      totalMonths: availableMonths.length
    });
    
  } catch (err) {
    console.error("❌ Available months fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch monthly crane statistics for line chart (last 6 months)
app.get("/api/crane/monthly-stats", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { cranes, start, end } = req.query;
    
    console.log('🔍 User requesting monthly crane stats:', { role, companyName, cranes, start, end });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // ✅ Narrow down to requested cranes if provided (only from allowed devices)
    const requested = (cranes || "").split(',').map(s => s.trim()).filter(Boolean);
    const selectedDevices = requested.length > 0 ? craneDevices.filter(id => requested.includes(id)) : craneDevices;
    
    if (selectedDevices.length === 0) {
      return res.json({ monthlyData: [] });
    }

    const toISTDate = (yyyy_mm_dd, endOfDay = false) => {
      const [y, m, d] = (yyyy_mm_dd || '').split('-').map(Number);
      if (!y || !m || !d) return null;
      // ✅ FIXED: Use IST helpers for timezone-agnostic date parsing
      return endOfDay ? istEndUtcFromYMD(y, m - 1, d) : istStartUtcFromYMD(y, m - 1, d);
    };

    const now = getCurrentTimeInIST();

    // ✅ Build month buckets (default last 6 months, or based on provided range)
    const monthBuckets = [];
    if (start && end) {
      const rangeStart = toISTDate(start, false);
      const rangeEnd = toISTDate(end, true);
      if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
        return res.json({ monthlyData: [] });
      }
      // ✅ FIXED: Use IST calendar dates for bucket generation
      const IST_OFFSET_MIN = 330;
      const istRangeStart = new Date(rangeStart.getTime() + IST_OFFSET_MIN * 60 * 1000);
      const istRangeEnd = new Date(rangeEnd.getTime() + IST_OFFSET_MIN * 60 * 1000);
      let cursor = new Date(Date.UTC(istRangeStart.getUTCFullYear(), istRangeStart.getUTCMonth(), 1));
      const lastMonth = new Date(Date.UTC(istRangeEnd.getUTCFullYear(), istRangeEnd.getUTCMonth(), 1));
      while (cursor <= lastMonth) {
        const ms = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const me = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
        const label = `${ms.toLocaleString('default', { month: 'short' })} ${ms.getFullYear()}`;
        monthBuckets.push({ start: ms, end: me, label });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else {
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ms = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const me = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
        const label = `${monthDate.toLocaleString('default', { month: 'short' })} ${monthDate.getFullYear()}`;
        monthBuckets.push({ start: ms, end: me, label });
      }
    }

    const monthlyData = [];

    for (const bucket of monthBuckets) {
      const monthStart = bucket.start;
      let monthEnd = bucket.end;
      const nowClamp = getCurrentTimeInIST();
      if (monthEnd > nowClamp) monthEnd = nowClamp;
      let monthUsageHours = 0;
      let monthMaintenanceHours = 0;

      // ✅ Calculate for each selected device
      for (const deviceId of selectedDevices) {
        const deviceFilter = { ...companyFilter, DeviceID: deviceId };
        const deviceLogs = await CraneLog.find(deviceFilter).lean();
        
        // Filter logs within this month
        const monthLogs = deviceLogs.filter(log => {
          try {
            const timestampParts = safeExtractTimestampParts(log.Timestamp);
            if (!timestampParts) return false;
            const logTime = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day, timestampParts.hours, timestampParts.minutes, timestampParts.seconds);
            return logTime >= monthStart && logTime <= monthEnd;
          } catch (err) {
            console.error(`❌ Error parsing timestamp for monthly filtering:`, err);
            return false;
          }
        });

        if (monthLogs.length === 0) continue;

        // Sort by timestamp
        monthLogs.sort((a, b) => {
          const aParts = safeExtractTimestampParts(a.Timestamp);
          const bParts = safeExtractTimestampParts(b.Timestamp);
          if (!aParts || !bParts) return 0;
          
          const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
          const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
          return aTimestamp - bTimestamp;
        });

        // Working periods
        const workingPeriods = calculateConsecutivePeriods(monthLogs, 'working');
        for (const period of workingPeriods) {
                            if (period.isOngoing) {
                    // ✅ FIX: For ongoing periods, always use monthStart to avoid 5.5h offset
                    // The issue is that period.startTime was calculated with old parseTimestamp
                    const duration = calculatePeriodDuration(monthStart, getCurrentTimeInIST(), true);
                    monthUsageHours += duration;
                  } else {
            const effectiveStart = period.startTime < monthStart ? monthStart : period.startTime;
            const effectiveEnd = period.endTime > monthEnd ? monthEnd : period.endTime;
            const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
            monthUsageHours += duration;
          }
        }

        // Maintenance periods
        const maintenancePeriods = calculateConsecutivePeriods(monthLogs, 'maintenance');
        for (const period of maintenancePeriods) {
                            if (period.isOngoing) {
                    // ✅ FIX: For ongoing periods, always use monthStart to avoid 5.5h offset
                    // The issue is that period.startTime was calculated with old parseTimestamp
                    const duration = calculatePeriodDuration(monthStart, getCurrentTimeInIST(), true);
                    monthMaintenanceHours += duration;
                  } else {
            const effectiveStart = period.startTime < monthStart ? monthStart : period.startTime;
            const effectiveEnd = period.endTime > monthEnd ? monthEnd : period.endTime;
            const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
            monthMaintenanceHours += duration;
          }
        }
      }

      monthlyData.push({
        month: bucket.label,
        usageHours: Math.round(monthUsageHours * 100) / 100,
        maintenanceHours: Math.round(monthMaintenanceHours * 100) / 100
      });
    }

    // Monthly crane stats calculated successfully
    res.json({ monthlyData });
  } catch (err) {
    console.error("❌ Monthly crane stats fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch individual crane statistics for bar chart (last 6 months)
app.get("/api/crane/crane-stats", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { cranes, start, end } = req.query;
    
    console.log('🔍 User requesting individual crane stats:', { role, companyName, cranes, start, end });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Get unique crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // ✅ Narrow down devices by query if provided
    const requested = (cranes || "").split(',').map(s => s.trim()).filter(Boolean);
    const selectedDevices = requested.length > 0 ? craneDevices.filter(id => requested.includes(id)) : craneDevices;
    
    if (selectedDevices.length === 0) {
      return res.json({ craneData: [] });
    }

    const toISTDate = (yyyy_mm_dd, endOfDay = false) => {
      const [y, m, d] = (yyyy_mm_dd || '').split('-').map(Number);
      if (!y || !m || !d) return null;
      // ✅ FIXED: Use IST helpers for timezone-agnostic date parsing
      return endOfDay ? istEndUtcFromYMD(y, m - 1, d) : istStartUtcFromYMD(y, m - 1, d);
    };

    // ✅ Determine period
    let periodStart, periodEnd;
    if (start && end) {
      periodStart = toISTDate(start, false);
      periodEnd = toISTDate(end, true);
      if (!periodStart || !periodEnd || periodStart > periodEnd) {
        return res.json({ craneData: [] });
      }
    } else {
    const now = getCurrentTimeInIST();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      periodStart = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    
    // ✅ Calculate total hours in the selected period
    // Clamp end to now if it's in the future
const nowForClamp = getCurrentTimeInIST();
const effectivePeriodEnd = periodEnd > nowForClamp ? nowForClamp : periodEnd;
const totalPeriodHours = (effectivePeriodEnd - periodStart) / (1000 * 60 * 60);
    
    const craneData = [];

    // ✅ Calculate stats for each selected device
    for (const deviceId of selectedDevices) {
      const deviceFilter = { ...companyFilter, DeviceID: deviceId };
      const deviceLogs = await CraneLog.find(deviceFilter).lean();
      
      // Filter logs within the period
      let periodLogs = deviceLogs.filter(log => {
        try {
          const timestampParts = safeExtractTimestampParts(log.Timestamp);
          if (!timestampParts) return false;
          const logTime = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day, timestampParts.hours, timestampParts.minutes, timestampParts.seconds);
          return logTime >= periodStart && logTime <= effectivePeriodEnd;
        } catch (err) {
          console.error(`❌ Error parsing timestamp for crane stats filtering:`, err);
          return false;
        }
      });

      // ✅ Carry-over handling: if the last log BEFORE periodStart indicates the crane was
      // working or under maintenance, seed a synthetic log at 00:00 so periods start at midnight
      try {
        const formatAsDdMmYyyyHhMmSs = (d) => {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
        };

        // Find the last log before the selected start
        const lastBefore = [...deviceLogs].reverse().find(x => {
          const ts = parseTimestamp(x.Timestamp);
          return ts && ts < periodStart;
        });

        if (lastBefore) {
          const wasMaint = lastBefore.DigitalInput2 === "1";
          const wasWorking = lastBefore.DigitalInput1 === "1" && lastBefore.DigitalInput2 === "0";
          if (wasMaint || wasWorking) {
            const synthetic = {
              Timestamp: formatAsDdMmYyyyHhMmSs(periodStart),
              DigitalInput1: wasWorking ? "1" : lastBefore.DigitalInput1,
              DigitalInput2: wasMaint ? "1" : (wasWorking ? "0" : lastBefore.DigitalInput2)
            };
            periodLogs = [synthetic, ...periodLogs];
            console.log(`🔧 [crane-stats] ${deviceId} carry-over at start: seeded synthetic log ${synthetic.Timestamp} DI1=${synthetic.DigitalInput1} DI2=${synthetic.DigitalInput2}`);
          }
        }
      } catch (e) {
        console.log(`⚠️ [crane-stats] ${deviceId} carry-over seed failed:`, e?.message || e);
      }

      if (periodLogs.length === 0) {
        craneData.push({
          craneId: deviceId,
          workingHours: 0,
          inactiveHours: Math.round(totalPeriodHours * 100) / 100,
          maintenanceHours: 0
        });
        continue;
      }

        // Sort by timestamp
        periodLogs.sort((a, b) => {
          const aParts = safeExtractTimestampParts(a.Timestamp);
          const bParts = safeExtractTimestampParts(b.Timestamp);
          if (!aParts || !bParts) return 0;
          
          const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
          const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
          return aTimestamp - bTimestamp;
        });

      let workingHours = 0;
      let maintenanceHours = 0;

      // Working periods
      const workingPeriods = calculateConsecutivePeriods(periodLogs, 'working');
      for (const period of workingPeriods) {
        if (period.isOngoing) {
          // ✅ FIX: For ongoing sessions, cap at the end of selected period (not current time)
          const effectiveStart = period.startTime < periodStart ? periodStart : period.startTime;
          const duration = calculatePeriodDuration(effectiveStart, effectivePeriodEnd, false);
          workingHours += duration;
        } else {
          const effectiveStart = period.startTime < periodStart ? periodStart : period.startTime;
          const effectiveEnd = period.endTime > effectivePeriodEnd ? effectivePeriodEnd : period.endTime;
          const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
          workingHours += duration;
        }
      }

      // Maintenance periods
      const maintenancePeriods = calculateConsecutivePeriods(periodLogs, 'maintenance');
      for (const period of maintenancePeriods) {
        if (period.isOngoing) {
          // ✅ FIX: For ongoing sessions, cap at the end of selected period (not current time)
          const effectiveStart = period.startTime < periodStart ? periodStart : period.startTime;
          const duration = calculatePeriodDuration(effectiveStart, effectivePeriodEnd, false);
          maintenanceHours += duration;
        } else {
          const effectiveStart = period.startTime < periodStart ? periodStart : period.startTime;
          const effectiveEnd = period.endTime > effectivePeriodEnd ? effectivePeriodEnd : period.endTime;
          const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
          maintenanceHours += duration;
        }
      }

      const inactiveHours = Math.max(0, totalPeriodHours - workingHours - maintenanceHours);

      craneData.push({
        craneId: deviceId,
        workingHours: Math.round(workingHours * 100) / 100,
        inactiveHours: Math.round(inactiveHours * 100) / 100,
        maintenanceHours: Math.round(maintenanceHours * 100) / 100
      });
    }

    
    res.json({ craneData });
  } catch (err) {
    console.error("❌ Individual crane stats fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch previous month performance stats
app.get("/api/crane/previous-month-stats", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { month, year } = req.query; // Optional: month (0-11), year
    
    console.log('🔍 User requesting previous month stats:', { role, companyName, month, year });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    if (craneDevices.length === 0) {
      return res.json({ 
        monthName: "No Data",
        workingHours: 0,
        maintenanceHours: 0,
        idleHours: 0,
        utilizationRate: 0,
        totalHours: 0
      });
    }

    // ✅ Calculate target month (default: previous month)
    const now = getCurrentTimeInIST();
    let targetMonth, targetYear;
    
    if (month !== undefined && year !== undefined) {
      // Use provided month/year
      targetMonth = parseInt(month);
      targetYear = parseInt(year);
    } else {
      // Default to previous month
      targetMonth = now.getMonth() - 1;
      targetYear = now.getFullYear();
      
      // Handle January case (previous month would be December of previous year)
      if (targetMonth < 0) {
        targetMonth = 11; // December
        targetYear = now.getFullYear() - 1;
      }
    }
    
    // ✅ Calculate month period
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
    const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    // ✅ Clamp end to now if target month is the current month
    const nowForClampPM = getCurrentTimeInIST();
    const effectiveMonthEnd = (targetYear === nowForClampPM.getFullYear() && targetMonth === nowForClampPM.getMonth())
      ? (monthEnd > nowForClampPM ? nowForClampPM : monthEnd)
      : monthEnd;
    
    // ✅ Calculate total hours in the (effective) month period
    const totalHours = (effectiveMonthEnd - monthStart) / (1000 * 60 * 60);
    
    let totalWorkingHours = 0;
    let totalMaintenanceHours = 0;

    // ✅ Calculate for each crane device
    for (const deviceId of craneDevices) {
      const deviceFilter = { ...companyFilter, DeviceID: deviceId };
      
      // Get all logs for this device
      const deviceLogs = await CraneLog.find(deviceFilter).lean();
      
      // Filter logs within this month
      const monthLogs = deviceLogs.filter(log => {
        try {
          const timestampParts = safeExtractTimestampParts(log.Timestamp);
          if (!timestampParts) return false;
          const logTime = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day, timestampParts.hours, timestampParts.minutes, timestampParts.seconds);
          return logTime >= monthStart && logTime <= effectiveMonthEnd;
        } catch (err) {
          console.error(`❌ Error parsing timestamp for previous month filtering:`, err);
          return false;
        }
      });

      if (monthLogs.length === 0) continue;

      // Sort by timestamp
      monthLogs.sort((a, b) => {
        const aParts = safeExtractTimestampParts(a.Timestamp);
        const bParts = safeExtractTimestampParts(b.Timestamp);
        if (!aParts || !bParts) return 0;
        
        const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
        const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
        
        return aTimestamp - bTimestamp;
      });

      // ✅ NEW: Calculate working hours using periodic data logic
      const workingPeriods = calculateConsecutivePeriods(monthLogs, 'working');
      
      for (const period of workingPeriods) {
                        if (period.isOngoing) {
                  // ✅ FIX: For ongoing sessions, always use monthStart to avoid 5.5h offset
                  // The issue is that period.startTime was calculated with old parseTimestamp
                  const currentTime = getCurrentTimeInIST();
                  const duration = calculatePeriodDuration(monthStart, currentTime, true);
                  totalWorkingHours += duration;
                } else {
          // For completed sessions, calculate from period start to period end
          const periodStart = period.startTime;
          const periodEnd = period.endTime;
          
          // If session started before this month, count from month start
          const effectiveStart = periodStart < monthStart ? monthStart : periodStart;
          // If session ended after this month, count until month end
          const effectiveEnd = periodEnd > monthEnd ? monthEnd : periodEnd;
          
          const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
          totalWorkingHours += duration;
        }
      }

      // ✅ NEW: Calculate maintenance hours using periodic data logic
      const maintenancePeriods = calculateConsecutivePeriods(monthLogs, 'maintenance');
      
      for (const period of maintenancePeriods) {
                        if (period.isOngoing) {
                  // ✅ FIX: For ongoing sessions, always use monthStart to avoid 5.5h offset
                  // The issue is that period.startTime was calculated with old parseTimestamp
                  const currentTime = getCurrentTimeInIST();
                  const duration = calculatePeriodDuration(monthStart, currentTime, true);
                  totalMaintenanceHours += duration;
                } else {
          // For completed sessions, calculate from period start to period end
          const periodStart = period.startTime;
          const periodEnd = period.endTime;
          
          // If session started before this month, count from month start
          const effectiveStart = periodStart < monthStart ? monthStart : periodStart;
          // If session ended after this month, count until month end
          const effectiveEnd = periodEnd > monthEnd ? monthEnd : periodEnd;
          
          const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
          totalMaintenanceHours += duration;
        }
      }
    }

    // ✅ Calculate idle hours and utilization rate
    const totalIdleHours = Math.max(0, totalHours - totalWorkingHours - totalMaintenanceHours);
    const utilizationRate = totalHours > 0 ? (totalWorkingHours / totalHours) * 100 : 0;

    console.log(`✅ Previous month stats calculated for ${monthName}: Working: ${totalWorkingHours.toFixed(2)}h, Maintenance: ${totalMaintenanceHours.toFixed(2)}h, Idle: ${totalIdleHours.toFixed(2)}h`);

    res.json({
      monthName,
      workingHours: Math.round(totalWorkingHours * 100) / 100,
      maintenanceHours: Math.round(totalMaintenanceHours * 100) / 100,
      idleHours: Math.round(totalIdleHours * 100) / 100,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100
    });

  } catch (err) {
    console.error("❌ Previous month stats fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch maintenance updates for all cranes
app.get("/api/crane/maintenance-updates", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { month, year } = req.query; // Optional: month (0-11), year
    
    console.log('🔍 User requesting maintenance updates:', { role, companyName, month, year });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    if (craneDevices.length === 0) {
      return res.json({ 
        monthName: "No Data",
        summary: {
          totalMaintenanceHours: 0,
          totalSessions: 0,
          averageDuration: 0
        },
        craneData: []
      });
    }

    // ✅ Calculate target month (default: current month)
    const now = getCurrentTimeInIST();
    let targetMonth, targetYear;
    
    if (month !== undefined && year !== undefined) {
      // Use provided month/year
      targetMonth = parseInt(month);
      targetYear = parseInt(year);
    } else {
      // Default to current month
      targetMonth = now.getMonth();
      targetYear = now.getFullYear();
    }
    
    // ✅ Calculate month period
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
    const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    // ✅ Clamp end to now if target is the current month
    const nowForClampMaint = getCurrentTimeInIST();
    const effectiveMonthEnd = (targetYear === nowForClampMaint.getFullYear() && targetMonth === nowForClampMaint.getMonth())
      ? (monthEnd > nowForClampMaint ? nowForClampMaint : monthEnd)
      : monthEnd;
    
    let totalMaintenanceHours = 0;
    let totalSessions = 0;
    const craneData = [];

    // ✅ Calculate for each crane device
    for (const deviceId of craneDevices) {
      const deviceFilter = { ...companyFilter, DeviceID: deviceId };
      
      // Get all logs for this device
      const deviceLogs = await CraneLog.find(deviceFilter).lean();
      
      // Filter logs within this month
      const monthLogs = deviceLogs.filter(log => {
        try {
          const timestampParts = safeExtractTimestampParts(log.Timestamp);
          if (!timestampParts) return false;
          const logTime = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day, timestampParts.hours, timestampParts.minutes, timestampParts.seconds);
          return logTime >= monthStart && logTime <= effectiveMonthEnd;
  } catch (err) {
          console.error(`❌ Error parsing timestamp for maintenance filtering:`, err);
          return false;
        }
      });

      if (monthLogs.length === 0) continue;

      // Sort by timestamp
      monthLogs.sort((a, b) => {
        const aParts = safeExtractTimestampParts(a.Timestamp);
        const bParts = safeExtractTimestampParts(b.Timestamp);
        if (!aParts || !bParts) return 0;
        
        const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
        const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
        
        return aTimestamp - bTimestamp;
      });

      let craneMaintenanceHours = 0;
      let craneSessions = 0;
      const maintenanceSessions = [];

      // ✅ Find maintenance sessions (DigitalInput2 = "1" sessions)
      console.log(`🔍 Checking ${deviceId} for maintenance sessions in ${monthName}. Total logs: ${monthLogs.length}`);
      
      // Debug: Show all logs for this crane in this month
      console.log(`🔍 All logs for ${deviceId} in ${monthName}:`);
      monthLogs.forEach((log, index) => {
        console.log(`  ${index}: ${log.Timestamp} - DigitalInput1: ${log.DigitalInput1}, DigitalInput2: ${log.DigitalInput2}`);
      });
      
      for (let i = 0; i < monthLogs.length - 1; i++) {
        const currentLog = monthLogs[i];
        const nextLog = monthLogs[i + 1];

        // Find maintenance start (DigitalInput2 changes from "0" to "1")
        if (currentLog.DigitalInput2 === "0" && nextLog.DigitalInput2 === "1") {
          console.log(`🔍 Found maintenance start for ${deviceId}: ${currentLog.Timestamp} (0) -> ${nextLog.Timestamp} (1)`);
          const sessionStart = nextLog.Timestamp; // ✅ Use the timestamp when maintenance actually started
          let sessionEnd = null;
          let sessionDuration = 0;
          let isOngoing = false;

          // Find maintenance end (DigitalInput2 changes from "1" to "0")
          for (let j = i + 1; j < monthLogs.length - 1; j++) {
            const checkLog = monthLogs[j];
            const nextCheckLog = monthLogs[j + 1];
            
            if (checkLog.DigitalInput2 === "1" && nextCheckLog.DigitalInput2 === "0") {
              sessionEnd = nextCheckLog.Timestamp; // ✅ Use the timestamp when maintenance actually ended
              
              // Calculate duration
              try {
                const startParts = safeExtractTimestampParts(sessionStart);
                const endParts = safeExtractTimestampParts(sessionEnd);
                if (!startParts || !endParts) continue;
                
                const startTimeIST = new Date(startParts.year, startParts.month - 1, startParts.day, startParts.hours, startParts.minutes, startParts.seconds);
                const endTimeIST = new Date(endParts.year, endParts.month - 1, endParts.day, endParts.hours, endParts.minutes, endParts.seconds);
                
                sessionDuration = (endTimeIST - startTimeIST) / (1000 * 60 * 60);
                craneMaintenanceHours += sessionDuration;
                craneSessions++;
                console.log(`✅ Found maintenance session for ${deviceId}: ${sessionStart} to ${sessionEnd} = ${sessionDuration.toFixed(2)}h`);
              } catch (err) {
                console.error(`❌ Error calculating maintenance session duration:`, err);
              }
              break;
            }
          }

          // If no end found, it's ongoing
          if (!sessionEnd) {
            sessionEnd = "Ongoing";
            isOngoing = true;
            
            // Calculate ongoing duration
            try {
              const startParts = safeExtractTimestampParts(sessionStart);
              if (!startParts) continue;
              
              const startTimeIST = new Date(startParts.year, startParts.month - 1, startParts.day, startParts.hours, startParts.minutes, startParts.seconds);
              
              const currentTime = getCurrentTimeInIST();
              const endClamp = currentTime > effectiveMonthEnd ? effectiveMonthEnd : currentTime;
              sessionDuration = (endClamp - startTimeIST) / (1000 * 60 * 60);
              craneMaintenanceHours += sessionDuration;
              craneSessions++;
              console.log(`✅ Found ongoing maintenance session for ${deviceId}: ${sessionStart} to ongoing = ${sessionDuration.toFixed(2)}h`);
            } catch (err) {
              console.error(`❌ Error calculating ongoing maintenance duration:`, err);
            }
          }

          maintenanceSessions.push({
            startTime: sessionStart,
            endTime: sessionEnd,
            duration: Math.round(sessionDuration * 100) / 100,
            isOngoing
          });
        }
      }

      // ✅ Add crane data if it has maintenance sessions
      if (craneSessions > 0) {
        const averageDuration = craneSessions > 0 ? craneMaintenanceHours / craneSessions : 0;
        
        craneData.push({
          craneId: deviceId,
          totalHours: Math.round(craneMaintenanceHours * 100) / 100,
          sessions: craneSessions,
          averageDuration: Math.round(averageDuration * 100) / 100,
          maintenanceSessions
        });

        totalMaintenanceHours += craneMaintenanceHours;
        totalSessions += craneSessions;
      }
    }

    // ✅ Calculate summary
    const averageDuration = totalSessions > 0 ? totalMaintenanceHours / totalSessions : 0;

    console.log(`✅ Maintenance updates calculated for ${monthName}: Total: ${totalMaintenanceHours.toFixed(2)}h, Sessions: ${totalSessions}`);
    
    res.json({
      monthName,
      summary: {
        totalMaintenanceHours: Math.round(totalMaintenanceHours * 100) / 100,
        totalSessions,
        averageDuration: Math.round(averageDuration * 100) / 100
      },
      craneData
    });

  } catch (err) {
    console.error("❌ Maintenance updates fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch crane devices for dropdown (filtered by company)
app.get("/api/crane/devices", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    
    console.log('🔍 User requesting crane devices:', { role, companyName });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    const deviceIdToUid = new Map(allowedDevices.map(d => [d.deviceId, d.uid]));

    // ✅ Get unique crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // ✅ Get latest log for each device to get location info
    const devicesWithInfo = await Promise.all(
      craneDevices.map(async (deviceId) => {
        const latestLog = await CraneLog.findOne(
          { ...companyFilter, DeviceID: deviceId },
          { Longitude: 1, Latitude: 1, Timestamp: 1 },
          { sort: { createdAt: -1 } }
        ).lean();
        
        return {
          DeviceID: deviceId,
          location: `${latestLog?.Latitude || 'N/A'}, ${latestLog?.Longitude || 'N/A'}`,
          lastUpdate: latestLog?.Timestamp || 'Never'
        };
      })
    );
    
    console.log(`✅ Found ${devicesWithInfo.length} crane devices for ${companyName}`);
    
    res.json(devicesWithInfo);
    
  } catch (err) {
    console.error("❌ Crane devices fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch live crane locations for map display
app.get("/api/crane/live-locations", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    
    console.log('🔍 User requesting live crane locations:', { role, companyName });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    const deviceIdToUid = new Map(allowedDevices.map(d => [d.deviceId, d.uid]));

    // ✅ Get unique crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // ✅ Get latest log for each device with full details
    const liveCranes = await Promise.all(
      craneDevices.map(async (deviceId) => {
        let latestLog = await CraneLog.findOne(
          { ...companyFilter, DeviceID: deviceId },
          { 
            Longitude: 1, 
            Latitude: 1, 
            Timestamp: 1, 
            DigitalInput1: 1, 
            DigitalInput2: 1,
            Uid: 1,
            craneCompany: 1
          },
          { sort: { createdAt: -1 } }
        ).lean();
        
        if (!latestLog) return null;

        // ✅ Enforce UID match if present in log
        const requiredUid = deviceIdToUid.get(deviceId);
        if (requiredUid && latestLog.Uid && latestLog.Uid !== requiredUid) {
          return null;
        }
        
        // ✅ Determine status based on DigitalInput values
        let status = "idle";
        if (latestLog.DigitalInput2 === "1") {
          status = "maintenance";
        } else if (latestLog.DigitalInput1 === "1") {
          status = "working";
        }
        
        return {
          id: deviceId,
          craneId: deviceId,
          status: status,
          latitude: parseFloat(latestLog.Latitude) || 0,
          longitude: parseFloat(latestLog.Longitude) || 0,
          location: `${latestLog.Latitude}, ${latestLog.Longitude}`,
          lastUpdated: latestLog.Timestamp,
          company: latestLog.craneCompany,
          digitalInput1: latestLog.DigitalInput1,
          digitalInput2: latestLog.DigitalInput2,
          uid: latestLog.Uid || null
        };
      })
    );
    
    // ✅ Filter out null values and return valid cranes
    const validCranes = liveCranes.filter(crane => crane !== null);
    
    console.log(`✅ Found ${validCranes.length} live cranes for ${companyName}`);
    
    res.json(validCranes);
    
  } catch (err) {
    console.error("❌ Live crane locations fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch individual crane status
app.get("/api/crane/status", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { deviceId } = req.query;
    
    console.log('🔍 User requesting crane status:', { role, companyName, deviceId });
    
    if (!deviceId) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    
    // ✅ Filter by company and device
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    const deviceFilter = { ...companyFilter, DeviceID: deviceId };
    
    // ✅ Get latest log for this device
    const latestLog = await CraneLog.findOne(deviceFilter)
      .sort({ createdAt: -1 })
      .lean();
    
    if (!latestLog) {
      return res.status(404).json({ error: "Crane device not found" });
    }
    
    // ✅ Determine status based on DigitalInput values
    let status = "Unknown";
    let statusColor = "secondary";
    let isOperating = false;
    let isDown = false;
    
    if (latestLog.DigitalInput2 === "1") {
      status = "Maintenance";
      statusColor = "warning";
      isDown = true;
    } else if (latestLog.DigitalInput1 === "1") {
      status = "Operating";
      statusColor = "success";
      isOperating = true;
    } else {
      status = "Idle";
      statusColor = "info";
    }
    
    const craneStatus = {
      status,
      statusColor,
      isOperating,
      isDown,
      lastUpdate: latestLog.Timestamp,
      location: `${latestLog.Latitude}, ${latestLog.Longitude}`,
      deviceId: latestLog.DeviceID,
      digitalInput1: latestLog.DigitalInput1,
      digitalInput2: latestLog.DigitalInput2
    };
    
    console.log(`✅ Crane ${deviceId} status: ${status}`);
    
    res.json(craneStatus);
    
  } catch (err) {
    console.error("❌ Crane status fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch daily crane statistics for tooltips
app.get("/api/crane/daily-stats/:deviceId", authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { role, companyName } = req.user;
    
    console.log('🔍 User requesting daily stats for crane:', deviceId, { role, companyName });
    
    // ✅ Filter by company (except for superadmin)
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    
    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));
    
    // ✅ Verify the requested device is allowed
    if (!allowedById.has(deviceId)) {
      console.log(`❌ Device ${deviceId} not found in allowed devices for ${companyName}`);
      return res.status(403).json({ error: "Device not authorized" });
    }
    
    // ✅ Get today's date range in IST consistently (use same basis as parseTimestamp/istStartUtcFromYMD)
    const now = new Date();
    const { year: nowYear, month: nowMonth, day: nowDay } = getISTDateComponentsFromUtcDate(now);
    const startOfDay = istStartUtcFromYMD(nowYear, nowMonth, nowDay); // 00:00:00 IST
    
    console.log('🔍 Date range:', { startOfDay, today: now });
    
    // ✅ Use the main parseTimestamp function (already fixed above)
    
    // ✅ Fetch all logs for this device today (use string comparison for DD/MM/YYYY format)
    const allLogs = await CraneLog.find({
      ...companyFilter,
      DeviceID: deviceId
    }, {
      Timestamp: 1,
      DigitalInput1: 1,
      DigitalInput2: 1
    }).sort({ Timestamp: 1 }).lean();
    
    console.log('🔍 Found total logs:', allLogs.length);
    
    // ✅ Filter logs for today only (Date object format) - use IST date
    const todayLogs = allLogs.filter(log => {
      if (!log.Timestamp || !(log.Timestamp instanceof Date)) return false;
      
      // Convert to IST for date comparison
      const logDate = new Date(log.Timestamp.getTime() + (5.5 * 60 * 60 * 1000));
      const todayDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      
      return logDate.getDate() === todayDate.getDate() && 
             logDate.getMonth() === todayDate.getMonth() && 
             logDate.getFullYear() === todayDate.getFullYear();
    });
    
    console.log('🔍 Found today logs:', todayLogs.length);
    if (todayLogs.length > 0) {
      console.log('🔍 Sample today log:', todayLogs[0]);
    }
    
    // ✅ Check if crane is working from previous day (ongoing session)
    if (todayLogs.length === 0) {
      // ✅ Check last log before startOfDay for carry-over
      const lastBeforeStart = [...allLogs].reverse().find((entry) => {
        const ts = parseTimestamp(entry.Timestamp);
        return ts && ts < startOfDay;
      });
      if (lastBeforeStart && lastBeforeStart.DigitalInput1 === "1" && lastBeforeStart.DigitalInput2 === "0") {
        const workingHours = (now - startOfDay) / (1000 * 60 * 60);
        console.log(`🔍 ${deviceId} has ongoing working session from yesterday, calculating from 00:00:00 to now`);
        console.log(`🔍 [DEBUG] Carry-over calculation: now=${now.toISOString()}, startOfDay=${startOfDay.toISOString()}, workingHours=${workingHours}`);
        return res.json({
          deviceId,
          workingHours: Math.round(workingHours * 100) / 100,
          idleHours: 0,
          maintenanceHours: 0,
          totalHours: Math.round(workingHours * 100) / 100,
          lastSeen: lastBeforeStart.Timestamp
        });
      }
      
      // ✅ No ongoing session - return zero hours
      return res.json({
        deviceId,
        workingHours: 0,
        idleHours: 0,
        maintenanceHours: 0,
        totalHours: 0,
        lastSeen: null
      });
    }
    
    // ✅ Calculate working hours based on DigitalInput changes
    let workingTime = 0;
    let idleTime = 0;
    let maintenanceTime = 0;
    let lastStatus = null;
    let statusStartTime = null;
    
    // ✅ Seed synthetic first log at 00:00 if last pre-start status was working/maintenance
    (function seedCarryOverIfNeeded() {
      const lastBeforeStart = [...allLogs].reverse().find((entry) => {
        const ts = parseTimestamp(entry.Timestamp);
        return ts && ts < startOfDay;
      });
      if (!lastBeforeStart) return;
      const wasWorking = lastBeforeStart.DigitalInput1 === "1" && lastBeforeStart.DigitalInput2 === "0";
      const wasMaint = lastBeforeStart.DigitalInput2 === "1";
      if (wasWorking || wasMaint) {
        todayLogs.unshift({
          Timestamp: startOfDay, // Use Date object directly
          DigitalInput1: wasWorking ? "1" : lastBeforeStart.DigitalInput1,
          DigitalInput2: wasMaint ? "1" : (wasWorking ? "0" : lastBeforeStart.DigitalInput2)
        });
        console.log(`🔧 [daily-stats] ${deviceId} seeded synthetic start log at 00:00 due to carry-over`);
      }
    })();

    for (let i = 0; i < todayLogs.length; i++) {
      const log = todayLogs[i];
      const currentStatus = log.DigitalInput2 === "1" ? "maintenance" : 
                           log.DigitalInput1 === "1" ? "working" : "idle";
      
      if (i === 0) {
        // ✅ First log - check if this is an ongoing session from previous day
        const firstLogTime = parseTimestamp(log.Timestamp);
        if (currentStatus === "working" && firstLogTime <= startOfDay) {
          // ✅ Crane was working before or at midnight today - start counting from midnight IST
          lastStatus = currentStatus;
          statusStartTime = startOfDay;
          console.log(`🔍 ${deviceId} ongoing working session detected, starting from 00:00:00`);
        } else {
          // ✅ Normal session starting today
          lastStatus = currentStatus;
          statusStartTime = parseTimestamp(log.Timestamp);
        }
      } else if (currentStatus !== lastStatus) {
        // Status changed - calculate time for previous status
        const statusEndTime = parseTimestamp(log.Timestamp);
        if (statusStartTime && statusEndTime) {
          const duration = (statusEndTime - statusStartTime) / (1000 * 60 * 60); // Convert to hours
          
          if (lastStatus === "working") {
            workingTime += duration;
          } else if (lastStatus === "idle") {
            idleTime += duration;
          } else if (lastStatus === "maintenance") {
            maintenanceTime += duration;
          }
          
          // Update for new status
          lastStatus = currentStatus;
          statusStartTime = parseTimestamp(log.Timestamp);
        }
      }
    }
    
    // ✅ Calculate time for the last status (from last change to current time)
    if (statusStartTime) {
      let finalDuration;
      
      // ✅ Check if this is an ongoing session from previous day
      if (lastStatus === "working") {
        // ✅ If crane was working before today, count from 12 AM to current time
        const firstLogTime = parseTimestamp(todayLogs[0].Timestamp);
        if (firstLogTime <= startOfDay) {
                  // ✅ Cross-day ongoing session - count from midnight to current time
        finalDuration = (now - startOfDay) / (1000 * 60 * 60);
        console.log(`🔍 ${deviceId} has ongoing working session from yesterday, counting from 00:00:00 to now`);
        console.log(`🔍 [DEBUG] Duration calculation: now=${now.toISOString()}, startOfDay=${startOfDay.toISOString()}, finalDuration=${finalDuration}`);
        } else {
          // ✅ Normal ongoing session within today
          finalDuration = (now - statusStartTime) / (1000 * 60 * 60);
          console.log(`🔍 [DEBUG] Normal ongoing session: now=${now.toISOString()}, statusStartTime=${statusStartTime.toISOString()}, finalDuration=${finalDuration}`);
        }
        workingTime += finalDuration;
      } else if (lastStatus === "idle") {
        finalDuration = (now - statusStartTime) / (1000 * 60 * 60);
        idleTime += finalDuration;
      } else if (lastStatus === "maintenance") {
        finalDuration = (now - statusStartTime) / (1000 * 60 * 60);
        maintenanceTime += finalDuration;
      }
    }
    
    // ✅ Get last seen timestamp
    const lastSeen = todayLogs[todayLogs.length - 1]?.Timestamp;
    
    // ✅ Calculate total hours
    const totalHours = workingTime + idleTime + maintenanceTime;
    
    const stats = {
      deviceId,
      workingHours: Math.round(workingTime * 100) / 100, // Round to 2 decimal places
      idleHours: Math.round(idleTime * 100) / 100,
      maintenanceHours: Math.round(maintenanceTime * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      lastSeen: lastSeen
    };
    
    console.log(`✅ Daily stats for crane ${deviceId}:`, stats);
    res.json(stats);
    
  } catch (err) {
    console.error("❌ Daily crane stats fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Ongoing session stats for hover tooltips (status-aware, no date constraints)
app.get("/api/crane/ongoing-session/:deviceId", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { deviceId } = req.params;

    // ✅ Company filter
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};

    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));

    // ✅ Verify the requested device is allowed
    if (!allowedById.has(deviceId)) {
      return res.status(403).json({ error: "Device not authorized" });
    }

    // ✅ Fetch recent logs (no hard date filter). We'll sort reliably in JS using parsed timestamps.
    const rawLogs = await CraneLog.find({ ...companyFilter, DeviceID: deviceId }).lean();
    if (!rawLogs || rawLogs.length === 0) {
      return res.json({
        deviceId,
        currentStatus: "unknown",
        sessionStartTimestamp: null,
        sessionStartISO: null,
        ongoingHours: 0,
        lastSeen: null
      });
    }

    // ✅ Sort by actual time using parseTimestamp
    const logs = [...rawLogs].sort((a, b) => {
      const ta = parseTimestamp(a.Timestamp);
      const tb = parseTimestamp(b.Timestamp);
      if (!ta || !tb) return 0;
      return ta - tb;
    });

    const latest = logs[logs.length - 1];
    const lastSeen = latest?.Timestamp || null;

    // ✅ Determine current status
    const statusFromLog = (log) => {
      if (!log) return "unknown";
      if (log.DigitalInput2 === "1") return "maintenance";
      if (log.DigitalInput1 === "1" && log.DigitalInput2 === "0") return "working";
      return "idle";
    };

    const currentStatus = statusFromLog(latest);

    // ✅ Walk backward to find when this status started
    let sessionStart = parseTimestamp(latest.Timestamp);
    for (let i = logs.length - 2; i >= 0; i--) {
      const s = statusFromLog(logs[i]);
      if (s !== currentStatus) {
        // The session started at the next entry after status changed
        break;
      }
      sessionStart = parseTimestamp(logs[i].Timestamp) || sessionStart;
    }

    const now = getCurrentTimeInIST();
    const ongoingHours = Math.max(0, (now - sessionStart) / (1000 * 60 * 60));

    return res.json({
      deviceId,
      currentStatus,
      sessionStartTimestamp: logs.find(l => parseTimestamp(l.Timestamp)?.getTime() === sessionStart.getTime())?.Timestamp || latest.Timestamp,
      sessionStartISO: sessionStart.toISOString(),
      ongoingHours: Math.round(ongoingHours * 100) / 100,
      lastSeen
    });
  } catch (err) {
    console.error("❌ Ongoing session stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch individual crane activity data
app.get("/api/crane/activity", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { deviceId } = req.query;
    
    console.log('🔍 User requesting crane activity:', { role, companyName, deviceId });
    
    if (!deviceId) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    
    // ✅ Filter by company and device
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    const deviceFilter = { ...companyFilter, DeviceID: deviceId };
    
    // ✅ Get all logs for this device
    const deviceLogs = await CraneLog.find(deviceFilter)
      .sort({ createdAt: 1 })
      .lean();
    
    if (deviceLogs.length === 0) {
      return res.json({
        todayHours: 0,
        weekHours: 0,
        monthHours: 0,
        totalHours: 0,
        completedSessions: 0,
        ongoingHours: 0
      });
    }
    
    // ✅ Sort by timestamp
    deviceLogs.sort((a, b) => {
      const aParts = safeExtractTimestampParts(a.Timestamp);
      const bParts = safeExtractTimestampParts(b.Timestamp);
      if (!aParts || !bParts) return 0;
      
      const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
      const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
      
      return aTimestamp - bTimestamp;
    });
    
    // ✅ Calculate working hours for different periods
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // ✅ Helper function to calculate hours for a period
    function calculateHoursForPeriod(startDate, endDate = getCurrentTimeInIST()) {
      let completedHours = 0;
      let ongoingHours = 0;
      
      // Filter logs within period
      const periodLogs = deviceLogs.filter(log => {
        const timestampParts = safeExtractTimestampParts(log.Timestamp);
        if (!timestampParts) return false;
        const logTime = new Date(timestampParts.year, timestampParts.month - 1, timestampParts.day, timestampParts.hours, timestampParts.minutes, timestampParts.seconds);
        const logTimeIST = new Date(logTime.getTime() + (5.5 * 60 * 60 * 1000)); // Convert to IST
        return logTimeIST >= startDate && logTimeIST <= endDate;
      });
      
      // Calculate completed sessions
      for (let i = 0; i < periodLogs.length - 1; i++) {
        const currentLog = periodLogs[i];
        const nextLog = periodLogs[i + 1];
        
        if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
          try {
            const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
            const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
            if (!currentParts || !nextParts) continue;
            
            const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
            const currentTime = convertISTToUTC(currentTimeIST);
            
            const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
            const nextTime = convertISTToUTC(nextTimeIST);
            
            const hoursDiff = (nextTime - currentTime) / (1000 * 60 * 60);
            completedHours += hoursDiff;
          } catch (err) {
            console.error(`❌ Error parsing timestamps for activity calculation:`, err);
          }
        }
      }
      
      // Check for ongoing session
      const latestLog = periodLogs[periodLogs.length - 1];
      if (latestLog && latestLog.DigitalInput1 === "1") {
        try {
          const latestParts = safeExtractTimestampParts(latestLog.Timestamp);
          if (!latestParts) return completedHours + ongoingHours;
          
          const latestTimeIST = new Date(latestParts.year, latestParts.month - 1, latestParts.day, latestParts.hours, latestParts.minutes, latestParts.seconds);
          const latestTime = convertISTToUTC(latestTimeIST);
          
          const ongoingHoursDiff = (endDate - latestTime) / (1000 * 60 * 60);
          if (ongoingHoursDiff > 0 && ongoingHoursDiff < 72) { // Allow up to 3 days for ongoing sessions
            ongoingHours = ongoingHoursDiff;
          }
        } catch (err) {
          console.error(`❌ Error calculating ongoing hours for activity:`, err);
        }
      }
      
      return completedHours + ongoingHours;
    }
    
    // ✅ Calculate hours for different periods
    const todayHours = calculateHoursForPeriod(today);
    const weekHours = calculateHoursForPeriod(weekAgo);
    const monthHours = calculateHoursForPeriod(monthAgo);
    const totalHours = calculateHoursForPeriod(new Date(0)); // All time
    
    // ✅ Count completed sessions and extract operating sessions
    let completedSessions = 0;
    const operatingSessions = [];
    
    // ✅ Extract operating sessions from device logs
    for (let i = 0; i < deviceLogs.length - 1; i++) {
      const currentLog = deviceLogs[i];
      const nextLog = deviceLogs[i + 1];
      
      if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
        completedSessions++;
        
        try {
          // ✅ Calculate session duration
          const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
          const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
          if (!currentParts || !nextParts) continue;
          
          const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
          const currentTime = convertISTToUTC(currentTimeIST);
          
          const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
          const nextTime = convertISTToUTC(nextTimeIST);
          
          const sessionHours = (nextTime - currentTime) / (1000 * 60 * 60);
          
          const session = {
            date: currentParts.datePart, // DD/MM/YYYY
            startTime: currentParts.timePart, // HH:mm:ss
            stopTime: nextParts.timePart, // HH:mm:ss
            totalHours: Math.round(sessionHours * 100) / 100
          };
          operatingSessions.push(session);
        } catch (err) {
          console.error(`❌ Error parsing session timestamps:`, err);
        }
      }
    }
    
    // ✅ Check for ongoing session (latest log)
    const latestLog = deviceLogs[deviceLogs.length - 1];
    if (latestLog && latestLog.DigitalInput1 === "1") {
      try {
        const latestParts = safeExtractTimestampParts(latestLog.Timestamp);
        if (!latestParts) return;
        
        const latestTimeIST = new Date(
          latestParts.year, // year
          latestParts.month - 1, // month (0-based)
          latestParts.day, // day
          latestParts.hours, // hour
          latestParts.minutes, // minute
          latestParts.seconds // second
        );
        
        const currentTime = getCurrentTimeInIST();
        const ongoingHoursDiff = (currentTime - latestTimeIST) / (1000 * 60 * 60);
        
        if (ongoingHoursDiff > 0 && ongoingHoursDiff < 72) { // Allow up to 3 days for ongoing sessions
          const ongoingSession = {
            date: latestDatePart,
            startTime: latestTimePart,
            stopTime: "Running...",
            totalHours: Math.round(ongoingHoursDiff * 100) / 100
          };
          operatingSessions.unshift(ongoingSession); // Add to beginning
        }
      } catch (err) {
        console.error(`❌ Error calculating ongoing session:`, err);
      }
    }
    
    // ✅ Sort sessions by date (newest first)
    operatingSessions.sort((a, b) => {
      const [aDay, aMonth, aYear] = a.date.split('/').map(Number);
      const [bDay, bMonth, bYear] = b.date.split('/').map(Number);
      const aDate = new Date(aYear, aMonth - 1, aDay);
      const bDate = new Date(bYear, bMonth - 1, bDay);
      return bDate - aDate; // Newest first
    });
    
    const craneActivity = {
      todayHours: Math.round(todayHours * 100) / 100,
      weekHours: Math.round(weekHours * 100) / 100,
      monthHours: Math.round(monthHours * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      completedSessions,
      ongoingHours: Math.round(ongoingHours * 100) / 100,
      operatingSessions: operatingSessions.slice(0, 10) // Return last 10 sessions
    };
    
    console.log(`✅ Crane ${deviceId} activity calculated:`, craneActivity);
    
    res.json(craneActivity);
    
  } catch (err) {
    console.error("❌ Crane activity fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET: Fetch crane chart data for individual device
app.get("/api/crane/chart", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { deviceId, period = '24hr' } = req.query;
    
    console.log('🔍 User requesting crane chart data:', { role, companyName, deviceId, period });
    
    if (!deviceId) {
      return res.status(400).json({ error: "Device ID is required" });
    }
    
    // ✅ Filter by company and device
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};
    const deviceFilter = { ...companyFilter, DeviceID: deviceId };
    
    // ✅ Get all logs for this device
    const deviceLogs = await CraneLog.find(deviceFilter)
      .sort({ createdAt: 1 })
      .lean();
    
    if (deviceLogs.length === 0) {
      return res.json({ labels: [], data: [] });
    }
    
    // ✅ Sort by timestamp
    deviceLogs.sort((a, b) => {
      // ✅ Handle both Date objects and string timestamps
      if (a.Timestamp instanceof Date && b.Timestamp instanceof Date) {
        return a.Timestamp.getTime() - b.Timestamp.getTime();
      }
      
      // ✅ Fallback to string parsing if needed
      const aParts = safeExtractTimestampParts(a.Timestamp);
      const bParts = safeExtractTimestampParts(b.Timestamp);
      
      if (!aParts || !bParts) return 0;
      
      const aTimestamp = new Date(aParts.year, aParts.month - 1, aParts.day, aParts.hours, aParts.minutes, aParts.seconds);
      const bTimestamp = new Date(bParts.year, bParts.month - 1, bParts.day, bParts.hours, bParts.minutes, bParts.seconds);
      
      return aTimestamp - bTimestamp;
    });
    
    // ✅ Calculate chart data based on period
    let labels = [];
    let data = [];
    
    const now = new Date();
    
    switch (period) {
      case '24hr':
        // ✅ Last 24 hours by hour
        labels = [];
        data = [];
        for (let i = 23; i >= 0; i--) {
          const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
          labels.push(hour.getHours().toString().padStart(2, '0') + ':00');
          
          // ✅ Calculate operating hours for this hour
          const hourStart = new Date(hour.getFullYear(), hour.getMonth(), hour.getDate(), hour.getHours(), 0, 0);
          const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
          
          let hourHours = 0;
          for (let j = 0; j < deviceLogs.length - 1; j++) {
            const currentLog = deviceLogs[j];
            const nextLog = deviceLogs[j + 1];
            
            if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
              try {
                const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
                const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
                if (!currentParts || !nextParts) continue;
                
                const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
                const currentTime = convertISTToUTC(currentTimeIST);
                
                const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
                const nextTime = convertISTToUTC(nextTimeIST);
                
                // ✅ Check if session overlaps with this hour
                const sessionStart = Math.max(currentTime, hourStart);
                const sessionEnd = Math.min(nextTime, hourEnd);
                
                if (sessionStart < sessionEnd) {
                  hourHours += (sessionEnd - sessionStart) / (1000 * 60 * 60);
                }
              } catch (err) {
                console.error(`❌ Error parsing chart timestamps:`, err);
              }
            }
          }
          data.push(Math.round(hourHours * 100) / 100);
        }
        break;
        
      case 'weekly':
        // ✅ Last 7 days by day
        labels = [];
        data = [];
        for (let i = 6; i >= 0; i--) {
          const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          labels.push(day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
          
          // ✅ Calculate operating hours for this day
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          
          let dayHours = 0;
          for (let j = 0; j < deviceLogs.length - 1; j++) {
            const currentLog = deviceLogs[j];
            const nextLog = deviceLogs[j + 1];
            
            if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
              try {
                const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
                const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
                if (!currentParts || !nextParts) continue;
                
                const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
                const currentTime = convertISTToUTC(currentTimeIST);
                
                const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
                const nextTime = convertISTToUTC(nextTimeIST);
                
                // ✅ Check if session overlaps with this day
                const sessionStart = Math.max(currentTime, dayStart);
                const sessionEnd = Math.min(nextTime, dayEnd);
                
                if (sessionStart < sessionEnd) {
                  dayHours += (sessionEnd - sessionStart) / (1000 * 60 * 60);
                }
              } catch (err) {
                console.error(`❌ Error parsing chart timestamps:`, err);
              }
            }
          }
          data.push(Math.round(dayHours * 100) / 100);
        }
        break;
        
      case 'monthly':
        // ✅ Last 30 days by day
        labels = [];
        data = [];
        for (let i = 29; i >= 0; i--) {
          const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          labels.push(day.getDate().toString());
          
          // ✅ Calculate operating hours for this day (same logic as weekly)
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          
          let dayHours = 0;
          for (let j = 0; j < deviceLogs.length - 1; j++) {
            const currentLog = deviceLogs[j];
            const nextLog = deviceLogs[j + 1];
            
            if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
              try {
                const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
                const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
                if (!currentParts || !nextParts) continue;
                
                const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
                const currentTime = convertISTToUTC(currentTimeIST);
                
                const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
                const nextTime = convertISTToUTC(nextTimeIST);
                
                const sessionStart = Math.max(currentTime, dayStart);
                const sessionEnd = Math.min(nextTime, dayEnd);
                
                if (sessionStart < sessionEnd) {
                  dayHours += (sessionEnd - sessionStart) / (1000 * 60 * 60);
                }
              } catch (err) {
                console.error(`❌ Error parsing chart timestamps:`, err);
              }
            }
          }
          data.push(Math.round(dayHours * 100) / 100);
        }
        break;
        
      case 'yearly':
        // ✅ Last 12 months by month
        labels = [];
        data = [];
        for (let i = 11; i >= 0; i--) {
          const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
          labels.push(month.toLocaleDateString('en-US', { month: 'short' }));
          
          // ✅ Calculate operating hours for this month
          const monthStart = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0);
          const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
          
          let monthHours = 0;
          for (let j = 0; j < deviceLogs.length - 1; j++) {
            const currentLog = deviceLogs[j];
            const nextLog = deviceLogs[j + 1];
            
            if (currentLog.DigitalInput1 === "1" && nextLog.DigitalInput1 === "0") {
              try {
                const currentParts = safeExtractTimestampParts(currentLog.Timestamp);
                const nextParts = safeExtractTimestampParts(nextLog.Timestamp);
                if (!currentParts || !nextParts) continue;
                
                const currentTimeIST = new Date(currentParts.year, currentParts.month - 1, currentParts.day, currentParts.hours, currentParts.minutes, currentParts.seconds);
                const currentTime = convertISTToUTC(currentTimeIST);
                
                const nextTimeIST = new Date(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hours, nextParts.minutes, nextParts.seconds);
                const nextTime = convertISTToUTC(nextTimeIST);
                
                const sessionStart = Math.max(currentTime, monthStart);
                const sessionEnd = Math.min(nextTime, monthEnd);
                
                if (sessionStart < sessionEnd) {
                  monthHours += (sessionEnd - sessionStart) / (1000 * 60 * 60);
                }
              } catch (err) {
                console.error(`❌ Error parsing chart timestamps:`, err);
              }
            }
          }
          data.push(Math.round(monthHours * 100) / 100);
        }
        break;
        
      default:
        labels = [];
        data = [];
    }
    
    console.log(`✅ Chart data for crane ${deviceId} (${period}):`, { labels: labels.length, data: data.length });
    
    res.json({ labels, data });
    
  } catch (err) {
    console.error("❌ Crane chart fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Simulator availability (UI + route guard — always registered)
app.get('/api/sim/availability', authenticateToken, (req, res) => {
  const { enabled, reason } = resolveSimulatorEnabled();
  const isSuperadmin = req.user?.role === 'superadmin';
  res.json({
    enabled: isSuperadmin ? enabled : false,
    reason: isSuperadmin ? reason : undefined,
  });
});

// ✅ SIMULATOR ENDPOINTS (superadmin only, when enabled)
if (ENABLE_SIMULATOR) {
  // ✅ POST: Add simulated device (crane or elevator)
  app.post('/api/sim/add', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const { deviceType, craneCompany, elevatorCompany, DeviceID, latitude, longitude, location, state, frequencyMinutes, padTimestamp, profile, jitter,
        intervalSeconds, energyBaseReading, energySimMode, roomType, appliances, singleApplianceType,
        singleApplianceRatedKwOverride, singleStateDistribution, occupancyPercent, minVoltage, maxVoltage,
        scheduleTimezone } = req.body;
      const effectiveType = deviceType === 'elevator' ? 'elevator' : deviceType === 'energyMeter' ? 'energyMeter' : 'crane';
      const companyName = effectiveType === 'elevator'
        ? (elevatorCompany || craneCompany)
        : craneCompany;
      
      if (effectiveType === 'energyMeter') {
        if (!DeviceID || !state) {
          return res.status(400).json({ error: 'Missing required fields (DeviceID, state)' });
        }
      } else if (!companyName || !DeviceID || !state) {
        return res.status(400).json({ error: 'Missing required fields (company, DeviceID, state)' });
      }
      if (!['working', 'idle', 'maintenance'].includes(state)) {
        return res.status(400).json({ error: 'Invalid state. Must be working, idle, or maintenance' });
      }
      
      const validFrequencies = [1, 2, 5, 10, 15, 30];
      const frequencyNum = parseInt(frequencyMinutes, 10);
      if (effectiveType !== 'energyMeter' && !validFrequencies.includes(frequencyNum)) {
        return res.status(400).json({ error: 'Invalid frequency. Must be 1, 2, 5, 10, 15, or 30 minutes' });
      }
      
      if (effectiveType === 'elevator') {
        if (!location || String(location).trim() === '') {
          return res.status(400).json({ error: 'Elevator requires location' });
        }
        const device = new SimulatorDevice({
          deviceId: DeviceID,
          name: companyName.trim(),
          latitude: 0,
          longitude: 0,
          deviceType: 'elevator',
          location: String(location).trim(),
          state,
          frequencyMinutes: frequencyNum,
          padTimestamp: false,
          jitter: false,
          profile: 'A',
          isRunning: false,
          elevatorCurrentFloor: 0
        });
        await device.save();
        console.log(`[sim] ✅ Added elevator simulator: ${DeviceID} (${state}) at ${location}`);
        return res.json({ success: true, device: device.toObject() });
      }

      if (effectiveType === 'energyMeter') {
        const registeredDevice = await Device.findOne({ deviceId: DeviceID, deviceType: 'energyMeter' });
        if (!registeredDevice) {
          return res.status(400).json({
            error: `Device "${DeviceID}" is not registered. Add it first in Manage Devices with deviceType "energyMeter".`,
          });
        }
        const simErrors = validateEnergySimBody(req.body);
        if (simErrors.length) {
          return res.status(400).json({ error: simErrors.join('; ') });
        }
        const intervalNum = parseInt(intervalSeconds, 10) || 60;
        if (!VALID_INTERVALS_SECONDS.includes(intervalNum)) {
          return res.status(400).json({ error: 'Invalid interval. Must be 30, 60, 120, 180, or 300 seconds' });
        }
        const mode = energySimMode || 'single';
        const simFields = pickEnergySimFields(req.body);
        const device = new SimulatorDevice({
          deviceId: DeviceID,
          name: registeredDevice.companyName || 'simulator',
          latitude: 0,
          longitude: 0,
          deviceType: 'energyMeter',
          location: '',
          state,
          frequencyMinutes: 1,
          padTimestamp: false,
          jitter: jitter === true,
          profile: 'A',
          isRunning: false,
          machineProfile: 'warehouse',
          siteName: '',
          plantName: '',
          machineName: '',
          energyBaseReading: energyBaseReading != null ? Number(energyBaseReading) : 0,
          intervalSeconds: intervalNum,
          energySimMode: mode,
          roomType: roomType || 'office',
          scheduleTimezone: scheduleTimezone || 'Asia/Kolkata',
          appliances: mode === 'room'
            ? (simFields.appliances || getRoomPresets(roomType || 'office'))
            : [],
          singleApplianceType: singleApplianceType || 'ac_split',
          singleApplianceRatedKwOverride: simFields.singleApplianceRatedKwOverride ?? null,
          singleStateDistribution: simFields.singleStateDistribution,
          occupancyPercent: occupancyPercent != null ? Number(occupancyPercent) : 100,
          minVoltage: minVoltage != null ? Number(minVoltage) : 220,
          maxVoltage: maxVoltage != null ? Number(maxVoltage) : 240,
        });
        await device.save();
        console.log(`[sim] ✅ Added energy meter simulator: ${DeviceID} (${device.energySimMode})`);
        return res.json({ success: true, device: device.toObject() });
      }
      
      // Crane
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'Crane requires latitude and longitude' });
      }
      if (profile && !['A', 'B'].includes(profile)) {
        return res.status(400).json({ error: 'Invalid profile. Must be A or B' });
      }
      const device = new SimulatorDevice({
        deviceId: DeviceID,
        name: companyName.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        deviceType: 'crane',
        location: '',
        state,
        frequencyMinutes: frequencyNum,
        padTimestamp: padTimestamp !== false,
        profile: profile || 'A',
        jitter: jitter === true,
        isRunning: false
      });
      await device.save();
      console.log(`[sim] ✅ Added crane simulator: ${DeviceID} (${state}) at [${latitude}, ${longitude}]`);
      res.json({ success: true, device: device.toObject() });
    } catch (err) {
      console.error('[sim] ❌ Add device error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ✅ POST: Start simulator for a device
  app.post('/api/sim/start', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const { DeviceID } = req.body;
      if (!DeviceID) {
        return res.status(400).json({ error: 'DeviceID is required' });
      }
      
      await startSimulator(DeviceID);
      res.json({ success: true, message: `Simulator started for ${DeviceID}` });
    } catch (err) {
      console.error('[sim] ❌ Start simulator error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  // ✅ POST: Stop simulator for a device
  app.post('/api/sim/stop', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const { DeviceID } = req.body;
      if (!DeviceID) {
        return res.status(400).json({ error: 'DeviceID is required' });
      }
      
      await stopSimulator(DeviceID, 'manual');
      res.json({ success: true, message: `Simulator stopped for ${DeviceID}` });
    } catch (err) {
      console.error('[sim] ❌ Stop simulator error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  // ✅ POST: Update device configuration (crane or elevator)
  app.post('/api/sim/update', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const { craneCompany, elevatorCompany, DeviceID, latitude, longitude, location, state, frequencyMinutes, padTimestamp, profile, jitter,
        intervalSeconds, energyBaseReading, energySimMode, roomType, appliances, singleApplianceType,
        singleApplianceRatedKwOverride, singleStateDistribution, occupancyPercent, minVoltage, maxVoltage,
        scheduleTimezone } = req.body;
      if (!DeviceID) {
        return res.status(400).json({ error: 'DeviceID is required' });
      }
      
      const device = await SimulatorDevice.findOne({ deviceId: DeviceID });
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      const effectiveType = device.deviceType || 'crane';
      const companyName = elevatorCompany !== undefined ? elevatorCompany : craneCompany;
      if (companyName !== undefined && effectiveType !== 'energyMeter') device.name = companyName;
      if (state && ['working', 'idle', 'maintenance'].includes(state)) device.state = state;
      if (frequencyMinutes !== undefined && effectiveType !== 'energyMeter') {
        const freq = parseInt(frequencyMinutes, 10);
        if ([1, 2, 5, 10, 15, 30].includes(freq)) device.frequencyMinutes = freq;
      }
      if (effectiveType === 'elevator') {
        if (location !== undefined) device.location = String(location).trim();
      } else if (effectiveType === 'energyMeter') {
        const simErrors = validateEnergySimBody(req.body, { isUpdate: true });
        if (simErrors.length) {
          return res.status(400).json({ error: simErrors.join('; ') });
        }
        const simFields = pickEnergySimFields(req.body);
        Object.assign(device, simFields);
        if (intervalSeconds !== undefined) {
          const sec = parseInt(intervalSeconds, 10);
          if (VALID_INTERVALS_SECONDS.includes(sec)) device.intervalSeconds = sec;
        }
        if (energyBaseReading !== undefined) device.energyBaseReading = Number(energyBaseReading);
        if (jitter !== undefined) device.jitter = jitter === true;
        if (state && ['working', 'idle', 'maintenance'].includes(state)) device.state = state;
      } else {
        if (latitude !== undefined) device.latitude = parseFloat(latitude);
        if (longitude !== undefined) device.longitude = parseFloat(longitude);
        if (padTimestamp !== undefined) device.padTimestamp = padTimestamp;
        if (profile && ['A', 'B'].includes(profile)) device.profile = profile;
        if (jitter !== undefined) device.jitter = jitter;
      }
      
      const wasRunning = simulatorTimers.has(DeviceID) || device.isRunning;
      await device.save();

      if (wasRunning) {
        try {
          await restartSimulatorTimer(DeviceID);
        } catch (restartErr) {
          console.error(`[sim] ❌ Failed to restart timer after update for ${DeviceID}:`, restartErr.message);
          await SimulatorDevice.updateOne({ deviceId: DeviceID }, { isRunning: true });
        }
      }
      
      console.log(`[sim] ✅ Updated device ${DeviceID}:`, device.toObject());
      res.json({ success: true, device: device.toObject() });
    } catch (err) {
      console.error('[sim] ❌ Update device error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ✅ GET: List all simulated devices
  app.get('/api/sim/list', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const devices = await SimulatorDevice.find({}).lean();
      
      // ✅ Add isRunning, overrides, and backward-compat fields; deviceType/location for elevator
      const devicesWithStatus = devices.map(device => {
        const tickStatus = simulatorTickStatus.get(device.deviceId);
        const timerActive = simulatorTimers.has(device.deviceId);
        return {
        ...device,
        DeviceID: device.deviceId,
        craneCompany: device.name,
        deviceType: device.deviceType || 'crane',
        location: device.location || '',
        elevatorCurrentFloor: device.elevatorCurrentFloor,
        overrideReg65: device.overrideReg65 ?? null,
        overrideReg66: device.overrideReg66 ?? null,
        overrideErrorCode: device.overrideErrorCode ?? null,
        machineProfile: device.machineProfile || 'warehouse',
        siteName: device.siteName || '',
        plantName: device.plantName || '',
        machineName: device.machineName || '',
        energyBaseReading: device.energyBaseReading ?? null,
        intervalSeconds: device.intervalSeconds || 60,
        energySimMode: device.energySimMode || 'single',
        roomType: device.roomType || 'office',
        appliances: device.appliances || [],
        singleApplianceType: device.singleApplianceType || 'ac_split',
        occupancyPercent: device.occupancyPercent ?? 100,
        energyReadingOverride: device.energyReadingOverride || null,
        overrideRemainingMs: device.energyReadingOverride?.enabled
          ? getOverrideRemainingMs(device.energyReadingOverride)
          : null,
        configSummary: device.deviceType === 'energyMeter' ? buildConfigSummary(device) : undefined,
        isRunning: device.isRunning === true,
        timerActive,
        lastTickAt: tickStatus?.lastTickAt || null,
        lastTickStatus: tickStatus?.lastStatus || null,
        lastTickError: tickStatus?.lastError || null,
      };
      });
      
      res.json({ devices: devicesWithStatus });
    } catch (err) {
      console.error('[sim] ❌ List devices error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ POST: Set live override for elevator (Reg65, Reg66, errorCode) – for demo
  app.post('/api/sim/elevator-override', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      const { DeviceID, overrideReg65, overrideReg66, overrideErrorCode } = req.body;
      if (!DeviceID) {
        return res.status(400).json({ error: 'DeviceID is required' });
      }
      const device = await SimulatorDevice.findOne({ deviceId: DeviceID });
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      if (device.deviceType !== 'elevator') {
        return res.status(400).json({ error: 'Only elevator devices support live override' });
      }
      if (overrideReg65 !== undefined) {
        device.overrideReg65 = overrideReg65 === null || overrideReg65 === '' ? null : Number(overrideReg65);
      }
      if (overrideReg66 !== undefined) {
        device.overrideReg66 = overrideReg66 === null || overrideReg66 === '' ? null : Number(overrideReg66);
      }
      if (overrideErrorCode !== undefined) {
        const v = overrideErrorCode === null || overrideErrorCode === '' ? null : String(overrideErrorCode).trim();
        device.overrideErrorCode = v === '' ? null : v;
      }
      await device.save();
      console.log(`[sim] ✅ Elevator override ${DeviceID}: reg65=${device.overrideReg65}, reg66=${device.overrideReg66}, errorCode=${device.overrideErrorCode}`);
      res.json({ success: true, device: device.toObject() });
    } catch (err) {
      console.error('[sim] ❌ Elevator override error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ GET: Energy simulator catalog (appliances, room presets)
  app.get('/api/sim/energy-catalog', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      res.json(getCatalog());
    } catch (err) {
      console.error('[sim] ❌ Energy catalog error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ POST: Preview energy meter payload (no send)
  app.post('/api/sim/preview-payload', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const { DeviceID, deviceId, state, jitter, energyBaseReading, intervalSeconds } = req.body;
      let device;

      if (DeviceID) {
        device = await SimulatorDevice.findOne({ deviceId: DeviceID }).lean();
        if (!device) return res.status(404).json({ error: 'Device not found' });
        Object.assign(device, pickEnergySimFields(req.body));
        if (state) device.state = state;
        if (jitter !== undefined) device.jitter = jitter === true;
        if (energyBaseReading != null) device.energyBaseReading = Number(energyBaseReading);
        if (intervalSeconds != null) device.intervalSeconds = parseInt(intervalSeconds, 10) || device.intervalSeconds;
      } else {
        device = {
          deviceId: deviceId || DeviceID || 'Energy Meter_1',
          state: state || 'working',
          jitter: jitter === true,
          energyBaseReading: energyBaseReading != null ? Number(energyBaseReading) : 0,
          intervalSeconds: intervalSeconds != null ? parseInt(intervalSeconds, 10) : 60,
          energySimMode: 'single',
          roomType: 'office',
          singleApplianceType: 'ac_split',
          occupancyPercent: 100,
          minVoltage: 220,
          maxVoltage: 240,
          ...pickEnergySimFields(req.body),
        };
      }

      const { payload, readings, rawValues, dateStr, breakdown } = buildEnergyMeterPayload(device, { advanceReading: false });
      res.json({ payload, readings, rawValues, dateStr, breakdown });
    } catch (err) {
      console.error('[sim] ❌ Preview payload error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ GET: Alarm test plan for a meter (enabled rules + breach previews)
  app.get('/api/sim/energy-alarm-test-plan/:meterId', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      const { meterId } = req.params;
      const { device, rules } = await loadEnabledRulesForMeter(meterId);
      const plan = buildAlarmTestPlan(rules);
      const simDevice = await SimulatorDevice.findOne({ deviceId: meterId }).lean();
      res.json({
        meterId,
        companyName: device.companyName,
        ...plan,
        activeOverride: simDevice?.energyReadingOverride?.enabled
          ? {
              ...simDevice.energyReadingOverride,
              remainingMs: getOverrideRemainingMs(simDevice.energyReadingOverride),
            }
          : null,
      });
    } catch (err) {
      console.error('[sim] ❌ Alarm test plan error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ✅ POST: Recompute expected outcomes for selection + breach mode
  app.post('/api/sim/energy-expected-outcomes', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      const { meterId, selection, breachMode = 'standard' } = req.body;
      if (!meterId) return res.status(400).json({ error: 'meterId is required' });
      const { rules } = await loadEnabledRulesForMeter(meterId);
      const bounds = resolveRuleSelections(rules, selection || {});
      const outcomes = buildExpectedOutcomes(bounds, breachMode);
      const { readings, conflicts } = computeBreachReadingsForBounds(bounds, breachMode);
      res.json({ outcomes, readings, conflicts, breachMode });
    } catch (err) {
      console.error('[sim] ❌ Expected outcomes error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ✅ POST: Unified trigger — selected rules, all rules, or severity filter
  app.post('/api/sim/energy-trigger-rules', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const {
        DeviceID,
        mode = 'send_once',
        breachMode = 'standard',
        durationMinutes,
        selection = {},
      } = req.body;

      if (!DeviceID) return res.status(400).json({ error: 'DeviceID is required' });
      if (!['send_once', 'live_override'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be send_once or live_override' });
      }
      if (!['standard', 'aggressive'].includes(breachMode)) {
        return res.status(400).json({ error: 'breachMode must be standard or aggressive' });
      }

      const simDevice = await SimulatorDevice.findOne({ deviceId: DeviceID });
      if (!simDevice) return res.status(404).json({ error: 'Simulator device not found' });
      if ((simDevice.deviceType || 'crane') !== 'energyMeter') {
        return res.status(400).json({ error: 'Only energy meter simulators support alarm testing' });
      }

      const { rules } = await loadEnabledRulesForMeter(DeviceID);
      const bounds = resolveRuleSelections(rules, selection);
      if (!bounds.length) {
        return res.status(400).json({ error: 'No matching enabled alarm rules to trigger' });
      }

      const { readings, conflicts } = computeBreachReadingsForBounds(bounds, breachMode);
      const outcomes = buildExpectedOutcomes(bounds, breachMode);
      const sourceRuleIds = [...new Set(bounds.map(({ rule }) => rule._id))];
      const label = `${bounds.length} rule${bounds.length > 1 ? 's' : ''} — ${mode === 'live_override' ? 'Live Override' : 'Send Once'}`;

      if (mode === 'live_override') {
        simDevice.energyReadingOverride = {
          enabled: true,
          readings: {
            voltage: readings.voltage ?? null,
            current: readings.current ?? null,
            activePower: readings.activePower ?? null,
            energy: readings.energy ?? null,
            powerFactor: readings.powerFactor ?? null,
            frequency: readings.frequency ?? null,
          },
          durationMinutes: durationMinutes != null && durationMinutes !== '' ? Number(durationMinutes) : null,
          startedAt: new Date(),
          breachMode,
          sourceRuleIds,
          label,
        };
        await simDevice.save();

        const result = await postEnergyMeterSimPayload(simDevice.toObject());
        return res.json({
          success: true,
          mode,
          breachMode,
          readings,
          outcomes,
          conflicts,
          override: simDevice.energyReadingOverride,
          remainingMs: getOverrideRemainingMs(simDevice.energyReadingOverride),
          ingest: result,
        });
      }

      const { payload, energyKwh } = buildPayloadFromReadings(simDevice.toObject(), readings, {
        advanceReading: true,
      });
      await ingestEnergyMeterPayload(payload, 'simulator');
      await SimulatorDevice.updateOne({ deviceId: DeviceID }, { energyBaseReading: energyKwh });

      res.json({
        success: true,
        mode,
        breachMode,
        readings,
        outcomes,
        conflicts,
        payload,
      });
    } catch (err) {
      console.error('[sim] ❌ Trigger rules error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ✅ POST: Advanced mode — manual readings send once
  app.post('/api/sim/energy-send-readings', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const { DeviceID, readings } = req.body;
      if (!DeviceID) return res.status(400).json({ error: 'DeviceID is required' });
      if (!readings || typeof readings !== 'object') {
        return res.status(400).json({ error: 'readings object is required' });
      }

      const simDevice = await SimulatorDevice.findOne({ deviceId: DeviceID }).lean();
      if (!simDevice) return res.status(404).json({ error: 'Simulator device not found' });
      if ((simDevice.deviceType || 'crane') !== 'energyMeter') {
        return res.status(400).json({ error: 'Only energy meter simulators support manual readings' });
      }

      const { payload, energyKwh, readings: merged } = buildPayloadFromReadings(simDevice, readings, {
        advanceReading: true,
      });
      await ingestEnergyMeterPayload(payload, 'simulator');
      await SimulatorDevice.updateOne({ deviceId: DeviceID }, { energyBaseReading: energyKwh });

      res.json({ success: true, payload, readings: merged, energyKwh });
    } catch (err) {
      console.error('[sim] ❌ Send readings error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ✅ POST: Restore normal readings for one meter
  app.post('/api/sim/energy-reading-override/restore', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      const { DeviceID } = req.body;
      if (!DeviceID) return res.status(400).json({ error: 'DeviceID is required' });

      const device = await SimulatorDevice.findOne({ deviceId: DeviceID });
      if (!device) return res.status(404).json({ error: 'Device not found' });

      device.energyReadingOverride = {
        enabled: false,
        readings: {
          voltage: null, current: null, activePower: null,
          energy: null, powerFactor: null, frequency: null,
        },
        durationMinutes: null,
        startedAt: null,
        breachMode: 'standard',
        sourceRuleIds: [],
        label: '',
      };
      await device.save();
      res.json({ success: true, message: `Override cleared for ${DeviceID}` });
    } catch (err) {
      console.error('[sim] ❌ Restore override error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ POST: Restore all energy reading overrides
  app.post('/api/sim/energy-reading-override/restore-all', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const result = await SimulatorDevice.updateMany(
        { deviceType: 'energyMeter', 'energyReadingOverride.enabled': true },
        {
          $set: {
            'energyReadingOverride.enabled': false,
            'energyReadingOverride.readings': {
              voltage: null, current: null, activePower: null,
              energy: null, powerFactor: null, frequency: null,
            },
            'energyReadingOverride.durationMinutes': null,
            'energyReadingOverride.startedAt': null,
            'energyReadingOverride.breachMode': 'standard',
            'energyReadingOverride.sourceRuleIds': [],
            'energyReadingOverride.label': '',
          },
        }
      );

      res.json({ success: true, restoredCount: result.modifiedCount });
    } catch (err) {
      console.error('[sim] ❌ Restore all overrides error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ GET: Fleet active energy reading overrides
  app.get('/api/sim/energy-active-overrides', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const devices = await SimulatorDevice.find({
        deviceType: 'energyMeter',
        'energyReadingOverride.enabled': true,
      }).lean();

      const overrides = devices
        .filter((d) => !isOverrideExpired(d.energyReadingOverride))
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.energyReadingOverride.label || '',
          readings: d.energyReadingOverride.readings,
          readingsSummary: formatReadingsSummary(d.energyReadingOverride.readings),
          breachMode: d.energyReadingOverride.breachMode || 'standard',
          startedAt: d.energyReadingOverride.startedAt,
          durationMinutes: d.energyReadingOverride.durationMinutes,
          remainingMs: getOverrideRemainingMs(d.energyReadingOverride),
          sourceRuleIds: d.energyReadingOverride.sourceRuleIds || [],
        }));

      res.json({ overrides });
    } catch (err) {
      console.error('[sim] ❌ Active overrides error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ✅ POST: Consumption burst for energyConsumption alarm rules
  app.post('/api/sim/energy-consumption-burst', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const { DeviceID, ruleId, breachMode = 'standard' } = req.body;
      if (!DeviceID || !ruleId) {
        return res.status(400).json({ error: 'DeviceID and ruleId are required' });
      }

      const simDevice = await SimulatorDevice.findOne({ deviceId: DeviceID });
      if (!simDevice) return res.status(404).json({ error: 'Simulator device not found' });

      const { rules } = await loadEnabledRulesForMeter(DeviceID);
      const rule = rules.find((r) => String(r._id) === String(ruleId));
      if (!rule || rule.metric !== 'energyConsumption') {
        return res.status(404).json({ error: 'Consumption alarm rule not found' });
      }

      const plan = planConsumptionBurst(rule, simDevice.toObject(), { breachMode });
      const executed = [];

      for (const step of plan.steps) {
        const { payload, energyKwh } = buildPayloadFromReadings(simDevice.toObject(), {
          energy: step.energyKwh,
        }, { advanceReading: false });
        await ingestEnergyMeterPayload(payload, 'simulator');
        simDevice.energyBaseReading = energyKwh;
        await simDevice.save();
        executed.push({ step: step.step, energyKwh, payload });
        await new Promise((r) => setTimeout(r, 300));
      }

      res.json({ success: true, plan, executed });
    } catch (err) {
      console.error('[sim] ❌ Consumption burst error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ✅ POST: Manual send one energy meter payload
  app.post('/api/sim/send', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }

      const { DeviceID } = req.body;
      if (!DeviceID) {
        return res.status(400).json({ error: 'DeviceID is required' });
      }

      const device = await SimulatorDevice.findOne({ deviceId: DeviceID }).lean();
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      if ((device.deviceType || 'crane') !== 'energyMeter') {
        return res.status(400).json({ error: 'Manual send is only supported for energy meter simulators' });
      }

      const result = await postEnergyMeterSimPayload(device);
      if (!result.success) {
        return res.status(result.error?.includes('not registered') ? 404 : 502).json({
          error: result.error || 'Failed to post to /api/energy-meter/log',
        });
      }
      res.json({ success: true, message: `Payload sent for ${DeviceID}`, payload: result.payload });
    } catch (err) {
      console.error('[sim] ❌ Manual send error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  // ✅ DELETE: Remove simulated device
  app.delete('/api/sim/remove/:deviceId', authenticateToken, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
      }
      
      const { deviceId } = req.params;
      
      // ✅ Stop simulator if running
      await stopSimulator(deviceId, 'device-removed');
      
      // ✅ Remove device from database
      const removed = await SimulatorDevice.deleteOne({ deviceId });
      if (removed.deletedCount > 0) {
        console.log(`[sim] ✅ Removed device ${deviceId}`);
        res.json({ success: true, message: `Device ${deviceId} removed` });
      } else {
        res.status(404).json({ error: 'Device not found' });
      }
    } catch (err) {
      console.error('[sim] ❌ Remove device error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// ✅ Energy Meter — ingestion + read APIs
async function getAllowedEnergyMeters(req) {
  const { role, companyName } = req.user;
  const filter = { deviceType: 'energyMeter' };
  if (role !== 'superadmin') {
    filter.companyName = companyName;
  }
  return Device.find(filter).lean();
}

async function getVisibleEnergyMeters(req) {
  const { role, companyName } = req.user;

  if (role !== 'superadmin') {
    const viewMode = await getCompanyEnergyViewMode(companyName);
    const simIds = await getSimulatorMeterIdsForCompany(companyName);
    const visibility = buildMeterVisibilityFilter(viewMode, simIds);
    return Device.find({
      deviceType: 'energyMeter',
      companyName,
      ...visibility,
    }).lean();
  }

  const allMeters = await Device.find({ deviceType: 'energyMeter' }).lean();
  const companies = [...new Set(allMeters.map((m) => m.companyName).filter(Boolean))];
  const visible = [];

  for (const cn of companies) {
    const viewMode = await getCompanyEnergyViewMode(cn);
    const simIds = await getSimulatorMeterIdsForCompany(cn);
    const visibility = buildMeterVisibilityFilter(viewMode, simIds);
    const companyMeters = allMeters.filter((m) => m.companyName === cn);

    if (!Object.keys(visibility).length) {
      visible.push(...companyMeters);
      continue;
    }

    if (visibility.deviceId?.$nin) {
      visible.push(...companyMeters.filter((m) => !visibility.deviceId.$nin.includes(m.deviceId)));
    } else if (visibility.deviceId?.$in) {
      visible.push(...companyMeters.filter((m) => visibility.deviceId.$in.includes(m.deviceId)));
    }
  }

  return visible;
}

async function buildEnergyLogDoc(rawPayload, meterId, value, receivedAt, dataSource) {
  assertValidDataSource(dataSource);

  const parsed = typeof value === 'string' ? parseSampleValueString(value) : { parseStatus: 'partial', D: null, rawValues: null, timestamp: null };
  const device = await resolveDeviceForMeter(meterId);
  const parameters = await getParameterMap(meterId);
  const timestamp = parsed.timestamp || receivedAt;
  const dateISO = timestamp;
  const readings = parsed.rawValues ? buildReadings(parsed.rawValues, parameters) : {};

  let parseStatus = parsed.parseStatus || 'partial';
  if (!meterId || meterId === 'unknown') {
    parseStatus = 'raw_only';
  }

  return {
    meterId: meterId || 'unknown',
    uid: device?.uid || null,
    companyName: device?.companyName || null,
    siteName: device?.siteName || '',
    plantName: device?.plantName || '',
    machineName: device?.machineName || '',
    location: device?.location || '',
    phaseType: device?.phaseType || 'single',
    dataSource,
    D: parsed.D || null,
    timestamp,
    dateISO,
    rawValues: parsed.rawValues || undefined,
    readings,
    rawPayload,
    parseStatus,
    receivedAt,
  };
}

async function ingestEnergyMeterPayload(rawPayload, dataSource) {
  assertValidDataSource(dataSource);

  await ensureDefaultParameterMap();

  const receivedAt = new Date();
  const entries = extractMeterEntries(rawPayload);

  if (!entries.length) {
    const err = new Error('Unrecognized payload format. Expected { "MeterId": "date,[values]" }');
    err.statusCode = 400;
    throw err;
  }

  const docsToSave = [];
  for (const { meterId, value } of entries) {
    const registered = await resolveDeviceForMeter(meterId);
    if (!registered) {
      const err = new Error(`Energy meter "${meterId}" is not registered. Add it in Manage Devices with deviceType "energyMeter".`);
      err.statusCode = 404;
      throw err;
    }
    docsToSave.push(await buildEnergyLogDoc(rawPayload, meterId, value, receivedAt, dataSource));
  }

  const saved = await EnergyMeterLog.insertMany(docsToSave, { ordered: false });
  evaluateEnergyMeterAlarms(saved).catch((err) => console.error('Energy alarm eval failed', err));
  return saved;
}

app.post('/api/energy-meter/log', async (req, res) => {
  try {
    if (req.body === undefined || req.body === null) {
      return res.status(400).json({ message: 'Empty payload' });
    }

    const saved = await ingestEnergyMeterPayload(req.body, 'device');
    const first = saved[0];

    res.status(201).json({
      message: 'Energy meter data saved',
      count: saved.length,
      meterId: first?.meterId,
      parseStatus: first?.parseStatus,
      timestamp: first?.timestamp,
    });
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message });
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Energy meter save error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/view-settings', authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const targetCompany = role === 'superadmin' ? (req.query.companyName || companyName) : companyName;
    if (!targetCompany) {
      return res.status(400).json({ message: 'companyName is required' });
    }

    const viewMode = await getCompanyEnergyViewMode(targetCompany);
    const simulatorMeterIds = await getSimulatorMeterIdsForCompany(targetCompany);

    res.json({
      viewMode,
      showSimulatorData: viewModeToShowSimulator(viewMode),
      simulatorMeterCount: simulatorMeterIds.length,
      companyName: targetCompany,
      canEdit: role === 'admin' || role === 'superadmin',
    });
  } catch (err) {
    console.error('Energy view-settings GET error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.put('/api/energy-meter/view-settings', authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    if (role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const targetCompany = role === 'superadmin' ? (req.body.companyName || companyName) : companyName;
    if (!targetCompany) {
      return res.status(400).json({ message: 'companyName is required' });
    }

    const { showSimulatorData, viewMode: rawViewMode } = req.body;
    let viewMode = rawViewMode;
    if (showSimulatorData !== undefined) {
      viewMode = showSimulatorToViewMode(showSimulatorData === true);
    }
    if (!['all', 'real_only', 'simulator_only'].includes(viewMode)) {
      return res.status(400).json({ message: 'Invalid viewMode' });
    }

    const access = await CompanyDashboardAccess.findOneAndUpdate(
      { companyName: targetCompany },
      {
        $set: {
          'energySettings.viewMode': viewMode,
          lastUpdated: new Date(),
          updatedBy: req.user.email || role,
        },
        $setOnInsert: {
          companyName: targetCompany,
        },
      },
      { upsert: true, new: true }
    );

    const simulatorMeterIds = await getSimulatorMeterIdsForCompany(targetCompany);

    res.json({
      viewMode: access.energySettings?.viewMode || viewMode,
      showSimulatorData: viewModeToShowSimulator(access.energySettings?.viewMode || viewMode),
      simulatorMeterCount: simulatorMeterIds.length,
      companyName: targetCompany,
    });
  } catch (err) {
    console.error('Energy view-settings PUT error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/overview', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const todayStart = getTodayStartIstUtc();

    const [meterCards, todayEnergy] = await Promise.all([
      Promise.all(
      meters.map(async (device) => {
        const logFilter = await buildLogFilterForCompany(device.companyName, {
          meterId: device.deviceId,
        });

        const latest = await EnergyMeterLog.findOne(logFilter)
          .sort({ timestamp: -1 })
          .lean();
        const previous = latest
          ? await EnergyMeterLog.findOne(
              await buildLogFilterForCompany(device.companyName, {
                meterId: device.deviceId,
                timestamp: { $lt: latest.timestamp },
              })
            )
              .sort({ timestamp: -1 })
              .lean()
          : null;

        const online = isMeterOnline(latest?.timestamp);
        const displayReading = pickDisplayReading(latest?.readings);
        const currentPowerKw = pickActivePowerKw(latest?.readings);
        const latestCurrent = pickReadingValue(latest?.readings, 'current');
        const latestPowerFactor = pickReadingValue(latest?.readings, 'powerFactor');
        const latestVoltage = pickReadingValue(latest?.readings, 'voltage');
        const latestFrequency = pickReadingValue(latest?.readings, 'frequency');

        let sparkline = [];
        let powerSparkline = [];
        let energySparkline = [];
        if (device.deviceId) {
          const recent = await EnergyMeterLog.find(logFilter)
            .sort({ timestamp: -1 })
            .limit(12)
            .lean();
          const ordered = recent.reverse();
          sparkline = ordered.map((row) => pickChartMetric(row));
          powerSparkline = buildSparklineSeries(ordered, pickSparklinePower);
          energySparkline = buildConsumptionSparkline(ordered);
        }

        let trendDelta = null;
        if (latest && previous) {
          trendDelta = Math.round((pickChartMetric(latest) - pickChartMetric(previous)) * 100) / 100;
        }

        return {
          meterId: device.deviceId,
          uid: device.uid,
          siteName: device.siteName || '',
          plantName: device.plantName || '',
          machineName: device.machineName || '',
          location: device.location || '',
          phaseType: device.phaseType || 'single',
          online,
          lastTimestamp: latest?.timestamp || null,
          lastCommunication: formatRelativeTime(latest?.timestamp),
          latestReading: displayReading
            ? {
                key: displayReading.key,
                value: displayReading.value,
                label: displayReading.label,
                unit: displayReading.unit,
              }
            : null,
          currentPowerKw,
          latestCurrent,
          latestPowerFactor,
          latestVoltage,
          latestFrequency,
          sparkline,
          powerSparkline,
          energySparkline,
          trendDelta,
        };
      })
      ),
      computeTodayEnergyConsumptionByMeter(meters, todayStart),
    ]);

    const meterCardsWithToday = meterCards.map((card) => ({
      ...card,
      todayConsumptionKwh: Object.prototype.hasOwnProperty.call(todayEnergy.byMeter, card.meterId)
        ? todayEnergy.byMeter[card.meterId]
        : null,
    }));

    const onlineCount = meterCardsWithToday.filter((m) => m.online).length;
    const totalMeters = meters.length;
    const powerValues = meterCardsWithToday
      .filter((m) => m.online === true)
      .map((m) => m.currentPowerKw)
      .filter((v) => v != null);
    const currentPowerConsumption = powerValues.length > 0
      ? powerValues.reduce((a, b) => a + b, 0)
      : null;

    const readingAverages = computeFleetReadingAverages(meterCardsWithToday);

    res.json({
      kpis: {
        totalMeters,
        onlineMeters: onlineCount,
        offlineMeters: totalMeters - onlineCount,
        currentPowerConsumption,
        currentPowerUnit: 'kW',
        todayEnergyConsumption: todayEnergy.fleetTotal,
        todayEnergyUnit: 'kWh',
        ...readingAverages,
      },
      meters: meterCardsWithToday,
    });
  } catch (err) {
    console.error('Energy overview error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

async function buildFleetChartSeries(meters, rangeKey = '24h') {
  const meterIds = meters.map((m) => m.deviceId);
  const { key, ms } = parseChartRange(rangeKey);
  const requestedUntil = new Date();
  const requestedSince = new Date(requestedUntil.getTime() - ms);

  const empty = {
    range: key,
    requestedSince,
    requestedUntil,
    dataStart: null,
    dataEnd: null,
    chartSeries: [],
  };

  if (!meterIds.length) return empty;

  const logFilter = await buildLogFilterForMeters(meters, {
    meterId: { $in: meterIds },
    timestamp: { $gte: requestedSince },
  });

  const logs = await EnergyMeterLog.find(logFilter)
    .sort({ timestamp: 1 })
    .lean();

  const byMeter = {};
  let dataStart = null;
  let dataEnd = null;

  logs.forEach((log) => {
    const ts = log.timestamp;
    if (!dataStart || new Date(ts) < new Date(dataStart)) dataStart = ts;
    if (!dataEnd || new Date(ts) > new Date(dataEnd)) dataEnd = ts;

    if (!byMeter[log.meterId]) byMeter[log.meterId] = [];
    byMeter[log.meterId].push({
      timestamp: log.timestamp,
      value: pickChartMetric(log),
    });
  });

  return {
    range: key,
    requestedSince,
    requestedUntil,
    dataStart,
    dataEnd,
    chartSeries: Object.entries(byMeter).map(([meterId, points]) => ({ meterId, points })),
  };
}

app.get('/api/energy-meter/fleet-chart', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const rangeKey = req.query.range || '24h';
    const chart = await buildFleetChartSeries(meters, rangeKey);
    res.json(chart);
  } catch (err) {
    console.error('Energy fleet chart error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/electrical-health', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const rangeKey = req.query.range || '1h';
    const summary = await buildElectricalHealthSummary(meters, rangeKey);
    res.json(summary);
  } catch (err) {
    console.error('Electrical health summary error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/metric-history', authenticateToken, async (req, res) => {
  try {
    const { metric, range, meterId } = req.query;
    if (!metric) return res.status(400).json({ message: 'metric is required' });
    if (!ALLOWED_METRIC_KEYS.includes(metric)) {
      return res.status(400).json({ message: 'Invalid metric' });
    }

    const meters = await getVisibleEnergyMeters(req);
    let scopedMeters = meters;

    if (meterId) {
      const allowed = meters.find((m) => m.deviceId === meterId);
      if (!allowed) return res.status(403).json({ message: 'Access denied' });
      scopedMeters = [allowed];
    }

    const history = await buildFleetMetricHistory(scopedMeters, metric, range || '24h');
    res.json(history);
  } catch (err) {
    console.error('Metric history error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/consumption-insights', authenticateToken, async (req, res) => {
  try {
    const { meterId, period } = req.query;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const insights = await buildMeterConsumptionInsights(allowed, period || '7d');
    res.json(insights);
  } catch (err) {
    console.error('Consumption insights error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/meter-metric-insights', authenticateToken, async (req, res) => {
  try {
    const { meterId, metric, range } = req.query;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });
    if (!metric) return res.status(400).json({ message: 'metric is required' });
    if (!ALLOWED_METRIC_KEYS.includes(metric)) {
      return res.status(400).json({ message: 'Invalid metric' });
    }

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const insights = await buildMeterMetricInsights(allowed, metric, range || '24h');
    res.json(insights);
  } catch (err) {
    console.error('Meter metric insights error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/fleet-consumption-insights', authenticateToken, async (req, res) => {
  try {
    const { period } = req.query;
    const meters = await getVisibleEnergyMeters(req);
    const insights = await buildFleetConsumptionInsights(meters, period || '7d');
    res.json(insights);
  } catch (err) {
    console.error('Fleet consumption insights error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/fleet-table', authenticateToken, async (req, res) => {
  try {
    const { range } = req.query;
    const meters = await getVisibleEnergyMeters(req);
    const table = await buildFleetMetersTable(meters, range || '24h');
    res.json(table);
  } catch (err) {
    console.error('Fleet meters table error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/fleet-metric-insights', authenticateToken, async (req, res) => {
  try {
    const { metric, range } = req.query;
    if (!metric) return res.status(400).json({ message: 'metric is required' });
    if (!ALLOWED_METRIC_KEYS.includes(metric)) {
      return res.status(400).json({ message: 'Invalid metric' });
    }

    const meters = await getVisibleEnergyMeters(req);
    const insights = await buildFleetMetricInsights(meters, metric, range || '24h');
    res.json(insights);
  } catch (err) {
    console.error('Fleet metric insights error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// --- Energy meter alarms ---
app.get('/api/energy-meter/alarms/metrics', authenticateToken, async (req, res) => {
  try {
    res.json(getMetricsMetadata());
  } catch (err) {
    console.error('Alarm metrics error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/alarms/rules', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const { meterId, metric, enabled, severity } = req.query;
    const rules = await listRules(meters, { meterId, metric, enabled, severity });
    res.json({ data: rules.map(serializeRule) });
  } catch (err) {
    console.error('Alarm rules list error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/api/energy-meter/alarms/rules', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.body;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const rule = await createRule(meterId, allowed.companyName, req.body, req.user?.id || '');
    res.status(201).json({ data: serializeRule(rule) });
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message });
    if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
    console.error('Alarm rule create error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.put('/api/energy-meter/alarms/rules/:id', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const rule = await updateRule(req.params.id, meters, req.body);
    res.json({ data: serializeRule(rule) });
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message });
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Alarm rule update error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.delete('/api/energy-meter/alarms/rules/:id', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    await deleteRule(req.params.id, meters);
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Alarm rule delete error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/rules/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const enabled = req.body?.enabled !== false;
    const rule = await toggleRule(req.params.id, meters, enabled);
    res.json({ data: serializeRule(rule) });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Alarm rule toggle error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/alarms/events', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const { meterId, status, metric, severity, from, to, page, limit } = req.query;
    const result = await listEvents(
      meters,
      { meterId, status, metric, severity, from, to },
      Number(page) || 1,
      Number(limit) || 20
    );
    res.json(result);
  } catch (err) {
    console.error('Alarm events list error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/alarms/events/active', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const { meterId } = req.query;
    const data = await listActiveEvents(meters, meterId || null);
    res.json({ data });
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ message: err.message });
    console.error('Active alarms error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/alarms/summary', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const summary = await buildAlarmSummary(meters);
    res.json(summary);
  } catch (err) {
    console.error('Alarm summary error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/events/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const comment = req.body?.comment || '';
    const event = await acknowledgeSingleEvent(req.params.id, meters, req.user?.id || '', comment);
    res.json({ data: event });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Alarm acknowledge error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/events/acknowledge', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const { eventIds, comment } = req.body || {};
    if (!eventIds?.length) return res.status(400).json({ message: 'eventIds is required' });

    const companyName = meters[0]?.companyName;
    if (!companyName) return res.status(403).json({ message: 'Access denied' });

    const result = await acknowledgeEvents(
      { companyName, eventIds },
      req.user?.id || '',
      comment || ''
    );
    res.json(result);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message });
    console.error('Bulk alarm acknowledge error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/events/acknowledge/meter/:meterId', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const meterIds = meters.map((m) => m.deviceId);
    if (!meterIds.includes(req.params.meterId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const companyName = meters.find((m) => m.deviceId === req.params.meterId)?.companyName;
    const result = await acknowledgeEvents(
      { companyName, meterId: req.params.meterId },
      req.user?.id || '',
      req.body?.comment || ''
    );
    res.json(result);
  } catch (err) {
    console.error('Meter alarm acknowledge error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/events/acknowledge/all', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const companyName = meters[0]?.companyName;
    if (!companyName) return res.status(403).json({ message: 'Access denied' });
    const result = await acknowledgeEvents(
      { companyName, allForCompany: true },
      req.user?.id || '',
      req.body?.comment || ''
    );
    res.json(result);
  } catch (err) {
    console.error('Fleet alarm acknowledge error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/api/energy-meter/alarms/events/:id/clear', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    const event = await clearEvent(req.params.id, meters);
    res.json({ data: event });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ message: err.message });
    console.error('Alarm clear error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

async function buildMeterChartData(device, rangeKey = '24h') {
  const meterId = device.deviceId;
  const { key, ms } = parseChartRange(rangeKey);
  const requestedUntil = new Date();
  const requestedSince = new Date(requestedUntil.getTime() - ms);
  const parameters = await getParameterMap(meterId);

  const empty = {
    range: key,
    requestedSince,
    requestedUntil,
    dataStart: null,
    dataEnd: null,
    parameters,
    points: [],
  };

  const logFilter = await buildLogFilterForCompany(device.companyName, {
    meterId,
    timestamp: { $gte: requestedSince },
  });

  const logs = await EnergyMeterLog.find(logFilter)
    .sort({ timestamp: 1 })
    .lean();

  if (!logs.length) return empty;

  let dataStart = null;
  let dataEnd = null;

  const points = logs.map((log) => {
    const ts = log.timestamp;
    if (!dataStart || new Date(ts) < new Date(dataStart)) dataStart = ts;
    if (!dataEnd || new Date(ts) > new Date(dataEnd)) dataEnd = ts;

    const readings =
      log.readings && Object.keys(log.readings).length
        ? log.readings
        : buildReadings(log.rawValues, parameters);

    return { timestamp: ts, readings };
  });

  return {
    range: key,
    requestedSince,
    requestedUntil,
    dataStart,
    dataEnd,
    parameters,
    points,
  };
}

app.get('/api/energy-meter/meter-chart', authenticateToken, async (req, res) => {
  try {
    const { meterId, range } = req.query;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const chart = await buildMeterChartData(allowed, range || '24h');
    res.json(chart);
  } catch (err) {
    console.error('Energy meter chart error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/latest', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.query;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const logFilter = await buildLogFilterForCompany(allowed.companyName, { meterId });
    const [latest, parameters, parameterStats24h] = await Promise.all([
      EnergyMeterLog.findOne(logFilter).sort({ timestamp: -1 }).lean(),
      getParameterMap(meterId),
      buildMeterParameterStats24h(allowed),
    ]);
    if (!latest) return res.status(404).json({ message: 'No data found' });

    res.json({
      ...latest,
      device: allowed,
      online: isMeterOnline(latest.timestamp),
      parameters,
      parameterStats24h,
    });
  } catch (err) {
    console.error('Energy latest error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/energy-meter/logs', authenticateToken, async (req, res) => {
  try {
    const { meterId, from, to, limit = '50', page = '1' } = req.query;
    if (!meterId) return res.status(400).json({ message: 'meterId is required' });

    const meters = await getVisibleEnergyMeters(req);
    const allowed = meters.find((m) => m.deviceId === meterId);
    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    const baseFilter = { meterId };
    if (from || to) {
      baseFilter.timestamp = {};
      if (from) baseFilter.timestamp.$gte = new Date(from);
      if (to) baseFilter.timestamp.$lte = new Date(to);
    }

    const filter = await buildLogFilterForCompany(allowed.companyName, baseFilter);

    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;

    const [logs, total] = await Promise.all([
      EnergyMeterLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(lim).lean(),
      EnergyMeterLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      total,
      page: parseInt(page, 10) || 1,
      limit: lim,
    });
  } catch (err) {
    console.error('Energy logs error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/api/energy-meter/reports/generate', authenticateToken, async (req, res) => {
  try {
    const meters = await getVisibleEnergyMeters(req);
    if (!meters.length) {
      return res.status(400).json({ error: 'No visible energy meters for report generation' });
    }

    const companyName = req.user.companyName || meters[0]?.companyName || 'Company';
    // req.user (JWT) may not contain display name fields; hydrate from DB for report metadata.
    const dbUser = await User.findById(req.user.id).select('name firstName lastName email username companyName role').lean();
    const reportUser = dbUser || req.user;
    const result = await generateEnergyReport(meters, req.body, reportUser, companyName);
    const storage = getStorageAdapter();
    storage.streamBuffer(result.pdfBuffer, res, {
      fileName: result.fileName,
      reportId: result.reportId,
    });
  } catch (err) {
    console.error('[energy-report] Generate error:', err);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Report generation failed' });
  }
});

app.get('/api/energy-meter/reports/history', authenticateToken, async (req, res) => {
  try {
    const companyName = req.user.companyName;
    if (!companyName && req.user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Company context required' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const history = await listReportHistory(companyName || req.query.companyName, limit);
    res.json({ data: history });
  } catch (err) {
    console.error('[energy-report] History error:', err);
    res.status(500).json({ error: err.message || 'Failed to load report history' });
  }
});

app.get('/api/energy-meter/parameter-map', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.query;
    const parameters = await getParameterMap(meterId || null);
    res.json({ meterId: meterId || null, parameters });
  } catch (err) {
    console.error('Energy parameter-map error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.put('/api/energy-meter/parameter-map', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Superadmin only' });
    }

    const { meterId = null, parameters = [] } = req.body;
    const scope = meterId ? 'device' : 'default';

    const updated = await EnergyMeterParameterMap.findOneAndUpdate(
      { scope, meterId: meterId || null },
      { scope, meterId: meterId || null, parameters },
      { upsert: true, new: true }
    );

    res.json({ message: 'Parameter map updated', map: updated });
  } catch (err) {
    console.error('Energy parameter-map update error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ✅ Level Sensor
// ✅ POST: Store sensor data from TRB245

/* 🚀 INSERT SENSOR DATA */
app.post('/api/levelsensor', async (req, res) => {
  try {
    /* 0️⃣ sanity */
    if (!req.body) return res.status(400).json({ message: 'Empty payload' });

    /** ---------- unpack & prep ---------- **/
    const {
      D         = null,                    // "DD/MM/YYYY HH:mm:ss"
      uid       = null,
      level     = null,
      ts        = null,
      data      = null,                    // array OR single number
      address   = null,                    // keep as plain string
      vehicleNo = null,
      mapKey    = null
    } = req.body;

    /* 1️⃣ ISO timestamp for sorting / querying */
    let dateISO = null;
    if (typeof D === 'string' && D.includes('/')) {
      const [date, time = '00:00:00']   = D.split(' ');
      const [dd, mm, yyyy]              = date.split('/').map(Number);
      const [h,  m,  s]                 = time.split(':').map(Number);
      dateISO = new Date(Date.UTC(yyyy, mm - 1, dd, h, m, s));
    }

    /* 2️⃣ which company does this UID belong to? */
    let companyUid = null;
    const dev = await Device.findOne({ uid }).lean();
    if (dev) companyUid = dev.companyName || null;

    /* 3️⃣ build sensor doc */
    const parsedData = Array.isArray(data)
  ? data.map(d => Math.round(Number(d))) // ensure numeric
  : data === undefined
    ? []
    : [Math.round(Number(data))];

// 🌡️ readings object from mapKey (dynamic mapping)
const readings = {};
if (typeof mapKey === 'string' && Array.isArray(parsedData)) {
  const keys = mapKey.split('_');
  keys.forEach((label, idx) => {
    const rawVal = parsedData[idx];
    if (label && rawVal !== undefined) {
      readings[label] = rawVal / 10; // e.g. 327 → 32.7
    }
  });
}

// 🧾 Store all sensor readings with mapping
const sensorDoc = new LevelSensor({
  D,
  uid,
  level,
  ts,
  address,
  vehicleNo,
  data: parsedData,
  readings,
  mapKey,
  dateISO,
  companyUid
});


    /** ---------- alarm evaluation ---------- **/
    const TH = { highHigh: 50, high: 35, low: 25, lowLow: 10 };
    const alarmsToInsert = [];

    if (Array.isArray(parsedData) && typeof mapKey === 'string') {
  const keys = mapKey.split('_');
  parsedData.forEach((raw, idx) => {
    const deg = raw / 10;
    let level = null;

    if (deg >= TH.highHigh) level = 'HIGH HIGH';
    else if (deg >= TH.high) level = 'HIGH';
    else if (deg <= TH.lowLow) level = 'LOW LOW';
    else if (deg <= TH.low) level = 'LOW';

    const sensorId = keys[idx] || `S${idx + 1}`; // fallback label

    if (level) {
      alarmsToInsert.push({
        uid,
        sensorId,
        value: deg,
        level,
        vehicleNo,
        dateISO: dateISO || new Date(),
        D,
      });
    }
  });
}


    /* 4️⃣ store alarms (if any) */
    if (alarmsToInsert.length) {
      await Alarm.insertMany(alarmsToInsert);
      console.log(`🚨 stored ${alarmsToInsert.length} alarm(s) for ${uid}`);
    }

    /* 5️⃣ e-mail once per "alarm episode" using latch */
try {
  const hasAlarm = alarmsToInsert.length > 0;
  const latched  = alarmLatch[uid] === true;

  console.log(`Latch for ${uid} at start →`, latched);

  /* ─── first alarm of an episode ── */
  if (hasAlarm && !latched) {
    alarmLatch[uid] = true;                       // latch ON

    /* ─── find all active users of the same company ── */
    const deviceDoc = await Device.findOne({ uid }).lean();

    const recipients = deviceDoc
      ? await User.find({
          companyName: deviceDoc.companyName,
          email: { $exists: true, $ne: "" },
          // subscriptionStatus: "active"            // optional filter
          // role: { $in: ["admin", "superadmin"] } // uncomment if needed
        }).select("email -_id").lean()
      : [];

    if (recipients.length) {
      const { subject, html } = alarmEmail({ uid, alarms: alarmsToInsert });

      for (const { email } of recipients) {
        await sendEmail({ to: email, subject, html });
        console.log(`✉️  Alarm mail sent to ${email} for ${uid}`);
      }
    } else {
      console.warn("✉️  No recipients found for uid", uid);
    }
  }

  /* ─── clear latch when readings return to normal ── */
  if (!hasAlarm && latched) {
    alarmLatch[uid] = false;
    console.log(`✅ values normal – latch for ${uid} cleared`);
  }
} catch (mailErr) {
  console.error("✉️  Mail send failed:", mailErr.message);
  // do NOT throw – we still want the sensor data saved
}


    /* 6️⃣ finally save the sensor reading itself */
    await sensorDoc.save();
    res.status(201).json({ message: 'Sensor data saved ✅' });
  } catch (err) {
    console.error('Sensor save error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


/* 🚀 SERVER-SIDE PAGINATION / SEARCH / SORT
 * GET /api/levelsensor?page=1&limit=9&search=&column=&sort=asc|desc
 */
app.get('/api/levelsensor', authenticateToken, async (req, res) => {
  try {
    /* 1. Query params */
    const page   = parseInt(req.query.page  || '1', 10);
    const limit  = parseInt(req.query.limit || '10', 10);
    const skip   = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const column = (req.query.column || '').trim();          // e.g. "vehicleNo"
    const sort   = req.query.sort === 'asc' ? 1 : -1;        // default newest→oldest

    /* 2. Role / company from JWT */
    const { role, companyName } = req.user;

    /* 3. Base filter — admins/users limited to their own devices */
    const mongoFilter = {};
    if (role !== 'superadmin') {
      const devs = await Device.find({ companyName }).select('uid -_id').lean();
      const uids = devs.map(d => d.uid);
      mongoFilter.uid = { $in: uids.length ? uids : ['__none__'] };  // empty fallback
    }

    if (req.query.uid) {
      mongoFilter.uid = req.query.uid;   // no regex ⇒ no prefix collisions
    }
    
    /* 4. Search filter */
    /* 4. Search filter -------------------------------------------------- */
if (search) {
  const rx       = new RegExp(search, "i");
  const numeric  = Number(search);                 // NaN if not a number
  const isNumber = !isNaN(numeric);

  if (column) {
    if (column === "data") {
      /* ── user chose the "Data" column ── */
      if (isNumber) {
        // in DB the value is stored ×10 (27 °C → 270)
        mongoFilter.data = { $elemMatch: { $eq: Math.round(numeric * 10) } };
      } else {
        // if user typed non-numeric, no match for data column
        mongoFilter.data = { $exists: false };     // will return empty set
      }
    } else {
     if (column === 'uid') {
     /* exact (case-insensitive) match → returns only that UID */
     mongoFilter.uid = { $regex: `^${search}$`, $options: 'i' };
   } else {
     mongoFilter[column] = rx;
   }
    }
  } else {
    /* ── "All Columns" search ── */
    mongoFilter.$or = [
      { D:         rx },
      { address:   rx },
      { vehicleNo: rx },
      { uid:       rx },
      isNumber && {
        data: { $elemMatch: { $eq: Math.round(numeric * 10) } }
      }
    ].filter(Boolean);                            // remove false entry if NaN
  }
}


    /* 5. Sort & fetch one page */
    const sortObj = { dateISO: sort };
    const [data, total] = await Promise.all([
      LevelSensor.find(mongoFilter).sort(sortObj).skip(skip).limit(limit).lean(),
      LevelSensor.countDocuments(mongoFilter)
    ]);

    res.json({ data, total });
  } catch (err) {
    console.error('LevelSensor GET error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /api/levelsensor/latest?uid=TRB245-01
app.get('/api/levelsensor/latest', authenticateToken, async (req, res) => {
  const { uid } = req.query;
  const doc = await LevelSensor.findOne({ uid })
    .sort({ dateISO: -1 })
    .lean();
  if (!doc) return res.status(404).json({ message: 'No data' });
  res.json(doc);
});

// GET /api/alarms?uid=GS-1234&page=1&limit=20
app.get("/api/alarms", authenticateToken, async (req, res) => {
  try {
    const page  = parseInt(req.query.page  || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const skip  = (page - 1) * limit;
    const uid   = req.query.uid;

    const filter = {};
    if (uid) filter.uid = uid;

    const [data, total] = await Promise.all([
      Alarm.find(filter).sort({ dateISO: -1 }).skip(skip).limit(limit).lean(),
      Alarm.countDocuments(filter),
    ]);

    res.json({ data, total });
  } catch (err) {
    console.error("Alarm GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


/* ------------------------------------------------------------------ */

// Google Login 
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(); // We don't need client ID here

app.post('/api/auth/google-login', async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ message: "Missing Google access token" });

  try {
    // Fetch Google profile
    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const profile = await googleRes.json();

    if (!profile || !profile.email) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    const { email, name, phone_number } = profile;

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        email,
        name,
        role: 'superadmin',
        companyName: '',
        contactInfo: phone_number || '', // Google may not provide this
        subscriptionStatus: 'inactive',
        subscriptionId: null,
        isActive: true, // New Google users are active by default
      });

      await user.save();
      console.log("✅ New Google user created:", user.email);
    }

    // ✅ Check if existing user is active
    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated. Please contact your administrator." });
    }

    // Re-check Razorpay subscription (like email login)
    if (user.subscriptionId) {
      try {
        const razorSub = await razorpay.subscriptions.fetch(user.subscriptionId);
        const now = new Date();
        
        // ✅ Use subscriptionEnd or fetch from Razorpay
        let expiryDate = user.subscriptionEnd;
        if (!expiryDate && razorSub.current_end) {
          expiryDate = new Date(razorSub.current_end * 1000);
        } else if (!expiryDate) {
          expiryDate = new Date(user.subscriptionStart);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        }

        if (razorSub.status !== 'active' || (expiryDate && now > expiryDate)) {
          user.subscriptionStatus = 'inactive';
          await user.save();
        }
      } catch (err) {
        console.warn("⚠️ Razorpay check failed:", err.message);
        user.subscriptionStatus = 'inactive';
        await user.save();
      }
    }

    const tokenPayload = {
      id: user._id,
      role: user.role,
      companyName: user.companyName,
      subscriptionStatus: getEffectiveSubscriptionStatus(user)
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || "supersecretkey", { expiresIn: '1h' });

    res
      .cookie('token', token, {
        httpOnly: true,
        secure   : isProd, 
        // secure: true,
        sameSite : isProd ? 'None' : 'Lax',
        // sameSite: 'Strict',
        maxAge: 60 * 60 * 1000,
      })
      .json({ message: "Google login successful ✅" });

  } catch (err) {
    console.error("Google login error:", err.message);
    res.status(500).json({ message: "Google login failed ❌" });
  }
});


// ✅ Login with Cookie (Live Subscription Check)
// ✅ Login with Cookie (Live Subscription Check)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials ❌" });
    }

    // ✅ Check if user is active
    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated. Please contact your administrator." });
    }

    

    // 🔄 Check Razorpay subscription in real-time if subscriptionId exists
    if (user.subscriptionId) {
      try {
        const razorSub = await razorpay.subscriptions.fetch(user.subscriptionId);
        const now = new Date();
        
        // ✅ Use subscriptionEnd or fetch from Razorpay
        let expiryDate = user.subscriptionEnd;
        if (!expiryDate && razorSub.current_end) {
          expiryDate = new Date(razorSub.current_end * 1000);
        } else if (!expiryDate) {
          expiryDate = new Date(user.subscriptionStart);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        }

        console.log("🔍 Checking subscription expiry:");
        console.log("→ Razorpay Status:", razorSub.status);
        console.log("→ Now:", now);
        console.log("→ Subscription Expiry:", expiryDate);

        if (razorSub.status !== 'active') {
          console.log("❌ Razorpay subscription is not active:", razorSub.status);
        }

        if (expiryDate && now > expiryDate) {
          console.log("⏰ Subscription has expired by time limit.");
        }

        if (razorSub.status !== 'active' || (expiryDate && now > expiryDate)) {
          user.subscriptionStatus = 'inactive';
          await user.save();
          console.log("✅ Updated user subscription to inactive in DB");
        } else {
          console.log("✅ Subscription still valid, keeping active.");
        }

      } catch (err) {
        console.warn("⚠️ Razorpay API call failed – leaving existing subscriptionStatus untouched:", err.message);
        // NOTE: do NOT overwrite status on pure network / auth errors
        //       Only log and continue.
      }
    }

    // ✅ Re-fetch updated user after saving
    user = await User.findById(user._id);

    // ✅ Generate token with updated subscriptionStatus
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        companyName: user.companyName,
        subscriptionStatus: getEffectiveSubscriptionStatus(user)
      },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: '2h' }
    );

    res
      .cookie('token', token, {
        httpOnly: true,
        secure   : isProd,
        // secure: true,
        sameSite : isProd ? 'None' : 'Lax',
        // sameSite: 'Strict',
        maxAge: 8 * 60 * 60 * 1000,
      })
      .json({
        message: "Login successful ✅",
        role: user.role,
        companyName: user.companyName,
        subscriptionStatus: getEffectiveSubscriptionStatus(user)
      });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Login failed ❌" });
  }
});

// ✅ Get unique UIDs for dropdown (All sensor devices)
app.get("/api/levelsensor/uids", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;

    let filter = {};

    if (role !== "superadmin") {
      // Only get devices belonging to the logged-in user's company
      const devs = await Device.find({ companyName }).select("uid -_id").lean();
      const uids = devs.map((d) => d.uid);

      // If no matching devices, return early
      if (uids.length === 0) {
        return res.json([]);
      }

      filter.uid = { $in: uids };
    }

    const distinctUIDs = await LevelSensor.distinct("uid", filter);
    return res.json(distinctUIDs);
  } catch (err) {
    console.error("UID Fetch Error:", err);
    return res.status(500).json({ message: "Failed to fetch device UIDs" });
  }
});










// ✅ Company Dashboard Access Control APIs

// Get all companies with dashboard access
app.get("/api/company-dashboard-access", authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all companies from User model (filter out empty/null values)
    const companies = await User.distinct('companyName');
    const validCompanies = companies.filter(companyName => 
      companyName && companyName.trim() !== '' && companyName !== null && companyName !== undefined
    );
    
    console.log('🔍 Found companies:', validCompanies);
    
    // Get or create access records for each company
    const accessData = await Promise.all(
      validCompanies.map(async (companyName) => {
        try {
          let access = await CompanyDashboardAccess.findOne({ companyName });
          
          if (!access) {
            // Create default access
            access = new CompanyDashboardAccess({
              companyName: companyName.trim(),
              dashboardAccess: {
                home: true,
                dashboard: true,
                craneOverview: false,
                elevatorOverview: false,
                energyOverview: false,
                trackerOverview: false,
                craneDashboard: false,
                reports: true,
                addUsers: true,
                addDevices: true,
                subscription: true,
                settings: true
              }
            });
            await access.save();
            console.log('✅ Created access record for:', companyName);
          }
          
          return access;
        } catch (err) {
          console.error('❌ Error processing company:', companyName, err);
          return null;
        }
      })
    );

    // Filter out any null results
    const validAccessData = accessData.filter(access => access !== null);

    res.json({ companies: validAccessData });
  } catch (err) {
    console.error('Error fetching company dashboard access:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update company dashboard access
app.put("/api/company-dashboard-access/:companyName", authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    const { companyName } = req.params;
    const { dashboardAccess } = req.body;
    
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const access = await CompanyDashboardAccess.findOneAndUpdate(
      { companyName },
      { 
        dashboardAccess,
        lastUpdated: new Date(),
        updatedBy: req.user.email
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, access });
  } catch (err) {
    console.error('Error updating company dashboard access:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user can access specific dashboard
app.get("/api/check-dashboard-access/:dashboardName", authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const { dashboardName } = req.params;
    
    if (role === 'superadmin') {
      return res.json({ hasAccess: true });
    }

    const access = await CompanyDashboardAccess.findOne({ companyName });
    
    if (!access) {
      return res.json({ hasAccess: false });
    }

    const hasAccess = access.dashboardAccess[dashboardName] || false;
    res.json({ hasAccess });
  } catch (err) {
    console.error('Error checking dashboard access:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    // secure: true,
      sameSite: isProd ? 'None' : 'Lax'
    // sameSite: 'Strict',
  });
  res.json({ message: 'Logged out successfully ✅' });
});

// ✅ API endpoint to get crane sessions data for PDF export
app.get('/api/crane/sessions', authenticateToken, async (req, res) => {
  try {
    const { cranes, months } = req.query;
    const { role, companyName } = req.user;

    console.log('🔍 User requesting crane sessions data:', { role, companyName, cranes, months });

    if (role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin or superadmin required.' });
    }

    const selectedCranes = cranes ? cranes.split(',') : [];
    const selectedMonths = months ? months.split(',') : [];

    if (selectedCranes.length === 0) {
      return res.status(400).json({ message: 'No cranes selected' });
    }

    // Build company filter consistent with overview route
    const companyFilter = (role !== 'superadmin') ? { craneCompany: companyName } : {};

    const craneLogs = await CraneLog.find({
      ...companyFilter,
      DeviceID: { $in: selectedCranes }
    }).sort({ Timestamp: 1 });

    if (craneLogs.length === 0) {
      return res.json({ success: true, sessions: [], message: 'No crane logs found for selected cranes' });
    }

    const sessionsData = generateSessionsData(craneLogs, selectedCranes);

    res.json({ success: true, sessions: sessionsData, totalSessions: sessionsData.length, selectedCranes, selectedMonths });
  } catch (error) {
    console.error('❌ Error fetching crane sessions:', error);
    res.status(500).json({ message: 'Failed to fetch crane sessions data', error: error.message });
  }
});

// ✅ Filtered working totals for first card (safe, standalone)
app.get('/api/crane/working-totals', authenticateToken, async (req, res) => {
  try {
    const { role, companyName } = req.user;
    const cranesParam = (req.query.cranes || '').trim();
    const selectedCranes = cranesParam ? cranesParam.split(',').map(s => s.trim()).filter(Boolean) : [];
    const startStr = (req.query.start || '').trim();
    const endStr = (req.query.end || '').trim();

    // Company filter matches overview logic
    const companyFilter = role !== 'superadmin' ? { craneCompany: companyName } : {};

    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== 'superadmin' ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));

    // ✅ Get all crane devices for this company, then filter by allowlist
    const craneDevicesRaw = await CraneLog.distinct('DeviceID', companyFilter);
    const craneDevices = craneDevicesRaw.filter(id => allowedById.has(id));
    
    // Determine crane list (only from allowed devices)
    const allCranes = craneDevices;
    const cranes = selectedCranes.length > 0 ? selectedCranes.filter(id => allowedById.has(id)) : allCranes;
    if (cranes.length === 0) {
      return res.json({ success: true, workingCompleted: 0, workingOngoing: 0, cranesCount: 0, cranesList: [], period: null });
    }

    // Determine period
    const now = getCurrentTimeInIST();
    let startDate, endDate;
    if (startStr && endStr) {
      // ✅ FIXED: Use IST helpers for timezone-agnostic date parsing
      const [ys, ms, ds] = startStr.split('-').map(Number);
      const [ye, me, de] = endStr.split('-').map(Number);
      
      // ✅ Use IST helpers directly for consistent date boundaries
      startDate = istStartUtcFromYMD(ys, ms - 1, ds);  // 00:00:00 IST
      endDate = istEndUtcFromYMD(ye, me - 1, de);      // 23:59:59 IST
      
      console.log(`🔍 [working-totals] Date range created:`, {
        startStr,
        endStr,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startDateIST: startDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        endDateIST: endDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      });
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = now;
    }

    let workingCompleted = 0;
    let workingOngoing = 0;

    for (const deviceId of cranes) {
      // ✅ Fetch all logs and filter in JavaScript for accurate date comparison
      const allLogs = await CraneLog.find({ 
        ...companyFilter, 
        DeviceID: deviceId
      }).lean().sort({ Timestamp: 1 });

      // Filter logs by date range in JavaScript
      let logs = allLogs;
      if (startStr && endStr) {
        logs = allLogs.filter(log => {
          // ✅ FIXED: Use proper date object comparison instead of string comparison
          const logTimestamp = parseTimestamp(log.Timestamp);
          if (!logTimestamp) return false;
          
          // ✅ Debug: Log the comparison values for first few logs
          if (allLogs.length <= 5) {
            console.log(`🔍 [working-totals] Date comparison for ${deviceId}:`, {
              original: log.Timestamp,
              logTimestamp: logTimestamp.toISOString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              isAfterStart: logTimestamp >= startDate,
              isBeforeEnd: logTimestamp <= endDate,
              included: (logTimestamp >= startDate && logTimestamp <= endDate)
            });
          }
          
          return logTimestamp >= startDate && logTimestamp <= endDate;
        });
        
        // ✅ Debug logging
        console.log(`🔍 [working-totals] Date filter for ${deviceId}:`, {
          startStr,
          endStr,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalLogs: allLogs.length,
          filteredLogs: logs.length
        });
      }

      // ✅ Debug logging
      console.log(`🔍 [working-totals] Found ${logs.length} logs for ${deviceId} with date filter`);
      if (logs.length > 0) {
        console.log(`🔍 [working-totals] First log: ${logs[0].Timestamp}, Last log: ${logs[logs.length - 1].Timestamp}`);
      }

      if (logs.length === 0) continue;

      // ✅ Use the same working hours logic as overview endpoint
      let currentWorkingStart = null;
      let isCurrentlyWorking = false;

      // ✅ Carry-over detection: if the crane was already working at 00:00 today
      // look at the last log before the selected start date and infer status
      try {
        const lastBeforeStart = [...allLogs].reverse().find((entry) => {
          const ts = parseTimestamp(entry.Timestamp);
          return ts && ts < startDate;
        });
        const wasWorkingAtStart = !!(lastBeforeStart && lastBeforeStart.DigitalInput1 === "1" && lastBeforeStart.DigitalInput2 === "0");
        if (wasWorkingAtStart) {
          // The crane was working at midnight; start an ongoing session from 00:00:00
          currentWorkingStart = startDate;
          isCurrentlyWorking = true;
          console.log(`🔍 [working-totals] ${deviceId} carry-over detected: working at 00:00, initializing start from midnight`);
        }
      } catch (e) {
        console.log(`⚠️ [working-totals] ${deviceId} carry-over detection error:`, e?.message || e);
      }

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const timestamp = parseTimestamp(log.Timestamp);
        if (!timestamp) continue;

        const isWorking = (log.DigitalInput1 === "1" && log.DigitalInput2 === "0");
        
        if (isWorking && !isCurrentlyWorking) {
          // Start of working period
          currentWorkingStart = timestamp;
          isCurrentlyWorking = true;
        } else if (!isWorking && isCurrentlyWorking) {
          // End of working period
          if (currentWorkingStart) {
            const duration = (timestamp - currentWorkingStart) / (1000 * 60 * 60); // hours
            workingCompleted += duration;
            currentWorkingStart = null;
          }
          isCurrentlyWorking = false;
        }
      }

      // ✅ FIX: Handle case where crane is already working from previous day
      // If crane is working but we don't have a start time, it means it's an ongoing session
      if (isCurrentlyWorking && !currentWorkingStart) {
        // Check if this might be an ongoing session from previous day
        const firstLog = logs[0];
        if (firstLog && firstLog.DigitalInput1 === "1" && firstLog.DigitalInput2 === "0") {
          // Crane was already working when first log was recorded today
          // This indicates an ongoing session from previous day
          currentWorkingStart = startDate; // Start counting from 12 AM today
          console.log(`🔍 [working-totals] ${deviceId} detected ongoing session from previous day, starting from 00:00:00`);
        }
      }

      // ✅ CRITICAL FIX: ALWAYS check if crane is working from before selected date
      // This handles the case where crane started working yesterday and is still working today
      if (isCurrentlyWorking && currentWorkingStart) {
        // Check if the working start time is before today's start date
        if (currentWorkingStart < startDate) {
          console.log(`🔍 [working-totals] ${deviceId} working session started before today (${currentWorkingStart.toISOString()}), forcing start to 00:00:00`);
          currentWorkingStart = startDate; // Force start to 12 AM today
        }
      }

      // ✅ DEBUG: Log the ongoing session detection
      console.log(`🔍 [working-totals] ${deviceId} ongoing session analysis:`, {
        isCurrentlyWorking,
        currentWorkingStart: currentWorkingStart ? currentWorkingStart.toISOString() : null,
        startDate: startDate.toISOString(),
        firstLogTimestamp: logs.length > 0 ? logs[0].Timestamp : 'No logs',
        lastLogTimestamp: logs.length > 0 ? logs[logs.length - 1].Timestamp : 'No logs'
      });



      // ✅ Handle ongoing working session with proper cross-day logic
      if (isCurrentlyWorking && currentWorkingStart) {
        let effectiveStart;
        let effectiveEnd;
        
        // ✅ Check if this is a cross-day ongoing session
        if (currentWorkingStart < startDate) {
          // ✅ Crane was working before selected date - start counting from 12 AM of selected date
          effectiveStart = startDate;
          console.log(`🔍 [working-totals] ${deviceId} has ongoing session from before ${startStr}, counting from 00:00:00`);
        } else {
          // ✅ Normal ongoing session within selected date range
          effectiveStart = currentWorkingStart;
        }
        
        // ✅ CRITICAL FIX: For historical dates, cap ongoing hours at end of selected date
        // For today's date, use current time (not end of day)
        if (endDate < now) {
          // This is a historical date, not today - cap at end of selected date
          effectiveEnd = endDate;
          console.log(`🔍 [working-totals] ${deviceId} historical date selected, capping ongoing hours at ${endStr} 23:59:59`);
        } else {
          // This is today or future date - use current time
          effectiveEnd = now;
          console.log(`🔍 [working-totals] ${deviceId} today's date selected, using current time: ${now.toLocaleString('en-IN')}`);
        }
        
        // ✅ Calculate duration from effective start to effective end
        const effectiveStartIST = new Date(effectiveStart.getTime() + (5.5 * 60 * 60 * 1000));
        const effectiveEndIST = new Date(effectiveEnd.getTime() + (5.5 * 60 * 60 * 1000));
        const duration = (effectiveEndIST - effectiveStartIST) / (1000 * 60 * 60); // hours
        workingOngoing += duration;
        
        // ✅ DEBUG: Detailed ongoing session calculation with raw values
        console.log(`🔍 [working-totals] ${deviceId} ongoing session calculation:`, {
          effectiveStart: effectiveStart.toISOString(),
          effectiveStartIST: effectiveStartIST.toLocaleString('en-IN'),
          effectiveEnd: effectiveEnd.toISOString(),
          effectiveEndIST: effectiveEndIST.toLocaleString('en-IN'),
          durationHours: duration.toFixed(2),
          durationMinutes: (duration * 60).toFixed(0),
          durationMinutesRaw: (duration * 60),
          isToday: endDate >= now,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          currentTime: now.toISOString(),
          workingOngoingAccumulated: workingOngoing.toFixed(4)
        });
      }
    }

    res.json({
      success: true,
      workingCompleted: Math.round(workingCompleted * 100) / 100,
      workingOngoing: Math.round(workingOngoing * 100) / 100,
      cranesCount: cranes.length,
      cranesList: cranes,
      period: { start: startDate.toISOString(), end: endDate.toISOString() }
    });
  } catch (err) {
    console.error('❌ working-totals error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute working totals' });
  }
});

// ✅ Flexible time-series stats (EARLY, before static)
// (Removed older non-IST timeseries route; using hardened IST-anchored version below)

// ✅ Serve frontend
// ✅ Flexible time-series stats for line chart (daily/weekly/monthly) — IST-anchored and registered BEFORE static/catch-all
app.get("/api/crane/timeseries-stats", authenticateToken, async (req, res) => {
  try {
    console.log('🔍 [timeseries] Incoming request', { path: req.path, query: req.query, user: req.user ? { role: req.user.role, companyName: req.user.companyName } : null });
    const { role, companyName } = req.user;
    const { cranes, start, end, granularity } = req.query;
    const debug = req.query.debug === '1' || req.query.debug === 'true';

    // Company scope
    const companyFilter = role !== "superadmin" ? { craneCompany: companyName } : {};

    // ✅ Build allowlist from Device collection (admin = own company, superadmin = all)
    const deviceQuery = role !== "superadmin" ? { companyName } : {};
    const allowedDevices = await Device.find(deviceQuery).lean();
    const allowedById = new Set(allowedDevices.map(d => d.deviceId));

    // Devices scoped to allowlist
    const allDevicesRaw = await CraneLog.distinct("DeviceID", companyFilter);
    const allDevices = allDevicesRaw.filter(id => allowedById.has(id));
    const requested = (cranes || "").split(',').map(s => s.trim()).filter(Boolean);
    const selectedDevices = requested.length > 0 ? allDevices.filter(id => requested.includes(id)) : allDevices;
    if (selectedDevices.length === 0) return res.json({ granularity: "monthly", points: [] });

    // Date helpers
    const toStartOfDay = (utcDate) => {
      const { year, month, day } = getISTDateComponentsFromUtcDate(utcDate);
      return istStartUtcFromYMD(year, month, day);
    };
    const toEndOfDay = (utcDate) => {
      const { year, month, day } = getISTDateComponentsFromUtcDate(utcDate);
      return istEndUtcFromYMD(year, month, day);
    };

    // Range
    const now = getCurrentTimeInIST();
    let rangeStart, rangeEnd;
    if (start && end) {
      const [ys, ms, ds] = start.split('-').map(Number);
      const [ye, me, de] = end.split('-').map(Number);
      // ✅ FIXED: Use IST helpers for timezone-agnostic date parsing
      rangeStart = istStartUtcFromYMD(ys, ms - 1, ds);
      rangeEnd = istEndUtcFromYMD(ye, me - 1, de);
      if (rangeEnd > now) rangeEnd = now;
      
      // ✅ DEBUG: Log the resolved boundaries
      console.log('[timeseries] parsed range (IST)', {
        startParam: start, 
        endParam: end,
        rangeStartISO: rangeStart.toISOString(),
        rangeEndISO: rangeEnd.toISOString()
      });
    } else {
      const { year: istNowYear, month: istNowMonth } = getISTDateComponentsFromUtcDate(now);

      // Calculate the start of the month 6 months ago (IST)
      rangeStart = istStartUtcFromYMD(istNowYear, istNowMonth - 5, 1);

      // Calculate the end of the current month (IST)
      rangeEnd = istEndUtcFromYMD(istNowYear, istNowMonth + 1, 0); // Day 0 of next month is last day of current month
    }

    if (rangeStart > rangeEnd) return res.json({ granularity: "monthly", points: [] });

    const msPerDay = 24 * 60 * 60 * 1000;
    const rangeDays = Math.max(1, Math.ceil((toStartOfDay(rangeEnd) - toStartOfDay(rangeStart)) / msPerDay) + 1);
    let mode = (granularity || 'auto').toLowerCase();
    if (mode === 'auto') {
      if (rangeDays <= 31) mode = 'daily';
      else if (rangeDays <= 180) mode = 'weekly';
      else mode = 'monthly';
    }

    if (debug) {
      console.log('🔍 [timeseries][debug] range', {
        mode,
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString()
      });
    }

    // Buckets in IST
    const buckets = [];
    if (mode === 'daily') {
      let cursor = toStartOfDay(rangeStart);
      while (cursor <= rangeEnd) {
        const { year: cY, month: cM, day: cD } = getISTDateComponentsFromUtcDate(cursor);
        const dayStart = istStartUtcFromYMD(cY, cM, cD);
        const dayEnd = istEndUtcFromYMD(cY, cM, cD);
        buckets.push({
          start: dayStart,
          end: dayEnd,
          label: dayStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
        });
        // Advance cursor to the start of the next IST day
        cursor = istStartUtcFromYMD(cY, cM, cD + 1);
      }
    } else if (mode === 'weekly') {
      let cursor = toStartOfDay(rangeStart);
      while (cursor <= rangeEnd) {
        const { year: cY, month: cM, day: cD } = getISTDateComponentsFromUtcDate(cursor);
        const weekStart = istStartUtcFromYMD(cY, cM, cD);
        const weekEnd = istEndUtcFromYMD(cY, cM, cD + 6); // End of 7th day (current day + 6)
        buckets.push({
          start: weekStart,
          end: weekEnd > rangeEnd ? rangeEnd : weekEnd,
          label: `Week of ${weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}`
        });
        // Advance cursor to the start of the next IST week
        cursor = istStartUtcFromYMD(cY, cM, cD + 7);
      }
    } else {
      // ✅ FIXED: Use IST calendar dates for bucket generation
      const { year: rsY, month: rsM } = getISTDateComponentsFromUtcDate(rangeStart);
      const { year: reY, month: reM } = getISTDateComponentsFromUtcDate(rangeEnd);

      let cursorISTYear = rsY;
      let cursorISTMonth = rsM;

      while (true) {
        const monthStart = istStartUtcFromYMD(cursorISTYear, cursorISTMonth, 1);
        let monthEnd = istEndUtcFromYMD(cursorISTYear, cursorISTMonth + 1, 0); // Day 0 of next month is last day of current month

        if (monthStart > rangeEnd) break; // Stop if the current month starts after the overall range ends

        if (monthEnd > rangeEnd) monthEnd = rangeEnd; // Clamp monthEnd to overall rangeEnd

        const label = monthStart.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
        buckets.push({ start: monthStart, end: monthEnd, label });

        // Move to the next month (IST)
        cursorISTMonth++;
        if (cursorISTMonth > 11) {
          cursorISTMonth = 0;
          cursorISTYear++;
        }
        // Break condition for the loop
        if (istStartUtcFromYMD(cursorISTYear, cursorISTMonth, 1) > rangeEnd) break;
      }
    }

    if (debug) {
      console.log('🔍 [timeseries][debug] lastBuckets', buckets.slice(-3).map(b => ({
        label: b.label,
        start: b.start.toISOString(),
        end: b.end.toISOString()
      })));
    }

    const lastLabels = new Set(buckets.slice(-3).map(b => b.label));

    const points = [];

    // ✅ FIXED: Aggregate by bucket in IST using parseTimestamp with prevLog seeding
    for (const b of buckets) {
      let usage = 0;
      let maint = 0;
      let totalBucketLogs = 0;

      for (const deviceId of selectedDevices) {
        const deviceFilter = { ...companyFilter, DeviceID: deviceId };
        const deviceLogs = await CraneLog.find(deviceFilter).lean();

        // ✅ FIX: Find the last log before this bucket starts (for carry-over state)
        let prevLog = null;
        for (const log of deviceLogs) {
          const t = parseTimestamp(log.Timestamp);
          if (t && t < b.start) {
            if (!prevLog) {
              prevLog = log;
            } else {
              const prevT = parseTimestamp(prevLog.Timestamp);
              if (prevT && t > prevT) prevLog = log;
            }
          }
        }

        // ✅ FIX: Get logs that fall within this bucket
        const bucketLogs = deviceLogs.filter(log => {
          const t = parseTimestamp(log.Timestamp);
          return t && t >= b.start && t <= b.end;
        });

        // ✅ FIX: Seed the bucket with prevLog if it exists and crane was working/maintenance
        let augmentedBucketLogs = [...bucketLogs];
        if (prevLog) {
          const wasWorking = prevLog.DigitalInput1 === "1" && prevLog.DigitalInput2 === "0";
          const wasMaintenance = prevLog.DigitalInput2 === "1";
          
          if (wasWorking || wasMaintenance) {
            // Create a synthetic log at bucket start with the previous state
            const syntheticLog = {
              ...prevLog,
              Timestamp: b.start, // Start of bucket
              _isSynthetic: true // Flag to identify this as synthetic
            };
            augmentedBucketLogs.unshift(syntheticLog);
            
            if (debug) {
              console.log(`🔍 [timeseries] Device ${deviceId} - Seeded bucket ${b.label} with synthetic log:`, {
                prevLogState: { DI1: prevLog.DigitalInput1, DI2: prevLog.DigitalInput2 },
                syntheticTimestamp: b.start.toISOString(),
                bucketStart: b.start.toISOString(),
                bucketEnd: b.end.toISOString()
              });
            }
          }
        }

        totalBucketLogs += bucketLogs.length; // Keep original count for debug
        if (augmentedBucketLogs.length === 0) continue;

        // ✅ FIX: Sort augmented logs chronologically
        augmentedBucketLogs.sort((a, b2) => {
          const aT = parseTimestamp(a.Timestamp);
          const bT = parseTimestamp(b2.Timestamp);
          if (!aT || !bT) return 0;
        return aT - bT;
      });

        // 🔍 Extra debug to diagnose missing last-day data: show prev and first-in-bucket logs per device
        if (debug && lastLabels.has(b.label)) {
          const firstInBucket = bucketLogs.length > 0 ? bucketLogs[0] : null;
          const prevTs = prevLog ? parseTimestamp(prevLog.Timestamp) : null;
          const firstTs = firstInBucket ? parseTimestamp(firstInBucket.Timestamp) : null;
          console.log('🔍 [timeseries][debug] deviceBucketEdges', {
            deviceId,
            bucketLabel: b.label,
            bucketStart: b.start.toISOString(),
            bucketEnd: b.end.toISOString(),
            prevLog: prevLog ? { tsISO: prevTs ? prevTs.toISOString() : null, raw: prevLog.Timestamp, DI1: prevLog.DigitalInput1, DI2: prevLog.DigitalInput2 } : null,
            firstInBucket: firstInBucket ? { tsISO: firstTs ? firstTs.toISOString() : null, raw: firstInBucket.Timestamp, DI1: firstInBucket.DigitalInput1, DI2: firstInBucket.DigitalInput2 } : null,
            totalBucketLogsForDevice: bucketLogs.length,
            augmentedLogsCount: augmentedBucketLogs.length,
            hasSyntheticLog: augmentedBucketLogs.some(log => log._isSynthetic)
          });
        }

        // ✅ FIX: Calculate periods using augmented logs (includes carry-over state)
        const workingPeriods = calculateConsecutivePeriods(augmentedBucketLogs, 'working');
        for (const p of workingPeriods) {
          if (p.isOngoing) {
            const effectiveStart = p.startTime < b.start ? b.start : p.startTime;
            let endClamp = getCurrentTimeInIST();
            if (endClamp > b.end) endClamp = b.end;
            const duration = calculatePeriodDuration(effectiveStart, endClamp, true);
            usage += duration;
          } else {
            const effectiveStart = p.startTime < b.start ? b.start : p.startTime;
            const effectiveEnd = p.endTime > b.end ? b.end : p.endTime;
            const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
            usage += duration;
          }
        }

        const maintenancePeriods = calculateConsecutivePeriods(augmentedBucketLogs, 'maintenance');
        for (const p of maintenancePeriods) {
          if (p.isOngoing) {
            const effectiveStart = p.startTime < b.start ? b.start : p.startTime;
            let endClamp = getCurrentTimeInIST();
            if (endClamp > b.end) endClamp = b.end;
            const duration = calculatePeriodDuration(effectiveStart, endClamp, true);
            maint += duration;
          } else {
            const effectiveStart = p.startTime < b.start ? b.start : p.startTime;
            const effectiveEnd = p.endTime > b.end ? b.end : p.endTime;
            const duration = calculatePeriodDuration(effectiveStart, effectiveEnd, false);
            maint += duration;
          }
        }
      }

      if (debug && lastLabels.has(b.label)) {
        console.log('🔍 [timeseries][debug] bucketSummary', {
          label: b.label,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          totalBucketLogs,
          usageHours: Math.round(usage * 100) / 100,
          maintenanceHours: Math.round(maint * 100) / 100
        });
      }

      points.push({ label: b.label, usageHours: Math.round(usage * 100) / 100, maintenanceHours: Math.round(maint * 100) / 100 });
    }

    return res.json({ granularity: mode, points });
  } catch (err) {
    console.error("❌ Timeseries stats fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Helper functions for binary conversion (same as frontend)
const decimalToBinary = (decimal, bits = 16) => {
  return parseInt(decimal).toString(2).padStart(bits, '0');
};

const split16BitTo8Bit = (binary16) => {
  const padded = binary16.padStart(16, '0');
  return {
    high: padded.substring(0, 8),
    low: padded.substring(8, 16)
  };
};

const binaryToDecimal = (binary) => {
  return parseInt(binary, 2);
};

// ✅ Helper function for ISO week calculation
const getISOWeek = (date) => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000); // 604800000 = 7 * 24 * 3600 * 1000
};

// ✅ GET: Elevator time-series stats for line chart (working/maintenance hours over time)
app.get("/api/elevator/timeseries-stats", authenticateToken, async (req, res) => {
  try {
    const { elevatorId, start, end, granularity } = req.query;
    const { role, companyName } = req.user;
    
    // Company scope
    const companyFilter = role !== "superadmin" ? { elevatorCompany: companyName } : {};
    
    // Build base filter
    const baseFilter = {
      ...companyFilter,
      elevatorId: elevatorId
    };
    
    // Add time range filter (ensure UTC handling)
    if (start && end) {
      baseFilter.timestamp = {
        $gte: new Date(start), // start is already in UTC format from toISOString()
        $lte: new Date(end)    // end is already in UTC format from toISOString()
      };
    } else {
      // Default to last 7 days if no range specified
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      baseFilter.timestamp = { $gte: sevenDaysAgo };
    }
    
    // Auto-determine granularity if not specified
    let finalGranularity = granularity || 'auto';
    if (finalGranularity === 'auto') {
      const daysDiff = start && end ? 
        (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24) : 7;
      if (daysDiff <= 2) finalGranularity = 'hourly';
      else if (daysDiff <= 14) finalGranularity = 'daily';
      else finalGranularity = 'weekly';
    }
    
    console.log(`🔍 [DEBUG] 30-day fix: elevatorId=${elevatorId}, start=${start}, end=${end}, granularity=${finalGranularity}`);
    
    // Fetch all logs for the elevator in the time range
    const logs = await ElevatorEvent.find(baseFilter)
      .sort({ timestamp: 1 })
      .lean()
      .maxTimeMS(10000);

    if (logs.length === 0) {
      return res.json({
        granularity: finalGranularity,
        points: [],
        elevatorId: elevatorId,
        totalPoints: 0
      });
    }

    // ✅ Create time buckets using IST-aligned day boundaries for non-hourly views.
    // This avoids the 5h30m drift that appears when bucketing by UTC days.
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const startOfISTDay = (value) => {
      const shifted = new Date(value.getTime() + IST_OFFSET_MS);
      return new Date(Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate()
      ) - IST_OFFSET_MS);
    };
    const formatISTDateKey = (value) =>
      new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

    // ✅ Create time buckets using the SAME approach as crane timeseries
    const buckets = [];
    const msPerDay = 24 * 60 * 60 * 1000;
    const rangeDays = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / msPerDay));
    
    if (finalGranularity === 'hourly') {
      // Hourly buckets - use UTC to avoid timezone issues
      let cursor = new Date(start);
      while (cursor <= new Date(end)) {
        const hourStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), cursor.getUTCHours()));
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        buckets.push({
          start: hourStart,
          end: hourEnd > new Date(end) ? new Date(end) : hourEnd,
          label: hourStart.toISOString()
        });
        cursor = new Date(hourStart.getTime() + 60 * 60 * 1000);
      }
    } else if (finalGranularity === 'daily') {
      // Daily buckets - align to IST day boundaries
      const rangeEnd = new Date(end);
      let cursor = startOfISTDay(new Date(start));
      while (cursor <= rangeEnd) {
        const dayStart = new Date(cursor);
        const dayEnd = new Date(dayStart.getTime() + msPerDay);
        buckets.push({
          start: dayStart,
          end: dayEnd > rangeEnd ? rangeEnd : dayEnd,
          label: formatISTDateKey(dayStart)
        });
        cursor = new Date(dayEnd);
      }
    } else {
      // Weekly buckets - align to IST day boundaries
      const rangeEnd = new Date(end);
      let cursor = startOfISTDay(new Date(start));
      while (cursor <= rangeEnd) {
        const weekStart = new Date(cursor);
        const weekEnd = new Date(weekStart.getTime() + 7 * msPerDay);
        const weekStartIST = new Date(weekStart.getTime() + IST_OFFSET_MS);
        buckets.push({
          start: weekStart,
          end: weekEnd > rangeEnd ? rangeEnd : weekEnd,
          label: `Week of ${weekStartIST.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
        });
        cursor = new Date(weekEnd);
      }
    }
    
    console.log(`🔍 [DEBUG] Created ${buckets.length} buckets for ${finalGranularity} granularity`);

    // ✅ OPTIMIZATION: Get initial state ONCE before the entire query range (not per period)
    let globalInitialState = { isWorking: false, isMaintenance: false, hasError: false };
    
    // Get the very first log timestamp from all logs
    const firstLogTimestamp = logs.length > 0 ? new Date(logs[0].timestamp) : new Date();
    
    // Find last log before the entire query range
    const allLogsBeforeRange = await ElevatorEvent.find({
      ...baseFilter,
      timestamp: { $lt: firstLogTimestamp }
    })
    .sort({ timestamp: -1 })
    .limit(1)
    .lean();
    
    if (allLogsBeforeRange.length > 0) {
      const lastLogBefore = allLogsBeforeRange[0];
      if (lastLogBefore.data && lastLogBefore.data.length >= 2) {
        const reg66 = parseInt(lastLogBefore.data[1]) || 0;
        const reg66Binary = decimalToBinary(reg66, 16);
        const reg66Split = split16BitTo8Bit(reg66Binary);
        const reg66H = reg66Split.high;
        const reg66L = reg66Split.low;
        
        // ✅ Check errorCode instead of register bits for error detection
        const normalizedErrorCode = normalizeCode(lastLogBefore.errorCode);
        const hasActiveError = normalizedErrorCode && 
                              normalizedErrorCode !== '000' && 
                              normalizedErrorCode !== '0000';
        
        globalInitialState = {
          isWorking: reg66H[7] === '1',        // In Service
          isMaintenance: reg66H[5] === '1',    // Maintenance ON
          hasError: hasActiveError              // Based on errorCode field
        };
      }
    }

    // Calculate hours for each bucket using CORRECT period-based logic
    const results = [];
    
    // Track state across periods
    let carryOverState = { ...globalInitialState };
    
    for (const bucket of buckets) {
      const periodStart = bucket.start;
      const periodEnd = bucket.end;
      
      // Get logs that fall within this bucket's time range
      const groupLogs = logs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime >= periodStart && logTime < periodEnd;
      });
      
      groupLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // ✅ CORRECT LOGIC: Track state changes within the time period
      let workingHours = 0;
      let maintenanceHours = 0;
      let errorHours = 0;
      
      // Use carry-over state from previous period as initial state
      let initialState = { ...carryOverState };
      
      // Step 2: Track state changes during the period
      let currentState = { ...initialState };
      let stateStartTime = periodStart;
      
      // Add logs in chronological order within the period
      const sortedLogs = [...groupLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      for (const log of sortedLogs) {
        if (log.data && log.data.length >= 2) {
          const reg66 = parseInt(log.data[1]) || 0;
          const reg66Binary = decimalToBinary(reg66, 16);
          const reg66Split = split16BitTo8Bit(reg66Binary);
          const reg66H = reg66Split.high;
          const reg66L = reg66Split.low;
          
          // ✅ Check errorCode instead of register bits for error detection
          const normalizedErrorCode = normalizeCode(log.errorCode);
          const hasActiveError = normalizedErrorCode && 
                                normalizedErrorCode !== '000' && 
                                normalizedErrorCode !== '0000';
          
          const newState = {
            isWorking: reg66H[7] === '1',        // In Service
            isMaintenance: reg66H[5] === '1',    // Maintenance ON
            hasError: hasActiveError              // Based on errorCode field
          };
          
          // Check if state changed
          const stateChanged = 
            currentState.isWorking !== newState.isWorking ||
            currentState.isMaintenance !== newState.isMaintenance ||
            currentState.hasError !== newState.hasError;
          
          if (stateChanged) {
            // Calculate time spent in previous state
            const stateEndTime = new Date(log.timestamp);
            const timeInPreviousState = (stateEndTime - stateStartTime) / (1000 * 60 * 60); // Convert to hours
            
            // Add time to appropriate categories
            if (currentState.isWorking) workingHours += timeInPreviousState;
            if (currentState.isMaintenance) maintenanceHours += timeInPreviousState;
            if (currentState.hasError) errorHours += timeInPreviousState;
            
            // Update state and start time
            currentState = { ...newState };
            stateStartTime = stateEndTime;
          }
        }
      }
      
                // Step 3: Calculate time for the final state (until end of period OR current time)
                const currentTime = new Date();
                const queryEndTime = end ? new Date(end) : currentTime;
                const finalEndTime = new Date(Math.min(
                  periodEnd.getTime(), 
                  currentTime.getTime(),
                  queryEndTime.getTime()
                ));
      const timeInFinalState = (finalEndTime - stateStartTime) / (1000 * 60 * 60);
      
      // Only add time if it's positive (not in the future)
      if (timeInFinalState > 0) {
        if (currentState.isWorking) workingHours += timeInFinalState;
        if (currentState.isMaintenance) maintenanceHours += timeInFinalState;
        if (currentState.hasError) errorHours += timeInFinalState;
      }
      
                // ✅ Carry over final state to next period
                carryOverState = { ...currentState };
                
                results.push({
                  date: bucket.label,
                  workingHours: Math.round(workingHours * 100) / 100,
                  maintenanceHours: Math.round(maintenanceHours * 100) / 100,
                  errorHours: Math.round(errorHours * 100) / 100,
                  totalHours: Math.round((workingHours + maintenanceHours + errorHours) * 100) / 100,
                  logCount: groupLogs.length
                });
    }

    // Sort results by date
    results.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log(`🔍 [DEBUG] Final results for 30-day fix:`, results.map(r => ({
      date: r.date,
      workingHours: r.workingHours,
      maintenanceHours: r.maintenanceHours,
      errorHours: r.errorHours
    })));
    
    res.json({
      granularity: finalGranularity,
      points: results,
      elevatorId: elevatorId,
      totalPoints: results.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching elevator timeseries stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch elevator timeseries data', 
      error: error.message 
    });
  }
});

// ✅ Temporary demo API — delete mount + backend/routes/demoLiveData.js + backend/services/demoLiveDataStore.js after demo
app.use('/api/demo', demoLiveDataRouter);

// ✅ Tracker Dashboard APIs (independent of Crane) — reads avlrecords via repository/mapper layer
app.use('/api/tracker', authenticateToken, trackerRoutes);

app.use(express.static(path.join(__dirname, "frontend/dist")));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});



app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Removed duplicate late sessions route (handled by EARLY route above)

// removed duplicate early sessions route

// ✅ EARLY SESSIONS API (must be before static and catch-all routes)
app.get('/api/crane/sessions', authenticateToken, async (req, res) => {
  try {
    const { cranes, months } = req.query;
    const { role, companyName } = req.user;

    console.log('🔍 [EARLY] User requesting crane sessions data:', { role, companyName, cranes, months });

    if (role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin or superadmin required.' });
    }

    const selectedCranes = cranes ? cranes.split(',') : [];
    const selectedMonths = months ? months.split(',') : [];

    if (selectedCranes.length === 0) {
      return res.status(400).json({ message: 'No cranes selected' });
    }

    // Build company filter consistent with overview route
    const companyFilter = (role !== 'superadmin') ? { craneCompany: companyName } : {};

    const craneLogs = await CraneLog.find({
      ...companyFilter,
      DeviceID: { $in: selectedCranes }
    }).sort({ Timestamp: 1 });

    if (craneLogs.length === 0) {
      return res.json({ success: true, sessions: [], message: 'No crane logs found for selected cranes' });
    }

    const sessionsData = generateSessionsData(craneLogs, selectedCranes);

    res.json({ success: true, sessions: sessionsData, totalSessions: sessionsData.length, selectedCranes, selectedMonths });
  } catch (error) {
    console.error('❌ [EARLY] Error fetching crane sessions:', error);
    res.status(500).json({ message: 'Failed to fetch crane sessions data', error: error.message });
  }
});

// ✅ GET: Flexible time-series stats for line chart (daily/weekly/monthly)
// (Removed unreachable duplicate /api/crane/timeseries-stats route that was below catch-all)

// ✅ HELPER FUNCTION: Safely extract date parts from timestamps (Date objects or strings)
function safeExtractTimestampParts(timestamp) {
  try {
    if (timestamp instanceof Date) {
      // Handle Date object
      const day = timestamp.getDate().toString().padStart(2, '0');
      const month = (timestamp.getMonth() + 1).toString().padStart(2, '0');
      const year = timestamp.getFullYear();
      const hours = timestamp.getHours().toString().padStart(2, '0');
      const minutes = timestamp.getMinutes().toString().padStart(2, '0');
      const seconds = timestamp.getSeconds().toString().padStart(2, '0');
      
      return {
        datePart: `${day}/${month}/${year}`,
        timePart: `${hours}:${minutes}:${seconds}`,
        day, month, year, hours, minutes, seconds,
        isDateObject: true,
        originalTimestamp: timestamp
      };
    } else if (typeof timestamp === 'string') {
      // Handle legacy string format (DD/MM/YYYY HH:MM:SS)
      if (timestamp.includes(' ')) {
        const [datePart, timePart] = timestamp.split(' ');
        if (datePart.includes('/') && timePart.includes(':')) {
          const [day, month, year] = datePart.split('/').map(Number);
          const [hours, minutes, seconds] = timePart.split(':').map(Number);
          
          return {
            datePart, timePart,
            day, month, year, hours, minutes, seconds,
            isDateObject: false,
            originalTimestamp: timestamp
          };
        }
      }
      
      // Handle other string formats or invalid strings
      console.warn(`⚠️ Warning: Unexpected timestamp format: ${timestamp}`);
      return null;
    } else {
      console.warn(`⚠️ Warning: Unexpected timestamp type: ${typeof timestamp}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error extracting timestamp parts:`, error);
    return null;
  }
}
