// ============================================================
// FlowCraft — app.js
// Firebase Realtime Database で共同編集を実現
// ============================================================

// ★ ここに自分のFirebaseの設定を貼り付けてください ★
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBDPsDbVMUYoadexVtt0H-YBxHWDD-bJ2A",
  authDomain: "talk-chart.firebaseapp.com",
  databaseURL: "https://talk-chart-default-rtdb.firebaseio.com",
  projectId: "talk-chart",
  storageBucket: "talk-chart.firebasestorage.app",
  messagingSenderId: "63087144574",
  appId: "1:63087144574:web:9667643e97c4770fbe322f",
  measurementId: "G-54GC8P8YGL"
};

// ============================================================
// INIT
// ============================================================
const COLLAB_COLORS = ['#6366f1','#34d399','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb7185'];
const FILL_COLORS = ['#1e2d45','#1a3330','#2d1f3d','#2d2310','#2d1f1f','#1f2d2d','#2a2a2a'];
const TEXT_COLORS = ['#e2e8f0','#94a3b8','#818cf8','#34d399','#f59e0b','#f87171','#ffffff'];

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();

let roomId = null;
let roomRef = null;
let myUserId = 'u' + Math.random().toString(36).slice(2, 8);
let myColor = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];

let nodes = {};
let edges = {};
let freeTexts = {};
let boardTitle = '無題のボード';

let selectedId = null;
let connectMode = false;
let connectFrom = null;
let dragging = null, dragOffX = 0, dragOffY = 0;
let resizing = null, resizeStart = null;
let zoom = 1, panX = 0, panY = 0;
let isPanning = false, panStart = null;

// ============================================================
// LANDING
// ============================================================
function createNewRoom() {
  const id = Math.random().toString(36).slice(2, 9).toUpperCase();
  startEditor(id);
}

function joinRoom() {
  const val = document.getElementById('room-input').value.trim().toUpperCase();
  if (!val) { showToast('ボードIDを入力してください'); return; }
  startEditor(val);
}

function backToLanding() {
  if (roomRef) {
    roomRef.child('collaborators/' + myUserId).remove();
    roomRef.off();
  }
  document.getElementById('editor').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
  nodes = {}; edges = {}; freeTexts = {};
  selectedId = null; connectMode = false; connectFrom = null;
  document.getElementById('nodes-layer').innerHTML = '';
  document.getElementById('edges-layer').innerHTML = '';
  document.getElementById('text-layer').innerHTML = '';
}

// ============================================================
// START EDITOR
// ============================================================
function startEditor(id) {
  roomId = id;
  roomRef = db.ref('rooms/' + roomId);

  document.getElementById('landing').classList.add('hidden');
  document.getElementById('editor').classList.remove('hidden');
  document.getElementById('room-id-display').textContent = roomId;

  buildColorSwatches();

  // Presence
  const myPresence = roomRef.child('collaborators/' + myUserId);
  myPresence.set({ color: myColor, ts: Date.now() });
  myPresence.onDisconnect().remove();

  roomRef.child('title').on('value', snap => {
    boardTitle = snap.val() || '無題のボード';
    document.getElementById('board-title').textContent = boardTitle;
  });

  roomRef.child('nodes').on('value', snap => {
    nodes = snap.val() || {};
    rerenderAll();
  });

  roomRef.child('edges').on('value', snap => {
    edges = snap.val() || {};
    rerenderEdges();
  });

  roomRef.child('freeTexts').on('value', snap => {
    freeTexts = snap.val() || {};
    rerenderFreeTexts();
  });

  roomRef.child('collaborators').on('value', snap => {
    renderCollaborators(snap.val() || {});
  });

  setupCanvasEvents();
}

// ============================================================
// COLLABORATORS UI
// ============================================================
function renderCollaborators(collabs) {
  const el = document.getElementById('collaborators');
  el.innerHTML = '';
  Object.entries(collabs).forEach(([uid, info]) => {
    if (!info || !info.color) return;
    const av = document.createElement('div');
    av.className = 'collab-avatar';
    av.style.background = info.color;
    av.title = uid === myUserId ? 'あなた' : '参加者';
    av.textContent = uid === myUserId ? 'Me' : '👤';
    el.appendChild(av);
  });
}

