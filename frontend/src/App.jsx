import React, { useEffect, useState } from 'react';
import { Routes, Route,Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ReportsPage from './pages/ReportsPage';
import Settings from './pages/Settings';
import ManageCompany from './pages/ManageCompany';
import AddUser from './pages/ManageCompany';
import AddUserHome from './pages/AddUserHome';
import AddUser2 from './pages/AddUser2';
import DashboardHome2 from './pages/DashboardHome2';
import AddDevice from './pages/AddDevices';
import Subscription from './pages/Subscription';
import FullPageSpinner from './components/FullPageSpinner';
import LoginCarousel from './components/login/LoginCarousel';
import RouteGuard from './components/RouteGuard';
import './App.css';
import DynamicDb from './components/DynamicDb';
import CraneDashboard from './pages/CraneDashboard';
import CraneOverview from './pages/CraneOverview';
import ElevatorOverview from './pages/ElevatorOverview';
import EnergyOverview from './pages/EnergyOverview';
import EnergyFleetAlarmSettings from './pages/EnergyFleetAlarmSettings';
import Simulator from './pages/Simulator';
import SimulatorRouteGuard from './components/SimulatorRouteGuard';
import TrackerOverview from './tracker/pages/TrackerOverview';
import TrackerDeviceDetail from './tracker/pages/TrackerDeviceDetail';
import FleetAnalytics from './tracker/pages/FleetAnalytics';
import AttendanceDashboard from './attendance/pages/AttendanceDashboard';

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay — replace this with token check or API call later
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return <FullPageSpinner />;
  }

  return (
    <Routes>
      <Route path="/" element={<LoginCarousel />} />

      <Route path="/dashboard" element={<Dashboard />}>
        <Route index element={
          <RouteGuard requiredAccess="home">
            <DashboardHome2 />
          </RouteGuard>
        } />
        {/* <Route path="dynamicdb" element={<DynamicDb />} /> */}
        <Route path="device" element={<Navigate to="GS-1234" replace />} />
        <Route path="device/:deviceId" element={<DynamicDb />} />
        <Route path="crane" element={<CraneDashboard />} />

        {/* ✅ Tracker Overview — primary GPS dashboard (independent of Crane) */}
        <Route path="tracker-overview" element={
          <RouteGuard requiredAccess="trackerOverview">
            <TrackerOverview />
          </RouteGuard>
        } />
        <Route path="tracker/:deviceId" element={
          <RouteGuard requiredAccess="trackerOverview">
            <TrackerDeviceDetail />
          </RouteGuard>
        } />
        {/* ✅ Fleet Analytics — placeholder page under the Tracker module */}
        <Route path="fleet-analytics" element={
          <RouteGuard requiredAccess="trackerOverview">
            <FleetAnalytics />
          </RouteGuard>
        } />
        <Route path="attendance" element={
          <RouteGuard requiredAccess="trackerOverview">
            <AttendanceDashboard />
          </RouteGuard>
        } />
        
        {/* ✅ Protected Routes with Access Control */}
        <Route path="crane-overview" element={
          <RouteGuard requiredAccess="craneOverview">
            <CraneOverview />
          </RouteGuard>
        } />
        
        <Route path="elevator-overview" element={
          <RouteGuard requiredAccess="elevatorOverview">
            <ElevatorOverview />
          </RouteGuard>
        } />

        <Route path="energy-overview" element={
          <RouteGuard requiredAccess="energyOverview">
            <EnergyOverview />
          </RouteGuard>
        } />

        <Route path="energy-alarms" element={
          <RouteGuard requiredAccess="fleetAlarms">
            <EnergyFleetAlarmSettings />
          </RouteGuard>
        } />
        
        <Route path="reports" element={
          <RouteGuard requiredAccess="reports">
            <ReportsPage />
          </RouteGuard>
        } />
        
        <Route path="settings" element={
          <RouteGuard requiredAccess="settings">
            <Settings />
          </RouteGuard>
        } />
        
        <Route
          path="/dashboard/managecompany"
          element={
            <AddUser>
              <ManageCompany />
            </AddUser>
          }
        />
        
        <Route
          path="/dashboard/adduser"
          element={
            <RouteGuard requiredAccess="addUsers">
            <AddUser2>
              <AddUserHome />
            </AddUser2>
            </RouteGuard>
          }
        />
        
        <Route path="adddevice" element={
          <RouteGuard requiredAccess="addDevices">
            <AddDevice />
          </RouteGuard>
        } />
        
        <Route path="subscription" element={
          <RouteGuard requiredAccess="subscription">
            <Subscription />
          </RouteGuard>
        } />
        
        {/* ✅ Simulator — superadmin + Azure (or ENABLE_SIMULATOR=true locally) */}
        <Route path="simulator" element={
          <SimulatorRouteGuard>
            <Simulator />
          </SimulatorRouteGuard>
        } />
      </Route>
    </Routes>
  );
}

export default App;
