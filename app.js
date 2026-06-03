const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let people = [], connections = [], moments = [];
let selectedPerson = null;
let currentSeason = 34;

const EDGE_COLORS = {
  partnership: '#7F77DD',
  family:      '#1D9E75',
  rivalry:     '#D85A30',
  showmance:   '#D4537E',
  center_stage: '#E0A830',
  sytycd:      '#5ba8d4'
};

// ── Data loading ──────────────────────────────────────────────

async function loadData(season) {
  const wrap = document.getElementById('graph-area');
  wrap.innerHTML = '<svg id="esvg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></svg><div class="loading">Loading season ' + season + '...</div>';

  const [{ data: pData }, { data: cData }] = await Promise.all([
    client.from('people').select('*'),
    client.from('connections').select('*').eq('season', season),
  ]);

  people = pData || [];
  connections = cData || [];

  // Load moments for all connections in this season
  const connIds = connections.map(c => c.id);
  if (connIds.length) {
    const { data: mData } = await client.from('moments').select('*').in('connection_id', connIds);
    moments = mData || [];
  } else {
    moments = [];
  }

  wrap.querySelector('.loading')?.remove();
  addLegend();
  render();
}

// ── Rendering ─────────────────────────────────────────────────

function render() {
  const wrap = document.getElementById('graph-area');
  const svg  = document.getElementById('esvg');
  const W = wrap.offsetWidth, H = wrap.offsetHeight;

  svg.innerHTML = '';
  wrap.querySelectorAll('.node').forEach(n => n.remove());

  // Get people visible in this season
  const seasonPeople = getPeopleForSeason();

  // Draw edges
  connections.forEach(c => {
    const pa = people.find(p => p.id === c.person_a);
    const pb = people.find(p => p.id === c.person_b);
    if (!pa || !pb) return;
    const x1 = pa.x_pos / 100 * W, y1 = pa.y_pos / 100 * H;
    const x2 = pb.x_pos / 100 * W, y2 = pb.y_pos / 100 * H;
    const isActive = selectedPerson && (c.person_a === selectedPerson || c.person_b === selectedPerson);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', EDGE_COLORS[c.type] || '#888');
    line.setAttribute('stroke-width', isActive ? '2.5' : '1.5');
    line.setAttribute('opacity', isActive ? '0.9' : '0.25');
    svg.appendChild(line);
  });

  // Draw nodes
  seasonPeople.forEach(p => {
    const el = document.createElement('div');
    el.className = 'node' + (selectedPerson === p.id ? ' selected' : '');
    el.style.left = p.x_pos + '%';
    el.style.top  = p.y_pos + '%';
    const size = p.role === 'pro' ? 52 : 42;
    el.innerHTML = `
      <div class="node-circle" style="width:${size}px;height:${size}px;">
        ${p.photo_url
          ? `<img src="${p.photo_url}" alt="${p.name}" onerror="this.parentNode.innerHTML='<div class=ini style=background:${p.bg_color||'#333'};color:${p.text_color||'#fff'};>${p.initials||'?'}</div>'">`
          : `<div class="ini" style="background:${p.bg_color||'#333'};color:${p.text_color||'#fff'};">${p.initials||'?'}</div>`
        }
      </div>
      <div class="node-label">${p.name.split(' ')[0]}</div>`;
    el.addEventListener('click', () => selectPerson(p.id));
    wrap.appendChild(el);
  });
}

function getPeopleForSeason() {
  const ids = new Set();
  connections.forEach(c => { ids.add(c.person_a); ids.add(c.person_b); });
  return people.filter(p => ids.has(p.id));
}

function addLegend() {
  const wrap = document.getElementById('graph-area');
  wrap.querySelectorAll('.legend').forEach(l => l.remove());
  const leg = document.createElement('div');
  leg.className = 'legend';
  leg.innerHTML = Object.entries(EDGE_COLORS).map(([type, color]) =>
    `<div class="leg"><div class="leg-dot" style="background:${color}"></div>${type}</div>`
  ).join('');
  wrap.appendChild(leg);
}

// ── Person panel ──────────────────────────────────────────────

function selectPerson(id) {
  selectedPerson = id;
  render();
  showPersonPanel(id);
}

function showPersonPanel(id) {
  const p = people.find(x => x.id === id);
  const panel = document.getElementById('panel');
  const conns = connections.filter(c => c.person_a === id || c.person_b === id);
  const pMoments = moments.filter(m => conns.some(c => c.id === m.connection_id));

  panel.innerHTML = `
    <div class="back" onclick="clearSel()">← back</div>
    <div class="phead">
      ${avatarHtml(p, 52)}
      <div>
        <div class="pname">${p.name} ${finishBadge(conns)}</div>
        <div class="prole">${p.role === 'pro' ? 'Pro dancer' : 'Celebrity · Season ' + currentSeason}</div>
        <div class="pbio">${p.bio || ''}</div>
      </div>
    </div>
    <div class="section-label">Connections</div>
    <div class="conn-tags">
      ${conns.map(c => {
        const otherId = c.person_a === id ? c.person_b : c.person_a;
        const other = people.find(x => x.id === otherId);
        if (!other) return '';
        return `<span class="ctag" onclick="showEdgePanel('${id}','${otherId}')">
          ${miniAvatar(other)} ${other.name.split(' ')[0]} <span style="opacity:0.5">· ${c.type}</span>
        </span>`;
      }).join('')}
    </div>
    ${pMoments.length ? `
      <div class="section-label">Story moments</div>
      ${pMoments.map(m => momentCard(m)).join('')}
    ` : '<p class="hint">No moments yet.</p>'}
  `;
}

