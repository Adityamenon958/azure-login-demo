import React, { useState, useEffect } from 'react';
import { Form, Button, Spinner, Alert } from 'react-bootstrap';
import { 
  Building2, 
  Save, 
  Shield, 
  Home, 
  Truck, 
  ArrowUpDown, 
  Users, 
  Settings, 
  CreditCard,
  Zap,
  Radio,
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import axios from 'axios';
import styles from './CompanyDashboardAccessManager.module.css';

export default function CompanyDashboardAccessManager() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userRole, setUserRole] = useState('');

  // ✅ Keep in sync with Sidebar + RouteGuard + CompanyDashboardAccess model
  const dashboards = [
    { key: 'home', name: 'Home', icon: Home, default: true },
    { key: 'trackerOverview', name: 'Fleet Monitor / Fleet Map', icon: Radio, default: false },
    { key: 'craneOverview', name: 'Crane Overview', icon: Truck, default: false },
    { key: 'elevatorOverview', name: 'Elevator Overview', icon: ArrowUpDown, default: false },
    { key: 'energyOverview', name: 'Energy Overview', icon: Zap, default: false },
    { key: 'fleetAlarms', name: 'Fleet Alarms', icon: Bell, default: false },
    { key: 'craneDashboard', name: 'Crane Dashboard', icon: Truck, default: false },
    { key: 'addUsers', name: 'Manage Users', icon: Users, default: true },
    { key: 'addDevices', name: 'Manage Device', icon: Shield, default: true },
    { key: 'subscription', name: 'Subscription', icon: CreditCard, default: true },
    { key: 'settings', name: 'Settings', icon: Settings, default: true },
  ];

  const defaultDashboardAccess = Object.fromEntries(
    dashboards.map((d) => [d.key, d.default === true])
  );

  /** Merge stored access with defaults so new dashboards appear for old companies */
  const normalizeCompanyAccess = (company) => {
    const stored = company?.dashboardAccess || {};
    const merged = { ...defaultDashboardAccess, ...stored };
    // ✅ Older records had Fleet Alarms tied to Energy — preserve that until superadmin changes it
    if (stored.fleetAlarms === undefined && stored.energyOverview === true) {
      merged.fleetAlarms = true;
    }
    return merged;
  };

  // Fetch companies and their access
  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const response = await axios.get('/api/auth/userinfo', {
        withCredentials: true
      });
      
      const { role } = response.data;
      setUserRole(role);
      console.log('🔍 Current user role:', role);
      
      if (role === 'superadmin') {
        console.log('✅ User is superadmin, fetching companies...');
        fetchCompanies();
      } else {
        console.log('❌ User is not superadmin, access denied');
        setError('Access denied. Only superadmin can view this page.');
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ Failed to check user role:', err);
      setError('Failed to verify user permissions.');
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('🔍 Fetching companies from API...');
      
      const response = await axios.get('/api/company-dashboard-access', {
        withCredentials: true
      });
      
      console.log('✅ API Response:', response.data);
      const normalized = (response.data.companies || []).map((company) => ({
        ...company,
        dashboardAccess: normalizeCompanyAccess(company),
      }));
      setCompanies(normalized);
      console.log('✅ Companies loaded:', normalized);
    } catch (err) {
      console.error('❌ Failed to load companies:', err);
      
      if (err.response?.status === 403) {
        setError('Access denied. Only superadmin can view this page.');
      } else if (err.response?.status === 404) {
        setError('API endpoint not found. Please check if the server is running.');
      } else if (err.code === 'ERR_NETWORK') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(`Failed to load companies: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle radio button change
  const handleAccessChange = (companyName, dashboardKey, value) => {
    setCompanies(prev => prev.map(company => {
      if (company.companyName === companyName) {
        return {
          ...company,
          dashboardAccess: {
            ...company.dashboardAccess,
            [dashboardKey]: value
          }
        };
      }
      return company;
    }));
  };

  // Save changes for specific company
  const handleSave = async (companyName) => {
    try {
      setSaving(true);
      setError('');
      const company = companies.find(c => c.companyName === companyName);
      
      await axios.put(`/api/company-dashboard-access/${companyName}`, {
        dashboardAccess: company.dashboardAccess
      }, { withCredentials: true });

      setSuccess(`Access updated for ${companyName}`);
      setTimeout(() => setSuccess(''), 3000);
      console.log('✅ Access updated for:', companyName);
    } catch (err) {
      console.error('❌ Failed to update access:', err);
      
      if (err.response?.status === 403) {
        setError(`Access denied. You need superadmin privileges to update ${companyName}`);
      } else if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
      } else {
        setError(`Failed to update ${companyName}: ${err.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  // Save all changes
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError('');
      
      for (const company of companies) {
        await axios.put(`/api/company-dashboard-access/${company.companyName}`, {
          dashboardAccess: company.dashboardAccess
        }, { withCredentials: true });
      }

      setSuccess('All changes saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
      console.log('✅ All changes saved successfully');
    } catch (err) {
      console.error('❌ Failed to save all changes:', err);
      
      if (err.response?.status === 403) {
        setError('Access denied. You need superadmin privileges to update company access.');
      } else if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
      } else {
        setError(`Failed to save all changes: ${err.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner animation="border" className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Loading companies...</p>
      </div>
    );
  }

  // ✅ Early return if user is not superadmin
  if (userRole !== 'superadmin') {
    return (
      <div className={styles.accessDeniedContainer}>
        <div className={styles.accessDeniedIcon}>🚫</div>
        <h5 className={styles.accessDeniedTitle}>Access Denied</h5>
        <p className={styles.accessDeniedText}>Only superadmin users can access this page.</p>
        <p className={styles.accessDeniedText}>Current role: <span className={styles.accessDeniedRole}>{userRole}</span></p>
        <p className={styles.accessDeniedText}>Please login with a superadmin account to manage company access.</p>
      </div>
    );
  }

  // ✅ Additional check to prevent rendering if companies are empty
  if (!companies || companies.length === 0) {
    return (
      <div className={styles.noCompaniesContainer}>
        <div className={styles.noCompaniesIcon}>⚠️</div>
        <h5 className={styles.noCompaniesTitle}>No Companies Found</h5>
        <p className={styles.noCompaniesText}>No companies are available to manage access for.</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardAccessContainer}>
      <div className={styles.headerSection}>
        <div className={styles.headerTitle}>
          <Building2 className={styles.headerIcon} />
          Company Dashboard Access Control
        </div>
        <Button 
          className={styles.saveAllButton}
          onClick={handleSaveAll}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} className="me-2" />
              Save All Changes
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className={styles.alertContainer}>
          <Alert variant="danger" className={styles.alert + ' ' + styles.alertDanger}>
            <AlertTriangle size={16} className="me-2" />
            {error}
          </Alert>
        </div>
      )}
      
      {success && (
        <div className={styles.alertContainer}>
          <Alert variant="success" className={styles.alert + ' ' + styles.alertSuccess}>
            <CheckCircle size={16} className="me-2" />
            {success}
          </Alert>
        </div>
      )}

      {companies.map(company => (
        <div key={company.companyName} className={styles.companyCard}>
          <div className={styles.companyHeader}>
            <div className={styles.companyName}>
              <Building2 className={styles.companyIcon} />
              {company.companyName}
            </div>
            <Button
              className={styles.saveButton}
              onClick={() => handleSave(company.companyName)}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} className="me-2" />
                  Save
                </>
              )}
            </Button>
          </div>

          <div className={styles.permissionsGrid}>
            {dashboards.map(dashboard => {
              const IconComponent = dashboard.icon;
              const isAllowed = company.dashboardAccess[dashboard.key] === true;
              
              return (
                <div 
                  key={dashboard.key} 
                  className={`${styles.permissionItem} ${isAllowed ? styles.allowed : styles.denied}`}
                >
                  <div className={styles.statusIndicator + ' ' + (isAllowed ? styles.allowed : styles.denied)}></div>
                  
                  <div className={styles.permissionHeader}>
                    <div className={styles.permissionName}>
                      <IconComponent className={styles.permissionIcon} />
                      {dashboard.name}
                    </div>
                  </div>

                  <div className={styles.permissionControls}>
                    <div className={styles.radioGroup}>
                      <label className={`${styles.radioOption} ${styles.allow}`}>
                        <input
                          type="radio"
                          name={`${company.companyName}-${dashboard.key}`}
                          checked={isAllowed}
                          onChange={() => handleAccessChange(company.companyName, dashboard.key, true)}
                        />
                        Allow
                      </label>
                      
                      <label className={`${styles.radioOption} ${styles.deny}`}>
                        <input
                          type="radio"
                          name={`${company.companyName}-${dashboard.key}`}
                          checked={!isAllowed}
                          onChange={() => handleAccessChange(company.companyName, dashboard.key, false)}
                        />
                        Deny
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 