import React, { useEffect, useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { Outlet, useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import { TrackerDataSourceProvider } from '../tracker/context/TrackerDataSourceContext';
import { KioskModeProvider, useKioskMode } from '../context/KioskModeContext';
import axios from 'axios';
import { Minimize2 } from 'lucide-react';

function DashboardShell({
  sidebarOpen,
  toggleSidebar,
  closeSidebar,
  zoneFilter,
  setZoneFilter,
}) {
  const { isKiosk, exitKiosk } = useKioskMode();

  return (
    <Container
      fluid
      className={`${styles.dashboard} ${isKiosk ? styles.kiosk : ''}`}
    >
      {!isKiosk && (
        <Topbar
          toggleSidebar={toggleSidebar}
          zoneFilter={zoneFilter}
          onZoneChange={setZoneFilter}
        />
      )}
      <Row className={`flex-grow-1 g-0 ${isKiosk ? styles.kioskRow : ''}`}>
        {!isKiosk && <Sidebar isOpen={sidebarOpen} closeSidebar={closeSidebar} />}
        <Col className={`p-0 ${isKiosk ? styles.kioskContent : ''}`}>
          <Outlet context={{ zoneFilter, setZoneFilter }} />
        </Col>
      </Row>

      {isKiosk && (
        <button
          type="button"
          className={styles.kioskExit}
          onClick={exitKiosk}
          title="Exit kiosk mode (Esc)"
        >
          <Minimize2 size={14} strokeWidth={2} />
          Exit kiosk
        </button>
      )}
    </Container>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [zoneFilter, setZoneFilter] = useState(
    () => localStorage.getItem('elevatorOverviewZoneFilter') || ''
  );

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        await axios.get('/api/auth/userinfo', { withCredentials: true });
        setAuthChecked(true);
      } catch (err) {
        navigate('/');
      }
    };

    verifyAuth();
  }, [navigate]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    localStorage.setItem('elevatorOverviewZoneFilter', zoneFilter);
  }, [zoneFilter]);

  if (!authChecked) return null;

  return (
    <TrackerDataSourceProvider>
      <KioskModeProvider>
        <DashboardShell
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          closeSidebar={closeSidebar}
          zoneFilter={zoneFilter}
          setZoneFilter={setZoneFilter}
        />
      </KioskModeProvider>
    </TrackerDataSourceProvider>
  );
};

export default Dashboard;
