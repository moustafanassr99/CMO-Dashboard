/* ============================================================
   APP.JS — CMO COMMAND CENTER
   Cleopatra Sky Hospital · Executive Dashboard
   ============================================================ */

'use strict';

/* ============================================================
   STATE
   ============================================================ */
let snapshot          = null;
let trendsData        = [];
let totalBeds         = 0;
let totalIcuBeds      = 0;
let totalAdmissions   = 0;
let occupancyPct      = 0;
let icuPct            = 0;
let pulseStatusText   = '';
let deptsReportedText = '';
let lastSuccessfulFetch = null;
let refreshTimer      = null;

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
   DATA FETCH
   ============================================================ */
async function fetchDashboardData() {
  if (!CONFIG.jsonbinId || CONFIG.jsonbinId.startsWith('PASTE_')) {
    throw new Error('JSONBin not configured — open config.js and fill in your Bin ID and API key.');
  }
  const url = 'https://api.jsonbin.io/v3/b/' + CONFIG.jsonbinId + '/latest';
  const res = await fetch(url, {
    headers: { 'X-Master-Key': CONFIG.jsonbinKey, 'X-Bin-Meta': 'false' },
    cache: 'no-store'
  });
  if (res.status === 401) throw new Error('JSONBin API key is incorrect.');
  if (res.status === 404) throw new Error('JSONBin Bin ID not found.');
  if (!res.ok) throw new Error('JSONBin error ' + res.status + ' — check your config.js');
  return await res.json();
}

/* ============================================================
   MAIN LOAD
   ============================================================ */
