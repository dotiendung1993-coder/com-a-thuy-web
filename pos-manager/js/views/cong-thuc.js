// GĐ5 — Công thức: chọn món menu → xem / sửa danh sách NVL cần cho mỗi đĩa.
import { api } from '../api.js';
import { escapeHtml, toast } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem công thức.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  container.innerHTML = `
    <h2>Công thức</h2>
    <div class="filter-row">
      <input id="ct-q" type="search" placeholder="Tìm món / NVL…" />
      <button id="ct-search" class="btn">Lọc</button>
    </div>
    <div id="ct-list"><p>Đang tải…</p></div>
  `;

  container.querySelector('#ct-search').addEventListener('click', load);
  container.querySelector('#ct-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });

  // ── Hiện tất cả công thức (group by menu item)
  async function load() {
    const q = container.querySelector('#ct-q').value.trim();
    const params = q ? new URLSearchParams({ q }) : new URLSearchParams();
    try {
      const data = await api.get(`/api/mgr/ingredients/recipes?${params}`);
      renderAll(data.recipes || [], q);
    } catch {
      container.querySelector('#ct-list').innerHTML = '<p>Không tải được công thức.</p>';
    }
  }

  function renderAll(recipes, q) {
    const el = container.querySelector('#ct-list');
    if (!recipes.length) {
      el.innerHTML = q
        ? '<p>Không tìm thấy công thức phù hợp.</p>'
        : '<p>Chưa có công thức nào. Bấm "Sửa công thức" ở từng món để thiết lập.</p>';
      return;
    }
    // Group by menu_id
    const byMenu = new Map();
    for (const r of recipes) {
      if (!byMenu.has(r.menu_id)) byMenu.set(r.menu_id, { name: r.menu_name, category: r.menu_category, ings: [] });
      byMenu.get(r.menu_id).ings.push(r);
    }
    let html = '';
    for (const [menuId, info] of byMenu) {
      html += `<div class="card" style="margin-bottom:10px;padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div><strong>${escapeHtml(info.name)}</strong>
            ${info.category ? `<span class="stock-meta" style="margin-left:8px">${escapeHtml(info.category)}</span>` : ''}
          </div>
          ${canManage ? `<button class="btn" data-edit="${menuId}">Sửa</button>` : ''}
        </div>
        <div>${info.ings.map((r) =>
    `<div class="stock-meta" style="padding:2px 0">${escapeHtml(r.ingredient_name)}: ${r.qty_per_dish} ${escapeHtml(r.unit)}${r.note ? ' — ' + escapeHtml(r.note) : ''}</div>`
  ).join('')}</div>
      </div>`;
    }
    el.innerHTML = html;
    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
      });
    }
  }

  // ── Modal sửa công thức của một món
  async function openEditModal(menuId) {
    let recipeData = { menu_name: '', ingredients: [] };
    let allIngredients = [];
    try {
      const [rd, id] = await Promise.all([
        api.get(`/api/mgr/ingredients/recipes/menu/${menuId}`),
        api.get('/api/mgr/ingredients'),
      ]);
      recipeData = rd;
      allIngredients = id.items || [];
    } catch (err) { toast(err?.body?.message || 'Không tải được công thức', 'error'); return; }

    if (!allIngredients.length) {
      toast('Chưa có NVL nào. Vào màn "Nguyên liệu" tạo trước.', 'error'); return;
    }

    // Dữ liệu công thức đang sửa (mảng tạm, chưa save)
    let rows = recipeData.ingredients.map((r) => ({
      ingredient_id: r.ingredient_id,
      qty_per_dish: r.qty_per_dish,
      note: r.note || '',
    }));

    function buildRows() {
      return rows.map((r, i) => {
        const ing = allIngredients.find((x) => x.id === r.ingredient_id) || {};
        return `<tr>
          <td><select class="ct-row-ing" data-i="${i}">
            ${allIngredients.map((x) => `<option value="${x.id}" ${x.id === r.ingredient_id ? 'selected' : ''}>${escapeHtml(x.name)} (${escapeHtml(x.unit)})</option>`).join('')}
          </select></td>
          <td><input class="ct-row-qty" data-i="${i}" type="number" min="0.001" step="0.001" value="${r.qty_per_dish}" style="width:80px" /></td>
          <td><input class="ct-row-note" data-i="${i}" value="${escapeHtml(r.note)}" style="width:120px" placeholder="Ghi chú" /></td>
          <td><button class="btn ct-row-del" data-i="${i}" style="color:#c00" aria-label="Xoá dòng">${icon('dong')}</button></td>
        </tr>`;
      }).join('');
    }

    const modal = {
      overlay: null,
      close: () => {},
    };

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
    modal.overlay = div;
    modal.close = () => { div.remove(); };

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
    div.querySelector('#ct-cancel').addEventListener('click', modal.close);
    div.querySelector('#ct-save').addEventListener('click', async () => {
      // Collect current values from DOM before saving
      div.querySelectorAll('.ct-row-ing').forEach((sel) => { rows[+sel.dataset.i].ingredient_id = +sel.value; });
      div.querySelectorAll('.ct-row-qty').forEach((inp) => { rows[+inp.dataset.i].qty_per_dish = parseFloat(inp.value) || 0; });
      div.querySelectorAll('.ct-row-note').forEach((inp) => { rows[+inp.dataset.i].note = inp.value; });

      const invalid = rows.find((r) => !(r.qty_per_dish > 0));
      if (invalid) { toast('Lượng mỗi đĩa phải > 0', 'error'); return; }
      try {
        await api.put(`/api/mgr/ingredients/recipes/menu/${menuId}`, {
          ingredients: rows.map((r) => ({
            ingredient_id: r.ingredient_id,
            qty_per_dish: r.qty_per_dish,
            note: r.note || null,
          })),
        });
        toast('Đã lưu công thức');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
    });
  }

  await load();
}
