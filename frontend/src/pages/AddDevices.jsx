import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Col, Row, Form, Button, Table, Spinner, Modal } from 'react-bootstrap';
import { Edit, Trash2 } from 'lucide-react';
import styles from './MainContent.module.css';
import './MainContent.css';

const DEVICE_TYPES = [
  { value: 'levelSensor', label: 'Level Sensor' },
  { value: 'crane', label: 'Crane' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'energyMeter', label: 'Energy Meter' },
  { value: 'gpsTracker', label: 'GPS Tracker' },
];

const IMEI_REGEX = /^\d{15,16}$/;

function isGpsTrackerType(type) {
  return String(type || '').toLowerCase() === 'gpstracker';
}

function validateImeiInput(value) {
  const imei = String(value || '').trim();
  if (!imei) return { ok: false, message: 'IMEI is required for GPS Tracker devices' };
  if (!/^\d+$/.test(imei)) return { ok: false, message: 'IMEI must contain digits only' };
  if (!IMEI_REGEX.test(imei)) return { ok: false, message: 'IMEI must be 15 or 16 digits' };
  return { ok: true, imei };
}

export default function AddDevice() {
  const navigate = useNavigate();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [authCompanyName, setAuthCompanyName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [uid, setUid] = useState('');
  const [imei, setImei] = useState('');
  const [imeiError, setImeiError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [searchColumn, setSearchColumn] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByDateAsc, setSortByDateAsc] = useState(false);

  const [elevatorZones, setElevatorZones] = useState([]);
  const [elevatorZoneId, setElevatorZoneId] = useState('');
  const [siteName, setSiteName] = useState('');
  const [plantName, setPlantName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [location, setLocation] = useState('');
  const [phaseType, setPhaseType] = useState('single');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneCompany, setNewZoneCompany] = useState('');
  const [showZoneEditModal, setShowZoneEditModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [hasElevatorOverviewAccess, setHasElevatorOverviewAccess] = useState(false);

  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await axios.get('/api/auth/userinfo', { withCredentials: true });
        const { role, companyName, subscriptionStatus } = res.data;

        setRole(role);
        setCompanyName(companyName);
        setAuthCompanyName(companyName);

        if (role === 'admin' || role === 'superadmin') {
          try {
            const accessRes = await axios.get('/api/check-dashboard-access/elevatorOverview', { withCredentials: true });
            setHasElevatorOverviewAccess(Boolean(accessRes.data?.hasAccess));
          } catch (accessErr) {
            console.error('Elevator overview access check failed:', accessErr.message);
            setHasElevatorOverviewAccess(false);
          }
        } else {
          setHasElevatorOverviewAccess(false);
        }

        const isAuthorized = (role === "admin" || (role === "superadmin"));
        const hasSubscription = subscriptionStatus === "active";
        
        // ✅ Superadmin bypasses subscription check, admin/user need active subscription
        const shouldRedirect = !isAuthorized || (role !== 'superadmin' && !hasSubscription);

        if (shouldRedirect) {
          console.warn("Unauthorized or inactive subscription ❌");
          navigate('/dashboard');
        } else {
          // ✅ Superadmin gets all devices, others get company-filtered
          if (role === 'superadmin') {
            fetchDevices(null); // Pass null to indicate superadmin (all devices)
          } else {
            fetchDevices(companyName); // Company-filtered for non-superadmin
          }
        }
      } catch (err) {
        console.error("Auth fetch failed:", err.message);
        navigate('/dashboard');
      }
    };

    fetchAuth();
  }, [navigate]);


  const fetchDevices = async (company) => {
    setLoading(true);
    try {
      // ✅ Superadmin gets all devices (company = null), others get company-filtered
      const params = company ? { companyName: company } : {};
      const response = await axios.get('/api/devices', { params, withCredentials: true });
      
      setDevices(response.data);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchElevatorZones = async () => {
    try {
      const res = await axios.get('/api/elevator-zones', { withCredentials: true });
      setElevatorZones(res.data || []);
    } catch (e) {
      console.error('Error fetching elevator zones:', e);
    }
  };

  useEffect(() => {
    // ✅ Auto-generate UID only in add mode
    if (!isEditMode && companyName && deviceId) {
      const prefix = companyName.split(" ").map(word => word[0]).join('').toUpperCase();
      setUid(`${prefix}-${deviceId}`);
    }
  }, [companyName, deviceId, isEditMode]);

  // ✅ Fetch devices when component loads and when role/companyName changes
  useEffect(() => {
    if (role) {
      if (role === 'superadmin') {
        fetchDevices(null); // Superadmin gets all devices
      } else if (companyName) {
        fetchDevices(companyName); // Others get company-filtered
      }
    }
  }, [role, companyName]);

  const canManageZones = (role === 'admin' || role === 'superadmin') && hasElevatorOverviewAccess;

  useEffect(() => {
    if (canManageZones) {
      fetchElevatorZones();
    } else {
      setElevatorZones([]);
    }
  }, [canManageZones]);

  useEffect(() => {
    if (role === 'superadmin' && authCompanyName) {
      setNewZoneCompany((prev) => prev || authCompanyName);
    }
  }, [role, authCompanyName]);

  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!newZoneName.trim()) {
      alert('Enter a zone name');
      return;
    }
    if (role === 'superadmin' && !newZoneCompany.trim()) {
      alert('Enter the company name this zone belongs to');
      return;
    }
    try {
      await axios.post(
        '/api/elevator-zones',
        {
          name: newZoneName.trim(),
          ...(role === 'superadmin' ? { companyName: newZoneCompany.trim() } : {}),
        },
        { withCredentials: true }
      );
      setNewZoneName('');
      await fetchElevatorZones();
      alert('Zone created');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to create zone');
    }
  };

  const handleDeleteZone = async (zone) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    if (role === 'admin' && zone.companyName !== authCompanyName) {
      alert('You can only delete zones in your own company.');
      return;
    }
    if (!window.confirm(`Delete zone "${zone.name}"? Elevators in this zone will become unassigned.`)) return;
    try {
      await axios.delete(`/api/elevator-zones/${zone._id}`, { withCredentials: true });
      await fetchElevatorZones();
      fetchDevices(role === 'superadmin' ? null : authCompanyName);
      alert('Zone deleted');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete zone');
    }
  };

  const openEditZone = (zone) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    if (role === 'admin' && zone.companyName !== authCompanyName) {
      alert('You can only edit zones in your own company.');
      return;
    }
    setEditingZone(zone);
    setEditZoneName(zone.name);
    setShowZoneEditModal(true);
  };

  const handleSaveEditZone = async (e) => {
    e.preventDefault();
    if (!editingZone || !editZoneName.trim()) return;
    try {
      await axios.patch(
        `/api/elevator-zones/${editingZone._id}`,
        { name: editZoneName.trim() },
        { withCredentials: true }
      );
      setShowZoneEditModal(false);
      setEditingZone(null);
      await fetchElevatorZones();
      fetchDevices(role === 'superadmin' ? null : authCompanyName);
      alert('Zone updated');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to update zone');
    }
  };

  const zonesForCompany = (cn) =>
    elevatorZones.filter((z) => z.companyName === cn);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setImeiError('');

    if (isGpsTrackerType(deviceType)) {
      const check = validateImeiInput(imei);
      if (!check.ok) {
        setImeiError(check.message);
        return;
      }
    }

    if (!isEditMode) {
      const isDuplicate = devices.some(device => device.uid === uid);
      if (isDuplicate) {
        alert('Device with same UID already exists!');
        return;
      }

      const formData = { companyName, uid, deviceId, deviceType };
      if (String(deviceType).toLowerCase() === 'elevator' && elevatorZoneId) {
        formData.elevatorZoneId = elevatorZoneId;
      }
      if (String(deviceType).toLowerCase() === 'energymeter') {
        formData.siteName = siteName;
        formData.plantName = plantName;
        formData.machineName = machineName;
        formData.location = location;
        formData.phaseType = phaseType;
      }
      if (isGpsTrackerType(deviceType)) {
        formData.imei = String(imei).trim();
      }

      try {
        const response = await axios.post('/api/devices', formData, { withCredentials: true });
        // ✅ Refresh devices list with company filtering
        fetchDevices(role === 'superadmin' ? null : authCompanyName);
        alert(response.data.message);
        setDeviceId('');
        setDeviceType('');
        setElevatorZoneId('');
        setSiteName('');
        setPlantName('');
        setMachineName('');
        setLocation('');
        setPhaseType('single');
        setImei('');
        setImeiError('');
        setShowModal(false);
      } catch (error) {
        console.error('Error submitting form:', error);
        alert(error.response?.data?.message || 'Failed to add device');
      }
    } else {
      // ✅ Edit device flow
      if (!editingDevice?._id) {
        alert('No device selected for edit');
        return;
      }
      try {
        // Backend supports superadmin changing companyName; admin cannot
        const payload = { deviceId, deviceType };
        if (role === 'superadmin' && companyName) payload.companyName = companyName;
        if (String(deviceType).toLowerCase() === 'elevator') {
          payload.elevatorZoneId = elevatorZoneId || null;
        } else {
          payload.elevatorZoneId = null;
        }
        if (String(deviceType).toLowerCase() === 'energymeter') {
          payload.siteName = siteName;
          payload.plantName = plantName;
          payload.machineName = machineName;
          payload.location = location;
          payload.phaseType = phaseType;
        }
        if (isGpsTrackerType(deviceType)) {
          payload.imei = String(imei).trim();
        } else {
          // Clear IMEI when switching away from GPS Tracker
          payload.imei = '';
        }
        await axios.put(`/api/devices/${editingDevice._id}`, payload, { withCredentials: true });
        alert('Device updated successfully!');
        setShowModal(false);
        setIsEditMode(false);
        setEditingDevice(null);
        // Restore auth company name in form for new-add flow
        setCompanyName(authCompanyName);
        setUid('');
        setDeviceId('');
        setDeviceType('');
        setElevatorZoneId('');
        setSiteName('');
        setPlantName('');
        setMachineName('');
        setLocation('');
        setPhaseType('single');
        setImei('');
        setImeiError('');
        fetchDevices(role === 'superadmin' ? null : authCompanyName);
      } catch (error) {
        console.error('Error updating device:', error);
        alert(error.response?.data?.message || 'Failed to update device');
      }
    }
  };

  const handleEdit = (dev) => {
    // ✅ Role-based guard: only admin/superadmin
    if (role !== 'admin' && role !== 'superadmin') {
      alert('You do not have permission to edit devices.');
      return;
    }
    // ✅ Admin can only edit within their company
    if (role === 'admin' && dev.companyName !== authCompanyName) {
      alert('Admins can edit only devices in their own company.');
      return;
    }
    setIsEditMode(true);
    setEditingDevice(dev);
    // Prefill form
    setCompanyName(dev.companyName);
    setUid(dev.uid);
    setDeviceId(dev.deviceId || '');
    setDeviceType(dev.deviceType || '');
    const zid = dev.elevatorZoneId?._id || dev.elevatorZoneId || '';
    setElevatorZoneId(zid);
    setSiteName(dev.siteName || '');
    setPlantName(dev.plantName || '');
    setMachineName(dev.machineName || '');
    setLocation(dev.location || '');
    setPhaseType(dev.phaseType || 'single');
    setImei(dev.imei || '');
    setImeiError('');
    setShowModal(true);
  };

  const handleDelete = async (dev) => {
    // ✅ Role-based guard: only admin/superadmin
    if (role !== 'admin' && role !== 'superadmin') {
      alert('You do not have permission to delete devices.');
      return;
    }
    // ✅ Admin can only delete within their company
    if (role === 'admin' && dev.companyName !== authCompanyName) {
      alert('Admins can delete only devices in their own company.');
      return;
    }
    const confirm = window.confirm(`Are you sure you want to delete device ${dev.deviceId}?`);
    if (!confirm) return;
    try {
      await axios.delete(`/api/devices/${dev._id}`, { withCredentials: true });
      alert('Device deleted successfully!');
      fetchDevices(role === 'superadmin' ? null : authCompanyName);
    } catch (err) {
      console.error('Delete device failed:', err);
      alert('Failed to delete device');
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setIsEditMode(false);
    setEditingDevice(null);
    // Restore auth company name for add flow
    setCompanyName(authCompanyName);
    setUid('');
    setDeviceId('');
    setDeviceType('');
    setElevatorZoneId('');
    setSiteName('');
    setPlantName('');
    setMachineName('');
    setLocation('');
    setPhaseType('single');
    setImei('');
    setImeiError('');
  };

  const filteredDevices = devices
    .filter((dev) => {
      if (!searchTerm) return true;
      const lowerTerm = searchTerm.toLowerCase();
      if (searchColumn) {
        return dev[searchColumn]?.toString().toLowerCase().includes(lowerTerm);
      }
      return Object.values(dev).some(val => val?.toString().toLowerCase().includes(lowerTerm));
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sortByDateAsc ? dateA - dateB : dateB - dateA;
    });

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.main} p-4`}>
      <Row className="justify-content-between d-flex align-items-start flex-column justify-content-evenly">
        <Col><h3>Device Management</h3></Col>
        <Col className='mt-3' xs="auto">
          <Button variant="success" onClick={() => setShowModal(true)} className='std_button'>
            Manage Device
          </Button>
        </Col>
      </Row>

      <Modal show={showModal} onHide={handleModalClose} centered className="custom_modal1">
        <Modal.Header className="border-0 px-4 pt-4 pb-0 d-flex justify-content-between align-items-center" closeButton>
          <Modal.Title>{isEditMode ? 'Edit Device' : 'Manage Device'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="my-1">
              <Form.Label className="custom_label1">Company Name</Form.Label>
              {/* ✅ Superadmin can edit company name; Admin sees their company but cannot edit */}
              <Form.Control
                className="custom_input1"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={role !== 'superadmin'}
              />
            </Form.Group>
            <Form.Group className="my-1">
              <Form.Label className="custom_label1">UID</Form.Label>
              <Form.Control className="custom_input1" type="text" value={uid} disabled />
            </Form.Group>
            <Form.Group className="my-1">
              <Form.Label className="custom_label1">Device ID</Form.Label>
              <Form.Control type="text" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required className="custom_input1" />
            </Form.Group>
            <Form.Group className="my-1">
              <Form.Label className="custom_label1">Device Type</Form.Label>
              <Form.Select
                value={deviceType}
                onChange={(e) => {
                  const next = e.target.value;
                  setDeviceType(next);
                  if (!isGpsTrackerType(next)) {
                    setImei('');
                    setImeiError('');
                  }
                }}
                required
                className="custom_input1"
              >
                <option value="">Select device type...</option>
                {DEVICE_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                {isEditMode &&
                  deviceType &&
                  !DEVICE_TYPES.some((t) => t.value === deviceType) && (
                    <option value={deviceType}>{deviceType} (legacy)</option>
                  )}
              </Form.Select>
            </Form.Group>
            {isGpsTrackerType(deviceType) && (
              <Form.Group className="my-1">
                <Form.Label className="custom_label1">IMEI *</Form.Label>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  pattern="\d{15,16}"
                  maxLength={16}
                  value={imei}
                  onChange={(e) => {
                    // ✅ Digits only while typing
                    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 16);
                    setImei(digitsOnly);
                    if (imeiError) setImeiError('');
                  }}
                  required
                  className="custom_input1"
                  placeholder="15 or 16 digit IMEI"
                  isInvalid={Boolean(imeiError)}
                />
                {imeiError ? (
                  <Form.Control.Feedback type="invalid">{imeiError}</Form.Control.Feedback>
                ) : (
                  <Form.Text className="text-muted">Required for Teltonika GPS trackers (15–16 digits).</Form.Text>
                )}
              </Form.Group>
            )}
            {String(deviceType).toLowerCase() === 'elevator' && canManageZones && (
              <Form.Group className="my-1">
                <Form.Label className="custom_label1">Elevator zone (optional)</Form.Label>
                <Form.Select
                  className="custom_input1"
                  value={elevatorZoneId}
                  onChange={(e) => setElevatorZoneId(e.target.value)}
                >
                  <option value="">None</option>
                  {zonesForCompany(companyName).map((z) => (
                    <option key={z._id} value={z._id}>
                      {z.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
            {String(deviceType).toLowerCase() === 'energymeter' && (
              <>
                <Form.Group className="my-1">
                  <Form.Label className="custom_label1">Site name</Form.Label>
                  <Form.Control type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)} className="custom_input1" />
                </Form.Group>
                <Form.Group className="my-1">
                  <Form.Label className="custom_label1">Plant name</Form.Label>
                  <Form.Control type="text" value={plantName} onChange={(e) => setPlantName(e.target.value)} className="custom_input1" />
                </Form.Group>
                <Form.Group className="my-1">
                  <Form.Label className="custom_label1">Machine name</Form.Label>
                  <Form.Control type="text" value={machineName} onChange={(e) => setMachineName(e.target.value)} className="custom_input1" />
                </Form.Group>
                <Form.Group className="my-1">
                  <Form.Label className="custom_label1">Location</Form.Label>
                  <Form.Control type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="custom_input1" />
                </Form.Group>
                <Form.Group className="my-1">
                  <Form.Label className="custom_label1">Phase type</Form.Label>
                  <Form.Select className="custom_input1" value={phaseType} onChange={(e) => setPhaseType(e.target.value)}>
                    <option value="single">Single phase</option>
                    <option value="three">Three phase</option>
                  </Form.Select>
                </Form.Group>
              </>
            )}
            <Button variant="primary" type="submit" className="w-100 signIn1 mb-2">{isEditMode ? 'Save Changes' : 'Submit'}</Button>
          </Form>
        </Modal.Body>
      </Modal>

      {canManageZones && (
        <>
          <Modal show={showZoneEditModal} onHide={() => { setShowZoneEditModal(false); setEditingZone(null); }} centered>
            <Modal.Header closeButton>
              <Modal.Title>Edit zone</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form onSubmit={handleSaveEditZone}>
                <Form.Group className="mb-2">
                  <Form.Label>Zone name</Form.Label>
                  <Form.Control
                    value={editZoneName}
                    onChange={(e) => setEditZoneName(e.target.value)}
                    required
                    className="custom_input1"
                  />
                </Form.Group>
                <Button type="submit" variant="primary">Save</Button>
              </Form>
            </Modal.Body>
          </Modal>

          <Row className="mt-4 mb-2">
            <Col xs={12}>
              <h4 className="mb-3">Elevator zones</h4>
              <p className="text-muted small mb-2">
                Create zones here, then assign elevator devices to a zone in <strong>Manage Device</strong>.
              </p>
              <Form onSubmit={handleCreateZone} className="d-flex flex-wrap gap-2 align-items-end mb-3">
                {role === 'superadmin' && (
                  <Form.Group>
                    <Form.Label className="small">Company</Form.Label>
                    <Form.Control
                      className="custom_input1"
                      style={{ minWidth: 180 }}
                      value={newZoneCompany}
                      onChange={(e) => setNewZoneCompany(e.target.value)}
                      placeholder="Company name"
                      required
                    />
                  </Form.Group>
                )}
                <Form.Group>
                  <Form.Label className="small">New zone name</Form.Label>
                  <Form.Control
                    className="custom_input1"
                    style={{ minWidth: 220 }}
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="e.g. Cloud9 Hospital — Goregaon"
                    required
                  />
                </Form.Group>
                <Button type="submit" variant="outline-primary" size="sm">
                  Add zone
                </Button>
              </Form>
              <Table size="sm" bordered responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    {role === 'superadmin' && <th>Company</th>}
                    <th style={{ width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(role === 'superadmin'
                    ? elevatorZones
                    : elevatorZones.filter((z) => z.companyName === authCompanyName)
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={role === 'superadmin' ? 3 : 2} className="text-center text-muted">
                        No zones yet
                      </td>
                    </tr>
                  ) : (
                    (role === 'superadmin'
                      ? elevatorZones
                      : elevatorZones.filter((z) => z.companyName === authCompanyName)
                    ).map((z) => (
                      <tr key={z._id}>
                        <td>{z.name}</td>
                        {role === 'superadmin' && <td>{z.companyName}</td>}
                        <td>
                          <Button size="sm" variant="link" className="p-0 me-2" onClick={() => openEditZone(z)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="link" className="p-0 text-danger" onClick={() => handleDeleteZone(z)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Col>
          </Row>
        </>
      )}

      <Row className="mt-4">
        <h4 className="mt-3">Existing Devices</h4>
        <Row className="mb-3">
          <Col md={4}>
            <Form.Select value={searchColumn} onChange={(e) => setSearchColumn(e.target.value)} className="custom_input1">
              <option value="">All Columns</option>
              <option value="uid">UID</option>
              <option value="deviceId">Device ID</option>
              <option value="deviceType">Type</option>
              <option value="imei">IMEI</option>
              <option value="companyName">Company</option>
              <option value="createdAt">Date</option>
            </Form.Select>
          </Col>
          <Col md={8}>
            <Form.Control type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="custom_input1" />
          </Col>
        </Row>

        <div style={{ position: 'relative', minHeight: '250px' }}>
          {loading && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, backgroundColor: 'rgba(255,255,255,0.85)', padding: '2rem', borderRadius: '0.5rem' }}>
              <Spinner animation="border" variant="primary" />
            </div>
          )}

          {!loading && (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => setSortByDateAsc(!sortByDateAsc)}>
                    Date {sortByDateAsc ? '↑' : '↓'}
                  </th>
                  <th>UID</th>
                  <th>Device ID</th>
                  <th>Type</th>
                  <th>IMEI</th>
                  <th>Company</th>
                  <th>Zone</th>
                  {(role === 'admin' || role === 'superadmin') && (
                    <th>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan={role === 'admin' || role === 'superadmin' ? 8 : 7} className="text-center">No matching devices</td>
                  </tr>
                ) : (
                  filteredDevices.map((dev, index) => (
                    <tr key={index}>
                      <td>{new Date(dev.createdAt).toLocaleDateString()}</td>
                      <td>{dev.uid}</td>
                      <td>{dev.deviceId}</td>
                      <td>{dev.deviceType}</td>
                      <td>
                        {isGpsTrackerType(dev.deviceType) && dev.imei ? dev.imei : '—'}
                      </td>
                      <td>{dev.companyName}</td>
                      <td>
                        {String(dev.deviceType || '').toLowerCase() === 'elevator' && dev.elevatorZoneId?.name
                          ? dev.elevatorZoneId.name
                          : '—'}
                      </td>
                      {(role === 'admin' || role === 'superadmin') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-2">
                            <Button
                              size="sm"
                              variant="link"
                              onClick={() => handleEdit(dev)}
                              title="Edit Device"
                              disabled={role === 'admin' && dev.companyName !== authCompanyName}
                              style={{ color: '#0d6efd', border: 'none', padding: '4px 8px', textDecoration: 'none' }}
                              className="edit-btn"
                              aria-label="Edit Device"
                            >
                              <Edit size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="link"
                              onClick={() => handleDelete(dev)}
                              title="Delete Device"
                              disabled={role === 'admin' && dev.companyName !== authCompanyName}
                              style={{ color: '#dc3545', border: 'none', padding: '4px 8px', textDecoration: 'none' }}
                              className="delete-btn"
                              aria-label="Delete Device"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </div>
      </Row>
    </Col>
  );
}
