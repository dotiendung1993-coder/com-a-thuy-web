// Đợt 6 (17/08/2026) v2 — Tồn kho: giao diện SoBanHang v2 (ảnh mẫu Website v2\Quản lý kho\Tồn kho).
// Table + 4 thẻ KPI + "Tạo giao dịch" dropdown (Nhập hàng/Xuất hàng/Kiểm kho) + Hiển thị cột.
// Giữ đủ tính năng bản cũ: tìm kiếm, chỉ món sắp hết (nay là filter "Tình trạng"), chọn nhiều +
// in mã vạch, "Đồng bộ trừ kho theo đơn đã bán".
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

const COL_DEFS = [
  { key: 'giavon', label: 'Giá vốn', default: true },
  { key: 'sltton', label: 'SL tồn', default: true },
  { key: 'giatri', label: 'Giá trị', default: true },
];
const LS_COLS = 'posmgr.tk.cols.v1';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem tồn kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { q: '', category: '', status: '', page: 1, pageSize: 30 };
  let data = { items: [], summary: {} };
  let categories = [];
  const selected = new Set();
  let visibleCols = new Set(
    JSON.parse(localStorage.getItem(LS_COLS) || 'null') || COL_DEFS.map((c) => c.key)
  );

  container.innerHTML = `
    <div class="page-head">
      <h2>Tồn kho</h2>
      ${canManage ? `
      <div style="position:relative">
        <button id="tk-create" class="btn btn-primary">+ Tạo giao dịch ▾</button>
        <div id="tk-create-drop" class="row-menu" style="display:none;position:absolute;top:100%;right:0;min-width:180px;z-index:200">
          <button type="button" data-go="nhap-hang">Nhập hàng</button>
          <button type="button" data-go="xuat-kho">Xuất hàng</button>
          <button type="button" data-go="kiem-kho">Kiểm kho</button>
        </div>
      </div>` : ''}
    </div>

    <div id="tk-kpi" class="sbh-kpi" style="margin-bottom:16px"></div>

    <div class="sbh-card" style="padding:0">
    <div class="sbh-card-tools">
      <input id="tk-q" class="sbh-card-search" type="search" placeholder="Tìm kiếm mã SKU/ Tên SP" />
      <div style="position:relative">
        <button id="tk-cat-btn" class="btn">Danh mục ▾</button>
        <div id="tk-cat-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:200px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <input id="tk-cat-q" type="search" placeholder="Tìm kiếm…" style="margin-bottom:6px" />
          <div id="tk-cat-list" style="max-height:220px;overflow-y:auto"></div>
        </div>
      </div>
      <div style="position:relative">
        <button id="tk-status-btn" class="btn">Tình trạng ▾</button>
        <div id="tk-status-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:160px;z-index:100;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <div class="row-menu-item" data-status="">Tất cả</div>
          <div class="row-menu-item" data-status="con-hang">Còn hàng</div>
          <div class="row-menu-item" data-status="het-hang">Hết hàng</div>
          <div class="row-menu-item" data-status="thap">Tồn kho thấp</div>
        </div>
      </div>
      <div style="position:relative;margin-left:auto">
        <button id="tk-col-btn" class="btn pm-col-btn ord-cols-icon" aria-label="Hiển thị cột" title="Hiển thị cột">${icon('cot-hien-thi')}</button>
        <div id="tk-col-drop" hidden style="position:absolute;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:160px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <div style="font-size:11px;color:#888;font-weight:600;padding:2px 8px 6px">HIỂN THỊ CỘT</div>
          ${COL_DEFS.map((c) => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
            <input type="checkbox" data-col="${c.key}" ${visibleCols.has(c.key) ? 'checked' : ''} style="width:auto;min-height:auto" />
            ${escapeHtml(c.label)}
          </label>`).join('')}
        </div>
      </div>
    </div>

    <div class="filter-row" id="tk-bulk" style="display:none">
      <span id="tk-selected"></span>
      <button id="tk-barcode" class="btn btn-primary">In mã vạch</button>
    </div>
    ${canManage ? '<button id="tk-sync" class="btn" style="width:calc(100% - 28px);margin:0 14px 12px">Đồng bộ trừ kho theo đơn đã bán</button>' : ''}

    <div style="overflow-x:auto">
      <table class="sp-table" id="tk-table" style="width:100%;min-width:480px;border-radius:0">
        <thead id="tk-thead"></thead>
        <tbody id="tk-tbody"><tr><td colspan="6">Đang tải…</td></tr></tbody>
      </table>
    </div>
    <div class="ord-pager" id="tk-pager"></div>
    </div>
  `;

  // ── search ──
  let searchTimer = null;
  container.querySelector('#tk-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });

  // ── "Tạo giao dịch" dropdown ──
  if (canManage) {
    const createBtn = container.querySelector('#tk-create');
    const createDrop = container.querySelector('#tk-create-drop');
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      createDrop.style.display = createDrop.style.display === 'block' ? 'none' : 'block';
    });
    createDrop.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => { window.location.hash = `#/${btn.dataset.go}`; });
    });
  }
  document.addEventListener('click', () => {
    const d = container.querySelector('#tk-create-drop');
    if (d) d.style.display = 'none';
  });

  // ── Danh mục dropdown ──
  const catBtn = container.querySelector('#tk-cat-btn');
  const catDrop = container.querySelector('#tk-cat-drop');
  const catQEl = container.querySelector('#tk-cat-q');
  const catList = container.querySelector('#tk-cat-list');
  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    catDrop.hidden = !catDrop.hidden;
    if (!catDrop.hidden) { catQEl.focus(); renderCatList(''); }
  });
  catQEl.addEventListener('input', () => renderCatList(catQEl.value));
  function renderCatList(q) {
    const filtered = q ? categories.filter((c) => c.toLowerCase().includes(q.toLowerCase())) : categories;
    catList.innerHTML = `
      <div class="sp-cat-item" data-cat="" style="padding:6px 8px;cursor:pointer;border-radius:6px;${!state.category ? 'background:var(--primary-light,#f0fdf4)' : ''}">Tất cả danh mục</div>
      ${filtered.map((c) => `<div class="sp-cat-item" data-cat="${escapeHtml(c)}" style="padding:6px 8px;cursor:pointer;border-radius:6px;${state.category === c ? 'background:var(--primary-light,#f0fdf4)' : ''}">${escapeHtml(c)}</div>`).join('')}
      ${!filtered.length ? '<p class="hint" style="padding:6px 8px;margin:0">Không tìm thấy</p>' : ''}`;
    catList.querySelectorAll('.sp-cat-item').forEach((div) => {
      div.addEventListener('click', () => {
        state.category = div.dataset.cat; catDrop.hidden = true; catQEl.value = '';
        catBtn.textContent = state.category ? state.category + ' ▾' : 'Danh mục ▾';
        load();
      });
    });
  }

  // ── Tình trạng dropdown ──
  const statusBtn = container.querySelector('#tk-status-btn');
  const statusDrop = container.querySelector('#tk-status-drop');
  const STATUS_LABEL = { '': 'Tình trạng', 'con-hang': 'Còn hàng', 'het-hang': 'Hết hàng', thap: 'Tồn kho thấp' };
  statusBtn.addEventListener('click', (e) => { e.stopPropagation(); statusDrop.hidden = !statusDrop.hidden; });
  statusDrop.querySelectorAll('[data-status]').forEach((div) => {
    div.addEventListener('click', () => {
      state.status = div.dataset.status; statusDrop.hidden = true;
      statusBtn.textContent = (state.status ? STATUS_LABEL[state.status] : 'Tình trạng') + ' ▾';
      load();
    });
  });

  // ── Hiển thị cột ──
  const colDrop = container.querySelector('#tk-col-drop');
  container.querySelector('#tk-col-btn').addEventListener('click', (e) => { e.stopPropagation(); colDrop.hidden = !colDrop.hidden; });
  colDrop.querySelectorAll('[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) visibleCols.add(cb.dataset.col); else visibleCols.delete(cb.dataset.col);
      try { localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols])); } catch { /* */ }
      renderTableHead(); renderList();
    });
  });
  document.addEventListener('click', () => { catDrop.hidden = true; statusDrop.hidden = true; colDrop.hidden = true; });

  container.querySelector('#tk-barcode').addEventListener('click', openBarcodeDialog);
  if (canManage) {
    container.querySelector('#tk-sync').addEventListener('click', async () => {
      try {
        const res = await api.post('/api/mgr/stock/sync-sold');
        toast(`Đã tạo ${res.created} phiếu xuất, huỷ ${res.voided} phiếu của đơn bị huỷ`);
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không đồng bộ được', 'error');
      }
    });
  }

  function renderTableHead() {
    container.querySelector('#tk-thead').innerHTML = `<tr>
      <th style="width:32px"></th>
      <th>SẢN PHẨM</th>
      ${visibleCols.has('giavon') ? '<th style="width:90px">GIÁ VỐN</th>' : ''}
      ${visibleCols.has('sltton') ? '<th style="width:100px">SL TỒN</th>' : ''}
      ${visibleCols.has('giatri') ? '<th style="width:100px">GIÁ TRỊ</th>' : ''}
      <th style="width:40px"></th>
    </tr>`;
  }

  function renderKpi() {
    const s = data.summary || {};
    const neverMoved = data.items.filter((p) => !p.last_move_at).length;
    const totalQty = data.items.reduce((sum, p) => sum + (p.on_hand || 0), 0);
    const outOfStock = data.items.filter((p) => (p.on_hand || 0) <= 0).length;
    container.querySelector('#tk-kpi').innerHTML = `
      <div class="kpi-card kpi-c3"><div class="kpi-label">Tổng số lượng</div><div class="kpi-val">${totalQty.toLocaleString('vi-VN')}</div></div>
      <div class="kpi-card kpi-c2"><div class="kpi-label">Giá trị kho</div><div class="kpi-val">${formatVND(s.total_value || 0)}</div></div>
      <div class="kpi-card kpi-c4"><div class="kpi-label">Số hàng hết</div><div class="kpi-val">${outOfStock}</div></div>
      <div class="kpi-card kpi-c3"><div class="kpi-label">Chưa mở tồn</div><div class="kpi-val">${neverMoved}</div></div>
      ${s.missing_cost ? `<div class="warn-banner" style="grid-column:1/-1">${s.missing_cost} món chưa nhập giá vốn nên chưa tính được vào giá trị tồn. <a href="#/gia-von">Nhập giá vốn →</a></div>` : ''}
    `;
  }

  function renderBulkBar() {
    container.querySelector('#tk-bulk').style.display = selected.size ? 'flex' : 'none';
    container.querySelector('#tk-selected').textContent = `Đã chọn ${selected.size} món`;
  }

  function filteredItems() {
    let items = data.items;
    if (state.status === 'con-hang') items = items.filter((p) => (p.on_hand || 0) > 0);
    if (state.status === 'het-hang') items = items.filter((p) => (p.on_hand || 0) <= 0);
    if (state.status === 'thap') items = items.filter((p) => p.low_stock);
    return items;
  }

  function renderPager(total) {
    const el = container.querySelector('#tk-pager');
    if (!el) return;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    el.innerHTML = `
      <span style="color:var(--text-2,#888);font-size:13px">Hiển thị ${total ? start + 1 : 0}-${Math.min(start + state.pageSize, total)} / ${total} dòng</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2,#888)">Hiển thị dòng</span>
        <select id="tk-page-size">
          ${[10, 30, 50, 100].map((n) => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" id="tk-prev" ${state.page <= 1 ? 'disabled' : ''}>&#8249;</button>
        <span class="ord-page-cur">${state.page} / ${totalPages}</span>
        <button class="ord-page-btn" id="tk-next" ${state.page >= totalPages ? 'disabled' : ''}>&#8250;</button>
      </div>`;
    el.querySelector('#tk-page-size').addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderList();
    });
    el.querySelector('#tk-prev').addEventListener('click', () => { state.page--; renderList(); });
    el.querySelector('#tk-next').addEventListener('click', () => { state.page++; renderList(); });
  }

  function renderList() {
    const all = filteredItems();
    renderPager(all.length);
    const start = (state.page - 1) * state.pageSize;
    const items = all.slice(start, start + state.pageSize);
    const tbody = container.querySelector('#tk-tbody');
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#999">
        ${data.items.length ? 'Không có món nào khớp bộ lọc.' : 'Chưa có món nào bật "Theo dõi kho". Vào màn <b>Sản phẩm</b> bật trước đã.'}
      </td></tr>`;
      return;
    }
    tbody.innerHTML = items.map((p) => `
      <tr data-pid="${p.id}">
        <td><input type="checkbox" data-pick="${p.id}" ${selected.has(p.id) ? 'checked' : ''} style="width:auto;min-height:auto" /></td>
        <td>
          <div style="font-weight:500">${escapeHtml(p.name)}
            ${p.low_stock ? '<span class="badge-warn" style="font-size:10px;margin-left:4px">Sắp hết</span>' : ''}
            ${p.selling ? '' : '<span class="badge-warn" style="font-size:10px;margin-left:4px">Ngừng bán</span>'}
          </div>
          <div style="font-size:12px;color:#888">${escapeHtml(p.code || '')}${p.barcode ? ' · ' + escapeHtml(p.barcode) : ''}</div>
        </td>
        ${visibleCols.has('giavon') ? `<td style="font-size:13px">${p.cost_price ? formatVND(p.cost_price) : '—'}</td>` : ''}
        ${visibleCols.has('sltton') ? `<td>${canManage
    ? `<input type="number" step="0.001" data-adjust="${p.id}" value="${p.on_hand}" style="width:90px;padding:4px 8px" />`
    : `<span style="color:${p.low_stock ? '#c00' : 'inherit'}">${p.on_hand}${p.unit ? ' ' + escapeHtml(p.unit) : ''}</span>`}</td>` : ''}
        ${visibleCols.has('giatri') ? `<td style="font-size:13px">${p.stock_value ? formatVND(p.stock_value) : '—'}</td>` : ''}
        <td class="dm-act"><div class="dm-kebab-wrap"><button class="ord-kebab" data-menu="${p.id}" aria-label="Thao tác">${icon('them')}</button></div></td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-pick]').forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.pick); else selected.delete(box.dataset.pick);
        renderBulkBar();
      });
    });
    tbody.querySelectorAll('[data-adjust]').forEach((input) => {
      input.addEventListener('change', () => adjustStock(input.dataset.adjust, input));
    });
    tbody.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
    });
  }

  // Sửa tồn kho trực tiếp trên bảng — sinh phiếu điều chỉnh tăng/giảm (giữ dấu vết ở Sổ kho),
  // KHÔNG ghi đè thẳng con số (tồn không lưu ở đâu cả — nguyên tắc số một của stock-service.js).
  async function adjustStock(menuId, input) {
    const p = data.items.find((x) => x.id === menuId);
    if (!p) return;
    const target = Number(input.value);
    if (!Number.isFinite(target) || target < 0) { input.value = p.on_hand; toast('Số lượng không hợp lệ', 'error'); return; }
    const diff = Math.round((target - p.on_hand) * 1000) / 1000;
    if (diff === 0) return;
    if (!(await confirmDialog(`Sửa tồn kho "${p.name}" từ ${p.on_hand} → ${target}?`))) { input.value = p.on_hand; return; }
    try {
      await api.post('/api/mgr/stock/moves', {
        direction: diff > 0 ? 'nhap' : 'xuat',
        reason: diff > 0 ? 'Điều chỉnh tăng' : 'Điều chỉnh giảm',
        items: [{ menu_id: menuId, qty: Math.abs(diff), unit_cost: diff > 0 ? (p.cost_price || 0) : 0 }],
      });
      toast('Đã sửa tồn kho');
      await load();
    } catch (err) {
      input.value = p.on_hand;
      toast(err?.body?.message || 'Không sửa được tồn kho', 'error');
    }
  }

  let openMenuEl = null;
  function closeRowMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
  function openRowMenu(btn) {
    const p = data.items.find((x) => x.id === btn.dataset.menu);
    if (!p) return;
    closeRowMenu();
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.innerHTML = `
      <button type="button" data-act="barcode">In mã vạch món này</button>
      <button type="button" data-act="sokho">Xem trong Sổ kho</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4 + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    openMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'barcode') {
        window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?ids=${p.id}&size=50x30&copies=1`, '_blank');
      } else {
        window.location.hash = '#/so-kho';
      }
    });
  }
  document.addEventListener('click', closeRowMenu);

  function openBarcodeDialog() {
    const modal = openModal(`
      <h3>In mã vạch — ${selected.size} món</h3>
      <div class="field"><label>Khổ tem</label>
        <select id="tkbc-size">
          <option value="50x30">50 × 30 mm (phổ biến)</option>
          <option value="35x22">35 × 22 mm (nhỏ)</option>
          <option value="70x40">70 × 40 mm (lớn)</option>
        </select></div>
      <div class="field"><label>Số tem mỗi món</label>
        <input id="tkbc-copies" type="number" min="1" max="50" value="1" /></div>
      <button id="tkbc-go" class="btn btn-primary" style="width:100%">Mở trang in</button>
    `);
    modal.overlay.querySelector('#tkbc-go').addEventListener('click', () => {
      const params = new URLSearchParams({
        ids: [...selected].join(','),
        size: modal.overlay.querySelector('#tkbc-size').value,
        copies: modal.overlay.querySelector('#tkbc-copies').value || '1',
      });
      window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?${params}`, '_blank');
      modal.close();
    });
  }

  async function loadCategories() {
    try { categories = (await api.get('/api/mgr/products/categories')).categories || []; } catch { /* */ }
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    try {
      data = await api.get(`/api/mgr/stock/levels?${params}`);
      renderKpi();
      renderList();
      renderBulkBar();
    } catch (err) {
      container.querySelector('#tk-tbody').innerHTML = '<tr><td colspan="6">Không tải được tồn kho.</td></tr>';
    }
  }

  renderTableHead();
  await loadCategories();
  await load();
}
