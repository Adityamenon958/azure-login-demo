import axios from 'axios';

const client = axios.create({ withCredentials: true });

function unwrap(response) {
  return response.data;
}

export async function fetchOverview(params = {}) {
  const res = await client.get('/api/tracker/overview', { params });
  return unwrap(res);
}

export async function fetchLiveLocations(params = {}) {
  const res = await client.get('/api/tracker/live-locations', { params });
  return unwrap(res);
}

export async function fetchDevices(params = {}) {
  const res = await client.get('/api/tracker/devices', { params });
  return unwrap(res);
}

export async function fetchDevice(deviceId, params = {}) {
  const res = await client.get(`/api/tracker/devices/${encodeURIComponent(deviceId)}`, {
    params,
  });
  return unwrap(res);
}

export async function fetchHistory(deviceId, params) {
  const res = await client.get(
    `/api/tracker/devices/${encodeURIComponent(deviceId)}/history`,
    { params }
  );
  return unwrap(res);
}

export async function fetchStatistics(deviceId, params) {
  const res = await client.get(
    `/api/tracker/devices/${encodeURIComponent(deviceId)}/statistics`,
    { params }
  );
  return unwrap(res);
}

export async function fetchActivity(params = {}) {
  const res = await client.get('/api/tracker/activity', { params });
  return unwrap(res);
}

export async function fetchJourney(deviceId, params) {
  const res = await client.get(
    `/api/tracker/devices/${encodeURIComponent(deviceId)}/journey`,
    { params }
  );
  return unwrap(res);
}

export async function fetchMapBounds(params) {
  const res = await client.get('/api/tracker/map/bounds', { params });
  return unwrap(res);
}

// ✅ Fleet Analytics
export async function fetchAnalyticsSummary(params) {
  const res = await client.get('/api/tracker/analytics/summary', { params });
  return unwrap(res);
}

export async function fetchAnalyticsVehicles(params) {
  const res = await client.get('/api/tracker/analytics/vehicles', { params });
  return unwrap(res);
}

export async function fetchAnalyticsRankings(params) {
  const res = await client.get('/api/tracker/analytics/rankings', { params });
  return unwrap(res);
}

export async function fetchAnalyticsVehicleDetail(deviceId, params) {
  const res = await client.get(
    `/api/tracker/analytics/vehicles/${encodeURIComponent(deviceId)}`,
    { params }
  );
  return unwrap(res);
}

export function analyticsExportUrl(params) {
  const q = new URLSearchParams(params).toString();
  return `/api/tracker/analytics/export?${q}`;
}
