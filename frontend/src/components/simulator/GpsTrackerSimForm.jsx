import React from 'react';
import { Row, Col, Form, Button, Badge } from 'react-bootstrap';
import { Plus, Trash2 } from 'lucide-react';

// ✅ Default depot (Navi Mumbai) — matches backend demo geocode catalog
export const DEFAULT_GPS_FORM = {
  companyName: 'Gsn Soln',
  DeviceID: '',
  displayName: '',
  deviceModel: 'FMB920',
  imei: '',
  behaviourProfile: 'delivery',
  vehicleClass: 'car',
  routeType: 'multiStop',
  // template = built-in route around base lat/lon | search = Mode 2 | manual = Mode 1
  waypointMode: 'search',
  placeQueries: ['Warehouse', 'Client A', 'Client B', 'Fuel Station', 'Warehouse'],
  waypoints: [
    { name: 'Warehouse', lat: '19.045980', lon: '73.027397', stopDurationMinutes: 15 },
    { name: 'Client A', lat: '19.072000', lon: '73.041000', stopDurationMinutes: 18 },
    { name: 'Client B', lat: '19.033000', lon: '73.055000', stopDurationMinutes: 18 },
    { name: 'Fuel Station', lat: '19.051000', lon: '73.038000', stopDurationMinutes: 8 },
    { name: 'Warehouse', lat: '19.045980', lon: '73.027397', stopDurationMinutes: 15 },
  ],
  latitude: '19.045980',
  longitude: '73.027397',
  speedProfile: 'city',
  workStart: '08:30',
  workEnd: '17:30',
  lunchStart: '13:00',
  lunchMinutes: 45,
  defaultStopMinutes: 15,
  intervalSeconds: 60,
  seedDays: 7,
  timezone: 'Asia/Kolkata',
};

const FALLBACK_PROFILES = [
  { key: 'delivery', label: 'Delivery Vehicle' },
  { key: 'sales', label: 'Sales Vehicle' },
  { key: 'taxi', label: 'Taxi' },
  { key: 'serviceEngineer', label: 'Service Engineer' },
  { key: 'patrol', label: 'Patrol Vehicle' },
  { key: 'shuttle', label: 'Shuttle' },
  { key: 'custom', label: 'Custom' },
];

/** Build POST /api/sim/preview-payload body for fleet GPS. */
export function buildGpsPreviewBody(formData) {
  return {
    ...buildGpsAddPayload(formData),
    previewType: 'gpsTracker',
  };
}

/** Build POST /api/sim/add (and update) payload. */
export function buildGpsAddPayload(formData) {
  const body = {
    deviceType: 'gpsTracker',
    companyName: String(formData.companyName || '').trim(),
    DeviceID: String(formData.DeviceID || '').trim(),
    displayName: String(formData.displayName || formData.DeviceID || '').trim(),
    deviceModel: formData.deviceModel || 'FMB920',
    behaviourProfile: formData.behaviourProfile || 'delivery',
    vehicleClass: formData.vehicleClass || 'car',
    routeType: formData.routeType || 'multiStop',
    speedProfile: formData.speedProfile || 'city',
    workStart: formData.workStart || '08:30',
    workEnd: formData.workEnd || '17:30',
    lunchStart: formData.lunchStart || '13:00',
    lunchMinutes: Number(formData.lunchMinutes) || 45,
    defaultStopMinutes: Number(formData.defaultStopMinutes) || 15,
    timezone: formData.timezone || 'Asia/Kolkata',
    intervalSeconds: Number(formData.intervalSeconds) || 60,
    seedDays: formData.seedDays ? Number(formData.seedDays) : 0,
    latitude: Number(formData.latitude) || 19.04598,
    longitude: Number(formData.longitude) || 73.027397,
  };

  const imei = String(formData.imei || '').trim();
  if (imei) body.imei = imei;

  if (formData.waypointMode === 'search') {
    const queries = (formData.placeQueries || []).map((q) => String(q || '').trim()).filter(Boolean);
    if (queries.length >= 2) {
      body.placeQueries = queries;
      body.routeType = 'custom';
    }
  } else if (formData.waypointMode === 'manual') {
    const wps = (formData.waypoints || [])
      .map((w, i) => ({
        id: w.id || `wp-${i}`,
        name: w.name || `Stop ${i + 1}`,
        lat: Number(w.lat),
        lon: Number(w.lon),
        stopDurationMinutes: Number(w.stopDurationMinutes) || body.defaultStopMinutes,
        placeQuery: w.placeQuery || w.name || '',
      }))
      .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon));
    if (wps.length >= 2) {
      body.waypoints = wps;
      body.routeType = 'custom';
    }
  }
  // waypointMode === 'template' → backend builds from routeType + base lat/lon

  return body;
}

