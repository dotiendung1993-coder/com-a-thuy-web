// Đợt 5 (17/08/2026) v2 — Công thức: giao diện SoBanHang v2.
// Tạo công thức bằng cách chọn sản phẩm trước, sau đó thêm NVL.
import { api } from '../api.js';
import { escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem công thức.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  let searchQ = '';
  let allRecipes = [];
  let allIngredients = [];
  let menuItems = [];

  container.innerHTML = `
    <div class="page-head">
      <h2>Công thức</h2>
      ${canManage ? '<button id="ct-new" class="btn btn-primary">+ Tạo công thức</button>' : ''}
    </div>
    <div class="filter-row" style="margin-bottom:12px">
      <input id="ct-q" type="search" placeholder="Tìm tên công thức…" style="max-width:320px" />
    </div>
    <div id="ct-list"><p>Đang tải…</p></div>
  `;

  let qTimer = null;
  container.querySelector('#ct-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { searchQ = e.target.value.trim().toLowerCase(); renderList(); }, 200);
  });
  if (canManage) {
    container.querySelector('#ct-new').addEventListener('click', () => openCreateModal());
  }

  function renderList() {
    const el = container.querySelector('#ct-list');

    // Group by menu_id
    const byMenu = new Map();
    for (const r of allRecipes) {
      if (!byMenu.has(r.menu_id)) byMenu.set(r.menu_id, { name: r.menu_name, category: r.menu_category, ings: [] });
      byMenu.get(r.menu_id).ings.push(r);
    }

    let visible = [...byMenu.entries()];
    if (searchQ) {
      visible = visible.filter(([, info]) => info.name.toLowerCase().includes(searchQ));
    }

    if (!visible.length) {
      el.innerHTML = searchQ
        ? '<p>Không tìm thấy công thức phù hợp.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div style="font-size:48px;margin-bottom:12px"></div>
            <p style="font-weight:600;margin:0">Chưa có công thức nào</p>
            <p class="hint" style="margin:4px 0 16px">Áp dụng công thức để tính giá vốn sản phẩm tự động theo nguyên vật liệu</p>
            ${canManage ? '<button id="ct-new-2" class="btn btn-primary">Tạo ngay</button>' : ''}
          </div>`;
      if (canManage && !searchQ) {
        const btn2 = el.querySelector('#ct-new-2');
        if (btn2) btn2.addEventListener('click', () => openCreateModal());
      }
      return;
    }

    el.innerHTML = visible.map(([menuId, info]) => `
      <div class="stock-row">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(info.name)}
            ${info.category ? `<span class="stock-meta" style="margin-left:8px">${escapeHtml(info.category)}</span>` : ''}
          </div>
          <div class="stock-meta">
            ${info.ings.map((r) => `${escapeHtml(r.ingredient_name)}: ${r.qty_per_dish} ${escapeHtml(r.unit)}`).join(' · ')}
          </div>
        </div>
        ${canManage ? `<button class="btn" data-edit="${menuId}">Sửa</button>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
      });
    }
  }

  // Mở modal TẠO: chọn sản phẩm → thêm NVL
  async function openCreateModal() {
    if (!menuItems.length) {
      toast('Chưa có sản phẩm nào. Vào màn "Sản phẩm" tạo trước.', 'error'); return;
    }
    if (!allIngredients.length) {
      toast('Chưa có NVL nào. Vào "Nguyên vật liệu" tạo trước.', 'error'); return;
    }

    let selectedMenuId = null;
    let rows = [];
    let menuSearch = '';

    const modal = openModal('');
    function rebuildModal() {
      const box = modal.overlay.querySelector('.modal-box');
      box.innerHTML = `
        <h3>Tạo công thức</h3>
        <div class="field">
          <label>Sản phẩm <i class="req">*</i></label>
          ${selectedMenuId
            ? (() => {
                const m = menuItems.find((x) => x.id === selectedMenuId);
                return `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--primary,#16a34a);border-radius:8px;padding:8px 12px">
                  <span style="flex:1;font-weight:500">${escapeHtml(m?.name || '')}</span>
                  <button type="button" id="ct-clear-sp" style="color:#999;font-size:18px;background:none;border:none;cursor:pointer">×</button>
                </div>`;
              })()
            : `<div style="position:relative">
                <input id="ct-sp-search" type="text" placeholder="Tìm sản phẩm…" value="${escapeHtml(menuSearch)}" style="width:100%" />
                <div id="ct-sp-drop" style="position:absolute;top:100%;left:0;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.1)">
                  ${menuItems.filter((m) => !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase()))
                    .map((m) => `<div class="ct-sp-item" data-mid="${m.id}" style="padding:8px 12px;cursor:pointer">${escapeHtml(m.name)}</div>`).join('')
                    || '<p class="hint" style="padding:8px 12px;margin:0">Không tìm thấy</p>'}
                </div>
              </div>`}
        </div>
        ${selectedMenuId ? `
        <div style="margin-top:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <strong>Công thức</strong>
            <button id="ct-add-nvl" class="btn" type="button">+ Thêm nguyên vật liệu</button>
          </div>
          ${rows.length
            ? `<table style="width:100%;border-collapse:collapse">
                <thead><tr>
                  <th style="text-align:left;padding:4px">Nguyên vật liệu</th>
                  <th style="width:70px;padding:4px">SL</th>
                  <th style="width:60px;padding:4px">ĐVT</th>
                  <th style="width:80px;padding:4px">Giá vốn</th>
                  <th style="width:32px"></th>
                </tr></thead>
                <tbody id="ct-nvl-body">
                  ${rows.map((r, i) => {
                    const ing = allIngredients.find((x) => x.id === r.ingredient_id) || {};
                    return `<tr>
                      <td><select class="ct-row-ing" data-i="${i}" style="width:100%">
                        ${allIngredients.map((x) => `<option value="${x.id}" ${x.id === r.ingredient_id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
                      </select></td>
                      <td><input class="ct-row-qty" data-i="${i}" type="number" min="0.001" step="0.001" value="${r.qty_per_dish}" style="width:100%" /></td>
                      <td style="padding:4px;color:#666">${escapeHtml(ing.unit || '')}</td>
                      <td style="padding:4px;color:#666">${ing.cost_price || 0}</td>
                      <td><button class="ct-row-del" data-i="${i}" style="color:#c00;background:none;border:none;cursor:pointer">${icon('dong')}</button></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`
            : '<p class="hint" style="text-align:center;padding:16px">Chưa có nguyên vật liệu nào<br><small>Thêm NVL để tính giá vốn sản phẩm</small></p>'}
        </div>` : ''}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button id="ct-cancel" class="btn btn-ghost" style="flex:1">Huỷ</button>
          <button id="ct-save" class="btn btn-primary" style="flex:1" ${selectedMenuId ? '' : 'disabled'}>Tạo công thức</button>
        </div>`;

      // Bind events after rebuild
      const clearBtn = box.querySelector('#ct-clear-sp');
      if (clearBtn) clearBtn.addEventListener('click', () => { selectedMenuId = null; rebuildModal(); });

      const spSearch = box.querySelector('#ct-sp-search');
      if (spSearch) {
        spSearch.focus();
        spSearch.addEventListener('input', (e) => { menuSearch = e.target.value; rebuildModal(); });
        box.querySelectorAll('.ct-sp-item').forEach((item) => {
          item.addEventListener('mouseenter', () => { item.style.background = 'var(--hover-bg,#f0fdf4)'; });
          item.addEventListener('mouseleave', () => { item.style.background = ''; });
          item.addEventListener('click', () => {
            selectedMenuId = item.dataset.mid;
            menuSearch = '';
            rebuildModal();
          });
        });
      }

      const addNvl = box.querySelector('#ct-add-nvl');
      if (addNvl) addNvl.addEventListener('click', () => {
        rows.push({ ingredient_id: allIngredients[0].id, qty_per_dish: 0 });
        rebuildModal();
      });

      box.querySelectorAll('.ct-row-ing').forEach((sel) => {
        sel.addEventListener('change', (e) => { rows[+e.target.dataset.i].ingredient_id = +e.target.value; rebuildModal(); });
      });
      box.querySelectorAll('.ct-row-qty').forEach((inp) => {
        inp.addEventListener('input', (e) => { rows[+e.target.dataset.i].qty_per_dish = parseFloat(e.target.value) || 0; });
      });
      box.querySelectorAll('.ct-row-del').forEach((btn) => {
        btn.addEventListener('click', () => { rows.splice(+btn.dataset.i, 1); rebuildModal(); });
      });

      box.querySelector('#ct-cancel').addEventListener('click', modal.close);
      box.querySelector('#ct-save').addEventListener('click', async () => {
        if (!selectedMenuId) { toast('Chọn sản phẩm trước', 'error'); return; }
        const invalid = rows.find((r) => !(r.qty_per_dish > 0));
        if (invalid) { toast('Lượng mỗi sản phẩm phải > 0', 'error'); return; }
        try {
          await api.put(`/api/mgr/ingredients/recipes/menu/${selectedMenuId}`, {
            ingredients: rows.map((r) => ({ ingredient_id: r.ingredient_id, qty_per_dish: r.qty_per_dish, note: null })),
          });
          toast('Đã tạo công thức');
          modal.close();
          await load();
        } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
      });
    }
    rebuildModal();
  }

  // Modal SỬA công thức của một sản phẩm (dùng chung với nút "Sửa" trong danh sách)
  async function openEditModal(menuId) {
    let recipeData = { menu_name: '', ingredients: [] };
    try {
      const [rd, id] = await Promise.all([
        api.get(`/api/mgr/ingredients/recipes/menu/${menuId}`),
        api.get('/api/mgr/ingredients'),
      ]);
      recipeData = rd;
      if (!id.items?.length) { toast('Chưa có NVL nào. Vào "Nguyên vật liệu" tạo trước.', 'error'); return; }
      allIngredients = id.items;
    } catch (err) { toast(err?.body?.message || 'Không tải được công thức', 'error'); return; }

    let rows = recipeData.ingredients.map((r) => ({ ingredient_id: r.ingredient_id, qty_per_dish: r.qty_per_dish, note: r.note || '' }));

    function buildRows() {
      return rows.map((r, i) => {
        const ing = allIngredients.find((x) => x.id === r.ingredient_id) || {};
        return `<tr>
          <td><select class="ct-row-ing" data-i="${i}">
            ${allIngredients.map((x) => `<option value="${x.id}" ${x.id === r.ingredient_id ? 'selected' : ''}>${escapeHtml(x.name)} (${escapeHtml(x.unit)})</option>`).join('')}
          </select></td>
          <td><input class="ct-row-qty" data-i="${i}" type="number" min="0.001" step="0.001" value="${r.qty_per_dish}" style="width:80px" /></td>
          <td><input class="ct-row-note" data-i="${i}" value="${escapeHtml(r.note)}" style="width:120px" placeholder="Ghi chú" /></td>
          <td><button class="ct-row-del" data-i="${i}" style="color:#c00;background:none;border:none;cursor:pointer">${icon('dong')}</button></td>
        </tr>`;
      }).join('');
    }

    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;z-index:1000;overflow-y:auto;padding:20px';
    div.innerHTML = `
      <div class="modal" style="background:var(--card-bg,#fff);border-radius:12px;padding:20px;width:100%;max-width:640px;margin:auto">
        <h3>Công thức: ${escapeHtml(recipeData.menu_name)}</h3>
        <table id="ct-tbl" style="width:100%;border-collapse:collapse">
          <thead><tr><th style="text-align:left">Nguyên liệu</th><th>Lượng/đĩa</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody id="ct-tbody">${buildRows()}</tbody>
        </table>
        <button id="ct-add-row" class="btn" style="margin-top:8px;width:100%">+ Thêm NVL</button>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="ct-save" class="btn btn-primary" style="flex:1">Lưu công thức</button>
          <button id="ct-cancel" class="btn" style="flex:1">Huỷ</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    const close = () => { div.remove(); };
    div.addEventListener('click', (e) => { if (e.target === div) close(); });

    function rebind() {
      div.querySelector('#ct-tbody').innerHTML = buildRows();
      div.querySelectorAll('.ct-row-ing').forEach((sel) => {
        sel.addEventListener('change', (e) => { rows[+e.target.dataset.i].ingredient_id = +e.target.value; });
      });
      div.querySelectorAll('.ct-row-qty').forEach((inp) => {
        inp.addEventListener('input', (e) => { rows[+e.target.dataset.i].qty_per_dish = parseFloat(e.target.value) || 0; });
      });
      div.querySelectorAll('.ct-row-note').forEach((inp) => {
        inp.addEventListener('input', (e) => { rows[+e.target.dataset.i].note = e.target.value; });
      });
      div.querySelectorAll('.ct-row-del').forEach((btn) => {
        btn.addEventListener('click', () => { rows.splice(+btn.dataset.i, 1); rebind(); });
      });
    }
    rebind();

    div.querySelector('#ct-add-row').addEventListener('click', () => {
      rows.push({ ingredient_id: allIngredients[0].id, qty_per_dish: 0, note: '' });
      rebind();
    });
    div.querySelector('#ct-cancel').addEventListener('click', close);
    div.querySelector('#ct-save').addEventListener('click', async () => {
      div.querySelectorAll('.ct-row-ing').forEach((sel) => { rows[+sel.dataset.i].ingredient_id = +sel.value; });
      div.querySelectorAll('.ct-row-qty').forEach((inp) => { rows[+inp.dataset.i].qty_per_dish = parseFloat(inp.value) || 0; });
      div.querySelectorAll('.ct-row-note').forEach((inp) => { rows[+inp.dataset.i].note = inp.value; });
      if (rows.find((r) => !(r.qty_per_dish > 0))) { toast('Lượng mỗi đĩa phải > 0', 'error'); return; }
      try {
        await api.put(`/api/mgr/ingredients/recipes/menu/${menuId}`, {
          ingredients: rows.map((r) => ({ ingredient_id: r.ingredient_id, qty_per_dish: r.qty_per_dish, note: r.note || null })),
        });
        toast('Đã lưu công thức');
        close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
    });
  }

  async function load() {
    try {
      const [rd, id, md] = await Promise.all([
        api.get('/api/mgr/ingredients/recipes'),
        api.get('/api/mgr/ingredients'),
        api.get('/api/mgr/menu'),
      ]);
      allRecipes = rd.recipes || [];
      allIngredients = id.items || [];
      menuItems = md.items || [];
      renderList();
    } catch {
      container.querySelector('#ct-list').innerHTML = '<p>Không tải được công thức.</p>';
    }
  }

  await load();
}
