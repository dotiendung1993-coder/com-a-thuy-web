// Đợt 6 (17/08/2026) — Sổ xuất kho (MÀN MỚI, tách từ nhap-xuat-kho.js cũ theo ảnh mẫu Website
// v2\Quản lý kho\Sổ xuất kho). Danh sách PHIẾU xuất — khác Sổ nhập hàng: KHÔNG có nhà cung cấp/
// thanh toán (xuất kho là việc nội bộ), thay bằng cột Nhân viên.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, promptDialog } from '../ui.js';
import { icon } from '../icons.js';

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem sổ xuất kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { tab: '', q: '' };
  let data = { documents: [], total: 0 };

  container.innerHTML = `
    <div class="page-head">
      <h2>Sổ xuất kho</h2>
      <div style="display:flex;gap:8px">
        <button id="xk-thao-tac" class="btn">Thao tác ▾</button>
        ${canManage ? '<button id="xk-new" class="btn btn-primary">+ Tạo phiếu xuất</button>' : ''}
      </div>
    </div>

    <div class="filter-row">
      <input id="xk-q" type="search" placeholder="Tìm mã phiếu…" />
    </div>

    <div class="tab-row" id="xk-tabs"></div>

    <div style="overflow-x:auto">
      <table class="sp-table" id="xk-table" style="width:100%;min-width:560px">
        <thead><tr>
          <th>MÃ PHIẾU</th><th>NGÀY GIỜ</th><th>NHÂN VIÊN</th><th>TRẠNG THÁI</th>
          <th style="width:110px">TỔNG TIỀN</th>
          ${canManage ? '<th style="width:40px"></th>' : ''}
        </tr></thead>
        <tbody id="xk-tbody"><tr><td colspan="6">Đang tải…</td></tr></tbody>
      </table>
    </div>
  `;

  let searchTimer = null;
  container.querySelector('#xk-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#xk-thao-tac').addEventListener('click', () => toast('Tính năng đang phát triển', 'info'));
  if (canManage) container.querySelector('#xk-new').addEventListener('click', () => openCreateModal());

  function renderTabs() {
    container.querySelector('#xk-tabs').innerHTML = STATUS_TABS.map((t) => `
      <button class="tab ${t.value === state.tab ? 'active' : ''}" data-tab="${t.value}">${escapeHtml(t.label)}</button>
    `).join('');
    container.querySelectorAll('#xk-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; load(); });
    });
  }

  function renderList() {
    const tbody = container.querySelector('#xk-tbody');
    if (!data.documents.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#999">Không tìm thấy kết quả phù hợp</td></tr>';
      return;
    }
    tbody.innerHTML = data.documents.map((d) => `
      <tr class="${d.status === 'cancelled' ? 'row-inactive' : ''}">
        <td style="font-weight:500">${escapeHtml(d.code)}</td>
        <td><div>${escapeHtml(String(d.created_at).slice(0, 10).split('-').reverse().join('/'))}</div>
          <div style="font-size:12px;color:#888">${escapeHtml(String(d.created_at).slice(11, 16))}</div></td>
        <td>${escapeHtml(d.created_by_name || '—')}</td>
        <td><span class="badge-${d.status === 'completed' ? 'ok' : d.status === 'cancelled' ? 'warn' : 'default'}">${escapeHtml(d.status_label)}</span></td>
        <td style="font-weight:500">${formatVND(d.total_amount)}</td>
        ${canManage ? `<td><button class="ord-kebab" data-menu="${d.id}">⋯</button></td>` : ''}
      </tr>`).join('');
    tbody.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
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
    if (!(await confirmDialog(`Xoá phiếu ${d.code}? Kho sẽ được hoàn lại (cộng lại số đã xuất).`))) return;
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
        <p class="hint">${escapeHtml(d.created_by_name || '—')} · ${escapeHtml(String(d.created_at).slice(0, 16).replace('T', ' '))}</p>
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
          <span style="font-weight:600">Tổng tiền</span><span style="font-weight:600">${formatVND(d.total_amount)}</span>
        </div>
        ${d.note ? `<p class="hint" style="margin-top:8px">Ghi chú: ${escapeHtml(d.note)}</p>` : ''}
      `;
    } catch (err) {
      modal.overlay.querySelector('.modal-box').innerHTML = `<p>${escapeHtml(err?.body?.message || 'Không tải được phiếu')}</p>`;
    }
  }

  // ── Modal Tạo phiếu xuất ──────────────────────────────────────────────────────
  async function openCreateModal() {
    const lines = [];
    const modal = openModal(`
      <h3>Tạo phiếu xuất kho</h3>
      <p class="hint" id="xk-cm-count">0 sản phẩm</p>
      <div class="tab-row" id="xk-cm-tabs">
        <button class="tab active" data-type="product">Sản phẩm</button>
        <button class="tab" data-type="ingredient">Nguyên vật liệu</button>
      </div>
      <input id="xk-cm-search" type="search" placeholder="Tìm tên sản phẩm, mã SKU…" />
      <div id="xk-cm-search-results"></div>
      <div id="xk-cm-lines" style="margin-top:8px"></div>
      <div id="xk-cm-total" class="today-card"></div>
      <div class="field"><label>Ghi chú</label><input id="xk-cm-note" type="text" placeholder="Lý do xuất — hỏng vỡ, biếu tặng, dùng nội bộ…" /></div>
      <button id="xk-cm-submit" class="btn btn-primary" style="width:100%;margin-top:12px">Xuất hàng</button>
    `);

    let activeType = 'product';
    modal.overlay.querySelectorAll('#xk-cm-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeType = btn.dataset.type;
        modal.overlay.querySelectorAll('#xk-cm-tabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
        modal.overlay.querySelector('#xk-cm-search').value = '';
        modal.overlay.querySelector('#xk-cm-search-results').innerHTML = '';
      });
    });

    const searchEl = modal.overlay.querySelector('#xk-cm-search');
    const resultsEl = modal.overlay.querySelector('#xk-cm-search-results');
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
            item_type: 'product', id: p.id, name: p.name, unit: p.unit, unit_price: p.cost_price || 0, on_hand: p.on_hand,
          })));
        } else {
          const res = await api.get(`/api/mgr/ingredients?q=${encodeURIComponent(q)}`);
          renderResults((res.items || []).map((i) => ({
            item_type: 'ingredient', id: i.id, name: i.name, unit: i.unit, unit_price: i.cost_price || 0, on_hand: i.on_hand,
          })));
        }
      } catch { resultsEl.innerHTML = ''; }
    }
    function renderResults(items) {
      if (!items.length) { resultsEl.innerHTML = '<p class="hint">Không tìm thấy.</p>'; return; }
      resultsEl.innerHTML = `<div class="row-menu" style="position:static;display:block;max-height:200px;overflow-y:auto">
        ${items.map((it) => `<button type="button" data-pick='${escapeHtml(JSON.stringify(it))}'>${escapeHtml(it.name)} — còn ${it.on_hand}${it.unit ? ' ' + escapeHtml(it.unit) : ''}</button>`).join('')}
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

    function lineTotal(l) { return Math.round((l.qty || 0) * (l.unit_price || 0)); }

    function renderLines() {
      modal.overlay.querySelector('#xk-cm-count').textContent =
        `${lines.length} dòng · ${lines.filter((l) => l.item_type === 'product').length} sản phẩm · ${lines.filter((l) => l.item_type === 'ingredient').length} NVL`;
      const box = modal.overlay.querySelector('#xk-cm-lines');
      if (!lines.length) { box.innerHTML = '<p class="hint">Chưa chọn món nào.</p>'; renderTotal(); return; }
      box.innerHTML = `<div class="stock-table">
        <div class="stock-table-head"><span>Món</span><span>SL (còn)</span><span>Đơn giá</span><span>Thành tiền</span><span></span></div>
        ${lines.map((l, i) => `<div class="stock-table-row" data-i="${i}">
          <span>${escapeHtml(l.name)}${l.item_type === 'ingredient' ? ' <span class="badge-default" style="font-size:10px">NVL</span>' : ''}</span>
          <span><input data-f="qty" data-i="${i}" type="number" min="0.001" step="0.001" max="${l.on_hand}" value="${l.qty}" style="width:80px" /> <span class="hint">/ ${l.on_hand}</span></span>
          <span>${formatVND(l.unit_price)}</span>
          <span>${formatVND(lineTotal(l))}</span>
          <span><button type="button" data-rm="${i}" title="Xoá dòng">${icon('dong')}</button></span>
        </div>`).join('')}
      </div>`;
      box.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('input', () => {
          const i = Number(input.dataset.i);
          lines[i].qty = Number(input.value) || 0;
          renderLines();
        });
      });
      box.querySelectorAll('[data-rm]').forEach((btn) => {
        btn.addEventListener('click', () => { lines.splice(Number(btn.dataset.rm), 1); renderLines(); });
      });
      renderTotal();
    }

    function renderTotal() {
      const total = lines.reduce((s, l) => s + lineTotal(l), 0);
      modal.overlay.querySelector('#xk-cm-total').innerHTML = `
        <div class="today-stats">
          <div class="today-stat"><span class="label">Tổng giá trị xuất</span><span class="value">${formatVND(total)}</span></div>
        </div>`;
    }

    modal.overlay.querySelector('#xk-cm-submit').addEventListener('click', async () => {
      if (!lines.length) { toast('Chưa chọn món nào', 'error'); return; }
      const over = lines.find((l) => l.qty > l.on_hand);
      if (over) { toast(`"${over.name}" chỉ còn ${over.on_hand}, không xuất được ${over.qty}`, 'error'); return; }
      const btn = modal.overlay.querySelector('#xk-cm-submit');
      btn.disabled = true;
      try {
        await api.post('/api/mgr/stock/documents', {
          direction: 'xuat',
          note: modal.overlay.querySelector('#xk-cm-note').value.trim() || null,
          items: lines.map((l) => ({
            item_type: l.item_type,
            menu_id: l.item_type === 'product' ? l.id : undefined,
            ingredient_id: l.item_type === 'ingredient' ? l.id : undefined,
            qty: l.qty, unit_price: l.unit_price, discount_amount: 0, tax_percent: 0,
          })),
        });
        toast('Đã tạo phiếu xuất kho');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được phiếu', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    renderLines();
  }

  async function load() {
    const params = new URLSearchParams({ direction: 'xuat', limit: '100' });
    if (state.q) params.set('q', state.q);
    if (state.tab === 'completed') params.set('status', 'completed');
    else if (state.tab === 'cancelled') params.set('status', 'cancelled');
    try {
      data = await api.get(`/api/mgr/stock/documents?${params}`);
      renderTabs();
      renderList();
    } catch (err) {
      container.querySelector('#xk-tbody').innerHTML = '<tr><td colspan="6">Không tải được sổ xuất kho.</td></tr>';
    }
  }

  renderTabs();
  await load();
}