export function deviceToGpsForm(device) {
  const hasCustom = Array.isArray(device.waypoints) && device.waypoints.length >= 2;
  const usedSearch = hasCustom && device.waypoints.some((w) => w.placeQuery);
  return {
    companyName: device.companyName || device.craneCompany || device.name || '',
    DeviceID: device.DeviceID || device.deviceId,
    displayName: device.displayName || '',
    deviceModel: device.deviceModel || 'FMB920',
    imei: device.imei || '',
    behaviourProfile: device.behaviourProfile || 'delivery',
    vehicleClass: device.vehicleClass || 'car',
    routeType: device.routeType || 'multiStop',
    waypointMode: usedSearch ? 'search' : hasCustom ? 'manual' : 'template',
    placeQueries: hasCustom
      ? device.waypoints.map((w) => w.placeQuery || w.name || '')
      : [...DEFAULT_GPS_FORM.placeQueries],
    waypoints: hasCustom
      ? device.waypoints.map((w) => ({
          name: w.name || '',
          lat: String(w.lat),
          lon: String(w.lon),
          stopDurationMinutes: w.stopDurationMinutes ?? 15,
        }))
      : DEFAULT_GPS_FORM.waypoints.map((w) => ({ ...w })),
    latitude: String(device.latitude != null ? device.latitude : 19.04598),
    longitude: String(device.longitude != null ? device.longitude : 73.027397),
    speedProfile: device.speedProfile || 'city',
    workStart: device.workStart || '08:30',
    workEnd: device.workEnd || '17:30',
    lunchStart: device.lunchStart || '13:00',
    lunchMinutes: device.lunchMinutes ?? 45,
    defaultStopMinutes: device.defaultStopMinutes ?? 15,
    intervalSeconds: device.intervalSeconds || 60,
    seedDays: device.seedCompleted ? 0 : (device.seedDays || 0),
    timezone: device.timezone || 'Asia/Kolkata',
  };
}