// ============================================================
// NODE OPERATIONS
// ============================================================
function genId() { return 'n' + Date.now() + Math.random().toString(36).slice(2, 5); }

function addNode(type) {
  if (!roomRef) return;
  const id = genId();
  const cx = (300 + Math.random() * 200 - panX) / zoom;
  const cy = (160 + Math.random() * 120 - panY) / zoom;
  const node = {
    id, type,
    x: cx, y: cy,
    w: type === 'ellipse' ? 120 : 130,
    h: type === 'ellipse' ? 60 : 52,
    label: type === 'rect' ? '処理' : type === 'ellipse' ? '開始/終了' : '判断',
    fill: FILL_COLORS[0],
    textColor: TEXT_COLORS[0]
  };
  roomRef.child('nodes/' + id).set(node);
}

function addFreeText() {
  if (!roomRef) return;
  const id = 'ft' + Date.now();
  const ft = { id, x: 200, y: 100, text: 'テキスト', fontSize: 14, color: '#e2e8f0' };
  roomRef.child('freeTexts/' + id).set(ft);
}

function addImageNode(src) {
  if (!roomRef) return;
  const id = genId();
  const node = { id, type: 'image', x: 250, y: 180, w: 120, h: 90, src, label: '', fill: 'none', textColor: '#e2e8f0' };
  roomRef.child('nodes/' + id).set(node);
}

function deleteSelected() {
  if (!selectedId || !roomRef) return;
  if (selectedId.startsWith('ft')) {
    roomRef.child('freeTexts/' + selectedId).remove();
  } else {
    roomRef.child('nodes/' + selectedId).remove();
    Object.values(edges).forEach(e => {
      if (e.from === selectedId || e.to === selectedId) {
        roomRef.child('edges/' + e.id).remove();
      }
    });
  }
  deselect();
}

// ============================================================
// EDGES
// ============================================================
function addEdge(from, to) {
  if (!roomRef) return;
  const exists = Object.values(edges).find(e => e.from === from && e.to === to);
  if (exists) return;
  const id = 'e' + Date.now();
  roomRef.child('edges/' + id).set({ id, from, to });
}

// ============================================================
// RENDER
// ============================================================
function rerenderAll() {
  document.getElementById('nodes-layer').innerHTML = '';
  Object.values(nodes).forEach(node => renderNode(node));
  rerenderEdges();
  if (selectedId) applySelection(selectedId);
}

function renderNode(node) {
  const existing = document.getElementById(node.id);
  if (existing) existing.remove();

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', node.id);
  g.style.cursor = 'move';

  if (node.type === 'rect') {
    g.appendChild(svgEl('rect', { x: node.x-node.w/2, y: node.y-node.h/2, width: node.w, height: node.h, rx: 6, fill: node.fill, stroke: '#374160', 'stroke-width': 1 }));
  } else if (node.type === 'ellipse') {
    g.appendChild(svgEl('ellipse', { cx: node.x, cy: node.y, rx: node.w/2, ry: node.h/2, fill: node.fill, stroke: '#374160', 'stroke-width': 1 }));
  } else if (node.type === 'diamond') {
    const hw = node.w/2, hh = node.h/2;
    g.appendChild(svgEl('polygon', { points: `${node.x},${node.y-hh} ${node.x+hw},${node.y} ${node.x},${node.y+hh} ${node.x-hw},${node.y}`, fill: node.fill, stroke: '#374160', 'stroke-width': 1 }));
  } else if (node.type === 'image') {
    g.appendChild(svgEl('image', { x: node.x-node.w/2, y: node.y-node.h/2, width: node.w, height: node.h, href: node.src, preserveAspectRatio: 'xMidYMid meet' }));
    g.appendChild(svgEl('rect', { x: node.x-node.w/2, y: node.y-node.h/2, width: node.w, height: node.h, rx: 4, fill: 'none', stroke: '#374160', 'stroke-width': 1 }));
  }

  if (node.label && node.type !== 'image') {
    const t = svgEl('text', { x: node.x, y: node.y+4, 'text-anchor': 'middle', 'font-size': 12, fill: node.textColor || '#e2e8f0', 'pointer-events': 'none', 'font-family': 'DM Sans, sans-serif' });
    t.textContent = node.label;
    g.appendChild(t);
  }

  const rh = svgEl('rect', { x: node.x+node.w/2-6, y: node.y+node.h/2-6, width: 9, height: 9, fill: '#6366f1', rx: 2, class: 'resize-handle' });
  rh.style.cursor = 'nwse-resize';
  rh.addEventListener('mousedown', e => { e.stopPropagation(); startResize(e, node.id); });
  g.appendChild(rh);

  g.addEventListener('mousedown', e => onNodeMousedown(e, node.id));
  g.addEventListener('dblclick', e => startEditLabel(e, node.id));
  document.getElementById('nodes-layer').appendChild(g);
}

