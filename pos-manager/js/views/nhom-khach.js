// GĐ6 — Nhóm khách: CRUD nhóm + tỷ lệ giảm giá tự động theo nhóm.
import { api } from '../api.js';
import { escapeHtml, toast, openModal } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.customer) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.customer_manage;

  let groups = [];

  container.innerHTML = `
    <h2>Nhóm khách</h2>
    ${canManage ? '<button id="nk-add" class="btn btn-primary" style="margin-bottom:12px">+ Tạo nhóm mới</button>' : ''}
    <div id="nk-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#nk-add').addEventListener('click', () => openForm(null));
  }

  function renderList() {
    const el = container.querySelector('#nk-list');
    if (!groups.length) {
      el.innerHTML = '<p>Chưa có nhóm nào. Tạo nhóm để áp dụng giảm giá tự động theo SĐT khách.</p>';
      return;
    }
    el.innerHTML = groups.map((g) => `
      <div class="stock-row ${g.active ? '' : 'inactive'}">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(g.name)}
            ${g.active ? '' : '<span class="badge-warn">Ẩn</span>'}
          </div>
          <div class="stock-meta">Giảm ${g.discount_percent}% · ${g.customer_count ?? 0} khách</div>
        </div>
        ${canManage ? `<div class="stock-actions"><button data-edit="${g.id}">Sửa</button></div>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openForm(groups.find((g) => String(g.id) === btn.dataset.edit)));
      });
    }
  }

  function openForm(g) {
    const isNew = !g;
    const modal = openModal(`
      <h3>${isNew ? 'Tạo nhóm mới' : 'Sửa nhóm'}</h3>
      <div class="field"><label>Tên nhóm</label>
        <input id="nk-name" type="text" value="${escapeHtml(g?.name || '')}" placeholder="VD: Khách VIP, Khách thân thiết…" /></div>
      <div class="field"><label>Giảm giá tự động (%)</label>
        <input id="nk-disc" type="number" min="0" max="100" step="0.1" value="${g?.discount_percent ?? 0}" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="nk-active" type="checkbox" style="width:auto;min-height:auto" ${!g || g.active ? 'checked' : ''} />
        Hiển thị (kích hoạt nhóm)
      </label>
      <button id="nk-save" class="btn btn-primary" style="width:100%">Lưu</button>
      ${!isNew ? '<button id="nk-delete" class="btn" style="width:100%;margin-top:8px;color:#c00">Xoá nhóm</button>' : ''}
    `);

    modal.overlay.querySelector('#nk-save').addEventListener('click', async () => {
      const body = {
        name: modal.overlay.querySelector('#nk-name').value.trim(),
        discount_percent: Number(modal.overlay.querySelector('#nk-disc').value) || 0,
        active: modal.overlay.querySelector('#nk-active').checked,
      };
      if (!body.name) { toast('Nhập tên nhóm', 'error'); return; }
      try {
        if (isNew) await api.post('/api/mgr/customers/groups', body);
        else await api.patch(`/api/mgr/customers/groups/${g.id}`, body);
        toast(isNew ? 'Đã tạo nhóm' : 'Đã lưu');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });

    if (!isNew) {
      modal.overlay.querySelector('#nk-delete').addEventListener('click', async () => {
        if (!confirm(`Xoá nhóm "${g.name}"? Khách trong nhóm sẽ được gỡ nhóm.`)) return;
        try {
          await api.del(`/api/mgr/customers/groups/${g.id}`);
          toast('Đã xoá nhóm');
          modal.close();
          await load();
        } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
      });
    }
  }

  async function load() {
    try {
      const res = await api.get('/api/mgr/customers/groups');
      groups = res.groups || [];
      renderList();
    } catch {
      container.querySelector('#nk-list').innerHTML = '<p>Không tải được danh sách nhóm.</p>';
    }
  }

  await load();
}
