const mongoose = require('mongoose');

const ioElementSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    valueSize: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * One document ≈ one Teltonika AVL record (Codec 8).
 * Normalized: references Device; does not denormalize companyName/uid/deviceId.
 */
const avlRecordSchema = new mongoose.Schema(
  {
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
      index: true,
    },
    // Hardware identity from the wire (useful without a join while debugging)
    imei: {
      type: String,
      required: true,
      index: true,
    },
    codecId: { type: Number, required: true },
    priority: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    longitude: { type: Number, required: true },
    latitude: { type: Number, required: true },
    altitude: { type: Number, required: true },
    angle: { type: Number, required: true },
    satellites: { type: Number, required: true },
    speed: { type: Number, required: true },
    eventIoId: { type: Number, default: 0 },
    ioElements: { type: [ioElementSchema], default: [] },
    crcValid: { type: Boolean, default: true },
    receivedAt: { type: Date, default: Date.now },
    rawHex: { type: String, default: undefined },
    // ✅ Optional: 'simulator' for Fleet Behaviour Simulator writes; real Teltonika omits
    source: {
      type: String,
      enum: ['simulator', 'device'],
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: 'avlrecords',
  }
);

avlRecordSchema.index({ device: 1, timestamp: -1 });
avlRecordSchema.index({ imei: 1, timestamp: -1 });

module.exports = mongoose.model('AvlRecord', avlRecordSchema);
