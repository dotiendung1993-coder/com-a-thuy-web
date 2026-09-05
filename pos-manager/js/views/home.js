// GĐ9 — Trang chủ dựng lại theo màn "Tổng quan" (/mission-control) của app.sobanhang.com.
// Khảo sát: output/sobanhang-survey/KHAO-SAT-TOAN-BO.md mục 2 + ảnh screens/01-mission-control.jpeg
//   Tổng quan (4 thẻ KPI) → Hoạt động kinh doanh (thao tác nhanh · doanh thu tuần · cần xử lý ·
//   lãi lỗ tuần · bán chạy · tồn kho thấp · đơn hôm nay) → Dành cho bạn → Tất cả tính năng.
// Biểu đồ vẽ bằng CSS thuần, KHÔNG nạp thư viện ngoài (app chạy offline được).
//
// Đợt 4 (16/08/2026) — cập nhật theo giao diện "Bức tranh kinh doanh" mới nhất của app Sổ Bán
// Hàng (khảo sát ảnh chụp 12/08/2026, thư mục Website v2/Tổng quan): 5 thẻ KPI (thêm "Khách mới",
// giữ "Mục tiêu doanh thu" — tính năng đã có, không có trong ảnh mới nhưng chủ quán đang dùng nên
// KHÔNG bỏ), khối "Cần xem xét" 7 dòng cố định thay cho "Cần xử lý" gộp chữ, khối "Thao tác nhanh"
// 9 nút lưới thay 3 nút chữ, khối mới "Hoạt động gần đây" (tab Đơn vừa bán / Thu chi gần đây).
// Ảnh quảng cáo ngân hàng của app gốc KHÔNG sao chép (không áp dụng cho quán ăn cụ thể này).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon, iconColor } from '../icons.js';
import { openTxnModal } from './thu-chi.js';
import {
  allowedFeatures, featureByRoute, getShortcutRoutes, setShortcutRoutes,
  GROUP_ORDER, MAX_SHORTCUTS,
} from '../nav.js';

const DOW = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const DOW_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Nhãn trạng thái/thanh toán/kênh bán cho bảng "Đơn vừa bán" — giống hệt orders.js để không lệch
// chữ giữa 2 màn (đơn "Đang xử lý" ở đây phải là "Đang xử lý" y hệt màn Đơn hàng).
const STATUS_LABEL = {
  payment_pending: 'Chờ xác nhận', confirmed: 'Đang xử lý', preparing: 'Đang xử lý',
  paid: 'Đã giao', delivered: 'Đã giao', returned: 'Trả hàng', cancelled: 'Huỷ',
};
const DELIVERY_LABEL = { 'tai-ban': 'Tại bàn', 'mang-ve': 'Mang về', 'giao-hang': 'Giao hàng' };
const PAYMENT_LABEL = {
  'tien-mat': 'Tiền mặt', 'chuyen-khoan': 'Chuyển khoản', 'ghi-no': 'Ghi nợ',
  the: 'Thẻ', vi: 'Ví điện tử',
};
// Icon riêng cho từng dòng "Cần xem xét" — dùng lại icon có sẵn trong icons.js, không vẽ thêm svg.
const REVIEW_ICON = {
  'cho-xac-nhan': 'quan-ly-ca', 'dang-giao': 'giao-hang', 'het-hang': 'canh-bao',
  'ton-kho-thap': 'ton-kho', 'can-nhac-no': 'chuong', 'chua-lich-nhac-no': 'chuong',
  'can-thu-no': 'so-no',
};
// Việc "Website v2" (03/09/2026) — mỗi dòng "Cần xem xét" có MỘT MÀU RIÊNG trong ảnh mẫu (ô icon
// nền nhạt + số đếm cùng tông), không phải xanh lá đồng loạt. Chỉ gắn TÊN TÔNG MÀU ở đây; màu thật
// khai báo trong theme-v2.css nên giao diện cũ không đổi.
const REVIEW_TONE = {
  'cho-xac-nhan': 'tone-orange', 'dang-giao': 'tone-blue', 'het-hang': 'tone-red',
  'ton-kho-thap': 'tone-amber', 'can-nhac-no': 'tone-purple', 'chua-lich-nhac-no': 'tone-blue',
  'can-thu-no': 'tone-green',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ── Task 2 mục 7 (2026-08-08): thu gọn từng mục trên trang chủ ────────────────────────────────
// Chủ quán: "các mục khác có thêm nút ấn để thu gọn khi cần thiết". Trạng thái lưu localStorage
// theo từng mục, nên chủ quán gập "Hoạt động kinh doanh" một lần là những lần sau vào vẫn gọn.
// MẶC ĐỊNH mọi mục đều MỞ — không ai muốn mở app lên thấy trang trống.
const COLLAPSE_KEY = 'posmgr_home_collapsed';

function readCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
}
function writeCollapsed(set) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* chế độ riêng tư */ }
}

