// Đợt 5 (17/08/2026) v2 — "Bán kèm" (trước: "Nhóm tuỳ chọn món")
// Sao chép UX SoBanHang v2: tiêu đề + tìm kiếm + nút tạo trên cùng, không còn goodsTabsHtml.
import { api } from '../api.js';
import { escapeHtml, formatVND, toast, openModal } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  let groups = [];
  let menuItems = [];
  let searchQ = '';

  container.innerHTML = `
    <div class="page-head">
      <h2>Bán kèm</h2>
      ${canManage ? '<button id="ntc-add" class="btn btn-primary">+ Tạo nhóm bán kèm</button>' : ''}
    </div>
    <div class="filter-row" style="margin-bottom:12px">
      <input id="ntc-q" type="search" placeholder="Tìm tên nhóm bán kèm…" style="max-width:320px" />
    </div>
    <div id="ntc-list"><p>Đang tải…</p></div>
  `;

  let qTimer = null;
  container.querySelector('#ntc-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { searchQ = e.target.value.trim().toLowerCase(); renderList(); }, 200);
  });
  if (canManage) {
    container.querySelector('#ntc-add').addEventListener('click', () => openForm(null));
  }

  function renderList() {
    const el = container.querySelector('#ntc-list');
    const visible = searchQ
      ? groups.filter((g) => g.name.toLowerCase().includes(searchQ))
      : groups;
    if (!visible.length) {
      el.innerHTML = searchQ
        ? '<p>Không tìm thấy nhóm bán kèm nào.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div style="font-size:48px;margin-bottom:12px"></div>
            <p style="font-weight:600;margin:0">Chưa có nhóm bán kèm nào</p>
            <p class="hint" style="margin:4px 0 16px">Tạo nhóm để thêm tuỳ chọn (topping, thêm món…) vào sản phẩm</p>
            ${canManage ? '<button id="ntc-add-2" class="btn btn-primary">+ Tạo nhóm bán kèm</button>' : ''}
          </div>`;
      if (canManage && !searchQ) {
        const btn2 = el.querySelector('#ntc-add-2');
        if (btn2) btn2.addEventListener('click', () => openForm(null));
      }
      return;
    }
    el.innerHTML = `<table class="sp-table" style="width:100%">
      <thead><tr>
        <th>TÊN NHÓM</th>
        <th style="width:140px">SỐ TUỲ CHỌN</th>
        <th style="width:160px">SP LIÊN KẾT</th>
        <th style="width:160px">CẤU HÌNH</th>
        ${canManage ? '<th style="width:40px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${visible.map((g) => `
        <tr class="${g.active ? '' : 'row-inactive'}">
          <td>
            <div style="font-weight:500">${escapeHtml(g.name)}${g.active ? '' : ' <span class="badge-warn">Đã tắt</span>'}</div>
            <div class="stock-meta" style="margin-top:2px">
              ${g.options.slice(0, 3).map((o) => escapeHtml(o.name) + (o.price ? ' (+' + formatVND(o.price) + ')' : '')).join(', ')}${g.options.length > 3 ? ' …' : ''}
            </div>
          </td>
          <td>${g.options.length} tuỳ chọn</td>
          <td>${g.menus.length ? g.menus.slice(0, 2).map((m) => escapeHtml(m.name)).join(', ') + (g.menus.length > 2 ? ` +${g.menus.length - 2}` : '') : '(chưa gắn)'}</td>
          <td class="hint">
            ${[g.required ? 'Bắt buộc' : '', g.multi_select ? 'Chọn nhiều' : '', g.allow_qty ? 'Số lượng' : ''].filter(Boolean).join(' · ') || '—'}
          </td>
          ${canManage ? `<td>
            <button class="ord-kebab" data-gid="${g.id}" aria-label="Thao tác">⋯</button>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>`;

    if (canManage) {
      el.querySelectorAll('[data-gid]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const g = groups.find((x) => String(x.id) === btn.dataset.gid);
          if (!g) return;
          openRowMenu(btn, g);
        });
      });
    }
  }

  let openMenuEl = null;
  function closeRowMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
  function openRowMenu(btn, g) {
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.innerHTML = `
      <button type="button" data-act="edit">Sửa nhóm</button>
      <button type="button" data-act="toggle">${g.active ? 'Tắt nhóm' : 'Bật nhóm'}</button>`;
    document.body.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4 + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    menu.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'edit') { openForm(g); return; }
      try {
        await api.patch(`/api/mgr/addons/${g.id}/active`, { active: !g.active });
        toast(g.active ? 'Đã tắt nhóm' : 'Đã bật nhóm');
        await load();
      } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
    });
  }
  document.addEventListener('click', closeRowMenu);

  function openForm(g) {
    const isNew = !g;
    const state = {
      options: isNew ? [{ name: '', price: 0, cost_price: 0, in_stock: true }] : g.options.map((o) => ({ ...o })),
      menuIds: isNew ? [] : g.menus.map((m) => m.menu_id),
    };

    const modal = openModal(`
      <h3>${isNew ? 'Tạo nhóm bán kèm mới' : 'Sửa nhóm bán kèm'}</h3>
      <div class="field"><label>Tên nhóm bán kèm <i class="req">*</i></label>
        <input id="ntc-name" type="text" value="${escapeHtml(g?.name || '')}" placeholder="Ví dụ: Thêm món, Độ cay, Trần châu…" /></div>

      <h4 style="margin:16px 0 8px">Tuỳ chọn <span id="ntc-opt-count">(${state.options.length})</span></h4>
      <div id="ntc-options"></div>
      <button id="ntc-add-option" type="button" class="btn" style="width:100%;margin-top:4px">+ Thêm tuỳ chọn</button>

      <h4 style="margin:16px 0 8px">Sản phẩm liên kết <span id="ntc-menu-count">(${state.menuIds.length})</span></h4>
      <div id="ntc-menus" style="max-height:200px;overflow-y:auto;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px"></div>

      <h4 style="margin:16px 0 8px">Cấu hình</h4>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-required" type="checkbox" style="width:auto;min-height:auto" ${g?.required ? 'checked' : ''} />
        Bắt buộc phải chọn 1 tuỳ chọn
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-multi" type="checkbox" style="width:auto;min-height:auto" ${g?.multi_select ? 'checked' : ''} />
        Có thể chọn nhiều tuỳ chọn cùng lúc
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-qty" type="checkbox" style="width:auto;min-height:auto" ${g?.allow_qty ? 'checked' : ''} />
        Thêm số lượng riêng cho 1 tuỳ chọn
      </label>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="ntc-cancel" class="btn btn-ghost" style="flex:1">Huỷ</button>
        <button id="ntc-save" class="btn btn-primary" style="flex:1">${isNew ? 'Tạo nhóm' : 'Lưu'}</button>
      </div>
    `);

    function updateOptCount() {
      const el = modal.overlay.querySelector('#ntc-opt-count');
      if (el) el.textContent = `(${state.options.length})`;
    }

    function renderOptions() {
      const el = modal.overlay.querySelector('#ntc-options');
      el.innerHTML = state.options.length
        ? state.options.map((o, i) => `
          <div class="addon-option-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <input data-opt="name" data-i="${i}" type="text" placeholder="Tên tuỳ chọn" value="${escapeHtml(o.name)}" style="flex:2" />
            <input data-opt="price" data-i="${i}" type="number" placeholder="Giá bán thêm" value="${o.price}" style="flex:1" />
            <input data-opt="cost_price" data-i="${i}" type="number" placeholder="Giá vốn thêm" value="${o.cost_price}" style="flex:1" />
            <label style="display:flex;align-items:center;gap:4px;white-space:nowrap">
              <input data-opt="in_stock" data-i="${i}" type="checkbox" style="width:auto;min-height:auto" ${o.in_stock ? 'checked' : ''} /> Còn
            </label>
            <button type="button" data-remove-opt="${i}" style="color:#c00;flex-shrink:0">Xoá</button>
          </div>`).join('')
        : '<p class="hint" style="text-align:center;padding:12px 0">Chưa có tuỳ chọn nào<br><small>Thêm ít nhất 1 tuỳ chọn để khách lựa</small></p>';

      el.querySelectorAll('[data-opt]').forEach((input) => {
        const i = Number(input.dataset.i);
        const field = input.dataset.opt;
        input.addEventListener('input', () => {
          state.options[i][field] = field === 'price' || field === 'cost_price'
            ? Number(input.value) || 0
            : input.type === 'checkbox' ? input.checked : input.value;
        });
        if (input.type === 'checkbox') {
          input.addEventListener('change', () => { state.options[i][field] = input.checked; });
        }
      });
      el.querySelectorAll('[data-remove-opt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.options.splice(Number(btn.dataset.removeOpt), 1);
          renderOptions();
          updateOptCount();
        });
      });
    }

    function renderMenus() {
      const el = modal.overlay.querySelector('#ntc-menus');
      if (!menuItems.length) {
        el.innerHTML = '<p class="hint">Chưa có sản phẩm nào trong thực đơn.</p>';
        return;
      }
      el.innerHTML = menuItems.map((m) => `
        <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
          <input data-menu="${m.id}" type="checkbox" style="width:auto;min-height:auto" ${state.menuIds.includes(m.id) ? 'checked' : ''} />
          ${escapeHtml(m.name)}
        </label>`).join('');
      el.querySelectorAll('[data-menu]').forEach((input) => {
        input.addEventListener('change', () => {
          const id = input.dataset.menu;
          if (input.checked) { if (!state.menuIds.includes(id)) state.menuIds.push(id); }
          else state.menuIds = state.menuIds.filter((x) => x !== id);
          const countEl = modal.overlay.querySelector('#ntc-menu-count');
          if (countEl) countEl.textContent = `(${state.menuIds.length})`;
        });
      });
    }

    renderOptions();
    renderMenus();

    modal.overlay.querySelector('#ntc-add-option').addEventListener('click', () => {
      state.options.push({ name: '', price: 0, cost_price: 0, in_stock: true });
      renderOptions();
      updateOptCount();
    });
    modal.overlay.querySelector('#ntc-cancel').addEventListener('click', modal.close);
    modal.overlay.querySelector('#ntc-save').addEventListener('click', async () => {
      const body = {
        name: modal.overlay.querySelector('#ntc-name').value.trim(),
        required: modal.overlay.querySelector('#ntc-required').checked,
        multi_select: modal.overlay.querySelector('#ntc-multi').checked,
        allow_qty: modal.overlay.querySelector('#ntc-qty').checked,
        options: state.options.filter((o) => o.name.trim()),
        menu_ids: state.menuIds,
      };
      if (!body.name) { toast('Nhập tên nhóm', 'error'); return; }
      if (!body.options.length) { toast('Cần ít nhất 1 tuỳ chọn có tên', 'error'); return; }
      try {
        if (isNew) await api.post('/api/mgr/addons', body);
        else await api.patch(`/api/mgr/addons/${g.id}`, body);
        toast(isNew ? 'Đã tạo nhóm bán kèm' : 'Đã lưu');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  async function load() {
    try {
      const [groupsRes, menuRes] = await Promise.all([
        api.get('/api/mgr/addons'),
        api.get('/api/mgr/menu'),
      ]);
      groups = groupsRes.groups || [];
      menuItems = menuRes.items || [];
      renderList();
    } catch {
      container.querySelector('#ntc-list').innerHTML = '<p>Không tải được danh sách nhóm.</p>';
    }
  }

  await load();
}