async function loadDashboard() {
  try {
    if (!snapshot) {
      document.getElementById('pulseHeadline').textContent = 'Loading hospital data...';
    }

    const raw = await fetchDashboardData();
    const num = function(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };

    snapshot = {
      reportDate:      raw.ReportDate || '',
      census:          num(raw.OPDCensus),
      orRef:           num(raw.OPDORReferrals),
      admRef:          num(raw.OPDAdmissionReferrals),
      edCensus:        num(raw.EDCensus),
      edAdm:           num(raw.EDAdmissions),
      occBeds:         num(raw.OccupiedBeds),
      availBeds:       num(raw.AvailableBeds),
      discharges:      num(raw.Discharges),
      icuOcc:          num(raw.ICUOccupied),
      icuAvail:        num(raw.ICUAvailable),
      surgeries:       num(raw.Surgeries),
      mortality:       num(raw.Mortalities || 0),
      cathLab:         num(raw.CathLabCases || 0),
      endoscopy:       num(raw.EndoscopyCases || 0),
      orTomorrow:      num(raw.ORScheduledTomorrow || 0),
      cathLabTomorrow: num(raw.CathLabTomorrow || 0),
      endoTomorrow:    num(raw.EndoscopyTomorrow || 0),
      vipUpdates:      raw.VIPStatus || raw.VIPUpdates || '',
      codeSilver:      num(raw.CodeSilver || 0),
      codeGrey:        num(raw.CodeGrey || 0),
      codeBlue:        num(raw.CodeBlue || 0),
      codeUpdates:     raw.CodeUpdates || '',
      hotTopics:       raw.HotTopics || '',
      damaCount:       num(raw.DAMACount || 0),
      damaExplain:     raw.DAMAExplanation || '',
      ccuOcc:    num(raw.CCUOccupied || 0),
      ccuTotal:  num(raw.CCUTotal || 14),
      picuOcc:   num(raw.PICUOccupied || 0),
      picuTotal: num(raw.PICUTotal || 3),
    };

    totalBeds       = num(raw.TotalBeds)      || (snapshot.occBeds + snapshot.availBeds) || CONFIG.totalBedsDefault;
    totalIcuBeds    = num(raw.TotalICUBeds)   || (snapshot.icuOcc  + snapshot.icuAvail)  || CONFIG.totalIcuBedsDefault;
    totalAdmissions = num(raw.TotalAdmissions)|| (snapshot.admRef  + snapshot.edAdm);
    occupancyPct    = num(raw.OccupancyPct)   || (totalBeds    ? Math.round((snapshot.occBeds / totalBeds)    * 100) : 0);
    icuPct          = num(raw.ICUOccupancyPct)|| (totalIcuBeds ? Math.round((snapshot.icuOcc  / totalIcuBeds) * 100) : 0);
    pulseStatusText   = String(raw.PulseStatus   || '');
    deptsReportedText = String(raw.DeptsReported || '');

    trendsData = Array.isArray(raw.Trends) ? raw.Trends.map(function(r) { return {
      date:         r.Date || '',
      opdCensus:    num(r.OPDCensus),
      edCensus:     num(r.EDCensus),
      occupancyPct: num(r.OccupancyPct)
    }; }) : [];

    lastSuccessfulFetch = new Date();
    setLiveBadge('live');
    hideError();
    setPulse();
    renderKPIs();
    renderCapacity();
    renderProcedures();
   renderOPDReferrals();
    renderTomorrow();
    renderVIP();
    renderCodes();
    renderHotTopics();
    renderDAMA();
    renderTrends();

  } catch (err) {
    console.error('[CMO Dashboard]', err);
    setLiveBadge('error');
    showError(err.message);
    if (!snapshot) {
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
  var badge = document.getElementById('liveBadge');
  var label = document.getElementById('liveLabel');
  badge.className = 'live-badge ' + state;
  if (state === 'live') {
    var t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    label.textContent = 'Live · ' + t;
  } else if (state === 'error') {
    label.textContent = 'Data error';
  } else {
    label.textContent = 'Connecting...';
  }
}

/* ============================================================
   ERROR BANNER
   ============================================================ */
function showError(msg) {
  var banner = document.getElementById('errorBanner');
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
  var dot       = document.getElementById('pulseDot');
  var headline  = document.getElementById('pulseHeadline');
  var dateLabel = document.getElementById('pulseDateLabel');
  var updated   = document.getElementById('pulseUpdated');

  var status = 'green';
  if (/CRITICAL/i.test(pulseStatusText) || occupancyPct >= 95) status = 'red';
  else if (/WATCH|ALERT/i.test(pulseStatusText) || occupancyPct >= 80) status = 'amber';

  dot.className = 'pulse-dot ' + status;

  if (pulseStatusText) {
    headline.textContent = pulseStatusText;
  } else if (occupancyPct > 0) {
    var lbl = status === 'red' ? 'Critical capacity —' : status === 'amber' ? 'Elevated occupancy —' : 'Operating normally —';
    headline.textContent = lbl + ' ' + occupancyPct + '% bed occupancy · ' + (snapshot.census + snapshot.edCensus) + ' total patients seen today';
  } else {
    headline.textContent = 'Data received — review KPIs below';
  }

  var d = snapshot.reportDate ? new Date(snapshot.reportDate + 'T00:00:00') : new Date();
  dateLabel.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  var now = new Date();
  var deptLabel = deptsReportedText ? deptsReportedText + ' depts reported · ' : '';
  updated.textContent = deptLabel + 'Updated ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ============================================================
   KPI CARDS
   ============================================================ */
function renderKPIs() {
  var kpis = [
    { label: 'OPD Census',              value: snapshot.census,     unit: '',  icon: '🩺', color: 'var(--teal)',  bg: 'var(--teal-light)' },
    { label: 'ED Census',               value: snapshot.edCensus,   unit: '',  icon: '🚑', color: 'var(--red)',   bg: 'var(--red-light)' },
    { label: 'Total Admissions',        value: totalAdmissions,     unit: '',  icon: '➕', color: 'var(--blue)',  bg: 'var(--blue-light)' },
    { label: 'Total Discharges',        value: snapshot.discharges, unit: '',  icon: '📤', color: 'var(--green)', bg: 'var(--green-light)' },
    { label: 'Hospital Occupancy',      value: occupancyPct,        unit: '%', icon: '📊', color: 'var(--gold)',  bg: 'var(--gold-light)' },
    { label: 'ICU Available Beds',      value: snapshot.icuAvail,   unit: '',  icon: '💙', color: '#6B4FA0',      bg: '#EFEAF7' },
    { label: 'Total Surgeries',         value: snapshot.surgeries,  unit: '',  icon: '🔪', color: '#8A6D2A',      bg: 'var(--gold-light)' },
    { label: 'In-Hospital Mortalities', value: snapshot.mortality,  unit: '',  icon: '📋', color: '#3A4A52',      bg: '#EEF1F2' },
  ];

  if (snapshot.reportDate) {
    var d = new Date(snapshot.reportDate + 'T00:00:00');
    document.getElementById('kpiSub').textContent = 'As of ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  document.getElementById('kpiGrid').innerHTML = kpis.map(function(k) {
    return '<div class="kpi-card">' +
      '<div class="accent" style="background:' + k.color + '"></div>' +
      '<div class="icon-row"><div class="kpi-icon" style="background:' + k.bg + '">' + k.icon + '</div></div>' +
      '<div class="kpi-value">' + k.value + '<span class="unit">' + k.unit + '</span></div>' +
      '<div class="kpi-label">' + k.label + '</div>' +
      '</div>';
  }).join('');
}

/* ============================================================
   CAPACITY
   ============================================================ */
function capColor(pct) {
  return pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
}

function renderCapacity() {
  var ccuPct  = snapshot.ccuTotal  ? Math.round((snapshot.ccuOcc  / snapshot.ccuTotal)  * 100) : 0;
  var picuPct = snapshot.picuTotal ? Math.round((snapshot.picuOcc / snapshot.picuTotal) * 100) : 0;

  var cards = [
    { title: 'Total Beds',    value: totalBeds, sub: 'hospital-wide', pct: 100, color: 'var(--blue)', foot: snapshot.occBeds + ' occupied · ' + snapshot.availBeds + ' open' },
    { title: 'CCU Capacity',  value: snapshot.ccuOcc + '/' + snapshot.ccuTotal,   sub: ccuPct + '% occupied',  pct: ccuPct,  color: capColor(ccuPct),  foot: (snapshot.ccuTotal - snapshot.ccuOcc) + ' CCU beds open' },
    { title: 'PICU Capacity', value: snapshot.picuOcc + '/' + snapshot.picuTotal, sub: picuPct + '% occupied', pct: picuPct, color: capColor(picuPct), foot: (snapshot.picuTotal - snapshot.picuOcc) + ' PICU beds open' },
    { title: 'ICU Capacity',  value: snapshot.icuOcc + '/' + totalIcuBeds, sub: icuPct + '% occupied', pct: icuPct, color: capColor(icuPct), foot: snapshot.icuAvail + ' ICU beds open' },
  ];

  document.getElementById('capGrid').innerHTML = cards.map(function(c) {
    return '<div class="cap-card">' +
      '<div class="cap-top"><span class="cap-title">' + c.title + '</span><span class="cap-pct" style="color:' + c.color + '">' + c.value + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.min(c.pct, 100) + '%; background:' + c.color + '"></div></div>' +
      '<div class="cap-foot"><span>' + c.sub + '</span><strong>' + c.foot + '</strong></div>' +
      '</div>';
  }).join('');
}
/* ============================================================
   TODAY'S PROCEDURES — Cath Lab + Endoscopy only (2 cards)
   ============================================================ */
function renderProcedures() {
  var cards = [
    { icon: '🫀', label: 'Cath Lab Cases',  value: snapshot.cathLab,  color: 'var(--red)',  bg: 'var(--red-light)', badge: 'Today', badgeText: '#C2483D' },
    { icon: '🔭', label: 'Endoscopy Cases', value: snapshot.endoscopy, color: '#6B4FA0',    bg: '#EFEAF7',          badge: 'Today', badgeText: '#6B4FA0' },
  ];

  document.getElementById('procGrid').innerHTML = cards.map(function(c) {
    return '<div class="proc-card">' +
      '<div class="proc-accent" style="background:' + c.color + '"></div>' +
      '<span class="proc-icon">' + c.icon + '</span>' +
      '<div class="proc-value">' + c.value + '</div>' +
      '<div class="proc-label">' + c.label + '</div>' +
      '<span class="proc-badge" style="background:' + c.bg + '; color:' + c.badgeText + ';">' + c.badge + '</span>' +
      '</div>';
  }).join('');
}

function renderOPDReferrals() {
  var cards = [
    { icon: '🔪', label: 'OPD Referrals to OR',        value: snapshot.orRef,  color: 'var(--red)',  bg: 'var(--red-light)' },
    { icon: '🛏️', label: 'OPD Referrals to Admission', value: snapshot.admRef, color: 'var(--blue)', bg: 'var(--blue-light)' },
  ];

  document.getElementById('opdReferralsGrid').innerHTML = cards.map(function(c) {
    return '<div class="proc-card">' +
      '<div class="proc-accent" style="background:' + c.color + '"></div>' +
      '<span class="proc-icon">' + c.icon + '</span>' +
      '<div class="proc-value">' + c.value + '</div>' +
      '<div class="proc-label">' + c.label + '</div>' +
      '<span class="proc-badge" style="background:' + c.bg + '; color:' + c.color + ';">Today</span>' +
      '</div>';
  }).join('');
}

/* ============================================================
   TOMORROW'S SCHEDULE — Cath Lab + Endoscopy + OR (3 cards)
   ============================================================ */
function renderTomorrow() {
  var cards = [
    { icon: '🫀', label: 'Cath Lab Tomorrow',      value: snapshot.cathLabTomorrow, color: 'var(--red)',  bg: 'var(--red-light)',  badge: 'Tomorrow', badgeText: '#C2483D' },
    { icon: '🔭', label: 'Endoscopy Tomorrow',      value: snapshot.endoTomorrow,    color: '#6B4FA0',    bg: '#EFEAF7',           badge: 'Tomorrow', badgeText: '#6B4FA0' },
    { icon: '📋', label: 'OR Scheduled Tomorrow',   value: snapshot.orTomorrow,      color: 'var(--gold)',bg: 'var(--gold-light)', badge: 'Tomorrow', badgeText: '#8A6D2A' },
  ];

  document.getElementById('tomorrowGrid').innerHTML = cards.map(function(c) {
    return '<div class="proc-card">' +
      '<div class="proc-accent" style="background:' + c.color + '"></div>' +
      '<span class="proc-icon">' + c.icon + '</span>' +
      '<div class="proc-value">' + c.value + '</div>' +
      '<div class="proc-label">' + c.label + '</div>' +
      '<span class="proc-badge" style="background:' + c.bg + '; color:' + c.badgeText + ';">' + c.badge + '</span>' +
      '</div>';
  }).join('');
}

/* ============================================================
   VIP UPDATES
   ============================================================ */
function renderVIP() {
  var container = document.getElementById('vipList');
  var data = snapshot.vipUpdates;

  /* Expects each row typed in the form as: Name & Room | Consultant | Status
     separated by newlines, one VIP per line, up to 5 rows.
     Example line: John Smith - Room 304 | Dr. Ahmed | Stable */
  var rows = [];
  if (typeof data === 'string' && data.trim() !== '') {
    rows = data.split(/\r?\n/).map(function(line) {
      var parts = line.split('|').map(function(p) { return p.trim(); });
      return {
        nameRoom:   parts[0] || '',
        consultant: parts[1] || '',
        status:     parts[2] || ''
      };
    }).filter(function(r) { return r.nameRoom !== ''; }).slice(0, 5);
  }

  if (rows.length === 0) {
    container.innerHTML = '<div class="vip-empty"><span style="font-size:22px;">👑</span><span>No VIP updates for today</span></div>';
    return;
  }

  var tableHtml =
    '<table class="vip-table">' +
    '<thead><tr><th>Patient Name &amp; Room</th><th>Consultant</th><th>Status</th></tr></thead>' +
    '<tbody>' +
    rows.map(function(r) {
      var statusClass = (r.status || '').toLowerCase() === 'critical' ? 'vip-critical' : 'vip-stable';
      return '<tr>' +
        '<td>' + r.nameRoom + '</td>' +
        '<td>' + r.consultant + '</td>' +
        '<td><span class="vip-badge ' + statusClass + '">' + (r.status || 'Active') + '</span></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';

  container.innerHTML = tableHtml;
}

/* ============================================================
   HOSPITAL CODES
   ============================================================ */
function renderCodes() {
  var cards = [
    { icon: '⚪', label: 'Code Silver', value: snapshot.codeSilver, color: '#8C8C8C', bg: '#F0F0F0' },
    { icon: '⚫', label: 'Code Grey',   value: snapshot.codeGrey,   color: '#5A5A5A', bg: '#ECECEC' },
    { icon: '🔵', label: 'Code Blue',   value: snapshot.codeBlue,   color: 'var(--blue)', bg: 'var(--blue-light)' },
  ];

  document.getElementById('codesGrid').innerHTML = cards.map(function(c) {
    return '<div class="proc-card">' +
      '<div class="proc-accent" style="background:' + c.color + '"></div>' +
      '<span class="proc-icon">' + c.icon + '</span>' +
      '<div class="proc-value">' + c.value + '</div>' +
      '<div class="proc-label">' + c.label + '</div>' +
      '<span class="proc-badge" style="background:' + c.bg + '; color:' + c.color + ';">Today</span>' +
      '</div>';
  }).join('');

  var listContainer = document.getElementById('codesList');
  if (snapshot.codeUpdates && snapshot.codeUpdates.trim() !== '') {
    listContainer.innerHTML =
      '<div class="vip-card">' +
      '<div class="vip-icon">🚨</div>' +
      '<div class="vip-body">' +
      '<div class="vip-name">Code Details</div>' +
      '<div class="vip-note">' + snapshot.codeUpdates + '</div>' +
      '</div>' +
      '</div>';
  } else {
    listContainer.innerHTML = '<div class="vip-empty"><span style="font-size:22px;">🚨</span><span>No code details reported today</span></div>';
  }
}

/* ============================================================
   HOSPITAL HOT TOPICS
   ============================================================ */
function renderHotTopics() {
  var container = document.getElementById('hotTopicsList');
  if (snapshot.hotTopics && snapshot.hotTopics.trim() !== '') {
    container.innerHTML =
      '<div class="vip-card">' +
      '<div class="vip-icon">🔥</div>' +
      '<div class="vip-body">' +
      '<div class="vip-name">Hot Topics</div>' +
      '<div class="vip-note">' + snapshot.hotTopics + '</div>' +
      '</div>' +
      '</div>';
  } else {
    container.innerHTML = '<div class="vip-empty"><span style="font-size:22px;">🔥</span><span>No hot topics reported today</span></div>';
  }
}

/* ============================================================
   DAMA (Discharge Against Medical Advice)
   ============================================================ */
function renderDAMA() {
  document.getElementById('damaCount').innerHTML =
    '<div class="proc-card">' +
    '<div class="proc-accent" style="background:var(--amber)"></div>' +
    '<span class="proc-icon">🚪</span>' +
    '<div class="proc-value">' + snapshot.damaCount + '</div>' +
    '<div class="proc-label">DAMA Cases</div>' +
    '<span class="proc-badge" style="background:var(--amber-light); color:#8A6D2A;">Today</span>' +
    '</div>';

  var container = document.getElementById('damaList');
  if (snapshot.damaExplain && snapshot.damaExplain.trim() !== '') {
    container.innerHTML =
      '<div class="vip-card">' +
      '<div class="vip-icon">🚪</div>' +
      '<div class="vip-body">' +
      '<div class="vip-name">DAMA Explanation</div>' +
      '<div class="vip-note">' + snapshot.damaExplain + '</div>' +
      '</div>' +
      '</div>';
  } else {
    container.innerHTML = '<div class="vip-empty"><span style="font-size:22px;">🚪</span><span>No DAMA cases reported today</span></div>';
  }
}

/* ============================================================
   TREND CHARTS
   ============================================================ */
function drawChart(svgId, data, color, suffix) {
  suffix = suffix || '';
  var svg = document.getElementById(svgId);
  if (!data || data.length < 2) {
    svg.setAttribute('viewBox', '0 0 560 120');
    svg.innerHTML = '<text x="280" y="65" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" fill="#6B7A85">Not enough history yet — data builds automatically each day</text>';
    return;
  }
  var W = 560, H = 120, PAD = 10;
  var max = Math.max.apply(null, data);
  var min = Math.min.apply(null, data);
  var range = (max - min) || 1;
  var stepX = (W - PAD * 2) / (data.length - 1);
  var points = data.map(function(d, i) {
    return [PAD + i * stepX, H - PAD - ((d - min) / range) * (H - PAD * 2)];
  });
  var path     = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  var areaPath = path + ' L' + points[points.length-1][0] + ',' + H + ' L' + points[0][0] + ',' + H + ' Z';
  var last     = points[points.length - 1];
  var gradId   = 'grad-' + svgId;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML =
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<path d="' + areaPath + '" fill="url(#' + gradId + ')"/>' +
    '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4.5" fill="' + color + '"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="8" fill="' + color + '" opacity="0.18"/>' +
    '<text x="' + (last[0]-6) + '" y="' + (last[1]-12) + '" text-anchor="end" font-family="Playfair Display, serif" font-size="13" font-weight="700" fill="' + color + '">' + data[data.length-1] + suffix + '</text>';
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0093A2';
}

function renderTrends() {
  var census7   = trendsData.slice(-7).map(function(d) { return d.opdCensus + d.edCensus; });
  var occ7      = trendsData.slice(-7).map(function(d) { return d.occupancyPct; });
  var censusAll = trendsData.map(function(d) { return d.opdCensus + d.edCensus; });
  var occAll    = trendsData.map(function(d) { return d.occupancyPct; });

  drawChart('chartCensus', census7, cssVar('--teal'));
  drawChart('chartOcc',    occ7,    cssVar('--gold'), '%');

  document.querySelectorAll('.range-btn').forEach(function(btn) {
    btn.onclick = function() {
      var group = btn.dataset.chart;
      document.querySelectorAll('.range-btn[data-chart="' + group + '"]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var range = btn.dataset.range;
      if (group === 'census') {
        drawChart('chartCensus', range === '7' ? census7 : censusAll, cssVar('--teal'));
      } else {
        drawChart('chartOcc', range === '7' ? occ7 : occAll, cssVar('--gold'), '%');
      }
    };
  });
}

/* ============================================================
   FORM LAUNCHERS
   ============================================================ */
var FORMS_META = [
  {
    key: 'opd', title: 'OPD Daily Report', subtitle: 'Outpatient Department',
    icon: '🩺', color: 'var(--teal)', bg: 'var(--teal-light)',
    gradient: 'linear-gradient(135deg, #0093A2, #006F7A)',
    fields: ['Total OPD Census', 'OPD OR Referrals', 'OPD Admission Referrals']
  },
  {
    key: 'hospital', title: 'Hospital Daily Report', subtitle: 'ED · Inpatient · ICU · OR',
    icon: '🏥', color: 'var(--blue)', bg: 'var(--blue-light)',
    gradient: 'linear-gradient(135deg, #0B3D5C, #0E4A6F)',
    fields: ['ED Census', 'ED Admissions', 'Occupied Inpatient Beds', 'Available Beds', 'Total Discharges', 'ICU Occupied Beds', 'ICU Available Beds', 'Total Surgeries', 'Mortalities', 'Cath Lab Cases', 'Endoscopy Cases', 'OR Scheduled Tomorrow', 'Cath Lab Tomorrow', 'Endoscopy Tomorrow']
  }
];

function renderFormLaunchers() {
  var today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  var container = document.getElementById('formLaunchers');
  container.innerHTML = FORMS_META.map(function(f) {
    var url   = CONFIG.forms[f.key] || '';
    var ready = url && !url.startsWith('PASTE_');
    return '<div class="form-card" style="border-top: 4px solid ' + f.color + ';">' +
      '<div class="form-card-head">' +
      '<div class="form-card-icon" style="background:' + f.bg + '; font-size:22px;">' + f.icon + '</div>' +
      '<div class="form-card-head-text"><h2>' + f.title + '</h2><p>' + f.subtitle + '</p></div>' +
      '</div>' +
      '<div class="form-fields"><div class="today-label">Reporting for <span>' + today + '</span></div>' +
      f.fields.map(function(field) {
        return '<div class="field-item"><span class="field-dot" style="background:' + f.color + '"></span><span>' + field + '</span></div>';
      }).join('') +
      '</div>' +
      (ready
        ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="form-btn" style="background:' + f.gradient + ';">Open ' + f.title + ' \u2197</a>'
        : '<div class="form-btn disabled" style="background:' + f.gradient + ';">Form link not yet configured in config.js</div>'
      ) +
      '<div class="privacy-note">🔒 Opens only this form — no hospital data is visible to the respondent</div>' +
      '</div>';
  }).join('');
}

/* ============================================================
   AUTO-REFRESH
   ============================================================ */
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDashboard, REFRESH_MS);
}

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    var stale = !lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch.getTime()) > 60000;
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
