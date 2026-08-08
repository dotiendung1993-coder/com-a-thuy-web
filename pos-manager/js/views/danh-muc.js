// GĐ9 đợt 2 — Quản lý danh mục sản phẩm.
// Thêm / sửa tên / xoá danh mục. Xoá thì đặt category = NULL cho tất cả sản phẩm đang dùng.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  container.innerHTML = `
    <h2>Danh mục sản phẩm</h2>
    ${canManage ? '<button id="dm-add" class="btn btn-primary" style="width:100%;margin-bottom:12px">+ Thêm danh mục</button>' : ''}
    <div id="dm-list"><p>Đang tải...</p></div>
  `;

  if (canManage) {
    container.querySelector('#dm-add').addEventListener('click', () => openForm());
  }

  function renderList(cats) {
    const el = container.querySelector('#dm-list');
    if (!cats.length) { el.innerHTML = '<p>Chưa có danh mục nào.</p>'; return; }
    el.innerHTML = cats.map((c) => `
      <div class="cash-account-row">
        <div class="cash-account-main">
          <div class="cash-account-name">${escapeHtml(c.name)}</div>
          <div class="cash-account-meta">${c.product_count} sản phẩm</div>
        </div>
        ${canManage ? `
          <div class="cash-account-actions">
            <button data-action="edit" data-id="${c.id}">Sửa</button>
            <button data-action="del" data-id="${c.id}" class="btn-danger-text">Xoá</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    if (canManage) {
      el.querySelectorAll('[data-action]').forEach((btn) => {
        const cat = cats.find((c) => c.id === Number(btn.dataset.id));
        btn.addEventListener('click', () => {
          if (btn.dataset.action === 'edit') openForm(cat);
          else if (btn.dataset.action === 'del') deleteCategory(cat);
        });
      });
    }
  }

  function openForm(cat) {
    const isEdit = !!cat;
    const modal = openModal(`
      <h3>${isEdit ? 'Sửa danh mục' : 'Thêm danh mục'}</h3>
      <div class="field"><label>Tên danh mục</label>
        <input id="dm-name" type="text" value="${cat ? escapeHtml(cat.name) : ''}" placeholder="Ví dụ: Đồ uống" /></div>
      <button id="dm-submit" class="btn btn-primary" style="width:100%">${isEdit ? 'Lưu' : 'Thêm'}</button>
    `);
    const nameEl = modal.overlay.querySelector('#dm-name');
    nameEl.focus();
    modal.overlay.querySelector('#dm-submit').addEventListener('click', async () => {
      const name = nameEl.value.trim();
      if (!name) { toast('Vui lòng nhập tên danh mục', 'error'); return; }
      try {
        if (isEdit) {
          await api.patch(`/api/mgr/products/categories/${cat.id}`, { name });
          toast('Đã lưu');
        } else {
          await api.post('/api/mgr/products/categories', { name });
          toast('Đã thêm danh mục');
        }
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  async function deleteCategory(cat) {
    const msg = cat.product_count > 0
      ? `Xoá danh mục "${cat.name}"? ${cat.product_count} sản phẩm sẽ mất danh mục (không bị xoá).`
      : `Xoá danh mục "${cat.name}"?`;
    if (!(await confirmDialog(msg))) return;
    try {
      await api.del(`/api/mgr/products/categories/${cat.id}`);
      toast('Đã xoá danh mục');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được', 'error');
    }
  }

  async function load() {
    try {
      const res = await api.get('/api/mgr/products/categories?with_count=1');
      renderList(res.categories || []);
    } catch {
      container.querySelector('#dm-list').innerHTML = '<p>Không tải được danh mục.</p>';
    }
  }

  await load();
}
