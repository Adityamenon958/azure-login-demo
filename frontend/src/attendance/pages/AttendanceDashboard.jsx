import React, { lazy, Suspense } from 'react';
import { Col, Spinner } from 'react-bootstrap';
import TrackerTopNav from '../../tracker/components/nav/TrackerTopNav';
import { useAttendanceDashboard } from '../hooks/useAttendanceDashboard';
import AttendanceKpiCards from '../components/AttendanceKpiCards';
import AttendanceFilterBar from '../components/AttendanceFilterBar';
import AttendanceTable from '../components/AttendanceTable';
import pageStyles from '../../tracker/styles/TrackerOverview.module.css';

const AttendanceTrendChart = lazy(() => import('../components/AttendanceTrendChart'));

/**
 * Attendance Dashboard — frontend-only prototype (mock data).
 * Hierarchy: nav → filters → KPIs → trend → table.
 */
export default function AttendanceDashboard() {
  const {
    selectedDate,
    setSelectedDate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    siteFilter,
    setSiteFilter,
    kpis,
    trend,
    employees,
    generatedAt,
    refresh,
  } = useAttendanceDashboard();

  return (
    <Col xs={12} className={`${pageStyles.page} p-3`}>
      <TrackerTopNav lastUpdated={generatedAt} onRefresh={refresh} />

      <AttendanceFilterBar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        siteFilter={siteFilter}
        onSiteChange={setSiteFilter}
      />

      <AttendanceKpiCards kpis={kpis} loading={false} />

      <Suspense
        fallback={
          <div className="text-center py-4 mb-3">
            <Spinner animation="border" size="sm" />
          </div>
        }
      >
        <AttendanceTrendChart series={trend} loading={false} />
      </Suspense>

      <AttendanceTable employees={employees} loading={false} />
    </Col>
  );
}
