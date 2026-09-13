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
  let page = 1; const PAGE_SIZE = 20;

  container.innerHTML = `
    <div class="page-head">
      <h2>Công thức</h2>
      <div class="page-head-actions">
        ${canManage ? '<button id="ct-new" class="btn btn-primary">+ Tạo công thức</button>' : ''}
      </div>
    </div>
    <div class="sbh-card">
      <div class="sbh-card-tools">
        <input id="ct-q" class="sbh-card-search" type="search" placeholder="Tìm tên công thức" />
      </div>
      <div id="ct-list"><p style="padding:0 14px 14px">Đang tải…</p></div>
    </div>
  `;

  let qTimer = null;
  container.querySelector('#ct-q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { searchQ = e.target.value.trim().toLowerCase(); page = 1; renderList(); }, 200);
  });
  if (canManage) {
    container.querySelector('#ct-new').addEventListener('click', () => openCreateModal());
  }

  function calcCost(ings) {
    return ings.reduce((sum, r) => {
      const ing = allIngredients.find((x) => x.id === (r.ingredient_id || r.id));
      return sum + r.qty_per_dish * (ing?.cost_price || 0);
    }, 0);
  }

  function renderList() {
    const el = container.querySelector('#ct-list');

    const byMenu = new Map();
    for (const r of allRecipes) {
      if (!byMenu.has(r.menu_id)) byMenu.set(r.menu_id, { name: r.menu_name, category: r.menu_category, ings: [] });
      byMenu.get(r.menu_id).ings.push(r);
    }

    let visible = [...byMenu.entries()];
    if (searchQ) visible = visible.filter(([, info]) => info.name.toLowerCase().includes(searchQ));

    if (!visible.length) {
      el.innerHTML = searchQ
        ? '<p style="padding:0 14px 14px">Không tìm thấy công thức phù hợp.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div class="sbh-empty-ico">${icon('cong-thuc')}</div>
            <p style="font-weight:600;margin:0">Chưa có công thức nào</p>
            <p class="hint" style="margin:4px 0 16px">Áp dụng công thức để tính giá vốn tự động theo nguyên vật liệu</p>
            ${canManage ? '<button id="ct-new-2" class="btn btn-primary">Tạo ngay</button>' : ''}
          </div>`;
      if (canManage && !searchQ) {
        const btn2 = el.querySelector('#ct-new-2');
        if (btn2) btn2.addEventListener('click', () => openCreateModal());
      }
      return;
    }

    const total = visible.length;
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    el.innerHTML = `<table class="sp-table" style="width:100%">
      <thead><tr>
        <th>SẢN PHẨM</th>
        <th style="width:180px;text-align:right">GIÁ VỐN/SẢN PHẨM</th>
        ${canManage ? '<th style="width:48px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${paged.map(([menuId, info]) => {
          const cost = calcCost(info.ings.map((r) => ({ ingredient_id: r.ingredient_id, qty_per_dish: r.qty_per_dish })));
          return `<tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="sp-thumb"><span class="sp-thumb-ico">${icon('cong-thuc')}</span></div>
                <div>
                  <div style="font-weight:500">CT - ${escapeHtml(info.name)}</div>
                  <div class="stock-meta">${info.ings.length} nguyên vật liệu</div>
                </div>
              </div>
            </td>
            <td style="text-align:right;font-weight:500">${cost.toLocaleString('vi-VN')}</td>
            ${canManage ? `<td class="dm-act">
              <div class="dm-kebab-wrap">
                <button class="ord-kebab" data-gid="${menuId}" aria-label="Thao tác">${icon('them')}</button>
                <div class="row-menu dm-kebab-menu hidden" role="menu">
                  <button type="button" role="menuitem" data-act="edit" data-gid="${menuId}">${icon('chinh-sua')} Sửa công thức</button>
                </div>
              </div>
            </td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="ord-pager">
      <span style="color:var(--text-2);font-size:13px">Hiển thị ${from}–${to} / ${total} công thức</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2)">Hiển thị dòng</span>
        <select class="ct-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
          ${[10,20,30,50].map((n) => `<option value="${n}" ${n === PAGE_SIZE ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span class="ord-page-cur">${page} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        <button class="ord-page-btn" data-pg="next" ${page >= Math.ceil(total / PAGE_SIZE) ? 'disabled' : ''}>›</button>
      </div>
    </div>`;

    if (canManage) {
      const closeAll = () => el.querySelectorAll('.dm-kebab-menu').forEach((m) => {
        m.classList.add('hidden');
        m.parentElement.querySelector('.ord-kebab')?.setAttribute('aria-expanded', 'false');
      });
      el.querySelectorAll('.ord-kebab[data-gid]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAll();
          menu.classList.toggle('hidden', !willOpen);
          btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });
      document.addEventListener('click', closeAll);
      el.querySelectorAll('[data-act="edit"]').forEach((btn) => {
        btn.addEventListener('click', () => { closeAll(); openEditModal(btn.dataset.gid); });
      });
    }

    el.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pg === 'prev' && page > 1) { page--; renderList(); }
        else if (btn.dataset.pg === 'next' && page < Math.ceil(total / PAGE_SIZE)) { page++; renderList(); }
      });
    });
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
            ? (() => {
                const total = rows.reduce((s, r) => {
                  const ing = allIngredients.find((x) => x.id === r.ingredient_id) || {};
                  return s + r.qty_per_dish * (ing.cost_price || 0);
                }, 0);
                return `<table class="sp-table" style="width:100%;margin-bottom:8px">
                  <thead><tr>
                    <th>Nguyên vật liệu</th>
                    <th style="width:70px;text-align:right">SL</th>
                    <th style="width:55px;text-align:center">ĐVT</th>
                    <th style="width:90px;text-align:right">Giá vốn</th>
                    <th style="width:32px"></th>
                  </tr></thead>
                  <tbody id="ct-nvl-body">
                    ${rows.map((r, i) => {
                      const ing = allIngredients.find((x) => x.id === r.ingredient_id) || {};
                      return `<tr>
                        <td><select class="ct-row-ing" data-i="${i}" style="width:100%;border:none;background:transparent">
                          ${allIngredients.map((x) => `<option value="${x.id}" ${x.id === r.ingredient_id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
                        </select></td>
                        <td><input class="ct-row-qty" data-i="${i}" type="number" min="0.001" step="0.001" value="${r.qty_per_dish}" style="width:100%;text-align:right;border:none;background:transparent" /></td>
                        <td style="text-align:center;color:#666">${escapeHtml(ing.unit || '')}</td>
                        <td style="text-align:right;color:#666">${(r.qty_per_dish * (ing.cost_price || 0)).toLocaleString('vi-VN')}</td>
                        <td><button class="ct-row-del" data-i="${i}" style="color:#c00;background:none;border:none;cursor:pointer">×</button></td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;padding:6px 0;border-top:1px solid var(--line,#eee)">
                  <span>Giá vốn/sản phẩm</span>
                  <span>${total.toLocaleString('vi-VN')}</span>
                </div>`;
              })()
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
