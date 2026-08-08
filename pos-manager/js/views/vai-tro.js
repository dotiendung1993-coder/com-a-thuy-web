// GĐ13 — Vai trò nhân viên: xem ma trận quyền built-in + tạo/sửa/xoá vai trò tuỳ chỉnh.
import { api } from '../api.js';
import { escapeHtml, openModal, toast } from '../ui.js';

const ROLE_LABEL = {
  owner:   'Chủ quán',
  manager: 'Quản lý',
  cashier: 'Thu ngân',
  waiter:  'Ghi đơn',
  kitchen: 'Bếp',
};

const PERM_GROUPS = [
  {
    label: 'Bán hàng',
    perms: [
      { key: 'sell',            label: 'Bán hàng / ghi đơn' },
      { key: 'pay',             label: 'Thu tiền đơn' },
      { key: 'cancel_order',    label: 'Huỷ đơn hàng' },
      { key: 'view_all_orders', label: 'Xem tất cả đơn' },
      { key: 'kitchen',         label: 'Màn hình bếp (KDS)' },
      { key: 'table_ops',       label: 'Chuyển / Tách / Gộp bàn' },
      { key: 'split_bill',      label: 'Tách hoá đơn' },
    ],
  },
  {
    label: 'Tiền & Nợ',
    perms: [
      { key: 'cash',        label: 'Xem sổ quỹ / ghi phiếu' },
      { key: 'cash_manage', label: 'Sửa nguồn tiền / chuyển tiền' },
      { key: 'debt',        label: 'Sổ nợ' },
    ],
  },
  {
    label: 'Hàng hoá & Kho',
    perms: [
      { key: 'stock',              label: 'Xem sản phẩm / tồn kho' },
      { key: 'stock_manage',       label: 'Nhập xuất kho / sửa sản phẩm' },
      { key: 'ingredient',         label: 'Xem NVL / công thức' },
      { key: 'ingredient_manage',  label: 'Sửa NVL / công thức' },
    ],
  },
  {
    label: 'Khách hàng',
    perms: [
      { key: 'customer',        label: 'Xem khách hàng' },
      { key: 'customer_manage', label: 'Sửa nhóm / điểm khách' },
      { key: 'promo',           label: 'Xem / áp khuyến mãi' },
      { key: 'promo_manage',    label: 'Tạo / sửa khuyến mãi' },
    ],
  },
  {
    label: 'Báo cáo & Quản lý',
    perms: [
      { key: 'report',         label: 'Xem báo cáo' },
      { key: 'report_manage',  label: 'Sửa giá vốn / thuế' },
      { key: 'shift',          label: 'Quản lý ca' },
      { key: 'manage_staff',   label: 'Quản lý nhân viên / vai trò' },
      { key: 'settings_manage',label: 'Cài đặt cửa hàng' },
    ],
  },
];

const ALL_PERM_KEYS = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.manage_staff) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  const isOwner = staff?.role === 'owner';

  let matrix = {};
  let customRoles = [];
  try {
    const res = await api.get('/api/mgr/staff/roles');
    matrix = res.matrix || {};
  } catch { /* fallback */ }
  try {
    const res = await api.get('/api/mgr/staff/custom-roles');
    customRoles = res.custom_roles || [];
  } catch { /* fallback */ }

  renderAll(container, matrix, customRoles, isOwner);
}

