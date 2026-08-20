// DashboardHome2.jsx — Azure-style Home portal after login
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronRight,
  Clock3,
  HardDrive,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import styles from './DashboardHome2.module.css';
import {
  ADMIN_TILES,
  DASHBOARD_TILES,
  getTileMetric,
  isTileDisabled,
  isTileVisible,
} from './homePortalTiles';

const ACCESS_KEYS = [
  'home',
  'dashboard',
  'trackerOverview',
  'craneOverview',
  'elevatorOverview',
  'energyOverview',
  'fleetAlarms',
  'reports',
  'addUsers',
  'addDevices',
  'subscription',
  'settings',
];

const RECENT_KEY = 'gsn.home.recentTiles';
const ALL_TILES = [...DASHBOARD_TILES, ...ADMIN_TILES];

function matchesSearch(tile, query) {
  if (!query) return true;
  const haystack = `${tile.title} ${tile.description}`.toLowerCase();
  return haystack.includes(query);
}

function readRecentIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rememberTile(tileId) {
  const next = [tileId, ...readRecentIds().filter((id) => id !== tileId)].slice(0, 4);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function countByType(devices) {
  const byType = { crane: 0, elevator: 0, energyMeter: 0, gpsTracker: 0, levelSensor: 0 };
  for (const device of devices) {
    if (Object.prototype.hasOwnProperty.call(byType, device.deviceType)) {
      byType[device.deviceType] += 1;
    }
  }
  return byType;
}

function PortalTile({ tile, size, disabled, metric, onOpen }) {
  const Icon = tile.icon;
  const metricTone = metric?.tone ? styles[`metric_${metric.tone}`] : '';

  return (
    <button
      type="button"
      className={`${styles.tile} ${size === 'large' ? styles.tileLarge : styles.tileSmall} ${
        disabled ? styles.tileDisabled : ''
      }`}
      style={{ '--tile-accent': tile.accent }}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onOpen(tile);
      }}
    >
      <span className={styles.tileAccent} aria-hidden />
      <span className={styles.tileTop}>
        <span className={styles.iconWrap} aria-hidden>
          <Icon size={size === 'large' ? 20 : 16} />
        </span>
        <ChevronRight size={16} className={styles.tileChevron} aria-hidden />
      </span>
      <h3 className={styles.title}>{tile.title}</h3>
      <p className={styles.description}>{tile.description}</p>
      {disabled && <span className={styles.hint}>Subscription required</span>}
      {!disabled && metric && (
        <span className={`${styles.metric} ${metricTone}`}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </span>
      )}
    </button>
  );
}

