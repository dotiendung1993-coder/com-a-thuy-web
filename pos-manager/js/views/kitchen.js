// T13 — Màn hình Bếp (KDS) — Kitchen Display System kiểu KiotViet.
// Polling mỗi 3 giây. 3 cột: CHỜ LÀM → ĐANG LÀM → XONG – CHỜ MANG RA.
// Không dùng WebSocket (mạng WSL2 + tunnel hay chập chờn, polling ổn định hơn).
import { api } from '../api.js';
import { toast } from '../ui.js';
import { icon } from '../icons.js';

// Escape HTML để tránh XSS khi chèn dữ liệu từ DB vào innerHTML
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Âm thanh chuông báo món mới (Web Audio API) ──────────────────────────────
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(); osc.stop(ctx.currentTime + 0.8);
  } catch { /* ignore nếu browser chặn */ }
}

// ── State ─────────────────────────────────────────────────────────────────────
let items = {};           // id -> item object
let lastSince = null;     // ISO string — updated_at lớn nhất đã nhận
let pollTimer = null;
let tickTimer = null;     // cập nhật đồng hồ mỗi giây
let muteSound = false;
let stationFilter = '';   // '' | 'bep' | 'bar'
let lastPollOk = Date.now();
let container = null;

// Task 2 mục 5 (2026-08-08) — trước đây chỉ có 2 kiểu (bật/tắt gom theo đơn). Chủ quán muốn thêm
// "sắp xếp theo bàn theo món giống trên SoBanHang".
const GROUP_MODES = {
  don: 'Theo đơn',
  ban: 'Theo bàn',
  mon: 'Theo món',
  'tung-mon': 'Từng món lẻ',
};
const KDS_MODE_KEY = 'posmgr_kds_group';
function readKdsMode() {
  try {
    const v = localStorage.getItem(KDS_MODE_KEY);
    return GROUP_MODES[v] ? v : 'don';
  } catch { return 'don'; }
}
let groupMode = readKdsMode();

const POLL_MS = 3000;
const CONN_TIMEOUT_MS = 30000;

const STATUS_LABEL = { pending: 'CHỜ LÀM', cooking: 'ĐANG LÀM', done: 'XONG – CHỜ MANG RA' };
const ACTIVE_STATUSES = ['pending', 'cooking', 'done'];

// ── Định dạng thời gian chờ ───────────────────────────────────────────────────
function elapsedMin(isoTs) {
  return Math.floor((Date.now() - new Date(isoTs).getTime()) / 60000);
}

function timerColor(minutes) {
  if (minutes < 10) return 'green';
  if (minutes < 20) return 'yellow';
  return 'red';
}

function timerHtml(minutes) {
  const color = timerColor(minutes);
  const blink = color === 'red' ? ' kds-blink' : '';
  return `<span class="kds-timer kds-timer-${color}${blink}">⏱ ${minutes} phút</span>`;
}

