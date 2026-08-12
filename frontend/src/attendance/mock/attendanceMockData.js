/**
 * ✅ Frontend-only mock attendance data.
 * Swap this file (or the hook that imports it) when real APIs exist.
 * No hardware / RFID / camera assumptions — business fields only.
 */

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftYmd(ymd, dayDelta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dayDelta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const BASE_EMPLOYEES = [
  { id: 'EMP-001', name: 'Rahul Sharma', department: 'Operations', role: 'Crane Operator', siteType: 'fleet', siteLabel: 'Yard A' },
  { id: 'EMP-002', name: 'Priya Nair', department: 'Admin', role: 'Office Manager', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-003', name: 'Amit Patel', department: 'Operations', role: 'Driver', siteType: 'fleet', siteLabel: 'Yard B' },
  { id: 'EMP-004', name: 'Sneha Reddy', department: 'Finance', role: 'Accountant', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-005', name: 'Vikram Singh', department: 'Operations', role: 'Crane Operator', siteType: 'fleet', siteLabel: 'Yard A' },
  { id: 'EMP-006', name: 'Ananya Iyer', department: 'HR', role: 'HR Executive', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-007', name: 'Karthik Menon', department: 'Operations', role: 'Fleet Supervisor', siteType: 'fleet', siteLabel: 'Yard B' },
  { id: 'EMP-008', name: 'Meera Joshi', department: 'Admin', role: 'Reception', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-009', name: 'Arjun Desai', department: 'Operations', role: 'Driver', siteType: 'fleet', siteLabel: 'Yard A' },
  { id: 'EMP-010', name: 'Divya Krishnan', department: 'IT', role: 'Support Engineer', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-011', name: 'Suresh Kumar', department: 'Operations', role: 'Crane Operator', siteType: 'fleet', siteLabel: 'Yard C' },
  { id: 'EMP-012', name: 'Neha Gupta', department: 'Finance', role: 'Accounts Officer', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-013', name: 'Rohan Mehta', department: 'Operations', role: 'Driver', siteType: 'fleet', siteLabel: 'Yard B' },
  { id: 'EMP-014', name: 'Lakshmi Rao', department: 'Admin', role: 'Coordinator', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-015', name: 'Farhan Ali', department: 'Operations', role: 'Yard Helper', siteType: 'fleet', siteLabel: 'Yard A' },
  { id: 'EMP-016', name: 'Pooja Verma', department: 'HR', role: 'Recruiter', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-017', name: 'Imran Sheikh', department: 'Operations', role: 'Driver', siteType: 'fleet', siteLabel: 'Yard C' },
  { id: 'EMP-018', name: 'Kavya Pillai', department: 'IT', role: 'Systems Admin', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-019', name: 'Deepak Yadav', department: 'Operations', role: 'Crane Operator', siteType: 'fleet', siteLabel: 'Yard A' },
  { id: 'EMP-020', name: 'Shreya Banerjee', department: 'Admin', role: 'Executive Assistant', siteType: 'office', siteLabel: 'HQ' },
  { id: 'EMP-021', name: 'Naveen Thomas', department: 'Operations', role: 'Fleet Supervisor', siteType: 'fleet', siteLabel: 'Yard B' },
  { id: 'EMP-022', name: 'Aisha Khan', department: 'Finance', role: 'Payroll Officer', siteType: 'office', siteLabel: 'HQ' },
];

/** Day-specific attendance overlays keyed by employee id */
const DAY_OVERLAYS = {
  // Primary demo day uses defaults generated below; alternate snapshots for date switching
};

function buildDayRecords(seed = 1) {
  // Deterministic variety from seed so different dates feel different
  return BASE_EMPLOYEES.map((emp, i) => {
    const roll = (i * 7 + seed * 3) % 10;
    let status;
    let checkIn = null;
    let checkOut = null;
    let hoursWorked = 0;

    const mm = (n) => String(n).padStart(2, '0');

    if (roll === 0) {
      status = 'absent';
    } else if (roll === 1) {
      status = 'late';
      checkIn = `09:${mm(20 + (i % 35))}`;
      if ((i + seed) % 3 === 0) {
        checkOut = `17:${mm(30 + (i % 20))}`;
        hoursWorked = 7.5;
      }
    } else if (roll === 2 || roll === 3) {
      status = 'on_site';
      checkIn = `08:${mm(30 + (i % 25))}`;
    } else if (roll === 4) {
      status = 'checked_out';
      checkIn = `08:${mm(40 + (i % 15))}`;
      checkOut = `17:${mm(10 + (i % 40))}`;
      hoursWorked = 8.2 + (i % 5) * 0.2;
    } else {
      status = 'present';
      checkIn = `08:${mm(45 + (i % 12))}`;
      checkOut = `18:${mm(5 + (i % 20))}`;
      hoursWorked = 8.5 + (i % 4) * 0.25;
    }

    return {
      ...emp,
      checkIn,
      checkOut,
      status,
      hoursWorked: Math.round(hoursWorked * 10) / 10,
    };
  });
}

function computeKpis(employees) {
  const totalEmployees = employees.length;
  let present = 0;
  let absent = 0;
  let onSite = 0;
  let late = 0;

  for (const e of employees) {
    if (e.status === 'absent') absent += 1;
    else {
      present += 1;
      if (e.status === 'on_site') onSite += 1;
      if (e.status === 'late') late += 1;
    }
  }

  const attendancePct =
    totalEmployees > 0 ? Math.round((present / totalEmployees) * 1000) / 10 : 0;

  return { totalEmployees, present, absent, onSite, late, attendancePct };
}

function buildTrend(anchorYmd) {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = shiftYmd(anchorYmd, -i);
    const seed = Number(date.replace(/-/g, '')) % 17;
    const rows = buildDayRecords(seed + 1);
    const k = computeKpis(rows);
    out.push({
      date,
      present: k.present,
      absent: k.absent,
      attendancePct: k.attendancePct,
    });
  }
  return out;
}

/** Cache day snapshots so filters stay stable while browsing */
const dayCache = new Map();

export function getAttendanceForDate(ymd, { bustCache = false } = {}) {
  const date = ymd || todayYmd();
  if (!bustCache && dayCache.has(date)) return dayCache.get(date);

  const seed = Number(String(date).replace(/-/g, '')) % 17 || 1;
  const employees = buildDayRecords(seed);
  // Apply any explicit overlays
  const overlay = DAY_OVERLAYS[date];
  if (overlay) {
    for (const [id, patch] of Object.entries(overlay)) {
      const idx = employees.findIndex((e) => e.id === id);
      if (idx >= 0) employees[idx] = { ...employees[idx], ...patch };
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    selectedDate: date,
    kpis: computeKpis(employees),
    trend: buildTrend(date),
    employees,
  };
  dayCache.set(date, payload);
  return payload;
}

export function getDefaultAttendanceDate() {
  return todayYmd();
}

export { computeKpis };
