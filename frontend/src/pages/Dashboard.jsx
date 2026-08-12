// frontend/src/pages/Dashboard.jsx

import React, { useEffect, useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { Outlet, useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import axios from 'axios';

const Dashboard = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [zoneFilter, setZoneFilter] = useState(() => localStorage.getItem('elevatorOverviewZoneFilter') || '');

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

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    localStorage.setItem('elevatorOverviewZoneFilter', zoneFilter);
  }, [zoneFilter]);

  if (!authChecked) return null; // Optional: Add loader

  return (
    <Container fluid className={styles.dashboard}>
      <Topbar
        toggleSidebar={toggleSidebar}
        zoneFilter={zoneFilter}
        onZoneChange={setZoneFilter}
      />
      <Row className="flex-grow-1 g-0">
        <Sidebar isOpen={sidebarOpen} closeSidebar={closeSidebar} />
        <Col className="p-0">
          <Outlet context={{ zoneFilter, setZoneFilter }} />
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
