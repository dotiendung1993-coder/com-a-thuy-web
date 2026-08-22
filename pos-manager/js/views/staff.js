// T14 — Quản lý nhân viên (chỉ owner mở được, server chặn 403 nếu không phải owner).
// Nhân viên/Vai trò v2 (17-18/08/2026) — viết lại theo ảnh app.sobanhang.com/staff/management
// (Website v2\Nhân viên\Quản lý nhân viên, 3 ảnh): bảng NHÂN VIÊN | VAI TRÒ LIÊN KẾT | TÌNH TRẠNG,
// tìm theo SĐT, phân trang, menu "…" (Sửa / Đặt lại PIN / Khoá-Mở khoá / Xoá), vai trò chọn được
// CẢ vai trò tuỳ chỉnh (trước đây modal chỉ có 5 vai trò hệ thống — xem routes/staff.js isValidRole).
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

const ROLE_LABEL = { owner: 'Chủ quán', manager: 'Quản lý', cashier: 'Thu ngân', waiter: 'Ghi đơn', kitchen: 'Bếp' };
const ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];

function initialOf(name) {
  const s = String(name || '?').trim();
  return s ? s[0].toUpperCase() : '?';
}

export async function render(container, { staff: me } = {}) {
  let staffList = [];
  let customRoles = [];
  let state = { q: '', page: 1, pageSize: 10 };

  container.innerHTML = `
    ${pageTabsHtml('nhan-vien', me)}
    <div id="staff-body"><p>Đang tải…</p></div>
  `;

  // Nhãn vai trò hiển thị ở cột "VAI TRÒ LIÊN KẾT" — vai trò hệ thống dùng nhãn cũ, vai trò tuỳ
  // chỉnh dùng đúng tên đã đặt.
  function roleLabel(role) {
    return ROLE_LABEL[role] || role;
  }

  function statusBadge(s) {
    return s.active
      ? '<span class="badge-ok">Đang hoạt động</span>'
      : '<span class="badge badge-danger">Đã khoá</span>';
  }

  function filteredList() {
    const q = state.q.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) => (s.phone || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q));
  }

  function renderStaffList() {
    const body = container.querySelector('#staff-body');
    const list = filteredList();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageItems = list.slice(start, start + state.pageSize);

    body.innerHTML = `
      <div class="page-head">
        <h2>Quản lý nhân viên</h2>
        <button id="staff-add" class="btn btn-primary" type="button">
          <span class="inline-ico">${icon('them')}</span> Thêm nhân viên
        </button>
      </div>
      <div class="filter-row">
        <input id="staff-q" type="search" placeholder="Tìm số điện thoại nhân viên" value="${escapeHtml(state.q)}" />
      </div>
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:520px">
          <thead>
            <tr><th>Nhân viên</th><th>Vai trò liên kết</th><th>Tình trạng</th><th></th></tr>
          </thead>
          <tbody>
            ${!pageItems.length
              ? `<tr><td colspan="4"><p style="margin:12px 0;color:var(--text-2)">${list.length ? 'Không tìm thấy nhân viên nào.' : 'Chưa có nhân viên.'}</p></td></tr>`
              : pageItems.map((s) => `
              <tr class="${s.active ? '' : 'row-inactive'}">
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <span class="kh-ava kh-ava-txt">${escapeHtml(initialOf(s.name))}</span>
                    <div>
                      <div style="font-weight:600">${escapeHtml(s.name)}</div>
                      <div style="font-size:12px;color:var(--text-2)">${escapeHtml(s.phone)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge-default">${escapeHtml(roleLabel(s.role))}</span></td>
                <td>${statusBadge(s)}</td>
                <td style="text-align:right">
                  <button class="ord-kebab" data-menu="${s.id}" aria-haspopup="menu" aria-expanded="false"
                    aria-label="Thao tác với nhân viên ${escapeHtml(s.name)}">${icon('them')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:12px;flex-wrap:wrap">
        <span style="color:var(--text-2);font-size:13px">Hiển thị ${list.length ? start + 1 : 0}–${Math.min(start + state.pageSize, list.length)} / ${list.length} kết quả</span>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="btn" type="button" id="staff-prev" ${state.page <= 1 ? 'disabled' : ''}>‹</button>
          <span style="font-size:13px;padding:0 6px">${state.page}</span>
          <button class="btn" type="button" id="staff-next" ${state.page >= totalPages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    `;

    body.querySelector('#staff-add').addEventListener('click', openAddModal);
    const qEl = body.querySelector('#staff-q');
    let searchTimer = null;
    qEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = qEl.value; state.page = 1; renderStaffList(); }, 250);
    });
    body.querySelector('#staff-prev').addEventListener('click', () => { state.page--; renderStaffList(); });
    body.querySelector('#staff-next').addEventListener('click', () => { state.page++; renderStaffList(); });

    body.querySelectorAll('.ord-kebab').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
    });
  }

  // Menu 3 chấm — dùng chung .row-menu với Đơn hàng/Khách hàng/Sản phẩm (xem ghi chú CSS .row-menu).
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const id = parseInt(btn.dataset.menu, 10);
    const s = staffList.find((x) => x.id === id);
    if (!s) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Sửa</button>
      <button type="button" role="menuitem" data-act="reset-pin">${icon('ma-qr')} Đặt lại PIN</button>
      <button type="button" role="menuitem" data-act="toggle">${icon('cai-dat')} ${s.active ? 'Khoá' : 'Mở khoá'}</button>
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
      if (act.dataset.act === 'edit') openEditModal(s);
      else if (act.dataset.act === 'reset-pin') resetPin(s);
      else if (act.dataset.act === 'toggle') toggleActive(s);
      else if (act.dataset.act === 'delete') deleteStaff(s);
    });
  }
  document.addEventListener('click', closeRowMenu);

  function showPinModal(name, pin) {
    openModal(`
      <h3>Mã PIN của ${escapeHtml(name)}</h3>
      <p>Ghi lại ngay — mã này chỉ hiện <b>một lần duy nhất</b>:</p>
      <p style="font-size:32px;font-weight:700;text-align:center;letter-spacing:4px">${escapeHtml(pin)}</p>
    `);
  }

  // Ô "Vai trò" — dropdown tìm-được như ảnh (Tìm kiếm + tick ở vai trò đang chọn), gồm cả 5 vai
  // trò hệ thống lẫn vai trò tuỳ chỉnh đã tạo ở màn Vai trò (trước đây modal này chỉ có <select>
  // 5 vai trò hệ thống nên KHÔNG gán được vai trò tuỳ chỉnh cho nhân viên mới/sửa).
  function roleOptions() {
    return [
      ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
      ...customRoles.map((cr) => ({ value: cr.name, label: cr.name })),
    ];
  }

  function bindRoleDropdown(overlay, initialValue) {
    const btn = overlay.querySelector('#sf-role-btn');
    const drop = overlay.querySelector('#sf-role-drop');
    const qEl = overlay.querySelector('#sf-role-q');
    const listEl = overlay.querySelector('#sf-role-list');
    let value = initialValue;
    const opts = roleOptions();
    const label = () => opts.find((o) => o.value === value)?.label || value;
    btn.textContent = label() + ' ▾';

    function renderOpts(q) {
      const filtered = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;
      listEl.innerHTML = filtered.length
        ? filtered.map((o) => `<div class="row-menu-item" data-v="${escapeHtml(o.value)}" style="display:flex;align-items:center;gap:6px">
            ${o.value === value ? `<span class="inline-ico" style="color:var(--primary)">${icon('ok')}</span>` : '<span style="width:14px"></span>'} ${escapeHtml(o.label)}
          </div>`).join('')
        : '<p style="padding:6px 8px;margin:0;color:var(--text-2)">Không tìm thấy</p>';
      listEl.querySelectorAll('[data-v]').forEach((el) => {
        el.addEventListener('click', () => {
          value = el.dataset.v;
          btn.textContent = label() + ' ▾';
          drop.hidden = true;
        });
      });
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.hidden = !drop.hidden;
      if (!drop.hidden) { qEl.value = ''; renderOpts(''); qEl.focus(); }
    });
    qEl.addEventListener('input', () => renderOpts(qEl.value));
    document.addEventListener('click', () => { drop.hidden = true; });
    drop.addEventListener('click', (e) => e.stopPropagation());
    return { getValue: () => value };
  }

  function roleFieldHtml(idPrefix) {
    return `
      <div class="field">
        <label>Vai trò</label>
        <div style="position:relative">
          <button type="button" id="${idPrefix}-role-btn" class="btn" style="width:100%;text-align:left;background:#fff"></button>
          <div id="${idPrefix}-role-drop" hidden style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);margin-top:4px;max-height:240px;overflow-y:auto">
            <input id="${idPrefix}-role-q" type="search" placeholder="Tìm kiếm…" style="margin-bottom:6px" />
            <div id="${idPrefix}-role-list"></div>
          </div>
        </div>
      </div>`;
  }

  function openAddModal() {
    const modal = openModal(`
      <h3>Thêm nhân viên mới</h3>
      <div class="field"><label>Tên nhân viên</label><input id="sf-name" type="text" /></div>
      <div class="field"><label>Số điện thoại</label><input id="sf-phone" type="tel" /></div>
      ${roleFieldHtml('sf')}
      <button id="sf-submit" class="btn btn-primary" style="width:100%;margin-top:8px">Tạo nhân viên</button>
    `);
    const roleDd = bindRoleDropdown(modal.overlay, ROLES[0]);
    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sf-name').value.trim();
      const phone = modal.overlay.querySelector('#sf-phone').value.trim();
      const role = roleDd.getValue();
      if (!name || !phone) { toast('Vui lòng nhập đủ tên và số điện thoại', 'error'); return; }
      try {
        const res = await api.post('/api/mgr/staff', { name, phone, role });
        modal.close();
        showPinModal(name, res.pin);
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được nhân viên', 'error');
      }
    });
  }

  function openEditModal(staff) {
    const modal = openModal(`
      <h3>Sửa ${escapeHtml(staff.name)}</h3>
      <div class="field"><label>Tên</label><input id="sf-name" type="text" value="${escapeHtml(staff.name)}" /></div>
      ${roleFieldHtml('sf')}
      <button id="sf-submit" class="btn btn-primary" style="width:100%;margin-top:8px">Lưu</button>
    `);
    const roleDd = bindRoleDropdown(modal.overlay, staff.role);
    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sf-name').value.trim();
      const role = roleDd.getValue();
      try {
        await api.patch(`/api/mgr/staff/${staff.id}`, { name, role });
        toast('Đã lưu');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  async function resetPin(staff) {
    try {
      const res = await api.post(`/api/mgr/staff/${staff.id}/reset-pin`, {});
      showPinModal(staff.name, res.pin);
    } catch (err) {
      toast(err?.body?.message || 'Không đặt lại được PIN', 'error');
    }
  }

  async function toggleActive(staff) {
    try {
      await api.patch(`/api/mgr/staff/${staff.id}`, { active: !staff.active });
      toast(staff.active ? 'Đã khoá nhân viên' : 'Đã mở khoá nhân viên');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không cập nhật được', 'error');
    }
  }

  async function deleteStaff(staff) {
    if (!(await confirmDialog(`Xoá hẳn nhân viên "${staff.name}"? Không thể hoàn tác.`, { danger: true }))) return;
    try {
      await api.del(`/api/mgr/staff/${staff.id}`);
      toast(`Đã xoá "${staff.name}"`);
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được', 'error');
    }
  }

  async function load() {
    try {
      const res = await api.get('/api/mgr/staff');
      staffList = res.staff;
      try {
        const crRes = await api.get('/api/mgr/staff/custom-roles');
        customRoles = crRes.custom_roles || [];
      } catch { customRoles = []; }
      renderStaffList();
    } catch (err) {
      container.querySelector('#staff-body').innerHTML = err?.status === 403
        ? '<p>Chỉ chủ quán mới xem được màn này.</p>'
        : '<p>Không tải được danh sách nhân viên.</p>';
    }
  }

  await load();
}
