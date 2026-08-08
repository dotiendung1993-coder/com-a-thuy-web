// T14 — Quản lý nhân viên (chỉ owner mở được, server chặn 403 nếu không phải owner).
import { api } from '../api.js';
import { escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

const ROLE_LABEL = { owner: 'Chủ quán', manager: 'Quản lý', cashier: 'Thu ngân', waiter: 'Phục vụ', kitchen: 'Bếp' };
const ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
const PERMS = [
  ['sell', 'Lên đơn'],
  ['pay', 'Nhận tiền'],
  ['cancel_order', 'Huỷ đơn'],
  ['view_all_orders', 'Xem mọi đơn (không chỉ đơn mình)'],
  ['kitchen', 'Màn hình Bếp'],
  ['manage_staff', 'Quản lý nhân viên'],
];
// Khớp PERMISSIONS trong src/pos-manager/config.js — bảng chỉ đọc, GĐ6 mới cho tuỳ chỉnh vai trò.
const PERMISSIONS = {
  sell: ['owner', 'manager', 'cashier', 'waiter'],
  pay: ['owner', 'manager', 'cashier'],
  cancel_order: ['owner', 'manager'],
  view_all_orders: ['owner', 'manager', 'cashier'],
  kitchen: ['owner', 'manager', 'kitchen'],
  manage_staff: ['owner'],
};

export async function render(container) {
  let tab = 'nhan-vien';
  let staffList = [];

  container.innerHTML = `
    <div class="orders-tabs">
      <button class="chip active" data-tab="nhan-vien">Nhân viên</button>
      <button class="chip" data-tab="vai-tro">Vai trò</button>
    </div>
    <div id="staff-body"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      container.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      renderBody();
    });
  });

  function renderRolesTable() {
    const body = container.querySelector('#staff-body');
    body.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr><th>Quyền</th>${ROLES.map((r) => `<th>${ROLE_LABEL[r]}</th>`).join('')}</tr></thead>
          <tbody>
            ${PERMS.map(([key, label]) => `
              <tr>
                <td>${escapeHtml(label)}</td>
                ${ROLES.map((r) => `<td class="perm-cell">${PERMISSIONS[key].includes(r) ? `<span class="inline-ico perm-yes">${icon('ok')}</span>` : ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStaffList() {
    const body = container.querySelector('#staff-body');
    body.innerHTML = `
      <button id="staff-add" class="btn btn-primary" style="width:100%;margin-bottom:10px">+ Thêm nhân viên</button>
      <div id="staff-rows"></div>
    `;
    const rowsEl = body.querySelector('#staff-rows');
    if (!staffList.length) { rowsEl.innerHTML = '<p>Chưa có nhân viên.</p>'; }
    else {
      rowsEl.innerHTML = staffList.map((s) => `
        <div class="staff-row ${s.active ? '' : 'inactive'}">
          <div class="staff-row-main">
            <div class="staff-name">${escapeHtml(s.name)}</div>
            <div class="staff-meta">${escapeHtml(s.phone)} · ${ROLE_LABEL[s.role] || s.role}${s.active ? '' : ' · Đã khoá'}</div>
          </div>
          <div class="staff-row-actions">
            <button data-action="edit" data-id="${s.id}">Sửa</button>
            <button data-action="reset-pin" data-id="${s.id}">Đặt lại PIN</button>
            <button data-action="toggle" data-id="${s.id}">${s.active ? 'Khoá' : 'Mở khoá'}</button>
          </div>
        </div>
      `).join('');
    }

    body.querySelector('#staff-add').addEventListener('click', openAddModal);
    rowsEl.querySelectorAll('[data-action]').forEach((btn) => {
      const id = parseInt(btn.dataset.id, 10);
      const staff = staffList.find((s) => s.id === id);
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'edit') openEditModal(staff);
        else if (btn.dataset.action === 'reset-pin') resetPin(staff);
        else if (btn.dataset.action === 'toggle') toggleActive(staff);
      });
    });
  }

  function showPinModal(name, pin) {
    openModal(`
      <h3>Mã PIN của ${escapeHtml(name)}</h3>
      <p>Ghi lại ngay — mã này chỉ hiện <b>một lần duy nhất</b>:</p>
      <p style="font-size:32px;font-weight:700;text-align:center;letter-spacing:4px">${escapeHtml(pin)}</p>
    `);
  }

  function openAddModal() {
    const modal = openModal(`
      <h3>Thêm nhân viên</h3>
      <div class="field"><label>Tên</label><input id="sf-name" type="text" /></div>
      <div class="field"><label>Số điện thoại</label><input id="sf-phone" type="tel" /></div>
      <div class="field"><label>Vai trò</label>
        <select id="sf-role">${ROLES.map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select>
      </div>
      <button id="sf-submit" class="btn btn-primary" style="width:100%">Tạo nhân viên</button>
    `);
    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sf-name').value.trim();
      const phone = modal.overlay.querySelector('#sf-phone').value.trim();
      const role = modal.overlay.querySelector('#sf-role').value;
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
      <div class="field"><label>Vai trò</label>
        <select id="sf-role">${ROLES.map((r) => `<option value="${r}" ${r === staff.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
      </div>
      <button id="sf-submit" class="btn btn-primary" style="width:100%">Lưu</button>
    `);
    modal.overlay.querySelector('#sf-submit').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sf-name').value.trim();
      const role = modal.overlay.querySelector('#sf-role').value;
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

  function renderBody() {
    if (tab === 'vai-tro') renderRolesTable();
    else renderStaffList();
  }

  async function load() {
    try {
      const res = await api.get('/api/mgr/staff');
      staffList = res.staff;
      renderBody();
    } catch (err) {
      container.querySelector('#staff-body').innerHTML = err?.status === 403
        ? '<p>Chỉ chủ quán mới xem được màn này.</p>'
        : '<p>Không tải được danh sách nhân viên.</p>';
    }
  }

  await load();
}
