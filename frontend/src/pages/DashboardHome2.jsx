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
  Lock,
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
import HomeFeatureCarousel from './HomeFeatureCarousel';

const ACCESS_KEYS = [
  'home',
  'trackerOverview',
  'craneOverview',
  'elevatorOverview',
  'energyOverview',
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
  const byType = { crane: 0, elevator: 0, energyMeter: 0, gpsTracker: 0 };
  for (const device of devices) {
    if (Object.prototype.hasOwnProperty.call(byType, device.deviceType)) {
      byType[device.deviceType] += 1;
    }
  }
  return byType;
}

// locked  = no access at all (admin disabled this feature for this company)
// disabled = has access but subscription is inactive
function PortalTile({ tile, size, locked, disabled, metric, highlighted, onOpen, onHoverStart, onHoverEnd }) {
  const Icon = tile.icon;
  const metricTone = metric?.tone ? styles[`metric_${metric.tone}`] : '';
  const isInert = locked || disabled;

  return (
    // ✅ Wrapper so locked (disabled) buttons still receive hover for the carousel
    <div
      className={`${styles.tileWrap} ${highlighted ? styles.tileWrapActive : ''}`}
      onMouseEnter={() => onHoverStart?.(tile.id)}
      onMouseLeave={() => onHoverEnd?.()}
    >
      <button
        type="button"
        className={[
          styles.tile,
          size === 'large' ? styles.tileLarge : styles.tileSmall,
          locked ? styles.tileLocked : '',
          disabled && !locked ? styles.tileDisabled : '',
          highlighted ? styles.tileHighlighted : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--tile-accent': tile.accent }}
        disabled={isInert}
        onClick={() => {
          if (!isInert) onOpen(tile);
        }}
      >
        <span className={styles.tileAccent} aria-hidden />
        <span className={styles.tileTop}>
          <span className={styles.iconWrap} aria-hidden>
            <Icon size={size === 'large' ? 20 : 16} />
          </span>
          {locked ? (
            <Lock size={14} className={styles.lockIcon} aria-label="Not enabled" />
          ) : (
            <ChevronRight size={16} className={styles.tileChevron} aria-hidden />
          )}
        </span>
        <h3 className={styles.title}>{tile.title}</h3>
        <p className={styles.description}>{tile.description}</p>
        {disabled && !locked && <span className={styles.hint}>Subscription required</span>}
        {!isInert && metric ? (
          <span className={`${styles.metric} ${metricTone}`}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </span>
        ) : (
          <span className={styles.metricSpacer} aria-hidden />
        )}
      </button>
    </div>
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
  // ✅ Which dashboard card is hovered → drives the right-side feature tour
  const [hoveredTileId, setHoveredTileId] = useState(null);

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

  // ✅ Always show all dashboard tiles — locked ones are greyed out, not hidden
  const dashboardTiles = useMemo(
    () => DASHBOARD_TILES.filter((tile) => matchesSearch(tile, query)),
    [query]
  );

  // ✅ Admin tiles: superadmin-only tools (Manage Company, Simulator) stay hidden for
  // non-superadmins since they are internal tools, not product features.
  // All other admin tiles are always shown.
  const adminTiles = useMemo(
    () =>
      ADMIN_TILES.filter((tile) => {
        // Hide superadmin-only tools from non-superadmins entirely
        if (tile.requiresSuperadmin && role !== 'superadmin') return false;
        // Hide Simulator if not available even for superadmin
        if (tile.requiresSimulator && !simulatorAvailable) return false;
        return matchesSearch(tile, query);
      }),
    [role, simulatorAvailable, query]
  );

  // ✅ Recently opened — only tiles the user actually has access to
  const recentTiles = useMemo(() => {
    const accessible = new Set(
      ALL_TILES.filter((tile) => isTileVisible(tile, accessContext)).map((tile) => tile.id)
    );
    return recentIds
      .map((id) => ALL_TILES.find((tile) => tile.id === id))
      .filter((tile) => tile && accessible.has(tile.id) && !isTileDisabled(tile, accessContext));
  }, [recentIds, accessContext]);

  // ✅ Count how many dashboard tiles the user can actually open
  const accessibleCount = useMemo(
    () => DASHBOARD_TILES.filter((tile) => isTileVisible(tile, accessContext)).length,
    [accessContext]
  );

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
            {accessibleCount} of {DASHBOARD_TILES.length} dashboard{DASHBOARD_TILES.length === 1 ? '' : 's'} enabled
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

      {/* ✅ One split: left = dashboard cards + admin cards stacked; right = carousel */}
      <div className={`${styles.bottomSplit} ${query ? styles.bottomSplitSolo : ''}`}>
          {/* ── LEFT COLUMN ── */}
          <div className={styles.cardsPane}>
            {dashboardTiles.length > 0 && (
              <section className={styles.section} aria-labelledby="home-dashboards">
                <h2 id="home-dashboards" className={styles.sectionTitle}>
                  Dashboards
                </h2>
                <div className={styles.gridSplit}>
                  {dashboardTiles.map((tile) => {
                    const accessible = isTileVisible(tile, accessContext);
                    const subscriptionLocked = accessible && isTileDisabled(tile, accessContext);
                    return (
                      <PortalTile
                        key={tile.id}
                        tile={tile}
                        size="large"
                        locked={!accessible}
                        disabled={subscriptionLocked}
                        highlighted={hoveredTileId === tile.id}
                        metric={accessible ? getTileMetric(tile, insights) : null}
                        onOpen={openTile}
                        onHoverStart={setHoveredTileId}
                        onHoverEnd={() => setHoveredTileId(null)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {adminTiles.length > 0 && (
              <section className={styles.section} aria-labelledby="home-admin">
                <h2 id="home-admin" className={styles.sectionTitle}>
                  Admin & Tools
                </h2>
                <div className={styles.gridSmall}>
                  {adminTiles.map((tile) => {
                    const accessible = isTileVisible(tile, accessContext);
                    const subscriptionLocked = accessible && isTileDisabled(tile, accessContext);
                    return (
                      <PortalTile
                        key={tile.id}
                        tile={tile}
                        size="small"
                        locked={!accessible}
                        disabled={subscriptionLocked}
                        highlighted={hoveredTileId === tile.id}
                        metric={accessible ? getTileMetric(tile, insights) : null}
                        onOpen={openTile}
                        onHoverStart={setHoveredTileId}
                        onHoverEnd={() => setHoveredTileId(null)}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT COLUMN: carousel, sticky so it follows scroll ── */}
          {!query && (
            <div className={styles.carouselPane}>
              <div className={styles.carouselSticky}>
                <h2 className={styles.sectionTitle}>Feature tour</h2>
                <HomeFeatureCarousel focusTileId={hoveredTileId} />
              </div>
            </div>
          )}
        </div>

        {!hasAnyTiles && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No matching dashboards</p>
            <p className={styles.emptyText}>Try a different search term.</p>
          </div>
        )}
    </div>
  );
}
