// Đợt 6 (17/08/2026) — Sổ nhập hàng (MÀN MỚI, tách từ nhap-xuat-kho.js cũ theo ảnh mẫu Website
// v2\Quản lý kho\Sổ nhập hàng). Danh sách PHIẾU (không phải dòng di chuyển kho lẻ — đó là Sổ kho).
// Modal "Tạo phiếu nhập hàng": nhiều dòng sản phẩm/NVL, giảm giá + thuế từng dòng, chọn nhà cung
// cấp, giảm giá + chi phí phát sinh toàn phiếu, thanh toán hoặc ghi nợ (nối Sổ nợ/Sổ quỹ có sẵn).
// Backend: stock-document-service.js qua /api/mgr/stock/documents.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, promptDialog } from '../ui.js';
import { icon } from '../icons.js';

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem sổ nhập hàng.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { tab: '', q: '', supplier_id: '', item_type: '', payment_filter: '' };
  let data = { documents: [], total: 0 };
  let suppliers = [];
  let page = 1; let PAGE_SIZE = 30;
  function _todayStr() { return new Date().toISOString().slice(0,10); }
  function _fomStr() { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
  const dateState = { from: _fomStr(), to: _todayStr(), label: 'Đầu tháng đến nay' };

  const DATE_PRESETS = [
    { label: 'Hôm nay', key: 'today' },
    { label: '7 ngày qua', key: '7d' },
    { label: '30 ngày gần nhất', key: '30d' },
    { label: '90 ngày qua', key: '90d' },
    { label: 'Tháng trước', key: 'lastmonth' },
    { label: 'Đầu tuần đến nay', key: 'week' },
    { label: 'Đầu tháng đến nay', key: 'month' },
  ];
  function applyDatePreset(key) {
    const now = new Date(); const y=now.getFullYear(),m=now.getMonth(),day=now.getDate();
    let from,to=_todayStr(),label='';
    if(key==='today'){from=_todayStr();label='Hôm nay';}
    else if(key==='7d'){const d=new Date(now);d.setDate(day-6);from=d.toISOString().slice(0,10);label='7 ngày qua';}
    else if(key==='30d'){const d=new Date(now);d.setDate(day-29);from=d.toISOString().slice(0,10);label='30 ngày gần nhất';}
    else if(key==='90d'){const d=new Date(now);d.setDate(day-89);from=d.toISOString().slice(0,10);label='90 ngày qua';}
    else if(key==='lastmonth'){const d=new Date(y,m-1,1);const e=new Date(y,m,0);from=d.toISOString().slice(0,10);to=e.toISOString().slice(0,10);label='Tháng trước';}
    else if(key==='week'){const d=new Date(now);d.setDate(day-now.getDay());from=d.toISOString().slice(0,10);label='Đầu tuần đến nay';}
    else{from=_fomStr();label='Đầu tháng đến nay';}
    Object.assign(dateState,{from,to,label});
    container.querySelector('#nh-date-label').textContent=label;
    container.querySelector('#nh-date-drop').hidden=true;
    page=1; load();
  }

  container.innerHTML = `
    <div class="page-head">
      <h2>Sổ nhập hàng</h2>
      <div style="display:flex;gap:8px">
        <button id="nh-thao-tac" class="btn">Thao tác ▾</button>
        ${canManage ? '<button id="nh-new" class="btn btn-primary">+ Tạo nhập hàng</button>' : ''}
      </div>
    </div>

    <div class="sbh-card">
      <div class="sbh-card-tools">
        <input id="nh-q" class="sbh-card-search" type="search" placeholder="Tìm mã phiếu" />
        <div class="sbh-tools-right">
          <div style="position:relative">
            <button id="nh-date-btn" class="btn" style="white-space:nowrap;color:var(--primary,#16a34a);border-color:var(--primary,#16a34a)"><span id="nh-date-label">Đầu tháng đến nay</span> ▾</button>
            <div id="nh-date-drop" hidden style="position:absolute;top:calc(100% + 4px);left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:170px;z-index:200;padding:6px;box-shadow:0 4px 16px rgba(0,0,0,.15)">
              ${DATE_PRESETS.map(p=>`<button type="button" class="nh-preset" data-pk="${p.key}" style="display:block;width:100%;text-align:left;padding:7px 10px;background:none;border:none;cursor:pointer;border-radius:4px;font-size:13px">${p.label}</button>`).join('')}
            </div>
          </div>
          <div style="position:relative">
            <button id="nh-supp-btn" class="btn">Nhà cung cấp ▾</button>
            <div id="nh-supp-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:200px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px;max-height:240px;overflow-y:auto">
              <div id="nh-supp-list"><p class="hint">Đang tải…</p></div>
            </div>
          </div>
          <select id="nh-type-sel" style="height:34px;padding:0 8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;background:var(--card-bg,#fff)">
            <option value="">Loại hàng</option>
            <option value="product">Sản phẩm</option>
            <option value="ingredient">Nguyên vật liệu</option>
          </select>
          <select id="nh-pay-sel" style="height:34px;padding:0 8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;background:var(--card-bg,#fff)">
            <option value="">Tình trạng TT</option>
            <option value="unpaid">Chưa thanh toán</option>
            <option value="partial">Một phần</option>
            <option value="paid">Đã thanh toán</option>
          </select>
          <div style="position:relative">
            <button id="nh-col-btn" class="btn pm-col-btn ord-cols-icon" title="Hiển thị cột">${icon('cot-hien-thi')}</button>
          </div>
        </div>
      </div>

      <div class="tab-row" id="nh-tabs" style="margin:0;padding:0 14px;border-bottom:1px solid var(--border,#eee)"></div>

      <div style="overflow-x:auto">
        <table class="sp-table" id="nh-table" style="width:100%;min-width:640px;border-radius:0">
          <thead><tr>
            <th>MÃ PHIẾU</th><th>NGÀY</th><th>NHÀ CUNG CẤP</th><th>TRẠNG THÁI</th>
            <th>TÌNH TRẠNG THANH TOÁN</th><th style="width:110px">TỔNG TIỀN</th>
            ${canManage ? '<th style="width:48px"></th>' : ''}
          </tr></thead>
          <tbody id="nh-tbody"><tr><td colspan="7">Đang tải…</td></tr></tbody>
        </table>
      </div>
      <div id="nh-pager"></div>
    </div>
  `;

  let searchTimer = null;
  container.querySelector('#nh-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#nh-thao-tac').addEventListener('click', () => toast('Tính năng đang phát triển', 'info'));
  if (canManage) container.querySelector('#nh-new').addEventListener('click', () => openCreateModal());

  const suppBtn = container.querySelector('#nh-supp-btn');
  const suppDrop = container.querySelector('#nh-supp-drop');
  suppBtn.addEventListener('click', (e) => { e.stopPropagation(); suppDrop.hidden = !suppDrop.hidden; });
  document.addEventListener('click', () => { suppDrop.hidden = true; });

  const dateDrop = container.querySelector('#nh-date-drop');
  container.querySelector('#nh-date-btn').addEventListener('click', (e) => { e.stopPropagation(); dateDrop.hidden = !dateDrop.hidden; });
  dateDrop.addEventListener('click', (e) => {
    const btn = e.target.closest('.nh-preset'); if (btn) applyDatePreset(btn.dataset.pk);
  });
  container.querySelector('#nh-type-sel').addEventListener('change', (e) => { state.item_type = e.target.value; page=1; load(); });
  container.querySelector('#nh-pay-sel').addEventListener('change', (e) => { state.payment_filter = e.target.value; page=1; load(); });

  function renderTabs() {
    container.querySelector('#nh-tabs').innerHTML = STATUS_TABS.map((t) => `
      <button class="tab ${t.value === state.tab ? 'active' : ''}" data-tab="${t.value}">${escapeHtml(t.label)}</button>
    `).join('');
    container.querySelectorAll('#nh-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; load(); });
    });
  }

  function renderSupplierFilter() {
    container.querySelector('#nh-supp-list').innerHTML = suppliers.length
      ? suppliers.map((s) => `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer">
          <input type="radio" name="nh-supp" data-supp="${s.id}" ${String(state.supplier_id) === String(s.id) ? 'checked' : ''} style="width:auto;min-height:auto" /> ${escapeHtml(s.name)}
        </label>`).join('') + `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer">
          <input type="radio" name="nh-supp" data-supp="" ${!state.supplier_id ? 'checked' : ''} style="width:auto;min-height:auto" /> Tất cả
        </label>`
      : '<p class="hint">Chưa có nhà cung cấp nào.</p>';
    container.querySelectorAll('[data-supp]').forEach((r) => {
      r.addEventListener('change', () => { state.supplier_id = r.dataset.supp; load(); });
    });
  }

  function renderList() {
    const tbody = container.querySelector('#nh-tbody');
    const pagerEl = container.querySelector('#nh-pager');
    if (!data.documents.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#999">Không tìm thấy kết quả phù hợp</td></tr>';
      if (pagerEl) pagerEl.innerHTML = '';
      return;
    }
    const all = data.documents;
    const total = all.length;
    const from = (page-1)*PAGE_SIZE+1;
    const to = Math.min(page*PAGE_SIZE,total);
    const paged = all.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

    tbody.innerHTML = paged.map((d) => `
      <tr class="${d.status === 'cancelled' ? 'row-inactive' : ''}">
        <td style="font-weight:500">${escapeHtml(d.code)}</td>
        <td><div>${escapeHtml(String(d.created_at).slice(0, 10).split('-').reverse().join('/'))}</div>
          <div style="font-size:12px;color:#888">${escapeHtml(String(d.created_at).slice(11, 16))}</div></td>
        <td>${escapeHtml(d.supplier_name || 'Khách lẻ')}</td>
        <td><span class="badge-${d.status === 'completed' ? 'ok' : d.status === 'cancelled' ? 'warn' : 'default'}">${escapeHtml(d.status_label)}</span></td>
        <td><span class="badge-${d.payment_status === 'paid' ? 'ok' : d.payment_status === 'partial' ? 'default' : 'warn'}">${escapeHtml(d.payment_status_label || '—')}</span></td>
        <td style="font-weight:500">${formatVND(d.total_amount)}</td>
        ${canManage ? `<td class="dm-act"><div class="dm-kebab-wrap">
          <button class="ord-kebab" data-menu="${d.id}" aria-label="Thao tác">${icon('them')}</button>
          <div class="row-menu dm-kebab-menu hidden" role="menu">
            <button type="button" role="menuitem" data-act="view" data-id="${d.id}">Xem chi tiết</button>
            ${d.status !== 'cancelled' ? `<button type="button" role="menuitem" class="danger" data-act="void" data-id="${d.id}">Xoá phiếu</button>` : ''}
          </div>
        </div></td>` : ''}
      </tr>`).join('');

    if (pagerEl) pagerEl.innerHTML = `<div class="ord-pager">
      <span style="color:var(--text-2,#888);font-size:13px">Hiển thị ${from}-${to} / ${total} kết quả</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2,#888)">Hiển thị dòng</span>
        <select id="nh-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px">
          ${[10,20,30,50].map(n=>`<option value="${n}" ${n===PAGE_SIZE?'selected':''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" data-pg="prev" ${page<=1?'disabled':''}>&#8249;</button>
        <span class="ord-page-cur">${page} / ${Math.max(1,Math.ceil(total/PAGE_SIZE))}</span>
        <button class="ord-page-btn" data-pg="next" ${page>=Math.ceil(total/PAGE_SIZE)?'disabled':''}>&#8250;</button>
      </div>
    </div>`;

    if (canManage) {
      const closeAll = () => tbody.querySelectorAll('.dm-kebab-menu').forEach(m => m.classList.add('hidden'));
      tbody.querySelectorAll('.ord-kebab[data-menu]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAll(); menu.classList.toggle('hidden', !willOpen);
        });
      });
      document.addEventListener('click', closeAll);
      tbody.querySelectorAll('[data-act="view"]').forEach(btn => {
        const d = data.documents.find(x => String(x.id) === btn.dataset.id);
        if (d) btn.addEventListener('click', () => { closeAll(); openDetailModal(d.id); });
      });
      tbody.querySelectorAll('[data-act="void"]').forEach(btn => {
        const d = data.documents.find(x => String(x.id) === btn.dataset.id);
        if (d) btn.addEventListener('click', async () => { closeAll(); await voidDocument(d); });
      });
    }
    if (pagerEl) pagerEl.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pg==='prev'&&page>1){page--;renderList();}
        else if(btn.dataset.pg==='next'&&page<Math.ceil(total/PAGE_SIZE)){page++;renderList();}
      });
    });
  }

  let openMenuEl = null;
  function closeRowMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
  function openRowMenu(btn) {
    const d = data.documents.find((x) => String(x.id) === btn.dataset.menu);
    if (!d) return;
    closeRowMenu();
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.innerHTML = `
      <button type="button" data-act="view">Xem chi tiết</button>
      ${d.status !== 'cancelled' ? '<button type="button" class="danger" data-act="void">Xoá phiếu</button>' : ''}`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4 + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    openMenuEl = menu;
    menu.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'view') openDetailModal(d.id);
      else await voidDocument(d);
    });
  }
  document.addEventListener('click', closeRowMenu);

  async function voidDocument(d) {
    if (!(await confirmDialog(`Xoá phiếu ${d.code}? Kho và sổ quỹ/sổ nợ liên quan sẽ được hoàn lại.`))) return;
    const reason = await promptDialog('Lý do xoá phiếu:', { value: 'Ghi nhầm' });
    if (reason === null) return;
    try {
      await api.post(`/api/mgr/stock/documents/${d.id}/void`, { reason });
      toast('Đã xoá phiếu');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được phiếu', 'error');
    }
  }

  async function openDetailModal(id) {
    const modal = openModal('<p>Đang tải…</p>');
    try {
      const { document: d } = await api.get(`/api/mgr/stock/documents/${id}`);
      modal.overlay.querySelector('.modal-box').innerHTML = `
        <h3>${escapeHtml(d.code)} — ${escapeHtml(d.status_label)}</h3>
        <p class="hint">Nhà cung cấp: ${escapeHtml(d.supplier_name || 'Khách lẻ')} · ${escapeHtml(String(d.created_at).slice(0, 16).replace('T', ' '))}</p>
        <div class="stock-table">
          <div class="stock-table-head"><span>Món</span><span>SL</span><span>Đơn giá</span><span>Thành tiền</span></div>
          ${d.items.map((it) => `<div class="stock-table-row">
            <span>${escapeHtml(it.name)}${it.item_type === 'ingredient' ? ' <span class="badge-default" style="font-size:10px">NVL</span>' : ''}</span>
            <span>${it.qty}${it.unit ? ' ' + escapeHtml(it.unit) : ''}</span>
            <span>${formatVND(it.unit_cost)}</span>
            <span>${formatVND(it.line_total)}</span>
          </div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:4px;margin-top:12px;font-size:14px">
          <span>Tổng tiền hàng</span><span>${formatVND(d.subtotal)}</span>
          <span>Giảm giá</span><span>−${formatVND(d.discount_amount)}</span>
          <span>Chi phí phát sinh</span><span>+${formatVND(d.extra_cost)}</span>
          <span style="font-weight:600">Tổng cuối</span><span style="font-weight:600">${formatVND(d.total_amount)}</span>
          <span>Đã trả</span><span>${formatVND(d.paid_amount)}</span>
          ${d.is_debt ? `<span>Còn nợ</span><span style="color:#c00">${formatVND(d.total_amount - d.paid_amount)}</span>` : ''}
        </div>
        ${d.note ? `<p class="hint" style="margin-top:8px">Ghi chú: ${escapeHtml(d.note)}</p>` : ''}
        <div style="margin-top:12px">
          <b style="font-size:13px">Ảnh đính kèm (${d.attachments.length}/3)</b>
          <div id="nh-attach-list" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            ${d.attachments.map((a) => `<img src="${escapeHtml(a)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--border,#ddd)" />`).join('')}
            ${canManage && d.attachments.length < 3 && d.status !== 'cancelled' ? '<button type="button" id="nh-attach-add" class="btn" style="width:64px;height:64px">+</button>' : ''}
          </div>
          <input type="file" id="nh-attach-file" accept="image/png,image/jpeg" hidden />
        </div>
      `;
      const addBtn = modal.overlay.querySelector('#nh-attach-add');
      if (addBtn) {
        const fileEl = modal.overlay.querySelector('#nh-attach-file');
        addBtn.addEventListener('click', () => fileEl.click());
        fileEl.addEventListener('change', async () => {
          const file = fileEl.files?.[0];
          if (!file) return;
          try {
            const { getApiBase } = await import('../api.js');
            const res = await fetch(`${getApiBase()}/api/mgr/stock/documents/${id}/attachments`, {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file,
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.message || 'Không tải được ảnh');
            toast('Đã thêm ảnh');
            modal.close();
            openDetailModal(id);
          } catch (err) { toast(err.message || 'Không tải được ảnh', 'error'); }
        });
      }
    } catch (err) {
      modal.overlay.querySelector('.modal-box').innerHTML = `<p>${escapeHtml(err?.body?.message || 'Không tải được phiếu')}</p>`;
    }
  }

  // ── Modal Tạo phiếu nhập hàng ────────────────────────────────────────────────
  async function openCreateModal() {
    const lines = []; // { item_type, id, name, unit, unit_price, qty, discount_amount, tax_percent }
    let supplierId = null;
    let paymentMethod = 'tien-mat';
    let isDebt = false;

    const modal = openModal(`
      <h3>Tạo phiếu nhập hàng</h3>
      <p class="hint" id="nh-cm-count">0 sản phẩm</p>
      <div class="tab-row" id="nh-cm-tabs">
        <button class="tab active" data-type="product">Sản phẩm</button>
        <button class="tab" data-type="ingredient">Nguyên vật liệu</button>
      </div>
      <input id="nh-cm-search" type="search" placeholder="Tìm tên sản phẩm, mã SKU…" />
      <div id="nh-cm-search-results" style="position:relative"></div>
      <div id="nh-cm-lines" style="margin-top:8px"></div>

      <div class="field" style="margin-top:12px"><label>Giảm giá (VND)</label>
        <input id="nh-cm-discount" type="number" min="0" step="1000" value="0" /></div>
      <div class="field"><label>Chi phí phát sinh (VND)</label>
        <input id="nh-cm-extra" type="number" min="0" step="1000" value="0" /></div>
      <div class="field"><label>Thanh toán</label>
        <select id="nh-cm-pay">
          <option value="tien-mat">Tiền mặt</option>
          <option value="chuyen-khoan">Chuyển khoản</option>
        </select></div>
      <div class="field"><label>Tiền trả nhà cung cấp</label>
        <input id="nh-cm-paid" type="number" min="0" step="1000" value="0" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:6px 0">
        <input id="nh-cm-debt" type="checkbox" style="width:auto;min-height:auto" /> Ghi nợ phần còn thiếu
      </label>
      <div id="nh-cm-total" class="today-card"></div>

      <div class="field"><label>Nhà cung cấp</label>
        <select id="nh-cm-supplier"><option value="">Khách lẻ / không chọn</option></select></div>
      <div class="field"><label>Ghi chú</label>
        <input id="nh-cm-note" type="text" placeholder="Không bắt buộc" /></div>

      <button id="nh-cm-submit" class="btn btn-primary" style="width:100%;margin-top:12px">Nhập hàng</button>
    `);

    let activeType = 'product';
    modal.overlay.querySelectorAll('#nh-cm-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeType = btn.dataset.type;
        modal.overlay.querySelectorAll('#nh-cm-tabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
        modal.overlay.querySelector('#nh-cm-search').value = '';
        modal.overlay.querySelector('#nh-cm-search-results').innerHTML = '';
      });
    });

    const searchEl = modal.overlay.querySelector('#nh-cm-search');
    const resultsEl = modal.overlay.querySelector('#nh-cm-search-results');
    let searchTimer2 = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer2);
      searchTimer2 = setTimeout(() => searchItems(searchEl.value.trim()), 250);
    });

    async function searchItems(q) {
      if (!q) { resultsEl.innerHTML = ''; return; }
      try {
        if (activeType === 'product') {
          const res = await api.get(`/api/mgr/stock/levels?q=${encodeURIComponent(q)}`);
          renderResults((res.items || []).map((p) => ({
            item_type: 'product', id: p.id, name: p.name, unit: p.unit, unit_price: p.cost_price || 0,
          })));
        } else {
          const res = await api.get(`/api/mgr/ingredients?q=${encodeURIComponent(q)}`);
          renderResults((res.items || []).map((i) => ({
            item_type: 'ingredient', id: i.id, name: i.name, unit: i.unit, unit_price: i.cost_price || 0,
          })));
        }
      } catch { resultsEl.innerHTML = ''; }
    }
    function renderResults(items) {
      if (!items.length) { resultsEl.innerHTML = '<p class="hint">Không tìm thấy.</p>'; return; }
      resultsEl.innerHTML = `<div class="row-menu" style="position:static;display:block;max-height:200px;overflow-y:auto">
        ${items.map((it) => `<button type="button" data-pick='${escapeHtml(JSON.stringify(it))}'>${escapeHtml(it.name)} — ${formatVND(it.unit_price)}</button>`).join('')}
      </div>`;
      resultsEl.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const it = JSON.parse(btn.dataset.pick);
          lines.push({ ...it, qty: 1, discount_amount: 0, tax_percent: 0 });
          searchEl.value = ''; resultsEl.innerHTML = '';
          renderLines();
        });
      });
    }

    function renderLines() {
      modal.overlay.querySelector('#nh-cm-count').textContent =
        `${lines.length} dòng · ${lines.filter((l) => l.item_type === 'product').length} sản phẩm · ${lines.filter((l) => l.item_type === 'ingredient').length} NVL`;
      const box = modal.overlay.querySelector('#nh-cm-lines');
      if (!lines.length) { box.innerHTML = '<p class="hint">Chưa chọn món nào.</p>'; renderTotal(); return; }
      box.innerHTML = `<div class="stock-table">
        <div class="stock-table-head"><span>Món</span><span>SL</span><span>Đơn giá</span><span>Giảm giá</span><span>Thuế %</span><span>Thành tiền</span><span></span></div>
        ${lines.map((l, i) => `<div class="stock-table-row" data-i="${i}">
          <span>${escapeHtml(l.name)}${l.item_type === 'ingredient' ? ' <span class="badge-default" style="font-size:10px">NVL</span>' : ''}</span>
          <span><input data-f="qty" data-i="${i}" type="number" min="0.001" step="0.001" value="${l.qty}" style="width:70px" /></span>
          <span><input data-f="unit_price" data-i="${i}" type="number" min="0" step="1000" value="${l.unit_price}" style="width:90px" /></span>
          <span><input data-f="discount_amount" data-i="${i}" type="number" min="0" step="1000" value="${l.discount_amount}" style="width:80px" /></span>
          <span><input data-f="tax_percent" data-i="${i}" type="number" min="0" step="1" value="${l.tax_percent}" style="width:60px" /></span>
          <span>${formatVND(lineTotal(l))}</span>
          <span><button type="button" data-rm="${i}" title="Xoá dòng">${icon('dong')}</button></span>
        </div>`).join('')}
      </div>`;
      box.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('input', () => {
          const i = Number(input.dataset.i);
          lines[i][input.dataset.f] = Number(input.value) || 0;
          renderLines();
        });
      });
      box.querySelectorAll('[data-rm]').forEach((btn) => {
        btn.addEventListener('click', () => { lines.splice(Number(btn.dataset.rm), 1); renderLines(); });
      });
      renderTotal();
    }

    function lineTotal(l) {
      const gross = Math.max(0, (l.qty || 0) * (l.unit_price || 0) - (l.discount_amount || 0));
      return Math.round(gross * (1 + (l.tax_percent || 0) / 100));
    }

    function renderTotal() {
      const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
      const discount = Number(modal.overlay.querySelector('#nh-cm-discount').value) || 0;
      const extra = Number(modal.overlay.querySelector('#nh-cm-extra').value) || 0;
      const total = Math.max(0, subtotal - discount + extra);
      const paidInput = modal.overlay.querySelector('#nh-cm-paid');
      if (!isDebt) paidInput.value = total;
      const paid = Number(paidInput.value) || 0;
      modal.overlay.querySelector('#nh-cm-total').innerHTML = `
        <div class="today-stats">
          <div class="today-stat"><span class="label">Tổng tiền hàng</span><span class="value">${formatVND(subtotal)}</span></div>
          <div class="today-stat"><span class="label">Tổng cuối</span><span class="value">${formatVND(total)}</span></div>
          <div class="today-stat"><span class="label">Còn nợ</span><span class="value">${formatVND(Math.max(0, total - paid))}</span></div>
        </div>`;
    }
    ['nh-cm-discount', 'nh-cm-extra', 'nh-cm-paid'].forEach((id) => {
      modal.overlay.querySelector(`#${id}`).addEventListener('input', renderTotal);
    });
    modal.overlay.querySelector('#nh-cm-debt').addEventListener('change', (e) => {
      isDebt = e.target.checked;
      if (isDebt) modal.overlay.querySelector('#nh-cm-paid').value = 0;
      renderTotal();
    });

    modal.overlay.querySelector('#nh-cm-supplier').addEventListener('change', (e) => {
      supplierId = e.target.value || null;
    });

    modal.overlay.querySelector('#nh-cm-submit').addEventListener('click', async () => {
      if (!lines.length) { toast('Chưa chọn món nào', 'error'); return; }
      const btn = modal.overlay.querySelector('#nh-cm-submit');
      btn.disabled = true;
      try {
        await api.post('/api/mgr/stock/documents', {
          direction: 'nhap',
          supplier_id: supplierId || null,
          discount_amount: Number(modal.overlay.querySelector('#nh-cm-discount').value) || 0,
          extra_cost: Number(modal.overlay.querySelector('#nh-cm-extra').value) || 0,
          payment_method: modal.overlay.querySelector('#nh-cm-pay').value,
          paid_amount: Number(modal.overlay.querySelector('#nh-cm-paid').value) || 0,
          is_debt: isDebt,
          note: modal.overlay.querySelector('#nh-cm-note').value.trim() || null,
          items: lines.map((l) => ({
            item_type: l.item_type,
            menu_id: l.item_type === 'product' ? l.id : undefined,
            ingredient_id: l.item_type === 'ingredient' ? l.id : undefined,
            qty: l.qty, unit_price: l.unit_price, discount_amount: l.discount_amount, tax_percent: l.tax_percent,
          })),
        });
        toast('Đã tạo phiếu nhập hàng');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được phiếu', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    renderLines();
    try {
      const res = await api.get('/api/mgr/ingredients/suppliers');
      const sel = modal.overlay.querySelector('#nh-cm-supplier');
      (res.suppliers || []).forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        sel.appendChild(opt);
      });
    } catch { /* nhà cung cấp không tải được — vẫn cho tạo phiếu không NCC */ }
  }

  async function loadSuppliers() {
    try { suppliers = (await api.get('/api/mgr/ingredients/suppliers')).suppliers || []; renderSupplierFilter(); } catch { /* */ }
  }

  async function load() {
    const params = new URLSearchParams({ direction: 'nhap', limit: '200' });
    if (state.q) params.set('q', state.q);
    if (state.supplier_id) params.set('supplier_id', state.supplier_id);
    if (state.item_type) params.set('item_type', state.item_type);
    if (state.payment_filter) params.set('payment_status', state.payment_filter);
    if (dateState.from) params.set('date_from', dateState.from);
    if (dateState.to) params.set('date_to', dateState.to);
    if (state.tab === 'unpaid') params.set('status', 'unpaid');
    else if (state.tab === 'processing') params.set('status', 'processing');
    else if (state.tab === 'completed') params.set('status', 'completed');
    else if (state.tab === 'cancelled') params.set('status', 'cancelled');
    try {
      data = await api.get(`/api/mgr/stock/documents?${params}`);
      renderTabs();
      page = 1;
      renderList();
    } catch (err) {
      container.querySelector('#nh-tbody').innerHTML = '<tr><td colspan="7">Khong tai duoc so nhap hang.</td></tr>';
    }
  }

  renderTabs();
  await loadSuppliers();
  await load();
}