// Tên nhóm do nav.js cấp (tiếng Việt có dấu, có khoảng trắng) — đổi sang khoá an toàn để nhét vào
// thuộc tính data-* và lưu localStorage.
function groupKey(name) {
  return 'nhom-' + String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function secClass(key) { return readCollapsed().has(key) ? 'sec-head collapsed' : 'sec-head'; }
function caretHtml() { return '<span class="sec-caret" aria-hidden="true"></span>'; }

// Gắn sự kiện bấm cho mọi tiêu đề có data-sec, đồng thời áp lại trạng thái đã lưu cho phần thân.
function bindCollapsibles(container) {
  const collapsed = readCollapsed();
  container.querySelectorAll('[data-sec]').forEach((head) => {
    const key = head.dataset.sec;
    const body = container.querySelector(`[data-sec-body="${CSS.escape(key)}"]`);
    if (!body) return;

    const apply = (isCollapsed) => {
      head.classList.toggle('collapsed', isCollapsed);
      body.classList.toggle('hidden', isCollapsed);
      head.setAttribute('aria-expanded', String(!isCollapsed));
    };
    apply(collapsed.has(key));

    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.title = 'Bấm để thu gọn / mở lại mục này';

    const toggle = (e) => {
      // Nút "Chỉnh sửa" nằm TRONG tiêu đề "Dành cho bạn" — bấm nút đó không được gập mục.
      if (e.target.closest('button') && !e.target.closest('.sec-caret')) return;
      const set = readCollapsed();
      const next = !set.has(key);
      if (next) set.add(key); else set.delete(key);
      writeCollapsed(set);
      apply(next);
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
    });
  });
}

// Một tính năng trong lưới: icon màu + tên. Nhãn lấy từ nav.js (danh sách cứng) nên an toàn,
// vẫn escape để phòng sau này ai đó nạp nhãn từ server.
function featureCardHtml(f) {
  return `
    <a href="#/${f.route}" class="feature-card">
      <span class="icon" style="color:${iconColor(f.route)}">${icon(f.route)}</span>
      <span>${escapeHtml(f.label)}</span>
    </a>`;
}

// Mũi tên + phần trăm so với hôm qua, giống dòng "↑ 0.0% so với hôm qua" của app.
function deltaHtml(pct) {
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  return `<div class="kpi-delta ${dir}">${arrow} ${Math.abs(pct).toFixed(1)}%
    <span>so với hôm qua</span></div>`;
}

// Đợt 4 — 2 dòng số phụ dưới mỗi thẻ KPI (vd "Giảm giá hoá đơn / Trả hàng (n)"), giống bố cục ảnh
// mẫu "Bức tranh kinh doanh". money=true thì format tiền, ngược lại in số thô.
function kpiSubRowsHtml(rows) {
  return `<div class="kpi-subrows">${rows.map(([label, value]) => `
    <div class="kpi-subrow"><span>${escapeHtml(label)}</span><b>${value}</b></div>`).join('')}</div>`;
}

