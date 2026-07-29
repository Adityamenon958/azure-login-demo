import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Col, Row, Spinner } from 'react-bootstrap';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTrackerDevice } from '../hooks/useTrackerDevice';
import { useTrackerJourney } from '../hooks/useTrackerJourney';
import { useTrackerStats } from '../hooks/useTrackerStats';
import { DEVICE_DETAIL_POLL_MS, JOURNEY_SLIDE_MS } from '../constants/pollIntervals';
import {
  DEFAULT_PRESET,
  isRollingPreset,
  rangeFromPreset,
  statsIntervalForRange,
  toDatetimeLocalValue,
} from '../constants/rangePresets';
import { getDeviceCapabilities } from '../constants/deviceCapabilities';
import { formatRelativeTime } from '../utils/formatters';
import VehicleDetailHeader from '../components/detail/VehicleDetailHeader';
import VehicleRangeBar from '../components/detail/VehicleRangeBar';
import VehicleLiveStrip from '../components/detail/VehicleLiveStrip';
import VehicleTripStats from '../components/detail/VehicleTripStats';
import VehicleTimeline from '../components/detail/VehicleTimeline';
import VehicleEvents from '../components/detail/VehicleEvents';
import VehicleHealth from '../components/detail/VehicleHealth';
import VehicleRawPoints from '../components/detail/VehicleRawPoints';
import TrackerRouteMap from '../components/map/TrackerRouteMap';
import styles from '../styles/TrackerOverview.module.css';

const TrackerSpeedChart = lazy(() => import('../components/charts/TrackerSpeedChart'));
const TrackerActivityChart = lazy(() => import('../components/charts/TrackerActivityChart'));
const TrackerBatteryChart = lazy(() => import('../components/charts/TrackerBatteryChart'));

function parseRangeFromSearch(searchParams) {
  const preset = searchParams.get('preset') || DEFAULT_PRESET;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (preset !== 'custom' && !from && !to) {
    return rangeFromPreset(preset);
  }
  if (from && to) {
    return { from, to, preset: preset === 'custom' || !preset ? 'custom' : preset };
  }
  return rangeFromPreset(DEFAULT_PRESET);
}

