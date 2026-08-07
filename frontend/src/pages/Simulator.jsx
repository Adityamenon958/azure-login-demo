import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Alert,
  Spinner,
  Badge,
  Modal,
} from 'react-bootstrap';
import EnergySimForm, {
  EnergySimPayloadPreview,
  buildEnergyPreviewBody,
  buildEnergyAddPayload,
} from '../components/simulator/EnergySimForm';
import GpsTrackerSimForm, {
  DEFAULT_GPS_FORM,
  buildGpsAddPayload,
  buildGpsPreviewBody,
  deviceToGpsForm,
} from '../components/simulator/GpsTrackerSimForm';
import EnergyAlarmTestModal from '../components/simulator/EnergyAlarmTestModal';
import EnergyActiveOverridesPanel from '../components/simulator/EnergyActiveOverridesPanel';
import {
  Play,
  Square,
  Plus,
  RefreshCw,
  Edit3,
  Trash2,
  MapPin,
  Clock,
  Settings,
  Activity,
  Building2,
  ArrowUpDown,
  Sliders,
  Zap,
  Send,
  Bell,
  Truck,
} from 'lucide-react';
import axios from 'axios';
import styles from './Simulator.module.css';

// ✅ Default form values
const defaultCraneForm = {
  craneCompany: 'Gsn Soln',
  DeviceID: '',
  latitude: '19.045980',
  longitude: '73.027397',
  state: 'working',
  frequencyMinutes: 1,
  padTimestamp: true,
  profile: 'A',
  jitter: false,
};

const defaultElevatorForm = {
  elevatorCompany: 'Gsn Soln',
  DeviceID: '',
  location: 'Building A – Lobby',
  state: 'working',
  frequencyMinutes: 1,
};

const defaultEnergyForm = {
  DeviceID: '',
  state: 'working',
  intervalSeconds: 60,
  jitter: true,
  energyBaseReading: 0,
  energySimMode: 'single',
  roomType: 'office',
  appliances: [],
  singleApplianceType: 'ac_split',
  singleApplianceRatedKwOverride: '',
  occupancyPercent: 100,
  minVoltage: 220,
  maxVoltage: 240,
};

