const mongoose = require('mongoose');

const simulatorDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  // ✅ Crane: required. Elevator: not used (can be 0,0)
  latitude: {
    type: Number,
    required: false,
    min: -90,
    max: 90,
    default: 0
  },
  longitude: {
    type: Number,
    required: false,
    min: -180,
    max: 180,
    default: 0
  },
  // ✅ 'crane' | 'elevator' | 'energyMeter' | 'gpsTracker'
  deviceType: {
    type: String,
    enum: ['crane', 'elevator', 'energyMeter', 'gpsTracker'],
    default: 'crane'
  },
  // ✅ Elevator only: display location string (e.g. "Building A Lobby")
  location: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    enum: ['working', 'idle', 'maintenance'],
    default: 'idle'
  },
  frequencyMinutes: {
    type: Number,
    enum: [1, 2, 5, 10, 15, 30],
    default: 1
  },
  padTimestamp: {
    type: Boolean,
    default: false
  },
  jitter: {
    type: Boolean,
    default: false
  },
  // ✅ Crane only: profile A or B for state mapping
  profile: {
    type: String,
    enum: ['A', 'B'],
    default: 'A'
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  // ✅ Elevator only: current floor for cycling 0..24 (updated each tick)
  elevatorCurrentFloor: {
    type: Number,
    min: 0,
    max: 24,
    default: 0
  },
  // ✅ Elevator only: live override for demo – if set, next tick uses these instead of computed
  overrideReg65: { type: Number, default: null },
  overrideReg66: { type: Number, default: null },
  overrideErrorCode: { type: String, trim: true, default: null },

  // ✅ Energy meter only
  machineProfile: {
    type: String,
    enum: ['warehouse', 'cnc', 'compressor', 'conveyor'],
    default: 'warehouse',
  },
  siteName: { type: String, trim: true, default: '' },
  plantName: { type: String, trim: true, default: '' },
  machineName: { type: String, trim: true, default: '' },
  energyBaseReading: { type: Number, default: null },
  intervalSeconds: {
    type: Number,
    enum: [30, 60, 120, 180, 300],
    default: 60,
  },
  // Room-aware industrial simulator
  energySimMode: {
    type: String,
    enum: ['room', 'single'],
    default: 'single',
  },
  roomType: {
    type: String,
    enum: ['office', 'warehouse', 'manufacturing', 'retail'],
    default: 'office',
  },
  scheduleTimezone: { type: String, default: 'Asia/Kolkata' },
  appliances: [{
    type: { type: String, required: true },
    count: { type: Number, min: 1, default: 1 },
    ratedKwOverride: { type: Number, default: null },
    stateDistribution: {
      running: { type: Number, default: 80 },
      idle: { type: Number, default: 15 },
      stopped: { type: Number, default: 5 },
      maintenance: { type: Number, default: 0 },
    },
  }],
  singleApplianceType: { type: String, default: 'ac_split' },
  singleApplianceRatedKwOverride: { type: Number, default: null },
  singleStateDistribution: {
    running: { type: Number, default: 80 },
    idle: { type: Number, default: 15 },
    stopped: { type: Number, default: 5 },
    maintenance: { type: Number, default: 0 },
  },
  occupancyPercent: { type: Number, min: 0, max: 100, default: 100 },
  minVoltage: { type: Number, default: 220 },
  maxVoltage: { type: Number, default: 240 },

  // Alarm test live override (energy meter only)
  energyReadingOverride: {
    enabled: { type: Boolean, default: false },
    readings: {
      voltage: { type: Number, default: null },
      current: { type: Number, default: null },
      activePower: { type: Number, default: null },
      energy: { type: Number, default: null },
      powerFactor: { type: Number, default: null },
      frequency: { type: Number, default: null },
    },
    durationMinutes: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    breachMode: { type: String, enum: ['standard', 'aggressive'], default: 'standard' },
    sourceRuleIds: [{ type: mongoose.Schema.Types.ObjectId }],
    label: { type: String, default: '' },
  },

  // ---------- Fleet GPS Tracker simulator ----------
  companyName: { type: String, trim: true, default: '' },
  imei: { type: String, trim: true, default: '' },
  displayName: { type: String, trim: true, default: '' },
  deviceModel: {
    type: String,
    enum: ['FMB920', 'FMB125'],
    default: 'FMB920',
  },
  vehicleClass: {
    type: String,
    enum: ['car', 'truck', 'van', 'motorcycle', 'serviceVehicle', 'forklift'],
    default: 'car',
  },
  behaviourProfile: {
    type: String,
    enum: ['delivery', 'sales', 'taxi', 'serviceEngineer', 'patrol', 'shuttle', 'custom'],
    default: 'delivery',
  },
  routeType: {
    type: String,
    enum: ['circular', 'aToBReturn', 'multiStop', 'custom'],
    default: 'multiStop',
  },
  waypoints: [{
    id: { type: String },
    name: { type: String, default: '' },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    stopDurationMinutes: { type: Number, default: 10 },
    placeQuery: { type: String, default: '' },
  }],
  routeLibraryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  speedProfile: {
    type: String,
    enum: ['slow', 'city', 'highway', 'random'],
    default: 'city',
  },
  workStart: { type: String, default: '08:30' },
  workEnd: { type: String, default: '17:30' },
  lunchStart: { type: String, default: '13:00' },
  lunchMinutes: { type: Number, default: 45 },
  defaultStopMinutes: { type: Number, default: 15 },
  timezone: { type: String, default: 'Asia/Kolkata' },
  // GPS tick uses intervalSeconds (30/60/120); energy already has this field
  odometerMeters: { type: Number, default: 0 },
  seedDays: { type: Number, default: 0 },
  seedCompleted: { type: Boolean, default: false },
  // Runtime progress (persisted each tick)
  fleetState: {
    type: String,
    enum: [
      'OFFLINE',
      'ENGINE_ON',
      'MOVING',
      'ARRIVED',
      'IDLE',
      'PARKED',
      'RETURN_HOME',
    ],
    default: 'OFFLINE',
  },
  stateEnteredAt: { type: Date, default: null },
  currentWaypointIndex: { type: Number, default: 0 },
  segmentProgress: { type: Number, default: 0 },
  currentLat: { type: Number, default: null },
  currentLon: { type: Number, default: null },
  currentSpeedKmh: { type: Number, default: 0 },
  tripDistanceMeters: { type: Number, default: 0 },
  tripId: { type: String, default: '' },
  overrideState: { type: String, default: null },
  overrideTicksLeft: { type: Number, default: 0 },
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for faster queries
simulatorDeviceSchema.index({ deviceId: 1 });
simulatorDeviceSchema.index({ isRunning: 1 });
simulatorDeviceSchema.index({ deviceType: 1 });

module.exports = mongoose.model('SimulatorDevice', simulatorDeviceSchema);
