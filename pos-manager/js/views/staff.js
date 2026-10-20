// T14 — Quản lý nhân viên (chỉ owner mở được, server chặn 403 nếu không phải owner).
// Nhân viên/Vai trò v2 (17-18/08/2026) — viết lại theo ảnh app.sobanhang.com/staff/management
// (Website v2\Nhân viên\Quản lý nhân viên, 3 ảnh): bảng NHÂN VIÊN | VAI TRÒ LIÊN KẾT | TÌNH TRẠNG,
// tìm theo SĐT, phân trang, menu "…" (Sửa / Đặt lại PIN / Khoá-Mở khoá / Xoá), vai trò chọn được
// CẢ vai trò tuỳ chỉnh (trước đây modal chỉ có 5 vai trò hệ thống — xem routes/staff.js isValidRole).
// Task 3 (29/08/2026) — hồ sơ nhân viên ĐẦY ĐỦ do chủ quán điền hộ (nhân viên không tự đăng ký
// tài khoản được): email khôi phục mật khẩu, ảnh đại diện, ghi chú; chủ quán XEM LẠI ĐƯỢC mã PIN
// của mọi người và đặt PIN theo ý mình. Xem src/pos-manager/routes/staff.js + auth/pin-crypto.js.
import { api, getApiBase } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog, pageTabsHtml, resolveImg } from '../ui.js';
import { icon } from '../icons.js';

// Xuất dùng chung cho khối tài khoản ở thanh trên (app.js) — tránh 2 bảng nhãn vai trò lệch nhau.
export const ROLE_LABEL = { owner: 'Chủ quán', manager: 'Quản lý', cashier: 'Thu ngân', waiter: 'Ghi đơn', kitchen: 'Bếp' };
const ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];

function initialOf(name) {
  const s = String(name || '?').trim();
  return s ? s[0].toUpperCase() : '?';
}

