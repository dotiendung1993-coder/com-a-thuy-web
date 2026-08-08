// GĐ5 — Nguyên liệu: danh sách NVL, tồn hiện tại, thêm / sửa.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem nguyên liệu.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  const state = { q: '', only_low: false };
  let data = { items: [], summary: {} };
  let suppliers = [];

  container.innerHTML = `
    <h2>Nguyên liệu</h2>
    <div class="today-card" id="nvl-summary"></div>
    <div class="filter-row">
      <input id="nvl-q" type="search" placeholder="Tìm tên / mã NVL…" />
      <label style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <input id="nvl-low" type="checkbox" style="width:auto;min-height:auto" /> Chỉ sắp hết
      </label>
      ${canManage ? '<button id="nvl-add" class="btn btn-primary">+ Thêm NVL</button>' : ''}
    </div>
    <div id="nvl-list"><p>Đang tải…</p></div>
  `;

  let timer = null;
  container.querySelector('#nvl-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#nvl-low').addEventListener('change', (e) => {
    state.only_low = e.target.checked; load();
  });
  if (canManage) {
    container.querySelector('#nvl-add').addEventListener('click', () => openModal_(null));
  }

  function renderSummary() {
    const s = data.summary || {};
    container.querySelector('#nvl-summary').innerHTML = `
      <div class="today-card-title">NGUYÊN LIỆU HIỆN TẠI</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Tổng NVL</span><span class="value">${s.total ?? 0}</span></div>
        <div class="today-stat"><span class="label">Sắp hết</span><span class="value">${s.low_stock ?? 0}</span></div>
        <div class="today-stat"><span class="label">Âm tồn</span><span class="value">${s.negative_stock ?? 0}</span></div>
      </div>`;
  }

  function renderList() {
    const el = container.querySelector('#nvl-list');
    if (!data.items.length) {
      el.innerHTML = state.only_low
        ? `<p class="ok-note"><span class="inline-ico">${icon('ok')}</span> Không có NVL nào dưới định mức.</p>`
        : '<p>Chưa có nguyên liệu nào. Bấm "+ Thêm NVL" để tạo.</p>';
      return;
    }
    el.innerHTML = data.items.map((it) => `
      <div class="stock-row ${it.negative_stock ? 'low' : it.low_stock ? 'low' : ''}">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(it.code)} — ${escapeHtml(it.name)}
            ${it.negative_stock ? '<span class="badge-warn">Tồn âm</span>' : it.low_stock ? '<span class="badge-warn">Sắp hết</span>' : ''}
          </div>
          <div class="stock-meta">
            Định mức: ${it.min_qty} ${escapeHtml(it.unit)}
            ${it.cost_price ? ' · Giá nhập ' + formatVND(it.cost_price) + '/' + escapeHtml(it.unit) : ''}
            ${it.supplier_name ? ' · NCC: ' + escapeHtml(it.supplier_name) : ''}
          </div>
        </div>
        <div class="stock-qty" style="color:${it.negative_stock ? '#c00' : 'inherit'}">
          ${it.on_hand} ${escapeHtml(it.unit)}
        </div>
        ${canManage ? `<button class="btn" style="flex-shrink:0" data-edit="${it.id}">Sửa</button>` : ''}
      </div>`).join('');
    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        const item = data.items.find((it) => String(it.id) === btn.dataset.edit);
        if (item) btn.addEventListener('click', () => openModal_(item));
      });
    }
  }

  function openModal_(item) {
    const isNew = !item;
    const modal = openModal(`
      <h3>${isNew ? 'Thêm nguyên liệu' : 'Sửa nguyên liệu'}</h3>
      <div class="field"><label>Tên *</label>
        <input id="nvl-m-name" value="${item ? escapeHtml(item.name) : ''}" placeholder="Tên NVL" /></div>
      <div class="field"><label>Đơn vị *</label>
        <input id="nvl-m-unit" value="${item ? escapeHtml(item.unit) : ''}" placeholder="kg, lít, gói…" /></div>
      <div class="field"><label>Giá nhập (1 đơn vị)</label>
        <input id="nvl-m-cost" type="number" min="0" value="${item?.cost_price ?? 0}" /></div>
      <div class="field"><label>Định mức tối thiểu</label>
        <input id="nvl-m-min" type="number" min="0" step="0.001" value="${item?.min_qty ?? 0}" /></div>
      <div class="field"><label>Nhà cung cấp</label>
        <select id="nvl-m-sup">
          <option value="">— Không chọn —</option>
          ${suppliers.map((s) => `<option value="${s.id}" ${item?.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Ghi chú</label>
        <input id="nvl-m-note" value="${item?.note ? escapeHtml(item.note) : ''}" /></div>
      <div style="display:flex;gap:8px">
        <button id="nvl-m-save" class="btn btn-primary" style="flex:1">Lưu</button>
        ${!isNew ? `<button id="nvl-m-del" class="btn" style="color:#c00">Xoá</button>` : ''}
      </div>
    `);
    const ov = modal.overlay;
    ov.querySelector('#nvl-m-save').addEventListener('click', async () => {
      const body = {
        name: ov.querySelector('#nvl-m-name').value.trim(),
        unit: ov.querySelector('#nvl-m-unit').value.trim(),
        cost_price: parseFloat(ov.querySelector('#nvl-m-cost').value) || 0,
        min_qty: parseFloat(ov.querySelector('#nvl-m-min').value) || 0,
        supplier_id: ov.querySelector('#nvl-m-sup').value || null,
        note: ov.querySelector('#nvl-m-note').value.trim() || null,
      };
      if (!body.name) { toast('Tên NVL không được trống', 'error'); return; }
      if (!body.unit) { toast('Đơn vị không được trống', 'error'); return; }
      try {
        if (isNew) await api.post('/api/mgr/ingredients', body);
        else await api.patch(`/api/mgr/ingredients/${item.id}`, body);
        toast(isNew ? 'Đã thêm nguyên liệu' : 'Đã cập nhật');
        modal.close(); await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
    });
    if (!isNew) {
      ov.querySelector('#nvl-m-del').addEventListener('click', async () => {
        if (!confirm(`Xoá NVL "${item.name}"?`)) return;
        try {
          await api.del(`/api/mgr/ingredients/${item.id}`);
          toast('Đã xoá'); modal.close(); await load();
        } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
      });
    }
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.only_low) params.set('only_low', '1');
    try {
      data = await api.get(`/api/mgr/ingredients?${params}`);
      renderSummary();
      renderList();
    } catch {
      container.querySelector('#nvl-list').innerHTML = '<p>Không tải được danh sách NVL.</p>';
    }
  }

  try {
    const sd = await api.get('/api/mgr/ingredients/suppliers');
    suppliers = (sd.suppliers || []).filter((s) => s.active);
  } catch { /* ignore */ }

  await load();
}
