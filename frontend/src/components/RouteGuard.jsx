import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

export default function RouteGuard({ children, requiredAccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkAccess();
  }, [requiredAccess]);

  // ✅ Function to redirect to first available page
  const redirectToAvailablePage = async () => {
    try {
      // Define available pages in priority order
      const availablePages = [
        // Tier 1: Dashboard/Overview (Highest Priority) — Tracker is primary GPS dashboard
        { access: 'trackerOverview', path: '/dashboard/fleet-analytics' },
        { access: 'craneOverview', path: '/dashboard/crane-overview' },
        { access: 'elevatorOverview', path: '/dashboard/elevator-overview' },
        { access: 'energyOverview', path: '/dashboard/energy-overview' },
        { access: 'fleetAlarms', path: '/dashboard/energy-alarms' },
        
        // Tier 2: Device Management (Medium Priority)  
        { access: 'addDevices', path: '/dashboard/adddevice' },
        
        // Tier 3: Administrative (Lowest Priority)
        { access: 'addUsers', path: '/dashboard/adduser' },
        { access: 'settings', path: '/dashboard/settings' }
      ];

      // Check each page access
      for (const page of availablePages) {
        try {
          const response = await axios.get(`/api/check-dashboard-access/${page.access}`, {
            withCredentials: true
          });
          
          if (response.data.hasAccess) {
            console.log(`✅ Redirecting to available page: ${page.path}`);
            navigate(page.path);
            return;
          }
        } catch (err) {
          console.error(`❌ Error checking access for ${page.access}:`, err);
          continue;
        }
      }

      // If no pages are available, show error
      setError('No accessible pages found. Please contact your administrator.');
      setLoading(false);
      
    } catch (err) {
      console.error('❌ Error in redirectToAvailablePage:', err);
      setError('Failed to find available pages. Please contact your administrator.');
      setLoading(false);
    }
  };

  const checkAccess = async () => {
    try {
      setLoading(true);
      setError('');

      // Get user info
      const userResponse = await axios.get('/api/auth/userinfo', {
        withCredentials: true
      });

      const { role } = userResponse.data;
      setUserRole(role);

      // Superadmin has access to everything
      if (role === 'superadmin') {
        setHasAccess(true);
        setLoading(false);
        return;
      }

      // Check specific dashboard access
      const accessResponse = await axios.get(`/api/check-dashboard-access/${requiredAccess}`, {
        withCredentials: true
      });

      setHasAccess(accessResponse.data.hasAccess);
      
      if (!accessResponse.data.hasAccess) {
        // ✅ Special handling for home page access denial
        if (requiredAccess === 'home') {
          await redirectToAvailablePage();
          return;
        }
        setError(`Access denied. You don't have permission to access this page.`);
      }

    } catch (err) {
      console.error('❌ Route guard error:', err);
      setError('Failed to verify access permissions.');
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="text-center">
          <Spinner animation="border" />
          <p className="mt-2">Checking access permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="text-center">
          <Alert variant="danger">
            <h5>🚫 Access Denied</h5>
            <p>{error || 'You do not have permission to access this page.'}</p>
            <p>Current role: <strong>{userRole}</strong></p>
            <p>Required access: <strong>{requiredAccess}</strong></p>
          </Alert>
        </div>
      </div>
    );
  }

  return children;
} 