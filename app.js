/* ============================================================
   APP.JS — CMO COMMAND CENTER
   Cleopatra Sky Hospital · Executive Dashboard
   ============================================================
   Architecture:
     Microsoft Forms → Power Automate → SharePoint List
     → Power Automate HTTP POST → JSONBin.io REST API
     → This dashboard (polls every 5 min + on-load)
   ============================================================ */

'use strict';

/* ============================================================
   STATE
   ============================================================ */
let snapshot       = null;
let trendsData     = [];
let totalBeds      = 0;
let totalIcuBeds   = 0;
let totalAdmissions = 0;
let occupancyPct   = 0;
let icuPct         = 0;
let pulseStatusText   = '';
let deptsReportedText = '';
let lastSuccessfulFetch = null;
let refreshTimer   = null;

const REFRESH_MS = (CONFIG.refreshIntervalMinutes || 5) * 60 * 1000;

/* ============================================================
   NAVIGATION
   ============================================================ */
document.querySelectorAll('.nav-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
  });
});

/* ============================================================
   DATA FETCH — JSONBin.io
   JSONBin returns: { record: { ...payload }, metadata: {...} }
   We only need record when X-Bin-Meta is false, it returns
   the raw payload directly.
   ============================================================ */
async function fetchDashboardData() {
  if (!CONFIG.jsonbinId || CONFIG.jsonbinId.startsWith('PASTE_')) {
    throw new Error('JSONBin not configured — open config.js and fill in your Bin ID and API key.');
  }

  const url = `https://api.jsonbin.io/v3/b/${CONFIG.jsonbinId}/latest`;
  const res = await fetch(url, {
    headers: {
      'X-Master-Key': CONFIG.jsonbinKey,
      'X-Bin-Meta': 'false'
    },
    // Use cache: 'no-store' to always get latest
    cache: 'no-store'
  });

  if (res.status === 401) throw new Error('JSONBin API key is incorrect.');
  if (res.status === 404) throw new Error('JSONBin Bin ID not found.');
  if (!res.ok) throw new Error(`JSONBin error ${res.status} — check your config.js`);

  return await res.json();
}

/* ============================================================
   MAIN LOAD
   ============================================================ */
async function loadDashboard() {
  try {
    // On first load show placeholder in pulse
    if (!snapshot) {
      document.getElementById('pulseHeadline').textContent = 'Loading hospital data...';
    }

    const raw = await fetchDashboardData();
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    // Populate state
    snapshot = {
      reportDate: raw.ReportDate || '',
      census:     num(raw.OPDCensus),
      orRef:      num(raw.OPDORReferrals),
      admRef:     num(raw.OPDAdmissionReferrals),
      edCensus:   num(raw.EDCensus),
      edAdm:      num(raw.EDAdmissions),
      occBeds:    num(raw.OccupiedBeds),
      availBeds:  num(raw.AvailableBeds),
      discharges: num(raw.Discharges),
      icuOcc:     num(raw.ICUOccupied),
      icuAvail:   num(raw.ICUAvailable),
      surgeries:  num(raw.Surgeries),
      mortality:  num(raw.Mortalities || 0),
      cathLab:    num(raw.CathLabCases || 0),
      endoscopy:  num(raw.EndoscopyCases || 0),
      orTomorrow: num(raw.ORScheduledTomorrow || 0),
    };

    totalBeds       = num(raw.TotalBeds)         || (snapshot.occBeds + snapshot.availBeds) || CONFIG.totalBedsDefault;
    totalIcuBeds    = num(raw.TotalICUBeds)       || (snapshot.icuOcc  + snapshot.icuAvail)  || CONFIG.totalIcuBedsDefault;
    totalAdmissions = num(raw.TotalAdmissions)    || (snapshot.admRef  + snapshot.edAdm);
    occupancyPct    = num(raw.OccupancyPct)       || (totalBeds ? Math.round((snapshot.occBeds / totalBeds) * 100) : 0);
    icuPct          = num(raw.ICUOccupancyPct)    || (totalIcuBeds ? Math.round((snapshot.icuOcc / totalIcuBeds) * 100) : 0);
    pulseStatusText   = String(raw.PulseStatus   || '');
    deptsReportedText = String(raw.DeptsReported || '');

    trendsData = Array.isArray(raw.Trends) ? raw.Trends.map(r => ({
      date:         r.Date || '',
      opdCensus:    num(r.OPDCensus),
      edCensus:     num(r.EDCensus),
      occupancyPct: num(r.OccupancyPct)
    })) : [];

    lastSuccessfulFetch = new Date();
    setLiveBadge('live');
    hideError();
    setPulse();
    renderKPIs();
    renderCapacity();
    renderFlow();
    renderProcedures();
    renderTrends();

  } catch (err) {
    console.error('[CMO Dashboard]', err);
    setLiveBadge('error');
    showError(err.message);
    if (!snapshot) {
      // First load failed — show fallback pulse
      document.getElementById('pulseDot').className = 'pulse-dot red';
      document.getElementById('pulseHeadline').textContent = 'Could not load live data';
      document.getElementById('pulseUpdated').textContent = err.message;
    }
  }
}

