const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
  },
  uid: {
    type: String,
    required: true,
    unique: true, // prevents duplicate UID
  },
  deviceId: {
    type: String,
    required: true,
  },
  // ✅ Category slug (UI: gpsTracker → "Fleet Tracker")
  deviceType: {
    type: String,
    required: true,
  },
  // ✅ Hardware model within a category (e.g. FMB920 for Fleet Tracker)
  deviceModel: {
    type: String,
    trim: true,
    set: (v) => (v === '' || v == null ? undefined : String(v).trim()),
  },
  // ✅ Generic human-facing name (Fleet Tracker form label: "Vehicle Name")
  displayName: {
    type: String,
    trim: true,
    set: (v) => (v === '' || v == null ? undefined : String(v).trim()),
  },
  // ✅ Optional: elevator devices can belong to one zone (ElevatorZone)
  elevatorZoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ElevatorZone',
    default: null,
  },

  // ✅ Optional: energy meter context (deviceType === "energyMeter")
  siteName: { type: String, default: '' },
  plantName: { type: String, default: '' },
  machineName: { type: String, default: '' },
  location: { type: String, default: '' },
  phaseType: { type: String, enum: ['single', 'three'], default: 'single' },

  // ✅ Optional hardware IMEI for Teltonika / Fleet Trackers (separate from deviceId)
  // Required only for deviceType === "gpsTracker" (enforced in API). Sparse unique for others.
  imei: {
    type: String,
    trim: true,
    set: (v) => (v === '' || v == null ? undefined : String(v).trim()),
    validate: {
      validator(v) {
        if (v == null || v === '') return true;
        return /^\d{15,16}$/.test(v);
      },
      message: 'IMEI must be 15 or 16 digits',
    },
  },

  // ✅ Fleet sim vs real hardware (sim upsert sets 'simulator'; real Manage Devices leave unset)
  dataOrigin: {
    type: String,
    enum: ['simulator'],
    default: undefined,
  },

  // ✅ Fleet Analytics — cumulative lifetime engine-ON (incremented by rollup / incremental day stats)
  totalEngineMs: { type: Number, default: 0 },
  engineMsUpdatedAt: { type: Date, default: null },
  // ✅ Last GPS ping — Fleet Monitor / Fleet Map live-locations (no AVL collection scan)
  lastLiveAt: { type: Date, default: null },
  lastLatitude: { type: Number, default: null },
  lastLongitude: { type: Number, default: null },
  lastSpeed: { type: Number, default: 0 },
  lastHeading: { type: Number, default: 0 },
  lastIgnition: { type: Boolean, default: false },
  lastMovement: { type: Boolean, default: false },
  lastStatus: { type: String, default: null },
  // ✅ Per-vehicle expected workload for utilization %
  expectedDailyHours: { type: Number, default: 10, min: 0.5, max: 24 },
  // ✅ Multi-strategy maintenance schedules (engineHours | distanceKm | calendar)
  maintenanceSchedules: {
    type: [
      {
        label: { type: String, required: true, trim: true },
        strategy: {
          type: String,
          enum: ['engineHours', 'distanceKm', 'calendar'],
          required: true,
        },
        intervalValue: { type: Number, required: true, min: 0 },
        lastDoneAt: { type: Date, default: null },
        lastDoneEngineMs: { type: Number, default: 0 },
        lastDoneOdometerKm: { type: Number, default: 0 },
        active: { type: Boolean, default: true },
      },
    ],
    default: [],
  },
}, { timestamps: true });

deviceSchema.index(
  { imei: 1 },
  {
    unique: true,
    sparse: true,
  }
);

deviceSchema.index({ companyName: 1, deviceType: 1 });

module.exports = mongoose.model('Device', deviceSchema);