function rerenderEdges() {
  document.getElementById('edges-layer').innerHTML = '';
  Object.values(edges).forEach(edge => {
    const fn = nodes[edge.from], tn = nodes[edge.to];
    if (!fn || !tn) return;
    const isSelected = selectedId === edge.id;
    const line = svgEl('line', {
      x1: fn.x, y1: fn.y, x2: tn.x, y2: tn.y,
      stroke: isSelected ? '#6366f1' : '#94a3b8',
      'stroke-width': 1.5,
      'marker-end': isSelected ? 'url(#arrow-sel)' : 'url(#arrow)'
    });
    line.setAttribute('id', edge.id);
    line.style.cursor = 'pointer';
    line.addEventListener('mousedown', e => { e.stopPropagation(); selectEdge(edge.id); });
    document.getElementById('edges-layer').appendChild(line);
  });
}

function rerenderFreeTexts() {
  document.getElementById('text-layer').innerHTML = '';
  Object.values(freeTexts).forEach(ft => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', ft.id);
    g.style.cursor = 'move';

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', ft.x); fo.setAttribute('y', ft.y);
    fo.setAttribute('width', 200); fo.setAttribute('height', 60);

    const div = document.createElement('div');
    div.style.cssText = `color:${ft.color||'#e2e8f0'};font-size:${ft.fontSize||14}px;font-family:DM Sans,sans-serif;user-select:none;white-space:pre-wrap;`;
    div.textContent = ft.text;
    fo.appendChild(div);
    g.appendChild(fo);

    g.addEventListener('mousedown', e => onNodeMousedown(e, ft.id));
    g.addEventListener('dblclick', e => startEditFreeText(e, ft.id));
    document.getElementById('text-layer').appendChild(g);
  });
}

function applySelection(id) {
  document.querySelectorAll('#nodes-layer g rect, #nodes-layer g ellipse, #nodes-layer g polygon').forEach(el => {
    if (!el.classList.contains('resize-handle')) {
      el.setAttribute('stroke', '#374160');
      el.setAttribute('stroke-width', 1);
    }
  });
  if (!id) return;
  const g = document.getElementById(id);
  if (!g) return;
  g.querySelectorAll('rect, ellipse, polygon').forEach(el => {
    if (!el.classList.contains('resize-handle')) {
      el.setAttribute('stroke', '#6366f1');
      el.setAttribute('stroke-width', 2);
    }
  });
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// ============================================================
// SELECTION
// ============================================================
function selectNode(id) {
  selectedId = id;
  applySelection(id);
  const node = nodes[id] || freeTexts[id];
  if (!node) return;
  const panel = document.getElementById('props-panel');
  panel.classList.remove('hidden');
  document.getElementById('prop-label').value = node.label || node.text || '';
  if (node.type) {
    document.getElementById('prop-shape').value = node.type === 'image' ? 'rect' : node.type;
    document.getElementById('prop-color-group').style.display = node.type === 'image' ? 'none' : '';
    document.getElementById('prop-shape-group').style.display = node.type === 'image' ? 'none' : '';
  }
  updateSwatchActiveStates(node.fill, node.textColor);
}

function selectEdge(id) {
  selectedId = id;
  rerenderEdges();
  document.getElementById('props-panel').classList.add('hidden');
}

function deselect() {
  selectedId = null;
  applySelection(null);
  rerenderEdges();
  document.getElementById('props-panel').classList.add('hidden');
}

function closeProps() { deselect(); }

// ============================================================
// PROPS UPDATE
// ============================================================
function updatePropLabel() {
  if (!selectedId || !roomRef) return;
  const val = document.getElementById('prop-label').value;
  if (freeTexts[selectedId]) {
    roomRef.child('freeTexts/' + selectedId + '/text').set(val);
  } else if (nodes[selectedId]) {
    roomRef.child('nodes/' + selectedId + '/label').set(val);
  }
}

function updatePropShape() {
  if (!selectedId || !nodes[selectedId] || !roomRef) return;
  roomRef.child('nodes/' + selectedId + '/type').set(document.getElementById('prop-shape').value);
}

function setFillColor(color) {
  if (!selectedId || !nodes[selectedId] || !roomRef) return;
  roomRef.child('nodes/' + selectedId + '/fill').set(color);
  updateSwatchActiveStates(color, null);
}

function setTextColor(color) {
  if (!selectedId || !roomRef) return;
  if (freeTexts[selectedId]) {
    roomRef.child('freeTexts/' + selectedId + '/color').set(color);
  } else if (nodes[selectedId]) {
    roomRef.child('nodes/' + selectedId + '/textColor').set(color);
  }
  updateSwatchActiveStates(null, color);
}

function updateSwatchActiveStates(fill, textColor) {
  if (fill !== null) {
    document.querySelectorAll('#color-swatches .swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === fill);
    });
  }
  if (textColor !== null) {
    document.querySelectorAll('#text-color-swatches .swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === textColor);
    });
  }
}