/* ============================================================
   LIVE BADGE
   ============================================================ */
function setLiveBadge(state) {
  const badge = document.getElementById('liveBadge');
  const label = document.getElementById('liveLabel');
  badge.className = 'live-badge ' + state;
  if (state === 'live') {
    const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    label.textContent = `Live · ${t}`;
  } else if (state === 'error') {
    label.textContent = 'Data error';
  } else {
    label.textContent = 'Connecting…';
  }
}

/* ============================================================
   ERROR BANNER
   ============================================================ */
function showError(msg) {
  const banner = document.getElementById('errorBanner');
  document.getElementById('errorMsg').textContent = msg;
  banner.style.display = 'flex';
}
function hideError() {
  document.getElementById('errorBanner').style.display = 'none';
}

/* ============================================================
   PULSE STRIP
   ============================================================ */
function setPulse() {
  const dot      = document.getElementById('pulseDot');
  const headline = document.getElementById('pulseHeadline');
  const dateLabel = document.getElementById('pulseDateLabel');
  const updated   = document.getElementById('pulseUpdated');

  // Determine status
  let status = 'green';
  if (/CRITICAL/i.test(pulseStatusText) || occupancyPct >= 95) status = 'red';
  else if (/WATCH|ALERT/i.test(pulseStatusText) || occupancyPct >= 80) status = 'amber';

  dot.className = 'pulse-dot ' + status;

  // Build headline
  if (pulseStatusText) {
    headline.textContent = pulseStatusText;
  } else if (occupancyPct > 0) {
    const label = status === 'red' ? 'Critical capacity —' : status === 'amber' ? 'Elevated occupancy —' : 'Operating normally —';
    headline.textContent = `${label} ${occupancyPct}% bed occupancy · ${snapshot.census + snapshot.edCensus} total patients seen today`;
  } else {
    headline.textContent = 'Data received — review KPIs below';
  }

  // Date
  const d = snapshot.reportDate ? new Date(snapshot.reportDate + 'T00:00:00') : new Date();
  dateLabel.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Updated
  const now = new Date();
  const deptLabel = deptsReportedText ? `${deptsReportedText} depts reported · ` : '';
  updated.textContent = `${deptLabel}Updated ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/* ============================================================
   KPI CARDS
   ============================================================ */
function renderKPIs() {
  const kpis = [
    { label: 'OPD Census',           value: snapshot.census,      unit: '',  icon: '🩺', color: 'var(--teal)',   bg: 'var(--teal-light)' },
    { label: 'ED Census',            value: snapshot.edCensus,    unit: '',  icon: '🚑', color: 'var(--red)',    bg: 'var(--red-light)' },
    { label: 'Total Admissions',     value: totalAdmissions,      unit: '',  icon: '➕', color: 'var(--blue)',   bg: 'var(--blue-light)' },
    { label: 'Total Discharges',     value: snapshot.discharges,  unit: '',  icon: '📤', color: 'var(--green)',  bg: 'var(--green-light)' },
    { label: 'Hospital Occupancy',   value: occupancyPct,         unit: '%', icon: '📊', color: 'var(--gold)',   bg: 'var(--gold-light)' },
    { label: 'ICU Available Beds',   value: snapshot.icuAvail,    unit: '',  icon: '💙', color: '#6B4FA0',       bg: '#EFEAF7' },
    { label: 'Total Surgeries',      value: snapshot.surgeries,   unit: '',  icon: '🔪', color: '#8A6D2A',       bg: 'var(--gold-light)' },
    { label: 'In-Hospital Mortalities', value: snapshot.mortality, unit: '', icon: '📋', color: '#3A4A52',       bg: '#EEF1F2' },
  ];

  // Update sub-label with date context
  if (snapshot.reportDate) {
    const d = new Date(snapshot.reportDate + 'T00:00:00');
    document.getElementById('kpiSub').textContent =
      'As of ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="accent" style="background:${k.color}"></div>
      <div class="icon-row">
        <div class="kpi-icon" style="background:${k.bg}">${k.icon}</div>
      </div>
      <div class="kpi-value">${k.value}<span class="unit">${k.unit}</span></div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
}

/* ============================================================
   CAPACITY
   ============================================================ */
function capColor(pct) {
  return pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
}

function renderCapacity() {
  const availPct = totalBeds ? Math.round((snapshot.availBeds / totalBeds) * 100) : 0;
  const cards = [
    {
      title: 'Total Beds', value: totalBeds, sub: 'hospital-wide',
      pct: 100, color: 'var(--blue)',
      foot: `${snapshot.occBeds} occupied · ${snapshot.availBeds} open`
    },
    {
      title: 'Occupied Beds', value: snapshot.occBeds, sub: `${occupancyPct}% of capacity`,
      pct: occupancyPct, color: capColor(occupancyPct),
      foot: `of ${totalBeds} total beds`
    },
    {
      title: 'Available Beds', value: snapshot.availBeds, sub: 'ready now',
      pct: availPct, color: 'var(--green)',
      foot: `${availPct}% open`
    },
    {
      title: 'ICU Capacity', value: `${snapshot.icuOcc}/${totalIcuBeds}`, sub: `${icuPct}% occupied`,
      pct: icuPct, color: capColor(icuPct),
      foot: `${snapshot.icuAvail} ICU beds open`
    },
  ];

  document.getElementById('capGrid').innerHTML = cards.map(c => `
    <div class="cap-card">
      <div class="cap-top">
        <span class="cap-title">${c.title}</span>
        <span class="cap-pct" style="color:${c.color}">${c.value}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.min(c.pct, 100)}%; background:${c.color}"></div>
      </div>
      <div class="cap-foot"><span>${c.sub}</span><strong>${c.foot}</strong></div>
    </div>
  `).join('');
}

/* ============================================================
   PATIENT FLOW
   ============================================================ */
function renderFlow() {
  const steps = [
    { label: 'OPD',        num: snapshot.census,      sub: 'seen today' },
    { label: 'ED',         num: snapshot.edCensus,    sub: 'seen today' },
    { label: 'Admission',  num: totalAdmissions,      sub: 'referred in' },
    { label: 'Inpatient',  num: snapshot.occBeds,     sub: 'occupied beds' },
    { label: 'Discharge',  num: snapshot.discharges,  sub: 'today' },
  ];

  document.getElementById('flowWrap').innerHTML = steps.map((s, i) => `
    <div class="flow-step">
      <div class="flow-circle">
        <div class="num">${s.num}</div>
      </div>
      <div class="flow-label">${s.label}</div>
      <div class="flow-sub">${s.sub}</div>
    </div>
    ${i < steps.length - 1 ? '<div class="flow-arrow">→</div>' : ''}
  `).join('');
}

/* ============================================================
   PROCEDURES & TOMORROW
   ============================================================ */
function renderProcedures() {
  const cards = [
    {
      icon: '🫀', label: 'Cath Lab Cases', value: snapshot.cathLab,
      color: 'var(--red)', bg: 'var(--red-light)',
      badge: 'Today', badgeText: '#C2483D'
    },
    {
      icon: '🔭', label: 'Endoscopy Cases', value: snapshot.endoscopy,
      color: '#6B4FA0', bg: '#EFEAF7',
      badge: 'Today', badgeText: '#6B4FA0'
    },
    {
      icon: '📋', label: 'OR Scheduled Tomorrow', value: snapshot.orTomorrow,
      color: 'var(--gold)', bg: 'var(--gold-light)',
      badge: 'Tomorrow', badgeText: '#8A6D2A'
    },
  ];

  document.getElementById('procGrid').innerHTML = cards.map(c => `
    <div class="proc-card">
      <div class="proc-accent" style="background:${c.color}"></div>
      <span class="proc-icon">${c.icon}</span>
      <div class="proc-value">${c.value}</div>
      <div class="proc-label">${c.label}</div>
      <span class="proc-badge" style="background:${c.bg}; color:${c.badgeText};">${c.badge}</span>
    </div>
  `).join('');
}

/* ============================================================
   TREND CHARTS (inline SVG)
   ============================================================ */
function drawChart(svgId, data, color, suffix = '') {
  const svg = document.getElementById(svgId);
  if (!data || data.length < 2) {
    svg.setAttribute('viewBox', '0 0 560 120');
    svg.innerHTML = `
      <text x="280" y="65" text-anchor="middle"
        font-family="Inter, sans-serif" font-size="13" fill="#6B7A85">
        Not enough history yet — data builds automatically each day
      </text>`;
    return;
  }

  const W = 560, H = 120, PAD = 10;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = (max - min) || 1;
  const stepX = (W - PAD * 2) / (data.length - 1);

  const points = data.map((d, i) => [
    PAD + i * stepX,
    H - PAD - ((d - min) / range) * (H - PAD * 2)
  ]);

  const path     = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = path + ` L${points[points.length - 1][0]},${H} L${points[0][0]},${H} Z`;
  const last     = points[points.length - 1];
  const gradId   = 'grad-' + svgId;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${color}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gradId})"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="${color}"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="8" fill="${color}" opacity="0.18"/>
    <text x="${last[0] - 6}" y="${last[1] - 12}" text-anchor="end"
      font-family="Playfair Display, serif" font-size="13" font-weight="700"
      fill="${color}">${data[data.length - 1]}${suffix}</text>
  `;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0093A2';
}

