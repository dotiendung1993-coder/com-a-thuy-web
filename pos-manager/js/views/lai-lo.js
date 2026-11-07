// GĐ3 — Lãi lỗ. Đợt 7 (18/08/2026) — VIẾT LẠI theo giao diện SoBanHang v2 (ảnh mẫu
// Website v2\Báo cáo\Lãi lỗ, 11 ảnh chụp app.sobanhang.com/report/pnl). Bản v1 (đơn giản, bảng
// cộng trừ 7 dòng phẳng) đã đủ số liệu — đợt này viết lại GIAO DIỆN cho khớp ảnh mẫu, đồng thời
// mở rộng backend (report-service.js: profitReport7 nhận thêm income_categories/expense_categories
// + compare; hàm mới profitByDimension cho khối "Lợi nhuận theo").
//
// Bảng lịch 5-tab (Mốc/Ngày/Tuần/Tháng/Năm) là createTabbedRangePicker() MỚI thêm vào
// date-range-picker.js (không đụng createRangePicker() cũ — Đơn hàng/Bếp không đổi).
//
// GHI CHÚ TRUNG THỰC (đọc trước khi thắc mắc sao 3 dòng luôn = 0): ảnh mẫu liệt kê 7 dòng con của
// "Doanh thu bán hàng" (Tổng giá bán/Khuyến mãi/Giảm giá/Trừ tích điểm/Hoàn trả/Thu phí vận
// chuyển/Phụ thu) nhưng schema `sales_orders` CHỈ có 1 cột `discount_amount` gộp chung (không tách
// khuyến mãi/giảm giá/trừ tích điểm) và KHÔNG có cột hoàn trả — xem order-service.js. 3 dòng
// "Giảm giá riêng/Trừ tích điểm/Hoàn trả" hiện LUÔN hiện 0đ vì không có dữ liệu thật để tách, cố
// tình KHÔNG gộp bừa vào "Khuyến mãi" để khỏi hiện số sai. Muốn có số thật phải thêm cột DB mới —
// ngoài phạm vi đợt này (nhiệm vụ chỉ xin sửa report-service.js cho 4 việc cụ thể).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';
import { createTabbedRangePicker, tabbedRangePickerHtml, rangePickerHtml, createRangePicker } from '../date-range-picker.js';
import { rangeDates, addDays } from '../date-utils.js';

const INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.7" r="1" fill="currentColor" stroke="none"/></svg>';
const BOX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 8.2v7.6a1.5 1.5 0 0 1-.8 1.3l-6.9 3.7a1.5 1.5 0 0 1-1.6 0l-6.9-3.7a1.5 1.5 0 0 1-.8-1.3V8.2"/><path d="M3.9 7.4 12 3.2l8.1 4.2L12 11.7z"/><path d="M12 11.7V21"/></svg>';