// ── HTML một thẻ đơn (chế độ gom) ────────────────────────────────────────────
function orderCardHtml(orderItems, mode = 'don') {
  const first = orderItems[0];
  // Gộp theo bàn/theo món thì thẻ chứa nhiều phiếu khác giờ — lấy phiếu CHỜ LÂU NHẤT để tính đồng
  // hồ, nếu lấy first.created_at thì món trễ nhất bị giấu sau con số của món vừa gọi.
  const oldestTs = orderItems.reduce((min, i) => Math.min(min, new Date(i.created_at).getTime()), Infinity);
  const mins = elapsedMin(new Date(oldestTs).toISOString());

  const placeOf = (it) => (it.delivery_type === 'tai-ban' && it.table_no
    ? `BÀN ${esc(it.table_no)}`
    : it.delivery_type === 'giao-hang' ? 'GIAO HÀNG' : 'MANG VỀ');

  // Tiêu đề nói đúng thứ đang gộp, nếu không bếp không biết thẻ này là bàn nào / món nào.
  const orderIds = [...new Set(orderItems.map((i) => i.order_id))];
  let heading;
  if (mode === 'ban') {
    const totalQty = orderItems.reduce((n, i) => n + Number(i.qty || 0), 0);
    heading = `${placeOf(first)} · ${totalQty} món${orderIds.length > 1 ? ` · ${orderIds.length} phiếu` : ''}`;
  } else if (mode === 'mon') {
    const totalQty = orderItems.reduce((n, i) => n + Number(i.qty || 0), 0);
    heading = `${esc(first.name)} · TỔNG ${totalQty}`;
  } else {
    heading = `#${esc(first.seq)} ${placeOf(first)}`;
  }

  const monoStatus = orderItems.every((i) => i.status === first.status) ? first.status : 'mixed';

  const itemLines = orderItems.map((it) => {
    const note = it.note ? `<div class="kds-note"><span class="kds-note-icon inline-ico">${icon('canh-bao')}</span> ${esc(it.note)}</div>` : '';
    const size = it.size ? ` (${esc(it.size)})` : '';
    // Gộp theo món: mọi dòng cùng tên món nên thay tên bằng NƠI ĐẾN, không thì thẻ chỉ là một cột
    // lặp lại đúng một chữ và bếp không biết chia suất đi đâu.
    const label = mode === 'mon' ? `${esc(it.qty)}× ${placeOf(it)}` : `${esc(it.qty)}× ${esc(it.name)}${size}`;
    return `<div class="kds-item-row">${label}${note}</div>`;
  }).join('');

  // Nút action áp cho MỌI phiếu trong thẻ (gộp theo bàn/món có thể có nhiều phiếu) — data-order
  // là danh sách ngăn cách dấu phẩy, handleAction() lặp qua từng phiếu. Bản cũ chỉ gửi first.order_id
  // nên nếu gộp nhiều phiếu thì bấm "XONG" chỉ xong đúng 1 phiếu, các phiếu còn lại kẹt lại im lặng.
  const orderAttr = orderIds.join(',');
  let actionBtns = '';
  if (monoStatus === 'pending') {
    actionBtns = `<button class="kds-btn kds-btn-start" data-order="${orderAttr}" data-action="order-cooking">BẮT ĐẦU</button>`;
  } else if (monoStatus === 'cooking') {
    actionBtns = `<button class="kds-btn kds-btn-done" data-order="${orderAttr}" data-action="order-done">XONG</button>`;
  } else if (monoStatus === 'done') {
    actionBtns = `
      <button class="kds-btn kds-btn-served" data-order="${orderAttr}" data-action="order-served">ĐÃ MANG RA</button>
      <button class="kds-btn kds-btn-call" data-order="${orderAttr}" data-action="call-staff">Gọi PV</button>`;
  }

  return `
    <div class="kds-card kds-card-${first.status}" data-order-id="${first.order_id}">
      <div class="kds-card-header">
        <span class="kds-order-code">${heading}</span>
        ${timerHtml(mins)}
      </div>
      <div class="kds-items">${itemLines}</div>
      <div class="kds-actions">${actionBtns}</div>
    </div>`;
}

