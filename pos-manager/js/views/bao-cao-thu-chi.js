// GĐ3 — Báo cáo thu chi: tổng thu/chi + chi tiết theo danh mục/nguồn tiền/ngày.
import { api } from '../api.js';
import { formatVND, escapeHtml, todayVN, dateVN, monthStartVN } from '../ui.js';

const todayStr = todayVN;
const daysAgoStr = (n) => dateVN(-n);
const monthStartStr = monthStartVN;

// Máy chủ trả chuỗi 'YYYY-MM-DD' đã cắt theo giờ Việt Nam — đưa qua new Date() sẽ lệch 1 ngày
// ở máy đặt múi giờ khác (bug-062).
const dmy = (ymd) => (ymd || '').split('-').reverse().join('/');

function percentOf(amount, total) {
  if (!total) return '0%';
  return `${((amount / total) * 100).toFixed(1)}%`;
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let range = { from: monthStartStr(), to: todayStr() };

  container.innerHTML = `
    <div class="sq-quick-range">
      <button class="chip" data-range="today">Hôm nay</button>
      <button class="chip" data-range="7d">7 ngày</button>
      <button class="chip active" data-range="month">Tháng này</button>
    </div>
    <div class="orders-filters-row" style="margin:8px 0">
      <input id="bc-from" type="date" value="${range.from}" />
      <input id="bc-to" type="date" value="${range.to}" />
    </div>
    <div id="bc-body"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') range = { from: todayStr(), to: todayStr() };
      else if (b.dataset.range === '7d') range = { from: daysAgoStr(6), to: todayStr() };
      else range = { from: monthStartStr(), to: todayStr() };
      container.querySelector('#bc-from').value = range.from;
      container.querySelector('#bc-to').value = range.to;
      load();
    });
  });
  container.querySelector('#bc-from').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  container.querySelector('#bc-to').addEventListener('change', (e) => { range.to = e.target.value; load(); });

  function renderBody(d) {
    const thuRows = (d.thu_by_category || []).map((c) => `
      <tr><td>${escapeHtml(c.category)}</td><td>${c.count}</td><td>${formatVND(c.amount)}</td><td>${percentOf(c.amount, d.summary.thu)}</td></tr>
    `).join('');
    const chiRows = (d.chi_by_category || []).map((c) => `
      <tr><td>${escapeHtml(c.category)}</td><td>${c.count}</td><td>${formatVND(c.amount)}</td><td>${percentOf(c.amount, d.summary.chi)}</td></tr>
    `).join('');
    const accountRows = (d.by_account || []).map((a) => `
      <tr><td>${escapeHtml(a.name)}</td><td>${formatVND(a.thu)}</td><td>${formatVND(a.chi)}</td><td>${formatVND(a.net)}</td></tr>
    `).join('');
    const dayRows = (d.by_day || []).map((r) => `
      <tr><td>${dmy(r.day)}</td><td>${formatVND(r.thu)}</td><td>${formatVND(r.chi)}</td><td>${formatVND(r.net)}</td></tr>
    `).join('');

    container.querySelector('#bc-body').innerHTML = `
      <div class="tc-totals">
        <div class="tc-total-box"><span class="label">Tổng thu</span><span class="value thu">${formatVND(d.summary.thu)}</span></div>
        <div class="tc-total-box"><span class="label">Tổng chi</span><span class="value chi">${formatVND(d.summary.chi)}</span></div>
        <div class="tc-total-box"><span class="label">Chênh lệch</span><span class="value">${formatVND(d.summary.net)}</span></div>
      </div>

      <div class="section-label">Thu theo danh mục</div>
      ${d.thu_by_category?.length ? `
        <div class="table-scroll"><table class="roles-table">
          <thead><tr><th>Danh mục</th><th>Số phiếu</th><th>Số tiền</th><th>% tổng thu</th></tr></thead>
          <tbody>${thuRows}</tbody>
        </table></div>
      ` : '<p>Không có khoản thu nào trong khoảng ngày này.</p>'}

      <div class="section-label">Chi theo danh mục</div>
      ${d.chi_by_category?.length ? `
        <div class="table-scroll"><table class="roles-table">
          <thead><tr><th>Danh mục</th><th>Số phiếu</th><th>Số tiền</th><th>% tổng chi</th></tr></thead>
          <tbody>${chiRows}</tbody>
        </table></div>
      ` : '<p>Không có khoản chi nào trong khoảng ngày này.</p>'}

      <div class="section-label">Theo nguồn tiền</div>
      ${d.by_account?.length ? `
        <div class="table-scroll"><table class="roles-table">
          <thead><tr><th>Nguồn tiền</th><th>Thu</th><th>Chi</th><th>Chênh lệch</th></tr></thead>
          <tbody>${accountRows}</tbody>
        </table></div>
      ` : '<p>Không có dữ liệu theo nguồn tiền.</p>'}

      <div class="section-label">Theo ngày</div>
      ${d.by_day?.length ? `
        <div class="table-scroll"><table class="roles-table">
          <thead><tr><th>Ngày</th><th>Thu</th><th>Chi</th><th>Chênh lệch</th></tr></thead>
          <tbody>${dayRows}</tbody>
        </table></div>
      ` : '<p>Không có dữ liệu theo ngày.</p>'}
    `;
  }

  async function load() {
    const el = container.querySelector('#bc-body');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const data = await api.get(`/api/mgr/reports/cashflow?from=${range.from}&to=${range.to}`);
      renderBody(data);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được báo cáo thu chi.</p>';
    }
  }

  await load();
}
