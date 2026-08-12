import React, { useRef, useEffect, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Activity,
  Radio,
  Map,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  UserPlus,
  PlusSquare,
  Truck,
  Zap,
  Bell,
  User,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { googleLogout } from '@react-oauth/google';
import styles from './Sidebar.module.css';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import { MdOutlineSubscriptions } from 'react-icons/md';
import { PiElevatorDuotone } from 'react-icons/pi';
import Dlogo from './assets/GSN Solutions 1.png';

import axios from 'axios';

// ✅ Connectwell-like density — keep all icons the same size
const ICON = 16;

export default function Sidebar({ isOpen, closeSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef(null);

  const [role, setRole] = useState('');
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [companyAccess, setCompanyAccess] = useState({});
  const [accessLoading, setAccessLoading] = useState(true);
  const [simulatorAvailable, setSimulatorAvailable] = useState(false);

  // ✅ Securely fetch role & companyName from backend cookies
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await axios.get('/api/auth/userinfo', { withCredentials: true });
        setRole(res.data.role);
        setCompanyName(res.data.companyName);
        setUserName(res.data.name || res.data.email || '');

        // ✅ Fetch company access permissions (only for non-superadmin users)
        if (res.data.role !== 'superadmin') {
          await fetchCompanyAccess(res.data.companyName);
        } else {
          setAccessLoading(false);
          try {
            const simRes = await axios.get('/api/sim/availability', { withCredentials: true });
            setSimulatorAvailable(simRes.data.enabled === true);
          } catch {
            setSimulatorAvailable(false);
          }
        }
      } catch (err) {
        console.error('❌ Failed to fetch user info from cookies:', err.message);
        setAccessLoading(false);
      }
    };

    const fetchSubscriptionStatus = async () => {
      try {
        const res = await axios.get('/api/subscription/status', { withCredentials: true });
        setSubscriptionStatus(res.data.active ? 'active' : 'inactive');
      } catch (err) {
        console.error('❌ Failed to fetch subscription status:', err.message);
        setSubscriptionStatus('inactive');
      }
    };

    const fetchCompanyAccess = async (company) => {
      try {
        // ✅ Use individual access check for each dashboard
        const accessChecks = await Promise.all([
          axios.get('/api/check-dashboard-access/home', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/dashboard', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/trackerOverview', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/craneOverview', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/elevatorOverview', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/energyOverview', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/fleetAlarms', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/reports', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/addUsers', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/addDevices', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/subscription', { withCredentials: true }),
          axios.get('/api/check-dashboard-access/settings', { withCredentials: true }),
        ]);

        const access = {
          home: accessChecks[0].data.hasAccess,
          dashboard: accessChecks[1].data.hasAccess,
          trackerOverview: accessChecks[2].data.hasAccess,
          craneOverview: accessChecks[3].data.hasAccess,
          elevatorOverview: accessChecks[4].data.hasAccess,
          energyOverview: accessChecks[5].data.hasAccess,
          fleetAlarms: accessChecks[6].data.hasAccess,
          reports: accessChecks[7].data.hasAccess,
          addUsers: accessChecks[8].data.hasAccess,
          addDevices: accessChecks[9].data.hasAccess,
          subscription: accessChecks[10].data.hasAccess,
          settings: accessChecks[11].data.hasAccess,
        };

        setCompanyAccess(access);
        console.log('✅ Company access loaded for:', company, access);
      } catch (err) {
        console.error('❌ Failed to fetch company access:', err.message);
        // Set default access if API fails
        setCompanyAccess({
          home: true,
          dashboard: true,
          trackerOverview: false,
          craneOverview: false,
          elevatorOverview: false,
          energyOverview: false,
          fleetAlarms: false,
          craneDashboard: false,
          reports: true,
          addUsers: true,
          addDevices: true,
          subscription: true,
          settings: true,
        });
      } finally {
        setAccessLoading(false);
      }
    };

    fetchUserInfo();
    fetchSubscriptionStatus();
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/logout', {}, { withCredentials: true });
      googleLogout();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err.message);
      navigate('/');
    }
  };

  const go = (path) => {
    navigate(path);
    if (typeof window !== 'undefined' && window.innerWidth < 800) {
      closeSidebar?.();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        closeSidebar();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeSidebar]);

  const isActive = (match) =>
    typeof match === 'function' ? match(location.pathname) : location.pathname === match;

  const navBtn = (pathOrFn, className, children, extra = {}) => (
    <button
      type="button"
      className={`${styles.iconButton} ${isActive(pathOrFn) ? styles.active : ''}`}
      onClick={() => {
        if (typeof pathOrFn === 'string') go(pathOrFn);
      }}
      {...extra}
    >
      <span className={styles.iconButtonInner}>{children}</span>
    </button>
  );

  if (accessLoading) {
    return (
      <div className={`${styles.sidebarWrapper} ${isOpen ? styles.open : ''}`}>
        <div className={styles.sidebar}>
          <div className={styles.loadingWrap}>
            <Spinner animation="border" size="sm" variant="secondary" />
          </div>
        </div>
      </div>
    );
  }

  const roleLabel = role ? String(role) : '';
  const companyLine = [roleLabel, companyName].filter(Boolean).join(' · ');

  return (
    <div className={`${styles.sidebarWrapper} ${isOpen ? styles.open : ''}`} ref={sidebarRef}>
      {/* ✅ Plain div — Bootstrap Col gutters were insetting the divider lines */}
      <div className={styles.sidebar}>
        {/* ✅ Company Branding — mobile drawer */}
        <div className={styles.sidebarBranding}>
          <div className="d-flex align-items-center">
            <img src={Dlogo} className={`${styles.sidebarLogo} me-2`} alt="Logo" />
            <div className="d-flex flex-column">
              <h5 className={`${styles.sidebarCompanyName} mb-0`}>
                {companyName || 'Company'}
              </h5>
              <small className={styles.sidebarSubtitle}>Edge</small>
            </div>
          </div>
        </div>

        <div className={styles.navScroll}>
          <nav className={styles.navList} aria-label="Main">
            {/* ✅ Home */}
            {(role === 'superadmin' || companyAccess.home) &&
              navBtn('/dashboard', null, (
                <>
                  <LayoutDashboard size={ICON} />
                  <span className={styles.navText}>Home</span>
                </>
              ))}

            {/* ✅ Dashboard */}
            {(role === 'superadmin' || companyAccess.dashboard) &&
              navBtn('/dashboard/device', null, (
                <>
                  <FileText size={ICON} />
                  <span className={styles.navText}>Dashboard</span>
                </>
              ))}

            {/* ✅ Fleet Monitor — Fleet Map + Attendance only while inside this section */}
            {(role === 'superadmin' || companyAccess.trackerOverview) && (() => {
              const onFleetSection =
                location.pathname === '/dashboard/fleet-analytics' ||
                location.pathname === '/dashboard/tracker-overview' ||
                location.pathname === '/dashboard/attendance' ||
                /^\/dashboard\/tracker\/.+/.test(location.pathname);
              const onFleetMonitor =
                location.pathname === '/dashboard/fleet-analytics' ||
                /^\/dashboard\/tracker\/.+/.test(location.pathname);
              const onFleetMap = location.pathname === '/dashboard/tracker-overview';
              const onAttendance = location.pathname === '/dashboard/attendance';

              return (
                <div className={styles.navGroup}>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${onFleetMonitor ? styles.active : ''}`}
                    onClick={() => go('/dashboard/fleet-analytics')}
                  >
                    <span className={`${styles.iconButtonInner} ${styles.navParentInner}`}>
                      <Radio size={ICON} />
                      <span className={styles.navText}>Fleet Monitor</span>
                      {onFleetSection ? (
                        <ChevronUp size={14} className={styles.navChevron} aria-hidden />
                      ) : (
                        <ChevronDown size={14} className={styles.navChevron} aria-hidden />
                      )}
                    </span>
                  </button>
                  {onFleetSection && (
                    <>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.navSubItem} ${
                          onFleetMap ? styles.active : ''
                        }`}
                        onClick={() => go('/dashboard/tracker-overview')}
                      >
                        <span className={`${styles.iconButtonInner} ${styles.navSubInner}`}>
                          <Map size={ICON} />
                          <span className={styles.navText}>Fleet Map</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.navSubItem} ${
                          onAttendance ? styles.active : ''
                        }`}
                        onClick={() => go('/dashboard/attendance')}
                      >
                        <span className={`${styles.iconButtonInner} ${styles.navSubInner}`}>
                          <ClipboardList size={ICON} />
                          <span className={styles.navText}>Attendance</span>
                        </span>
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ✅ Crane Overview */}
            {(role === 'superadmin' || companyAccess.craneOverview) &&
              navBtn('/dashboard/crane-overview', null, (
                <>
                  <Truck size={ICON} />
                  <span className={styles.navText}>Crane Overview</span>
                </>
              ))}

            {/* ✅ Elevator Overview */}
            {(role === 'superadmin' || companyAccess.elevatorOverview) &&
              navBtn('/dashboard/elevator-overview', null, (
                <>
                  <PiElevatorDuotone size={ICON} />
                  <span className={styles.navText}>Elevator Overview</span>
                </>
              ))}

            {/* ✅ Energy Overview */}
            {(role === 'superadmin' || companyAccess.energyOverview) &&
              navBtn('/dashboard/energy-overview', null, (
                <>
                  <Zap size={ICON} />
                  <span className={styles.navText}>Energy Overview</span>
                </>
              ))}

            {(role === 'superadmin' || companyAccess.fleetAlarms) &&
              navBtn('/dashboard/energy-alarms', null, (
                <>
                  <Bell size={ICON} />
                  <span className={styles.navText}>Fleet Alarms</span>
                </>
              ))}

            {/* ✅ Reports */}
            {(role === 'superadmin' || companyAccess.reports) &&
              navBtn('/dashboard/reports', null, (
                <>
                  <FileText size={ICON} />
                  <span className={styles.navText}>Report</span>
                </>
              ))}

            {/* ✅ Manage Company — Superadmin only */}
            {role === 'superadmin' && (
              <button
                type="button"
                className={`${styles.iconButton2} ${
                  location.pathname === '/dashboard/managecompany' ? styles.active2 : ''
                }`}
                onClick={() => go('/dashboard/managecompany')}
              >
                <span className={styles.iconButtonInner}>
                  <HiOutlineOfficeBuilding size={ICON} />
                  <span className={styles.Text}>Manage Company</span>
                </span>
              </button>
            )}

            {/* ✅ Simulator — superadmin only */}
            {role === 'superadmin' && simulatorAvailable &&
              navBtn('/dashboard/simulator', null, (
                <>
                  <Activity size={ICON} />
                  <span className={styles.navText}>Simulator</span>
                </>
              )            )}

            {/* ✅ Manage Users */}
            {((role === 'admin' && companyAccess.addUsers) || role === 'superadmin') && (
              <button
                type="button"
                className={`${styles.iconButton} ${
                  location.pathname === '/dashboard/adduser' ? styles.active : ''
                }`}
                onClick={() => go('/dashboard/adduser')}
                disabled={subscriptionStatus !== 'active' && role !== 'superadmin'}
              >
                <span className={styles.iconButtonInner}>
                  <UserPlus size={ICON} />
                  <span className={styles.navText}>Manage Users</span>
                </span>
              </button>
            )}

            {/* ✅ Manage Device */}
            {((role === 'admin' && companyAccess.addDevices) || role === 'superadmin') && (
              <button
                type="button"
                className={`${styles.iconButton} ${
                  location.pathname === '/dashboard/adddevice' ? styles.active : ''
                }`}
                onClick={() => go('/dashboard/adddevice')}
                disabled={subscriptionStatus !== 'active' && role !== 'superadmin'}
              >
                <span className={styles.iconButtonInner}>
                  <PlusSquare size={ICON} />
                  <span className={styles.navText}>Manage Device</span>
                </span>
              </button>
            )}

            {/* ✅ Subscription */}
            {(role === 'superadmin' || companyAccess.subscription) &&
              navBtn('/dashboard/subscription', null, (
                <>
                  <MdOutlineSubscriptions size={ICON} />
                  <span className={styles.navText}>Subscription</span>
                </>
              ))}

            {/* ✅ Settings */}
            {(role === 'superadmin' || companyAccess.settings) &&
              navBtn('/dashboard/settings', null, (
                <>
                  <Settings size={ICON} />
                  <span className={styles.navText}>Settings</span>
                </>
              ))}
          </nav>
        </div>

        {/* ✅ Bottom profile + Log out (Connectwell pattern) */}
        <div className={styles.sidebarFooter}>
          <div className={styles.userBlock}>
            <div className={styles.userAvatar} aria-hidden>
              <User size={14} />
            </div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{userName || 'User'}</div>
              <div className={styles.userRole}>{companyLine || '—'}</div>
            </div>
          </div>
          <Button className={styles.logoutButton} onClick={handleLogout}>
            <LogOut size={14} />
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
