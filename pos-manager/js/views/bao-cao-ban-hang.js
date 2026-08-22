// Đợt 7 (18/08/2026) v2 — Báo cáo bán hàng: giao diện mới kiểu SoBanHang v2 (ảnh mẫu Website v2\
// Báo cáo\Bán hàng). 4 thẻ KPI, "So sánh cùng kỳ" (biểu đồ SVG tự vẽ theo giờ/ngày), bảng "Doanh
// thu bán hàng chi tiết" 6 dòng + PTTT, khối "Doanh thu theo" (Sản phẩm/Đơn hàng/Ngày/Khách hàng/
// Nhân viên/Phòng-Bàn) + modal "Xem chi tiết", 2 thẻ "Đơn hoàn trả"/"Đơn hủy".
// Thay thế bản v1 đơn giản (7 tab bảng phẳng) — xem .wolf/cerebrum.md 2026-08-18 cho các quyết
// định số liệu (Trừ tích điểm luôn 0, Khuyến mãi/Chiết khấu tách từ discount_detail, v.v).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';
import { rangeDates } from '../date-utils.js';

// Máy chủ trả chuỗi 'YYYY-MM-DD' đã cắt theo giờ Việt Nam. Đưa qua new Date() rồi format là
// lại rơi vào bẫy lệch 1 ngày (bug-062) — cứ đảo chuỗi là chắc chắn đúng.
const dmy = (ymd) => (ymd || '').split('-').reverse().join('/');

const INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".9" fill="currentColor" stroke="none"/></svg>';

const INFO_POP_HTML = `
  <div class="bh-info-title">Giải thích</div>
  <div class="bh-info-formula">
    <b>Doanh thu</b><br />
    = Tổng giá bán − Khuyến mãi − Chiết khấu − Hoàn trả − Tích điểm + Phí
  </div>
  <dl class="bh-info-list">
    <dt>Đơn hàng</dt><dd>là các đơn hàng hoàn thành ghi nhận doanh thu</dd>
    <dt>Khách hàng</dt><dd>là số lượng khách hàng có phát sinh đơn hàng hoàn thành</dd>
    <dt>Trung bình/đơn</dt><dd>= doanh thu / số lượng đơn hàng hoàn thành</dd>
    <dt>Tổng giá bán</dt><dd>= giá bán × số lượng</dd>
    <dt>Doanh thu theo Phương thức thanh toán</dt><dd>là các phương thức thanh toán ghi nhận doanh thu</dd>
  </dl>
`;

const METRIC_TABS = [
  ['revenue', 'Doanh thu'],
  ['order_count', 'Đơn hàng'],
  ['customer_count', 'Khách hàng'],
];

