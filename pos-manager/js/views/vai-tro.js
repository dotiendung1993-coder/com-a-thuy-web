// GĐ13 — Vai trò nhân viên. Viết lại toàn bộ (17-18/08/2026, Nhân viên/Vai trò v2) theo 26 ảnh
// app.sobanhang.com/staff/role (Website v2\Nhân viên\Vai trò): danh sách vai trò dạng BẢNG
// (TÊN VAI TRÒ | MÔ TẢ | …) thay cho ma trận-quyền-chỉ-đọc cũ, và modal "Tạo/Sửa vai trò" có
// sidebar 23 nhóm quyền × 109 quyền lẻ, tìm-trong-nhóm, "Tất cả — [nhóm]", đếm "Đã chọn X/109".
//
// Danh sách 109 quyền lấy từ server (GET /permission-catalog, xem config.js PERMISSION_CATALOG) —
// KHÔNG chép tay ở đây để khỏi lệch khi backend đổi. Một số nhóm (Shopee/Tin nhắn/Bán Online/Quà
// tặng/Left Sidebar/QuickCash/Kê khai thuế) không có tính năng thật trong POS Manager của quán —
// đã hỏi ý kiến chủ quán (17/08/2026): GIỮ ĐỦ cho giống ảnh gốc, tick vào các ô này không chặn
// được gì thật (xem chú thích trong config.js).
import { api } from '../api.js';
import { escapeHtml, openModal, toast, confirmDialog, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

const CAT_ICON = {
  'ban-hang': 'ban-hang', 'san-pham': 'san-pham', 'don-hang': 'don-hang', 'kho-hang': 'ton-kho',
  'khach-hang': 'khach-hang', 'khuyen-mai': 'khuyen-mai', 'so-thu-chi': 'thu-chi', 'so-no': 'so-no',
  'bao-cao': 'bao-cao-ban-hang', 'quan-ly-nhan-vien': 'nhan-vien', 'quan-ly-vai-tro': 'vai-tro',
  'thong-tin-cua-hang': 'cai-dat', 'nvl': 'nvl', 'cong-thuc': 'cong-thuc', 'nha-cung-cap': 'nha-cung-cap',
  'quan-ly-bep': 'bep', 'ke-khai-thue': 'uoc-tinh-thue',
};
function catIcon(groupKey) { return icon(CAT_ICON[groupKey] || 'them'); }

function fineKey(groupKey, leafKey) { return `${groupKey}.${leafKey}`; }

// Mẫu vai trò dựng sẵn — 6 tên vai trò ĐÚNG như ảnh danh sách Vai trò gốc (Nhân viên ghi đơn/
// thu ngân/kho/bếp/phục vụ, Quản lý cửa hàng). Mỗi mẫu chọn vài quyền chi tiết ĐỦ để suy ra đúng
// bộ quyền thật tương ứng (xem deriveRealPerms ở config.js, chạy lại phía server khi lưu) — không
// cần liệt kê hết, chỉ cần 1 quyền lá đại diện cho mỗi quyền thật cần có.
// `extraReal`: quyền thật không có quyền lá nào đại diện trong bảng 109 quyền của ảnh gốc
// (vd 'split_bill' — Tách hoá đơn không có ô riêng trong ảnh), thêm thẳng khi lưu.
const ROLE_TEMPLATE_DEFS = [
  { id: 'ghi-don', name: 'Nhân viên ghi đơn', desc: 'Nhân viên ghi đơn chỉ được lên đơn, không có quyền thanh toán',
    fineKeys: ['ban-hang.tao-don-xl'], extraReal: [] },
  { id: 'phuc-vu', name: 'Nhân viên phục vụ', desc: 'Nhân viên phục vụ được lên đơn, xem bàn và xác nhận món đã phục vụ, không có quyền thanh toán',
    fineKeys: ['ban-hang.tao-don-xl', 'ban-hang.dat-ban', 'quan-ly-bep.xac-nhan-mon-phuc-vu'], extraReal: [] },
  { id: 'bep', name: 'Nhân viên bếp', desc: 'Nhân viên bếp được xem và cập nhật trạng thái chế biến món, không có quyền thanh toán',
    fineKeys: ['quan-ly-bep.xem-ds-mon-bep', 'quan-ly-bep.cap-nhat-tt-mon', 'don-hang.xem-ds-don'], extraReal: [] },
  { id: 'thu-ngan', name: 'Nhân viên thu ngân', desc: 'Thu ngân được quyền mở và chốt ca, bán hàng, thanh toán đơn và hoàn thành đơn',
    fineKeys: ['ban-hang.tao-don-xl', 'don-hang.thanh-toan-no-don', 'don-hang.xem-ds-don',
      'quan-ly-nhan-vien.quan-ly-ca', 'so-thu-chi.xem-ds-thu-chi', 'ban-hang.xem-ds-ban'],
    extraReal: ['split_bill'] },
  { id: 'kho', name: 'Nhân viên kho', desc: 'Nhập-xuất hàng hoá và quản lý tồn kho',
    fineKeys: ['san-pham.xem-ds-sp', 'kho-hang.tao-phieu-nhap', 'nvl.xem-ds-nvl', 'nvl.them-nvl'], extraReal: [] },
  { id: 'quan-ly', name: 'Quản lý cửa hàng', desc: 'Quản lý cửa hàng có toàn quyền với hệ thống, trừ cài đặt cửa hàng và quản lý tiền',
    fineKeys: null /* tính từ catalog lúc chạy — toàn bộ quyền lá thật, trừ nhóm Thông tin cửa hàng */,
    extraReal: ['split_bill'] },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.manage_staff) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const isOwner = staff?.role === 'owner';

  let catalog = [];
  let customRoles = [];
  try { catalog = (await api.get('/api/mgr/staff/permission-catalog')).catalog || []; } catch { /* fallback rỗng */ }
  try { customRoles = (await api.get('/api/mgr/staff/custom-roles')).custom_roles || []; } catch { /* fallback rỗng */ }

  const totalPerms = catalog.reduce((n, g) => n + g.leaves.length, 0);

  // "Quản lý cửa hàng": toàn bộ quyền lá THẬT trừ nhóm Thông tin cửa hàng (settings_manage).
  const roleTemplates = ROLE_TEMPLATE_DEFS.map((t) => t.fineKeys ? t : {
    ...t,
    fineKeys: catalog.flatMap((g) => g.leaves.filter((l) => l.real && l.real !== 'settings_manage').map((l) => fineKey(g.key, l.key))),
  });

  let state = { q: '', page: 1, pageSize: 10 };

  function renderList() {
    // "Admin" = chủ quán (owner), hàng cố định đầu bảng, không sửa/xoá được (giống ảnh gốc).
    const rows = [
      { id: '__admin__', name: 'Admin', description: '', builtin: true },
      ...customRoles,
    ];
    const q = state.q.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageItems = filtered.slice(start, start + state.pageSize);

    container.innerHTML = `
      <div class="page-head">
        <h2>Vai trò</h2>
        ${isOwner ? `<button id="vt-add" class="btn btn-primary" type="button"><span class="inline-ico">${icon('them')}</span> Tạo vai trò</button>` : ''}
      </div>
      ${pageTabsHtml('vai-tro', staff)}
      <div class="sbh-card" style="padding:0">
      <div class="sbh-card-tools">
        <input id="vt-q" class="sbh-card-search" type="search" placeholder="Tìm vai trò…" value="${escapeHtml(state.q)}" />
      </div>
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:480px;border-radius:0">
          <thead><tr><th>Tên vai trò</th><th>Mô tả</th><th></th></tr></thead>
          <tbody>
            ${!pageItems.length
              ? `<tr><td colspan="3"><p style="margin:12px 0;color:var(--text-2)">Không tìm thấy vai trò nào.</p></td></tr>`
              : pageItems.map((r) => `
              <tr>
                <td style="font-weight:600">${escapeHtml(r.name)}</td>
                <td style="color:var(--text-2)">${escapeHtml(r.description || '—')}</td>
                <td class="dm-act">${r.builtin || !isOwner ? '' : `<div class="dm-kebab-wrap"><button class="ord-kebab" data-menu="${r.id}" aria-label="Thao tác">${icon('them')}</button><div class="dm-kebab-menu hidden"><button type="button" data-act="edit">Chỉnh sửa</button><button type="button" data-act="delete" class="danger">Xoá</button></div></div>`}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="ord-pager">
        <span style="color:var(--text-2,#888);font-size:13px">Hiển thị ${filtered.length ? start + 1 : 0}-${Math.min(start + state.pageSize, filtered.length)} / ${filtered.length} vai trò</span>
        <div class="ord-pager-ctrl">
          <span style="font-size:13px;color:var(--text-2,#888)">Hiển thị dòng</span>
          <select id="vt-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px">
            ${[10, 20, 50].map(n => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <button class="ord-page-btn" id="vt-prev" ${state.page <= 1 ? 'disabled' : ''}>&#8249;</button>
          <span class="ord-page-cur">${state.page} / ${totalPages}</span>
          <button class="ord-page-btn" id="vt-next" ${state.page >= totalPages ? 'disabled' : ''}>&#8250;</button>
        </div>
      </div>
      </div>
    `;

    if (isOwner) container.querySelector('#vt-add')?.addEventListener('click', () => openRoleModal(null));
    const qEl = container.querySelector('#vt-q');
    let searchTimer = null;
    qEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = qEl.value; state.page = 1; renderList(); }, 250);
    });
    container.querySelector('#vt-prev').addEventListener('click', () => { state.page--; renderList(); });
    container.querySelector('#vt-next').addEventListener('click', () => { state.page++; renderList(); });
    const sizeEl = container.querySelector('#vt-page-size');
    if (sizeEl) sizeEl.addEventListener('change', () => { state.pageSize = parseInt(sizeEl.value, 10); state.page = 1; renderList(); });

    const closeAll = () => container.querySelectorAll('.dm-kebab-menu').forEach(m => m.classList.add('hidden'));
    container.querySelectorAll('.ord-kebab[data-menu]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const menu = btn.parentElement.querySelector('.dm-kebab-menu');
        const willOpen = menu.classList.contains('hidden');
        closeAll(); menu.classList.toggle('hidden', !willOpen);
      });
    });
    document.addEventListener('click', closeAll);
    container.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeAll();
        const id = Number(btn.closest('.dm-kebab-wrap')?.querySelector('[data-menu]')?.dataset.menu);
        const cr = customRoles.find(r => r.id === id);
        if (!cr) return;
        if (btn.dataset.act === 'edit') openRoleModal(cr);
        else deleteCustomRole(cr);
      });
    });
  }

  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const id = Number(btn.dataset.menu);
    const cr = customRoles.find((r) => r.id === id);
    if (!cr) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Chỉnh sửa</button>
      <button type="button" role="menuitem" class="danger" data-act="delete">${icon('xoa')} Xóa</button>`;
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
      if (act.dataset.act === 'edit') openRoleModal(cr);
      else deleteCustomRole(cr);
    });
  }
  document.addEventListener('click', closeRowMenu);

  // ─── Modal Tạo/Sửa vai trò ────────────────────────────────────────────────────────────────────
  function openRoleModal(existing) {
    const isEdit = !!existing;
    const selected = new Set(existing?.permissions?.filter((p) => p.includes('.')) || []); // chỉ khoá chi tiết "nhom.la"
    let activeGroup = catalog[0]?.key || '';
    let leafFilter = '';
    // Quyền thật không có ô tick đại diện (vd 'split_bill') — set khi bấm áp dụng mẫu, giữ riêng
    // biến này thay vì dò lại theo tên vai trò (tên có thể bị đổi sau khi áp mẫu).
    let appliedExtraReal = [];

    const modal = openModal(`
      <h3>${isEdit ? 'Sửa vai trò tuỳ chỉnh' : 'Tạo vai trò'}</h3>
      ${isEdit ? '' : `
      <div class="role-tpl-chip-row" id="vt-tpl-row">
        ${roleTemplates.map((t) => `<button type="button" class="role-tpl-chip" data-tpl="${escapeHtml(t.id)}" title="${escapeHtml(t.desc)}">${escapeHtml(t.name)}</button>`).join('')}
      </div>`}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div class="field" style="flex:1 1 220px;margin-bottom:0">
          <label>Tên vai trò *</label>
          <input id="vt-name" type="text" placeholder="Nhập tên vai trò" value="${escapeHtml(existing?.name || '')}" />
        </div>
        <div class="field" style="flex:1 1 220px;margin-bottom:0">
          <label>Mô tả</label>
          <input id="vt-desc" type="text" placeholder="Nhập mô tả" value="${escapeHtml(existing?.description || '')}" />
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <b>Phân quyền</b>
        <span id="vt-count" class="role-perm-count"></span>
      </div>
      <div class="role-modal-grid">
        <div class="role-cat-sidebar" id="vt-cat-list"></div>
        <div class="role-leaf-panel">
          <div style="padding:10px">
            <input id="vt-leaf-q" type="search" placeholder="Tìm quyền…" />
          </div>
          <div id="vt-leaf-list" class="role-leaf-list"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="vt-save" class="btn btn-primary" style="flex:1">${isEdit ? 'Lưu thay đổi' : 'Tạo vai trò'}</button>
        <button id="vt-cancel" class="btn" type="button">Hủy</button>
      </div>
    `);
    const ov = modal.overlay;

    function syncCount() {
      ov.querySelector('#vt-count').textContent = `Đã chọn ${selected.size}/${totalPerms} quyền`;
    }

    function renderCatSidebar() {
      const catEl = ov.querySelector('#vt-cat-list');
      catEl.innerHTML = catalog.map((g) => {
        const n = g.leaves.filter((l) => selected.has(fineKey(g.key, l.key))).length;
        return `<div class="role-cat-item ${g.key === activeGroup ? 'active' : ''}" data-cat="${escapeHtml(g.key)}">
          <span class="inline-ico">${catIcon(g.key)}</span>
          <span class="role-cat-label">${escapeHtml(g.label)}</span>
          <span class="role-cat-count">${n}/${g.leaves.length}</span>
        </div>`;
      }).join('');
      catEl.querySelectorAll('[data-cat]').forEach((el) => {
        el.addEventListener('click', () => {
          activeGroup = el.dataset.cat;
          leafFilter = '';
          ov.querySelector('#vt-leaf-q').value = '';
          renderCatSidebar();
          renderLeafPanel();
        });
      });
    }

    function renderLeafPanel() {
      const g = catalog.find((x) => x.key === activeGroup);
      const listEl = ov.querySelector('#vt-leaf-list');
      if (!g) { listEl.innerHTML = ''; return; }
      const q = leafFilter.trim().toLowerCase();
      const leaves = q ? g.leaves.filter((l) => l.label.toLowerCase().includes(q)) : g.leaves;
      const allChecked = g.leaves.length > 0 && g.leaves.every((l) => selected.has(fineKey(g.key, l.key)));
      listEl.innerHTML = `
        <label class="role-leaf-row role-leaf-all">
          <input type="checkbox" id="vt-leaf-all" ${allChecked ? 'checked' : ''} />
          <span>Tất cả — ${escapeHtml(g.label)}</span>
        </label>
        ${leaves.map((l) => {
          const key = fineKey(g.key, l.key);
          return `<label class="role-leaf-row">
            <input type="checkbox" data-leaf="${escapeHtml(key)}" ${selected.has(key) ? 'checked' : ''} />
            <span>${escapeHtml(l.label)}</span>
          </label>`;
        }).join('')}
        ${!leaves.length ? '<p style="padding:8px;color:var(--text-2)">Không tìm thấy quyền nào.</p>' : ''}
      `;
      listEl.querySelector('#vt-leaf-all').addEventListener('change', (e) => {
        g.leaves.forEach((l) => {
          const key = fineKey(g.key, l.key);
          if (e.target.checked) selected.add(key); else selected.delete(key);
        });
        syncCount();
        renderCatSidebar();
        renderLeafPanel();
      });
      listEl.querySelectorAll('[data-leaf]').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(cb.dataset.leaf); else selected.delete(cb.dataset.leaf);
          syncCount();
          renderCatSidebar();
        });
      });
    }

    renderCatSidebar();
    renderLeafPanel();
    syncCount();

    ov.querySelector('#vt-leaf-q').addEventListener('input', (e) => { leafFilter = e.target.value; renderLeafPanel(); });

    if (!isEdit) {
      ov.querySelectorAll('.role-tpl-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tpl = roleTemplates.find((t) => t.id === btn.dataset.tpl);
          if (!tpl) return;
          const nameEl = ov.querySelector('#vt-name');
          const descEl = ov.querySelector('#vt-desc');
          if (!nameEl.value.trim()) nameEl.value = tpl.name;
          if (!descEl.value.trim()) descEl.value = tpl.desc;
          selected.clear();
          tpl.fineKeys.forEach((k) => selected.add(k));
          appliedExtraReal = tpl.extraReal || [];
          syncCount();
          renderCatSidebar();
          renderLeafPanel();
          toast(`Đã áp dụng mẫu "${tpl.name}"`);
        });
      });
    }

    ov.querySelector('#vt-cancel').addEventListener('click', modal.close);
    ov.querySelector('#vt-save').addEventListener('click', async () => {
      const name = ov.querySelector('#vt-name').value.trim();
      const description = ov.querySelector('#vt-desc').value.trim();
      if (!name) { toast('Vui lòng nhập tên vai trò', 'error'); return; }
      const permissions = [...selected, ...appliedExtraReal];
      const btn = ov.querySelector('#vt-save');
      btn.disabled = true;
      try {
        if (isEdit) {
          await api.patch(`/api/mgr/staff/custom-roles/${existing.id}`, { name, description, permissions });
          toast('Đã cập nhật vai trò');
        } else {
          await api.post('/api/mgr/staff/custom-roles', { name, description, permissions });
          toast('Đã tạo vai trò mới');
        }
        modal.close();
        await reload();
      } catch (err) {
        toast(err?.body?.error === 'name_already_exists' ? 'Tên vai trò đã tồn tại' :
              err?.body?.error === 'name_conflicts_builtin_role' ? 'Tên trùng với vai trò hệ thống' :
              'Lỗi khi lưu vai trò', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function deleteCustomRole(cr) {
    if (!(await confirmDialog(`Xoá vai trò "${cr.name}"? Nhân viên đang dùng vai trò này sẽ không thể đăng nhập.`, { danger: true }))) return;
    try {
      await api.del(`/api/mgr/staff/custom-roles/${cr.id}`);
      toast(`Đã xoá vai trò "${cr.name}"`);
      await reload();
    } catch (err) {
      toast(err?.body?.message || (err?.body?.error === 'role_in_use' ? 'Vai trò đang được nhân viên sử dụng' : 'Lỗi khi xoá'), 'error');
    }
  }

  async function reload() {
    try {
      const res = await api.get('/api/mgr/staff/custom-roles');
      customRoles = res.custom_roles || [];
    } catch { /* giữ danh sách cũ nếu tải lại lỗi */ }
    renderList();
  }

  renderList();
}