export default function GpsTrackerSimForm({
  formData,
  onChange,
  catalog,
  deviceIdDisabled = false,
  showDeviceId = true,
}) {
  const profiles = catalog?.profiles?.length ? catalog.profiles : FALLBACK_PROFILES;
  const places = catalog?.places || [];
  const intervals = catalog?.intervalsSeconds || [30, 60, 120];
  const models = catalog?.deviceModels || ['FMB920', 'FMB125'];
  const routeTypes = catalog?.routeTypes || ['circular', 'aToBReturn', 'multiStop', 'custom'];
  const speedProfiles = catalog?.speedProfiles || ['slow', 'city', 'highway', 'random'];

  const handleField = (e) => {
    const { name, value, type, checked } = e.target;
    onChange({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  // ✅ Apply Fleet Behaviour Profile defaults when profile changes
  const handleProfileChange = (e) => {
    const key = e.target.value;
    const p = profiles.find((x) => x.key === key);
    const next = { ...formData, behaviourProfile: key };
    if (p) {
      if (p.routeType) next.routeType = p.routeType;
      if (p.speedProfile) next.speedProfile = p.speedProfile;
      if (p.workStart) next.workStart = p.workStart;
      if (p.workEnd) next.workEnd = p.workEnd;
      if (p.lunchStart) next.lunchStart = p.lunchStart;
      if (p.lunchMinutes != null) next.lunchMinutes = p.lunchMinutes;
      if (p.defaultStopMinutes != null) next.defaultStopMinutes = p.defaultStopMinutes;
    }
    onChange(next);
  };

  const updatePlaceQuery = (index, value) => {
    const rows = [...(formData.placeQueries || [])];
    rows[index] = value;
    onChange({ ...formData, placeQueries: rows });
  };

  const addPlaceQuery = () => {
    onChange({
      ...formData,
      placeQueries: [...(formData.placeQueries || []), ''],
    });
  };

  const removePlaceQuery = (index) => {
    const rows = (formData.placeQueries || []).filter((_, i) => i !== index);
    onChange({
      ...formData,
      placeQueries: rows.length >= 2 ? rows : ['Warehouse', 'Client A'],
    });
  };

  const updateWaypoint = (index, patch) => {
    const rows = [...(formData.waypoints || [])];
    rows[index] = { ...rows[index], ...patch };
    onChange({ ...formData, waypoints: rows });
  };

  const addWaypoint = () => {
    onChange({
      ...formData,
      waypoints: [
        ...(formData.waypoints || []),
        { name: 'Stop', lat: formData.latitude, lon: formData.longitude, stopDurationMinutes: formData.defaultStopMinutes },
      ],
    });
  };

  const removeWaypoint = (index) => {
    const rows = (formData.waypoints || []).filter((_, i) => i !== index);
    onChange({
      ...formData,
      waypoints: rows.length >= 2 ? rows : DEFAULT_GPS_FORM.waypoints.slice(0, 2),
    });
  };

  return (
    <Form>
      <p className="text-muted small">
        Writes a real <code>gpsTracker</code> Device + AvlRecords so Tracker Overview / Map / Analytics work.
        Prefer <strong>location search</strong> (Mode 2) for demos — coords stay internal.
      </p>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Company *</Form.Label>
            <Form.Control name="companyName" value={formData.companyName} onChange={handleField} placeholder="Gsn Soln" />
          </Form.Group>
        </Col>
        {showDeviceId && (
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Device ID *</Form.Label>
              <Form.Control
                name="DeviceID"
                value={formData.DeviceID}
                onChange={handleField}
                placeholder="TRK001"
                disabled={deviceIdDisabled}
                className={deviceIdDisabled ? 'bg-light' : undefined}
              />
            </Form.Group>
          </Col>
        )}
      </Row>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Vehicle name</Form.Label>
            <Form.Control name="displayName" value={formData.displayName} onChange={handleField} placeholder="Delivery Van 1" />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Model</Form.Label>
            <Form.Select name="deviceModel" value={formData.deviceModel} onChange={handleField}>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>IMEI</Form.Label>
            <Form.Control name="imei" value={formData.imei} onChange={handleField} placeholder="auto if empty" />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Fleet Behaviour Profile *</Form.Label>
            <Form.Select name="behaviourProfile" value={formData.behaviourProfile} onChange={handleProfileChange}>
              {profiles.map((p) => (
                <option key={p.key} value={p.key}>{p.label || p.key}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Speed profile</Form.Label>
            <Form.Select name="speedProfile" value={formData.speedProfile} onChange={handleField}>
              {speedProfiles.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Route type</Form.Label>
            <Form.Select name="routeType" value={formData.routeType} onChange={handleField}>
              {routeTypes.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label>Waypoint source</Form.Label>
        <div className="d-flex flex-wrap gap-3">
          <Form.Check
            type="radio"
            id="wp-search"
            label="Mode 2 — Location search (preferred)"
            checked={formData.waypointMode === 'search'}
            onChange={() => onChange({ ...formData, waypointMode: 'search' })}
          />
          <Form.Check
            type="radio"
            id="wp-manual"
            label="Mode 1 — Manual lat/lon"
            checked={formData.waypointMode === 'manual'}
            onChange={() => onChange({ ...formData, waypointMode: 'manual' })}
          />
          <Form.Check
            type="radio"
            id="wp-template"
            label="Route template (auto around base)"
            checked={formData.waypointMode === 'template'}
            onChange={() => onChange({ ...formData, waypointMode: 'template' })}
          />
        </div>
      </Form.Group>

      {formData.waypointMode === 'search' && (
        <div className="mb-3 border rounded p-3 bg-light">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Stops (place names)</strong>
            <Button size="sm" variant="outline-primary" onClick={addPlaceQuery} type="button">
              <Plus size={14} className="me-1" />Add stop
            </Button>
          </div>
          {places.length > 0 && (
            <div className="mb-2">
              <small className="text-muted me-2">Quick pick:</small>
              {places.map((p) => (
                <Badge
                  key={p.query}
                  bg="secondary"
                  className="me-1 mb-1"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onChange({
                    ...formData,
                    placeQueries: [...(formData.placeQueries || []), p.label],
                  })}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          )}
          {(formData.placeQueries || []).map((q, i) => (
            <Row key={`pq-${i}`} className="g-2 mb-2 align-items-center">
              <Col>
                <Form.Control
                  value={q}
                  onChange={(e) => updatePlaceQuery(i, e.target.value)}
                  placeholder="e.g. Warehouse, Airport"
                  list="gps-demo-places"
                />
              </Col>
              <Col xs="auto">
                <Button size="sm" variant="outline-danger" type="button" onClick={() => removePlaceQuery(i)}>
                  <Trash2 size={14} />
                </Button>
              </Col>
            </Row>
          ))}
          <datalist id="gps-demo-places">
            {places.map((p) => (
              <option key={p.query} value={p.label} />
            ))}
          </datalist>
        </div>
      )}

      {formData.waypointMode === 'manual' && (
        <div className="mb-3 border rounded p-3 bg-light">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Stops (coordinates)</strong>
            <Button size="sm" variant="outline-primary" onClick={addWaypoint} type="button">
              <Plus size={14} className="me-1" />Add stop
            </Button>
          </div>
          {(formData.waypoints || []).map((w, i) => (
            <Row key={`wp-${i}`} className="g-2 mb-2 align-items-end">
              <Col md={3}>
                <Form.Label className="small mb-0">Name</Form.Label>
                <Form.Control value={w.name} onChange={(e) => updateWaypoint(i, { name: e.target.value })} />
              </Col>
              <Col md={3}>
                <Form.Label className="small mb-0">Lat</Form.Label>
                <Form.Control type="number" step="0.000001" value={w.lat} onChange={(e) => updateWaypoint(i, { lat: e.target.value })} />
              </Col>
              <Col md={3}>
                <Form.Label className="small mb-0">Lon</Form.Label>
                <Form.Control type="number" step="0.000001" value={w.lon} onChange={(e) => updateWaypoint(i, { lon: e.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label className="small mb-0">Stop min</Form.Label>
                <Form.Control
                  type="number"
                  value={w.stopDurationMinutes}
                  onChange={(e) => updateWaypoint(i, { stopDurationMinutes: e.target.value })}
                />
              </Col>
              <Col md={1}>
                <Button size="sm" variant="outline-danger" type="button" onClick={() => removeWaypoint(i)}>
                  <Trash2 size={14} />
                </Button>
              </Col>
            </Row>
          ))}
        </div>
      )}

      {formData.waypointMode === 'template' && (
        <p className="text-muted small mb-3">
          Backend builds a <code>{formData.routeType}</code> route around the base coordinates below.
        </p>
      )}

      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Base latitude</Form.Label>
            <Form.Control type="number" step="0.000001" name="latitude" value={formData.latitude} onChange={handleField} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Base longitude</Form.Label>
            <Form.Control type="number" step="0.000001" name="longitude" value={formData.longitude} onChange={handleField} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Tick interval (sec)</Form.Label>
            <Form.Select name="intervalSeconds" value={formData.intervalSeconds} onChange={handleField}>
              {intervals.map((n) => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Work start</Form.Label>
            <Form.Control name="workStart" value={formData.workStart} onChange={handleField} placeholder="08:30" />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Work end</Form.Label>
            <Form.Control name="workEnd" value={formData.workEnd} onChange={handleField} placeholder="17:30" />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Lunch start</Form.Label>
            <Form.Control name="lunchStart" value={formData.lunchStart} onChange={handleField} placeholder="13:00" />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Lunch minutes</Form.Label>
            <Form.Control type="number" name="lunchMinutes" value={formData.lunchMinutes} onChange={handleField} />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Default stop (min)</Form.Label>
            <Form.Control type="number" name="defaultStopMinutes" value={formData.defaultStopMinutes} onChange={handleField} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Seed history (days)</Form.Label>
            <Form.Select name="seedDays" value={formData.seedDays} onChange={handleField}>
              <option value={0}>None</option>
              <option value={7}>Last 7 days (Analytics Week)</option>
              <option value={3}>Last 3 days</option>
            </Form.Select>
            <Form.Text className="text-muted">Runs once on first Start, then rollup backfill.</Form.Text>
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Timezone</Form.Label>
            <Form.Control name="timezone" value={formData.timezone} onChange={handleField} disabled />
          </Form.Group>
        </Col>
      </Row>
    </Form>
  );
}