// Biểu đồ cột đôi 7 ngày (tuần này vs tuần trước) — CSS thuần.
// GĐ11: thêm đường lưới đứt nét + mốc trục dọc (0 và giá trị cao nhất) giống biểu đồ ApexCharts
// của app.sobanhang.com — ảnh screens/01-mission-control.jpeg. Không nạp thư viện ngoài.
function weekChartHtml(title, thisWeek, lastWeek, totalLabel, totalValue, extraClass = '') {
  const peak = Math.max(0, ...thisWeek.map((d) => d.value), ...lastWeek.map((d) => d.value));
  const max = Math.max(1, peak); // chia cho 0 thì vỡ, nên vẫn chặn dưới là 1…
  const maxLabel = peak > 0 ? formatVND(peak) : ''; // …nhưng đừng ghi "1₫" lên trục khi chưa có số liệu
  const bars = thisWeek.map((d, i) => {
    const prev = lastWeek[i]?.value || 0;
    const h1 = Math.round((Math.max(d.value, 0) / max) * 100);
    const h2 = Math.round((Math.max(prev, 0) / max) * 100);
    // Nhãn ngày: máy tính hiện đủ chữ "Thứ hai" như bản web, điện thoại rút gọn "T2" cho vừa
    // màn hình. CSS chọn hiện cái nào, nên cả hai chuỗi đều có sẵn trong HTML.
    return `
      <div class="wk-col" title="${escapeHtml(DOW[i])}: ${formatVND(d.value)}">
        <div class="wk-bars">
          <i class="now" style="height:${h1}%"></i>
          <i class="prev" style="height:${h2}%"></i>
        </div>
        <span class="wk-day"><b class="wk-day-full">${DOW[i]}</b><b class="wk-day-short">${DOW_SHORT[i]}</b></span>
      </div>`;
  }).join('');

  return `
    <div class="card wk-card ${extraClass}">
      <div class="card-head">
        <h3>${escapeHtml(title)}</h3>
        <div class="wk-legend"><span class="now"></span>Tuần này <span class="prev"></span>Tuần trước</div>
      </div>
      <div class="wk-plot">
        <div class="wk-axis"><span>${maxLabel}</span><span>0</span></div>
        <div class="wk-area">
          <div class="wk-grid" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="wk-chart">${bars}</div>
        </div>
      </div>
      <div class="wk-total"><span>${escapeHtml(totalLabel)}</span><b>${formatVND(totalValue)}</b></div>
    </div>`;
}

function listCardHtml(title, route, rows, emptyText, extraClass = '') {
  return `
    <div class="card list-card ${extraClass}">
      <div class="card-head">
        <h3>${escapeHtml(title)}</h3>
        ${route ? `<a class="see-all" href="#/${route}">Xem tất cả</a>` : ''}
      </div>
      ${rows.length
        ? `<ul class="mini-list">${rows.join('')}</ul>`
        : `<p class="mini-empty">${escapeHtml(emptyText)}</p>`}
    </div>`;
}

// Đợt 4 — khối "Cần xem xét" (7 dòng CỐ ĐỊNH, luôn hiện cả khi số = 0, đúng khảo sát ảnh mẫu).
function reviewCardHtml(review) {
  const rows = (review || []).map((r) => `
    <a class="review-row" href="#/${r.route}">
      <span class="review-ico ${REVIEW_TONE[r.key] || ''}">${icon(REVIEW_ICON[r.key] || 'canh-bao')}</span>
      <span class="review-label">${escapeHtml(r.label)}</span>
      <span class="review-count ${REVIEW_TONE[r.key] || ''} ${r.count > 0 ? 'has' : ''}">${r.count}</span>
      <span class="review-chev">${icon('quay-lai')}</span>
    </a>`).join('');
  return `
    <div class="card review-card">
      <div class="card-head">
        <h3>${icon('canh-bao')}Cần xem xét</h3>
        <a class="see-all" href="#/don-hang">Xem tất cả</a>
      </div>
      <div class="review-list">${rows}</div>
    </div>`;
}

// Đợt 4 — khối "Thao tác nhanh" mới: 1 banner POS + lưới 9 nút. 3 nút mở modal thẳng tại chỗ
// (Tạo khoản thu/chi dùng lại openTxnModal của thu-chi.js — Làm mới dữ liệu chỉ gọi lại API,
// không có thao tác "Đồng bộ dữ liệu" thật vì app này không kết nối sàn TMĐT như Sổ Bán Hàng).
function quickActionsHtml() {
  return `
    <div class="card quick-card dash-quick">
      <h3>${icon('chuyen-tien')}Thao tác nhanh</h3>
      <a class="qa-pos" href="#/ban-hang">
        <span>POS Bán hàng — tạo đơn nhanh tại quầy</span>
        <span class="btn btn-primary qa-pos-btn">${icon('ban-hang')}Mở POS Bán hàng</span>
      </a>
      <!-- Việc "Website v2" (03/09/2026) — ảnh mẫu: mỗi nút là ô vuông bo góc TÔ MÀU ĐẶC, icon
           trắng bên trong, chữ nằm dưới. Bọc icon trong .qa-ico + gắn tên tông màu; màu thật khai
           báo trong theme-v2.css nên giao diện cũ giữ nguyên icon xanh lá không nền. -->
      <div class="qa-grid">
        <a class="qa-tile" href="#/ban-hang"><span class="qa-ico tone-green">${icon('them')}</span><span>Tạo đơn hàng</span></a>
        <a class="qa-tile" href="#/quan-ly-ban"><span class="qa-ico tone-blue">${icon('quan-ly-ban')}</span><span>Tạo đơn tại bàn</span></a>
        <a class="qa-tile" href="#/san-pham"><span class="qa-ico tone-blue">${icon('san-pham')}</span><span>Tạo sản phẩm mới</span></a>
        <button type="button" class="qa-tile" id="qa-refresh"><span class="qa-ico tone-gray">${icon('chuyen-tien')}</span><span>Làm mới dữ liệu</span></button>
        <a class="qa-tile" href="#/nhap-hang"><span class="qa-ico tone-gray">${icon('tai-xuong')}</span><span>Nhập kho</span></a>
        <a class="qa-tile" href="#/kiem-kho"><span class="qa-ico tone-orange">${icon('kiem-kho')}</span><span>Kiểm kho</span></a>
        <button type="button" class="qa-tile" id="qa-thu"><span class="qa-ico tone-green">${icon('thu-chi')}</span><span>Tạo khoản thu</span></button>
        <button type="button" class="qa-tile" id="qa-chi"><span class="qa-ico tone-orange">${icon('thu-chi')}</span><span>Tạo khoản chi</span></button>
        <a class="qa-tile" href="#/so-no"><span class="qa-ico tone-purple">${icon('so-no')}</span><span>Tạo nợ khách hàng</span></a>
      </div>
    </div>`;
}

