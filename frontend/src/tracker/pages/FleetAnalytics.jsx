import React, { lazy, Suspense, useState } from 'react';
import { Alert, Col, Spinner } from 'react-bootstrap';
import TrackerTopNav from '../components/nav/TrackerTopNav';
import AnalyticsFilterBar from '../components/analytics/AnalyticsFilterBar';
import FleetKpiCards from '../components/analytics/FleetKpiCards';
import AnalyticsVehicleGrid from '../components/analytics/AnalyticsVehicleGrid';
import VehicleAnalyticsTable from '../components/analytics/VehicleAnalyticsTable';
import VehicleDrilldown from '../components/analytics/VehicleDrilldown';
import { useFleetAnalytics } from '../hooks/useFleetAnalytics';
import { useTimestampTick } from '../hooks/useTimestampTick';
import styles from '../styles/TrackerOverview.module.css';

const AnalyticsCharts = lazy(() => import('../components/analytics/AnalyticsCharts'));

/**
 * Fleet Analytics — operational dashboard.
 * Hierarchy: KPIs → Vehicle Card Grid → Trends → Table.
 */
export default function FleetAnalytics() {
  const {
    range,
    applyPreset,
    applyCustomRange,
    shiftRangeByDays,
    summary,
    vehicles,
    vehiclesWithLive,
    vehicleTotal,
    hasMore,
    loadMore,
    loadingMore,
    generatedAt,
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

  const now = useTimestampTick();
  const [selectedId, setSelectedId] = useState(null);

  const distanceLabel = range.preset === 'today' ? 'Today' : 'In range';

  // Disable next when range already ends at/near now (same calendar day in IST)
  const canGoNext = (() => {
    const to = new Date(range.to);
    if (Number.isNaN(to.getTime())) return false;
    const end = new Date();
    return to.getTime() < end.getTime() - 60 * 1000;
  })();

  const handleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'desc' }
    );
  };

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <TrackerTopNav lastUpdated={generatedAt} onRefresh={refresh} />

      <AnalyticsFilterBar
        preset={range.preset}
        onPreset={applyPreset}
        onCustomRange={applyCustomRange}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        from={range.from}
        to={range.to}
        onPrevDay={() => shiftRangeByDays(-1)}
        onNextDay={() => shiftRangeByDays(1)}
        canGoNext={canGoNext}
      />

      {error && (
        <Alert variant="warning" className="py-2" style={{ fontSize: '0.8rem' }}>
          {error}
          <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={refresh}>
            Retry
          </button>
        </Alert>
      )}

      {/* 1. Summary KPIs */}
      <FleetKpiCards kpis={summary?.kpis} loading={loading && !summary} />

      {/* 2. Primary — Vehicle Card Grid */}
      <AnalyticsVehicleGrid
        items={vehiclesWithLive}
        loading={loading && vehiclesWithLive.length === 0}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        distanceLabel={distanceLabel}
        total={vehicleTotal}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />

      {/* 3. Secondary — Fleet trends */}
      <Suspense
        fallback={
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        }
      >
        <AnalyticsCharts
          series={summary?.series || []}
          loading={loading && !summary}
        />
      </Suspense>

      {/* 4. Drilldown + detailed table */}
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
        loading={loading && !vehicles?.items?.length}
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