// Ảnh đại diện nhân viên — cùng khuôn .kh-ava với màn Khách hàng để cả app một kiểu.
function avatarHtml(s) {
  return s.avatar_url
    ? `<img class="kh-ava" src="${escapeHtml(resolveImg(s.avatar_url))}" alt="" loading="lazy" />`
    : `<span class="kh-ava kh-ava-txt">${escapeHtml(initialOf(s.name))}</span>`;
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
    return staffList.filter((s) => (s.phone || '').toLowerCase().includes(q)
      || (s.name || '').toLowerCase().includes(q)
      || (s.email || '').toLowerCase().includes(q));
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
      <div class="sbh-card" style="padding:0">
      <div class="sbh-card-tools">
        <input id="staff-q" class="sbh-card-search" type="search" placeholder="Tìm theo tên, số điện thoại" value="${escapeHtml(state.q)}" />
      </div>
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:680px;border-radius:0">
          <thead>
            <tr><th>Nhân viên</th><th>Email khôi phục</th><th>Vai trò liên kết</th><th>Tình trạng</th><th></th></tr>
          </thead>
          <tbody>
            ${!pageItems.length
              ? `<tr><td colspan="5"><p style="margin:12px 0;color:var(--text-2)">${list.length ? 'Không tìm thấy nhân viên nào.' : 'Chưa có nhân viên.'}</p></td></tr>`
              : pageItems.map((s) => `
              <tr class="${s.active ? '' : 'row-inactive'}">
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    ${avatarHtml(s)}
                    <div>
                      <div style="font-weight:600">${escapeHtml(s.name)}</div>
                      <div style="font-size:12px;color:var(--text-2)">${escapeHtml(s.phone)}</div>
                    </div>
                  </div>
                </td>
                <td>${s.email
                  ? escapeHtml(s.email)
                  : '<span style="color:var(--text-3)">Chưa có — quên PIN sẽ không tự lấy lại được</span>'}</td>
                <td><span class="badge-default">${escapeHtml(roleLabel(s.role))}</span></td>
                <td>${statusBadge(s)}</td>
                <td class="dm-act"><div class="dm-kebab-wrap"><button class="ord-kebab" data-menu="${s.id}" aria-label="Thao tác">${icon('them')}</button><div class="dm-kebab-menu hidden"><button type="button" data-act="edit">Sửa thông tin</button><button type="button" data-act="view-pin">Xem mã PIN</button><button type="button" data-act="reset-pin">Đặt lại PIN</button><button type="button" data-act="toggle">${s.active ? 'Khoá' : 'Mở khoá'}</button><button type="button" data-act="delete" class="danger">Xoá</button></div></div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="ord-pager">
        <span style="color:var(--text-2,#888);font-size:13px">Hiển thị ${list.length ? start + 1 : 0}-${Math.min(start + state.pageSize, list.length)} / ${list.length} kết quả</span>
        <div class="ord-pager-ctrl">
          <span style="font-size:13px;color:var(--text-2,#888)">Hiển thị dòng</span>
          <select id="staff-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px">
            ${[10, 20, 50].map(n => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <button class="ord-page-btn" id="staff-prev" ${state.page <= 1 ? 'disabled' : ''}>&#8249;</button>
          <span class="ord-page-cur">${state.page} / ${totalPages}</span>
          <button class="ord-page-btn" id="staff-next" ${state.page >= totalPages ? 'disabled' : ''}>&#8250;</button>
        </div>
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
    const sizeEl = body.querySelector('#staff-page-size');
    if (sizeEl) sizeEl.addEventListener('change', () => { state.pageSize = parseInt(sizeEl.value, 10); state.page = 1; renderStaffList(); });

    const closeAll = () => body.querySelectorAll('.dm-kebab-menu').forEach(m => m.classList.add('hidden'));
    body.querySelectorAll('.ord-kebab[data-menu]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const menu = btn.parentElement.querySelector('.dm-kebab-menu');
        const willOpen = menu.classList.contains('hidden');
        closeAll(); menu.classList.toggle('hidden', !willOpen);
      });
    });
    document.addEventListener('click', closeAll);
    body.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeAll();
        const id = parseInt(btn.closest('.dm-kebab-wrap')?.querySelector('[data-menu]')?.dataset.menu, 10);
        const s = staffList.find(x => x.id === id);
        if (!s) return;
        const act = btn.dataset.act;
        if (act === 'edit') openEditModal(s);
        else if (act === 'view-pin') viewPin(s);
        else if (act === 'reset-pin') resetPin(s);
        else if (act === 'toggle') toggleActive(s);
        else if (act === 'delete') deleteStaff(s);
      });
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
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Sửa thông tin</button>
      <button type="button" role="menuitem" data-act="view-pin">${icon('tim-kiem')} Xem mã PIN</button>
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
      else if (act.dataset.act === 'view-pin') viewPin(s);
      else if (act.dataset.act === 'reset-pin') resetPin(s);
      else if (act.dataset.act === 'toggle') toggleActive(s);
      else if (act.dataset.act === 'delete') deleteStaff(s);
    });
  }
  document.addEventListener('click', closeRowMenu);

  // Task 3 (29/08/2026) — mã PIN nay xem lại được bất cứ lúc nào ở mục "Xem mã PIN" (chủ quán),
  // nên bỏ câu "chỉ hiện một lần duy nhất" của bản cũ: nó không còn đúng và làm chủ quán hoảng.
  function showPinModal(name, pin) {
    openModal(`
      <h3>Mã PIN của ${escapeHtml(name)}</h3>
      <p style="font-size:32px;font-weight:700;text-align:center;letter-spacing:4px">${escapeHtml(pin)}</p>
      <p class="kh-hint" style="text-align:center">Chủ quán xem lại mã này bất cứ lúc nào ở menu “…” &gt; Xem mã PIN.</p>
    `);
  }

  async function viewPin(staff) {
    try {
      const res = await api.get(`/api/mgr/staff/${staff.id}/pin`);
      showPinModal(res.staff?.name || staff.name, res.pin);
    } catch (err) {
      toast(err?.body?.message || 'Không xem được mã PIN', 'error');
    }
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

  // 4 ô hồ sơ dùng CHUNG cho hộp thoại Thêm và Sửa — hai bản chép riêng chắc chắn có ngày lệch.
  function profileFieldsHtml(s = {}) {
    return `
      <div class="field"><label>Tên nhân viên</label>
        <input id="sf-name" type="text" value="${escapeHtml(s.name || '')}" placeholder="VD: Nguyễn Thị Lan" /></div>
      <div class="field"><label>Số điện thoại <small>(dùng để đăng nhập)</small></label>
        <input id="sf-phone" type="tel" value="${escapeHtml(s.phone || '')}" placeholder="VD: 0912345678" /></div>
      <div class="field"><label>Email <small>(để lấy lại mật khẩu khi quên PIN)</small></label>
        <input id="sf-email" type="email" value="${escapeHtml(s.email || '')}" placeholder="VD: nhanvien@gmail.com" /></div>
      <div class="field"><label>Ghi chú <small>(tuỳ chọn)</small></label>
        <input id="sf-note" type="text" value="${escapeHtml(s.note || '')}" placeholder="VD: Ca sáng, phụ trách quầy" /></div>`;
  }

  function readProfile(overlay) {
    return {
      name: overlay.querySelector('#sf-name').value.trim(),
      phone: overlay.querySelector('#sf-phone').value.trim(),
      email: overlay.querySelector('#sf-email').value.trim(),
      note: overlay.querySelector('#sf-note').value.trim(),
    };
  }

  function openAddModal() {
    const modal = openModal(`
      <h3>Thêm nhân viên mới</h3>
      ${profileFieldsHtml()}
      ${roleFieldHtml('sf')}
      <p class="kh-hint">Tạo xong sẽ hiện mã PIN 6 số để đưa cho nhân viên. Ảnh đại diện đặt ở
        menu “…” &gt; Sửa thông tin.</p>
      <button id="sf-submit" class="btn btn-primary" style="width:100%;margin-top:8px">Tạo nhân viên</button>
    `);
    // Mặc định 'waiter' (Ghi đơn), KHÔNG phải 'owner' (Chủ quán) — tránh lỡ tay tạo thêm một chủ
    // quán có toàn quyền khi người tạo quên đổi vai trò trong hộp thoại.
    const roleDd = bindRoleDropdown(modal.overlay, 'waiter');
    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const p = readProfile(modal.overlay);
      if (!p.name || !p.phone) { toast('Vui lòng nhập đủ tên và số điện thoại', 'error'); return; }
      try {
        const res = await api.post('/api/mgr/staff', { ...p, role: roleDd.getValue() });
        modal.close();
        showPinModal(p.name, res.pin);
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được nhân viên', 'error');
      }
    });
  }

  function openEditModal(staff) {
    const modal = openModal(`
      <h3>Sửa thông tin ${escapeHtml(staff.name)}</h3>
      <div class="kh-edit-ava">
        <span id="sf-ava-box">${avatarHtml(staff)}</span>
        <div>
          <button type="button" class="btn" id="sf-ava-pick">Đổi ảnh đại diện</button>
          <button type="button" class="btn btn-danger" id="sf-ava-del" ${staff.avatar_url ? '' : 'hidden'}>Bỏ ảnh</button>
          <p class="kh-hint">Ảnh PNG/JPG, tự thu về 128×128.</p>
        </div>
        <input type="file" id="sf-ava-file" accept="image/png,image/jpeg" hidden />
      </div>
      ${profileFieldsHtml(staff)}
      ${roleFieldHtml('sf')}
      <div class="field"><label>Đổi mã PIN <small>(6 số — để trống nếu không đổi)</small></label>
        <input id="sf-pin" type="text" inputmode="numeric" maxlength="6" placeholder="VD: 246810" /></div>
      <button id="sf-submit" class="btn btn-primary" style="width:100%;margin-top:8px">Lưu</button>
    `);
    const roleDd = bindRoleDropdown(modal.overlay, staff.role);

    // Ảnh đại diện: gửi THẲNG tệp làm thân yêu cầu (Content-Type: image/...), máy chủ đọc bằng
    // express.raw — cùng cách với ảnh khách hàng, xem routes/staff.js.
    const fileInput = modal.overlay.querySelector('#sf-ava-file');
    modal.overlay.querySelector('#sf-ava-pick').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const res = await fetch(`${getApiBase()}/api/mgr/staff/${staff.id}/avatar`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': file.type }, body: file,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Không tải được ảnh lên');
        staff.avatar_url = body.avatar_url;
        modal.overlay.querySelector('#sf-ava-box').innerHTML = avatarHtml(staff);
        modal.overlay.querySelector('#sf-ava-del').hidden = false;
        toast('Đã cập nhật ảnh đại diện');
        await load();
      } catch (err) {
        toast(err.message || 'Không tải được ảnh lên', 'error');
      } finally {
        fileInput.value = '';
      }
    });
    modal.overlay.querySelector('#sf-ava-del').addEventListener('click', async () => {
      try {
        await api.patch(`/api/mgr/staff/${staff.id}`, { avatar_url: '' });
        staff.avatar_url = null;
        modal.overlay.querySelector('#sf-ava-box').innerHTML = avatarHtml(staff);
        modal.overlay.querySelector('#sf-ava-del').hidden = true;
        toast('Đã bỏ ảnh đại diện');
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không bỏ được ảnh', 'error');
      }
    });

    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const p = readProfile(modal.overlay);
      if (!p.name || !p.phone) { toast('Vui lòng nhập đủ tên và số điện thoại', 'error'); return; }
      const pin = modal.overlay.querySelector('#sf-pin').value.trim();
      if (pin && !/^\d{6}$/.test(pin)) { toast('Mã PIN phải đúng 6 chữ số', 'error'); return; }
      // Bỏ trống ô PIN thì KHÔNG gửi khoá `pin` lên — máy chủ chỉ đổi PIN khi khoá này có mặt.
      const payload = { ...p, role: roleDd.getValue(), ...(pin ? { pin } : {}) };
      try {
        await api.patch(`/api/mgr/staff/${staff.id}`, payload);
        toast(pin ? 'Đã lưu và đổi mã PIN' : 'Đã lưu');
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
