// GĐ4 — Sản phẩm (4 tab): Tất cả / Đang bán / Ngừng bán / Sắp hết.
// GĐ10 — chủ quán TỰ THÊM / SỬA / XOÁ món ngay tại đây (trước đây phải sang màn thực đơn cũ, nên
// món bị coi là "gắn cố định"). Sửa được cả tên, giá bán, danh mục lẫn phần thuộc về KHO.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  let state = { tab: 'tat-ca', q: '', category: '' };
  let data = { items: [], tabs: [], total: 0 };
  let categories = [];
  const selected = new Set();

  container.innerHTML = `
    <div class="page-head">
      <h2>Hàng hoá</h2>
      ${canManage ? '<button id="sp-new" class="btn btn-primary">+ Tạo món mới</button>' : ''}
    </div>
    <!-- GĐ11 — hàng tab lớn giống trang Hàng hóa của app.sobanhang.com (ảnh screens/05-products):
         Sản phẩm · Nhóm tuỳ chọn món · Danh mục. Bỏ "Sàn TMĐT" và "In tem mã vạch" vì quán không
         bán sàn, còn in tem đã nằm trong thanh chọn nhiều món ngay dưới đây. -->
    <div class="tab-row page-tabs">
      <button class="tab active" type="button" aria-current="page">Sản phẩm</button>
      <a class="tab" href="#/nhom-tuy-chon">Nhóm tuỳ chọn món</a>
      <a class="tab" href="#/danh-muc">Danh mục</a>
    </div>
    <div class="tab-row" id="sp-tabs"></div>
    <div class="filter-row">
      <input id="sp-q" type="search" placeholder="Tìm tên / mã / mã vạch…" />
      <select id="sp-cat"><option value="">Tất cả danh mục</option></select>
    </div>
    ${canManage ? `
      <div class="filter-row" id="sp-bulk" style="display:none">
        <span id="sp-selected-count"></span>
        <button id="sp-bulk-track" class="btn">Bật theo dõi kho</button>
        <button id="sp-bulk-untrack" class="btn">Tắt theo dõi kho</button>
        <button id="sp-bulk-barcode" class="btn btn-primary">In mã vạch</button>
      </div>` : `
      <div class="filter-row" id="sp-bulk" style="display:none">
        <span id="sp-selected-count"></span>
        <button id="sp-bulk-barcode" class="btn btn-primary">In mã vạch</button>
      </div>`}
    <div id="sp-list"><p>Đang tải…</p></div>
  `;

  const qEl = container.querySelector('#sp-q');
  const catEl = container.querySelector('#sp-cat');

  let searchTimer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = qEl.value.trim(); load(); }, 300);
  });
  catEl.addEventListener('change', () => { state.category = catEl.value; load(); });

  container.querySelector('#sp-bulk-barcode').addEventListener('click', openBarcodeDialog);
  if (canManage) {
    container.querySelector('#sp-bulk-track').addEventListener('click', () => bulkTrack(true));
    container.querySelector('#sp-bulk-untrack').addEventListener('click', () => bulkTrack(false));
    container.querySelector('#sp-new').addEventListener('click', () => openForm(null));
  }

  function renderTabs() {
    container.querySelector('#sp-tabs').innerHTML = data.tabs.map((t) => `
      <button class="tab ${t.value === state.tab ? 'active' : ''}" data-tab="${t.value}">
        ${escapeHtml(t.label)} <span class="tab-count">${t.count}</span>
      </button>`).join('');
    container.querySelectorAll('#sp-tabs .tab').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; load(); });
    });
  }

  function renderBulkBar() {
    const bar = container.querySelector('#sp-bulk');
    bar.style.display = selected.size ? 'flex' : 'none';
    container.querySelector('#sp-selected-count').textContent = `Đã chọn ${selected.size} món`;
  }

  function renderList() {
    const el = container.querySelector('#sp-list');
    if (!data.items.length) { el.innerHTML = '<p>Không có sản phẩm nào ở tab này.</p>'; return; }

    el.innerHTML = data.items.map((p) => `
      <div class="stock-row ${p.selling ? '' : 'inactive'}">
        <label class="stock-pick">
          <input type="checkbox" data-pick="${p.id}" ${selected.has(p.id) ? 'checked' : ''} />
        </label>
        <div class="stock-main">
          <div class="stock-name">
            ${escapeHtml(p.name)}
            ${p.track_stock ? '<span class="badge-default">Theo dõi kho</span>' : ''}
            ${p.low_stock ? '<span class="badge-warn">Sắp hết</span>' : ''}
          </div>
          <div class="stock-meta">
            ${escapeHtml(p.category || 'Chưa phân loại')} · ${formatVND(p.price)}
            ${p.unit ? ' / ' + escapeHtml(p.unit) : ''}
            ${p.barcode ? ' · MV: ' + escapeHtml(p.barcode) : ''}
            ${p.selling ? '' : ' · Ngừng bán'}
          </div>
        </div>
        <div class="stock-qty">
          ${p.track_stock ? `${p.on_hand}${p.unit ? ' ' + escapeHtml(p.unit) : ''}` : '—'}
        </div>
        ${canManage ? `<div class="stock-actions">
          <button data-edit="${p.id}">Sửa</button>
          <button data-variants="${p.id}">Phân loại</button>
          <button data-units="${p.id}">Đơn vị</button>
          <button class="danger" data-del="${p.id}">Xoá</button>
        </div>` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-pick]').forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.pick); else selected.delete(box.dataset.pick);
        renderBulkBar();
      });
    });
    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openForm(data.items.find((p) => p.id === btn.dataset.edit)));
      });
      // GĐ8-E / GĐ8-H — hai khối "Phân loại sản phẩm" và "Đơn vị quy đổi" của app Sổ Bán Hàng.
      el.querySelectorAll('[data-variants]').forEach((btn) => {
        btn.addEventListener('click', () => openVariantForm(data.items.find((p) => p.id === btn.dataset.variants)));
      });
      el.querySelectorAll('[data-units]').forEach((btn) => {
        btn.addEventListener('click', () => openUnitForm(data.items.find((p) => p.id === btn.dataset.units)));
      });
      el.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => removeProduct(data.items.find((p) => p.id === btn.dataset.del)));
      });
    }
  }

  /**
   * Bảng con sửa được dùng chung cho "Phân loại" và "Đơn vị quy đổi": cùng kiểu "sửa cả bảng rồi
   * bấm Lưu một lần" như màn Tạo sản phẩm của app, nên gom vào một hàm thay vì chép hai lần.
   */
  function openRowEditor({ title, hint, product, columns, blankRow, loadUrl, saveUrl, payloadKey }) {
    let rows = [];
    const modal = openModal(`
      <h3>${escapeHtml(title)} — ${escapeHtml(product.name)}</h3>
      <p class="hint">${escapeHtml(hint)}</p>
      <div id="rw-rows"><p>Đang tải…</p></div>
      <button id="rw-add" type="button" class="btn" style="width:100%;margin-top:4px">+ Thêm dòng</button>
      <button id="rw-save" class="btn btn-primary" style="width:100%;margin-top:12px">Lưu</button>
    `);

    function renderRows() {
      const box = modal.overlay.querySelector('#rw-rows');
      if (!rows.length) { box.innerHTML = '<p class="hint">Chưa có dòng nào. Bấm "+ Thêm dòng" để bắt đầu.</p>'; return; }
      box.innerHTML = rows.map((r, i) => `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          ${columns.map((c) => c.type === 'bool'
            ? `<label style="display:flex;align-items:center;gap:4px;white-space:nowrap">
                 <input data-f="${c.key}" data-i="${i}" type="checkbox" style="width:auto;min-height:auto" ${r[c.key] ? 'checked' : ''} /> ${escapeHtml(c.label)}
               </label>`
            : `<input data-f="${c.key}" data-i="${i}" type="${c.type === 'number' ? 'number' : 'text'}"
                      ${c.step ? `step="${c.step}"` : ''} ${c.min !== undefined ? `min="${c.min}"` : ''}
                      placeholder="${escapeHtml(c.label)}" value="${escapeHtml(r[c.key] ?? '')}"
                      style="flex:${c.flex || 1};min-width:90px" />`).join('')}
          <button type="button" data-rm="${i}" style="color:#c00">Xoá</button>
        </div>`).join('');

      box.querySelectorAll('[data-f]').forEach((input) => {
        const i = Number(input.dataset.i);
        const key = input.dataset.f;
        const col = columns.find((c) => c.key === key);
        const apply = () => {
          rows[i][key] = col.type === 'bool' ? input.checked
            : col.type === 'number' ? (Number(input.value) || 0)
              : input.value;
        };
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      });
      box.querySelectorAll('[data-rm]').forEach((btn) => {
        btn.addEventListener('click', () => { rows.splice(Number(btn.dataset.rm), 1); renderRows(); });
      });
    }

    modal.overlay.querySelector('#rw-add').addEventListener('click', () => {
      rows.push({ ...blankRow });
      renderRows();
    });
    modal.overlay.querySelector('#rw-save').addEventListener('click', async () => {
      try {
        await api.put(saveUrl, { [payloadKey]: rows });
        toast('Đã lưu');
        modal.close();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });

    (async () => {
      try {
        const res = await api.get(loadUrl);
        rows = (res[payloadKey] || []).map((r) => ({ ...r }));
      } catch {
        rows = [];
      }
      renderRows();
    })();
  }

  function openVariantForm(p) {
    openRowEditor({
      title: 'Phân loại sản phẩm',
      hint: 'Các phiên bản khác nhau của cùng một món (VD Kích cỡ: Lớn / Nhỏ). Giá ở đây là GIÁ BÁN TRỌN GÓI của phiên bản đó, KHÔNG cộng thêm vào giá gốc. Để giá 0 thì dùng giá gốc của món.',
      product: p,
      columns: [
        { key: 'attr_name', label: 'Nhóm (VD Kích cỡ)', type: 'text', flex: 2 },
        { key: 'name', label: 'Tên (VD Lớn)', type: 'text', flex: 2 },
        { key: 'price', label: 'Giá bán', type: 'number', min: 0 },
        { key: 'cost_price', label: 'Giá vốn', type: 'number', min: 0 },
        { key: 'in_stock', label: 'Còn', type: 'bool' },
      ],
      blankRow: { attr_name: 'Phân loại', name: '', price: 0, cost_price: 0, in_stock: true },
      loadUrl: `/api/mgr/products/${p.id}/variants`,
      saveUrl: `/api/mgr/products/${p.id}/variants`,
      payloadKey: 'variants',
    });
  }

  function openUnitForm(p) {
    openRowEditor({
      title: 'Đơn vị quy đổi',
      hint: `Đơn vị cơ bản của món này là "${p.unit || '(chưa đặt)'}". Khai thêm đơn vị lớn hơn (VD 1 Lốc = 6 Lon). Bán theo đơn vị lớn thì kho tự trừ đúng số đơn vị cơ bản.`,
      product: p,
      columns: [
        { key: 'name', label: 'Tên (VD Lốc)', type: 'text', flex: 2 },
        { key: 'factor', label: `Bằng bao nhiêu ${p.unit || 'đơn vị'}`, type: 'number', step: '0.001', min: 0 },
        { key: 'price', label: 'Giá bán', type: 'number', min: 0 },
        { key: 'barcode', label: 'Mã vạch', type: 'text', flex: 2 },
      ],
      blankRow: { name: '', factor: 1, price: 0, barcode: '' },
      loadUrl: `/api/mgr/products/${p.id}/units`,
      saveUrl: `/api/mgr/products/${p.id}/units`,
      payloadKey: 'units',
    });
  }

  // Một biểu mẫu dùng cho cả TẠO MỚI (p = null) và SỬA — giống màn "Tạo sản phẩm" của app
  // Sổ Bán Hàng, tránh hai biểu mẫu gần giống nhau rồi lệch trường.
  function openForm(p) {
    const isNew = !p;
    const cur = p || { name: '', price: 0, category: '', unit: '', barcode: '', track_stock: false, min_stock: 0, visible: true };
    const catOptions = categories
      .map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');

    const modal = openModal(`
      <h3>${isNew ? 'Tạo món mới' : escapeHtml(cur.name)}</h3>
      <div class="field"><label>Tên món *</label>
        <input id="sp-name" type="text" value="${escapeHtml(cur.name)}" placeholder="Ví dụ: Cơm sườn nướng" /></div>
      <div class="field"><label>Giá bán (đồng) *</label>
        <input id="sp-price" type="number" min="0" step="1000" value="${Number(cur.price) || 0}" /></div>
      <div class="field"><label>Danh mục</label>
        <input id="sp-cat-in" type="text" list="sp-cat-list" value="${escapeHtml(cur.category || '')}" placeholder="Cơm phần, Đồ uống…" />
        <datalist id="sp-cat-list">${catOptions}</datalist></div>
      <div class="field"><label>Đơn vị tính (lon, chai, kg…)</label>
        <input id="sp-unit" type="text" value="${escapeHtml(cur.unit || '')}" /></div>
      <div class="field"><label>Mã vạch</label>
        <input id="sp-barcode" type="text" value="${escapeHtml(cur.barcode || '')}" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="sp-visible" type="checkbox" style="width:auto;min-height:auto" ${cur.visible !== false ? 'checked' : ''} />
        Đang bán (bỏ chọn để tạm ngừng bán)
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="sp-track" type="checkbox" style="width:auto;min-height:auto" ${cur.track_stock ? 'checked' : ''} />
        Theo dõi tồn kho món này
      </label>
      <div class="field"><label>Định mức tồn tối thiểu (dưới mức này báo "Sắp hết")</label>
        <input id="sp-min" type="number" step="0.001" min="0" value="${cur.min_stock}" /></div>
      <p class="hint">Món nấu tại chỗ (cơm, canh) không nên bật theo dõi kho — nguyên vật liệu là việc của Giai đoạn 5.</p>
      <button id="sp-save" class="btn btn-primary" style="width:100%">${isNew ? 'Tạo món' : 'Lưu'}</button>
    `);

    modal.overlay.querySelector('#sp-save').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#sp-name').value.trim();
      if (!name) { toast('Chưa nhập tên món', 'error'); return; }
      const payload = {
        name,
        price: Number(modal.overlay.querySelector('#sp-price').value) || 0,
        category: modal.overlay.querySelector('#sp-cat-in').value.trim(),
        unit: modal.overlay.querySelector('#sp-unit').value.trim(),
        barcode: modal.overlay.querySelector('#sp-barcode').value.trim(),
        visible: modal.overlay.querySelector('#sp-visible').checked,
        track_stock: modal.overlay.querySelector('#sp-track').checked,
        min_stock: Number(modal.overlay.querySelector('#sp-min').value) || 0,
      };
      try {
        if (isNew) await api.post('/api/mgr/products', payload);
        else await api.patch(`/api/mgr/products/${p.id}`, payload);
        toast(isNew ? 'Đã tạo món mới' : 'Đã lưu');
        modal.close();
        await loadCategories();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  // Xoá món: xoá MỀM ở máy chủ nên hoá đơn cũ vẫn giữ nguyên tên món.
  async function removeProduct(p) {
    if (!p) return;
    const yes = await confirmDialog(
      `Xoá món "${p.name}"?\n\nMón sẽ biến mất khỏi thực đơn và màn Bán hàng.\nHoá đơn đã bán trước đó vẫn giữ nguyên.`
    );
    if (!yes) return;
    try {
      await api.del(`/api/mgr/products/${p.id}`);
      toast('Đã xoá món');
      selected.delete(p.id);
      await load();
      renderBulkBar();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được', 'error');
    }
  }

  async function bulkTrack(on) {
    try {
      const res = await api.patch('/api/mgr/products/track-stock', {
        menu_ids: [...selected], track_stock: on,
      });
      toast(`Đã ${on ? 'bật' : 'tắt'} theo dõi kho cho ${res.updated} món`);
      selected.clear();
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không cập nhật được', 'error');
    }
  }

  // In mã vạch: mở tab mới thẳng tới trang in của máy chủ (giống in bill T9). Phải dùng
  // getApiBase() vì giao diện nằm trên GitHub Pages, khác tên miền với máy chủ.
  function openBarcodeDialog() {
    const modal = openModal(`
      <h3>In mã vạch — ${selected.size} món</h3>
      <div class="field"><label>Khổ tem</label>
        <select id="bc-size">
          <option value="50x30">50 × 30 mm (phổ biến)</option>
          <option value="35x22">35 × 22 mm (nhỏ)</option>
          <option value="70x40">70 × 40 mm (lớn)</option>
        </select></div>
      <div class="field"><label>Số tem mỗi món</label>
        <input id="bc-copies" type="number" min="1" max="50" value="1" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="bc-price" type="checkbox" style="width:auto;min-height:auto" checked /> In kèm giá bán
      </label>
      <p class="hint">Món chưa có mã vạch sẽ dùng tạm mã món. Món không có cả hai sẽ bị bỏ qua và báo ở cuối trang in.</p>
      <button id="bc-go" class="btn btn-primary" style="width:100%">Mở trang in</button>
    `);
    modal.overlay.querySelector('#bc-go').addEventListener('click', () => {
      const params = new URLSearchParams({
        ids: [...selected].join(','),
        size: modal.overlay.querySelector('#bc-size').value,
        copies: modal.overlay.querySelector('#bc-copies').value || '1',
        price: modal.overlay.querySelector('#bc-price').checked ? '1' : '0',
      });
      window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?${params}`, '_blank');
      modal.close();
    });
  }

  async function loadCategories() {
    try {
      const res = await api.get('/api/mgr/products/categories');
      categories = res.categories || [];
      catEl.innerHTML = '<option value="">Tất cả danh mục</option>'
        + categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      catEl.value = state.category;
    } catch { /* danh mục không tải được thì vẫn dùng được màn hình */ }
  }

  async function load() {
    const params = new URLSearchParams({ tab: state.tab, limit: '300' });
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    try {
      data = await api.get(`/api/mgr/products?${params}`);
      renderTabs();
      renderList();
      renderBulkBar();
    } catch (err) {
      container.querySelector('#sp-list').innerHTML = '<p>Không tải được danh sách sản phẩm.</p>';
    }
  }

  await loadCategories();
  await load();
}
