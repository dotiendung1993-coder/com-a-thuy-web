// GĐ8 mục D — Nhóm tuỳ chọn món (topping), sao chép "Bán kèm" của app Sổ Bán Hàng
// (khảo sát thật app.sobanhang.com/goods/products/addon 2026-08-04): 1 nhóm có tên + 3 cờ
// (bắt buộc chọn / chọn nhiều / cho số lượng), chứa nhiều tuỳ chọn (tên + giá bán thêm + giá vốn
// thêm + còn/hết), gắn được vào nhiều món trong thực đơn.
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

  container.innerHTML = `
    <h2>Nhóm tuỳ chọn món</h2>
    <p class="hint">Topping / tuỳ chọn thêm cho món (VD: thêm trứng, thêm cơm, không hành…), gắn vào 1 hoặc nhiều món.</p>
    ${canManage ? '<button id="ntc-add" class="btn btn-primary" style="margin-bottom:12px">+ Tạo nhóm mới</button>' : ''}
    <div id="ntc-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#ntc-add').addEventListener('click', () => openForm(null));
  }

  function renderList() {
    const el = container.querySelector('#ntc-list');
    if (!groups.length) {
      el.innerHTML = '<p>Chưa có nhóm tuỳ chọn nào.</p>';
      return;
    }
    el.innerHTML = groups.map((g) => `
      <div class="stock-row ${g.active ? '' : 'inactive'}">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(g.name)}
            ${g.active ? '' : '<span class="badge-warn">Đã tắt</span>'}
            ${g.required ? '<span class="badge">Bắt buộc</span>' : ''}
            ${g.multi_select ? '<span class="badge">Chọn nhiều</span>' : ''}
          </div>
          <div class="stock-meta">
            ${g.options.map((o) => `${escapeHtml(o.name)}${o.price ? ' (+' + formatVND(o.price) + ')' : ''}`).join(', ')}
          </div>
          <div class="stock-meta">Gắn với: ${g.menus.length ? g.menus.map((m) => escapeHtml(m.name)).join(', ') : '(chưa gắn món nào)'}</div>
        </div>
        ${canManage ? `
        <div class="stock-actions">
          <button data-edit="${g.id}">Sửa</button>
          <button data-toggle="${g.id}">${g.active ? 'Tắt' : 'Bật'}</button>
        </div>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openForm(groups.find((g) => String(g.id) === btn.dataset.edit)));
      });
      el.querySelectorAll('[data-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const g = groups.find((x) => String(x.id) === btn.dataset.toggle);
          try {
            await api.patch(`/api/mgr/addons/${g.id}/active`, { active: !g.active });
            toast(g.active ? 'Đã tắt nhóm' : 'Đã bật nhóm');
            await load();
          } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
        });
      });
    }
  }

  function openForm(g) {
    const isNew = !g;
    // state cục bộ cho form: sửa tay để khỏi phải đọc lại DOM lúc lưu
    const state = {
      options: isNew ? [{ name: '', price: 0, cost_price: 0, in_stock: true }] : g.options.map((o) => ({ ...o })),
      menuIds: isNew ? [] : g.menus.map((m) => m.menu_id),
    };

    const modal = openModal(`
      <h3>${isNew ? 'Tạo nhóm tuỳ chọn' : 'Sửa nhóm tuỳ chọn'}</h3>
      <div class="field"><label>Tên nhóm</label>
        <input id="ntc-name" type="text" value="${escapeHtml(g?.name || '')}" placeholder="VD: Thêm món, Độ cay…" /></div>

      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-required" type="checkbox" style="width:auto;min-height:auto" ${g?.required ? 'checked' : ''} />
        Bắt buộc phải chọn 1 tuỳ chọn
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-multi" type="checkbox" style="width:auto;min-height:auto" ${g?.multi_select ? 'checked' : ''} />
        Cho chọn nhiều tuỳ chọn cùng lúc
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="ntc-qty" type="checkbox" style="width:auto;min-height:auto" ${g?.allow_qty ? 'checked' : ''} />
        Cho nhập số lượng cho 1 tuỳ chọn
      </label>

      <h4 style="margin-top:16px">Tuỳ chọn</h4>
      <div id="ntc-options"></div>
      <button id="ntc-add-option" type="button" class="btn" style="width:100%;margin-top:4px">+ Thêm tuỳ chọn</button>

      <h4 style="margin-top:16px">Gắn với món</h4>
      <div id="ntc-menus" style="max-height:200px;overflow-y:auto;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px"></div>

      <button id="ntc-save" class="btn btn-primary" style="width:100%;margin-top:16px">Lưu</button>
    `);

    function renderOptions() {
      const el = modal.overlay.querySelector('#ntc-options');
      el.innerHTML = state.options.map((o, i) => `
        <div class="addon-option-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <input data-opt="name" data-i="${i}" type="text" placeholder="Tên tuỳ chọn" value="${escapeHtml(o.name)}" style="flex:2" />
          <input data-opt="price" data-i="${i}" type="number" placeholder="Giá bán thêm" value="${o.price}" style="flex:1" />
          <input data-opt="cost_price" data-i="${i}" type="number" placeholder="Giá vốn thêm" value="${o.cost_price}" style="flex:1" />
          <label style="display:flex;align-items:center;gap:4px;white-space:nowrap">
            <input data-opt="in_stock" data-i="${i}" type="checkbox" style="width:auto;min-height:auto" ${o.in_stock ? 'checked' : ''} /> Còn
          </label>
          <button type="button" data-remove-opt="${i}" style="color:#c00">Xoá</button>
        </div>`).join('');

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
        });
      });
    }

    function renderMenus() {
      const el = modal.overlay.querySelector('#ntc-menus');
      if (!menuItems.length) { el.innerHTML = '<p class="hint">Chưa có món nào trong thực đơn.</p>'; return; }
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
        });
      });
    }

    renderOptions();
    renderMenus();

    modal.overlay.querySelector('#ntc-add-option').addEventListener('click', () => {
      state.options.push({ name: '', price: 0, cost_price: 0, in_stock: true });
      renderOptions();
    });

    modal.overlay.querySelector('#ntc-save').addEventListener('click', async () => {
      const body = {
        name: modal.overlay.querySelector('#ntc-name').value.trim(),
        required: modal.overlay.querySelector('#ntc-required').checked,
        multi_select: modal.overlay.querySelector('#ntc-multi').checked,
        allow_qty: modal.overlay.querySelector('#ntc-qty').checked,
        options: state.options,
        menu_ids: state.menuIds,
      };
      if (!body.name) { toast('Nhập tên nhóm', 'error'); return; }
      if (!body.options.some((o) => o.name.trim())) { toast('Cần ít nhất 1 tuỳ chọn có tên', 'error'); return; }
      body.options = body.options.filter((o) => o.name.trim());
      try {
        if (isNew) await api.post('/api/mgr/addons', body);
        else await api.patch(`/api/mgr/addons/${g.id}`, body);
        toast(isNew ? 'Đã tạo nhóm' : 'Đã lưu');
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