function renderTrends() {
  const census7   = trendsData.slice(-7).map(d => d.opdCensus + d.edCensus);
  const occ7      = trendsData.slice(-7).map(d => d.occupancyPct);
  const censusAll = trendsData.map(d => d.opdCensus + d.edCensus);
  const occAll    = trendsData.map(d => d.occupancyPct);

  drawChart('chartCensus', census7,  cssVar('--teal'));
  drawChart('chartOcc',    occ7,     cssVar('--gold'), '%');

  // Wire up range toggle buttons
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.onclick = () => {
      const group = btn.dataset.chart;
      document.querySelectorAll(`.range-btn[data-chart="${group}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range;
      if (group === 'census') {
        drawChart('chartCensus', range === '7' ? census7 : censusAll, cssVar('--teal'));
      } else {
        drawChart('chartOcc', range === '7' ? occ7 : occAll, cssVar('--gold'), '%');
      }
    };
  });
}

/* ============================================================
   FORM LAUNCHERS (Department Entry tab)
   ============================================================ */
const FORMS_META = [
  {
    key:      'opd',
    title:    'OPD Daily Report',
    subtitle: 'Outpatient Department',
    icon:     '🩺',
    color:    'var(--teal)',
    bg:       'var(--teal-light)',
    gradient: 'linear-gradient(135deg, #0093A2, #006F7A)',
    fields:   ['Total OPD Census', 'OPD OR Referrals', 'OPD Admission Referrals']
  },
  {
    key:      'hospital',
    title:    'Hospital Daily Report',
    subtitle: 'ED · Inpatient · ICU · OR',
    icon:     '🏥',
    color:    'var(--blue)',
    bg:       'var(--blue-light)',
    gradient: 'linear-gradient(135deg, #0B3D5C, #0E4A6F)',
    fields:   [
      'ED Census', 'ED Admissions',
      'Occupied Inpatient Beds', 'Available Beds', 'Total Discharges',
      'ICU Occupied Beds', 'ICU Available Beds',
      'Total Surgeries', 'Mortalities',
      'Cath Lab Cases', 'Endoscopy Cases',
      'OR Scheduled Tomorrow'
    ]
  }
];

function renderFormLaunchers() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const container = document.getElementById('formLaunchers');

  container.innerHTML = FORMS_META.map(f => {
    const url   = CONFIG.forms[f.key] || '';
    const ready = url && !url.startsWith('PASTE_');
    return `
      <div class="form-card" style="border-top: 4px solid ${f.color};">
        <div class="form-card-head">
          <div class="form-card-icon" style="background:${f.bg}; font-size:22px;">${f.icon}</div>
          <div class="form-card-head-text">
            <h2>${f.title}</h2>
            <p>${f.subtitle}</p>
          </div>
        </div>
        <div class="form-fields">
          <div class="today-label">Reporting for <span>${today}</span></div>
          ${f.fields.map(field => `
            <div class="field-item">
              <span class="field-dot" style="background:${f.color}"></span>
              <span>${field}</span>
            </div>
          `).join('')}
        </div>
        ${ready
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="form-btn" style="background:${f.gradient};">
               Open ${f.title} ↗
             </a>`
          : `<div class="form-btn disabled" style="background:${f.gradient};">
               Form link not yet configured in config.js
             </div>`
        }
        <div class="privacy-note">
          🔒 Opens only this form — no hospital data is visible to the respondent
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   AUTO-REFRESH
   ============================================================ */
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDashboard, REFRESH_MS);
}

// Refresh when tab becomes visible again (e.g. user switches back)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Only refetch if last fetch was more than 1 minute ago
    const stale = !lastSuccessfulFetch ||
      (Date.now() - lastSuccessfulFetch.getTime()) > 60_000;
    if (stale) loadDashboard();
  }
});

/* ============================================================
   BOOT
   ============================================================ */
renderFormLaunchers();
window.addEventListener('resize', renderFormLaunchers);

loadDashboard();
startAutoRefresh();