// "Doanh thu theo" — mỗi tab biết lấy mảng nào từ dữ liệu /sales và cách vẽ 1 dòng bảng.
const DETAIL_TABS = [
  {
    key: 'san-pham', label: 'Sản phẩm', head: ['Sản phẩm', 'Danh mục', 'SL', 'Doanh thu'],
    rows: (d) => d.by_item || [],
    row: (r) => [escapeHtml(r.name), escapeHtml(r.category || 'Chưa phân loại'), r.qty, formatVND(r.revenue)],
  },
  {
    key: 'don-hang', label: 'Đơn hàng', head: ['Mã đơn', 'Ngày', 'Khách hàng', 'Doanh thu'],
    rows: (d) => d.by_order || [],
    row: (r) => [escapeHtml(r.order_code), dmy(r.day), escapeHtml(r.customer_name), formatVND(r.revenue)],
  },
  {
    key: 'ngay', label: 'Ngày', head: ['Ngày', 'Số đơn', 'Doanh thu'],
    rows: (d) => d.by_day || [],
    row: (r) => [dmy(r.day), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'khach-hang', label: 'Khách hàng', head: ['Khách hàng', 'SĐT', 'Số đơn', 'Doanh thu'],
    rows: (d) => d.by_customer || [],
    row: (r) => [escapeHtml(r.name), escapeHtml(r.phone || '—'), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'nhan-vien', label: 'Nhân viên', head: ['Nhân viên', 'Số đơn', 'Doanh thu'],
    rows: (d) => d.by_staff || [],
    row: (r) => [escapeHtml(r.staff_name || 'Không rõ'), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'phong-ban', label: 'Phòng/Bàn', head: ['Phòng/Bàn', 'Số đơn', 'Doanh thu'],
    rows: (d) => d.by_table || [],
    row: (r) => [escapeHtml(r.label), r.order_count, formatVND(r.revenue)],
  },
];

// Vẽ SVG line chart 2 đường (kỳ trước nét đứt xám / kỳ này nét liền xanh) — không dùng thư viện
// ngoài, giữ đúng nguyên tắc "tự viết SVG" như các màn v2 khác (vd Đơn hàng, Quản lý bếp).
function buildChartSvg(labels, prevArr, curArr) {
  const W = 1000;
  const H = 220;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const n = Math.max(labels.length, 1);
  const maxVal = Math.max(1, ...prevArr, ...curArr);
  const x = (i) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxVal);
  const path = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // Chỉ hiện tối đa ~7 nhãn trục X để đỡ chật (24 giờ hay khoảng ngày dài đều gọn lại).
  const step = Math.max(1, Math.ceil(n / 7));
  const xLabels = labels.map((l, i) => (i % step === 0 || i === n - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="bh-chart-axis" text-anchor="middle">${escapeHtml(l)}</text>`
    : '').join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="bh-chart-svg" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${padL}" y1="${y(0).toFixed(1)}" x2="${W - padR}" y2="${y(0).toFixed(1)}" class="bh-chart-baseline" />
      <text x="${padL - 6}" y="${(y(0) + 4).toFixed(1)}" class="bh-chart-axis" text-anchor="end">0</text>
      <path d="${path(prevArr)}" class="bh-chart-line bh-chart-line-prev" />
      <path d="${path(curArr)}" class="bh-chart-line bh-chart-line-cur" />
      ${xLabels}
    </svg>`;
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  const [defFrom, defTo] = rangeDates('hom-nay');
  const range = { from: defFrom, to: defTo };
  let data = null;
  let compareData = null;
  let compareMetric = 'revenue';
  let cumulative = true;
  let activeDetailTab = DETAIL_TABS[0].key;
  let categoryFilter = '';

  const pickerIds = {
    btn: 'bh-date-btn', label: 'bh-date-label', pop: 'bh-date-pop',
    calLeft: 'bh-cal-left', calRight: 'bh-cal-right',
    quick: 'bh-quick', yearBtn: 'bh-year-btn', yearPop: 'bh-year-pop',
    sel: 'bh-sel', clear: 'bh-clear', apply: 'bh-apply',
  };

  container.innerHTML = `
    ${pageTabsHtml('bao-cao-ban-hang', staff)}
    <div class="page-head">
      <h2>Báo cáo bán hàng</h2>
      <div class="bh-head-actions">
        <div class="bh-info-wrap">
          <button id="bh-info-btn" class="btn bh-icon-btn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Xem giải thích công thức">${INFO_ICON}</button>
          <div id="bh-info-pop" class="bh-info-pop hidden" role="dialog" aria-label="Giải thích">${INFO_POP_HTML}</div>
        </div>
        <button id="bh-export" class="btn bh-icon-btn" type="button" aria-label="Xuất file">${icon('tai-xuong')}</button>
        <div class="ord-date-wrap bh-range" id="bh-range">
          ${rangePickerHtml(pickerIds, 'Chọn khoảng ngày', 'Chọn khoảng ngày')}
        </div>
      </div>
    </div>

    <div class="kpi-row" id="bh-kpi"><p>Đang tải…</p></div>

    <div class="card bh-compare-card">
      <h3>So sánh cùng kỳ</h3>
      <div class="bh-compare-tabs">
        <div class="bh-metric-tabs" id="bh-metric-tabs">
          ${METRIC_TABS.map(([k, l], i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-metric="${k}">${escapeHtml(l)}</button>`).join('')}
        </div>
        <div class="bh-cumu-toggle" id="bh-cumu-toggle">
          <button type="button" class="chip active" data-cumu="1">Luỹ kế</button>
          <button type="button" class="chip" data-cumu="0">Theo ngày</button>
        </div>
      </div>
      <div class="bh-chart-legend" id="bh-chart-legend"></div>
      <div class="bh-chart-wrap" id="bh-chart"><p>Đang tải…</p></div>
    </div>

    <div class="bh-detail-grid">
      <div class="card bh-breakdown-card">
        <h3>Doanh thu bán hàng chi tiết</h3>
        <div class="table-scroll bh-breakdown-scroll">
          <table class="roles-table bh-breakdown-table" id="bh-breakdown"></table>
        </div>
      </div>
      <div class="card bh-payment-card">
        <h3>Doanh thu theo Phương thức thanh toán</h3>
        <div id="bh-payment-list"></div>
      </div>
    </div>

    <div class="card bh-by-card">
      <div class="bh-by-head">
        <h3>Doanh thu theo</h3>
        <div class="bh-by-tools">
          <select id="bh-cat-filter" aria-label="Lọc theo danh mục"><option value="">Danh mục</option></select>
          <button type="button" id="bh-detail-open" class="btn btn-ghost">Xem chi tiết ›</button>
        </div>
      </div>
      <div class="orders-tabs" id="bh-detail-tabs">
        ${DETAIL_TABS.map((t, i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${escapeHtml(t.label)}</button>`).join('')}
      </div>
      <div id="bh-detail-table"><p>Đang tải…</p></div>
    </div>

    <div class="bh-bottom-cards">
      <button type="button" class="kpi-card bh-bottom-card" id="bh-returned-card">
        <span class="bh-bottom-ico bh-ico-warn">${icon('tra-hang')}</span>
        <span class="bh-bottom-body">
          <span class="kpi-val" id="bh-returned-val">0</span>
          <span class="kpi-label">Đơn hoàn trả</span>
          <span class="bh-bottom-sub" id="bh-returned-sub">0 đơn · đã trừ vào doanh thu kỳ</span>
        </span>
      </button>
      <button type="button" class="kpi-card bh-bottom-card" id="bh-cancelled-card">
        <span class="bh-bottom-ico bh-ico-danger">${icon('dong')}</span>
        <span class="bh-bottom-body">
          <span class="kpi-val" id="bh-cancelled-val">0</span>
          <span class="kpi-label">Đơn hủy</span>
          <span class="bh-bottom-sub" id="bh-cancelled-sub">0 đơn · không tính vào doanh thu</span>
        </span>
      </button>
    </div>
  `;

  // ── nút "Giải thích" (ⓘ) ──
  const infoBtn = container.querySelector('#bh-info-btn');
  const infoPop = container.querySelector('#bh-info-pop');
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = infoPop.classList.contains('hidden');
    infoPop.classList.toggle('hidden', !willOpen);
    infoBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  infoPop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    infoPop.classList.add('hidden');
    infoBtn.setAttribute('aria-expanded', 'false');
  });

  // ── khoảng ngày (mặc định "Hôm nay") ──
  const picker = createRangePicker(container.querySelector('#bh-range'), pickerIds, {
    emptyLabel: 'Chọn khoảng ngày',
    getFrom: () => range.from,
    getTo: () => range.to,
    set: (from, to) => { range.from = from || defFrom; range.to = to || defTo; },
    onCommit: () => { loadAll(); },
    onWarn: (m) => toast(m, 'error'),
  });
  picker.updateLabel();
  picker.syncQuick();

  // ── tab metric + toggle Luỹ kế/Theo ngày của biểu đồ "So sánh cùng kỳ" ──
  container.querySelector('#bh-metric-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-metric]');
    if (!btn) return;
    compareMetric = btn.dataset.metric;
    container.querySelectorAll('#bh-metric-tabs [data-metric]').forEach((b) => b.classList.toggle('active', b === btn));
    renderChart();
  });
  container.querySelector('#bh-cumu-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cumu]');
    if (!btn) return;
    cumulative = btn.dataset.cumu === '1';
    container.querySelectorAll('#bh-cumu-toggle [data-cumu]').forEach((b) => b.classList.toggle('active', b === btn));
    renderChart();
  });

  // ── tab "Doanh thu theo" + dropdown Danh mục + nút Xem chi tiết ──
  container.querySelector('#bh-detail-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeDetailTab = btn.dataset.tab;
    container.querySelectorAll('#bh-detail-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
    renderDetailTable();
  });
  container.querySelector('#bh-cat-filter').addEventListener('change', (e) => {
    categoryFilter = e.target.value;
    renderDetailTable();
  });
  container.querySelector('#bh-detail-open').addEventListener('click', openDetailModal);
  container.querySelector('#bh-export').addEventListener('click', exportCsv);
  container.querySelector('#bh-returned-card').addEventListener('click', () =>
    openOrderListModal('Đơn hoàn trả', (data && data.returned_orders) || []));
  container.querySelector('#bh-cancelled-card').addEventListener('click', () =>
    openOrderListModal('Đơn hủy', (data && data.cancelled_orders) || []));

  function categoryOptions() {
    const cats = ((data && data.by_category) || []).map((c) => c.category).filter(Boolean);
    return [...new Set(cats)];
  }

  function renderCategoryFilterOptions() {
    const sel = container.querySelector('#bh-cat-filter');
    const cur = sel.value;
    sel.innerHTML = `<option value="">Danh mục</option>${categoryOptions().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}`;
    sel.value = cur;
  }

  function rowsFor(source, tabKey, cat) {
    const tab = DETAIL_TABS.find((t) => t.key === tabKey);
    let rows = (source && tab.rows(source)) || [];
    // "Danh mục" chỉ có ý nghĩa lọc trên tab Sản phẩm — các tab khác không có trường category.
    if (tabKey === 'san-pham' && cat) rows = rows.filter((r) => r.category === cat);
    return rows;
  }

  function renderKpi() {
    const s = (data && data.summary) || {};
    container.querySelector('#bh-kpi').innerHTML = `
      <div class="kpi-card"><div class="kpi-val" style="color:var(--money-in)">${formatVND(s.revenue || 0)}</div><div class="kpi-label">Doanh thu</div></div>
      <div class="kpi-card"><div class="kpi-val">${s.order_count || 0}</div><div class="kpi-label">Đơn hàng</div></div>
      <div class="kpi-card"><div class="kpi-val">${s.customer_count || 0}</div><div class="kpi-label">Khách hàng</div></div>
      <div class="kpi-card"><div class="kpi-val">${formatVND(s.avg_order_value || 0)}</div><div class="kpi-label">Trung bình/đơn</div></div>
    `;
  }

  function renderBreakdown() {
    const s = (data && data.summary) || {};
    const rows = [
      ['1. Tổng giá bán', s.subtotal || 0],
      ['2. Khuyến mãi', s.promo_discount || 0],
      ['3. Chiết khấu', s.manual_discount || 0],
      ['4. Trừ tích điểm', s.loyalty_redeemed || 0],
      ['5. Hoàn trả', s.returned_amount || 0],
      ['6. Thu phí vận chuyển', s.delivery_fee || 0],
    ];
    const total = (s.subtotal || 0) - (s.promo_discount || 0) - (s.manual_discount || 0)
      - (s.loyalty_redeemed || 0) - (s.returned_amount || 0) + (s.delivery_fee || 0);
    container.querySelector('#bh-breakdown').innerHTML = `
      <thead><tr><th>CHI TIẾT</th><th style="text-align:right">SỐ TIỀN</th></tr></thead>
      <tbody>
        ${rows.map(([label, v]) => `<tr><td>${escapeHtml(label)}</td><td style="text-align:right">${formatVND(v)}</td></tr>`).join('')}
        <tr class="bh-breakdown-total"><td>Doanh thu bán hàng (1-2-3-4-5+6)</td><td style="text-align:right">${formatVND(total)}</td></tr>
      </tbody>
    `;
  }

  function renderPayment() {
    const rows = (data && data.by_payment) || [];
    const el = container.querySelector('#bh-payment-list');
    if (!rows.length) {
      el.innerHTML = `<div class="bh-empty">
        <span class="bh-empty-ico">${icon('nguon-tien') || ''}</span>
        <p>Chưa có doanh thu theo phương thức thanh toán</p>
        <p class="hint">Bạn chưa có báo cáo nào được ghi lại.</p>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="bh-payment-rows">
      ${rows.map((r) => `<div class="bh-payment-row"><span>${escapeHtml(r.label)}</span><b>${formatVND(r.revenue)}</b></div>`).join('')}
    </div>`;
  }

  function toDisplay(arr) {
    if (!cumulative) return arr;
    let sum = 0;
    return arr.map((v) => (sum += v));
  }

  function renderChart() {
    const wrap = container.querySelector('#bh-chart');
    const legend = container.querySelector('#bh-chart-legend');
    if (!compareData) { wrap.innerHTML = '<p>Đang tải…</p>'; legend.innerHTML = ''; return; }
    const cur = toDisplay(compareData.current[compareMetric] || []);
    const prev = toDisplay(compareData.previous[compareMetric] || []);
    const labels = compareData.granularity === 'day' ? compareData.labels.map(dmy) : compareData.labels;
    legend.innerHTML = `
      <span class="bh-legend-item"><i class="bh-legend-dash"></i>${escapeHtml(compareData.previous_label)}</span>
      <span class="bh-legend-item"><i class="bh-legend-dot"></i>${escapeHtml(compareData.current_label)}</span>
    `;
    if (!cur.some((v) => v > 0) && !prev.some((v) => v > 0)) {
      wrap.innerHTML = '<p class="hint">Không có dữ liệu trong khoảng ngày này.</p>';
      return;
    }
    wrap.innerHTML = buildChartSvg(labels, prev, cur);
  }

  function renderDetailTable(target = container.querySelector('#bh-detail-table'), tabKey = activeDetailTab, cat = categoryFilter, source = data) {
    const tab = DETAIL_TABS.find((t) => t.key === tabKey);
    if (!source) { target.innerHTML = '<p>Đang tải…</p>'; return; }
    const rows = rowsFor(source, tabKey, cat);
    if (!rows.length) {
      target.innerHTML = `<div class="bh-empty">
        <span class="bh-empty-ico">${icon('bao-cao-ban-hang') || ''}</span>
        <p>Chưa ghi nhận doanh thu nào</p>
        <p class="hint">Bạn chưa có báo cáo nào được ghi lại.</p>
      </div>`;
      return;
    }
    target.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr>${tab.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${tab.row(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function renderBottomCards() {
    const s = (data && data.summary) || {};
    container.querySelector('#bh-returned-val').textContent = s.returned_count || 0;
    container.querySelector('#bh-returned-sub').textContent = `${s.returned_count || 0} đơn · đã trừ vào doanh thu kỳ`;
    container.querySelector('#bh-cancelled-val').textContent = s.cancelled_count || 0;
    container.querySelector('#bh-cancelled-sub').textContent = `${s.cancelled_count || 0} đơn · không tính vào doanh thu`;
  }

  function openOrderListModal(title, rows) {
    openModal(`
      <h3>${escapeHtml(title)} (${rows.length})</h3>
      ${!rows.length ? '<p class="hint">Không có đơn nào trong khoảng ngày này.</p>' : `
      <div class="table-scroll bh-modal-scroll">
        <table class="roles-table">
          <thead><tr><th>Mã đơn</th><th>Ngày</th><th style="text-align:right">Số tiền</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.order_code)}</td><td>${dmy(r.day)}</td><td style="text-align:right">${formatVND(r.revenue)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`}
    `);
  }

  // "Xem chi tiết ›" — cùng nội dung khối "Doanh thu theo" nhưng phóng to trong modal, thêm ô tìm
  // kiếm + bộ chọn khoảng ngày RIÊNG (không đụng khoảng ngày của cả trang).
  function openDetailModal() {
    let modalTab = activeDetailTab;
    let modalCat = categoryFilter;
    let modalSearch = '';
    let modalRange = { from: range.from, to: range.to };
    let modalData = data;

    const mIds = {
      btn: 'bhm-date-btn', label: 'bhm-date-label', pop: 'bhm-date-pop',
      calLeft: 'bhm-cal-left', calRight: 'bhm-cal-right',
      quick: 'bhm-quick', yearBtn: 'bhm-year-btn', yearPop: 'bhm-year-pop',
      sel: 'bhm-sel', clear: 'bhm-clear', apply: 'bhm-apply',
    };

    const modal = openModal(`
      <h3>Doanh thu theo</h3>
      <div class="bh-modal-tools">
        <input type="search" id="bhm-search" placeholder="Tìm kiếm…" aria-label="Tìm kiếm" />
        <select id="bhm-cat" aria-label="Lọc theo danh mục"><option value="">Danh mục</option>${categoryOptions().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
        <div class="ord-date-wrap bh-range" id="bhm-range">${rangePickerHtml(mIds, 'Chọn khoảng ngày', 'Chọn khoảng ngày')}</div>
      </div>
      <div class="orders-tabs" id="bhm-tabs">
        ${DETAIL_TABS.map((t) => `<button type="button" class="chip ${t.key === modalTab ? 'active' : ''}" data-tab="${t.key}">${escapeHtml(t.label)}</button>`).join('')}
      </div>
      <div id="bhm-table"><p>Đang tải…</p></div>
    `);
    modal.overlay.querySelector('#bhm-cat').value = modalCat;

    const mPicker = createRangePicker(modal.overlay.querySelector('#bhm-range'), mIds, {
      emptyLabel: 'Chọn khoảng ngày',
      getFrom: () => modalRange.from,
      getTo: () => modalRange.to,
      set: (from, to) => { modalRange = { from: from || range.from, to: to || range.to }; },
      onCommit: async () => { await reloadModalData(); renderModalTable(); },
      onWarn: (m) => toast(m, 'error'),
    });
    mPicker.updateLabel();
    mPicker.syncQuick();

    async function reloadModalData() {
      modal.overlay.querySelector('#bhm-table').innerHTML = '<p>Đang tải…</p>';
      try {
        modalData = await api.get(`/api/mgr/reports/sales?from=${modalRange.from}&to=${modalRange.to}`);
      } catch {
        toast('Không tải được dữ liệu', 'error');
      }
    }

    function renderModalTable() {
      const tab = DETAIL_TABS.find((t) => t.key === modalTab);
      let rows = rowsFor(modalData, modalTab, modalCat);
      if (modalSearch.trim()) {
        const q = modalSearch.trim().toLowerCase();
        rows = rows.filter((r) => tab.row(r).some((c) => String(c).toLowerCase().includes(q)));
      }
      const target = modal.overlay.querySelector('#bhm-table');
      if (!rows.length) { target.innerHTML = '<p class="hint">Không có dữ liệu phù hợp.</p>'; return; }
      target.innerHTML = `
        <div class="table-scroll bh-modal-scroll">
          <table class="roles-table">
            <thead><tr>${tab.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr>${tab.row(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>`;
    }

    modal.overlay.querySelector('#bhm-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      modalTab = btn.dataset.tab;
      modal.overlay.querySelectorAll('#bhm-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderModalTable();
    });
    modal.overlay.querySelector('#bhm-cat').addEventListener('change', (e) => { modalCat = e.target.value; renderModalTable(); });
    modal.overlay.querySelector('#bhm-search').addEventListener('input', (e) => { modalSearch = e.target.value; renderModalTable(); });
    renderModalTable();
  }

  // Xuất CSV của đúng tab/lọc đang xem trên khối "Doanh thu theo" — dùng chung cách xuất Blob
  // (BOM UTF-8 để Excel không lỗi dấu) như so-quy.js.
  function exportCsv() {
    if (!data) { toast('Chưa có dữ liệu để xuất', 'error'); return; }
    const tab = DETAIL_TABS.find((t) => t.key === activeDetailTab);
    const rows = rowsFor(data, activeDetailTab, categoryFilter);
    if (!rows.length) { toast('Không có dữ liệu để xuất', 'error'); return; }
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = rows.map((r) => tab.row(r).map(cell).join(','));
    const blob = new Blob([`﻿${tab.head.map(cell).join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bao-cao-ban-hang-${tab.key}-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${rows.length} dòng`);
  }

  async function loadAll() {
    container.querySelector('#bh-kpi').innerHTML = '<p>Đang tải…</p>';
    container.querySelector('#bh-chart').innerHTML = '<p>Đang tải…</p>';
    container.querySelector('#bh-detail-table').innerHTML = '<p>Đang tải…</p>';
    try {
      const [salesRes, compareRes] = await Promise.all([
        api.get(`/api/mgr/reports/sales?from=${range.from}&to=${range.to}`),
        api.get(`/api/mgr/reports/sales-compare?from=${range.from}&to=${range.to}`),
      ]);
      data = salesRes;
      compareData = compareRes;
      renderKpi();
      renderBreakdown();
      renderPayment();
      renderCategoryFilterOptions();
      renderDetailTable();
      renderChart();
      renderBottomCards();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#bh-kpi').innerHTML = '<p>Không tải được báo cáo bán hàng.</p>';
        container.querySelector('#bh-chart').innerHTML = '';
        container.querySelector('#bh-detail-table').innerHTML = '';
      }
    }
  }

  await loadAll();
}
