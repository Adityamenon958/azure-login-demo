import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Spinner } from 'react-bootstrap';
import { TrackerSelectionProvider, useTrackerSelection } from '../context/TrackerSelectionContext';
import { useTrackerOverview } from '../hooks/useTrackerOverview';
import { useTrackerLiveLocations } from '../hooks/useTrackerLiveLocations';
import { useTrackerDevice } from '../hooks/useTrackerDevice';
import { useTrackerActivity } from '../hooks/useTrackerOverview';
import { useTrackerStats } from '../hooks/useTrackerStats';
import {
  OVERVIEW_POLL_MS,
  LIVE_LOCATIONS_POLL_MS,
  DEVICE_DETAIL_POLL_MS,
  ACTIVITY_POLL_MS,
} from '../constants/pollIntervals';
import TrackerSummaryCards from '../components/summary/TrackerSummaryCards';
import TrackerTable from '../components/table/TrackerTable';
import TrackerLiveMap from '../components/map/TrackerLiveMap';
import TrackerDetailsPanel from '../components/details/TrackerDetailsPanel';
import TrackerRecentActivity from '../components/activity/TrackerRecentActivity';
import TrackerFilters from '../components/filters/TrackerFilters';
import TrackerFilterChips from '../components/filters/TrackerFilterChips';
import TrackerFab from '../components/filters/TrackerFab';
import styles from '../styles/TrackerOverview.module.css';

const TrackerSpeedChart = lazy(() => import('../components/charts/TrackerSpeedChart'));
const TrackerActivityChart = lazy(() => import('../components/charts/TrackerActivityChart'));

function defaultDayRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function TrackerOverviewInner() {
  const {
    selectedDeviceId,
    setSelectedDeviceId,
    filters,
    setFilters,
    resetFilters,
    chartsExpanded,
    setChartsExpanded,
  } = useTrackerSelection();

  const [showFilters, setShowFilters] = useState(false);
  const [exportNote, setExportNote] = useState('');

  const overview = useTrackerOverview(OVERVIEW_POLL_MS);
  const live = useTrackerLiveLocations(LIVE_LOCATIONS_POLL_MS);
  const detail = useTrackerDevice(selectedDeviceId, DEVICE_DETAIL_POLL_MS);
  const activity = useTrackerActivity(selectedDeviceId, ACTIVITY_POLL_MS);

  const range = defaultDayRange();
  const stats = useTrackerStats(
    selectedDeviceId,
    range.from,
    range.to,
    '5m',
    chartsExpanded && Boolean(selectedDeviceId)
  );

  useEffect(() => {
    const devices = overview.data?.devices || [];
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [overview.data, selectedDeviceId, setSelectedDeviceId]);

  const handleRefresh = () => {
    overview.refresh();
    live.refresh();
    if (selectedDeviceId) {
      detail.refresh();
      activity.refresh();
    }
  };

  const handleExportStub = () => {
    setExportNote('Export will be available in a later release. Use device history for now.');
    setTimeout(() => setExportNote(''), 4000);
  };

  const lastUpdated = overview.lastUpdated || live.lastUpdated;

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <div className="mb-2 d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h6 className="mb-0">Tracker Overview</h6>
          <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '0.75rem' }}>
            <span>
              Last updated:{' '}
              {lastUpdated
                ? lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
                : '—'}
            </span>
            <Button variant="link" size="sm" className="p-0" onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <TrackerFilterChips filters={filters} onClick={() => setShowFilters(true)} />
          <TrackerFab
            onFiltersClick={() => setShowFilters(true)}
            onExportClick={handleExportStub}
          />
        </div>
      </div>

      {(overview.error || live.error) && (
        <Alert variant="warning" className="py-2" style={{ fontSize: '0.8rem' }}>
          {overview.error || live.error}
        </Alert>
      )}
      {exportNote && (
        <Alert variant="info" className="py-2" style={{ fontSize: '0.8rem' }}>
          {exportNote}
        </Alert>
      )}

      <TrackerSummaryCards kpis={overview.data?.kpis} loading={overview.loading && !overview.data} />

      <Row className="g-2 mb-3">
        <Col xs={12} lg={7}>
          <TrackerTable
            devices={overview.data?.devices || []}
            loading={overview.loading && !overview.data}
            selectedDeviceId={selectedDeviceId}
            onSelect={setSelectedDeviceId}
            search={filters.search}
            statusFilter={filters.status}
          />
        </Col>
        <Col xs={12} lg={5}>
          <TrackerLiveMap
            locations={live.data?.locations || []}
            loading={live.loading && !live.data}
            selectedDeviceId={selectedDeviceId}
            onSelect={setSelectedDeviceId}
          />
        </Col>
      </Row>

      <Row className="g-2 mb-3">
        <Col xs={12} lg={6}>
          <TrackerDetailsPanel
            deviceId={selectedDeviceId}
            detail={detail.data}
            loading={detail.loading}
          />
        </Col>
        <Col xs={12} lg={6}>
          <TrackerRecentActivity
            events={activity.data?.events || []}
            loading={activity.loading && !activity.data}
          />
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mb-3">
        <Card.Header
          className="py-2 bg-white d-flex justify-content-between align-items-center"
          role="button"
          onClick={() => setChartsExpanded((v) => !v)}
        >
          <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
            Charts {selectedDeviceId ? `(${selectedDeviceId})` : ''}
          </h6>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            {chartsExpanded ? '▲ Collapse' : '▼ Expand (loads on demand)'}
          </span>
        </Card.Header>
        {chartsExpanded && (
          <Card.Body>
            {!selectedDeviceId ? (
              <div className="text-muted text-center py-3">Select a tracker to load charts</div>
            ) : (
              <Suspense
                fallback={
                  <div className="text-center py-4">
                    <Spinner animation="border" size="sm" />
                  </div>
                }
              >
                <Row className="g-2">
                  <Col xs={12} md={6}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>
                      Speed (24h)
                    </div>
                    <TrackerSpeedChart series={stats.data?.series || []} loading={stats.loading} />
                  </Col>
                  <Col xs={12} md={6}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>
                      Moving minutes (24h)
                    </div>
                    <TrackerActivityChart
                      series={stats.data?.series || []}
                      loading={stats.loading}
                    />
                  </Col>
                </Row>
                {stats.error && (
                  <Alert variant="warning" className="mt-2 py-2 mb-0" style={{ fontSize: '0.75rem' }}>
                    {stats.error}
                  </Alert>
                )}
              </Suspense>
            )}
          </Card.Body>
        )}
      </Card>

      <TrackerFilters
        show={showFilters}
        onHide={() => setShowFilters(false)}
        filters={filters}
        onApply={setFilters}
        onReset={resetFilters}
      />
    </Col>
  );
}

export default function TrackerOverview() {
  return (
    <TrackerSelectionProvider>
      <TrackerOverviewInner />
    </TrackerSelectionProvider>
  );
}
