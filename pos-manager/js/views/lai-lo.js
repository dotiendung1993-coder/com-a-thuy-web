// GĐ3 — Lãi lỗ: doanh thu → giá vốn → lãi gộp → thu khác → chi phí → lãi ròng.
import { api } from '../api.js';
import { formatVND, escapeHtml, todayVN, dateVN, monthStartVN } from '../ui.js';
import { icon } from '../icons.js';

const todayStr = todayVN;
const daysAgoStr = (n) => dateVN(-n);
const monthStartStr = monthStartVN;

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
      <input id="ll-from" type="date" value="${range.from}" />
      <input id="ll-to" type="date" value="${range.to}" />
    </div>
    <div id="ll-body"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') range = { from: todayStr(), to: todayStr() };
      else if (b.dataset.range === '7d') range = { from: daysAgoStr(6), to: todayStr() };
      else range = { from: monthStartStr(), to: todayStr() };
      container.querySelector('#ll-from').value = range.from;
      container.querySelector('#ll-to').value = range.to;
      load();
    });
  });
  container.querySelector('#ll-from').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  container.querySelector('#ll-to').addEventListener('change', (e) => { range.to = e.target.value; load(); });

  function renderBody(d) {
    const netClass = d.net_profit >= 0 ? 'rp-positive' : 'rp-negative';
    const warningBanner = d.cost_coverage?.warning
      ? `<div class="rp-warning-banner"><span class="inline-ico">${icon('canh-bao')}</span> ${escapeHtml(d.cost_coverage.warning)} <a href="#/gia-von">Nhập giá vốn</a></div>`
      : '';

    const expenseRows = (d.expenses || []).map((e) => `
      <tr><td>${escapeHtml(e.category)}</td><td>${e.count}</td><td>${formatVND(e.amount)}</td></tr>
    `).join('');
    const incomeRows = (d.other_incomes || []).map((e) => `
      <tr><td>${escapeHtml(e.category)}</td><td>${e.count}</td><td>${formatVND(e.amount)}</td></tr>
    `).join('');

    // Breakdown dòng 1 — chỉ có khi API /profit7 trả về
    const hasBreakdown = d.subtotal !== undefined;
    const breakdown1 = hasBreakdown ? `
      <div class="rp-sub-row"><span>Tổng giá bán</span><span>${formatVND(d.subtotal)}</span></div>
      ${d.discount     ? `<div class="rp-sub-row"><span>(−) Giảm giá &amp; KM</span><span>-${formatVND(d.discount)}</span></div>` : ''}
      ${d.delivery_fee ? `<div class="rp-sub-row"><span>(+) Phí vận chuyển</span><span>${formatVND(d.delivery_fee)}</span></div>` : ''}
      ${d.surcharge    ? `<div class="rp-sub-row"><span>(+) Phụ thu</span><span>${formatVND(d.surcharge)}</span></div>` : ''}
    ` : '';

    container.querySelector('#ll-body').innerHTML = `
      ${warningBanner}
      <div class="pay-summary">
        <div class="ll-line-header"><span>(1) Doanh thu bán hàng</span><span>${formatVND(d.revenue)}</span></div>
        ${breakdown1}
        <div><span>(2) Giá vốn hàng bán</span><span>-${formatVND(d.cogs)}</span></div>
        <div><span>(3) Lợi nhuận gộp (${d.gross_margin_percent}%)</span><span class="${d.gross_profit >= 0 ? 'rp-positive' : 'rp-negative'}">${formatVND(d.gross_profit)}</span></div>
        <div><span>(4) Doanh thu khác</span><span>+${formatVND(d.other_income)}</span></div>
        <div><span>(5) Chi phí khác</span><span>-${formatVND(d.expense_total)}</span></div>
        ${d.other_profit !== undefined ? `<div><span>(6) Lợi nhuận khác</span><span class="${(d.other_profit >= 0) ? 'rp-positive' : 'rp-negative'}">${formatVND(d.other_profit)}</span></div>` : ''}
        <div class="pay-total ${netClass}"><span>(7) LÃI RÒNG</span><span>${formatVND(d.net_profit)}</span></div>
      </div>
      <p class="rp-note">Giá vốn được tính theo giá vốn HIỆN TẠI của từng món (không phải giá vốn tại thời điểm bán).</p>

      <div class="section-label">Chi phí theo danh mục</div>
      ${d.expenses?.length ? `
        <div class="table-scroll">
          <table class="roles-table">
            <thead><tr><th>Danh mục</th><th>Số phiếu</th><th>Số tiền</th></tr></thead>
            <tbody>${expenseRows}</tbody>
          </table>
        </div>
      ` : '<p>Không có chi phí trong khoảng ngày này.</p>'}

      <div class="section-label">Thu khác theo danh mục</div>
      ${d.other_incomes?.length ? `
        <div class="table-scroll">
          <table class="roles-table">
            <thead><tr><th>Danh mục</th><th>Số phiếu</th><th>Số tiền</th></tr></thead>
            <tbody>${incomeRows}</tbody>
          </table>
        </div>
      ` : '<p>Không có thu khác trong khoảng ngày này.</p>'}
    `;
  }

  async function load() {
    const el = container.querySelector('#ll-body');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      // Dùng profit7 để có 7 dòng chi tiết
      const data = await api.get(`/api/mgr/reports/profit7?from=${range.from}&to=${range.to}`)
        .catch(() => api.get(`/api/mgr/reports/profit?from=${range.from}&to=${range.to}`));
      renderBody(data);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được báo cáo lãi lỗ.</p>';
    }
  }

  await load();
}
