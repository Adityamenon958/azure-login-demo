const mongoose = require('mongoose');

/**
 * Multi-level fleet analytics rollup — one doc per device per period.
 * granularity: day | month | year
 * periodKey: "YYYY-MM-DD" | "YYYY-MM" | "YYYY"
 */
const driverSchema = new mongoose.Schema(
  {
    harshBrakingCount: { type: Number, default: null },
    rapidAccelCount: { type: Number, default: null },
    overspeedCount: { type: Number, default: null },
    nightDrivingMs: { type: Number, default: null },
    tripEfficiency: { type: Number, default: null },
  },
  { _id: false }
);

const fuelSchema = new mongoose.Schema(
  {
    consumedL: { type: Number, default: null },
    efficiencyKmPerL: { type: Number, default: null },
    costEstimate: { type: Number, default: null },
  },
  { _id: false }
);

const trackerStatSchema = new mongoose.Schema(
  {
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },
    deviceId: { type: String, required: true, index: true },
    companyName: { type: String, required: true },
    granularity: {
      type: String,
      enum: ['day', 'month', 'year'],
      required: true,
    },
    periodKey: { type: String, required: true },
    periodStart: { type: Date, required: true },

    // ✅ Four duration metrics kept separate (Working Hours ≠ Engine ON)
    engineOnMs: { type: Number, default: 0 },
    engineOffMs: { type: Number, default: 0 },
    movingMs: { type: Number, default: 0 },
    idleMs: { type: Number, default: 0 },
    parkedMs: { type: Number, default: 0 },

    distanceKm: { type: Number, default: 0 },
    distanceSource: {
      type: String,
      enum: ['odometer', 'haversine', 'mixed', 'none'],
      default: 'none',
    },
    odometerEndKm: { type: Number, default: null },

    avgSpeedKmh: { type: Number, default: 0 },
    maxSpeedKmh: { type: Number, default: 0 },

    tripCount: { type: Number, default: 0 },
    stopCount: { type: Number, default: 0 },
    longestDriveMs: { type: Number, default: 0 },
    longestIdleMs: { type: Number, default: 0 },

    pointCount: { type: Number, default: 0 },
    gpsGapMs: { type: Number, default: 0 },
    firstFixAt: { type: Date, default: null },
    lastFixAt: { type: Date, default: null },
    // month/year only — count of days with any points
    activeDays: { type: Number, default: null },

    // ✅ Today live chart — IST hour buckets (max ~24). Not used on month/year.
    hourlyBuckets: {
      type: [
        {
          periodKey: { type: String, required: true },
          periodStart: { type: Date, required: true },
          engineOnMs: { type: Number, default: 0 },
          movingMs: { type: Number, default: 0 },
          idleMs: { type: Number, default: 0 },
          parkedMs: { type: Number, default: 0 },
          distanceKm: { type: Number, default: 0 },
          granularity: { type: String, default: 'hour' },
          _id: false,
        },
      ],
      default: undefined,
    },

    // ✅ Incremental processor cursor (day docs only). processedTs = idempotency watermark.
    cursor: {
      type: {
        processedTs: { type: Date, default: null },
        ts: { type: Date, default: null },
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
        speed: { type: Number, default: 0 },
        ignition: { type: Boolean, default: false },
        movement: { type: Boolean, default: false },
        moving: { type: Boolean, default: false },
        totalOdometer: { type: Number, default: null },
        firstOdometer: { type: Number, default: null },
        haversineM: { type: Number, default: 0 },
        stopArrivedTs: { type: Number, default: null },
        stopLastTs: { type: Number, default: null },
        stopSumLat: { type: Number, default: 0 },
        stopSumLon: { type: Number, default: 0 },
        stopN: { type: Number, default: 0 },
        stopIgnitionOn: { type: Number, default: 0 },
        stopCommittedMs: { type: Number, default: 0 },
        stopKind: { type: String, default: null },
        tripStartTs: { type: Number, default: null },
        tripDistM: { type: Number, default: 0 },
        tripCounted: { type: Boolean, default: false },
        driveStartTs: { type: Number, default: null },
      },
      default: undefined,
      _id: false,
    },

    // ✅ Reserved for future expansion (null until implemented)
    driver: { type: driverSchema, default: undefined },
    fuel: { type: fuelSchema, default: undefined },

    computedAt: { type: Date, default: Date.now },
    engineVersion: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'trackerstats' }
);

trackerStatSchema.index(
  { device: 1, granularity: 1, periodKey: 1 },
  { unique: true }
);
trackerStatSchema.index({ device: 1, granularity: 1, periodStart: -1 });
trackerStatSchema.index({ companyName: 1, granularity: 1, periodStart: -1 });

module.exports = mongoose.model('TrackerStat', trackerStatSchema);
