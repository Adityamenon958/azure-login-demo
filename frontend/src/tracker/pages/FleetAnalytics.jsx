import React from 'react';
import { Col } from 'react-bootstrap';
import TrackerTopNav from '../components/nav/TrackerTopNav';
import styles from '../styles/TrackerOverview.module.css';

/**
 * ✅ Placeholder page — analytics widgets land here in a later phase.
 */
export default function FleetAnalytics() {
  return (
    <Col xs={12} md={9} lg={10} xl={10} className={`${styles.page} p-3`}>
      <TrackerTopNav />

      <div
        className="d-flex flex-column justify-content-center align-items-center text-center"
        style={{ minHeight: '55vh' }}
      >
        <h4 className="mb-2" style={{ fontWeight: 600, color: '#0f172a' }}>
          Fleet Analytics
        </h4>
        <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
          Coming Soon...
        </p>
      </div>
    </Col>
  );
}
