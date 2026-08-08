// GĐ9 — Trang chủ dựng lại theo màn "Tổng quan" (/mission-control) của app.sobanhang.com.
// Khảo sát: output/sobanhang-survey/KHAO-SAT-TOAN-BO.md mục 2 + ảnh screens/01-mission-control.jpeg
//   Tổng quan (4 thẻ KPI) → Hoạt động kinh doanh (thao tác nhanh · doanh thu tuần · cần xử lý ·
//   lãi lỗ tuần · bán chạy · tồn kho thấp · đơn hôm nay) → Dành cho bạn → Tất cả tính năng.
// Biểu đồ vẽ bằng CSS thuần, KHÔNG nạp thư viện ngoài (app chạy offline được).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon, iconColor } from '../icons.js';
import {
  allowedFeatures, featureByRoute, getShortcutRoutes, setShortcutRoutes,
  GROUP_ORDER, MAX_SHORTCUTS,
} from '../nav.js';

const DOW = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const DOW_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

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

      <h2 class="dash-h2 ${secClass('tong-quan')}" data-sec="tong-quan">Tổng quan${caretHtml()}</h2>
      <div id="kpi-row" class="kpi-row sec-body" data-sec-body="tong-quan"><div class="kpi-loading">Đang tải…</div></div>

      <!-- Task 2 mục 7 (2026-08-08): chủ quán yêu cầu đưa "Dành cho bạn" lên NGAY DƯỚI "Tổng quan"
           và TRÊN "Hoạt động kinh doanh" — lối tắt hay dùng nhất phải nằm trong tầm mắt đầu tiên,
           không phải cuộn qua hết biểu đồ mới thấy. -->
      <div class="section-label ${secClass('danh-cho-ban')}" data-sec="danh-cho-ban">
        <span>Dành cho bạn${caretHtml()}</span>
        <button class="edit-link" id="edit-shortcuts">${icon('chinh-sua')}Chỉnh sửa</button>
      </div>
      <div class="feature-grid shortcuts sec-body" data-sec-body="danh-cho-ban">${shortcuts.map(featureCardHtml).join('')}</div>

      <h2 class="dash-h2 ${secClass('hoat-dong')}" data-sec="hoat-dong">Hoạt động kinh doanh${caretHtml()}</h2>
      <!-- GĐ11 — trên máy tính xếp 2 cột như /mission-control: trái là Thao tác nhanh + Cần xử lý,
           phải là 2 biểu đồ tuần, dưới cùng 3 thẻ danh sách nằm ngang. Điện thoại vẫn 1 cột dọc. -->
      <div class="dash-grid sec-body" data-sec-body="hoat-dong">
        <div class="card quick-card dash-quick">
          <h3>Thao tác nhanh</h3>
          <div class="quick-actions">
            <a class="qa" href="#/ban-hang">+ Tạo đơn hàng</a>
            <a class="qa" href="#/thu-chi?tao=thu">+ Tạo khoản thu</a>
            <a class="qa danger" href="#/thu-chi?tao=chi">+ Tạo khoản chi</a>
          </div>
        </div>
        <div id="dash-blocks"></div>
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
    const kpiRow = container.querySelector('#kpi-row');
    const blocks = container.querySelector('#dash-blocks');
    if (!kpiRow || !blocks) return;

    // Nguồn tiền đang xem ở thẻ "SỐ DƯ HÔM NAY" — nhớ theo phiên xem, mặc định nguồn đầu tiên.
    const accounts = d.cash_accounts || [];
    let accIdx = 0;

    function paintKpi() {
      const acc = accounts[accIdx];
      kpiRow.innerHTML = `
        <div class="kpi">
          <div class="kpi-label">DOANH THU HÔM NAY</div>
          <div class="kpi-value">${formatVND(d.today.revenue)}</div>
          ${deltaHtml(d.today.revenue_change_pct)}
        </div>
        <div class="kpi">
          <div class="kpi-label">MỤC TIÊU DOANH THU
            ${canSetGoal
              ? `<button class="kpi-edit" id="goal-edit" aria-label="Đặt mục tiêu">${icon('chinh-sua')}</button>`
              : ''}
          </div>
          <!-- GĐ11 — vòng tròn tiến độ thay cho thanh ngang, giống thẻ "Mục tiêu doanh thu"
               của app.sobanhang.com (ảnh screens/01-mission-control.jpeg). -->
          <div class="kpi-goal">
            <div>
              <div class="kpi-value">${d.goal.percent.toFixed(0)}%</div>
              <div class="kpi-sub">${d.goal.target ? `trên ${formatVND(d.goal.target)}` : 'Chưa đặt mục tiêu'}</div>
            </div>
            <div class="kpi-ring" style="--pct:${Math.max(0, Math.min(100, d.goal.percent))}"
                 role="img" aria-label="Đạt ${d.goal.percent.toFixed(0)}% mục tiêu"></div>
          </div>
        </div>
        <div class="kpi">
          <div class="kpi-label">ĐƠN HÀNG HÔM NAY</div>
          <div class="kpi-value">${d.today.order_count}</div>
          ${deltaHtml(d.today.order_change_pct)}
        </div>
        <div class="kpi">
          <div class="kpi-label">SỐ DƯ HÔM NAY
            ${accounts.length > 1
              ? `<select class="kpi-acc" id="kpi-acc">${accounts
                  .map((a, i) => `<option value="${i}" ${i === accIdx ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
                  .join('')}</select>`
              : ''}
          </div>
          <div class="kpi-value">${acc ? formatVND(acc.balance) : '—'}</div>
          <div class="kpi-sub two">
            <span class="in">↑ Thu: ${acc ? formatVND(acc.thu_today) : 0}</span>
            <span class="out">↓ Chi: ${acc ? formatVND(acc.chi_today) : 0}</span>
          </div>
        </div>`;

      const goalBtn = kpiRow.querySelector('#goal-edit');
      if (goalBtn) goalBtn.addEventListener('click', () => openGoalPicker(d.goal.target, loadOverview));
      const sel = kpiRow.querySelector('#kpi-acc');
      if (sel) sel.addEventListener('change', () => { accIdx = Number(sel.value); paintKpi(); });
    }
    paintKpi();

    const todoHtml = d.todo.length
      ? `<ul class="mini-list">${d.todo
          .map((t) => `<li><a href="#/${t.route}">${escapeHtml(t.label)}</a></li>`).join('')}</ul>`
      : `<p class="mini-empty ok">Chúc mừng, không còn việc cần xử lý</p>`;

    // Mỗi thẻ mang một lớp dash-* để CSS xếp đúng ô trong lưới máy tính (xem .dash-grid).
    blocks.innerHTML = `
      ${weekChartHtml('Doanh thu tuần', d.week.this_week, d.week.last_week, 'Tổng', d.week.total_revenue, 'dash-rev')}
      <div class="card todo-card dash-todo">
        <div class="card-head warn"><h3>Cần xử lý</h3></div>
        ${todoHtml}
      </div>
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
  }

  paint();
}
