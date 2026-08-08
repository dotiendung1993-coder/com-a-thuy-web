// GĐ5 — Nhà cung cấp: danh sách + thêm / sửa.
import { api } from '../api.js';
import { toast, openModal, escapeHtml } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem nhà cung cấp.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  container.innerHTML = `
    <h2>Nhà cung cấp</h2>
    ${canManage ? '<button id="ncc-add" class="btn btn-primary" style="margin-bottom:12px">+ Thêm nhà cung cấp</button>' : ''}
    <div id="ncc-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#ncc-add').addEventListener('click', () => openSupplierModal(null));
  }

  async function load() {
    try {
      const data = await api.get('/api/mgr/ingredients/suppliers');
      renderList(data.suppliers || []);
    } catch {
      container.querySelector('#ncc-list').innerHTML = '<p>Không tải được danh sách nhà cung cấp.</p>';
    }
  }

  function renderList(suppliers) {
    const el = container.querySelector('#ncc-list');
    if (!suppliers.length) {
      el.innerHTML = '<p>Chưa có nhà cung cấp nào. Bấm "+ Thêm" để tạo.</p>';
      return;
    }
    el.innerHTML = suppliers.map((s) => `
      <div class="card" style="margin-bottom:8px;padding:12px;display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-weight:600">${escapeHtml(s.name)}
            ${!s.active ? '<span class="badge-warn" style="margin-left:6px">Ngừng hợp tác</span>' : ''}
          </div>
          ${s.phone ? `<div class="stock-meta">${escapeHtml(s.phone)}</div>` : ''}
          ${s.address ? `<div class="stock-meta">${escapeHtml(s.address)}</div>` : ''}
        </div>
        ${canManage ? `<button class="btn" data-id="${s.id}">Sửa</button>` : ''}
      </div>`).join('');
    if (canManage) {
      el.querySelectorAll('[data-id]').forEach((btn) => {
        const sup = suppliers.find((s) => String(s.id) === btn.dataset.id);
        if (sup) btn.addEventListener('click', () => openSupplierModal(sup));
      });
    }
  }

  function openSupplierModal(sup) {
    const isNew = !sup;
    const modal = openModal(`
      <h3>${isNew ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}</h3>
      <div class="field"><label>Tên *</label>
        <input id="ncc-name" value="${sup ? escapeHtml(sup.name) : ''}" placeholder="Tên nhà cung cấp" /></div>
      <div class="field"><label>Điện thoại</label>
        <input id="ncc-phone" value="${sup?.phone ? escapeHtml(sup.phone) : ''}" placeholder="SĐT" /></div>
      <div class="field"><label>Địa chỉ</label>
        <input id="ncc-address" value="${sup?.address ? escapeHtml(sup.address) : ''}" placeholder="Địa chỉ" /></div>
      <div class="field"><label>Ghi chú</label>
        <input id="ncc-note" value="${sup?.note ? escapeHtml(sup.note) : ''}" placeholder="Ghi chú" /></div>
      ${!isNew ? `<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input id="ncc-active" type="checkbox" style="width:auto;min-height:auto" ${sup.active ? 'checked' : ''} />
        Đang hợp tác</label>` : ''}
      <button id="ncc-save" class="btn btn-primary" style="width:100%">Lưu</button>
    `);
    const ov = modal.overlay;
    ov.querySelector('#ncc-save').addEventListener('click', async () => {
      const body = {
        name: ov.querySelector('#ncc-name').value.trim(),
        phone: ov.querySelector('#ncc-phone').value.trim() || null,
        address: ov.querySelector('#ncc-address').value.trim() || null,
        note: ov.querySelector('#ncc-note').value.trim() || null,
      };
      if (!isNew) body.active = ov.querySelector('#ncc-active').checked;
      if (!body.name) { toast('Tên nhà cung cấp không được trống', 'error'); return; }
      try {
        if (isNew) await api.post('/api/mgr/ingredients/suppliers', body);
        else await api.patch(`/api/mgr/ingredients/suppliers/${sup.id}`, body);
        toast(isNew ? 'Đã thêm nhà cung cấp' : 'Đã cập nhật');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Lỗi khi lưu', 'error');
      }
    });
  }

  await load();
}