function renderAll(container, matrix, customRoles, isOwner) {
  const builtinRoles = Object.keys(ROLE_LABEL);

  const headerCells = builtinRoles.map((r) =>
    `<th class="role-col">${escapeHtml(ROLE_LABEL[r])}</th>`
  ).join('');

  const groupRows = PERM_GROUPS.map((g) => {
    const headerRow = `<tr class="perm-group-header"><td colspan="${builtinRoles.length + 1}">${escapeHtml(g.label)}</td></tr>`;
    const permRows = g.perms.map((p) => {
      const cells = builtinRoles.map((r) => {
        const allowed = Array.isArray(matrix[p.key]) ? matrix[p.key].includes(r) : false;
        return `<td class="role-check">${allowed ? '<span class="perm-yes">&#10003;</span>' : '<span class="perm-no">-</span>'}</td>`;
      }).join('');
      return `<tr><td class="perm-label">${escapeHtml(p.label)}</td>${cells}</tr>`;
    }).join('');
    return headerRow + permRows;
  }).join('');

  const customList = customRoles.length
    ? customRoles.map((cr) => `
        <div class="custom-role-item" data-id="${cr.id}">
          <span class="cr-name">${escapeHtml(cr.name)}</span>
          <span class="cr-count">${cr.permissions.length} quyền</span>
          ${isOwner ? `
            <button class="btn btn-sm cr-edit" data-id="${cr.id}">Sửa</button>
            <button class="btn btn-sm btn-danger cr-delete" data-id="${cr.id}">Xoá</button>
          ` : ''}
        </div>
      `).join('')
    : '<p style="color:var(--text-sub);margin:8px 0">Chưa có vai trò tuỳ chỉnh nào.</p>';

  container.innerHTML = `
    <h2>Vai trò nhân viên</h2>

    <div class="table-scroll">
      <table class="roles-table perm-matrix">
        <thead>
          <tr><th>Quyền</th>${headerCells}</tr>
        </thead>
        <tbody>${groupRows}</tbody>
      </table>
    </div>
    <p style="color:var(--text-sub);margin:12px 0 24px;font-size:0.9em">
      Nhân viên vai trò <b>Ghi đơn</b> chỉ thấy đơn của chính mình trong màn Đơn hàng.
    </p>

    <div class="section-header" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <h3 style="margin:0">Vai trò tuỳ chỉnh</h3>
      ${isOwner ? '<button class="btn btn-primary" id="cr-add-btn">+ Tạo vai trò mới</button>' : ''}
    </div>
    <div id="custom-roles-list">${customList}</div>
  `;

  if (isOwner) {
    container.querySelector('#cr-add-btn')?.addEventListener('click', () => openCustomRoleModal(null, container));
    container.querySelectorAll('.cr-edit').forEach((btn) => {
      const id = Number(btn.dataset.id);
      btn.addEventListener('click', () => {
        const cr = customRoles.find((r) => r.id === id);
        if (cr) openCustomRoleModal(cr, container);
      });
    });
    container.querySelectorAll('.cr-delete').forEach((btn) => {
      const id = Number(btn.dataset.id);
      const cr = customRoles.find((r) => r.id === id);
      btn.addEventListener('click', () => deleteCustomRole(id, cr?.name || '?', container));
    });
  }
}

