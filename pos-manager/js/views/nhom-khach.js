// GĐ6 — Nhóm khách: CRUD nhóm + tỷ lệ giảm giá tự động theo nhóm.
//
// Đợt 7 (18/08/2026) — viết lại theo ảnh mẫu Sổ Bán Hàng v2 (Downloads/SoBanHang/Website v2/
// Đối tác/Nhóm khách hàng): bảng TÊN NHÓM/SỐ LƯỢNG/TỔNG PHẢI THU/TỔNG PHẢI TRẢ (bảng .sp-table
// dùng chung san-pham.js Đợt 5) + modal "Tạo nhóm khách hàng" chọn thẳng khách vào nhóm.
//
// Tính năng "Giảm giá tự động theo nhóm" (order-service.js áp % giảm khi bán) VẪN GIỮ NGUYÊN —
// ảnh mẫu không có ô này nhưng bỏ hẳn sẽ làm mất một tính năng đang dùng thật, nên gói nó vào một
// khối "Thông tin thêm" gập được thay vì hiện lộ thiên như bản v1 cũ.
//
// KHÔNG LÀM: nút "+ Tạo khách hàng" ngay trong ô tìm khách của modal (ảnh mẫu có) — trùng chức
// năng với "+ Tạo khách hàng" ở màn Khách hàng, không tách riêng thêm một luồng tạo khách thứ hai
// trong phạm vi nhiệm vụ này. Đóng modal rồi qua màn Khách hàng để tạo khách mới.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.customer) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.customer_manage;

  let groups = [];
  let q = '';

  container.innerHTML = `
    <div class="page-head">
      <h2>Nhóm khách hàng</h2>
      ${canManage ? '<button id="nk-add" class="btn btn-primary">+ Tạo nhóm khách hàng</button>' : ''}
    </div>
    <div class="filter-row">
      <input id="nk-q" type="search" placeholder="Tìm kiếm nhóm khách hàng" />
    </div>
    <div id="nk-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#nk-add').addEventListener('click', () => openForm(null));
  }

  let timer = null;
  container.querySelector('#nk-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = e.target.value.trim().toLowerCase(); renderList(); }, 200);
  });

  function renderList() {
    const el = container.querySelector('#nk-list');
    const filtered = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;

    if (!groups.length) {
      el.innerHTML = `
        <div style="text-align:center;padding:56px 16px;color:#999">
          <div style="width:40px;height:40px;margin:0 auto 8px">${icon('nhom-khach') || ''}</div>
          <div style="font-weight:600;color:var(--text,#333)">Chưa có nhóm khách hàng nào</div>
          <div style="margin-top:4px">Tạo nhóm đầu tiên để phân loại khách hàng</div>
        </div>`;
      return;
    }
    if (!filtered.length) {
      el.innerHTML = '<p style="text-align:center;padding:32px;color:#999">Không tìm thấy nhóm khách hàng nào.</p>';
      return;
    }

    el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:560px">
          <thead><tr>
            <th>TÊN NHÓM</th>
            <th style="width:110px">SỐ LƯỢNG</th>
            <th style="width:140px">TỔNG PHẢI THU</th>
            <th style="width:140px">TỔNG PHẢI TRẢ</th>
            <th style="width:40px"></th>
          </tr></thead>
          <tbody>
            ${filtered.map((g) => `
            <tr class="${g.active ? '' : 'row-inactive'}" data-gid="${g.id}">
              <td>${escapeHtml(g.name)}${g.active ? '' : ' <span class="badge-warn">Ẩn</span>'}</td>
              <td>${g.customer_count ?? 0}</td>
              <td>${g.receivable > 0 ? formatVND(g.receivable) : '—'}</td>
              <td>${g.payable > 0 ? formatVND(g.payable) : '—'}</td>
              <td>${canManage ? `<button class="ord-kebab" data-menu="${g.id}" aria-haspopup="menu" aria-expanded="false"
                aria-label="Thao tác với nhóm ${escapeHtml(g.name)}">${icon('them')}</button>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    if (canManage) {
      el.querySelectorAll('.ord-kebab').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
      });
    }
  }

  // ── Menu 3 chấm: Chỉnh sửa / Xóa (đúng 2 lựa chọn của ảnh mẫu) ──────────────────────────────
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const g = groups.find((x) => String(x.id) === btn.dataset.menu);
    if (!g) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Chỉnh sửa</button>
      <button type="button" role="menuitem" class="danger" data-act="del">${icon('xoa')} Xóa</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const openUp = r.bottom + menu.offsetHeight + 8 > window.innerHeight;
    menu.style.top = `${(openUp ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'edit') openForm(g);
      else removeGroup(g);
    });
  }
  document.addEventListener('click', closeRowMenu);

  async function removeGroup(g) {
    if (!(await confirmDialog(`Xoá nhóm "${g.name}"? Khách trong nhóm sẽ được gỡ nhóm.`, { danger: true }))) return;
    try {
      await api.del(`/api/mgr/customers/groups/${g.id}`);
      toast('Đã xoá nhóm');
      await load();
    } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
  }

  // ── Tạo / Sửa nhóm — Tên nhóm + "Danh sách khách hàng" chọn trực tiếp (đúng ảnh mẫu) ───────────
  function openForm(g) {
    const isNew = !g;
    let selected = new Map(); // id -> { id, name, phone }
    let searchResults = [];

    const modal = openModal(`
      <h3>${isNew ? 'Tạo nhóm khách hàng' : 'Sửa nhóm khách hàng'}</h3>
      <div class="field"><label for="nk-name">Tên nhóm <i class="req">*</i></label>
        <input id="nk-name" type="text" maxlength="30" value="${escapeHtml(g?.name || '')}" placeholder="Nhập tên nhóm (tối đa 30 ký tự)" /></div>

      <label id="nk-count-label" style="display:block;margin:10px 0 6px;font-weight:600">Danh sách khách hàng (0)</label>
      <div id="nk-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px"></div>
      <input id="nk-cust-q" type="search" placeholder="Tìm khách hàng…" />
      <div id="nk-cust-list" style="max-height:220px;overflow-y:auto;border:1px solid var(--line,#eee);border-radius:8px;margin-top:6px"></div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-weight:600">Thông tin thêm</summary>
        <div class="field" style="margin-top:10px"><label for="nk-disc">Giảm giá tự động (%)</label>
          <input id="nk-disc" type="number" min="0" max="100" step="0.1" value="${g?.discount_percent ?? 0}" /></div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <input id="nk-active" type="checkbox" style="width:auto;min-height:auto" ${!g || g.active ? 'checked' : ''} />
          Hiển thị (kích hoạt nhóm)
        </label>
      </details>

      <div class="modal-close-row">
        <button class="btn" data-action="close">Hủy</button>
        <button id="nk-save" class="btn btn-primary">${isNew ? 'Tạo nhóm' : 'Lưu'}</button>
      </div>
      ${!isNew ? '<button id="nk-delete" class="btn" style="width:100%;margin-top:8px;color:#c00">Xoá nhóm</button>' : ''}
    `);
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);

    function renderChips() {
      modal.overlay.querySelector('#nk-count-label').textContent = `Danh sách khách hàng (${selected.size})`;
      const box = modal.overlay.querySelector('#nk-chips');
      box.innerHTML = [...selected.values()].map((c) => `
        <span class="badge-default" data-chip="${c.id}" style="display:inline-flex;align-items:center;gap:4px;cursor:default">
          ${escapeHtml(c.name || c.phone)} <button type="button" data-unpick="${c.id}" style="border:none;background:none;cursor:pointer;font-weight:700" aria-label="Bỏ chọn">×</button>
        </span>`).join('');
      box.querySelectorAll('[data-unpick]').forEach((btn) => {
        btn.addEventListener('click', () => { selected.delete(Number(btn.dataset.unpick)); renderChips(); renderCustList(); });
      });
    }

    function renderCustList() {
      const box = modal.overlay.querySelector('#nk-cust-list');
      if (!searchResults.length) { box.innerHTML = '<p class="hint" style="padding:8px;margin:0">Nhập tên hoặc SĐT để tìm khách.</p>'; return; }
      box.innerHTML = searchResults.map((c) => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-top:1px solid var(--line,#f0f0f0)">
          <input type="checkbox" data-cust="${c.id}" style="width:auto;min-height:auto" ${selected.has(c.id) ? 'checked' : ''} />
          <span>${escapeHtml(c.name || '—')} <span style="color:#888;font-size:12px">${escapeHtml(c.phone)}</span></span>
        </label>`).join('');
      box.querySelectorAll('[data-cust]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id = Number(cb.dataset.cust);
          const c = searchResults.find((x) => x.id === id);
          if (cb.checked) selected.set(id, c); else selected.delete(id);
          renderChips();
        });
      });
    }

    let searchTimer = null;
    modal.overlay.querySelector('#nk-cust-q').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const term = e.target.value.trim();
      searchTimer = setTimeout(async () => {
        try {
          const res = await api.get(`/api/mgr/customers?q=${encodeURIComponent(term)}&limit=20`);
          searchResults = res.customers || [];
        } catch { searchResults = []; }
        renderCustList();
      }, 250);
    });

    modal.overlay.querySelector('#nk-save').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#nk-name').value.trim();
      if (!name) { toast('Nhập tên nhóm', 'error'); return; }
      const body = {
        name,
        discount_percent: Number(modal.overlay.querySelector('#nk-disc').value) || 0,
        active: modal.overlay.querySelector('#nk-active').checked,
        customer_ids: [...selected.keys()],
      };
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
        modal.close();
        await removeGroup(g);
      });
    }

    renderChips();
    renderCustList();

    // Sửa nhóm: nạp sẵn khách đang thuộc nhóm này làm lựa chọn ban đầu.
    if (!isNew) {
      (async () => {
        try {
          const res = await api.get(`/api/mgr/customers?group_id=${g.id}&limit=500`);
          (res.customers || []).forEach((c) => selected.set(c.id, c));
          renderChips();
        } catch { /* không tải được thì để trống, vẫn sửa được tên/% */ }
      })();
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
