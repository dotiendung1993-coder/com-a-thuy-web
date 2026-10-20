// Đợt 5 (17/08/2026) v2 — Danh mục sản phẩm: giao diện SoBanHang v2.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog, resolveImg } from '../ui.js';
import { icon } from '../icons.js';

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

  // Đợt 4 (04/09/2026) — ảnh mẫu: đầu trang CHỈ có nút xanh "Tạo danh mục"; ô tìm kiếm và nút
  // vuông chọn cột nằm TRONG thẻ trắng bọc luôn cả bảng (trước đây ô tìm trôi lơ lửng bên ngoài
  // và nút chọn cột đứng cạnh nút tạo mới).
  container.innerHTML = `
    <div class="page-head">
      <h2>Danh mục</h2>
      <div class="page-head-actions">
        ${canManage ? '<button id="dm-add" class="btn btn-primary">+ Tạo danh mục</button>' : ''}
      </div>
    </div>
    <div class="sbh-card">
      <div class="sbh-card-tools">
        <input id="dm-q" class="sbh-card-search" type="search" placeholder="Tìm kiếm danh mục" />
        <div class="sbh-tools-right">
          <div style="position:relative">
            <button id="dm-col-btn" class="btn pm-col-btn ord-cols-icon" aria-label="Hiển thị cột" title="Hiển thị cột">${icon('cot-hien-thi')}</button>
            <div id="dm-col-drop" hidden style="position:absolute;top:100%;right:0;left:auto;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:160px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
              <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer">
                <input id="dm-col-count" type="checkbox" checked style="width:auto;min-height:auto" />
                Số sản phẩm
              </label>
            </div>
          </div>
        </div>
      </div>
      <div id="dm-list"><p style="padding:0 14px 14px">Đang tải...</p></div>
    </div>
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
        ? '<p style="padding:0 14px 14px">Không tìm thấy danh mục nào.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div class="sbh-empty-ico">${icon('danh-muc')}</div>
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

    // Ảnh mẫu: mỗi dòng có ô ẢNH vuông trước tên, cột số chỉ ghi CON SỐ (không kèm chữ
    // "sản phẩm"), và 2 nút Sửa/Xoá gom vào menu 3 chấm ở cuối dòng.
    el.innerHTML = `<table class="sp-table dm-table" style="width:100%">
      <thead><tr>
        <th>DANH MỤC</th>
        ${showCount ? '<th style="width:140px;text-align:right">SỐ SẢN PHẨM</th>' : ''}
        ${canManage ? '<th style="width:56px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${visible.map((c) => `
        <tr>
          <td>
            <div class="dm-name-cell">
              <div class="sp-thumb">${c.image_path
                ? `<img src="${escapeHtml(resolveImg(c.image_path))}" alt="" loading="lazy" />`
                : `<span class="sp-thumb-ico">${icon('danh-muc')}</span>`}</div>
              <span style="font-weight:500">${escapeHtml(c.name)}</span>
            </div>
          </td>
          ${showCount ? `<td style="text-align:right">${c.product_count ?? 0}</td>` : ''}
          ${canManage ? `<td class="dm-act">
            <div class="dm-kebab-wrap">
              <button class="ord-kebab" data-kebab="${c.id}" aria-haspopup="menu" aria-expanded="false"
                aria-label="Thao tác với danh mục ${escapeHtml(c.name)}">${icon('them')}</button>
              <div class="row-menu dm-kebab-menu hidden" role="menu">
                <button type="button" role="menuitem" data-action="edit" data-id="${c.id}">${icon('chinh-sua')} Chỉnh sửa</button>
                <button type="button" role="menuitem" class="danger" data-action="del" data-id="${c.id}">${icon('xoa')} Xoá</button>
              </div>
            </div>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>`;

    if (canManage) {
      // Menu 3 chấm: mở một cái thì đóng hết những cái đang mở, bấm ra ngoài cũng đóng.
      const closeAllKebabs = () => el.querySelectorAll('.dm-kebab-menu').forEach((m) => {
        m.classList.add('hidden');
        m.parentElement.querySelector('.ord-kebab')?.setAttribute('aria-expanded', 'false');
      });
      el.querySelectorAll('[data-kebab]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAllKebabs();
          menu.classList.toggle('hidden', !willOpen);
          btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });
      document.addEventListener('click', closeAllKebabs);
      el.querySelectorAll('[data-action]').forEach((btn) => {
        const cat = cats.find((c) => c.id === Number(btn.dataset.id));
        btn.addEventListener('click', () => {
          closeAllKebabs();
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