export default function Simulator() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showAddCraneModal, setShowAddCraneModal] = useState(false);
  const [showAddElevatorModal, setShowAddElevatorModal] = useState(false);
  const [showAddEnergyModal, setShowAddEnergyModal] = useState(false);
  const [showAddGpsModal, setShowAddGpsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideDevice, setOverrideDevice] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    overrideReg65: '',
    overrideReg66: '',
    overrideErrorCode: '',
    useComputed: false,
    reg66Preset: 'auto', // 'auto' | 'normal' | 'maintenance' | 'outOfService' | 'custom'
  });
  const [savingOverride, setSavingOverride] = useState(false);

  const [craneFormData, setCraneFormData] = useState(defaultCraneForm);
  const [elevatorFormData, setElevatorFormData] = useState(defaultElevatorForm);
  const [energyFormData, setEnergyFormData] = useState(defaultEnergyForm);
  const [gpsFormData, setGpsFormData] = useState({ ...DEFAULT_GPS_FORM });
  const [editFormData, setEditFormData] = useState({ ...defaultCraneForm });
  const [previewPayload, setPreviewPayload] = useState(null);
  const [gpsPreview, setGpsPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingDevice, setSendingDevice] = useState('');

  const [addingDevice, setAddingDevice] = useState(false);
  const [startingDevice, setStartingDevice] = useState('');
  const [stoppingDevice, setStoppingDevice] = useState('');
  const [updatingDevice, setUpdatingDevice] = useState('');
  const [energyCatalog, setEnergyCatalog] = useState(null);
  const [gpsCatalog, setGpsCatalog] = useState(null);
  const [alarmTestDeviceId, setAlarmTestDeviceId] = useState(null);
  const [overridesRefreshKey, setOverridesRefreshKey] = useState(0);

  const craneDevices = useMemo(() => devices.filter((d) => (d.deviceType || 'crane') === 'crane'), [devices]);
  const elevatorDevices = useMemo(() => devices.filter((d) => d.deviceType === 'elevator'), [devices]);
  const energyDevices = useMemo(() => devices.filter((d) => d.deviceType === 'energyMeter'), [devices]);
  const gpsDevices = useMemo(() => devices.filter((d) => d.deviceType === 'gpsTracker'), [devices]);

  useEffect(() => {
    fetchDevices();
    axios.get('/api/sim/energy-catalog', { withCredentials: true })
      .then((res) => setEnergyCatalog(res.data))
      .catch((err) => console.error('Energy catalog fetch failed:', err));
    axios.get('/api/sim/gps-catalog', { withCredentials: true })
      .then((res) => setGpsCatalog(res.data))
      .catch((err) => console.error('GPS catalog fetch failed:', err));
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get('/api/sim/list', { withCredentials: true });
      setDevices(response.data.devices || []);
    } catch (err) {
      console.error('❌ Failed to fetch devices:', err);
      setError('Failed to fetch devices. Make sure you have superadmin access.');
    } finally {
      setLoading(false);
    }
  };

  const handleCraneInput = (e) => {
    const { name, value, type, checked } = e.target;
    setCraneFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  const handleElevatorInput = (e) => {
    const { name, value, type, checked } = e.target;
    setElevatorFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleEnergyInput = (nextForm) => {
    setEnergyFormData(nextForm);
  };

  const handleEnergyEditInput = (nextForm) => {
    setEditFormData(nextForm);
  };

  const handleGpsInput = (nextForm) => {
    setGpsFormData(nextForm);
  };

  const handleGpsEditInput = (nextForm) => {
    setEditFormData(nextForm);
  };

  const fetchPayloadPreview = async (source) => {
    try {
      setPreviewLoading(true);
      const res = await axios.post('/api/sim/preview-payload', source, { withCredentials: true });
      if (source.deviceType === 'gpsTracker' || source.previewType === 'gpsTracker' || res.data?.deviceType === 'gpsTracker') {
        setGpsPreview(res.data);
      } else {
        setPreviewPayload(res.data);
      }
    } catch (err) {
      console.error('Preview failed:', err);
      if (source.deviceType === 'gpsTracker' || source.previewType === 'gpsTracker') {
        setGpsPreview(null);
      } else {
        setPreviewPayload(null);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!showAddEnergyModal) return undefined;
    const timer = setTimeout(() => {
      fetchPayloadPreview(buildEnergyPreviewBody(energyFormData));
    }, 350);
    return () => clearTimeout(timer);
  }, [showAddEnergyModal, energyFormData]);

  useEffect(() => {
    if (!showAddGpsModal) return undefined;
    const timer = setTimeout(() => {
      fetchPayloadPreview(buildGpsPreviewBody(gpsFormData));
    }, 400);
    return () => clearTimeout(timer);
  }, [showAddGpsModal, gpsFormData]);

  useEffect(() => {
    if (!showEditModal || editingDevice?.deviceType !== 'energyMeter') return undefined;
    const timer = setTimeout(() => {
      fetchPayloadPreview(buildEnergyPreviewBody(editFormData, editingDevice.DeviceID));
    }, 350);
    return () => clearTimeout(timer);
  }, [showEditModal, editingDevice, editFormData]);

  useEffect(() => {
    if (!showEditModal || editingDevice?.deviceType !== 'gpsTracker') return undefined;
    const timer = setTimeout(() => {
      fetchPayloadPreview(buildGpsPreviewBody(editFormData));
    }, 400);
    return () => clearTimeout(timer);
  }, [showEditModal, editingDevice, editFormData]);

  const handleEditInput = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAddCrane = async () => {
    try {
      setAddingDevice(true);
      setError('');
      const response = await axios.post('/api/sim/add', craneFormData, { withCredentials: true });
      if (response.data.success) {
        setSuccess(`Crane ${craneFormData.DeviceID} added successfully!`);
        setShowAddCraneModal(false);
        setCraneFormData(defaultCraneForm);
        fetchDevices();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add crane');
    } finally {
      setAddingDevice(false);
    }
  };

  const handleAddElevator = async () => {
    try {
      setAddingDevice(true);
      setError('');
      const payload = {
        deviceType: 'elevator',
        elevatorCompany: elevatorFormData.elevatorCompany,
        DeviceID: elevatorFormData.DeviceID,
        location: elevatorFormData.location,
        state: elevatorFormData.state,
        frequencyMinutes: Number(elevatorFormData.frequencyMinutes),
      };
      const response = await axios.post('/api/sim/add', payload, { withCredentials: true });
      if (response.data.success) {
        setSuccess(`Elevator ${elevatorFormData.DeviceID} added successfully!`);
        setShowAddElevatorModal(false);
        setElevatorFormData(defaultElevatorForm);
        fetchDevices();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add elevator');
    } finally {
      setAddingDevice(false);
    }
  };

  const handleAddEnergy = async () => {
    try {
      setAddingDevice(true);
      setError('');
      const payload = buildEnergyAddPayload(energyFormData);
      const response = await axios.post('/api/sim/add', payload, { withCredentials: true });
      if (response.data.success) {
        setSuccess(`Energy meter ${energyFormData.DeviceID} added successfully!`);
        setShowAddEnergyModal(false);
        setEnergyFormData(defaultEnergyForm);
        setPreviewPayload(null);
        fetchDevices();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add energy meter');
    } finally {
      setAddingDevice(false);
    }
  };

  const handleAddGps = async () => {
    try {
      setAddingDevice(true);
      setError('');
      const payload = buildGpsAddPayload(gpsFormData);
      const response = await axios.post('/api/sim/add', payload, { withCredentials: true });
      if (response.data.success) {
        setSuccess(`Fleet vehicle ${gpsFormData.DeviceID} added (Device + simulator). Start it to emit AVL.`);
        setShowAddGpsModal(false);
        setGpsFormData({ ...DEFAULT_GPS_FORM });
        setGpsPreview(null);
        fetchDevices();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add fleet vehicle');
    } finally {
      setAddingDevice(false);
    }
  };

  const handleManualSend = async (deviceId) => {
    try {
      setSendingDevice(deviceId);
      setError('');
      const res = await axios.post('/api/sim/send', { DeviceID: deviceId }, { withCredentials: true });
      setSuccess(res.data.message || `Sent payload for ${deviceId}`);
      await fetchPayloadPreview({ DeviceID: deviceId });
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Manual send failed');
    } finally {
      setSendingDevice('');
    }
  };

  const handleStartDevice = async (deviceId) => {
    try {
      setStartingDevice(deviceId);
      setError('');
      await axios.post('/api/sim/start', { DeviceID: deviceId }, { withCredentials: true });
      setSuccess(`Device ${deviceId} started`);
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start');
    } finally {
      setStartingDevice('');
    }
  };

  const handleStopDevice = async (deviceId) => {
    if (!window.confirm(`Stop simulator for ${deviceId}? It will show as offline on the dashboard until you start it again.`)) {
      return;
    }
    try {
      setStoppingDevice(deviceId);
      setError('');
      await axios.post('/api/sim/stop', { DeviceID: deviceId }, { withCredentials: true });
      setSuccess(`Device ${deviceId} stopped`);
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to stop');
    } finally {
      setStoppingDevice('');
    }
  };

  const handleEditDevice = (device) => {
    setEditingDevice(device);
    const isElevator = device.deviceType === 'elevator';
    const isEnergy = device.deviceType === 'energyMeter';
    const isGps = device.deviceType === 'gpsTracker';
    if (isGps) {
      setEditFormData(deviceToGpsForm(device));
      fetchPayloadPreview(buildGpsPreviewBody(deviceToGpsForm(device)));
    } else if (isEnergy) {
      setEditFormData({
        DeviceID: device.DeviceID,
        state: device.state,
        intervalSeconds: device.intervalSeconds || 60,
        jitter: device.jitter,
        energyBaseReading: device.energyBaseReading ?? 0,
        energySimMode: device.energySimMode || 'single',
        roomType: device.roomType || 'office',
        appliances: (device.appliances || []).map((row) => ({
          type: row.type,
          count: row.count,
          ratedKwOverride: row.ratedKwOverride ?? '',
        })),
        singleApplianceType: device.singleApplianceType || 'ac_split',
        singleApplianceRatedKwOverride: device.singleApplianceRatedKwOverride ?? '',
        occupancyPercent: device.occupancyPercent ?? 100,
        minVoltage: device.minVoltage ?? 220,
        maxVoltage: device.maxVoltage ?? 240,
      });
      fetchPayloadPreview(buildEnergyPreviewBody({
        ...device,
        energyBaseReading: device.energyBaseReading ?? 0,
      }, device.DeviceID));
    } else if (isElevator) {
      setEditFormData({
        elevatorCompany: device.craneCompany || device.name,
        DeviceID: device.DeviceID,
        location: device.location || '',
        state: device.state,
        frequencyMinutes: device.frequencyMinutes,
      });
    } else {
      setEditFormData({
        craneCompany: device.craneCompany || device.name,
        DeviceID: device.DeviceID,
        latitude: (device.latitude != null ? device.latitude : 0).toString(),
        longitude: (device.longitude != null ? device.longitude : 0).toString(),
        state: device.state,
        frequencyMinutes: device.frequencyMinutes,
        padTimestamp: device.padTimestamp,
        profile: device.profile || 'A',
        jitter: device.jitter,
      });
    }
    setShowEditModal(true);
  };

  const handleUpdateDevice = async () => {
    if (!editingDevice) return;
    try {
      setUpdatingDevice(editingDevice.DeviceID);
      setError('');
      const isElevator = editingDevice.deviceType === 'elevator';
      const isEnergy = editingDevice.deviceType === 'energyMeter';
      const isGps = editingDevice.deviceType === 'gpsTracker';
      const payload = {
        DeviceID: editingDevice.DeviceID,
        ...(isGps
          ? buildGpsAddPayload({ ...editFormData, DeviceID: editingDevice.DeviceID })
          : isEnergy
          ? buildEnergyAddPayload({ ...editFormData, DeviceID: editingDevice.DeviceID })
          : isElevator
          ? {
              elevatorCompany: editFormData.elevatorCompany,
              location: editFormData.location,
              state: editFormData.state,
              frequencyMinutes: Number(editFormData.frequencyMinutes),
            }
          : {
              craneCompany: editFormData.craneCompany,
              latitude: editFormData.latitude,
              longitude: editFormData.longitude,
              state: editFormData.state,
              frequencyMinutes: Number(editFormData.frequencyMinutes),
              padTimestamp: editFormData.padTimestamp,
              profile: editFormData.profile,
              jitter: editFormData.jitter,
            }),
      };
      await axios.post('/api/sim/update', payload, { withCredentials: true });
      setSuccess(`Device ${editingDevice.DeviceID} updated`);
      setShowEditModal(false);
      setEditingDevice(null);
      setGpsPreview(null);
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally {
      setUpdatingDevice('');
    }
  };

  const handleRemoveDevice = async (deviceId) => {
    if (!window.confirm(`Remove device ${deviceId}?`)) return;
    try {
      setError('');
      await axios.delete(`/api/sim/remove/${deviceId}`, { withCredentials: true });
      setSuccess(`Device ${deviceId} removed`);
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove');
    }
  };

  const handleOpenOverride = (device) => {
    setOverrideDevice(device);
    // Infer preset from existing overrideReg66 if present, else auto
    let reg66Preset = 'auto';
    if (device.overrideReg66 != null) {
      const val = Number(device.overrideReg66);
      // Match the same constants used in server.js buildElevatorPayload
      const normalVal = 4872;     // working: In Service + Comm Normal + Automatic + Normal Power
      const maintenanceVal = 1024; // maintenance: Maintenance ON
      const outOfServiceVal = 0;   // idle: all bits 0

      if (val === normalVal) {
        reg66Preset = 'normal';
      } else if (val === maintenanceVal) {
        reg66Preset = 'maintenance';
      } else if (val === outOfServiceVal) {
        reg66Preset = 'outOfService';
      } else {
        reg66Preset = 'custom';
      }
    }
    setOverrideForm({
      overrideReg65: device.overrideReg65 != null ? String(device.overrideReg65) : '',
      overrideReg66: device.overrideReg66 != null ? String(device.overrideReg66) : '',
      overrideErrorCode: device.overrideErrorCode || '',
      useComputed: false,
      reg66Preset,
    });
    setShowOverrideModal(true);
  };

  const handleOverrideInput = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'reg66Preset') {
      const preset = value;
      setOverrideForm((prev) => {
        // Map presets to concrete Reg66 values (or blank/auto)
        let nextOverrideReg66 = prev.overrideReg66;
        if (preset === 'auto') {
          nextOverrideReg66 = '';
        } else if (preset === 'normal') {
          // Normal: In Service + Comm Normal + Automatic + Normal Power
          // Use same constant as backend (server.js buildElevatorPayload)
          nextOverrideReg66 = String(4872);
        } else if (preset === 'maintenance') {
          // Maintenance: Maintenance ON
          nextOverrideReg66 = String(1024);
        } else if (preset === 'outOfService') {
          // Out of service: all bits 0
          nextOverrideReg66 = '0';
        } else if (preset === 'custom') {
          // Keep whatever user typed before
          nextOverrideReg66 = prev.overrideReg66;
        }
        return {
          ...prev,
          reg66Preset: preset,
          overrideReg66: nextOverrideReg66,
        };
      });
      return;
    }
    setOverrideForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSaveOverride = async () => {
    if (!overrideDevice) return;
    try {
      setSavingOverride(true);
      setError('');
      const payload = {
        DeviceID: overrideDevice.DeviceID,
        // If useComputed is true, clear all overrides
        overrideReg65: overrideForm.useComputed ? null : (overrideForm.overrideReg65 === '' ? null : overrideForm.overrideReg65),
        overrideReg66:
          overrideForm.useComputed || overrideForm.reg66Preset === 'auto'
            ? null
            : (overrideForm.overrideReg66 === '' ? null : overrideForm.overrideReg66),
        overrideErrorCode: overrideForm.useComputed ? null : (overrideForm.overrideErrorCode === '' ? null : overrideForm.overrideErrorCode),
      };
      await axios.post('/api/sim/elevator-override', payload, { withCredentials: true });
      setSuccess(`Live override updated for ${overrideDevice.DeviceID}. Next tick will use ${overrideForm.useComputed ? 'computed' : 'your'} values.`);
      setShowOverrideModal(false);
      setOverrideDevice(null);
      fetchDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save override');
    } finally {
      setSavingOverride(false);
    }
  };

  const getStatusBadge = (device) => {
    if (!device.isRunning) {
      return <Badge bg="secondary">Stopped</Badge>;
    }
    if (device.timerActive === false) {
      return <Badge bg="warning" text="dark">Recovering…</Badge>;
    }
    if (device.lastTickStatus === 'error') {
      return (
        <Badge bg="warning" text="dark" title={device.lastTickError || 'Last tick failed — still retrying'}>
          Running (retrying)
        </Badge>
      );
    }
    return <Badge bg="success">Running</Badge>;
  };

  const getEnergyStatusCell = (device) => (
    <div>
      {getStatusBadge(device)}
      {device.isRunning && device.lastTickStatus === 'error' && device.lastTickError && (
        <div className="text-warning small mt-1" title={device.lastTickError}>
          Last tick failed — retrying
        </div>
      )}
    </div>
  );

  const getStateBadge = (state) => {
    const v = { working: 'success', idle: 'info', maintenance: 'warning' };
    return <Badge bg={v[state] || 'secondary'}>{state}</Badge>;
  };

  const EnergyActionButtons = ({ device }) => (
    <div className="d-flex flex-wrap gap-1 align-items-center">
      <Button
        size="sm"
        variant="outline-warning"
        onClick={() => setAlarmTestDeviceId(device.DeviceID)}
        title="Test configured alarm rules"
      >
        <Bell size={16} className="me-1" />
        Test Alarms
      </Button>
      <Button
        size="sm"
        variant="outline-secondary"
        onClick={() => fetchPayloadPreview({ DeviceID: device.DeviceID })}
        title="Refresh payload preview"
      >
        Preview
      </Button>
      <Button
        size="sm"
        variant="outline-info"
        onClick={() => handleManualSend(device.DeviceID)}
        disabled={sendingDevice === device.DeviceID}
        title="Send one payload now"
      >
        {sendingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Send size={16} />}
      </Button>
      {device.isRunning ? (
        <Button size="sm" variant="warning" onClick={() => handleStopDevice(device.DeviceID)} disabled={stoppingDevice === device.DeviceID}>
          {stoppingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Square size={16} />}
        </Button>
      ) : (
        <Button size="sm" variant="success" onClick={() => handleStartDevice(device.DeviceID)} disabled={startingDevice === device.DeviceID} title="Stopped = offline meter">
          {startingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Play size={16} />}
        </Button>
      )}
      <Button size="sm" variant="outline-primary" onClick={() => handleEditDevice(device)}><Edit3 size={16} /></Button>
      <Button size="sm" variant="outline-danger" onClick={() => handleRemoveDevice(device.DeviceID)}><Trash2 size={16} /></Button>
    </div>
  );

  const PayloadPreviewBox = ({ payload }) => (
    <div className="mt-2">
      <small className="text-muted d-block mb-1">Live payload preview (as sent to POST /api/energy-meter/log)</small>
      <EnergySimPayloadPreview payload={payload} loading={previewLoading} />
    </div>
  );

  const ActionButtons = ({ device }) => (
    <div className="d-flex gap-1">
      {device.isRunning ? (
        <Button size="sm" variant="warning" onClick={() => handleStopDevice(device.DeviceID)} disabled={stoppingDevice === device.DeviceID}>
          {stoppingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Square size={16} />}
        </Button>
      ) : (
        <Button size="sm" variant="success" onClick={() => handleStartDevice(device.DeviceID)} disabled={startingDevice === device.DeviceID}>
          {startingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Play size={16} />}
        </Button>
      )}
      <Button size="sm" variant="outline-primary" onClick={() => handleEditDevice(device)}>
        <Edit3 size={16} />
      </Button>
      <Button size="sm" variant="outline-danger" onClick={() => handleRemoveDevice(device.DeviceID)}>
        <Trash2 size={16} />
      </Button>
    </div>
  );

  const ElevatorActionButtons = ({ device }) => (
    <div className="d-flex flex-wrap gap-1 align-items-center">
      <Button size="sm" variant="outline-info" onClick={() => handleOpenOverride(device)} title="Set Reg65, Reg66, Error code for next tick">
        <Sliders size={16} className="me-1" />
        Set values
      </Button>
      {device.isRunning ? (
        <Button size="sm" variant="warning" onClick={() => handleStopDevice(device.DeviceID)} disabled={stoppingDevice === device.DeviceID}>
          {stoppingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Square size={16} />}
        </Button>
      ) : (
        <Button size="sm" variant="success" onClick={() => handleStartDevice(device.DeviceID)} disabled={startingDevice === device.DeviceID}>
          {startingDevice === device.DeviceID ? <Spinner animation="border" size="sm" /> : <Play size={16} />}
        </Button>
      )}
      <Button size="sm" variant="outline-primary" onClick={() => handleEditDevice(device)}><Edit3 size={16} /></Button>
      <Button size="sm" variant="outline-danger" onClick={() => handleRemoveDevice(device.DeviceID)}><Trash2 size={16} /></Button>
    </div>
  );

  if (loading) {
    return (
      <Container fluid className="mt-4">
        <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
          <Spinner animation="border" variant="primary" />
        </div>
      </Container>
    );
  }

  return (
    <Container fluid className="mt-4">
      <Row className="mb-4 align-items-center">
        <Col>
          <h2 className="d-flex align-items-center mb-1">
            <Activity className="me-2" size={28} />
            Data Simulator
          </h2>
          <p className="text-muted mb-0">
            Generate simulated crane, elevator, energy meter, or fleet GPS data for testing.
          </p>
        </Col>
        <Col xs="auto">
          <div className={styles.headerActions}>
            <Button
              variant="outline-primary"
              className={styles.headerActionBtn}
              onClick={() => setShowAddCraneModal(true)}
            >
              <Plus size={18} className="me-1" />
              Add Crane
            </Button>
            <Button
              variant="primary"
              className={styles.headerActionBtn}
              onClick={() => setShowAddElevatorModal(true)}
            >
              <Plus size={18} className="me-1" />
              Add Elevator
            </Button>
            <Button
              variant="success"
              className={styles.headerActionBtn}
              onClick={() => setShowAddEnergyModal(true)}
            >
              <Zap size={18} className="me-1" />
              Add Energy Meter
            </Button>
            <Button
              variant="dark"
              className={styles.headerActionBtn}
              onClick={() => setShowAddGpsModal(true)}
            >
              <Truck size={18} className="me-1" />
              Add Fleet Vehicle
            </Button>
          </div>
        </Col>
      </Row>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ---------- Section 1: Crane Simulator ---------- */}
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 d-flex align-items-center">
            <ArrowUpDown size={20} className="me-2" />
            Crane Simulator
          </h5>
          <Button variant="outline-secondary" size="sm" onClick={fetchDevices}>
            <RefreshCw size={16} className="me-1" />
            Refresh
          </Button>
        </Card.Header>
        <Card.Body>
          {craneDevices.length === 0 ? (
            <p className="text-muted mb-0">No crane simulators. Click &quot;Add Crane&quot; to add one.</p>
          ) : (
            <Table responsive striped hover size="sm">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Company</th>
                  <th>Location (lat, long)</th>
                  <th>State</th>
                  <th>Frequency</th>
                  <th>Profile</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {craneDevices.map((device) => (
                  <tr key={device.DeviceID}>
                    <td><strong>{device.DeviceID}</strong></td>
                    <td>{device.craneCompany}</td>
                    <td>
                      <small><MapPin size={12} className="me-1" />
                        {(device.latitude != null ? device.latitude : 0).toFixed(6)}, {(device.longitude != null ? device.longitude : 0).toFixed(6)}
                      </small>
                    </td>
                    <td>{getStateBadge(device.state)}</td>
                    <td><Clock size={14} className="me-1" />{device.frequencyMinutes}m</td>
                    <td><Badge bg="outline-secondary">{device.profile || 'A'}</Badge></td>
                    <td>{getStatusBadge(device)}</td>
                    <td><ActionButtons device={device} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* ---------- Section 2: Elevator Simulator ---------- */}
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 d-flex align-items-center">
            <Building2 size={20} className="me-2" />
            Elevator Simulator
          </h5>
          <Button variant="outline-secondary" size="sm" onClick={fetchDevices}>
            <RefreshCw size={16} className="me-1" />
            Refresh
          </Button>
        </Card.Header>
        <Card.Body>
          {elevatorDevices.length === 0 ? (
            <p className="text-muted mb-0">No elevator simulators. Click &quot;Add Elevator&quot; to add one. Floor cycles 0→24 each tick; state is manual only.</p>
          ) : (
            <Table responsive striped hover size="sm">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>State</th>
                  <th>Frequency</th>
                  <th>Override</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {elevatorDevices.map((device) => (
                  <tr key={device.DeviceID}>
                    <td><strong>{device.DeviceID}</strong></td>
                    <td>{device.craneCompany}</td>
                    <td><small>{device.location || '–'}</small></td>
                    <td>{getStateBadge(device.state)}</td>
                    <td><Clock size={14} className="me-1" />{device.frequencyMinutes}m</td>
                    <td>
                      {(device.overrideReg65 != null || device.overrideReg66 != null || (device.overrideErrorCode && device.overrideErrorCode !== '000')) ? (
                        <Badge bg="info">Reg65/66/Err set</Badge>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td>{getStatusBadge(device)}</td>
                    <td><ElevatorActionButtons device={device} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* ---------- Active energy alarm overrides ---------- */}
      <EnergyActiveOverridesPanel
        refreshKey={overridesRefreshKey}
        onRestore={() => {
          setOverridesRefreshKey((k) => k + 1);
          fetchDevices();
        }}
      />

      {/* ---------- Section 3: Energy Meter Simulator ---------- */}
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 d-flex align-items-center">
            <Zap size={20} className="me-2" />
            Energy Meter Simulator
          </h5>
          <Button variant="outline-secondary" size="sm" onClick={fetchDevices}>
            <RefreshCw size={16} className="me-1" />
            Refresh
          </Button>
        </Card.Header>
        <Card.Body>
          <p className="text-muted small">
            Posts to <code>/api/energy-meter/log</code> in the exact webhook format. The meter must be registered in <strong>Manage Devices</strong> before data is accepted. Stop transmission to simulate an offline meter.
          </p>
          {energyDevices.length === 0 ? (
            <p className="text-muted mb-0">No energy meter simulators. Click &quot;Add Energy Meter&quot; to add one.</p>
          ) : (
            <Table responsive striped hover size="sm">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Mode</th>
                  <th>Config</th>
                  <th>Occ.</th>
                  <th>Interval</th>
                  <th>Base kWh</th>
                  <th>Override</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {energyDevices.map((device) => (
                  <tr key={device.DeviceID}>
                    <td><strong>{device.DeviceID}</strong></td>
                    <td><Badge bg="info">{device.energySimMode === 'room' ? 'Room' : 'Single'}</Badge></td>
                    <td><small>{device.configSummary || '—'}</small></td>
                    <td>{device.occupancyPercent ?? 100}%</td>
                    <td><Clock size={14} className="me-1" />{device.intervalSeconds || 60}s</td>
                    <td>{device.energyBaseReading != null ? device.energyBaseReading : '—'}</td>
                    <td>
                      {device.energyReadingOverride?.enabled ? (
                        <Badge bg="warning" text="dark">OVERRIDE</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{getEnergyStatusCell(device)}</td>
                    <td><EnergyActionButtons device={device} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {energyDevices.length > 0 && <PayloadPreviewBox payload={previewPayload} />}
        </Card.Body>
      </Card>

      {/* ---------- Section 4: Fleet Behaviour Simulator ---------- */}
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 d-flex align-items-center">
            <Truck size={20} className="me-2" />
            Fleet Vehicle Simulator
          </h5>
          <Button variant="outline-secondary" size="sm" onClick={fetchDevices}>
            <RefreshCw size={16} className="me-1" />
            Refresh
          </Button>
        </Card.Header>
        <Card.Body>
          <p className="text-muted small">
            Upserts a real <code>gpsTracker</code> Device and inserts <code>AvlRecord</code>s each tick
            (same path as Teltonika). Use different Fleet Behaviour Profiles for multi-vehicle demos.
            Optional 7-day seed on first Start fills Analytics Week.
          </p>
          {gpsDevices.length === 0 ? (
            <p className="text-muted mb-0">No fleet vehicles. Click &quot;Add Fleet Vehicle&quot; to add one.</p>
          ) : (
            <Table responsive striped hover size="sm">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Name</th>
                  <th>Profile</th>
                  <th>Fleet state</th>
                  <th>Next stop</th>
                  <th>Interval</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {gpsDevices.map((device) => (
                  <tr key={device.DeviceID}>
                    <td><strong>{device.DeviceID}</strong></td>
                    <td>{device.displayName || '—'}</td>
                    <td><Badge bg="dark">{device.behaviourProfile || 'delivery'}</Badge></td>
                    <td>
                      <Badge bg={
                        device.fleetState === 'MOVING' || device.fleetState === 'RETURN_HOME' ? 'success'
                          : device.fleetState === 'PARKED' || device.fleetState === 'OFFLINE' ? 'secondary'
                            : 'info'
                      }>
                        {device.fleetState || 'OFFLINE'}
                      </Badge>
                    </td>
                    <td><small>{device.nextWaypointName || '—'}</small></td>
                    <td><Clock size={14} className="me-1" />{device.intervalSeconds || 60}s</td>
                    <td>{getStatusBadge(device)}</td>
                    <td><ActionButtons device={device} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {gpsPreview?.summary && (
            <div className="mt-2 small text-muted">
              Preview: {gpsPreview.summary.state} → {gpsPreview.summary.nextWaypoint}
              {' '}@ [{Number(gpsPreview.summary.lat).toFixed(5)}, {Number(gpsPreview.summary.lon).toFixed(5)}]
              {' '}{gpsPreview.summary.speedKmh} km/h
              {previewLoading ? ' …' : ''}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* ---------- Add Crane Modal ---------- */}
      <Modal show={showAddCraneModal} onHide={() => setShowAddCraneModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Add Simulated Crane</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Company Name *</Form.Label>
                  <Form.Control name="craneCompany" value={craneFormData.craneCompany} onChange={handleCraneInput} placeholder="Gsn Soln" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Device ID *</Form.Label>
                  <Form.Control name="DeviceID" value={craneFormData.DeviceID} onChange={handleCraneInput} placeholder="CRANE005" required />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Latitude *</Form.Label>
                  <Form.Control type="number" name="latitude" value={craneFormData.latitude} onChange={handleCraneInput} step="0.000001" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Longitude *</Form.Label>
                  <Form.Control type="number" name="longitude" value={craneFormData.longitude} onChange={handleCraneInput} step="0.000001" />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>State *</Form.Label>
                  <Form.Select name="state" value={craneFormData.state} onChange={handleCraneInput}>
                    <option value="working">Working</option>
                    <option value="idle">Idle</option>
                    <option value="maintenance">Maintenance</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Frequency (min) *</Form.Label>
                  <Form.Select name="frequencyMinutes" value={craneFormData.frequencyMinutes} onChange={handleCraneInput}>
                    {[1, 2, 5, 10, 15, 30].map((n) => (
                      <option key={n} value={n}>{n} minute{n > 1 ? 's' : ''}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Profile</Form.Label>
                  <Form.Select name="profile" value={craneFormData.profile} onChange={handleCraneInput}>
                    <option value="A">Profile A</option>
                    <option value="B">Profile B</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Label className="d-block">Options</Form.Label>
                <Form.Check type="checkbox" name="padTimestamp" checked={craneFormData.padTimestamp} onChange={handleCraneInput} label="Pad Timestamp" />
                <Form.Check type="checkbox" name="jitter" checked={craneFormData.jitter} onChange={handleCraneInput} label="GPS Jitter" />
              </Col>
            </Row>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddCraneModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleAddCrane} disabled={addingDevice || !craneFormData.DeviceID}>
            {addingDevice ? <><Spinner animation="border" size="sm" className="me-2" />Adding...</> : 'Add Crane'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Add Elevator Modal ---------- */}
      <Modal show={showAddElevatorModal} onHide={() => setShowAddElevatorModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Add Simulated Elevator</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-muted small">Floor cycles 0→24 each tick. State is manual (change via Edit).</p>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Company Name *</Form.Label>
                  <Form.Control name="elevatorCompany" value={elevatorFormData.elevatorCompany} onChange={handleElevatorInput} placeholder="Gsn Soln" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Elevator ID *</Form.Label>
                  <Form.Control name="DeviceID" value={elevatorFormData.DeviceID} onChange={handleElevatorInput} placeholder="ELEV001" required />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={12}>
                <Form.Group className="mb-3">
                  <Form.Label>Location *</Form.Label>
                  <Form.Control name="location" value={elevatorFormData.location} onChange={handleElevatorInput} placeholder="Building A – Lobby" required />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>State *</Form.Label>
                  <Form.Select name="state" value={elevatorFormData.state} onChange={handleElevatorInput}>
                    <option value="working">Working</option>
                    <option value="idle">Idle</option>
                    <option value="maintenance">Maintenance</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Frequency (min) *</Form.Label>
                  <Form.Select name="frequencyMinutes" value={elevatorFormData.frequencyMinutes} onChange={handleElevatorInput}>
                    {[1, 2, 5, 10, 15, 30].map((n) => (
                      <option key={n} value={n}>{n} minute{n > 1 ? 's' : ''}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddElevatorModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleAddElevator} disabled={addingDevice || !elevatorFormData.DeviceID || !elevatorFormData.location?.trim()}>
            {addingDevice ? <><Spinner animation="border" size="sm" className="me-2" />Adding...</> : 'Add Elevator'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Add Energy Meter Modal ---------- */}
      <Modal show={showAddEnergyModal} onHide={() => { setShowAddEnergyModal(false); setPreviewPayload(null); }} size="lg">
        <Modal.Header closeButton><Modal.Title>Add Simulated Energy Meter</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Register the meter in <strong>Manage Devices</strong> first (deviceType: <code>energyMeter</code>), then configure room or single-device simulation. Payload sends 6 values: V, A, kW, kWh, PF, Hz.
          </p>
          <EnergySimForm
            formData={energyFormData}
            onChange={handleEnergyInput}
            catalog={energyCatalog}
          />
          <PayloadPreviewBox payload={previewPayload} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowAddEnergyModal(false); setPreviewPayload(null); }}>Cancel</Button>
          <Button variant="primary" onClick={handleAddEnergy} disabled={addingDevice || !energyFormData.DeviceID}>
            {addingDevice ? <><Spinner animation="border" size="sm" className="me-2" />Adding...</> : 'Add Energy Meter'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Add Fleet Vehicle Modal ---------- */}
      <Modal show={showAddGpsModal} onHide={() => { setShowAddGpsModal(false); setGpsPreview(null); }} size="lg">
        <Modal.Header closeButton><Modal.Title>Add Fleet Vehicle</Modal.Title></Modal.Header>
        <Modal.Body>
          <GpsTrackerSimForm
            formData={gpsFormData}
            onChange={handleGpsInput}
            catalog={gpsCatalog}
          />
          {gpsPreview?.summary && (
            <Alert variant="light" className="small mb-0 border">
              Next tick preview: <strong>{gpsPreview.summary.state}</strong>
              {' '}toward <strong>{gpsPreview.summary.nextWaypoint}</strong>
              {' '}({gpsPreview.summary.waypointCount} stops)
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowAddGpsModal(false); setGpsPreview(null); }}>Cancel</Button>
          <Button
            variant="dark"
            onClick={handleAddGps}
            disabled={addingDevice || !gpsFormData.DeviceID || !gpsFormData.companyName}
          >
            {addingDevice ? <><Spinner animation="border" size="sm" className="me-2" />Adding...</> : 'Add Fleet Vehicle'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Edit Modal (crane, elevator, energy, or fleet GPS) ---------- */}
      <Modal show={showEditModal} onHide={() => { setShowEditModal(false); setEditingDevice(null); setPreviewPayload(null); setGpsPreview(null); }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Edit: {editingDevice?.DeviceID}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editingDevice?.deviceType === 'gpsTracker' ? (
            <>
              <GpsTrackerSimForm
                formData={editFormData}
                onChange={handleGpsEditInput}
                catalog={gpsCatalog}
                deviceIdDisabled
                showDeviceId
              />
              {gpsPreview?.summary && (
                <Alert variant="light" className="small mb-0 border">
                  Preview: {gpsPreview.summary.state} → {gpsPreview.summary.nextWaypoint}
                </Alert>
              )}
            </>
          ) : editingDevice?.deviceType === 'energyMeter' ? (
            <>
              <EnergySimForm
                formData={editFormData}
                onChange={handleEnergyEditInput}
                catalog={energyCatalog}
                deviceIdDisabled
                showDeviceId
              />
              <PayloadPreviewBox payload={previewPayload} />
            </>
          ) : editingDevice?.deviceType === 'elevator' ? (
            <Form>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Company</Form.Label>
                    <Form.Control name="elevatorCompany" value={editFormData.elevatorCompany} onChange={handleEditInput} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Device ID</Form.Label>
                    <Form.Control name="DeviceID" value={editFormData.DeviceID} disabled className="bg-light" />
                  </Form.Group>
                </Col>
              </Row>
              <Form.Group className="mb-3">
                <Form.Label>Location</Form.Label>
                <Form.Control name="location" value={editFormData.location} onChange={handleEditInput} />
              </Form.Group>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>State</Form.Label>
                    <Form.Select name="state" value={editFormData.state} onChange={handleEditInput}>
                      <option value="working">Working</option>
                      <option value="idle">Idle</option>
                      <option value="maintenance">Maintenance</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Frequency (min)</Form.Label>
                    <Form.Select name="frequencyMinutes" value={editFormData.frequencyMinutes} onChange={handleEditInput}>
                      {[1, 2, 5, 10, 15, 30].map((n) => (
                        <option key={n} value={n}>{n}m</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          ) : (
            <Form>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Company</Form.Label>
                    <Form.Control name="craneCompany" value={editFormData.craneCompany} onChange={handleEditInput} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Device ID</Form.Label>
                    <Form.Control name="DeviceID" value={editFormData.DeviceID} disabled className="bg-light" />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Latitude</Form.Label>
                    <Form.Control type="number" name="latitude" value={editFormData.latitude} onChange={handleEditInput} step="0.000001" />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Longitude</Form.Label>
                    <Form.Control type="number" name="longitude" value={editFormData.longitude} onChange={handleEditInput} step="0.000001" />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>State</Form.Label>
                    <Form.Select name="state" value={editFormData.state} onChange={handleEditInput}>
                      <option value="working">Working</option>
                      <option value="idle">Idle</option>
                      <option value="maintenance">Maintenance</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Frequency (min)</Form.Label>
                    <Form.Select name="frequencyMinutes" value={editFormData.frequencyMinutes} onChange={handleEditInput}>
                      {[1, 2, 5, 10, 15, 30].map((n) => (
                        <option key={n} value={n}>{n}m</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Profile</Form.Label>
                    <Form.Select name="profile" value={editFormData.profile} onChange={handleEditInput}>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Check type="checkbox" name="padTimestamp" checked={editFormData.padTimestamp} onChange={handleEditInput} label="Pad Timestamp" />
                  <Form.Check type="checkbox" name="jitter" checked={editFormData.jitter} onChange={handleEditInput} label="GPS Jitter" />
                </Col>
              </Row>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditingDevice(null); }}>Cancel</Button>
          <Button variant="primary" onClick={handleUpdateDevice} disabled={updatingDevice}>
            {updatingDevice ? <><Spinner animation="border" size="sm" className="me-2" />Updating...</> : 'Update'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Elevator Live Override Modal (Reg65, Reg66, Error code) ---------- */}
      <Modal show={showOverrideModal} onHide={() => { setShowOverrideModal(false); setOverrideDevice(null); }} size="md">
        <Modal.Header closeButton>
          <Modal.Title>Live override – {overrideDevice?.DeviceID}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Set values sent on every tick. Leave blank to use computed (floor + state). Use 0 or 000 for error code to clear. Next tick uses these immediately.
          </p>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Reg65 (0–65535)</Form.Label>
              <Form.Control
                type="number"
                name="overrideReg65"
                min={0}
                max={65535}
                value={overrideForm.overrideReg65}
                onChange={handleOverrideInput}
                placeholder="e.g. 256 = floor 1"
              />
              <Form.Text className="text-muted">High byte = floor (0–24), low byte = primary status. Empty = use computed floor.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Status preset (Reg66)</Form.Label>
              <Form.Select
                name="reg66Preset"
                value={overrideForm.reg66Preset}
                onChange={handleOverrideInput}
              >
                <option value="auto">Auto (use state)</option>
                <option value="normal">Normal – In Service + Comm OK + Normal Power</option>
                <option value="maintenance">Maintenance – Maintenance ON</option>
                <option value="outOfService">Out of Service – All off</option>
                <option value="custom">Custom (enter Reg66)</option>
              </Form.Select>
              <Form.Text className="text-muted d-block mb-1">
                Auto uses elevator state (working/idle/maintenance). Other presets set Reg66 for you.
              </Form.Text>
              {overrideForm.reg66Preset === 'custom' && (
                <>
                  <Form.Control
                    className="mt-2"
                    type="number"
                    name="overrideReg66"
                    min={0}
                    max={65535}
                    value={overrideForm.overrideReg66}
                    onChange={handleOverrideInput}
                    placeholder="e.g. 51216 = In Service, Normal Power"
                  />
                  <Form.Text className="text-muted">High = service bits, low = power bits.</Form.Text>
                </>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Error code</Form.Label>
              <Form.Control
                type="text"
                name="overrideErrorCode"
                value={overrideForm.overrideErrorCode}
                onChange={handleOverrideInput}
                placeholder="e.g. 101, 10F, 000 = no error"
              />
              <Form.Text className="text-muted">From lookup table (e.g. 101, 10F). Empty or 000 = no error.</Form.Text>
            </Form.Group>
            <Form.Check
              type="checkbox"
              name="useComputed"
              id="useComputed"
              label="Use computed values (clear all overrides)"
              checked={overrideForm.useComputed}
              onChange={handleOverrideInput}
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowOverrideModal(false); setOverrideDevice(null); }}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveOverride} disabled={savingOverride}>
            {savingOverride ? <><Spinner animation="border" size="sm" className="me-2" />Saving...</> : 'Apply override'}
          </Button>
        </Modal.Footer>
      </Modal>

      <EnergyAlarmTestModal
        show={!!alarmTestDeviceId}
        deviceId={alarmTestDeviceId}
        onHide={() => setAlarmTestDeviceId(null)}
        onSuccess={() => {
          setOverridesRefreshKey((k) => k + 1);
          setSuccess('Alarm test executed successfully');
          fetchDevices();
        }}
      />

      {/* ---------- Info ---------- */}
      <Card>
        <Card.Header>
          <h6 className="mb-0"><Settings size={20} className="me-2" />Notes</h6>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={4}>
              <h6>Device allow-list</h6>
              <p className="text-muted small mb-0">
                Cranes and elevators: add DeviceID in <strong>Manage Devices</strong>. Energy meters: register in Manage Devices first (<code>energyMeter</code>), then add the simulator with the same Device ID.
              </p>
            </Col>
            <Col md={4}>
              <h6>Simulator endpoints</h6>
              <ul className="text-muted small mb-0">
                <li>On by default on <strong>Azure App Service</strong> (<code>WEBSITE_SITE_NAME</code>)</li>
                <li>Off locally unless <code>ENABLE_SIMULATOR=true</code> in <code>.env</code></li>
                <li>Crane → <code>/api/crane/log</code></li>
                <li>Elevator → <code>/api/elevators/log</code></li>
                <li>Energy meter → <code>/api/energy-meter/log</code></li>
              </ul>
            </Col>
            <Col md={4}>
              <h6>Energy meter offline demo</h6>
              <p className="text-muted small mb-0">
                Click <strong>Stop</strong> on a meter to stop transmission — it will show as offline on Energy Overview (no data within 5 minutes). Use <strong>Send</strong> for a one-shot manual post.
              </p>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  );
}