const DIM_TABS = [
  ['san-pham', 'Sản phẩm'],
  ['don-hang', 'Đơn hàng'],
  ['ngay', 'Ngày'],
  ['khach-hang', 'Khách hàng'],
  ['nhan-vien', 'Nhân viên'],
  ['phong-ban', 'Phòng/Bàn'],
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  const [defFrom, defTo] = rangeDates('thang-nay');
  let range = { from: defFrom, to: defTo };
  let compareOn = true;
  let trendTab = 'loi-nhuan'; // 'loi-nhuan' | 'doanh-thu'
  let dimTab = 'san-pham';
  const incomeSel = new Set();
  const expenseSel = new Set();
  const dimCatSel = new Set();
  let incomeCats = [];
  let expenseCats = [];
  let productCats = [];
  let lastData = null;
  let loadSeq = 0;

  container.innerHTML = `
    ${pageTabsHtml('lai-lo', staff)}
    <div class="ll-head">
      <h2>Báo cáo lãi lỗ
        <div class="ll-info-wrap">
          <button type="button" class="ll-icon-btn" id="ll-info-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="Giải thích công thức">${INFO_SVG}</button>
          <div class="ll-info-pop hidden" id="ll-info-pop"></div>
        </div>
      </h2>
      <div style="display:flex;align-items:center;gap:8px">
        <button type="button" class="ll-icon-btn" id="ll-export" aria-label="Xuất file" title="Xuất file">${icon('tai-xuong')}</button>
        <div class="ord-date-wrap" id="ll-range"></div>
      </div>
    </div>

    <div class="sbh-kpi" id="ll-kpi"></div>

    <div class="card ll-trend-card">
      <div class="ll-trend-head">
        <h3>Xu hướng lãi lỗ</h3>
        <div class="ll-trend-controls">
          <label class="ll-compare-toggle">
            <span class="ll-switch"><input type="checkbox" id="ll-compare" ${compareOn ? 'checked' : ''} /><span class="ll-switch-track"></span></span>
            So sánh cùng kỳ
          </label>
          <div class="ll-seg" id="ll-trend-tabs">
            <button type="button" data-trend="loi-nhuan" class="active">Lợi nhuận</button>
            <button type="button" data-trend="doanh-thu">Doanh thu</button>
          </div>
        </div>
      </div>
      <div id="ll-chart"><p>Đang tải…</p></div>
    </div>

    <div class="card ll-detail-card">
      <h3>Chi tiết lãi lỗ</h3>
      <p class="ll-detail-formula">Lợi nhuận = Lợi nhuận gộp + Doanh thu khác − Chi phí khác</p>
      <div class="table-scroll">
        <table class="ll-detail-table">
          <thead><tr><th>Khoản mục</th><th style="text-align:right">Số tiền</th><th style="text-align:right">So sánh cùng kỳ</th></tr></thead>
          <tbody id="ll-detail-body"><tr><td colspan="3">Đang tải…</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="card ll-dim-card">
      <h3>Lợi nhuận theo</h3>
      <div class="ll-dim-tabs">
        <div class="ll-cat-dd" id="ll-dim-cat-dd">
          <button type="button" class="btn btn-ghost" id="ll-dim-cat-btn">Danh mục ▾</button>
          <div class="ll-cat-pop hidden" id="ll-dim-cat-pop"></div>
        </div>
        ${DIM_TABS.map(([k, l], i) => `<button type="button" class="ll-dim-tab${i === 0 ? ' active' : ''}" data-dim="${k}">${escapeHtml(l)}</button>`).join('')}
        <button type="button" class="btn btn-ghost" id="ll-dim-detail" style="margin-left:auto">Xem chi tiết ›</button>
      </div>
      <div id="ll-dim-body"><p>Đang tải…</p></div>
    </div>
  `;

  // ── Info popover (ⓘ) ──────────────────────────────────────────────────────────────────────
  const infoBtn = container.querySelector('#ll-info-btn');
  const infoPop = container.querySelector('#ll-info-pop');
  infoPop.innerHTML = `
    <h4>Giải thích</h4>
    <div class="ll-info-formula">Lợi nhuận<br>= Doanh thu − Giá vốn + Lợi nhuận khác</div>
    <div class="ll-info-row"><b>Doanh thu bán hàng</b> = tổng bán ra − khuyến mãi − chiết khấu − giảm giá − hàng hoàn + phí vận chuyển</div>
    <div class="ll-info-row"><b>Giá vốn bán hàng</b> là tổng giá vốn các sản phẩm có trong đơn hàng hoàn thành</div>
    <div class="ll-info-row"><b>Lợi nhuận gộp</b> = doanh thu − giá vốn bán hàng</div>
    <div class="ll-info-row"><b>Doanh thu khác</b> được tạo ra từ khoản thu và ghi nhận trong báo cáo</div>
    <div class="ll-info-row"><b>Chi phí khác</b> được tạo ra từ khoản chi và được ghi nhận trong báo cáo</div>
    <div class="ll-info-row"><b>Lợi nhuận khác</b> = doanh thu khác − chi phí khác</div>
  `;
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = infoPop.classList.contains('hidden');
    infoPop.classList.toggle('hidden', !willOpen);
    infoBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  document.addEventListener('click', () => { infoPop.classList.add('hidden'); infoBtn.setAttribute('aria-expanded', 'false'); });

  container.querySelector('#ll-export').addEventListener('click', () => {
    toast('Xuất file báo cáo lãi lỗ đang được phát triển', 'info');
  });

  // ── Bảng lịch 5-tab (Mốc/Ngày/Tuần/Tháng/Năm) ────────────────────────────────────────────────
  const rangeIds = { btn: 'll-date-btn', label: 'll-date-label', pop: 'll-date-pop', tabs: 'll-date-tabs', body: 'll-date-body' };
  container.querySelector('#ll-range').innerHTML = tabbedRangePickerHtml(rangeIds, 'Chọn khoảng thời gian', 'Chọn khoảng thời gian', 'll-date-btn');
  createTabbedRangePicker(container.querySelector('#ll-range'), rangeIds, {
    emptyLabel: 'Chọn khoảng thời gian',
    getFrom: () => range.from,
    getTo: () => range.to,
    set: (from, to) => { range = { from, to }; },
    onCommit: () => load(),
    onWarn: (m) => toast(m, 'error'),
  });

  // ── Toggle "So sánh cùng kỳ" + tabs Lợi nhuận/Doanh thu ─────────────────────────────────────
  container.querySelector('#ll-compare').addEventListener('change', (e) => {
    compareOn = e.target.checked;
    load();
  });
  container.querySelector('#ll-trend-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-trend]');
    if (!btn) return;
    trendTab = btn.dataset.trend;
    container.querySelectorAll('#ll-trend-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    if (lastData) renderChart(lastData);
  });

  // ── "Chọn danh mục" — Doanh thu khác (4) / Chi phí khác (5) / bộ lọc "Lợi nhuận theo" ────────
  function catListHtml(filtered, selected) {
    if (!filtered.length) return '<p class="hint" style="padding:6px 8px;margin:0">Không tìm thấy</p>';
    return filtered.map((it) => `
      <label class="ll-cat-pop-item">
        <input type="checkbox" data-id="${escapeHtml(String(it.id))}" ${selected.has(String(it.id)) ? 'checked' : ''} />
        <span>${escapeHtml(it.name)}</span>
      </label>`).join('');
  }
  function setupCatPicker(btnEl, popEl, getItems, selected, onChange) {
    function renderList(q) {
      const items = getItems();
      const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q.toLowerCase())) : items;
      popEl.querySelector('.ll-cat-pop-list').innerHTML = catListHtml(filtered, selected);
      popEl.querySelectorAll('input[data-id]').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
          onChange();
        });
      });
    }
    function open(isOpen) {
      popEl.classList.toggle('hidden', !isOpen);
      if (isOpen) {
        popEl.innerHTML = '<input type="search" class="ll-cat-search" placeholder="Tìm kiếm" /><div class="ll-cat-pop-list"></div>';
        popEl.querySelector('.ll-cat-search').addEventListener('input', (e) => renderList(e.target.value));
        renderList('');
      }
    }
    btnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = popEl.classList.contains('hidden');
      document.querySelectorAll('.ll-cat-pop').forEach((p) => { if (p !== popEl) p.classList.add('hidden'); });
      open(willOpen);
    });
    popEl.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => open(false));
  }

  // ── KPI ──────────────────────────────────────────────────────────────────────────────────────
  function renderKpi(d) {
    const rows = [
      ['Doanh thu bán hàng', d.revenue],
      ['Giá vốn', d.cogs],
      ['Lợi nhuận khác', d.other_profit],
      ['Lợi nhuận', d.net_profit],
    ];
    container.querySelector('#ll-kpi').innerHTML = rows.map(([label, v]) => `
      <div class="kpi-card ${v >= 0 ? 'kpi-c1' : 'kpi-c4'}">
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-val">${formatVND(v)}</div>
      </div>`).join('');
  }

  // ── Xu hướng lãi lỗ (biểu đồ cột SVG) ───────────────────────────────────────────────────────
  function dateList(from, to) {
    const out = [];
    let d = from;
    let guard = 0;
    while (d && to && d <= to && guard < 400) { out.push(d); d = addDays(d, 1); guard++; }
    return out;
  }
  function buildSeries(d) {
    const days = dateList(d.from, d.to);
    const map = new Map((d.by_day || []).map((r) => [r.day, r]));
    const cur = days.map((day) => map.get(day) || { day, revenue: 0, cogs: 0, profit: 0 });
    let prev = null;
    if (d.previous_period) {
      const pdays = dateList(d.previous_period.from, d.previous_period.to);
      const pmap = new Map((d.previous_period.by_day || []).map((r) => [r.day, r]));
      prev = pdays.map((day) => pmap.get(day) || { day, revenue: 0, cogs: 0, profit: 0 });
    }
    return { cur, prev };
  }
  function shortDmy(s) { return `${s.slice(8, 10)}/${s.slice(5, 7)}`; }

  function renderChart(d) {
    const el = container.querySelector('#ll-chart');
    const { cur, prev } = buildSeries(d);
    if (!cur.length) { el.innerHTML = '<p class="ll-chart-empty">Chưa có dữ liệu trong kỳ này</p>'; return; }
    const field = trendTab === 'loi-nhuan' ? 'profit' : 'revenue';
    const values = cur.map((r) => r[field] || 0);
    const prevValues = compareOn && prev ? prev.map((r) => r[field] || 0) : [];

    const W = 900, H = 220, padT = 8, padB = 22;
    const maxVal = Math.max(0, ...values, ...prevValues);
    const minVal = Math.min(0, ...values, ...prevValues);
    const span = (maxVal - minVal) || 1;
    const y = (v) => padT + (H - padT - padB) * (maxVal - v) / span;
    const zeroY = y(0);

    const n = cur.length;
    const slot = W / n;
    const hasCompare = compareOn && prev;
    const barW = Math.max(1.5, (hasCompare ? slot * 0.3 : slot * 0.5));
    const gap = hasCompare ? slot * 0.05 : 0;

    let bars = '';
    for (let i = 0; i < n; i++) {
      const cx = i * slot + slot / 2;
      const v = values[i];
      const barH = Math.abs(y(v) - zeroY);
      const barY = v >= 0 ? y(v) : zeroY;
      const curX = hasCompare ? cx + gap / 2 : cx - barW / 2;
      const curColor = v >= 0 ? 'var(--money-in,#16a34a)' : 'var(--money-out,#dc2626)';
      const prevTitle = hasCompare ? `Kỳ trước: ${formatVND(prevValues[i])}` : '';
      bars += `<g><title>${escapeHtml(shortDmy(cur[i].day))}\nKỳ này: ${formatVND(v)}${prevTitle ? '\n' + escapeHtml(prevTitle) : ''}</title>
        ${hasCompare ? (() => {
    const pv = prevValues[i];
    const pH = Math.abs(y(pv) - zeroY);
    const pY = pv >= 0 ? y(pv) : zeroY;
    const pX = cx - gap / 2 - barW;
    return `<rect x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(pH, 0.5).toFixed(1)}" fill="#D1D5DB" rx="1.5"></rect>`;
  })() : ''}
        <rect x="${curX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 0.5).toFixed(1)}" fill="${curColor}" rx="1.5"></rect>
      </g>`;
    }

    const labelEvery = Math.max(1, Math.ceil(n / 6));
    let labels = '';
    for (let i = 0; i < n; i += labelEvery) {
      const cx = i * slot + slot / 2;
      labels += `<text x="${cx.toFixed(1)}" y="${H - 6}" font-size="11" fill="var(--text-3,#8A94A6)" text-anchor="middle">${escapeHtml(shortDmy(cur[i].day))}</text>`;
    }

    el.innerHTML = `
      <div class="ll-chart-wrap">
        <div class="ll-chart-axis"><span>${maxVal > 0 ? formatVND(maxVal) : ''}</span><span>${minVal < 0 ? formatVND(minVal) : '0'}</span></div>
        <svg class="ll-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Biểu đồ xu hướng lãi lỗ">
          <line x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="var(--line,#E5E7EB)" stroke-width="1"></line>
          ${bars}
          ${labels}
        </svg>
      </div>
      <div class="ll-chart-legend">
        <span><i style="background:${trendTab === 'loi-nhuan' ? 'var(--money-in,#16a34a)' : 'var(--primary,#16a34a)'}"></i>Kỳ này${trendTab === 'loi-nhuan' ? ' (Lợi nhuận)' : ''}</span>
        ${trendTab === 'loi-nhuan' ? '<span><i style="background:var(--money-out,#dc2626)"></i>Kỳ này (Lỗ)</span>' : ''}
        ${hasCompare ? '<span><i style="background:#D1D5DB"></i>Kỳ trước</span>' : ''}
      </div>`;
  }

  // ── Chi tiết lãi lỗ (bảng 7 dòng) ────────────────────────────────────────────────────────────
  function deltaCell(cur, prev) {
    if (!compareOn || prev === undefined || prev === null) return '<span style="color:var(--text-3)">—</span>';
    if (prev === 0) {
      if (cur === 0) return '<span style="color:var(--text-3)">—</span>';
      return cur > 0 ? '<span class="rp-positive">▲ 100%</span>' : '<span class="rp-negative">▼ 100%</span>';
    }
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
    return `<span class="${pct >= 0 ? 'rp-positive' : 'rp-negative'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  }

  function renderDetail(d) {
    const p = d.previous_period;
    const subRows = [
      ['Tổng giá bán', d.subtotal, p?.subtotal],
      ['Khuyến mãi', d.discount, p?.discount],
      // Giảm giá/Trừ tích điểm/Hoàn trả — chưa tách được từ schema hiện tại (xem ghi chú đầu tệp)
      ['Giảm giá', 0, 0],
      ['Trừ tích điểm', 0, 0],
      ['Hoàn trả', 0, 0],
      ['Thu phí vận chuyển', d.delivery_fee, p?.delivery_fee],
      ['Phụ thu', d.surcharge, p?.surcharge],
    ];
    const body = container.querySelector('#ll-detail-body');
    body.innerHTML = `
      <tr class="ll-row-main"><td>Doanh thu bán hàng <span class="ll-row-code">1</span></td><td>${formatVND(d.revenue)}</td><td>${deltaCell(d.revenue, p?.revenue)}</td></tr>
      ${subRows.map(([label, v, pv]) => `<tr class="ll-row-sub"><td>↳ ${escapeHtml(label)}</td><td>${formatVND(v)}</td><td>${p ? deltaCell(v, pv) : ''}</td></tr>`).join('')}
      <tr class="ll-row-main"><td>Giá vốn hàng bán <span class="ll-row-code">2</span></td><td>${formatVND(d.cogs)}</td><td>${deltaCell(d.cogs, p?.cogs)}</td></tr>
      <tr class="ll-row-main"><td>Lợi nhuận gộp <span class="ll-row-code">3 = 1-2</span></td><td>${formatVND(d.gross_profit)}</td><td>${deltaCell(d.gross_profit, p?.gross_profit)}</td></tr>
      <tr class="ll-row-main"><td>Doanh thu khác <span class="ll-row-code">4</span> <span id="ll-income-cat-slot"></span></td><td>${formatVND(d.other_income)}</td><td>${deltaCell(d.other_income, p?.other_income)}</td></tr>
      <tr class="ll-row-main"><td>Chi phí khác <span class="ll-row-code">5</span> <span id="ll-expense-cat-slot"></span></td><td>${formatVND(d.expense_total)}</td><td>${deltaCell(d.expense_total, p?.expense_total)}</td></tr>
      <tr class="ll-row-main"><td>Lợi nhuận khác <span class="ll-row-code">6 = 4-5</span></td><td>${formatVND(d.other_profit)}</td><td>${deltaCell(d.other_profit, p?.other_profit)}</td></tr>
      <tr class="ll-row-total"><td>Lợi nhuận <span class="ll-row-code">7 = 3+4-5</span></td><td>${formatVND(d.net_profit)}</td><td>${deltaCell(d.net_profit, p?.net_profit)}</td></tr>
    `;

    // Chèn 2 nút "Chọn danh mục" (income/expense) vào đúng 2 chỗ vừa vẽ.
    const incomeSlot = body.querySelector('#ll-income-cat-slot');
    incomeSlot.innerHTML = `<span class="ll-cat-dd" id="ll-income-cat-dd" style="display:inline-block;position:relative">
      <button type="button" class="ll-cat-link" id="ll-income-cat-btn">Chọn danh mục</button>
      <div class="ll-cat-pop hidden" id="ll-income-cat-pop"></div></span>`;
    const expenseSlot = body.querySelector('#ll-expense-cat-slot');
    expenseSlot.innerHTML = `<span class="ll-cat-dd" id="ll-expense-cat-dd" style="display:inline-block;position:relative">
      <button type="button" class="ll-cat-link" id="ll-expense-cat-btn">Chọn danh mục</button>
      <div class="ll-cat-pop hidden" id="ll-expense-cat-pop"></div></span>`;

    setupCatPicker(incomeSlot.querySelector('#ll-income-cat-btn'), incomeSlot.querySelector('#ll-income-cat-pop'),
      () => incomeCats, incomeSel, () => load());
    setupCatPicker(expenseSlot.querySelector('#ll-expense-cat-btn'), expenseSlot.querySelector('#ll-expense-cat-pop'),
      () => expenseCats, expenseSel, () => load());
  }

  // ── Lợi nhuận theo (Sản phẩm/Đơn hàng/Ngày/Khách hàng/Nhân viên/Phòng-Bàn) ──────────────────
  const dimCatBtn = container.querySelector('#ll-dim-cat-btn');
  const dimCatPop = container.querySelector('#ll-dim-cat-pop');
  setupCatPicker(dimCatBtn, dimCatPop, () => productCats, dimCatSel, () => loadDim());

  container.querySelector('.ll-dim-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dim]');
    if (!btn) return;
    dimTab = btn.dataset.dim;
    container.querySelectorAll('.ll-dim-tab').forEach((b) => b.classList.toggle('active', b === btn));
    loadDim();
  });

  function dimTableHtml(items) {
    if (!items.length) {
      return `<div class="ll-dim-empty">${BOX_SVG}<div>Chưa có dữ liệu trong kỳ này</div><div style="font-size:12px">Bạn chưa có báo cáo nào được ghi lại.</div></div>`;
    }
    const hasQty = items[0].qty !== undefined;
    const rows = items.slice(0, 8).map((it) => `
      <tr>
        <td>${escapeHtml(it.name || it.key)}</td>
        ${hasQty ? `<td style="text-align:right">${it.qty}</td>` : ''}
        <td style="text-align:right">${formatVND(it.revenue)}</td>
        <td style="text-align:right">${formatVND(it.cogs)}</td>
        <td style="text-align:right;font-weight:700;color:${it.profit >= 0 ? 'var(--money-in,#16a34a)' : 'var(--money-out,#dc2626)'}">${formatVND(it.profit)}</td>
      </tr>`).join('');
    return `<div class="table-scroll"><table class="ll-dim-list">
      <thead><tr><th>Tên</th>${hasQty ? '<th style="text-align:right">SL</th>' : ''}<th style="text-align:right">Doanh thu</th><th style="text-align:right">Giá vốn</th><th style="text-align:right">Lợi nhuận</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  async function loadDim() {
    const el = container.querySelector('#ll-dim-body');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, dimension: dimTab });
      if (dimCatSel.size) params.set('categories', [...dimCatSel].join(','));
      const res = await api.get(`/api/mgr/reports/profit-by?${params}`);
      el.innerHTML = dimTableHtml(res.items || []);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được "Lợi nhuận theo".</p>';
    }
  }

  // ── Modal "Xem chi tiết ›" ───────────────────────────────────────────────────────────────────
  container.querySelector('#ll-dim-detail').addEventListener('click', openDimModal);

  function openDimModal() {
    let modalDim = dimTab;
    let modalRange = { ...range };
    let modalCats = new Set(dimCatSel);
    let modalQ = '';
    const modal = openModal('<p>Đang tải…</p>');
    modal.overlay.querySelector('.modal-box').classList.add('ll-modal-box');

    const modalRangeIds = { btn: 'll-modal-date-btn', label: 'll-modal-date-label', pop: 'll-modal-date-pop', calLeft: 'll-modal-cal-left', calRight: 'll-modal-cal-right', quick: 'll-modal-quick', yearBtn: 'll-modal-year-btn', yearPop: 'll-modal-year-pop', sel: 'll-modal-sel', clear: 'll-modal-clear', apply: 'll-modal-apply' };

    async function renderModal() {
      const box = modal.overlay.querySelector('.modal-box');
      box.innerHTML = `
        <h3>Lợi nhuận theo</h3>
        <div class="ll-dim-tabs">${DIM_TABS.map(([k, l]) => `<button type="button" class="ll-dim-tab${k === modalDim ? ' active' : ''}" data-mdim="${k}">${escapeHtml(l)}</button>`).join('')}</div>
        <div class="ll-modal-tools">
          <input type="search" id="ll-modal-q" placeholder="Tìm kiếm theo tên${modalDim === 'san-pham' ? '/SKU' : ''}" value="${escapeHtml(modalQ)}" />
          <div class="ll-cat-dd" id="ll-modal-cat-dd" style="position:relative">
            <button type="button" class="btn btn-ghost" id="ll-modal-cat-btn">Danh mục ▾</button>
            <div class="ll-cat-pop hidden" id="ll-modal-cat-pop"></div>
          </div>
          <div class="ord-date-wrap" id="ll-modal-range"></div>
        </div>
        <div id="ll-modal-body"><p>Đang tải…</p></div>
      `;
      box.querySelectorAll('[data-mdim]').forEach((b) => b.addEventListener('click', () => { modalDim = b.dataset.mdim; renderModal(); }));
      box.querySelector('#ll-modal-q').addEventListener('input', (e) => { modalQ = e.target.value; renderList(); });

      const modalCatBtn = box.querySelector('#ll-modal-cat-btn');
      const modalCatPop = box.querySelector('#ll-modal-cat-pop');
      setupCatPicker(modalCatBtn, modalCatPop, () => productCats, modalCats, () => loadModal());

      box.querySelector('#ll-modal-range').innerHTML = rangePickerHtml(modalRangeIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày');
      createRangePicker(box.querySelector('#ll-modal-range'), modalRangeIds, {
        emptyLabel: 'Từ ngày - Đến ngày',
        getFrom: () => modalRange.from,
        getTo: () => modalRange.to,
        set: (from, to) => { modalRange = { from, to }; },
        onCommit: () => loadModal(),
        onWarn: (m) => toast(m, 'error'),
      });

      await loadModal();
    }

    let modalItems = [];
    function renderList() {
      const q = modalQ.trim().toLowerCase();
      const filtered = q ? modalItems.filter((it) => (it.name || it.key || '').toLowerCase().includes(q)) : modalItems;
      modal.overlay.querySelector('#ll-modal-body').innerHTML = dimTableFullHtml(filtered);
    }
    function dimTableFullHtml(items) {
      if (!items.length) return `<div class="ll-dim-empty">${BOX_SVG}<div>Chưa có dữ liệu trong kỳ này</div></div>`;
      const hasQty = items[0].qty !== undefined;
      const rows = items.map((it) => `
        <tr>
          <td>${escapeHtml(it.name || it.key)}</td>
          ${hasQty ? `<td style="text-align:right">${it.qty}</td>` : ''}
          <td style="text-align:right">${formatVND(it.revenue)}</td>
          <td style="text-align:right">${formatVND(it.cogs)}</td>
          <td style="text-align:right;font-weight:700;color:${it.profit >= 0 ? 'var(--money-in,#16a34a)' : 'var(--money-out,#dc2626)'}">${formatVND(it.profit)}</td>
        </tr>`).join('');
      return `<div class="table-scroll" style="max-height:55vh"><table class="ll-dim-list">
        <thead><tr><th>Tên</th>${hasQty ? '<th style="text-align:right">SL</th>' : ''}<th style="text-align:right">Doanh thu</th><th style="text-align:right">Giá vốn</th><th style="text-align:right">Lợi nhuận</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    async function loadModal() {
      const el = modal.overlay.querySelector('#ll-modal-body');
      el.innerHTML = '<p>Đang tải…</p>';
      try {
        const params = new URLSearchParams({ from: modalRange.from, to: modalRange.to, dimension: modalDim });
        if (modalCats.size) params.set('categories', [...modalCats].join(','));
        const res = await api.get(`/api/mgr/reports/profit-by?${params}`);
        modalItems = res.items || [];
        renderList();
      } catch (err) {
        if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được dữ liệu.</p>';
      }
    }

    renderModal();
  }

  // ── Tải dữ liệu chính ────────────────────────────────────────────────────────────────────────
  async function load() {
    const mySeq = ++loadSeq;
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, compare: compareOn ? '1' : '0' });
      if (incomeSel.size) params.set('income_categories', [...incomeSel].join(','));
      if (expenseSel.size) params.set('expense_categories', [...expenseSel].join(','));
      const data = await api.get(`/api/mgr/reports/profit7?${params}`);
      if (mySeq !== loadSeq) return;
      lastData = data;
      renderKpi(data);
      renderChart(data);
      renderDetail(data);
    } catch (err) {
      if (mySeq !== loadSeq) return;
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#ll-kpi').innerHTML = '<p>Không tải được báo cáo lãi lỗ.</p>';
      }
    }
  }

  async function loadCategories() {
    try { incomeCats = (await api.get('/api/mgr/transactions/categories?direction=thu')).categories || []; } catch { /* */ }
    try { expenseCats = (await api.get('/api/mgr/transactions/categories?direction=chi')).categories || []; } catch { /* */ }
    try {
      const names = (await api.get('/api/mgr/products/categories')).categories || [];
      productCats = names.map((n) => ({ id: n, name: n }));
    } catch { /* */ }
  }

  await loadCategories();
  await Promise.all([load(), loadDim()]);
}
