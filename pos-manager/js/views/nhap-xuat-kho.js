// GĐ4 — Nhập kho / Xuất kho: một phiếu, nhiều dòng món. Chỉ chọn được món đã bật "Theo dõi kho".
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, todayVN } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock_manage) {
    container.innerHTML = '<p>Bạn không có quyền nhập/xuất kho.</p>';
    return;
  }

  let direction = 'nhap';
  let products = [];      // chỉ món track_stock
  let reasons = { nhap: [], xuat: [] };
  const lines = [];       // { menu_id, qty, unit_cost }

  container.innerHTML = `
    <h2>Nhập / Xuất kho</h2>
    <div class="tab-row" id="nx-dir">
      <button class="tab active" data-dir="nhap">Nhập kho</button>
      <button class="tab" data-dir="xuat">Xuất kho</button>
    </div>
    <div class="field"><label>Ngày phiếu</label><input id="nx-date" type="date" value="${todayVN()}" /></div>
    <div class="field"><label>Lý do</label><select id="nx-reason"></select></div>
    <div class="field" id="nx-partner-field"><label>Nhà cung cấp / người giao</label>
      <input id="nx-partner" type="text" placeholder="Không bắt buộc" /></div>
    <div class="field"><label>Ghi chú</label><input id="nx-note" type="text" placeholder="Không bắt buộc" /></div>

    <div class="section-label">Danh sách món</div>
    <div id="nx-lines"></div>
    <button id="nx-add" class="btn" style="width:100%;margin:8px 0">+ Thêm dòng</button>
    <div class="today-card" id="nx-total"></div>
    <button id="nx-submit" class="btn btn-primary" style="width:100%;margin-top:12px">Lưu phiếu</button>
    <p class="hint" id="nx-hint"></p>
  `;

  container.querySelectorAll('#nx-dir .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      direction = btn.dataset.dir;
      container.querySelectorAll('#nx-dir .tab').forEach((b) => b.classList.toggle('active', b === btn));
      container.querySelector('#nx-partner-field').style.display = direction === 'nhap' ? '' : 'none';
      renderReasons();
      renderLines();
    });
  });

  container.querySelector('#nx-add').addEventListener('click', () => { addLine(); renderLines(); });
  container.querySelector('#nx-submit').addEventListener('click', submit);

  function addLine() {
    lines.push({ menu_id: products[0]?.id || '', qty: 1, unit_cost: 0 });
  }

  function renderReasons() {
    const list = reasons[direction] || [];
    container.querySelector('#nx-reason').innerHTML =
      list.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  function productOptions(selectedId) {
    return products.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
      ${escapeHtml(p.name)}${p.unit ? ' (' + escapeHtml(p.unit) + ')' : ''} — còn ${p.on_hand}
    </option>`).join('');
  }

  function renderLines() {
    const el = container.querySelector('#nx-lines');
    if (!products.length) {
      el.innerHTML = '<p>Chưa có món nào bật "Theo dõi kho". Vào màn <b>Sản phẩm</b> bật trước đã.</p>';
      container.querySelector('#nx-submit').disabled = true;
      return;
    }
    container.querySelector('#nx-submit').disabled = false;
    if (!lines.length) addLine();

    el.innerHTML = lines.map((ln, i) => `
      <div class="stock-line" data-i="${i}">
        <select data-f="menu_id">${productOptions(ln.menu_id)}</select>
        <input data-f="qty" type="number" step="0.001" min="0" value="${ln.qty}" placeholder="SL" />
        ${direction === 'nhap'
    ? `<input data-f="unit_cost" type="number" min="0" step="1000" value="${ln.unit_cost}" placeholder="Giá nhập" />`
    : ''}
        <button data-del="${i}" title="Xoá dòng">${icon('dong')}</button>
      </div>`).join('');

    el.querySelectorAll('.stock-line').forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('change', () => {
          const f = input.dataset.f;
          lines[i][f] = f === 'menu_id' ? input.value : Number(input.value) || 0;
          renderTotal();
        });
      });
      row.querySelector('[data-del]').addEventListener('click', () => {
        lines.splice(i, 1);
        renderLines();
      });
    });
    renderTotal();
  }

  function renderTotal() {
    const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const totalCost = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
    container.querySelector('#nx-total').innerHTML = `
      <div class="today-card-title">${direction === 'nhap' ? 'TỔNG NHẬP' : 'TỔNG XUẤT'}</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Số lượng</span><span class="value">${Math.round(totalQty * 1000) / 1000}</span></div>
        ${direction === 'nhap'
    ? `<div class="today-stat"><span class="label">Tiền hàng</span><span class="value">${formatVND(totalCost)}</span></div>`
    : ''}
      </div>`;
  }

  async function submit() {
    const valid = lines.filter((l) => l.menu_id && Number(l.qty) > 0);
    if (!valid.length) { toast('Chưa có dòng nào hợp lệ (số lượng phải lớn hơn 0)', 'error'); return; }

    const btn = container.querySelector('#nx-submit');
    btn.disabled = true;
    try {
      const res = await api.post('/api/mgr/stock/moves', {
        direction,
        occurred_at: container.querySelector('#nx-date').value || undefined,
        reason: container.querySelector('#nx-reason').value,
        partner_name: direction === 'nhap' ? container.querySelector('#nx-partner').value.trim() : null,
        note: container.querySelector('#nx-note').value.trim() || null,
        items: valid.map((l) => ({ menu_id: l.menu_id, qty: l.qty, unit_cost: l.unit_cost })),
      });
      toast(`Đã lưu ${res.moves.length} dòng (${res.moves.map((m) => m.code).join(', ')})`);
      lines.length = 0;
      container.querySelector('#nx-note').value = '';
      await loadProducts();
      renderLines();
    } catch (err) {
      toast(err?.body?.message || 'Không lưu được phiếu', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function loadProducts() {
    const res = await api.get('/api/mgr/stock/levels');
    products = res.items || [];
    container.querySelector('#nx-hint').textContent =
      `${products.length} món đang theo dõi kho.`;
  }

  try {
    const moves = await api.get('/api/mgr/stock/moves?limit=1');
    reasons = moves.reasons || reasons;
    await loadProducts();
    renderReasons();
    renderLines();
  } catch (err) {
    container.querySelector('#nx-lines').innerHTML = '<p>Không tải được danh sách món.</p>';
  }
}
