// Đợt 7 (18/08/2026) — Báo cáo kho hàng: làm lại theo giao diện SoBanHang v2 (ảnh mẫu
// Website v2\Báo cáo\Kho hàng). Bản v1 (GĐ9 đợt 2) chỉ có tồn hiện tại + xuất trong kỳ; bản này
// thêm Tồn đầu kỳ/Nhập trong kỳ (report-service.js::inventoryReport đã bổ sung), lọc Loại hàng
// (Sản phẩm/Nguyên vật liệu), toggle "Báo cáo theo: Số lượng | Giá trị", xuất file CSV, phân trang.
//
// Mẫu tham khảo: views/ton-kho.js (KPI cards .kpi-card, filter-row, bảng .sp-table) — copy đúng
// class/pattern, KHÔNG tạo pattern mới. Dropdown nhiều-chọn dùng chung filter-dropdown.js.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, todayVN, monthStartVN, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';
import { filterDropdownHtml, bindFilterDropdown } from '../filter-dropdown.js';

const LS_PAGESIZE = 'posmgr.bck.pagesize.v1';
const TYPE_OPTIONS = [['san-pham', 'Sản phẩm'], ['nguyen-vat-lieu', 'Nguyên vật liệu']];
const STATUS_LABEL = { '': 'Trạng thái', 'con-hang': 'Còn hàng', 'het-hang': 'Hết hàng', thap: 'Tồn kho thấp' };

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  const state = {
    q: '', from: monthStartVN(), to: todayVN(), categories: [], types: [], status: '', view: 'qty',
  };
  let data = { items: [], summary: {} };
  let categories = [];
  let page = 1;
  let pageSize = parseInt(localStorage.getItem(LS_PAGESIZE) || '30', 10);
  let sort = { key: null, dir: 1 };

  const pickerIds = {
    btn: 'bck-date-btn', label: 'bck-date-label', pop: 'bck-date-pop',
    calLeft: 'bck-cal-left', calRight: 'bck-cal-right',
    quick: 'bck-quick', yearBtn: 'bck-year-btn', yearPop: 'bck-year-pop',
    sel: 'bck-sel', clear: 'bck-clear', apply: 'bck-apply',
  };

  container.innerHTML = `
    ${pageTabsHtml('bao-cao-kho', staff)}
    <div class="page-head">
      <h2>Báo cáo kho hàng</h2>
      <button id="bck-export" class="btn" type="button">${icon('tai-xuong')} Xuất file</button>
    </div>

    <div id="bck-kpi" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px"></div>

    <div class="filter-row">
      <input id="bck-q" type="search" placeholder="Tìm kiếm mã SKU/ Tên SP" />
      <div class="ord-date-wrap" id="bck-range">
        ${rangePickerHtml(pickerIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày')}
      </div>
      ${filterDropdownHtml('bck-cat', 'Danh mục', [])}
      ${filterDropdownHtml('bck-type', 'Loại hàng', TYPE_OPTIONS)}
      <div style="position:relative">
        <button id="bck-status-btn" class="btn" type="button">Trạng thái ▾</button>
        <div id="bck-status-drop" hidden class="row-menu" style="position:absolute;top:100%;left:0;min-width:160px;z-index:100;margin-top:4px">
          <div class="row-menu-item" data-status="">Tất cả</div>
          <div class="row-menu-item" data-status="con-hang">Còn hàng</div>
          <div class="row-menu-item" data-status="het-hang">Hết hàng</div>
          <div class="row-menu-item" data-status="thap">Tồn kho thấp</div>
        </div>
      </div>
      <button id="bck-clear-filter" class="money-clear-filter" type="button">× Xoá lọc</button>
    </div>

    <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px;font-size:13px">
      <span style="color:var(--text-2)">Báo cáo theo:</span>
      <button class="chip${state.view === 'qty' ? ' active' : ''}" data-view="qty" type="button">Số lượng</button>
      <button class="chip${state.view === 'value' ? ' active' : ''}" data-view="value" type="button">Giá trị</button>
    </div>

    <div style="overflow-x:auto">
      <table class="sp-table" id="bck-table" style="width:100%;min-width:760px">
        <thead id="bck-thead"></thead>
        <tbody id="bck-tbody"><tr><td colspan="6" style="text-align:center;padding:24px">Đang tải…</td></tr></tbody>
        <tfoot id="bck-tfoot"></tfoot>
      </table>
    </div>

    <div id="bck-paginator" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:12px;flex-wrap:wrap">
      <span id="bck-page-info" style="color:var(--text-2);font-size:13px"></span>
      <div id="bck-page-btns" style="display:flex;gap:4px"></div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px">
        Hiển thị dòng
        <select id="bck-page-size" style="width:auto;padding:4px 8px">
          ${[10, 30, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  // ── Khoảng ngày ──────────────────────────────────────────────────────────────────────────────
  createRangePicker(container.querySelector('#bck-range'), pickerIds, {
    emptyLabel: 'Từ ngày - Đến ngày',
    getFrom: () => state.from,
    getTo: () => state.to,
    set: (from, to) => { state.from = from; state.to = to; },
    onCommit: () => { page = 1; load(); },
    onWarn: (m) => toast(m, 'error'),
  });

  // ── Tìm kiếm ─────────────────────────────────────────────────────────────────────────────────
  let searchTimer = null;
  container.querySelector('#bck-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); page = 1; load(); }, 300);
  });

  // ── Danh mục / Loại hàng (nhiều-chọn) ───────────────────────────────────────────────────────
  const catFilter = bindFilterDropdown(container, 'bck-cat', () => closeAllPops(), (vals) => {
    state.categories = vals; page = 1; load();
  });
  const typeFilter = bindFilterDropdown(container, 'bck-type', () => closeAllPops(), (vals) => {
    state.types = vals; page = 1; load();
  });

  // ── Trạng thái (một-chọn) ────────────────────────────────────────────────────────────────────
  const statusBtn = container.querySelector('#bck-status-btn');
  const statusDrop = container.querySelector('#bck-status-drop');
  statusBtn.addEventListener('click', (e) => { e.stopPropagation(); closeAllPops(true); statusDrop.hidden = !statusDrop.hidden; });
  statusDrop.querySelectorAll('[data-status]').forEach((div) => {
    div.addEventListener('click', () => {
      state.status = div.dataset.status;
      statusBtn.textContent = STATUS_LABEL[state.status] + ' ▾';
      statusDrop.hidden = true;
      page = 1; load();
    });
  });

  function closeAllPops(keepStatus) {
    catFilter.close();
    typeFilter.close();
    if (!keepStatus) statusDrop.hidden = true;
  }
  document.addEventListener('click', () => closeAllPops());

  // ── Xoá lọc ──────────────────────────────────────────────────────────────────────────────────
  container.querySelector('#bck-clear-filter').addEventListener('click', () => {
    state.q = ''; state.categories = []; state.types = []; state.status = '';
    container.querySelector('#bck-q').value = '';
    catFilter.reset(); typeFilter.reset();
    statusBtn.textContent = 'Trạng thái ▾';
    container.querySelector(`#${pickerIds.clear}`).click();
  });

  // ── Toggle "Báo cáo theo" ────────────────────────────────────────────────────────────────────
  container.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      container.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b === btn));
      renderTableHead(); renderList();
    });
  });

  // ── Xuất file (CSV) ──────────────────────────────────────────────────────────────────────────
  container.querySelector('#bck-export').addEventListener('click', () => {
    if (!data.items.length) { toast('Không có dữ liệu để xuất', 'error'); return; }
    const head = ['Mã SKU', 'Sản phẩm', 'Đơn vị', 'Tồn đầu kỳ', 'Giá trị đầu kỳ', 'Nhập trong kỳ', 'Giá trị nhập',
      'Xuất trong kỳ', 'Giá trị xuất', 'Tồn cuối kỳ', 'Giá trị cuối kỳ'].join(',');
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = sortedItems().map((it) => [
      it.code || '', it.name, it.unit || '', it.opening_qty, it.opening_value ?? 0,
      it.inflow_qty, it.inflow_value ?? 0, it.outflow_qty, it.outflow_value ?? 0,
      it.closing_qty, it.closing_value ?? 0,
    ].map(cell).join(','));
    const blob = new Blob([`﻿${head}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bao-cao-kho-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${data.items.length} dòng`);
  });

  // ── KPI ──────────────────────────────────────────────────────────────────────────────────────
  function renderKpi() {
    const s = data.summary || {};
    container.querySelector('#bck-kpi').innerHTML = `
      <div class="kpi-card"><div class="kpi-val" style="color:var(--primary)">${formatVND(s.total_value || 0)}</div><div class="kpi-label">Giá trị tồn</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:#2563EB">${(s.total_qty || 0).toLocaleString('vi')}</div><div class="kpi-label">Tổng số lượng</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:#92400E">${s.low_stock_count || 0}</div><div class="kpi-label">Sắp hết hàng</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--danger)">${(s.total_outflow || 0).toLocaleString('vi')}</div><div class="kpi-label">Xuất trong kỳ</div></div>
    `;
  }

  // ── Bảng ─────────────────────────────────────────────────────────────────────────────────────
  const COLS = [
    { key: null, label: 'SẢN PHẨM' },
    { key: null, label: 'ĐƠN VỊ' },
    { key: 'opening_qty', valueKey: 'opening_value', label: 'TỒN ĐẦU KỲ' },
    { key: 'inflow_qty', valueKey: 'inflow_value', label: 'NHẬP TRONG KỲ', signed: 1 },
    { key: 'outflow_qty', valueKey: 'outflow_value', label: 'XUẤT TRONG KỲ', signed: -1 },
    { key: 'closing_qty', valueKey: 'closing_value', label: 'TỒN CUỐI KỲ' },
  ];

  function renderTableHead() {
    container.querySelector('#bck-thead').innerHTML = `<tr>
      ${COLS.map((c) => c.key
    ? `<th>${escapeHtml(c.label)} <button type="button" class="ord-sort-btn" data-sort="${c.key}" style="border:0;background:none;cursor:pointer;color:inherit;font:inherit;padding:0">${sort.key === c.key ? (sort.dir === 1 ? '▴' : '▾') : '⇅'}</button></th>`
    : `<th>${escapeHtml(c.label)}</th>`).join('')}
    </tr>`;
    container.querySelectorAll('[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        sort.dir = sort.key === key ? -sort.dir : 1;
        sort.key = key;
        renderTableHead(); renderList();
      });
    });
  }

  function sortedItems() {
    const items = data.items.slice();
    if (sort.key) {
      items.sort((a, b) => (Number(a[sort.key]) - Number(b[sort.key])) * sort.dir);
    }
    return items;
  }

  /** Ô số 2 dòng: dòng chính theo toggle (Số lượng/Giá trị), dòng phụ nhỏ màu xám là con số kia. */
  function numCellHtml(qty, value, unit, signed) {
    const sign = signed && qty ? (signed > 0 ? '+ ' : '− ') : '';
    const color = signed && qty ? (signed > 0 ? 'color:var(--primary)' : 'color:var(--danger)') : '';
    const qtyStr = `${sign}${Math.abs(qty).toLocaleString('vi')}${unit ? ' ' + escapeHtml(unit) : ''}`;
    const valStr = value === null ? '—' : `${sign}${formatVND(Math.abs(value))}`;
    const main = state.view === 'value' ? valStr : qtyStr;
    const sub = state.view === 'value' ? qtyStr : valStr;
    return `<div style="${state.view === 'value' ? color : ''}">${main}</div><div class="tc-td-sub">${sub}</div>`;
  }

  function renderList() {
    const all = sortedItems();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    const tbody = container.querySelector('#bck-tbody');

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-2)">
        ${data.items.length ? 'Không có mặt hàng nào khớp bộ lọc.' : 'Chưa có mặt hàng nào bật "Theo dõi kho".'}
      </td></tr>`;
    } else {
      tbody.innerHTML = items.map((it) => `
        <tr class="${it.low_stock ? 'warn-row' : ''}">
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="inline-ico">${icon(it.item_type === 'nguyen-vat-lieu' ? 'nvl' : 'san-pham')}</span>
              <div>
                <div style="font-weight:500">${escapeHtml(it.name)}
                  ${it.low_stock ? `<span class="badge-warn">${icon('canh-bao')} Sắp hết</span>` : ''}
                </div>
                <div class="tc-td-sub">${escapeHtml(it.code || '—')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(it.unit || '—')}</td>
          <td>${numCellHtml(it.opening_qty, it.opening_value, it.unit)}</td>
          <td>${numCellHtml(it.inflow_qty, it.inflow_value, it.unit, 1)}</td>
          <td>${numCellHtml(it.outflow_qty, it.outflow_value, it.unit, -1)}</td>
          <td>${numCellHtml(it.closing_qty, it.closing_value, it.unit)}</td>
        </tr>`).join('');
    }

    // Dòng "Tổng" cộng dồn TOÀN BỘ danh sách đã lọc (không chỉ trang đang xem).
    const sum = (key) => all.reduce((s, it) => s + Number(it[key] || 0), 0);
    const sumVal = (key) => {
      const v = all.reduce((s, it) => s + (it[key] || 0), 0);
      return v;
    };
    container.querySelector('#bck-tfoot').innerHTML = total ? `
      <tr style="font-weight:700">
        <td colspan="2">Tổng</td>
        <td>${numCellHtml(sum('opening_qty'), sumVal('opening_value'), '')}</td>
        <td>${numCellHtml(sum('inflow_qty'), sumVal('inflow_value'), '', 1)}</td>
        <td>${numCellHtml(sum('outflow_qty'), sumVal('outflow_value'), '', -1)}</td>
        <td>${numCellHtml(sum('closing_qty'), sumVal('closing_value'), '')}</td>
      </tr>` : '';

    // ── Phân trang ─────────────────────────────────────────────────────────────────────────────
    const info = container.querySelector('#bck-page-info');
    const startN = total ? start + 1 : 0;
    const endN = Math.min(start + pageSize, total);
    info.textContent = total ? `Hiển thị ${startN}–${endN}/${total} kết quả` : '';

    const btns = container.querySelector('#bck-page-btns');
    if (totalPages <= 1) { btns.innerHTML = ''; }
    else {
      let html = `<button ${page === 1 ? 'disabled' : ''} data-pg="${page - 1}" class="btn" style="padding:4px 10px">‹</button>`;
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
          html += `<button data-pg="${i}" class="btn ${i === page ? 'btn-primary' : ''}" style="padding:4px 10px">${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
          html += '<span style="padding:0 4px">…</span>';
        }
      }
      html += `<button ${page === totalPages ? 'disabled' : ''} data-pg="${page + 1}" class="btn" style="padding:4px 10px">›</button>`;
      btns.innerHTML = html;
      btns.querySelectorAll('[data-pg]').forEach((btn) => {
        btn.addEventListener('click', () => { page = parseInt(btn.dataset.pg, 10); renderList(); });
      });
    }
  }

  container.querySelector('#bck-page-size').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    page = 1;
    try { localStorage.setItem(LS_PAGESIZE, String(pageSize)); } catch { /* */ }
    renderList();
  });

  async function loadCategories() {
    try {
      const res = await api.get('/api/mgr/products/categories');
      categories = (res.categories || []).map((c) => (typeof c === 'string' ? c : c.name));
      const wrap = container.querySelector('#bck-cat-pop .hd-colpop-list');
      if (wrap) {
        wrap.innerHTML = categories.map((c) => `
          <label class="hd-colrow">
            <span>${escapeHtml(c)}</span>
            <input type="checkbox" data-val="${escapeHtml(c)}" />
          </label>`).join('');
        wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const values = [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.dataset.val);
            state.categories = values;
            container.querySelector('#bck-cat-btn').classList.toggle('hd-filter-on', values.length > 0);
            page = 1; load();
          });
        });
      }
    } catch { /* danh mục không tải được thì bỏ qua, vẫn dùng được các lọc khác */ }
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.categories.length) params.set('category', state.categories.join(','));
    if (state.types.length) params.set('type', state.types.join(','));
    if (state.status) params.set('status', state.status);
    try {
      data = await api.get(`/api/mgr/reports/inventory?${params}`);
      renderKpi();
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#bck-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px">Không tải được báo cáo kho.</td></tr>';
      }
    }
  }

  renderTableHead();
  await loadCategories();
  await load();
}
