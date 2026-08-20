const mongoose = require('mongoose');

const companyDashboardAccessSchema = new mongoose.Schema({
  companyName: { 
    type: String, 
    required: true, 
    unique: true 
  },
  dashboardAccess: {
    home: { type: Boolean, default: true },
    trackerOverview: { type: Boolean, default: false },
    craneOverview: { type: Boolean, default: false },
    elevatorOverview: { type: Boolean, default: false },
    energyOverview: { type: Boolean, default: false },
    fleetAlarms: { type: Boolean, default: false },
    craneDashboard: { type: Boolean, default: false },
    addUsers: { type: Boolean, default: true },
    addDevices: { type: Boolean, default: true },
    subscription: { type: Boolean, default: true },
    settings: { type: Boolean, default: true }
  },
  energySettings: {
    viewMode: {
      type: String,
      enum: ['all', 'real_only', 'simulator_only'],
      default: 'all',
    },
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  },
  updatedBy: { 
    type: String, 
    default: 'superadmin' 
  }
}, { timestamps: true });

module.exports = mongoose.model('CompanyDashboardAccess', companyDashboardAccessSchema); 