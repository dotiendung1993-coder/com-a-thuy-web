// Đợt 5 (17/08/2026) v2 — Danh mục sản phẩm: giao diện SoBanHang v2.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  let allCats = [];
  let searchQ = '';
  let showCount = true;

  container.innerHTML = `
    <div class="page-head">
      <h2>Danh mục</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="position:relative">
          <button id="dm-col-btn" class="btn" style="font-size:13px">Hiển thị cột ▾</button>
          <div id="dm-col-drop" class="sp-cat-drop" hidden style="right:0;left:auto;min-width:160px">
            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer">
              <input id="dm-col-count" type="checkbox" checked style="width:auto;min-height:auto" />
              Số sản phẩm
            </label>
          </div>
        </div>
        ${canManage ? '<button id="dm-add" class="btn btn-primary">+ Tạo danh mục</button>' : ''}
      </div>
    </div>
    <div class="filter-row" style="margin-bottom:12px">
      <input id="dm-q" type="search" placeholder="Tìm kiếm danh mục…" style="max-width:320px" />
    </div>
    <div id="dm-list"><p>Đang tải...</p></div>
  `;

  // "Hiển thị cột" toggle
  const colBtn = container.querySelector('#dm-col-btn');
  const colDrop = container.querySelector('#dm-col-drop');
  colBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colDrop.hidden = !colDrop.hidden;
  });
  document.addEventListener('click', () => { colDrop.hidden = true; });
  container.querySelector('#dm-col-count').addEventListener('change', (e) => {
    showCount = e.target.checked;
    renderList(allCats);
  });

  let qTimer = null;
  container.querySelector('#dm-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { searchQ = e.target.value.trim().toLowerCase(); renderList(allCats); }, 200);
  });
  if (canManage) {
    container.querySelector('#dm-add').addEventListener('click', () => openForm());
  }

  function renderList(cats) {
    const el = container.querySelector('#dm-list');
    const visible = searchQ ? cats.filter((c) => c.name.toLowerCase().includes(searchQ)) : cats;
    if (!visible.length) {
      el.innerHTML = searchQ
        ? '<p>Không tìm thấy danh mục nào.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div style="font-size:48px;margin-bottom:12px"></div>
            <p style="font-weight:600;margin:0">Chưa có danh mục nào</p>
            <p class="hint" style="margin:4px 0 16px">Tạo danh mục để nhóm sản phẩm trên thực đơn</p>
            ${canManage ? '<button id="dm-add-2" class="btn btn-primary">+ Tạo danh mục</button>' : ''}
          </div>`;
      if (canManage && !searchQ) {
        const btn2 = el.querySelector('#dm-add-2');
        if (btn2) btn2.addEventListener('click', () => openForm());
      }
      return;
    }

    el.innerHTML = `<table class="sp-table" style="width:100%">
      <thead><tr>
        <th>TÊN DANH MỤC</th>
        ${showCount ? '<th style="width:120px">SỐ SẢN PHẨM</th>' : ''}
        ${canManage ? '<th style="width:120px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${visible.map((c) => `
        <tr>
          <td style="font-weight:500">${escapeHtml(c.name)}</td>
          ${showCount ? `<td>${c.product_count ?? 0} sản phẩm</td>` : ''}
          ${canManage ? `<td>
            <button class="btn" style="padding:4px 10px;font-size:12px;margin-right:4px" data-action="edit" data-id="${c.id}">Sửa</button>
            <button class="btn" style="padding:4px 10px;font-size:12px;color:#c00" data-action="del" data-id="${c.id}">Xoá</button>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>`;

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
      <h3>${isEdit ? 'Sửa danh mục' : 'Tạo danh mục'}</h3>
      <div class="field">
        <label>Ảnh danh mục</label>
        <div style="display:flex;align-items:center;gap:8px;border:1px dashed var(--border,#ddd);border-radius:8px;padding:12px;margin-bottom:8px">
          <div id="dm-img-preview" style="width:48px;height:48px;border-radius:6px;background:var(--bg,#f5f5f5);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            ${cat?.image_path ? `<img src="${escapeHtml(cat.image_path)}" style="width:100%;height:100%;object-fit:cover" />` : '<span style="font-size:20px"></span>'}
          </div>
          <div>
            <button type="button" id="dm-img-btn" class="btn" style="font-size:13px">Chọn ảnh</button>
            <input type="file" id="dm-img-file" accept="image/png,image/jpeg" hidden />
            <div class="hint" style="margin-top:4px">Định dạng jpg, png, jpg</div>
          </div>
        </div>
        <input id="dm-img-url" type="text" value="${cat?.image_path ? escapeHtml(cat.image_path) : ''}" placeholder="Hoặc dán đường dẫn ảnh…" style="font-size:12px" />
      </div>
      <div class="field">
        <label>Tên danh mục <i class="req">*</i></label>
        <input id="dm-name" type="text" value="${cat ? escapeHtml(cat.name) : ''}" placeholder="Ví dụ: Đồ uống" />
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="dm-cancel" class="btn btn-ghost" style="flex:1">Huỷ</button>
        <button id="dm-submit" class="btn btn-primary" style="flex:1">${isEdit ? 'Lưu' : 'Tạo danh mục'}</button>
      </div>
    `);

    // Image file picker
    const fileEl = modal.overlay.querySelector('#dm-img-file');
    const urlEl = modal.overlay.querySelector('#dm-img-url');
    const previewEl = modal.overlay.querySelector('#dm-img-preview');
    modal.overlay.querySelector('#dm-img-btn').addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const file = fileEl.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      previewEl.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" />`;
      urlEl.value = '';
    });
    urlEl.addEventListener('input', () => {
      const v = urlEl.value.trim();
      previewEl.innerHTML = v
        ? `<img src="${escapeHtml(v)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />`
        : '<span style="font-size:20px"></span>';
    });

    const nameEl = modal.overlay.querySelector('#dm-name');
    nameEl.focus();
    modal.overlay.querySelector('#dm-cancel').addEventListener('click', modal.close);
    modal.overlay.querySelector('#dm-submit').addEventListener('click', async () => {
      const name = nameEl.value.trim();
      if (!name) { toast('Vui lòng nhập tên danh mục', 'error'); return; }
      const payload = { name };
      const imageUrl = urlEl.value.trim();
      if (imageUrl) payload.image_path = imageUrl;
      try {
        if (isEdit) {
          await api.patch(`/api/mgr/products/categories/${cat.id}`, payload);
          toast('Đã lưu');
        } else {
          await api.post('/api/mgr/products/categories', payload);
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
    const msg = (cat.product_count || 0) > 0
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
      allCats = res.categories || [];
      renderList(allCats);
    } catch {
      container.querySelector('#dm-list').innerHTML = '<p>Không tải được danh mục.</p>';
    }
  }

  await load();
}
