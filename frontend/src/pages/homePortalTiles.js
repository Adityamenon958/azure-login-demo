// ✅ Single catalog for the Home portal tiles.
// Keep titles/paths/access keys in sync with Sidebar.jsx.
import {
  Radio,
  Map,
  ClipboardList,
  Truck,
  Zap,
  Bell,
  UserPlus,
  PlusSquare,
  Settings,
  Activity,
} from 'lucide-react';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import { MdOutlineSubscriptions } from 'react-icons/md';
import { PiElevatorDuotone } from 'react-icons/pi';

export const DASHBOARD_TILES = [
  {
    id: 'fleet-monitor',
    title: 'Fleet Monitor',
    description: 'Live fleet analytics, KPIs, and vehicle performance.',
    path: '/dashboard/fleet-analytics',
    accessKey: 'trackerOverview',
    icon: Radio,
    accent: '#2563eb',
    highlights: [
      'Fleet-wide KPIs for distance, idle time, and utilization',
      'Rank vehicles by performance over any date range',
      'Spot outliers before they become downtime',
    ],
  },
  {
    id: 'fleet-map',
    title: 'Fleet Map',
    description: 'Track vehicles live on the map.',
    path: '/dashboard/tracker-overview',
    accessKey: 'trackerOverview',
    icon: Map,
    accent: '#0d7377',
    highlights: [
      'Live GPS locations with moving, idle, and parked status',
      'Open any vehicle for trip history and route replay',
      'Filter real vs demo trackers when you need a clean view',
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance',
    description: 'Driver attendance and shift summaries.',
    path: '/dashboard/attendance',
    accessKey: 'trackerOverview',
    icon: ClipboardList,
    accent: '#7c3aed',
    highlights: [
      'Daily present / absent / late counts at a glance',
      'Filter by site, role, or search a person',
      'Trend charts to see attendance over the week',
    ],
  },
  {
    id: 'crane-overview',
    title: 'Crane Overview',
    description: 'Crane status, hours, and maintenance.',
    path: '/dashboard/crane-overview',
    accessKey: 'craneOverview',
    icon: Truck,
    accent: '#c2410c',
    highlights: [
      'Working hours vs idle and maintenance time',
      'Live crane locations and session status',
      'Maintenance updates so jobs do not surprise you',
    ],
  },
  {
    id: 'elevator-overview',
    title: 'Elevator Overview',
    description: 'Elevator health and zone monitoring.',
    path: '/dashboard/elevator-overview',
    accessKey: 'elevatorOverview',
    icon: PiElevatorDuotone,
    accent: '#0369a1',
    highlights: [
      'Active, inactive, and error counts per zone',
      'Latest status card for every elevator',
      'History charts to compare lift behaviour over time',
    ],
  },
  {
    id: 'energy-overview',
    title: 'Energy Overview',
    description: 'Energy meters, usage, and live readings.',
    path: '/dashboard/energy-overview',
    accessKey: 'energyOverview',
    icon: Zap,
    accent: '#ca8a04',
    highlights: [
      'Live kW, voltage, current, and power factor',
      'Fleet consumption insights and sparklines',
      'Meter cards grouped by site, plant, or machine',
    ],
  },
  {
    id: 'fleet-alarms',
    title: 'Fleet Alarms',
    description: 'Alarm thresholds and fleet alerts.',
    path: '/dashboard/energy-alarms',
    accessKey: 'energyOverview',
    icon: Bell,
    accent: '#dc2626',
    highlights: [
      'Set thresholds once and reuse them across meters',
      'See active alarms without opening each device',
      'Review history so repeats are easy to catch',
    ],
  },
];

export const ADMIN_TILES = [
  {
    id: 'manage-company',
    title: 'Manage Company',
    description: 'Companies and dashboard access.',
    path: '/dashboard/managecompany',
    requiresSuperadmin: true,
    icon: HiOutlineOfficeBuilding,
    accent: '#475569',
    highlights: [
      'Create and update companies in one place',
      'Turn dashboards on or off per company',
      'Keep access aligned with each customer’s plan',
    ],
  },
  {
    id: 'simulator',
    title: 'Simulator',
    description: 'GPS tracker simulation tools.',
    path: '/dashboard/simulator',
    requiresSuperadmin: true,
    requiresSimulator: true,
    icon: Activity,
    accent: '#0d7377',
    highlights: [
      'Run GPS tracker demos without real hardware',
      'Seed history so maps and analytics have data',
      'Switch between real and simulated devices',
    ],
  },
  {
    id: 'manage-users',
    title: 'Manage Users',
    description: 'Add and manage company users.',
    path: '/dashboard/adduser',
    accessKey: 'addUsers',
    requiresAdminOrSuperadmin: true,
    requiresActiveSubscription: true,
    icon: UserPlus,
    accent: '#7c3aed',
    highlights: [
      'Invite users and assign admin or user roles',
      'Keep each person inside their own company',
      'Needs an active subscription to add new users',
    ],
  },
  {
    id: 'manage-device',
    title: 'Manage Device',
    description: 'Register and assign devices.',
    path: '/dashboard/adddevice',
    accessKey: 'addDevices',
    requiresAdminOrSuperadmin: true,
    requiresActiveSubscription: true,
    icon: PlusSquare,
    accent: '#2563eb',
    highlights: [
      'Register cranes, elevators, meters, and trackers',
      'Set UID, model, and site details once',
      'Needs an active subscription to add new devices',
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription',
    description: 'Plans, billing, and renewal.',
    path: '/dashboard/subscription',
    accessKey: 'subscription',
    icon: MdOutlineSubscriptions,
    accent: '#764ba2',
    highlights: [
      'See whether the company plan is active',
      'Renew or upgrade through Razorpay',
      'Unlock add-user and add-device when the plan is live',
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Profile and account settings.',
    path: '/dashboard/settings',
    accessKey: 'settings',
    icon: Settings,
    accent: '#64748b',
    highlights: [
      'Update name, email, and contact details',
      'See your role and company at a glance',
      'Keep profile data in sync with the account',
    ],
  },
];

// ✅ Same visibility rules as Sidebar.jsx
export function isTileVisible(tile, { role, companyAccess, simulatorAvailable }) {
  if (tile.requiresSuperadmin && role !== 'superadmin') return false;
  if (tile.requiresSimulator && !simulatorAvailable) return false;

  if (tile.requiresAdminOrSuperadmin) {
    if (role === 'superadmin') return true;
    return role === 'admin' && Boolean(companyAccess[tile.accessKey]);
  }

  return role === 'superadmin' || Boolean(companyAccess[tile.accessKey]);
}

// ✅ Manage Users / Manage Device stay visible but locked when subscription is inactive
export function isTileDisabled(tile, { role, subscriptionStatus }) {
  if (!tile.requiresActiveSubscription) return false;
  return subscriptionStatus !== 'active' && role !== 'superadmin';
}

// ✅ Live number shown on the tile. Returns null until insights load.
export function getTileMetric(tile, insights) {
  if (!insights) return null;

  const countLabel = (n, one, many) => ({
    value: n,
    label: n === 1 ? one : many,
  });

  switch (tile.id) {
    case 'fleet-monitor':
    case 'fleet-map':
      if (insights.fleet?.total == null) return null;
      return {
        value: insights.fleet.total,
        label: insights.fleet.moving ? `${insights.fleet.moving} moving` : 'vehicles',
      };
    case 'crane-overview':
      if (insights.byType?.crane == null) return null;
      return countLabel(insights.byType.crane, 'crane', 'cranes');
    case 'elevator-overview':
      if (insights.byType?.elevator == null) return null;
      return countLabel(insights.byType.elevator, 'elevator', 'elevators');
    case 'energy-overview':
      if (insights.byType?.energyMeter == null) return null;
      return countLabel(insights.byType.energyMeter, 'meter', 'meters');
    case 'fleet-alarms':
      if (insights.activeAlarms == null) return null;
      return {
        value: insights.activeAlarms,
        label: insights.activeAlarms === 1 ? 'active alarm' : 'active alarms',
        tone: insights.activeAlarms > 0 ? 'alert' : 'ok',
      };
    case 'manage-company':
      if (insights.companies == null) return null;
      return countLabel(insights.companies, 'company', 'companies');
    case 'manage-users':
      if (insights.users == null) return null;
      return countLabel(insights.users, 'user', 'users');
    case 'manage-device':
      if (insights.devices == null) return null;
      return countLabel(insights.devices, 'device', 'devices');
    case 'subscription':
      if (!insights.subscriptionStatus) return null;
      return {
        value: insights.subscriptionStatus === 'active' ? 'Active' : 'Inactive',
        label: 'plan status',
        tone: insights.subscriptionStatus === 'active' ? 'ok' : 'warn',
      };
    default:
      return null;
  }
}