export default function DashboardHome2() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [simulatorAvailable, setSimulatorAvailable] = useState(false);
  const [companyAccess, setCompanyAccess] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [insights, setInsights] = useState(null);
  const [recentIds, setRecentIds] = useState(() => readRecentIds());

  useEffect(() => {
    const loadPortal = async () => {
      try {
        const [userRes, subRes] = await Promise.all([
          axios.get('/api/auth/userinfo', { withCredentials: true }),
          axios.get('/api/subscription/status', { withCredentials: true }).catch(() => ({
            data: { active: false },
          })),
        ]);

        const nextRole = userRes.data.role || '';
        const nextCompany = userRes.data.companyName || '';
        setRole(nextRole);
        setUserName(userRes.data.name || userRes.data.email || 'there');
        setCompanyName(nextCompany);
        setSubscriptionStatus(subRes.data.active ? 'active' : 'inactive');

        if (nextRole === 'superadmin') {
          try {
            const simRes = await axios.get('/api/sim/availability', { withCredentials: true });
            setSimulatorAvailable(simRes.data.enabled === true);
          } catch {
            setSimulatorAvailable(false);
          }
        } else {
          // ✅ Same per-flag checks Sidebar uses
          const accessChecks = await Promise.all(
            ACCESS_KEYS.map((key) =>
              axios.get(`/api/check-dashboard-access/${key}`, { withCredentials: true })
            )
          );
          const access = {};
          ACCESS_KEYS.forEach((key, index) => {
            access[key] = accessChecks[index].data.hasAccess;
          });
          setCompanyAccess(access);
        }
      } catch (err) {
        console.error('Home portal load failed:', err.message);
      } finally {
        setLoading(false);
      }
    };

    loadPortal();
  }, []);

  // ✅ Fill live counts after we know who the user is — tiles already visible
  useEffect(() => {
    if (!role) return undefined;

    const loadInsights = async () => {
      const next = {
        companies: null,
        users: null,
        devices: null,
        byType: {},
        fleet: null,
        activeAlarms: null,
        subscriptionStatus,
      };

      const deviceParams = role === 'superadmin' ? {} : { companyName };

      try {
        if (role === 'superadmin') {
          const [cRes, uRes, dRes] = await Promise.all([
            axios.get('/api/companies/count', { withCredentials: true }),
            axios.get('/api/users/count', { withCredentials: true }),
            axios.get('/api/devices/count', { withCredentials: true }),
          ]);
          next.companies = cRes.data.totalCompanies;
          next.users = uRes.data.totalUsers;
          next.devices = dRes.data.totalDevices;
        } else if (role === 'admin') {
          const [uRes, dRes] = await Promise.all([
            axios.get('/api/users/count/by-company', {
              params: { companyName },
              withCredentials: true,
            }),
            axios.get('/api/devices/count/by-company', {
              params: { companyName },
              withCredentials: true,
            }),
          ]);
          next.users = uRes.data.totalUsersByCompany;
          next.devices = dRes.data.totalDevicesByCompany;
        } else {
          const dRes = await axios.get('/api/devices/count/by-company', {
            params: { companyName },
            withCredentials: true,
          });
          next.devices = dRes.data.totalDevicesByCompany;
        }
      } catch (err) {
        console.error('Home KPI fetch failed:', err.message);
      }

      const extras = await Promise.allSettled([
        axios.get('/api/devices', { params: deviceParams, withCredentials: true }),
        axios.get('/api/tracker/overview', { withCredentials: true }),
        axios.get('/api/energy-meter/alarms/events/active', { withCredentials: true }),
      ]);

      if (extras[0].status === 'fulfilled') {
        const list = Array.isArray(extras[0].value.data) ? extras[0].value.data : [];
        next.byType = countByType(list);
        if (next.devices == null) next.devices = list.length;
      }
      if (extras[1].status === 'fulfilled') {
        next.fleet = extras[1].value.data?.kpis || null;
      }
      if (extras[2].status === 'fulfilled') {
        const events = extras[2].value.data?.data;
        next.activeAlarms = Array.isArray(events) ? events.length : 0;
      }

      setInsights(next);
    };

    loadInsights();
    return undefined;
  }, [role, companyName, subscriptionStatus]);

  const accessContext = useMemo(
    () => ({ role, companyAccess, simulatorAvailable, subscriptionStatus }),
    [role, companyAccess, simulatorAvailable, subscriptionStatus]
  );

  const query = searchTerm.trim().toLowerCase();

  const visibleDashboards = useMemo(
    () => DASHBOARD_TILES.filter((tile) => isTileVisible(tile, accessContext)),
    [accessContext]
  );

  const dashboardTiles = useMemo(
    () => visibleDashboards.filter((tile) => matchesSearch(tile, query)),
    [visibleDashboards, query]
  );

  const adminTiles = useMemo(
    () =>
      ADMIN_TILES.filter((tile) => isTileVisible(tile, accessContext)).filter((tile) =>
        matchesSearch(tile, query)
      ),
    [accessContext, query]
  );

  const recentTiles = useMemo(() => {
    const visible = new Set(
      ALL_TILES.filter((tile) => isTileVisible(tile, accessContext)).map((tile) => tile.id)
    );
    return recentIds
      .map((id) => ALL_TILES.find((tile) => tile.id === id))
      .filter((tile) => tile && visible.has(tile.id) && !isTileDisabled(tile, accessContext));
  }, [recentIds, accessContext]);

  const hasAnyTiles = dashboardTiles.length > 0 || adminTiles.length > 0;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const openTile = (tile) => {
    rememberTile(tile.id);
    setRecentIds(readRecentIds());
    navigate(tile.path);
  };

  const kpiItems = [
    role === 'superadmin' && insights?.companies != null
      ? { id: 'companies', label: 'Companies', value: insights.companies, icon: Building2 }
      : null,
    (role === 'superadmin' || role === 'admin') && insights?.users != null
      ? { id: 'users', label: 'Users', value: insights.users, icon: Users }
      : null,
    insights?.devices != null
      ? { id: 'devices', label: 'Devices', value: insights.devices, icon: HardDrive }
      : null,
  ].filter(Boolean);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Spinner animation="border" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>
            <Clock3 size={14} aria-hidden />
            {todayLabel}
          </p>
          <h1 className={styles.welcome}>Welcome back, {userName}</h1>
          <p className={styles.subtitle}>
            {visibleDashboards.length} dashboard{visibleDashboards.length === 1 ? '' : 's'} ready
            {companyName ? (
              <>
                {' '}
                · <span className={styles.companyTag}>{companyName}</span>
              </>
            ) : null}
          </p>
          <div className={styles.badges}>
            {role ? <span className={styles.badge}>{role}</span> : null}
            <span
              className={`${styles.badge} ${
                subscriptionStatus === 'active' ? styles.badgeOk : styles.badgeWarn
              }`}
            >
              <ShieldCheck size={12} aria-hidden />
              {subscriptionStatus === 'active' ? 'Subscription active' : 'Subscription inactive'}
            </span>
          </div>
        </div>

        <label className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search dashboards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search dashboards"
          />
        </label>
      </section>

      {kpiItems.length > 0 && !query && (
        <section className={styles.kpiRow} aria-label="Account summary">
          {kpiItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.id} className={styles.kpiCard}>
                <span className={styles.kpiIcon} aria-hidden>
                  <Icon size={18} />
                </span>
                <div>
                  <p className={styles.kpiValue}>{item.value}</p>
                  <p className={styles.kpiLabel}>{item.label}</p>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {recentTiles.length > 0 && !query && (
        <section className={styles.section} aria-labelledby="home-recent">
          <h2 id="home-recent" className={styles.sectionTitle}>
            Recently opened
          </h2>
          <div className={styles.recentRow}>
            {recentTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.id}
                  type="button"
                  className={styles.recentChip}
                  style={{ '--tile-accent': tile.accent }}
                  onClick={() => openTile(tile)}
                >
                  <Icon size={14} aria-hidden />
                  {tile.title}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!hasAnyTiles ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {query ? 'No matching dashboards' : 'No dashboards available'}
          </p>
          <p className={styles.emptyText}>
            {query
              ? 'Try a different search term.'
              : 'Ask your admin to enable dashboards for this company.'}
          </p>
        </div>
      ) : (
        <>
          {dashboardTiles.length > 0 && (
            <section className={styles.section} aria-labelledby="home-dashboards">
              <h2 id="home-dashboards" className={styles.sectionTitle}>
                Dashboards
              </h2>
              <div className={styles.grid}>
                {dashboardTiles.map((tile) => (
                  <PortalTile
                    key={tile.id}
                    tile={tile}
                    size="large"
                    disabled={isTileDisabled(tile, accessContext)}
                    metric={getTileMetric(tile, insights)}
                    onOpen={openTile}
                  />
                ))}
              </div>
            </section>
          )}

          {adminTiles.length > 0 && (
            <section className={styles.section} aria-labelledby="home-admin">
              <h2 id="home-admin" className={styles.sectionTitle}>
                Admin & Tools
              </h2>
              <div className={styles.gridSmall}>
                {adminTiles.map((tile) => (
                  <PortalTile
                    key={tile.id}
                    tile={tile}
                    size="small"
                    disabled={isTileDisabled(tile, accessContext)}
                    metric={getTileMetric(tile, insights)}
                    onOpen={openTile}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