function openCustomRoleModal(existing, container) {
  const isEdit = !!existing;
  const currentPerms = new Set(existing?.permissions || []);

  const checkboxes = PERM_GROUPS.map((g) => `
    <div style="margin:8px 0">
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(g.label)}</div>
      ${g.perms.map((p) => `
        <label style="display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer">
          <input type="checkbox" name="perm" value="${p.key}" ${currentPerms.has(p.key) ? 'checked' : ''}
            style="width:auto;min-height:auto" />
          ${escapeHtml(p.label)}
        </label>
      `).join('')}
    </div>
  `).join('');

  const modal = openModal(`
    <h3>${isEdit ? 'Sửa vai trò tuỳ chỉnh' : 'Tạo vai trò tuỳ chỉnh'}</h3>
    <div class="field">
      <label>Tên vai trò</label>
      <input id="cr-name" type="text" placeholder="VD: Phục vụ bàn" maxlength="50"
        value="${escapeHtml(existing?.name || '')}" />
    </div>
    <div class="field" style="max-height:50vh;overflow-y:auto;padding-right:4px">
      <label>Quyền được phép</label>
      ${checkboxes}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="cr-save" class="btn btn-primary" style="flex:1">${isEdit ? 'Lưu thay đổi' : 'Tạo vai trò'}</button>
      <button id="cr-select-all" class="btn" type="button">Chọn tất cả</button>
    </div>
  `);

  const overlay = modal.overlay;
  overlay.querySelector('#cr-select-all').addEventListener('click', () => {
    overlay.querySelectorAll('input[name="perm"]').forEach((cb) => { cb.checked = true; });
  });

  overlay.querySelector('#cr-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#cr-name').value.trim();
    if (!name) { toast('Vui lòng nhập tên vai trò', 'error'); return; }
    const permissions = [...overlay.querySelectorAll('input[name="perm"]:checked')].map((cb) => cb.value);
    try {
      if (isEdit) {
        await api.patch(`/api/mgr/staff/custom-roles/${existing.id}`, { name, permissions });
        toast('Đã cập nhật vai trò');
      } else {
        await api.post('/api/mgr/staff/custom-roles', { name, permissions });
        toast('Đã tạo vai trò mới');
      }
      modal.close();
      const res = await api.get('/api/mgr/staff/custom-roles');
      const list = container.querySelector('#custom-roles-list');
      if (list) {
        const cr = res.custom_roles || [];
        list.innerHTML = cr.length
          ? cr.map((r) => `
              <div class="custom-role-item" data-id="${r.id}">
                <span class="cr-name">${escapeHtml(r.name)}</span>
                <span class="cr-count">${r.permissions.length} quyền</span>
                <button class="btn btn-sm cr-edit" data-id="${r.id}">Sửa</button>
                <button class="btn btn-sm btn-danger cr-delete" data-id="${r.id}">Xoá</button>
              </div>
            `).join('')
          : '<p style="color:var(--text-sub)">Chưa có vai trò tuỳ chỉnh nào.</p>';
        cr.forEach((r) => {
          list.querySelector(`.cr-edit[data-id="${r.id}"]`)
            ?.addEventListener('click', () => openCustomRoleModal(r, container));
          list.querySelector(`.cr-delete[data-id="${r.id}"]`)
            ?.addEventListener('click', () => deleteCustomRole(r.id, r.name, container));
        });
      }
    } catch (err) {
      toast(err?.body?.error === 'name_already_exists' ? 'Tên vai trò đã tồn tại' :
            err?.body?.error === 'name_conflicts_builtin_role' ? 'Tên trùng với vai trò hệ thống' :
            'Lỗi khi lưu vai trò', 'error');
    }
  });
}

async function deleteCustomRole(id, name, container) {
  if (!confirm(`Xoá vai trò "${name}"? Nhân viên đang dùng vai trò này sẽ không thể đăng nhập.`)) return;
  try {
    await api.del(`/api/mgr/staff/custom-roles/${id}`);
    toast(`Đã xoá vai trò "${name}"`);
    const res = await api.get('/api/mgr/staff/custom-roles');
    const cr = res.custom_roles || [];
    const list = container.querySelector('#custom-roles-list');
    if (list) {
      list.innerHTML = cr.length
        ? cr.map((r) => `
            <div class="custom-role-item" data-id="${r.id}">
              <span class="cr-name">${escapeHtml(r.name)}</span>
              <span class="cr-count">${r.permissions.length} quyền</span>
              <button class="btn btn-sm cr-edit" data-id="${r.id}">Sửa</button>
              <button class="btn btn-sm btn-danger cr-delete" data-id="${r.id}">Xoá</button>
            </div>
          `).join('')
        : '<p style="color:var(--text-sub)">Chưa có vai trò tuỳ chỉnh nào.</p>';
      cr.forEach((r) => {
        list.querySelector(`.cr-edit[data-id="${r.id}"]`)
          ?.addEventListener('click', () => openCustomRoleModal(r, container));
        list.querySelector(`.cr-delete[data-id="${r.id}"]`)
          ?.addEventListener('click', () => deleteCustomRole(r.id, r.name, container));
      });
    }
  } catch (err) {
    toast(err?.body?.message || err?.body?.error === 'role_in_use'
      ? (err?.body?.message || 'Vai trò đang được nhân viên sử dụng') : 'Lỗi khi xoá', 'error');
  }
}
