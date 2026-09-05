// Đợt 5 (17/08/2026) v2 — "Bán kèm" (trước: "Nhóm tuỳ chọn món")
// Sao chép UX SoBanHang v2: tiêu đề + tìm kiếm + nút tạo trên cùng, không còn goodsTabsHtml.
import { api } from '../api.js';
import { escapeHtml, formatVND, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

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
  let page = 1; let PAGE_SIZE = 10;
  const cols = { count: true, linked: true, config: true };

  container.innerHTML = `
    <div class="page-head">
      <h2>Bán kèm</h2>
      <div class="page-head-actions">
        ${canManage ? '<button id="ntc-add" class="btn btn-primary">+ Tạo nhóm bán kèm</button>' : ''}
      </div>
    </div>
    <div class="sbh-card">
      <div class="sbh-card-tools">
        <input id="ntc-q" class="sbh-card-search" type="search" placeholder="Tìm tên nhóm bán kèm" />
        <div class="sbh-tools-right">
          <div style="position:relative">
            <button id="ntc-col-btn" class="btn pm-col-btn ord-cols-icon" aria-label="Hiển thị cột" title="Hiển thị cột">${icon('cot-hien-thi')}</button>
            <div id="ntc-col-drop" hidden class="pm-col-drop" style="position:absolute;top:100%;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:180px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
              <p style="font-size:11px;font-weight:600;color:var(--text-3);margin:0 0 6px;padding:0 4px;text-transform:uppercase">Hiển thị cột</p>
              <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
                <input id="ntc-col-count" type="checkbox" checked style="width:auto;min-height:auto" /> Số tùy chọn
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
                <input id="ntc-col-linked" type="checkbox" checked style="width:auto;min-height:auto" /> SP liên kết
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
                <input id="ntc-col-config" type="checkbox" checked style="width:auto;min-height:auto" /> Cấu hình
              </label>
            </div>
          </div>
        </div>
      </div>
      <div id="ntc-list"><p style="padding:0 14px 14px">Đang tải…</p></div>
    </div>
  `;

  let qTimer = null;
  container.querySelector('#ntc-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { searchQ = e.target.value.trim().toLowerCase(); page = 1; renderList(); }, 200);
  });
  if (canManage) {
    container.querySelector('#ntc-add').addEventListener('click', () => openForm(null));
  }

  // Nút vuông chọn cột — mở/đóng dropdown
  const colBtn = container.querySelector('#ntc-col-btn');
  const colDrop = container.querySelector('#ntc-col-drop');
  colBtn.addEventListener('click', (e) => { e.stopPropagation(); colDrop.hidden = !colDrop.hidden; });
  document.addEventListener('click', () => { colDrop.hidden = true; });
  colDrop.addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#ntc-col-count').addEventListener('change', (e) => { cols.count = e.target.checked; renderList(); });
  container.querySelector('#ntc-col-linked').addEventListener('change', (e) => { cols.linked = e.target.checked; renderList(); });
  container.querySelector('#ntc-col-config').addEventListener('change', (e) => { cols.config = e.target.checked; renderList(); });

  function renderList() {
    const el = container.querySelector('#ntc-list');
    const visible = searchQ
      ? groups.filter((g) => g.name.toLowerCase().includes(searchQ))
      : groups;

    if (!visible.length) {
      el.innerHTML = searchQ
        ? '<p style="padding:0 14px 14px">Không tìm thấy nhóm bán kèm nào.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div class="sbh-empty-ico">${icon('nhom-tuy-chon')}</div>
            <p style="font-weight:600;margin:0">Chưa có nhóm bán kèm nào</p>
          </div>`;
      return;
    }

    const total = visible.length;
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    el.innerHTML = `<table class="sp-table" style="width:100%">
      <thead><tr>
        <th>TÊN NHÓM</th>
        ${cols.count ? '<th style="width:140px;text-align:right">SỐ TUỲ CHỌN</th>' : ''}
        ${cols.linked ? '<th style="width:140px;text-align:right">SP LIÊN KẾT</th>' : ''}
        ${cols.config ? '<th style="width:180px">CẤU HÌNH</th>' : ''}
        ${canManage ? '<th style="width:48px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${paged.map((g) => `
        <tr class="${g.active ? '' : 'row-inactive'}">
          <td>
            <div style="font-weight:500">${escapeHtml(g.name)}${g.active ? '' : ' <span class="badge-warn">Đã tắt</span>'}</div>
            <div class="stock-meta" style="margin-top:2px">
              ${g.options.slice(0, 3).map((o) => escapeHtml(o.name) + (o.price ? ' (+' + formatVND(o.price) + ')' : '')).join(', ')}${g.options.length > 3 ? ' …' : ''}
            </div>
          </td>
          ${cols.count ? `<td style="text-align:right">${g.options.length}</td>` : ''}
          ${cols.linked ? `<td style="text-align:right">${g.menus.length}</td>` : ''}
          ${cols.config ? `<td class="hint">${[g.required ? 'Bắt buộc' : '', g.multi_select ? 'Chọn nhiều' : '', g.allow_qty ? 'Số lượng' : ''].filter(Boolean).join(' · ') || '—'}</td>` : ''}
          ${canManage ? `<td class="dm-act">
            <div class="dm-kebab-wrap">
              <button class="ord-kebab" data-gid="${g.id}" aria-label="Thao tác">${icon('them')}</button>
              <div class="row-menu dm-kebab-menu hidden" role="menu">
                <button type="button" role="menuitem" data-act="edit" data-gid="${g.id}">${icon('chinh-sua')} Sửa nhóm</button>
                <button type="button" role="menuitem" data-act="toggle" data-gid="${g.id}">${g.active ? icon('an') + ' Tắt nhóm' : icon('hien') + ' Bật nhóm'}</button>
              </div>
            </div>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="ord-pager">
      <span style="color:var(--text-2);font-size:13px">Hiển thị ${from}–${to} / ${total} kết quả</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2)">Hiển thị dòng</span>
        <select class="ntc-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
          ${[10,20,50].map((n) => `<option value="${n}" ${n === PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>${icon('trang-truoc') || '‹'}</button>
        <span class="ord-page-cur">${page} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        <button class="ord-page-btn" data-pg="next" ${page >= Math.ceil(total / PAGE_SIZE) ? 'disabled' : ''}>${icon('trang-sau') || '›'}</button>
      </div>
    </div>`;

    // Kebab menus
    if (canManage) {
      const closeAllKebabs = () => el.querySelectorAll('.dm-kebab-menu').forEach((m) => {
        m.classList.add('hidden');
        m.parentElement.querySelector('.ord-kebab')?.setAttribute('aria-expanded', 'false');
      });
      el.querySelectorAll('[data-gid].ord-kebab').forEach((btn) => {
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
      el.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          closeAllKebabs();
          const g = groups.find((x) => String(x.id) === btn.dataset.gid);
          if (!g) return;
          if (btn.dataset.act === 'edit') { openForm(g); return; }
          try {
            await api.patch(`/api/mgr/addons/${g.id}/active`, { active: !g.active });
            toast(g.active ? 'Đã tắt nhóm' : 'Đã bật nhóm');
            await load();
          } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
        });
      });
    }

    // Pagination controls
    el.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pg === 'prev' && page > 1) { page--; renderList(); }
        else if (btn.dataset.pg === 'next' && page < Math.ceil(total / PAGE_SIZE)) { page++; renderList(); }
      });
    });
    const sizeSelect = el.querySelector('.ntc-page-size');
    if (sizeSelect) sizeSelect.addEventListener('change', (e) => { PAGE_SIZE = Number(e.target.value); page = 1; renderList(); });
  }

  // Row menu handled inline in renderList (dm-kebab-wrap pattern)

  function openForm(g) {
    const isNew = !g;
    const state = {
      options: isNew ? [{ name: '', price: 0, cost_price: 0, in_stock: true }] : g.options.map((o) => ({ ...o })),
      menuIds: isNew ? [] : g.menus.map((m) => m.menu_id),
    };

    const modal = openModal(`
      <h3>${isNew ? 'Tạo nhóm bán kèm mới' : 'Sửa nhóm bán kèm'}</h3>
      <div class="ntc-form-cols">
        <div class="ntc-form-left">
          <div class="field"><label>Tên nhóm bán kèm <i class="req">*</i></label>
            <input id="ntc-name" type="text" value="${escapeHtml(g?.name || '')}" placeholder="Ví dụ: Trần châu" /></div>

          <h4 style="margin:16px 0 8px">Tùy chọn <span id="ntc-opt-count">(${state.options.length})</span>
            <button id="ntc-add-option" type="button" class="btn btn-sm" style="float:right">+ Thêm tùy chọn</button>
          </h4>
          <div id="ntc-options"></div>

          <h4 style="margin:16px 0 8px">Sản phẩm liên kết <span id="ntc-menu-count">(${state.menuIds.length})</span></h4>
          <input id="ntc-menu-q" type="search" placeholder="Tìm kiếm mã SKU/ Tên SP"
            style="width:100%;margin-bottom:8px;padding:6px 10px;border:1px solid var(--border);border-radius:6px" />
          <div id="ntc-menus" style="max-height:200px;overflow-y:auto;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px"></div>
        </div>
        <div class="ntc-form-right">
          <h4 style="margin:0 0 12px">Cấu hình</h4>
          <div class="ntc-toggle-row">
            <span>Bắt buộc phải chọn tùy chọn</span>
            <label class="ntc-toggle"><input id="ntc-required" type="checkbox" ${g?.required ? 'checked' : ''} /><span class="ntc-slider"></span></label>
          </div>
          <div class="ntc-toggle-row">
            <span>Có thể chọn nhiều tùy chọn cùng lúc</span>
            <label class="ntc-toggle"><input id="ntc-multi" type="checkbox" ${g?.multi_select ? 'checked' : ''} /><span class="ntc-slider"></span></label>
          </div>
          <div class="ntc-toggle-row">
            <span>Thêm số lượng nhiều cho 1 tùy chọn</span>
            <label class="ntc-toggle"><input id="ntc-qty" type="checkbox" ${g?.allow_qty ? 'checked' : ''} /><span class="ntc-slider"></span></label>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button id="ntc-cancel" class="btn btn-ghost">Hủy</button>
        <button id="ntc-save" class="btn btn-primary">${isNew ? '+ Tạo nhóm' : 'Lưu'}</button>
      </div>
    `);

    function updateOptCount() {
      const el = modal.overlay.querySelector('#ntc-opt-count');
      if (el) el.textContent = `(${state.options.length})`;
    }

    function renderOptions() {
      const el = modal.overlay.querySelector('#ntc-options');
      el.innerHTML = state.options.length
        ? `<table class="sp-table ntc-opt-table" style="width:100%;margin-bottom:4px">
            <thead><tr>
              <th>TÊN TÙY CHỌN</th>
              <th style="width:110px;text-align:right">GIÁ BÁN</th>
              <th style="width:110px;text-align:right">GIÁ VỐN</th>
              <th style="width:110px">TÌNH TRẠNG</th>
              <th style="width:36px"></th>
            </tr></thead>
            <tbody>
              ${state.options.map((o, i) => `
              <tr>
                <td><input data-opt="name" data-i="${i}" type="text" placeholder="Tên tùy chọn" value="${escapeHtml(o.name)}" style="width:100%;border:none;padding:2px 0;background:transparent" /></td>
                <td><input data-opt="price" data-i="${i}" type="number" value="${o.price}" style="width:100%;text-align:right;border:none;padding:2px 0;background:transparent" /></td>
                <td><input data-opt="cost_price" data-i="${i}" type="number" value="${o.cost_price}" style="width:100%;text-align:right;border:none;padding:2px 0;background:transparent" /></td>
                <td>
                  <select data-opt="in_stock" data-i="${i}" style="border:none;padding:2px 0;background:transparent;color:var(--text)">
                    <option value="1" ${o.in_stock ? 'selected' : ''}>Còn hàng</option>
                    <option value="0" ${!o.in_stock ? 'selected' : ''}>Hết hàng</option>
                  </select>
                </td>
                <td><button type="button" data-remove-opt="${i}" style="color:#c00;line-height:1" aria-label="Xoá tùy chọn">×</button></td>
              </tr>`).join('')}
            </tbody>
          </table>`
        : '<p class="hint" style="text-align:center;padding:12px 0">Chưa có tùy chọn nào<br><small>Thêm ít nhất 1 tùy chọn để khách lựa</small></p>';

      el.querySelectorAll('[data-opt]').forEach((input) => {
        const i = Number(input.dataset.i);
        const field = input.dataset.opt;
        const ev = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(ev, () => {
          if (field === 'price' || field === 'cost_price') state.options[i][field] = Number(input.value) || 0;
          else if (field === 'in_stock') state.options[i][field] = input.value === '1';
          else state.options[i][field] = input.value;
        });
      });
      el.querySelectorAll('[data-remove-opt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.options.splice(Number(btn.dataset.removeOpt), 1);
          renderOptions();
          updateOptCount();
        });
      });
    }

    let menuQ = '';
    function renderMenus() {
      const el = modal.overlay.querySelector('#ntc-menus');
      if (!menuItems.length) {
        el.innerHTML = '<p class="hint">Chưa có sản phẩm nào trong thực đơn.</p>';
        return;
      }
      const filtered = menuQ
        ? menuItems.filter((m) => m.name.toLowerCase().includes(menuQ))
        : menuItems;
      el.innerHTML = filtered.map((m) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid var(--line,#eee)">
          <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer">
            <input data-menu="${m.id}" type="checkbox" style="width:auto;min-height:auto" ${state.menuIds.includes(m.id) ? 'checked' : ''} />
            ${escapeHtml(m.name)}
          </label>
          <span style="color:var(--text-2);font-size:13px">${m.price ? formatVND(m.price) : ''}</span>
        </div>`).join('') || '<p class="hint">Không tìm thấy sản phẩm.</p>';
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

    const menuQEl = modal.overlay.querySelector('#ntc-menu-q');
    if (menuQEl) menuQEl.addEventListener('input', (e) => { menuQ = e.target.value.trim().toLowerCase(); renderMenus(); });

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
