// GĐ4 — Tồn kho: còn bao nhiêu hàng, món nào sắp hết, tổng giá trị hàng đang nằm trong kho.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem tồn kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { q: '', only_low: false };
  let data = { items: [], summary: {} };
  const selected = new Set();

  container.innerHTML = `
    <h2>Tồn kho</h2>
    <div class="today-card" id="tk-summary"></div>
    <div class="filter-row">
      <input id="tk-q" type="search" placeholder="Tìm tên món / mã vạch…" />
      <label style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <input id="tk-low" type="checkbox" style="width:auto;min-height:auto" /> Chỉ món sắp hết
      </label>
    </div>
    <div class="filter-row" id="tk-bulk" style="display:none">
      <span id="tk-selected"></span>
      <button id="tk-barcode" class="btn btn-primary">In mã vạch</button>
    </div>
    ${canManage ? '<button id="tk-sync" class="btn" style="width:100%;margin-bottom:8px">Đồng bộ trừ kho theo đơn đã bán</button>' : ''}
    <div id="tk-list"><p>Đang tải…</p></div>
  `;

  let searchTimer = null;
  container.querySelector('#tk-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#tk-low').addEventListener('change', (e) => {
    state.only_low = e.target.checked;
    load();
  });
  container.querySelector('#tk-barcode').addEventListener('click', openBarcodeDialog);
  if (canManage) {
    container.querySelector('#tk-sync').addEventListener('click', async () => {
      try {
        const res = await api.post('/api/mgr/stock/sync-sold');
        toast(`Đã tạo ${res.created} phiếu xuất, huỷ ${res.voided} phiếu của đơn bị huỷ`);
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không đồng bộ được', 'error');
      }
    });
  }

  function renderSummary() {
    const s = data.summary || {};
    container.querySelector('#tk-summary').innerHTML = `
      <div class="today-card-title">TỒN KHO HIỆN TẠI</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Món theo dõi</span><span class="value">${s.products ?? 0}</span></div>
        <div class="today-stat"><span class="label">Sắp hết</span><span class="value">${s.low_stock ?? 0}</span></div>
        <div class="today-stat"><span class="label">Giá trị tồn</span><span class="value">${formatVND(s.total_value || 0)}</span></div>
      </div>
      ${s.missing_cost
    ? `<div class="warn-banner">${s.missing_cost} món chưa nhập giá vốn nên chưa tính được vào giá trị tồn.
         <a href="#/gia-von">Nhập giá vốn →</a></div>`
    : ''}`;
  }

  function renderBulkBar() {
    container.querySelector('#tk-bulk').style.display = selected.size ? 'flex' : 'none';
    container.querySelector('#tk-selected').textContent = `Đã chọn ${selected.size} món`;
  }

  function renderList() {
    const el = container.querySelector('#tk-list');
    if (!data.items.length) {
      el.innerHTML = state.only_low
        ? `<p class="ok-note"><span class="inline-ico">${icon('ok')}</span> Không có món nào dưới định mức.</p>`
        : '<p>Chưa có món nào bật "Theo dõi kho". Vào màn <b>Sản phẩm</b> bật trước đã.</p>';
      return;
    }
    el.innerHTML = data.items.map((p) => `
      <div class="stock-row ${p.low_stock ? 'low' : ''}">
        <label class="stock-pick"><input type="checkbox" data-pick="${p.id}" ${selected.has(p.id) ? 'checked' : ''} /></label>
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(p.name)}
            ${p.low_stock ? '<span class="badge-warn">Sắp hết</span>' : ''}
            ${p.selling ? '' : '<span class="badge-warn">Ngừng bán</span>'}
          </div>
          <div class="stock-meta">
            Định mức: ${p.min_stock}${p.unit ? ' ' + escapeHtml(p.unit) : ''}
            ${p.cost_price ? ' · Giá vốn ' + formatVND(p.cost_price) : ' · chưa có giá vốn'}
            ${p.barcode ? ' · MV: ' + escapeHtml(p.barcode) : ''}
          </div>
        </div>
        <div class="stock-qty">
          ${p.on_hand}${p.unit ? ' ' + escapeHtml(p.unit) : ''}
          ${p.stock_value ? `<div class="stock-sub">${formatVND(p.stock_value)}</div>` : ''}
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-pick]').forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.pick); else selected.delete(box.dataset.pick);
        renderBulkBar();
      });
    });
  }

  function openBarcodeDialog() {
    const modal = openModal(`
      <h3>In mã vạch — ${selected.size} món</h3>
      <div class="field"><label>Khổ tem</label>
        <select id="tkbc-size">
          <option value="50x30">50 × 30 mm (phổ biến)</option>
          <option value="35x22">35 × 22 mm (nhỏ)</option>
          <option value="70x40">70 × 40 mm (lớn)</option>
        </select></div>
      <div class="field"><label>Số tem mỗi món</label>
        <input id="tkbc-copies" type="number" min="1" max="50" value="1" /></div>
      <button id="tkbc-go" class="btn btn-primary" style="width:100%">Mở trang in</button>
    `);
    modal.overlay.querySelector('#tkbc-go').addEventListener('click', () => {
      const params = new URLSearchParams({
        ids: [...selected].join(','),
        size: modal.overlay.querySelector('#tkbc-size').value,
        copies: modal.overlay.querySelector('#tkbc-copies').value || '1',
      });
      window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?${params}`, '_blank');
      modal.close();
    });
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.only_low) params.set('only_low', '1');
    try {
      data = await api.get(`/api/mgr/stock/levels?${params}`);
      renderSummary();
      renderList();
      renderBulkBar();
    } catch (err) {
      container.querySelector('#tk-list').innerHTML = '<p>Không tải được tồn kho.</p>';
    }
  }

  await load();
}