// Đợt 4 — khối "Hoạt động gần đây" (2 tab). Khung tĩnh vẽ 1 lần, nội dung đổi theo tab qua
// paintActivity() để bấm chuyển tab không phải gọi lại API.
function activityCardHtml() {
  return `
    <div class="card activity-card dash-activity">
      <div class="card-head">
        <h3>${icon('phieu')}Hoạt động gần đây</h3>
        <div class="activity-tabs">
          <button type="button" class="seg-btn active" data-tab="orders">Đơn vừa bán</button>
          <button type="button" class="seg-btn" data-tab="txns">Thu chi gần đây</button>
        </div>
      </div>
      <div id="activity-body"></div>
    </div>`;
}

function activityOrdersHtml(orders) {
  if (!orders.length) return '<p class="mini-empty">Chưa có đơn hàng nào gần đây</p>';
  const rows = orders.map((o) => `
    <tr>
      <td class="act-info">
        <b>${escapeHtml(o.customer_name || 'Khách lẻ')}</b>
        <span>${escapeHtml(o.order_code)}</span>
      </td>
      <td>${escapeHtml(o.at)}</td>
      <td><span class="order-status-badge status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
      <td>${escapeHtml(PAYMENT_LABEL[o.payment_method] || (o.payment_method ? o.payment_method : '—'))}</td>
      <td>${escapeHtml(DELIVERY_LABEL[o.delivery_type] || o.delivery_type || '—')}</td>
      <td class="act-total">${formatVND(o.total)}</td>
    </tr>`).join('');
  return `
    <div class="table-scroll act-table-scroll">
      <table class="act-table">
        <thead><tr><th>Thông tin đơn hàng</th><th>Thời gian</th><th>Trạng thái</th>
          <th>Thanh toán</th><th>Kênh bán</th><th>Tổng đơn</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function activityTxnsHtml(txns) {
  if (!txns.length) return '<p class="mini-empty">Chưa có phiếu thu chi nào gần đây</p>';
  const rows = txns.map((t) => {
    const label = t.order_code ? `${t.code} · Thu tiền đơn ${t.order_code}`
      : `${t.code} · ${escapeHtml(t.category_name || t.note || (t.direction === 'thu' ? 'Khoản thu' : 'Khoản chi'))}`;
    const time = new Date(t.occurred_at).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    });
    return `
      <li class="act-txn ${t.direction}">
        <span class="act-txn-ico">${icon(t.direction === 'thu' ? 'tai-xuong' : 'tra-hang')}</span>
        <span class="act-txn-info"><b>${label}</b><span>${time}</span></span>
        <b class="act-txn-amount">${t.direction === 'thu' ? '+' : '-'}${formatVND(t.amount)}</b>
      </li>`;
  }).join('');
  return `<ul class="act-txn-list">${rows}</ul>`;
}

// Hộp thoại "Chỉnh sửa lối tắt" — bấm vào thẻ để bật/tắt, tối đa MAX_SHORTCUTS.
function openShortcutPicker(staff, onSaved) {
  const all = allowedFeatures(staff);
  let picked = getShortcutRoutes(staff);

  const { overlay, close } = openModal(`
    <h3>Chỉnh sửa lối tắt</h3>
    <p class="picker-hint">Bấm vào tính năng để thêm hoặc bỏ khỏi mục "Dành cho bạn"
      (tối đa ${MAX_SHORTCUTS} ô).</p>
    <div class="feature-grid" id="sc-grid"></div>
    <div class="modal-close-row">
      <button class="btn" id="sc-cancel">Huỷ</button>
      <button class="btn btn-primary" id="sc-save">Lưu</button>
    </div>
  `);

  const grid = overlay.querySelector('#sc-grid');
  function paint() {
    grid.innerHTML = all.map((f) => {
      const on = picked.includes(f.route);
      return `
        <button type="button" class="feature-card" data-route="${f.route}">
          <span class="icon" style="color:${iconColor(f.route)}">${icon(f.route)}</span>
          <span>${escapeHtml(f.label)}</span>
          <span class="pick-badge ${on ? 'remove' : ''}">${on ? '−' : '+'}</span>
        </button>`;
    }).join('');
  }
  paint();

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    const r = btn.dataset.route;
    if (picked.includes(r)) picked = picked.filter((x) => x !== r);
    else if (picked.length >= MAX_SHORTCUTS) return toast(`Tối đa ${MAX_SHORTCUTS} lối tắt`, 'error');
    else picked = [...picked, r];
    paint();
  });

  overlay.querySelector('#sc-cancel').addEventListener('click', close);
  overlay.querySelector('#sc-save').addEventListener('click', () => {
    if (!picked.length) return toast('Chọn ít nhất 1 lối tắt', 'error');
    setShortcutRoutes(picked);
    close();
    toast('Đã lưu lối tắt');
    onSaved();
  });
}

// Hộp thoại đặt mục tiêu doanh thu (nút bút chì trên thẻ KPI thứ 2, giống app).
function openGoalPicker(current, onSaved) {
  const { overlay, close } = openModal(`
    <h3>Mục tiêu doanh thu</h3>
    <p class="picker-hint">Mục tiêu doanh thu trong ngày. Để 0 nếu không muốn theo dõi.</p>
    <input id="goal-input" type="number" min="0" step="1000" value="${Number(current) || 0}">
    <div class="modal-close-row">
      <button class="btn" id="goal-cancel">Huỷ</button>
      <button class="btn btn-primary" id="goal-save">Lưu</button>
    </div>
  `);
  overlay.querySelector('#goal-cancel').addEventListener('click', close);
  overlay.querySelector('#goal-save').addEventListener('click', async () => {
    const val = Math.max(0, Math.round(Number(overlay.querySelector('#goal-input').value) || 0));
    try {
      await api.patch('/api/mgr/settings/dashboard', { revenue_goal: val });
      close();
      toast('Đã lưu mục tiêu doanh thu');
      onSaved();
    } catch (err) {
      toast(err?.body?.message || 'Không lưu được mục tiêu', 'error');
    }
  });
}

export async function render(container, { staff } = {}) {
  const storeName = staff?.store_name || 'Cơm A Thuý';
  // Chỉ người có quyền sửa cài đặt mới thấy nút đặt mục tiêu (API cũng chặn, đây là chặn sớm).
  const canSetGoal = Boolean(staff?.perms?.settings_manage);
  // Đợt 4 — dữ liệu overview mới nhất, đọc lúc BẤM chứ không đóng gói lúc gắn sự kiện. Nhờ vậy
  // các nút Tạo khoản thu/chi/Hoạt động gần đây chỉ cần gắn sự kiện MỘT LẦN trong paint() (paint()
  // dựng DOM mới hoàn toàn mỗi lần gọi), không phải gắn lại mỗi lần loadOverview() làm mới số liệu
  // — gắn lại trong loadOverview() từng làm CHỒNG LISTENER (bấm 1 lần mà nhiều toast/nhiều lần gọi
  // API, phát hiện lúc tự bấm tay kiểm tra "Làm mới dữ liệu" nhiều lần liên tiếp).
  let latestOverview = null;

  function paint() {
    const shortcuts = getShortcutRoutes(staff).map(featureByRoute).filter(Boolean);
    const all = allowedFeatures(staff);
    const groups = GROUP_ORDER
      .map((g) => ({ name: g, items: all.filter((f) => f.group === g) }))
      .filter((g) => g.items.length);

    container.innerHTML = `
      <div class="home-greet">
        <div class="hi">${greeting()}, ${escapeHtml(staff?.name || '')}</div>
        <div class="store">${escapeHtml(storeName)}</div>
      </div>

      <!-- Đợt 4 — "Bức tranh kinh doanh" thay chữ "Tổng quan" (đúng tiêu đề ảnh mẫu mới nhất),
           vẫn dùng data-sec="tong-quan" NGUYÊN VẸN để không mất trạng thái thu gọn đã lưu. -->
      <h2 class="dash-h2 ${secClass('tong-quan')}" data-sec="tong-quan">Bức tranh kinh doanh${caretHtml()}</h2>
      <div id="kpi-row" class="kpi-row kpi-row-5 sec-body" data-sec-body="tong-quan"><div class="kpi-loading">Đang tải…</div></div>

      <!-- Task 2 mục 7 (2026-08-08): chủ quán yêu cầu đưa "Dành cho bạn" lên NGAY DƯỚI "Tổng quan"
           và TRÊN "Hoạt động kinh doanh" — lối tắt hay dùng nhất phải nằm trong tầm mắt đầu tiên,
           không phải cuộn qua hết biểu đồ mới thấy. -->
      <div class="section-label ${secClass('danh-cho-ban')}" data-sec="danh-cho-ban">
        <span>Dành cho bạn${caretHtml()}</span>
        <button class="edit-link" id="edit-shortcuts">${icon('chinh-sua')}Chỉnh sửa</button>
      </div>
      <div class="feature-grid shortcuts sec-body" data-sec-body="danh-cho-ban">${shortcuts.map(featureCardHtml).join('')}</div>

      <!-- Đợt 4 — "Cần xem xét" (7 dòng cố định) chen NGAY DƯỚI "Dành cho bạn" và TRÊN "Hoạt động
           kinh doanh", đúng vị trí ảnh mẫu (khối "Cần xem xét" nằm cạnh "Thao tác nhanh", cả hai ở
           trên biểu đồ tuần) — không thuộc sec "hoat-dong" để gập biểu đồ không kéo theo mất khối này. -->
      <div class="review-quick-row">
        ${reviewCardHtml(null) /* khung rỗng lúc đầu, loadOverview() vẽ lại đủ số liệu bên dưới */}
        ${quickActionsHtml()}
      </div>

      <h2 class="dash-h2 ${secClass('hoat-dong')}" data-sec="hoat-dong">Hoạt động kinh doanh${caretHtml()}</h2>
      <!-- GĐ11 — trên máy tính xếp 2 cột như /mission-control: trái là Thao tác nhanh + Cần xử lý,
           phải là 2 biểu đồ tuần, dưới cùng 3 thẻ danh sách nằm ngang. Điện thoại vẫn 1 cột dọc.
           Đợt 4 — Thao tác nhanh/Cần xem xét đã chuyển lên trên (xem review-quick-row), khối này giờ
           chỉ còn biểu đồ + danh sách phụ + "Hoạt động gần đây" mới. -->
      <div class="hoat-dong-body sec-body" data-sec-body="hoat-dong">
        <div class="dash-grid-charts">
          <div id="dash-blocks"></div>
        </div>
        ${activityCardHtml()}
      </div>

      ${groups.map((g) => `
        <div class="group-block">
          <div class="section-label ${secClass(groupKey(g.name))}" data-sec="${escapeHtml(groupKey(g.name))}">
            <span>${escapeHtml(g.name)}${caretHtml()}</span>
          </div>
          <div class="feature-grid sec-body" data-sec-body="${escapeHtml(groupKey(g.name))}">${g.items.map(featureCardHtml).join('')}</div>
        </div>`).join('')}
    `;

    bindCollapsibles(container);

    container.querySelector('#edit-shortcuts')
      .addEventListener('click', () => openShortcutPicker(staff, paint));

    // ── "Thao tác nhanh" — 3 nút mở modal thẳng tại chỗ, đọc accounts mới nhất lúc bấm ───────
    const quickCard = container.querySelector('.dash-quick');
    quickCard.querySelector('#qa-refresh').addEventListener('click', () => {
      toast('Đã làm mới số liệu');
      loadOverview();
    });
    quickCard.querySelector('#qa-thu').addEventListener('click', () => openTxnModal('thu', {
      accounts: latestOverview?.cash_accounts || [],
      defaultAccountId: latestOverview?.cash_accounts?.[0]?.id,
      onSaved: loadOverview,
    }));
    quickCard.querySelector('#qa-chi').addEventListener('click', () => openTxnModal('chi', {
      accounts: latestOverview?.cash_accounts || [],
      defaultAccountId: latestOverview?.cash_accounts?.[0]?.id,
      onSaved: loadOverview,
    }));

    // ── "Hoạt động gần đây" — tab Đơn vừa bán / Thu chi gần đây ─────────────────────────────
    const activityCard = container.querySelector('.activity-card');
    const activityBody = activityCard.querySelector('#activity-body');
    const paintActivity = (tab) => {
      const act = latestOverview?.recent_activity || { orders: [], transactions: [] };
      activityBody.innerHTML = tab === 'txns' ? activityTxnsHtml(act.transactions) : activityOrdersHtml(act.orders);
    };
    activityCard.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activityCard.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        paintActivity(btn.dataset.tab);
      });
    });

    loadOverview();
  }

  async function loadOverview() {
    let d;
    try {
      d = await api.get('/api/mgr/home/overview');
    } catch (err) {
      if (err?.status !== 401) toast('Không tải được số liệu Tổng quan', 'error');
      return;
    }
    latestOverview = d;
    const kpiRow = container.querySelector('#kpi-row');
    const blocks = container.querySelector('#dash-blocks');
    const reviewSlot = container.querySelector('.review-quick-row');
    if (!kpiRow || !blocks) return;

    // Vẽ lại khối "Cần xem xét" với số liệu thật (khung rỗng lúc paint() chỉ có tiêu đề).
    if (reviewSlot && reviewSlot.firstElementChild) {
      reviewSlot.firstElementChild.outerHTML = reviewCardHtml(d.review);
    }

    // Nguồn tiền đang xem ở thẻ "SỐ DƯ HÔM NAY" — nhớ theo phiên xem, mặc định nguồn đầu tiên.
    const accounts = d.cash_accounts || [];
    let accIdx = 0;

    function paintKpi() {
      const acc = accounts[accIdx];
      kpiRow.innerHTML = `
        <div class="kpi kpi-revenue">
          <div class="kpi-head"><div class="kpi-label">Doanh thu hôm nay</div>
            <span class="kpi-icon" style="color:${iconColor('doanh-thu')}">${icon('doanh-thu')}</span></div>
          <div class="kpi-value">${formatVND(d.today.revenue)}</div>
          ${deltaHtml(d.today.revenue_change_pct)}
          ${kpiSubRowsHtml([
            ['Giảm giá hoá đơn', formatVND(d.today.discount)],
            [`Trả hàng (${d.today.return_count})`, formatVND(d.today.return_amount)],
          ])}
        </div>
        <div class="kpi kpi-orders">
          <div class="kpi-head"><div class="kpi-label">Đơn hàng hôm nay</div>
            <span class="kpi-icon" style="color:${iconColor('so-don')}">${icon('so-don')}</span></div>
          <div class="kpi-value">${d.today.order_count}</div>
          ${deltaHtml(d.today.order_change_pct)}
          ${kpiSubRowsHtml([
            ['Trung bình đơn', formatVND(d.today.avg_order_value)],
            ['Số khách/đơn', String(d.today.customers_per_order)],
          ])}
        </div>
        <div class="kpi kpi-newcus">
          <div class="kpi-head"><div class="kpi-label">Khách mới</div>
            <span class="kpi-icon" style="color:${iconColor('khach-hang')}">${icon('khach-hang')}</span></div>
          <div class="kpi-value">${d.new_customers.today} <span class="kpi-unit">khách</span></div>
          ${deltaHtml(d.new_customers.change_pct)}
          ${kpiSubRowsHtml([['Khách quay lại', String(d.new_customers.returning_today)]])}
        </div>
        <div class="kpi kpi-cash">
          <!-- Đợt 14 (24/08/2026) — "SỐ DƯ HÔM NAY" phải là 1 dòng trọn vẹn giống các thẻ khác
               (trước đây select nguồn tiền chen NGAY sau chữ trên cùng 1 dòng làm chữ bị bẻ dòng
               giữa chừng "SỐ DƯ" / "HÔM NAY"). Chuyển select xuống hẳn 1 dòng riêng bên dưới. -->
          <div class="kpi-head"><div class="kpi-label">Tổng thu - chi</div>
            <span class="kpi-icon" style="color:${iconColor('nguon-tien')}">${icon('nguon-tien')}</span></div>
          ${accounts.length > 1
            ? `<select class="kpi-acc kpi-acc-row" id="kpi-acc">${accounts
                .map((a, i) => `<option value="${i}" ${i === accIdx ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
                .join('')}</select>`
            : ''}
          <div class="kpi-value">${acc ? formatVND(acc.balance) : '—'}</div>
          <div class="kpi-sub two">
            <span class="in">↑ Thu: ${acc ? formatVND(acc.thu_today) : 0}</span>
            <span class="out">↓ Chi: ${acc ? formatVND(acc.chi_today) : 0}</span>
          </div>
        </div>
        <div class="kpi kpi-goal">
          <!-- Đợt 14 — cùng lý do: "MỤC TIÊU DOANH THU" thành 1 dòng riêng + icon mục tiêu bên
               phải giống 4 thẻ kia (trước đây chỉ có nút bút chì, không có icon chủ đề). Nút bút
               chì "Đặt mục tiêu" dời xuống cạnh số %, vẫn bấm được như cũ. -->
          <div class="kpi-head"><div class="kpi-label">Mục tiêu doanh thu</div>
            <span class="kpi-icon" style="color:${iconColor('muc-tieu')}">${icon('muc-tieu')}</span></div>
          <!-- GĐ11 — vòng tròn tiến độ thay cho thanh ngang, giống thẻ "Mục tiêu doanh thu"
               của app.sobanhang.com. Tính năng đã có từ trước, ảnh mẫu mới nhất không có ô này
               nhưng chủ quán đang dùng để theo dõi mục tiêu ngày nên GIỮ NGUYÊN, không bỏ. -->
          <div class="kpi-goal-body">
            <div>
              <div class="kpi-value">${d.goal.percent.toFixed(0)}%
                ${canSetGoal
                  ? `<button class="kpi-edit" id="goal-edit" aria-label="Đặt mục tiêu">${icon('chinh-sua')}</button>`
                  : ''}
              </div>
              <div class="kpi-sub">${d.goal.target ? `trên ${formatVND(d.goal.target)}` : 'Chưa đặt mục tiêu'}</div>
            </div>
            <div class="kpi-ring" style="--pct:${Math.max(0, Math.min(100, d.goal.percent))}"
                 role="img" aria-label="Đạt ${d.goal.percent.toFixed(0)}% mục tiêu"></div>
          </div>
        </div>`;

      const goalBtn = kpiRow.querySelector('#goal-edit');
      if (goalBtn) goalBtn.addEventListener('click', () => openGoalPicker(d.goal.target, loadOverview));
      const sel = kpiRow.querySelector('#kpi-acc');
      if (sel) sel.addEventListener('change', () => { accIdx = Number(sel.value); paintKpi(); });
    }
    paintKpi();

    // Mỗi thẻ mang một lớp dash-* để CSS xếp đúng ô trong lưới máy tính (xem .dash-grid-charts).
    blocks.innerHTML = `
      ${weekChartHtml('Doanh thu tuần', d.week.this_week, d.week.last_week, 'Tổng', d.week.total_revenue, 'dash-rev')}
      ${weekChartHtml('Lãi lỗ tuần', d.week.this_week_profit, d.week.last_week_profit, 'Lợi nhuận', d.week.total_profit, 'dash-profit')}
      ${listCardHtml('Sản phẩm bán chạy', 'bao-cao-ban-hang',
        d.top_products.map((p) => `<li><span>${escapeHtml(p.name)}</span><b>${p.qty}</b></li>`),
        'Chưa có đơn hàng hôm nay', 'dash-top')}
      ${listCardHtml('Tồn kho thấp', 'ton-kho',
        d.low_stock.map((p) => `<li><span>${escapeHtml(p.name)}</span><b class="low">${p.on_hand}</b></li>`),
        'Chưa tới ngưỡng cảnh báo tồn kho', 'dash-low')}
      ${listCardHtml('Đơn hàng hôm nay', 'don-hang',
        d.recent_orders.map((o) => `<li><span>${escapeHtml(o.order_code)} · ${escapeHtml(o.at)}</span>
          <b>${formatVND(o.total)}</b></li>`),
        'Chưa có đơn hàng hôm nay', 'dash-recent')}
    `;

    // "Hoạt động gần đây" — chỉ vẽ lại NỘI DUNG tab đang chọn (giữ nguyên tab người dùng đang xem
    // qua mỗi lần làm mới/lưu phiếu, không ép về "Đơn vừa bán"; sự kiện bấm tab đã gắn 1 lần ở paint()).
    const activeTab = container.querySelector('.activity-card .seg-btn.active')?.dataset.tab || 'orders';
    const activityBody = container.querySelector('#activity-body');
    if (activityBody) {
      activityBody.innerHTML = activeTab === 'txns'
        ? activityTxnsHtml(d.recent_activity.transactions)
        : activityOrdersHtml(d.recent_activity.orders);
    }
  }

  paint();
}