// ============================================================
// COLOR SWATCHES
// ============================================================
function buildColorSwatches() {
  const fillEl = document.getElementById('color-swatches');
  fillEl.innerHTML = '';
  FILL_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'swatch'; s.style.background = c; s.dataset.color = c;
    s.onclick = () => setFillColor(c);
    fillEl.appendChild(s);
  });
  const textEl = document.getElementById('text-color-swatches');
  textEl.innerHTML = '';
  TEXT_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'swatch'; s.style.background = c; s.dataset.color = c;
    s.onclick = () => setTextColor(c);
    textEl.appendChild(s);
  });
}

// ============================================================
// DRAG & RESIZE
// ============================================================
function onNodeMousedown(e, id) {
  e.stopPropagation();
  if (connectMode) {
    if (!connectFrom) {
      connectFrom = id;
      const g = document.getElementById(id);
      if (g) g.querySelectorAll('rect,ellipse,polygon').forEach(el => {
        if (!el.classList.contains('resize-handle')) el.setAttribute('stroke', '#34d399');
      });
    } else if (connectFrom !== id) {
      addEdge(connectFrom, id);
      connectFrom = null;
      toggleConnect(true);
    }
    return;
  }
  selectNode(id);
  const pt = svgPoint(e);
  const node = nodes[id] || freeTexts[id];
  if (!node) return;
  dragging = id;
  dragOffX = pt.x - node.x;
  dragOffY = pt.y - node.y;
}

function startResize(e, id) {
  e.stopPropagation();
  const pt = svgPoint(e);
  const node = nodes[id];
  if (!node) return;
  resizing = id;
  resizeStart = { w: node.w, h: node.h, px: pt.x, py: pt.y };
}

function svgPoint(e) {
  const svg = document.getElementById('canvas');
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - panX) / zoom,
    y: (e.clientY - rect.top - panY) / zoom
  };
}

function setupCanvasEvents() {
  const svg = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');

  svg.addEventListener('mousedown', e => {
    if (e.target === svg || e.target.id === 'viewport') {
      deselect();
      connectFrom = null;
      isPanning = true;
      panStart = { x: e.clientX - panX, y: e.clientY - panY };
    }
  });

  window.addEventListener('mousemove', e => {
    if (dragging) {
      const pt = svgPoint(e);
      const node = nodes[dragging] || freeTexts[dragging];
      if (!node || !roomRef) return;
      node.x = pt.x - dragOffX;
      node.y = pt.y - dragOffY;
      if (freeTexts[dragging]) {
        roomRef.child('freeTexts/' + dragging).update({ x: node.x, y: node.y });
      } else {
        roomRef.child('nodes/' + dragging).update({ x: node.x, y: node.y });
      }
    }
    if (resizing) {
      const pt = svgPoint(e);
      const node = nodes[resizing];
      if (!node || !roomRef) return;
      const nw = Math.max(60, resizeStart.w + (pt.x - resizeStart.px) * 2);
      const nh = Math.max(40, resizeStart.h + (pt.y - resizeStart.py) * 2);
      roomRef.child('nodes/' + resizing).update({ w: nw, h: nh });
    }
    if (isPanning && panStart) {
      panX = e.clientX - panStart.x;
      panY = e.clientY - panStart.y;
      updateViewport();
    }
  });

  window.addEventListener('mouseup', () => {
    dragging = null; resizing = null; isPanning = false; panStart = null;
  });

  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.min(3, Math.max(0.2, zoom * delta));
    updateViewport();
  }, { passive: false });
}