// ── HTML một thẻ món (chế độ tách) ───────────────────────────────────────────
function itemCardHtml(item) {
  const mins = elapsedMin(item.created_at);
  const note = item.note ? `<div class="kds-note"><span class="kds-note-icon inline-ico">${icon('canh-bao')}</span> ${esc(item.note)}</div>` : '';
  const size = item.size ? ` (${esc(item.size)})` : '';
  const location = item.delivery_type === 'tai-ban' && item.table_no ? `Bàn ${esc(item.table_no)}` : '';

  let actionBtn = '';
  if (item.status === 'pending') {
    actionBtn = `<button class="kds-btn kds-btn-start" data-item="${item.id}" data-action="item-cooking">BẮT ĐẦU</button>`;
  } else if (item.status === 'cooking') {
    actionBtn = `<button class="kds-btn kds-btn-done" data-item="${item.id}" data-action="item-done">XONG</button>`;
  } else if (item.status === 'done') {
    actionBtn = `
      <button class="kds-btn kds-btn-served" data-item="${item.id}" data-action="item-served">ĐÃ MANG RA</button>
      <button class="kds-btn kds-btn-call" data-order="${item.order_id}" data-action="call-staff">Gọi PV</button>`;
  }

  return `
    <div class="kds-card kds-card-${item.status}" data-item-id="${item.id}">
      <div class="kds-card-header">
        <span class="kds-order-code">#${esc(item.seq)}${location ? ' · ' + location : ''}</span>
        ${timerHtml(mins)}
      </div>
      <div class="kds-items">
        <div class="kds-item-row">${esc(item.qty)}× ${esc(item.name)}${size}</div>
        ${note}
      </div>
      <div class="kds-actions">${actionBtn}</div>
    </div>`;
}

