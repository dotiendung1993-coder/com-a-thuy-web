// Đợt 5 (17/08/2026) v2 — Sản phẩm: giao diện SoBanHang v2.
// Table layout + 4 KPI cards + Thao tác dropdown + split button + panel chi tiết.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, resolveImg } from '../ui.js';
import { icon } from '../icons.js';

const COL_DEFS = [
  { key: 'danhmuc',   label: 'Danh mục',    default: true },
  { key: 'donvi',     label: 'Đơn vị',      default: true },
  { key: 'giavon',    label: 'Giá vốn',     default: true },
  { key: 'giaban',    label: 'Giá bán',     default: true },
  { key: 'cotheban',  label: 'Có thể bán',  default: true },
  { key: 'tonkho',    label: 'Tồn kho',     default: true },
];
const LS_COLS     = 'posmgr.sp.cols.v1';
const LS_PAGESIZE = 'posmgr.sp.pagesize.v1';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  let state = { tab: 'tat-ca', q: '', category: '' };
  let data  = { items: [], tabs: [], total: 0 };
  let categories = [];
  const selected = new Set();
  let page = 1;
  let pageSize = parseInt(localStorage.getItem(LS_PAGESIZE) || '30', 10);
  let visibleCols = new Set(
    JSON.parse(localStorage.getItem(LS_COLS) || 'null') ||
    COL_DEFS.filter((c) => c.default).map((c) => c.key)
  );
  let detailProduct = null;

  // ─── Initial HTML ───────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="page-head">
      <h2>Sản phẩm</h2>
      <div style="display:flex;gap:8px;align-items:center">
        ${canManage ? `
        <div style="position:relative">
          <button id="sp-thao-tac" class="btn">Thao tác ▾</button>
          <div id="sp-ta-drop" class="row-menu" style="display:none;position:absolute;top:100%;right:0;min-width:200px;z-index:200">
            <button type="button" data-ta="excel">${icon('tai-file')||''}Tải Excel</button>
            <button type="button" data-ta="online">Xuất file xem Online</button>
            <button type="button" data-ta="san">Liên kết sàn TMĐT</button>
          </div>
        </div>
        <div style="display:flex;border-radius:8px;overflow:hidden">
          <button id="sp-new" class="btn btn-primary" style="border-radius:0;border-right:1px solid rgba(255,255,255,.3)">+ Tạo sản phẩm</button>
          <button id="sp-new-drop" class="btn btn-primary" style="border-radius:0;padding:0 8px">▾</button>
        </div>
        <div id="sp-new-menu" class="row-menu" style="display:none;position:absolute;z-index:200;min-width:220px">
          <button type="button" data-nm="san-pham">Tạo sản phẩm</button>
          <button type="button" data-nm="dich-vu">Tạo dịch vụ theo giờ</button>
          <button type="button" data-nm="nhieu">Thêm nhiều sản phẩm</button>
          <button type="button" data-nm="excel">Cập nhật nhiều sản phẩm (Excel)</button>
        </div>` : ''}
      </div>
    </div>

    <!-- KPI -->
    <div id="sp-kpi" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px"></div>

    <!-- Tabs (Tất cả / Đang bán / Ngừng bán / Sắp hết) -->
    <div class="tab-row" id="sp-tabs"></div>

    <!-- Filter row -->
    <div class="filter-row">
      <input id="sp-q" type="search" placeholder="Tìm mã SKU/Tên SP…" />
      <div style="position:relative">
        <button id="sp-cat-btn" class="btn">Danh mục ▾</button>
        <div id="sp-cat-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:220px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <input id="sp-cat-q" type="search" placeholder="Tìm kiếm…" style="margin-bottom:6px" />
          <div id="sp-cat-list" style="max-height:220px;overflow-y:auto"></div>
        </div>
      </div>
    </div>

    <!-- Bulk action bar -->
    <div class="filter-row" id="sp-bulk" style="display:none">
      <span id="sp-selected-count"></span>
      ${canManage ? `
      <button id="sp-bulk-track" class="btn">Bật theo dõi kho</button>
      <button id="sp-bulk-untrack" class="btn">Tắt theo dõi kho</button>` : ''}
      <button id="sp-bulk-barcode" class="btn btn-primary">In mã vạch</button>
    </div>

    <!-- Table controls -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:4px">
      <div style="position:relative">
        <button id="sp-col-btn" class="btn" style="font-size:13px">Hiển thị cột ▾</button>
        <div id="sp-col-drop" hidden style="position:absolute;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:180px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          ${COL_DEFS.map((c) => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
            <input type="checkbox" data-col="${c.key}" ${visibleCols.has(c.key) ? 'checked' : ''} style="width:auto;min-height:auto" />
            ${escapeHtml(c.label)}
          </label>`).join('')}
        </div>
      </div>
    </div>

    <!-- Table -->
    <div style="overflow-x:auto">
      <table class="sp-table" id="sp-table" style="width:100%;min-width:500px">
        <thead id="sp-thead"></thead>
        <tbody id="sp-tbody"></tbody>
      </table>
    </div>

    <!-- Paginator -->
    <div id="sp-paginator" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:12px;flex-wrap:wrap">
      <span id="sp-page-info" style="color:#666;font-size:13px"></span>
      <div id="sp-page-btns" style="display:flex;gap:4px"></div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px">
        Hiện thị
        <select id="sp-page-size" style="width:auto;padding:4px 8px">
          ${[5,10,20,30,40,50].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Detail panel -->
    <div id="sp-detail" style="position:fixed;top:0;right:0;bottom:0;width:min(380px,100vw);background:var(--card-bg,#fff);border-left:1px solid var(--border,#ddd);z-index:300;transform:translateX(100%);transition:transform .2s;overflow-y:auto;padding:20px 16px;display:none">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:8px">
        <div style="flex:1;min-width:0">
          <div id="sp-detail-name" style="font-weight:600;font-size:16px;word-break:break-word"></div>
          <div id="sp-detail-sku" style="color:#888;font-size:12px;margin-top:2px"></div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${canManage ? '<button id="sp-detail-edit" class="btn" style="padding:4px 10px;font-size:12px">Sửa</button>' : ''}
          <button id="sp-detail-close" style="background:none;border:none;cursor:pointer;font-size:24px;color:#666;line-height:1">×</button>
        </div>
      </div>
      <div id="sp-detail-body"></div>
    </div>
  `;

  // ─── Bind event handlers ────────────────────────────────────────────────────
  const qEl   = container.querySelector('#sp-q');
  let searchTimer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = qEl.value.trim(); page = 1; load(); }, 300);
  });

  // Category dropdown
  const catBtn  = container.querySelector('#sp-cat-btn');
  const catDrop = container.querySelector('#sp-cat-drop');
  const catQEl  = container.querySelector('#sp-cat-q');
  const catList = container.querySelector('#sp-cat-list');
  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    catDrop.hidden = !catDrop.hidden;
    if (!catDrop.hidden) { catQEl.focus(); renderCatList(''); }
  });
  catQEl.addEventListener('input', () => renderCatList(catQEl.value));
  document.addEventListener('click', () => { catDrop.hidden = true; });

  function renderCatList(q) {
    const filtered = q
      ? categories.filter((c) => c.toLowerCase().includes(q.toLowerCase()))
      : categories;
    catList.innerHTML = `
      <div class="sp-cat-item ${!state.category ? 'active' : ''}" data-cat="" style="padding:6px 8px;cursor:pointer;border-radius:6px;${!state.category ? 'background:var(--primary-light,#f0fdf4)' : ''}">
        Tất cả danh mục
      </div>
      ${filtered.map((c) => `
      <div class="sp-cat-item ${state.category === c ? 'active' : ''}" data-cat="${escapeHtml(c)}"
        style="padding:6px 8px;cursor:pointer;border-radius:6px;${state.category === c ? 'background:var(--primary-light,#f0fdf4)' : ''}">
        ${escapeHtml(c)}
      </div>`).join('')}
      ${!filtered.length ? '<p class="hint" style="padding:6px 8px;margin:0">Không tìm thấy</p>' : ''}`;
    catList.querySelectorAll('.sp-cat-item').forEach((div) => {
      div.addEventListener('click', () => {
        state.category = div.dataset.cat; page = 1; catDrop.hidden = true; catQEl.value = '';
        catBtn.textContent = state.category ? state.category + ' ▾' : 'Danh mục ▾';
        load();
      });
    });
  }

  // Column picker
  const colDrop = container.querySelector('#sp-col-drop');
  container.querySelector('#sp-col-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    colDrop.hidden = !colDrop.hidden;
  });
  document.addEventListener('click', () => { colDrop.hidden = true; });
  colDrop.querySelectorAll('[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) visibleCols.add(cb.dataset.col); else visibleCols.delete(cb.dataset.col);
      try { localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols])); } catch { /* */ }
      renderTableHead();
      renderList();
    });
  });

  // Paginator page size
  container.querySelector('#sp-page-size').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    page = 1;
    try { localStorage.setItem(LS_PAGESIZE, String(pageSize)); } catch { /* */ }
    renderList();
    renderPaginator();
  });

  // Thao tác dropdown
  if (canManage) {
    const taBtn  = container.querySelector('#sp-thao-tac');
    const taDrop = container.querySelector('#sp-ta-drop');
    taBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      taDrop.style.display = taDrop.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { taDrop.style.display = 'none'; });
    taDrop.querySelectorAll('[data-ta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        taDrop.style.display = 'none';
        toast('Tính năng đang phát triển', 'info');
      });
    });

    // Split "Tạo sản phẩm" button
    const newMenu = container.querySelector('#sp-new-menu');
    container.querySelector('#sp-new').addEventListener('click', () => openForm(null));
    container.querySelector('#sp-new-drop').addEventListener('click', (e) => {
      e.stopPropagation();
      const r = e.target.getBoundingClientRect();
      newMenu.style.top  = `${r.bottom + window.scrollY + 4}px`;
      newMenu.style.left = `${Math.max(8, r.right - 220 + window.scrollX)}px`;
      newMenu.style.display = newMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { newMenu.style.display = 'none'; });
    newMenu.querySelectorAll('[data-nm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        newMenu.style.display = 'none';
        if (btn.dataset.nm === 'san-pham') { openForm(null); return; }
        toast('Tính năng đang phát triển', 'info');
      });
    });

    container.querySelector('#sp-bulk-track').addEventListener('click', () => bulkTrack(true));
    container.querySelector('#sp-bulk-untrack').addEventListener('click', () => bulkTrack(false));
  }
  container.querySelector('#sp-bulk-barcode').addEventListener('click', openBarcodeDialog);

  // Detail panel close
  const detailPanel = container.querySelector('#sp-detail');
  container.querySelector('#sp-detail-close').addEventListener('click', closeDetail);
  if (canManage) {
    container.querySelector('#sp-detail-edit').addEventListener('click', () => {
      if (detailProduct) { closeDetail(); openForm(detailProduct); }
    });
  }
  function closeDetail() {
    detailPanel.style.transform = 'translateX(100%)';
    setTimeout(() => { detailPanel.style.display = 'none'; }, 200);
    detailProduct = null;
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────
  function renderTableHead() {
    container.querySelector('#sp-thead').innerHTML = `<tr>
      <th style="width:32px"><input id="sp-check-all" type="checkbox" style="width:auto;min-height:auto" /></th>
      <th>SẢN PHẨM</th>
      ${visibleCols.has('danhmuc')  ? '<th style="width:110px">DANH MỤC</th>' : ''}
      ${visibleCols.has('donvi')    ? '<th style="width:70px">ĐƠN VỊ</th>'  : ''}
      ${visibleCols.has('giavon')   ? '<th style="width:90px">GIÁ VỐN</th>' : ''}
      ${visibleCols.has('giaban')   ? '<th style="width:90px">GIÁ BÁN</th>' : ''}
      ${visibleCols.has('cotheban') ? '<th style="width:100px">CÓ THỂ BÁN</th>' : ''}
      ${visibleCols.has('tonkho')   ? '<th style="width:80px">TỒN KHO</th>' : ''}
      ${canManage ? '<th style="width:40px"></th>' : ''}
    </tr>`;
    container.querySelector('#sp-check-all')?.addEventListener('change', (e) => {
      const paged = pagedItems();
      if (e.target.checked) paged.forEach((p) => selected.add(p.id));
      else paged.forEach((p) => selected.delete(p.id));
      renderList();
      renderBulkBar();
    });
  }

  function renderTabs() {
    container.querySelector('#sp-tabs').innerHTML = data.tabs.map((t) => `
      <button class="tab ${t.value === state.tab ? 'active' : ''}" data-tab="${t.value}">
        ${escapeHtml(t.label)} <span class="tab-count">${t.count}</span>
      </button>`).join('');
    container.querySelectorAll('#sp-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; page = 1; load(); });
    });
  }

  function renderKpi() {
    const tatCa  = data.tabs.find((t) => t.value === 'tat-ca')?.count ?? 0;
    const sapHet = data.tabs.find((t) => t.value === 'sap-het')?.count ?? 0;
    const giaTri = data.items.reduce((s, p) => s + (p.track_stock ? (p.on_hand || 0) * (p.cost_price || 0) : 0), 0);
    const chuaBat = data.items.filter((p) => !p.track_stock).length;
    container.querySelector('#sp-kpi').innerHTML = `
      <div class="kpi-card"><div class="kpi-val">${tatCa}</div><div class="kpi-label">Số lượng</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--primary,#16a34a)">${formatVND(giaTri)}</div><div class="kpi-label">Giá trị tồn</div></div>
      <div class="kpi-card"><div class="kpi-val">${sapHet}</div><div class="kpi-label">Thiếu hàng</div></div>
      <div class="kpi-card"><div class="kpi-val">${chuaBat}</div><div class="kpi-label">Chưa bắt tồn kho</div></div>`;
  }

  function renderBulkBar() {
    const bar = container.querySelector('#sp-bulk');
    bar.style.display = selected.size ? 'flex' : 'none';
    container.querySelector('#sp-selected-count').textContent = `Đã chọn ${selected.size} món`;
  }

  function pagedItems() {
    const start = (page - 1) * pageSize;
    return data.items.slice(start, start + pageSize);
  }

  function renderList() {
    const paged = pagedItems();
    const tbody = container.querySelector('#sp-tbody');
    if (!data.items.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:48px;color:#999">
        <div style="font-size:40px;margin-bottom:12px"></div>
        <div style="font-weight:600">Không có sản phẩm nào</div>
        ${canManage ? '<div style="margin-top:12px"><button id="sp-empty-new" class="btn btn-primary">+ Tạo sản phẩm mới</button></div>' : ''}
      </td></tr>`;
      tbody.querySelector('#sp-empty-new')?.addEventListener('click', () => openForm(null));
      return;
    }

    tbody.innerHTML = paged.map((p) => `
      <tr class="${p.selling ? '' : 'row-inactive'}" data-pid="${p.id}">
        <td><input type="checkbox" data-pick="${p.id}" ${selected.has(p.id) ? 'checked' : ''} style="width:auto;min-height:auto" /></td>
        <td>
          <div class="sp-name-cell" data-detail="${p.id}" style="cursor:pointer">
            <div style="font-weight:500;color:var(--primary,#16a34a)">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:#888">${escapeHtml(p.code || '')}${p.barcode ? ' · ' + escapeHtml(p.barcode) : ''}
              ${p.track_stock ? '<span class="badge-default" style="font-size:10px;margin-left:4px">Kho</span>' : ''}
              ${p.low_stock   ? '<span class="badge-warn"    style="font-size:10px;margin-left:4px">Sắp hết</span>' : ''}
              ${p.selling     ? '' : '<span class="badge-warn" style="font-size:10px;margin-left:4px">Ngừng bán</span>'}
            </div>
          </div>
        </td>
        ${visibleCols.has('danhmuc')  ? `<td style="color:#666;font-size:13px">${escapeHtml(p.category || '—')}</td>` : ''}
        ${visibleCols.has('donvi')    ? `<td style="color:#666;font-size:13px">${escapeHtml(p.unit || '—')}</td>` : ''}
        ${visibleCols.has('giavon')   ? `<td style="font-size:13px">${p.cost_price ? formatVND(p.cost_price) : '—'}</td>` : ''}
        ${visibleCols.has('giaban')   ? `<td style="font-size:13px;font-weight:500">${formatVND(p.price)}</td>` : ''}
        ${visibleCols.has('cotheban') ? `<td><span class="badge ${p.selling ? 'badge-ok' : 'badge-warn'}" style="font-size:11px">${p.selling ? 'Còn hàng' : 'Ngừng bán'}</span></td>` : ''}
        ${visibleCols.has('tonkho')   ? `<td style="font-size:13px;color:${p.low_stock ? '#c00' : 'inherit'}">${p.track_stock ? p.on_hand : '—'}</td>` : ''}
        ${canManage ? `<td><button class="ord-kebab" data-menu="${p.id}" aria-label="Thao tác">⋯</button></td>` : ''}
      </tr>`).join('');

    // Checkboxes
    tbody.querySelectorAll('[data-pick]').forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.pick); else selected.delete(box.dataset.pick);
        renderBulkBar();
      });
    });

    // Name click → detail panel
    tbody.querySelectorAll('[data-detail]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const p = data.items.find((x) => String(x.id) === cell.dataset.detail);
        if (p) openDetailPanel(p);
      });
    });

    // Kebab menu
    if (canManage) {
      tbody.querySelectorAll('.ord-kebab').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
      });
    }
  }

  function renderPaginator() {
    const total = data.items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize + 1;
    const end   = Math.min(page * pageSize, total);

    container.querySelector('#sp-page-info').textContent =
      total ? `Hiện thị ${start}-${end} / ${total} kết quả` : '';

    const btns = container.querySelector('#sp-page-btns');
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button ${page === 1 ? 'disabled' : ''} data-pg="${page - 1}" class="btn" style="padding:4px 10px">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        html += `<button data-pg="${i}" class="btn ${i === page ? 'btn-primary' : ''}" style="padding:4px 10px">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        html += `<span style="padding:0 4px">…</span>`;
      }
    }
    html += `<button ${page === totalPages ? 'disabled' : ''} data-pg="${page + 1}" class="btn" style="padding:4px 10px">›</button>`;
    btns.innerHTML = html;
    btns.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => { page = parseInt(btn.dataset.pg, 10); renderList(); renderPaginator(); });
    });
  }

  function openDetailPanel(p) {
    detailProduct = p;
    container.querySelector('#sp-detail-name').textContent = p.name;
    container.querySelector('#sp-detail-sku').textContent = p.code ? `Mã: ${p.code}` : '';
    container.querySelector('#sp-detail-body').innerHTML = `
      <div class="pform-card" style="margin-bottom:12px">
        <h4 style="margin:0 0 10px;font-size:13px;color:#888">THÔNG TIN CHUNG</h4>
        ${p.image_path ? `<img src="${escapeHtml(resolveImg(p.image_path))}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin-bottom:10px" />` : ''}
        <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;font-size:13px">
          <span style="color:#888">Danh mục</span><span>${escapeHtml(p.category || '—')}</span>
          <span style="color:#888">Đơn vị</span><span>${escapeHtml(p.unit || '—')}</span>
          <span style="color:#888">Mã vạch</span><span>${escapeHtml(p.barcode || '—')}</span>
          <span style="color:#888">Trạng thái</span><span style="color:${p.selling ? 'var(--primary,#16a34a)' : '#c00'}">${p.selling ? 'Còn hàng' : 'Ngừng bán'}</span>
        </div>
      </div>
      <div class="pform-card" style="margin-bottom:12px">
        <h4 style="margin:0 0 10px;font-size:13px;color:#888">GIÁ BÁN &amp; GIÁ VỐN</h4>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;font-size:13px">
          <span style="color:#888">Giá bán</span><span style="font-weight:600">${formatVND(p.price)}</span>
          <span style="color:#888">Giá vốn</span><span>${p.cost_price ? formatVND(p.cost_price) : '—'}</span>
        </div>
      </div>
      ${p.track_stock ? `
      <div class="pform-card">
        <h4 style="margin:0 0 10px;font-size:13px;color:#888">TỒN KHO</h4>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:6px;font-size:13px">
          <span style="color:#888">Tồn hiện tại</span><span style="font-weight:600;color:${p.low_stock ? '#c00' : 'inherit'}">${p.on_hand} ${escapeHtml(p.unit || '')}</span>
          <span style="color:#888">Định mức</span><span>${p.min_stock ?? 0}</span>
        </div>
      </div>` : '<p class="hint" style="margin-top:8px">Chưa bật theo dõi tồn kho</p>'}`;

    const panel = container.querySelector('#sp-detail');
    panel.style.display = 'block';
    requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });
  }

  // ─── Row kebab menu ─────────────────────────────────────────────────────────
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const p = data.items.find((x) => x.id === btn.dataset.menu);
    if (!p) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Sửa sản phẩm</button>
      <button type="button" role="menuitem" data-act="variants">${icon('nhom-tuy-chon')} Phân loại</button>
      <button type="button" role="menuitem" data-act="units">${icon('ton-kho')} Đơn vị quy đổi</button>
      <button type="button" role="menuitem" class="danger" data-act="del">${icon('xoa')} Xoá</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const openUp = r.bottom + menu.offsetHeight + 8 > window.innerHeight;
    menu.style.top  = `${(openUp ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if      (act.dataset.act === 'edit')     openForm(p);
      else if (act.dataset.act === 'variants') openVariantForm(p);
      else if (act.dataset.act === 'units')    openUnitForm(p);
      else                                     removeProduct(p);
    });
  }
  document.addEventListener('click', closeRowMenu);

  // ─── Shared row-editor (Phân loại / Đơn vị quy đổi) ───────────────────────
  function openRowEditor({ title, hint, product, columns, blankRow, loadUrl, saveUrl, payloadKey }) {
    let rows = [];
    const modal = openModal(`
      <h3>${escapeHtml(title)} — ${escapeHtml(product.name)}</h3>
      <p class="hint">${escapeHtml(hint)}</p>
      <div id="rw-rows"><p>Đang tải…</p></div>
      <button id="rw-add" type="button" class="btn" style="width:100%;margin-top:4px">+ Thêm dòng</button>
      <button id="rw-save" class="btn btn-primary" style="width:100%;margin-top:12px">Lưu</button>
    `);

    function renderRows() {
      const box = modal.overlay.querySelector('#rw-rows');
      if (!rows.length) { box.innerHTML = '<p class="hint">Chưa có dòng nào.</p>'; return; }
      box.innerHTML = rows.map((r, i) => `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          ${columns.map((c) => c.type === 'bool'
            ? `<label style="display:flex;align-items:center;gap:4px;white-space:nowrap">
                 <input data-f="${c.key}" data-i="${i}" type="checkbox" style="width:auto;min-height:auto" ${r[c.key] ? 'checked' : ''} /> ${escapeHtml(c.label)}
               </label>`
            : `<input data-f="${c.key}" data-i="${i}" type="${c.type === 'number' ? 'number' : 'text'}"
                      ${c.step ? `step="${c.step}"` : ''} ${c.min !== undefined ? `min="${c.min}"` : ''}
                      placeholder="${escapeHtml(c.label)}" value="${escapeHtml(r[c.key] ?? '')}"
                      style="flex:${c.flex || 1};min-width:90px" />`).join('')}
          <button type="button" data-rm="${i}" style="color:#c00">Xoá</button>
        </div>`).join('');
      box.querySelectorAll('[data-f]').forEach((input) => {
        const i = Number(input.dataset.i), col = columns.find((c) => c.key === input.dataset.f);
        const apply = () => { rows[i][col.key] = col.type === 'bool' ? input.checked : col.type === 'number' ? (Number(input.value) || 0) : input.value; };
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      });
      box.querySelectorAll('[data-rm]').forEach((btn) => {
        btn.addEventListener('click', () => { rows.splice(Number(btn.dataset.rm), 1); renderRows(); });
      });
    }
    modal.overlay.querySelector('#rw-add').addEventListener('click', () => { rows.push({ ...blankRow }); renderRows(); });
    modal.overlay.querySelector('#rw-save').addEventListener('click', async () => {
      try { await api.put(saveUrl, { [payloadKey]: rows }); toast('Đã lưu'); modal.close(); }
      catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
    (async () => {
      try { const res = await api.get(loadUrl); rows = (res[payloadKey] || []).map((r) => ({ ...r })); }
      catch { rows = []; }
      renderRows();
    })();
  }

  function openVariantForm(p) {
    openRowEditor({
      title: 'Phân loại sản phẩm', product: p,
      hint: 'Các phiên bản khác nhau của cùng một món (VD Kích cỡ: Lớn / Nhỏ). Giá là GIÁ BÁN TRỌN GÓI, không cộng thêm giá gốc.',
      columns: [
        { key: 'attr_name', label: 'Nhóm (VD Kích cỡ)', type: 'text', flex: 2 },
        { key: 'name',      label: 'Tên (VD Lớn)',       type: 'text', flex: 2 },
        { key: 'price',     label: 'Giá bán',            type: 'number', min: 0 },
        { key: 'cost_price',label: 'Giá vốn',            type: 'number', min: 0 },
        { key: 'in_stock',  label: 'Còn',                type: 'bool' },
      ],
      blankRow: { attr_name: 'Phân loại', name: '', price: 0, cost_price: 0, in_stock: true },
      loadUrl: `/api/mgr/products/${p.id}/variants`, saveUrl: `/api/mgr/products/${p.id}/variants`, payloadKey: 'variants',
    });
  }

  function openUnitForm(p) {
    openRowEditor({
      title: 'Đơn vị quy đổi', product: p,
      hint: `Đơn vị cơ bản: "${p.unit || '(chưa đặt)'}". Khai đơn vị lớn (VD 1 Lốc = 6 Lon).`,
      columns: [
        { key: 'name',    label: 'Tên (VD Lốc)', type: 'text', flex: 2 },
        { key: 'factor',  label: `Bằng bao nhiêu ${p.unit || 'đơn vị'}`, type: 'number', step: '0.001', min: 0 },
        { key: 'price',   label: 'Giá bán', type: 'number', min: 0 },
        { key: 'barcode', label: 'Mã vạch', type: 'text', flex: 2 },
      ],
      blankRow: { name: '', factor: 1, price: 0, barcode: '' },
      loadUrl: `/api/mgr/products/${p.id}/units`, saveUrl: `/api/mgr/products/${p.id}/units`, payloadKey: 'units',
    });
  }

  // ─── Create / Edit product form ─────────────────────────────────────────────
  function openForm(p) {
    const isNew = !p;
    const cur = p || { name: '', price: 0, cost_price: null, category: '', unit: '', barcode: '', code: '', track_stock: false, min_stock: 0, visible: true, availability: 'available', image_path: '' };
    const catOptions = categories.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
    const outOfStock = cur.availability === 'unavailable';
    const modal = openModal(`
      <header class="pform-head"><b>${isNew ? 'Tạo sản phẩm mới' : 'Sửa sản phẩm'}</b>
        <button type="button" class="pform-x" id="sp-x" aria-label="Đóng">×</button></header>
      <div class="pform-body">
        <div class="pform-col">
          <section class="pform-card"><h4>Thông tin chung</h4>
            <div class="pform-grid">
              <div class="field pform-span2"><label>Tên sản phẩm <i class="req">*</i></label>
                <input id="sp-name" type="text" value="${escapeHtml(cur.name)}" placeholder="Ví dụ: Cơm sườn nướng" /></div>
              <div class="field"><label>Đơn vị</label>
                <input id="sp-unit" type="text" value="${escapeHtml(cur.unit || '')}" placeholder="Ví dụ: Lon" /></div>
              <div class="field"><label>Danh mục</label>
                <input id="sp-cat-in" type="text" list="sp-cat-list2" value="${escapeHtml(cur.category || '')}" placeholder="Chọn hoặc nhập mới" />
                <datalist id="sp-cat-list2">${catOptions}</datalist></div>
              <div class="field"><label>Mã sản phẩm (SKU)</label>
                <input id="sp-code" type="text" value="${escapeHtml(cur.code || '')}" placeholder="Hệ thống tự cấp" readonly /></div>
              <div class="field"><label>Mã vạch sản xuất</label>
                <input id="sp-barcode" type="text" value="${escapeHtml(cur.barcode || '')}" /></div>
            </div>
          </section>
          <section class="pform-card"><h4>Giá sản phẩm</h4>
            <div class="pform-grid">
              <div class="field"><label>Giá bán <i class="req">*</i></label>
                <input id="sp-price" type="number" min="0" step="1000" value="${Number(cur.price) || 0}" /></div>
              <div class="field"><label>Giá vốn</label>
                <input id="sp-cost" type="number" value="${Number(cur.cost_price) || 0}" readonly /></div>
            </div>
            <p class="hint">Giá vốn sửa ở màn <a href="#/gia-von">Giá vốn</a>.</p>
          </section>
          <section class="pform-card"><h4>Đơn vị quy đổi</h4>
            <p class="hint">${isNew ? 'Lưu món trước rồi mở lại để khai đơn vị lớn hơn.' : `Đơn vị gốc: <b>${escapeHtml(cur.unit || 'chưa đặt')}</b>.`}</p>
            ${isNew ? '' : '<button type="button" class="pform-link" id="sp-go-units">+ Đơn vị quy đổi</button>'}
          </section>
          <section class="pform-card"><h4>Phân loại sản phẩm</h4>
            <p class="hint">${isNew ? 'Lưu món trước rồi mở lại để thêm phân loại.' : 'Phiên bản khác nhau (kích cỡ, khẩu phần…).'}</p>
            ${isNew ? '' : '<button type="button" class="pform-link" id="sp-go-variants">+ Thêm phân loại</button>'}
          </section>
        </div>
        <div class="pform-col pform-col-side">
          <section class="pform-card"><h4>Ảnh sản phẩm</h4>
            <div class="pform-img pform-drop" id="sp-img-box" role="button" tabindex="0" aria-label="Kéo thả hoặc bấm để chọn ảnh">
              <input type="file" id="sp-img-file" accept="image/png,image/jpeg" hidden />
              <img id="sp-img-preview" alt="" ${cur.image_path ? `src="${escapeHtml(resolveImg(cur.image_path))}"` : 'hidden'} />
              <span class="pform-img-empty" id="sp-img-empty" ${cur.image_path ? 'hidden' : ''}>
                <b>Kéo &amp; thả ảnh vào đây</b>
                <small>hoặc bấm · PNG/JPG · min 500×500</small>
              </span>
            </div>
            <p class="pform-img-note hidden" id="sp-img-note"></p>
            <details class="pform-img-url">
              <summary>Hoặc dán đường dẫn ảnh</summary>
              <input id="sp-img" type="text" value="${escapeHtml(cur.image_path || '')}" placeholder="https://… hoặc assets/img/…" />
            </details>
          </section>
          <section class="pform-card pform-switches">
            <div class="pform-row"><span>Tình trạng</span>
              <div class="seg" id="sp-avail">
                <button type="button" class="seg-btn ${outOfStock ? '' : 'active'}" data-avail="available">Còn hàng</button>
                <button type="button" class="seg-btn ${outOfStock ? 'active' : ''}" data-avail="unavailable">Hết hàng</button>
              </div></div>
            <div class="pform-row"><span>Theo dõi số lượng tồn kho</span>
              <label class="sw"><input id="sp-track" type="checkbox" ${cur.track_stock ? 'checked' : ''} /><i></i></label></div>
            <div class="field pform-min ${cur.track_stock ? '' : 'hidden'}" id="sp-min-wrap">
              <label>Định mức tồn tối thiểu</label>
              <input id="sp-min" type="number" step="0.001" min="0" value="${cur.min_stock}" /></div>
            <div class="pform-row"><span>Hiển thị trên thực đơn</span>
              <label class="sw"><input id="sp-visible" type="checkbox" ${cur.visible !== false ? 'checked' : ''} /><i></i></label></div>
            <p class="hint">Món nấu tại chỗ dùng Nguyên vật liệu + Công thức thay thế.</p>
          </section>
        </div>
      </div>
      <footer class="pform-foot">
        <button type="button" class="btn btn-ghost" id="sp-cancel">Huỷ</button>
        <button type="button" class="btn btn-primary" id="sp-save">${isNew ? 'Xác nhận' : 'Lưu'}</button>
      </footer>`);
    modal.overlay.querySelector('.modal-box').classList.add('pform-box');

    let availability = outOfStock ? 'unavailable' : 'available';
    modal.overlay.querySelectorAll('#sp-avail .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        availability = b.dataset.avail;
        modal.overlay.querySelectorAll('#sp-avail .seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.avail === availability));
      });
    });
    const trackEl = modal.overlay.querySelector('#sp-track');
    trackEl.addEventListener('change', () => { modal.overlay.querySelector('#sp-min-wrap').classList.toggle('hidden', !trackEl.checked); });

    const imgEl = modal.overlay.querySelector('#sp-img');
    const previewEl = modal.overlay.querySelector('#sp-img-preview');
    const emptyEl = modal.overlay.querySelector('#sp-img-empty');
    imgEl.addEventListener('input', () => {
      const v = imgEl.value.trim(); pendingFile = null;
      if (v) { previewEl.src = resolveImg(v); previewEl.hidden = false; emptyEl.hidden = true; }
      else   { previewEl.removeAttribute('src'); previewEl.hidden = true; emptyEl.hidden = false; }
    });
    previewEl.addEventListener('error', () => { previewEl.hidden = true; emptyEl.hidden = false; });

    let pendingFile = null;
    const dropEl = modal.overlay.querySelector('#sp-img-box');
    const fileEl = modal.overlay.querySelector('#sp-img-file');
    const noteEl = modal.overlay.querySelector('#sp-img-note');
    function note(msg, isError) { noteEl.textContent = msg || ''; noteEl.classList.toggle('hidden', !msg); noteEl.classList.toggle('err', Boolean(isError)); }
    function readSize(file) { return new Promise((resolve) => { const url = URL.createObjectURL(file), probe = new Image(); probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight, url }); probe.onerror = () => { URL.revokeObjectURL(url); resolve(null); }; probe.src = url; }); }
    async function pickFile(file) {
      if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.type)) { note('Chỉ nhận ảnh PNG hoặc JPG.', true); return; }
      const size = await readSize(file);
      if (!size) { note('Không đọc được tệp ảnh.', true); return; }
      if (size.w < 500 || size.h < 500) { URL.revokeObjectURL(size.url); note(`Ảnh phải tối thiểu 500×500 (ảnh vừa chọn ${size.w}×${size.h}).`, true); return; }
      pendingFile = file; previewEl.src = size.url; previewEl.hidden = false; emptyEl.hidden = true;
      note(`Đã chọn "${file.name}" (${size.w}×${size.h}) — tải lên khi bấm Lưu.`);
    }
    dropEl.addEventListener('click', () => fileEl.click());
    dropEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); } });
    fileEl.addEventListener('change', () => pickFile(fileEl.files?.[0]));
    ['dragenter', 'dragover'].forEach((ev) => dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove('dragover'); }));
    dropEl.addEventListener('drop', (e) => pickFile(e.dataTransfer?.files?.[0]));

    async function uploadImage(productId, file) {
      const res = await fetch(`${getApiBase()}/api/mgr/products/${productId}/image`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || 'Không tải được ảnh');
      return body;
    }

    if (!isNew) {
      modal.overlay.querySelector('#sp-go-units').addEventListener('click', () => { modal.close(); openUnitForm(p); });
      modal.overlay.querySelector('#sp-go-variants').addEventListener('click', () => { modal.close(); openVariantForm(p); });
    }
    modal.overlay.querySelector('#sp-x').addEventListener('click', modal.close);
    modal.overlay.querySelector('#sp-cancel').addEventListener('click', modal.close);
    modal.overlay.querySelector('#sp-save').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sp-name').value.trim();
      if (!name) { toast('Chưa nhập tên món', 'error'); return; }
      const payload = { name, price: Number(modal.overlay.querySelector('#sp-price').value) || 0, category: modal.overlay.querySelector('#sp-cat-in').value.trim(), unit: modal.overlay.querySelector('#sp-unit').value.trim(), barcode: modal.overlay.querySelector('#sp-barcode').value.trim(), visible: modal.overlay.querySelector('#sp-visible').checked, availability, image_path: imgEl.value.trim(), track_stock: trackEl.checked, min_stock: Number(modal.overlay.querySelector('#sp-min').value) || 0 };
      try {
        let productId = p?.id;
        if (isNew) { const res = await api.post('/api/mgr/products', payload); productId = res?.product?.id; }
        else await api.patch(`/api/mgr/products/${p.id}`, payload);
        if (pendingFile && productId) { try { await uploadImage(productId, pendingFile); } catch (upErr) { toast(upErr.message || 'Lưu món nhưng chưa tải được ảnh', 'error'); } }
        toast(isNew ? 'Đã tạo món mới' : 'Đã lưu'); modal.close();
        await loadCategories(); await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ─── Remove product ─────────────────────────────────────────────────────────
  async function removeProduct(p) {
    if (!p) return;
    if (!(await confirmDialog(`Xoá món "${p.name}"?\n\nMón sẽ biến mất khỏi thực đơn. Hoá đơn cũ giữ nguyên.`))) return;
    try {
      await api.del(`/api/mgr/products/${p.id}`);
      toast('Đã xoá món'); selected.delete(p.id);
      if (detailProduct?.id === p.id) closeDetail();
      await load(); renderBulkBar();
    } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
  }

  async function bulkTrack(on) {
    try {
      const res = await api.patch('/api/mgr/products/track-stock', { menu_ids: [...selected], track_stock: on });
      toast(`Đã ${on ? 'bật' : 'tắt'} theo dõi kho cho ${res.updated} món`);
      selected.clear(); await load();
    } catch (err) { toast(err?.body?.message || 'Không cập nhật được', 'error'); }
  }

  function openBarcodeDialog() {
    const modal = openModal(`
      <h3>In mã vạch — ${selected.size} món</h3>
      <div class="field"><label>Khổ tem</label>
        <select id="bc-size">
          <option value="50x30">50 × 30 mm (phổ biến)</option>
          <option value="35x22">35 × 22 mm (nhỏ)</option>
          <option value="70x40">70 × 40 mm (lớn)</option>
        </select></div>
      <div class="field"><label>Số tem mỗi món</label>
        <input id="bc-copies" type="number" min="1" max="50" value="1" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="bc-price" type="checkbox" style="width:auto;min-height:auto" checked /> In kèm giá bán
      </label>
      <p class="hint">Món không có mã vạch sẽ dùng tạm mã món.</p>
      <button id="bc-go" class="btn btn-primary" style="width:100%">Mở trang in</button>`);
    modal.overlay.querySelector('#bc-go').addEventListener('click', () => {
      const params = new URLSearchParams({ ids: [...selected].join(','), size: modal.overlay.querySelector('#bc-size').value, copies: modal.overlay.querySelector('#bc-copies').value || '1', price: modal.overlay.querySelector('#bc-price').checked ? '1' : '0' });
      window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?${params}`, '_blank');
      modal.close();
    });
  }

  // ─── Data loading ───────────────────────────────────────────────────────────
  async function loadCategories() {
    try {
      const res = await api.get('/api/mgr/products/categories');
      categories = res.categories || [];
    } catch { /* ignore */ }
  }

  async function load() {
    const params = new URLSearchParams({ tab: state.tab, limit: '300' });
    if (state.q)        params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    try {
      data = await api.get(`/api/mgr/products?${params}`);
      renderTabs();
      renderKpi();
      renderList();
      renderPaginator();
      renderBulkBar();
    } catch {
      container.querySelector('#sp-tbody').innerHTML = '<tr><td colspan="10"><p>Không tải được danh sách sản phẩm.</p></td></tr>';
    }
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  renderTableHead();
  await loadCategories();
  await load();
}
