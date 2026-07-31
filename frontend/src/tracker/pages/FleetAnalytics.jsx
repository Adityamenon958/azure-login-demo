import React, { lazy, Suspense, useState } from 'react';
import { Alert, Col, Spinner } from 'react-bootstrap';
import TrackerTopNav from '../components/nav/TrackerTopNav';
import AnalyticsFilterBar from '../components/analytics/AnalyticsFilterBar';
import FleetKpiCards from '../components/analytics/FleetKpiCards';
import VehicleRankings from '../components/analytics/VehicleRankings';
import VehicleAnalyticsTable from '../components/analytics/VehicleAnalyticsTable';
import VehicleDrilldown from '../components/analytics/VehicleDrilldown';
import { useFleetAnalytics } from '../hooks/useFleetAnalytics';
import styles from '../styles/TrackerOverview.module.css';

const AnalyticsCharts = lazy(() => import('../components/analytics/AnalyticsCharts'));

/**
 * Fleet Analytics — historical operations dashboard (not live tracking).
 */
export default function FleetAnalytics() {
  const {
    range,
    applyPreset,
    summary,
    vehicles,
    rankings,
    loading,
    error,
    page,
    setPage,
    sort,
    setSort,
    search,
    setSearch,
    refresh,
  } = useFleetAnalytics('7d');

  const [selectedId, setSelectedId] = useState(null);

  const handleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'desc' }
    );
  };

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <TrackerTopNav lastUpdated={summary ? new Date() : null} onRefresh={refresh} />

      <AnalyticsFilterBar
        preset={range.preset}
        onPreset={applyPreset}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        from={range.from}
        to={range.to}
        onRefresh={refresh}
      />

      {error && (
        <Alert variant="warning" className="py-2" style={{ fontSize: '0.8rem' }}>
          {error}
          <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={refresh}>
            Retry
          </button>
        </Alert>
      )}

      <FleetKpiCards kpis={summary?.kpis} loading={loading && !summary} />

      <Suspense
        fallback={
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
          </div>
        }
      >
        <AnalyticsCharts
          series={summary?.series || []}
          kpis={summary?.kpis}
          loading={loading && !summary}
        />
      </Suspense>

      <VehicleRankings
        rankings={rankings}
        offline={summary?.offline}
        onSelect={setSelectedId}
      />

      {selectedId && (
        <VehicleDrilldown
          deviceId={selectedId}
          from={range.from}
          to={range.to}
          onClose={() => setSelectedId(null)}
        />
      )}

      <VehicleAnalyticsTable
        data={vehicles}
        loading={loading && !vehicles}
        sort={sort}
        onSort={handleSort}
        page={page}
        onPage={setPage}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </Col>
  );
}