// ── Edge panel ────────────────────────────────────────────────

function showEdgePanel(a, b) {
  const pa = people.find(x => x.id === a);
  const pb = people.find(x => x.id === b);
  const conn = connections.find(c =>
    (c.person_a === a && c.person_b === b) || (c.person_a === b && c.person_b === a)
  );
  const edgeMoments = conn ? moments.filter(m => m.connection_id === conn.id) : [];
  const panel = document.getElementById('panel');

  panel.innerHTML = `
    <div class="back" onclick="showPersonPanel('${a}')">← back to ${pa.name.split(' ')[0]}</div>
    <div class="phead">
      ${avatarHtml(pa, 40)}
      <span style="color:#444;font-size:13px;align-self:center;">+</span>
      ${avatarHtml(pb, 40)}
      <div>
        <div class="pname" style="font-size:15px;">${pa.name.split(' ')[0]} & ${pb.name.split(' ')[0]}</div>
        <div class="prole">${conn ? conn.label || conn.type : ''}</div>
      </div>
    </div>
    ${edgeMoments.length
      ? edgeMoments.map(m => momentCard(m)).join('')
      : '<p class="hint">No moments yet — this is where fan annotations would live.</p>'
    }
  `;
}

// ── Helpers ───────────────────────────────────────────────────

function avatarHtml(p, size = 48) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;">
    ${p.photo_url
      ? `<img src="${p.photo_url}" alt="${p.name}">`
      : `<div class="ini" style="background:${p.bg_color||'#333'};color:${p.text_color||'#fff'};width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${p.initials||'?'}</div>`
    }
  </div>`;
}

function miniAvatar(p) {
  return `<div style="width:20px;height:20px;border-radius:50%;overflow:hidden;flex-shrink:0;">
    ${p.photo_url
      ? `<img src="${p.photo_url}" style="width:100%;height:100%;object-fit:cover;object-position:top;">`
      : `<div style="width:100%;height:100%;background:${p.bg_color||'#333'};color:${p.text_color||'#fff'};display:flex;align-items:center;justify-content:center;font-size:9px;">${p.initials||'?'}</div>`
    }
  </div>`;
}

function finishBadge(conns) {
  const fp = conns.find(c => c.finish_position)?.finish_position;
  if (!fp) return '';
  if (fp === 1) return '<span class="finish-badge f1">Winner</span>';
  if (fp === 2) return '<span class="finish-badge f2">Runner-up</span>';
  if (fp === 3) return '<span class="finish-badge f3">3rd</span>';
  return '';
}

function momentCard(m) {
  return `<div class="mcard">
    <div class="mseason">${m.season ? 'Season ' + m.season + (m.week ? ' · ' + m.week : '') : ''}</div>
    <div class="mtitle">${m.title}</div>
    <div class="mdesc">${m.description || ''}</div>
    ${m.youtube_id ? `<div id="v-${m.id}">
      <div class="vthumb" onclick="playVid('${m.id}','${m.youtube_id}')">
        <img src="https://img.youtube.com/vi/${m.youtube_id}/hqdefault.jpg" alt="Watch clip">
        <div class="vplay"><div class="vbtn">▶</div></div>
      </div>
    </div>` : ''}
    <div>${(m.tags || []).map(t => `<span class="tag t-${t}">${t}</span>`).join('')}</div>
  </div>`;
}

function playVid(id, videoId) {
  const el = document.getElementById('v-' + id);
  if (!el) return;
  el.innerHTML = `<div class="vframe"><iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allow="autoplay;encrypted-media" allowfullscreen></iframe></div>`;
}

function clearSel() {
  selectedPerson = null;
  render();
  document.getElementById('panel').innerHTML = '<p class="hint">Tap any node to explore their story</p>';
}

// ── Season picker ─────────────────────────────────────────────

function buildSeasonPicker() {
  const picker = document.getElementById('season-picker');
  [34].forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'season-btn' + (s === currentSeason ? ' active' : '');
    btn.textContent = 'Season ' + s;
    btn.onclick = () => {
      currentSeason = s;
      document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPerson = null;
      loadData(s);
    };
    picker.appendChild(btn);
  });
}

// ── Init ──────────────────────────────────────────────────────

window.selectPerson  = selectPerson;
window.showPersonPanel = showPersonPanel;
window.showEdgePanel = showEdgePanel;
window.clearSel      = clearSel;
window.playVid       = playVid;

buildSeasonPicker();
loadData(currentSeason);