// ── Render toàn bộ 3 cột ──────────────────────────────────────────────────────
function renderBoard() {
  if (!container) return;
  const board = container.querySelector('#kds-board');
  if (!board) return;

  const visibleItems = Object.values(items).filter((it) => {
    if (!ACTIVE_STATUSES.includes(it.status)) return false;
    if (stationFilter && it.station !== stationFilter) return false;
    return true;
  });

  const cols = { pending: [], cooking: [], done: [] };
  if (groupMode === 'tung-mon') {
    for (const it of visibleItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      cols[it.status].push(itemCardHtml(it));
    }
  } else {
    // Task 2 mục 5 (2026-08-08) — chủ quán: "thêm sắp xếp theo bàn theo món giống trên SoBanHang".
    //   'don' : mỗi phiếu một thẻ  → bếp làm trọn từng đơn, khách nhận đủ món cùng lúc.
    //   'ban' : gộp mọi đơn CỦA CÙNG MỘT BÀN → bàn gọi thêm nhiều lần vẫn thấy chung một chỗ.
    //   'mon' : gộp theo TÊN MÓN   → "12 suất cơm rang" nấu một mẻ thay vì 12 lần lẻ tẻ.
    const keyOf = (it) => {
      if (groupMode === 'ban') return it.table_no ? `ban-${it.table_no}` : `don-${it.order_id}`;
      if (groupMode === 'mon') return `mon-${it.name}`;
      return `don-${it.order_id}`;
    };
    const byKey = {};
    for (const it of visibleItems) (byKey[keyOf(it)] ||= []).push(it);

    // Món chờ lâu nhất lên trước — bếp luôn nhìn thấy phần trễ nhất ở đầu cột.
    const oldest = (grp) => Math.min(...grp.map((i) => new Date(i.created_at).getTime()));
    const groups = Object.values(byKey).sort((a, b) => oldest(a) - oldest(b));
    for (const grp of groups) {
      // Cột theo trạng thái phổ biến nhất (nếu mixed → hiện pending ưu tiên)
      const s = grp.some((i) => i.status === 'pending') ? 'pending'
              : grp.some((i) => i.status === 'cooking') ? 'cooking'
              : 'done';
      cols[s].push(orderCardHtml(grp, groupMode));
    }
  }

  ['pending', 'cooking', 'done'].forEach((s) => {
    const col = board.querySelector(`.kds-col[data-status="${s}"]`);
    if (!col) return;
    col.querySelector('.kds-col-count').textContent = cols[s].length;
    col.querySelector('.kds-col-body').innerHTML = cols[s].join('') || '<p class="kds-empty">Không có món</p>';
  });

  // Chấm kết nối
  const elapsed = Date.now() - lastPollOk;
  const dot = container.querySelector('#kds-conn-dot');
  const label = container.querySelector('#kds-conn-label');
  if (dot && label) {
    if (elapsed > CONN_TIMEOUT_MS) {
      dot.className = 'kds-dot kds-dot-red';
      label.textContent = 'MẤT KẾT NỐI';
    } else {
      dot.className = 'kds-dot kds-dot-green';
      label.textContent = 'Đang kết nối';
    }
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const qs = lastSince ? `?since=${encodeURIComponent(lastSince)}` : '';
    const stationQs = stationFilter ? `${qs ? '&' : '?'}station=${stationFilter}` : '';
    const res = await api.get(`/api/mgr/kitchen/items${qs}${stationQs}`);
    const newItems = res.items || [];

    let hasNew = false;
    for (const it of newItems) {
      const isNew = !items[it.id];
      items[it.id] = it;
      if (isNew && ACTIVE_STATUSES.includes(it.status)) hasNew = true;
      // Xoá khỏi local khi served/cancelled để board gọn
      if (it.status === 'served' || it.status === 'cancelled') {
        delete items[it.id];
      }
      // Cập nhật lastSince
      if (!lastSince || it.updated_at > lastSince) lastSince = it.updated_at;
    }
    if (hasNew && !muteSound) playBell();
    lastPollOk = Date.now();
    renderBoard();
  } catch (err) {
    console.error('[kitchen poll]', err);
    renderBoard(); // cập nhật chấm đỏ
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────
async function handleAction(btn) {
  const action = btn.dataset.action;
  const itemId = btn.dataset.item;
  // data-order có thể là nhiều mã phiếu ngăn cách dấu phẩy khi thẻ gộp theo bàn / theo món.
  const orderIds = String(btn.dataset.order || '').split(',').map((s) => s.trim()).filter(Boolean);
  const forEachOrder = (fn) => Promise.all(orderIds.map(fn));

  try {
    if (action === 'item-cooking') await api.patch(`/api/mgr/kitchen/items/${itemId}`, { status: 'cooking' });
    else if (action === 'item-done') await api.patch(`/api/mgr/kitchen/items/${itemId}`, { status: 'done' });
    else if (action === 'item-served') await api.patch(`/api/mgr/kitchen/items/${itemId}`, { status: 'served' });
    else if (action === 'order-cooking') await forEachOrder((id) => api.patch(`/api/mgr/kitchen/orders/${id}`, { status: 'cooking' }));
    else if (action === 'order-done') await forEachOrder((id) => api.patch(`/api/mgr/kitchen/orders/${id}`, { status: 'done' }));
    else if (action === 'order-served') await forEachOrder((id) => api.patch(`/api/mgr/kitchen/orders/${id}`, { status: 'served' }));
    else if (action === 'call-staff') {
      await forEachOrder((id) => api.post('/api/mgr/kitchen/call-staff', { orderId: parseInt(id, 10) }));
      toast('Đã gọi phục vụ ra lấy món');
    }
    // Force refresh ngay (không chờ poll 3s)
    lastSince = null; // lấy lại toàn bộ
    items = {};
    await poll();
  } catch (err) {
    toast('Lỗi: ' + (err.message || 'Không thể thực hiện'), 'error');
  }
}

// ── CSS nội tuyến (phong cách bếp: nền tối, chữ to, nút lớn) ─────────────────
const KDS_CSS = `
<style id="kds-style">
/* GĐ10 — dùng ĐÚNG bộ chữ của cả app (trước đây màn Bếp ép bộ chữ mặc định của trình duyệt nên
   nhìn lạc lõng so với 40 màn còn lại). Nền tối thì GIỮ NGUYÊN: bếp nóng, đứng xa nhìn màn tối rõ
   hơn nhiều so với nền trắng của Sổ Bán Hàng — đây là chỗ bản của quán mình làm tốt hơn. */
.kds-wrap { display:flex; flex-direction:column; height:100%; background:#111; color:#eee;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif; }
.kds-toolbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#1a1a1a; border-bottom:1px solid #333; flex-wrap:wrap; }
.kds-title { font-size:1.1rem; font-weight:700; color:#4ade80; margin-right:auto; }
.kds-filter-btn { padding:6px 12px; border-radius:6px; border:1px solid #555; background:#222; color:#ccc; cursor:pointer; font-size:0.85rem; }
.kds-filter-btn.active { background:#166534; border-color:#4ade80; color:#fff; }
/* Task 2 mục 5: ô chọn kiểu xếp thẻ (theo đơn / bàn / món / từng món lẻ). Phải tự tô màu nền tối
   vì <select> mặc định của trình duyệt là nền trắng chữ đen, chói mắt giữa màn bếp nền đen. */
.kds-mode-wrap { display:flex; align-items:center; gap:6px; font-size:0.8rem; color:#888; }
.kds-mode-wrap select { color:#eee; background:#222; }
.kds-mode-wrap select option { background:#222; color:#eee; }
.kds-board { display:flex; flex:1; gap:8px; padding:8px; overflow:hidden; }
.kds-col { display:flex; flex-direction:column; flex:1; min-width:0; background:#1a1a1a; border-radius:10px; overflow:hidden; }
.kds-col-header { padding:10px 12px; font-size:0.85rem; font-weight:700; letter-spacing:.05em; border-bottom:2px solid #333; display:flex; justify-content:space-between; }
.kds-col[data-status="pending"] .kds-col-header { color:#f59e0b; border-color:#f59e0b; }
.kds-col[data-status="cooking"] .kds-col-header { color:#3b82f6; border-color:#3b82f6; }
.kds-col[data-status="done"] .kds-col-header { color:#4ade80; border-color:#4ade80; }
.kds-col-count { background:#333; padding:2px 8px; border-radius:999px; font-size:0.9rem; }
.kds-col-body { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:8px; }
.kds-card { background:#262626; border-radius:8px; padding:12px; border-left:4px solid #555; }
.kds-card-pending { border-color:#f59e0b; }
.kds-card-cooking { border-color:#3b82f6; }
.kds-card-done { border-color:#4ade80; }
.kds-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.kds-order-code { font-size:1.1rem; font-weight:800; color:#fff; }
.kds-timer { font-size:0.85rem; padding:3px 8px; border-radius:4px; font-weight:600; }
.kds-timer-green { background:#14532d; color:#4ade80; }
.kds-timer-yellow { background:#713f12; color:#fbbf24; }
.kds-timer-red { background:#7f1d1d; color:#f87171; }
@keyframes kds-blink-anim { 0%,100%{opacity:1} 50%{opacity:.3} }
.kds-blink { animation:kds-blink-anim 1s ease infinite; }
.kds-items { margin-bottom:10px; }
.kds-item-row { font-size:1.05rem; line-height:1.5; color:#e5e7eb; }
.kds-note { margin-top:3px; font-size:0.9rem; color:#fbbf24; display:flex; gap:4px; align-items:flex-start; }
.kds-note-icon { flex-shrink:0; }
.kds-actions { display:flex; gap:8px; flex-wrap:wrap; }
.kds-btn { padding:12px 16px; border:none; border-radius:8px; font-size:1rem; font-weight:700; cursor:pointer; min-height:60px; min-width:80px; }
.kds-btn-start { background:#d97706; color:#fff; }
.kds-btn-done { background:#1d4ed8; color:#fff; }
.kds-btn-served { background:#15803d; color:#fff; }
.kds-btn-call { background:#374151; color:#d1d5db; }
.kds-empty { color:#555; text-align:center; padding:20px; font-size:0.9rem; }
.kds-conn { display:flex; align-items:center; gap:5px; font-size:0.75rem; }
.kds-dot { width:9px; height:9px; border-radius:50%; }
.kds-dot-green { background:#4ade80; }
.kds-dot-red { background:#ef4444; animation:kds-blink-anim 1s ease infinite; }
</style>`;

// ── render() — entry point gọi từ app.js ──────────────────────────────────────
export function render(el) {
  container = el;
  // Khởi tạo state
  items = {}; lastSince = null; stationFilter = ''; groupMode = readKdsMode(); lastPollOk = Date.now();

  el.innerHTML = KDS_CSS + `
    <div class="kds-wrap">
      <div class="kds-toolbar">
        <span class="kds-title"><span class="inline-ico">${icon('bep')}</span> BẾP CƠM A THUÝ</span>

        <button class="kds-filter-btn active" data-station="">Tất cả</button>
        <button class="kds-filter-btn" data-station="bep">Bếp</button>
        <button class="kds-filter-btn" data-station="bar">Pha chế</button>

        <label class="kds-mode-wrap">Xếp theo
          <select class="kds-filter-btn" id="kds-mode-sel">
            ${Object.entries(GROUP_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </label>
        <button class="kds-filter-btn" id="kds-mute-btn"><span class="inline-ico">${icon('chuong')}</span> Tiếng</button>
        <button class="kds-filter-btn" id="kds-fs-btn" aria-label="Toàn màn hình">${icon('toan-man-hinh')}</button>

        <span class="kds-conn">
          <span id="kds-conn-dot" class="kds-dot kds-dot-green"></span>
          <span id="kds-conn-label">Đang kết nối</span>
        </span>
      </div>

      <div id="kds-board" class="kds-board">
        ${['pending','cooking','done'].map((s) => `
          <div class="kds-col" data-status="${s}">
            <div class="kds-col-header">
              <span>${STATUS_LABEL[s]}</span>
              <span class="kds-col-count">0</span>
            </div>
            <div class="kds-col-body"></div>
          </div>`).join('')}
      </div>
    </div>`;

  // Station filter buttons
  el.querySelectorAll('.kds-filter-btn[data-station]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stationFilter = btn.dataset.station;
      el.querySelectorAll('.kds-filter-btn[data-station]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      items = {}; lastSince = null; // reset để lấy lại toàn bộ
      poll();
    });
  });

  // Kiểu xếp thẻ — ghi nhớ để ca sau bếp không phải chọn lại.
  const modeSel = el.querySelector('#kds-mode-sel');
  modeSel.value = groupMode;
  modeSel.addEventListener('change', (e) => {
    groupMode = GROUP_MODES[e.target.value] ? e.target.value : 'don';
    try { localStorage.setItem(KDS_MODE_KEY, groupMode); } catch { /* chế độ riêng tư */ }
    renderBoard();
  });

  // Mute toggle
  // currentTarget chứ không phải target: bấm trúng chữ hay trúng icon SVG bên trong đều phải
  // cập nhật đúng cái nút, không phải cái <span> con.
  el.querySelector('#kds-mute-btn').addEventListener('click', (e) => {
    muteSound = !muteSound;
    e.currentTarget.innerHTML = muteSound
      ? `<span class="inline-ico">${icon('tat-tieng')}</span> Tắt tiếng`
      : `<span class="inline-ico">${icon('chuong')}</span> Tiếng`;
  });

  // Fullscreen
  el.querySelector('#kds-fs-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      // Giữ màn hình luôn sáng (Wake Lock API)
      if (navigator.wakeLock) {
        navigator.wakeLock.request('screen').catch(() => {});
      }
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Action delegation
  el.querySelector('#kds-board').addEventListener('click', (e) => {
    const btn = e.target.closest('.kds-btn');
    if (btn) handleAction(btn);
  });

  // Cập nhật đồng hồ mỗi giây (không cần gọi API)
  tickTimer = setInterval(renderBoard, 1000);

  // Polling
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

// Dọn dẹp khi rời màn hình
export function destroy() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  container = null;
}