function updateViewport() {
  document.getElementById('viewport').setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
}

// ============================================================
// ZOOM
// ============================================================
function zoomIn() { zoom = Math.min(3, zoom * 1.2); updateViewport(); }
function zoomOut() { zoom = Math.max(0.2, zoom / 1.2); updateViewport(); }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateViewport(); }

// ============================================================
// CONNECT MODE
// ============================================================
function toggleConnect(forceOff) {
  connectMode = forceOff ? false : !connectMode;
  connectFrom = null;
  document.getElementById('connect-btn').classList.toggle('active', connectMode);
  document.getElementById('canvas').style.cursor = connectMode ? 'crosshair' : 'default';
}

// ============================================================
// LABEL EDITING
// ============================================================
function startEditLabel(e, id) {
  const node = nodes[id];
  if (!node || node.type === 'image') return;
  const svg = document.getElementById('canvas');
  const rect = svg.getBoundingClientRect();
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'inline-edit';
  inp.value = node.label || '';
  inp.style.left = (node.x * zoom + panX + rect.left - (node.w * zoom)/2) + 'px';
  inp.style.top = (node.y * zoom + panY + rect.top - 14) + 'px';
  inp.style.width = (node.w * zoom) + 'px';
  document.body.appendChild(inp);
  inp.focus(); inp.select();
  const done = () => { if (roomRef) roomRef.child('nodes/' + id + '/label').set(inp.value); inp.remove(); };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(); });
}

function startEditFreeText(e, id) {
  const ft = freeTexts[id];
  if (!ft) return;
  const svg = document.getElementById('canvas');
  const rect = svg.getBoundingClientRect();
  const ta = document.createElement('textarea');
  ta.className = 'free-text-input';
  ta.value = ft.text || '';
  ta.style.left = (ft.x * zoom + panX + rect.left) + 'px';
  ta.style.top = (ft.y * zoom + panY + rect.top) + 'px';
  ta.style.fontSize = (ft.fontSize || 14) + 'px';
  ta.style.color = ft.color || '#e2e8f0';
  document.body.appendChild(ta);
  ta.focus();
  const done = () => { if (roomRef) roomRef.child('freeTexts/' + id + '/text').set(ta.value); ta.remove(); };
  ta.addEventListener('blur', done);
  ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') done(); });
}

// ============================================================
// BOARD TITLE
// ============================================================
function renameBoard() {
  const newTitle = prompt('ボード名を入力:', boardTitle);
  if (newTitle !== null && roomRef) roomRef.child('title').set(newTitle || '無題のボード');
}

// ============================================================
// IMAGE
// ============================================================
function triggerUpload() { document.getElementById('file-input').click(); }

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => addImageNode(ev.target.result);
  reader.readAsDataURL(file);
  e.target.value = '';
}

function showUrlModal() { document.getElementById('url-modal').classList.remove('hidden'); document.getElementById('url-input').focus(); }
function hideUrlModal() { document.getElementById('url-modal').classList.add('hidden'); }
function addImageFromUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) return;
  addImageNode(url);
  hideUrlModal();
  document.getElementById('url-input').value = '';
}

// ============================================================
// SHARE / EXPORT
// ============================================================
function copyRoomId() {
  navigator.clipboard.writeText(roomId).then(() => showToast('ボードIDをコピーしました！'));
}

function exportSVG() {
  const svgEl = document.getElementById('canvas');
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (boardTitle || 'flowchart') + '.svg';
  a.click();
  URL.revokeObjectURL(url);
  showToast('SVGとして保存しました');
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ============================================================
// URL HASH ROUTING
// ============================================================
window.addEventListener('load', () => {
  const hash = location.hash.replace('#', '').trim().toUpperCase();
  if (hash && hash.length > 4) {
    document.getElementById('room-input').value = hash;
    startEditor(hash);
  }
});

window.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    deleteSelected();
  }
  if (e.key === 'Escape') { deselect(); toggleConnect(true); }
});