export default function TrackerDeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const decodedId = decodeURIComponent(deviceId || '');

  const initial = useMemo(() => parseRangeFromSearch(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [preset, setPreset] = useState(initial.preset);
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to });
  const [customFromLocal, setCustomFromLocal] = useState(toDatetimeLocalValue(initial.from));
  const [customToLocal, setCustomToLocal] = useState(toDatetimeLocalValue(initial.to));
  const [chartsOpen, setChartsOpen] = useState(false);
  const [selectedTimelineId, setSelectedTimelineId] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  // ✅ Only bump on user-driven range changes / Fit — not on 60s soft slides
  const [fitTrigger, setFitTrigger] = useState(0);
  const initialFitDone = React.useRef(false);

  const detail = useTrackerDevice(decodedId, DEVICE_DETAIL_POLL_MS);
  const journey = useTrackerJourney(decodedId, applied.from, applied.to);
  const interval = statsIntervalForRange(applied.from, applied.to);
  const stats = useTrackerStats(
    decodedId,
    applied.from,
    applied.to,
    interval,
    chartsOpen
  );

  const caps = getDeviceCapabilities(detail.data?.device?.deviceModel);

  // Sync range → URL
  useEffect(() => {
    const next = { preset, from: applied.from, to: applied.to };
    setSearchParams(next, { replace: true });
  }, [preset, applied.from, applied.to, setSearchParams]);

  // ✅ Soft-slide rolling journey window every 60s (custom never shifts)
  useEffect(() => {
    if (!isRollingPreset(preset)) return undefined;

    const slide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const r = rangeFromPreset(preset);
      setApplied({ from: r.from, to: r.to });
      setCustomFromLocal(toDatetimeLocalValue(r.from));
      setCustomToLocal(toDatetimeLocalValue(r.to));
      // Do not clear selection or bump fitTrigger — preserve map viewport
    };

    const id = setInterval(slide, JOURNEY_SLIDE_MS);
    return () => clearInterval(id);
  }, [preset]);

  // After journey reload, drop selections that no longer exist
  useEffect(() => {
    const stops = journey.data?.stops || [];
    const timeline = journey.data?.timeline || [];
    const events = journey.data?.events || [];
    if (selectedStopId && !stops.some((s) => s.id === selectedStopId)) {
      setSelectedStopId(null);
    }
    if (selectedTimelineId && !timeline.some((t) => t.id === selectedTimelineId)) {
      setSelectedTimelineId(null);
    }
    if (selectedEventId && !events.some((e) => e.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [journey.data, selectedStopId, selectedTimelineId, selectedEventId]);

  // ✅ First journey path → fit once (soft slides do not bump fitTrigger)
  useEffect(() => {
    if (initialFitDone.current) return;
    if (journey.data?.path?.length > 0) {
      initialFitDone.current = true;
      setFitTrigger((n) => n + 1);
    }
  }, [journey.data]);

  const applyPreset = useCallback((key) => {
    setPreset(key);
    if (key === 'custom') return;
    const r = rangeFromPreset(key);
    setApplied({ from: r.from, to: r.to });
    setCustomFromLocal(toDatetimeLocalValue(r.from));
    setCustomToLocal(toDatetimeLocalValue(r.to));
    setSelectedTimelineId(null);
    setSelectedStopId(null);
    setSelectedPathIndex(null);
    setFitTrigger((n) => n + 1);
  }, []);

  const applyCustom = useCallback(() => {
    const from = new Date(customFromLocal);
    const to = new Date(customToLocal);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
    setPreset('custom');
    setApplied({ from: from.toISOString(), to: to.toISOString() });
    setSelectedTimelineId(null);
    setSelectedStopId(null);
    setSelectedPathIndex(null);
    setFitTrigger((n) => n + 1);
  }, [customFromLocal, customToLocal]);

  // ✅ Refresh: rolling → slide to now; custom → same dates
  const handleRefresh = useCallback(() => {
    if (isRollingPreset(preset)) {
      const r = rangeFromPreset(preset);
      setApplied({ from: r.from, to: r.to });
      setCustomFromLocal(toDatetimeLocalValue(r.from));
      setCustomToLocal(toDatetimeLocalValue(r.to));
      setFitTrigger((n) => n + 1);
      detail.refresh();
      // journey/stats refetch via applied from/to change
    } else {
      detail.refresh();
      journey.refresh();
      if (chartsOpen) stats.refresh();
    }
  }, [preset, detail, journey, stats, chartsOpen]);

  const focusItem = (item) => {
    if (!item) return;
    setSelectedTimelineId(item.id);
    setSelectedEventId(item.id);
    if (item.refs?.stopId) setSelectedStopId(item.refs.stopId);
    if (item.refs?.pathIndex != null) setSelectedPathIndex(item.refs.pathIndex);
  };

  const onSelectStop = (stop) => {
    setSelectedStopId(stop.id);
    const match = (journey.data?.timeline || []).find((t) => t.refs?.stopId === stop.id);
    if (match) {
      setSelectedTimelineId(match.id);
    }
    if (stop.pathIndex != null) setSelectedPathIndex(stop.pathIndex);
  };

  const state = detail.data?.state;
  const needsAttention = state?.status === 'needsAttention';
  const journeySoftLoading = journey.loading && Boolean(journey.data);

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <VehicleDetailHeader
        device={detail.data?.device}
        state={state}
        loading={detail.loading && !detail.data}
        lastRefreshed={detail.lastUpdated}
        onBack={() => navigate('/dashboard/tracker-overview')}
        onRefresh={handleRefresh}
      />

      {needsAttention && (
        <Alert variant="warning" className="py-2" style={{ fontSize: '0.8rem' }}>
          No recent signal
          {state?.lastSeenAt
            ? ` · last good fix ${formatRelativeTime(state.lastSeenAt)}`
            : ''}
        </Alert>
      )}

      {(detail.error || journey.error) && (
        <Alert variant="danger" className="py-2" style={{ fontSize: '0.8rem' }}>
          {detail.error || journey.error}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 ms-2"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </Alert>
      )}

      <VehicleRangeBar
        preset={preset}
        from={applied.from}
        to={applied.to}
        customFromLocal={customFromLocal}
        customToLocal={customToLocal}
        onPreset={applyPreset}
        onCustomFrom={setCustomFromLocal}
        onCustomTo={setCustomToLocal}
        onApplyCustom={applyCustom}
      />

      <VehicleLiveStrip state={state} deviceModel={detail.data?.device?.deviceModel} />

      <Row className="g-2 mb-3">
        <Col xs={12} lg={8}>
          <TrackerRouteMap
            path={journey.data?.path || []}
            stops={journey.data?.stops || []}
            bounds={journey.data?.bounds}
            liveState={state}
            loading={journey.loading && !journey.data}
            softLoading={journeySoftLoading}
            fitTrigger={fitTrigger}
            selectedStopId={selectedStopId}
            selectedPathIndex={selectedPathIndex}
            onSelectStop={onSelectStop}
            onSelectPathIndex={setSelectedPathIndex}
          />
        </Col>
        <Col xs={12} lg={4}>
          <VehicleTripStats
            summary={journey.data?.summary}
            loading={journey.loading && !journey.data}
          />
        </Col>
      </Row>

      <VehicleTimeline
        items={journey.data?.timeline || []}
        loading={journey.loading && !journey.data}
        selectedId={selectedTimelineId}
        onSelect={focusItem}
      />

      <VehicleEvents
        events={journey.data?.events || []}
        loading={journey.loading && !journey.data}
        deviceModel={detail.data?.device?.deviceModel}
        selectedId={selectedEventId}
        onSelect={focusItem}
      />

      <div
        className="bg-white border rounded mb-3"
        style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 2px rgba(16,24,40,0.06)' }}
      >
        <button
          type="button"
          className="w-100 d-flex justify-content-between align-items-center border-0 bg-transparent px-3 py-2"
          onClick={() => setChartsOpen((v) => !v)}
        >
          <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
            Charts
          </h6>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            {chartsOpen ? '▲ Collapse' : '▼ Expand (loads on demand)'}
          </span>
        </button>
        {chartsOpen && (
          <div className="px-3 pb-3 border-top">
            <Suspense
              fallback={
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" />
                </div>
              }
            >
              <Row className="g-2 mt-1">
                {caps.charts.includes('speed') && (
                  <Col xs={12} md={caps.charts.includes('battery') ? 4 : 6}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>
                      Speed vs time
                    </div>
                    <TrackerSpeedChart series={stats.data?.series || []} loading={stats.loading} />
                  </Col>
                )}
                {caps.charts.includes('activity') && (
                  <Col xs={12} md={caps.charts.includes('battery') ? 4 : 6}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>
                      Moving minutes
                    </div>
                    <TrackerActivityChart
                      series={stats.data?.series || []}
                      loading={stats.loading}
                    />
                  </Col>
                )}
                {caps.charts.includes('battery') && (
                  <Col xs={12} md={4}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>
                      Battery vs time
                    </div>
                    <TrackerBatteryChart
                      series={stats.data?.series || []}
                      loading={stats.loading}
                    />
                  </Col>
                )}
              </Row>
              {stats.error && (
                <Alert variant="warning" className="mt-2 py-2 mb-0" style={{ fontSize: '0.75rem' }}>
                  {stats.error}
                </Alert>
              )}
            </Suspense>
          </div>
        )}
      </div>

      <VehicleHealth state={state} deviceModel={detail.data?.device?.deviceModel} />

      <VehicleRawPoints deviceId={decodedId} from={applied.from} to={applied.to} />
    </Col>
  );
}
