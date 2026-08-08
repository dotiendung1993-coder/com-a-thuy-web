// GĐ9 đợt 2 — Báo cáo kho: 4 KPI + danh sách chi tiết có lọc.
import { api } from '../api.js';
import { formatVND, escapeHtml, todayVN, monthStartVN } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let range  = { from: monthStartVN(), to: todayVN() };
  let state  = { category: '', status: '', view: 'qty' };
  let cats   = [];

  container.innerHTML = `
    <h2>Báo cáo kho</h2>
    <div class="sq-quick-range">
      <button class="chip" data-range="today">Hôm nay</button>
      <button class="chip active" data-range="month">Tháng này</button>
      <button class="chip" data-range="all">Tất cả</button>
    </div>
    <div class="orders-filters-row" style="margin:8px 0">
      <input id="bck-from" type="date" value="${range.from}" />
      <input id="bck-to"   type="date" value="${range.to}"   />
    </div>
    <div class="filter-row">
      <select id="bck-cat"><option value="">Tất cả danh mục</option></select>
      <select id="bck-status">
        <option value="">Tất cả trạng thái</option>
        <option value="selling">Đang bán</option>
        <option value="stopped">Ngừng bán</option>
      </select>
      <select id="bck-view">
        <option value="qty">Theo số lượng</option>
        <option value="value">Theo giá trị</option>
      </select>
    </div>
    <div id="bck-summary"><p>Đang tải...</p></div>
    <div id="bck-list"></div>
  `;

  // Tải danh mục cho filter
  api.get('/api/mgr/products/categories').then((res) => {
    cats = res.categories || [];
    const catSel = container.querySelector('#bck-cat');
    cats.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = typeof c === 'string' ? c : c.name;
      opt.textContent = typeof c === 'string' ? c : c.name;
      catSel.appendChild(opt);
    });
  }).catch(() => {});

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') { range = { from: todayVN(), to: todayVN() }; }
      else if (b.dataset.range === 'month') { range = { from: monthStartVN(), to: todayVN() }; }
      else { range = { from: '', to: '' }; }
      container.querySelector('#bck-from').value = range.from;
      container.querySelector('#bck-to').value   = range.to;
      load();
    });
  });
  container.querySelector('#bck-from').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  container.querySelector('#bck-to').addEventListener('change',   (e) => { range.to   = e.target.value; load(); });
  container.querySelector('#bck-cat').addEventListener('change',    (e) => { state.category = e.target.value; load(); });
  container.querySelector('#bck-status').addEventListener('change', (e) => { state.status   = e.target.value; load(); });
  container.querySelector('#bck-view').addEventListener('change',   (e) => { state.view     = e.target.value; renderList(lastData); });

  let lastData = null;

  function renderSummary(d) {
    const s = d.summary;
    container.querySelector('#bck-summary').innerHTML = `
      <div class="today-card">
        <div class="today-card-title">TỒN KHO</div>
        <div class="today-stats">
          <div class="today-stat"><span class="label">Giá trị tồn</span><span class="value">${formatVND(s.total_value)}</span></div>
          <div class="today-stat"><span class="label">Tổng số lượng</span><span class="value">${s.total_qty.toLocaleString('vi')}</span></div>
          <div class="today-stat"><span class="label">Sắp hết</span><span class="value" style="color:#E54">${s.low_stock_count}</span></div>
          <div class="today-stat"><span class="label">Xuất trong kỳ</span><span class="value">${s.total_outflow.toLocaleString('vi')}</span></div>
        </div>
      </div>
    `;
  }

  function renderList(d) {
    if (!d) return;
    const el = container.querySelector('#bck-list');
    if (!d.items.length) { el.innerHTML = '<p>Không có sản phẩm nào.</p>'; return; }
    const showValue = state.view === 'value';
    el.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr>
            <th>Tên sản phẩm</th>
            <th>Danh mục</th>
            <th>Tồn kho</th>
            ${showValue ? '<th>Giá trị tồn</th>' : '<th>Xuất kỳ</th>'}
            <th>Tình trạng</th>
          </tr></thead>
          <tbody>
            ${d.items.map((it) => `
              <tr class="${it.low_stock ? 'warn-row' : ''}">
                <td>${escapeHtml(it.name)}</td>
                <td>${escapeHtml(it.category || '—')}</td>
                <td>${it.on_hand.toLocaleString('vi')}${it.unit ? ' ' + escapeHtml(it.unit) : ''}</td>
                ${showValue
                  ? `<td>${it.stock_value !== null ? formatVND(it.stock_value) : '—'}</td>`
                  : `<td>${it.outflow.toLocaleString('vi')}${it.unit ? ' ' + escapeHtml(it.unit) : ''}</td>`}
                <td>${it.low_stock
                  ? `<span class="badge-warn">${icon('canh-bao')} Sắp hết</span>`
                  : (it.selling ? '<span class="badge-ok">Đang bán</span>' : '<span class="badge-warn">Ngừng bán</span>')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    container.querySelector('#bck-summary').innerHTML = '<p>Đang tải...</p>';
    container.querySelector('#bck-list').innerHTML = '';
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to)   params.set('to',   range.to);
    if (state.category) params.set('category', state.category);
    if (state.status)   params.set('status',   state.status);
    try {
      const data = await api.get(`/api/mgr/reports/inventory?${params}`);
      lastData = data;
      renderSummary(data);
      renderList(data);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#bck-summary').innerHTML = '<p>Không tải được báo cáo kho.</p>';
      }
    }
  }

  await load();
}
