// GĐ2 — Sổ quỹ: tồn đầu/thu/chi/tồn cuối theo nguồn tiền + dòng tiền theo ngày.
import { api } from '../api.js';
import { formatVND, escapeHtml, todayVN, dateVN, monthStartVN } from '../ui.js';

// Ngày luôn tính theo giờ Việt Nam (xem ghi chú ở ui.js) — máy chủ cũng cắt ngày theo giờ VN.
const todayStr = todayVN;
const daysAgoStr = (n) => dateVN(-n);
const monthStartStr = monthStartVN;

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.cash) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let range = { from: todayStr(), to: todayStr() };
  let accountId = '';

  container.innerHTML = `
    <div class="sq-quick-range">
      <button class="chip active" data-range="today">Hôm nay</button>
      <button class="chip" data-range="7d">7 ngày</button>
      <button class="chip" data-range="month">Tháng này</button>
    </div>
    <div class="orders-filters-row" style="margin:8px 0">
      <input id="sq-from" type="date" value="${range.from}" />
      <input id="sq-to" type="date" value="${range.to}" />
    </div>
    <div id="sq-summary"><p>Đang tải…</p></div>
    <div class="section-label">Dòng tiền theo ngày</div>
    <select id="sq-account" style="margin-bottom:8px"><option value="">Tất cả nguồn tiền</option></select>
    <div id="sq-daily"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') range = { from: todayStr(), to: todayStr() };
      else if (b.dataset.range === '7d') range = { from: daysAgoStr(6), to: todayStr() };
      else range = { from: monthStartStr(), to: todayStr() };
      container.querySelector('#sq-from').value = range.from;
      container.querySelector('#sq-to').value = range.to;
      loadAll();
    });
  });
  container.querySelector('#sq-from').addEventListener('change', (e) => { range.from = e.target.value; loadAll(); });
  container.querySelector('#sq-to').addEventListener('change', (e) => { range.to = e.target.value; loadAll(); });
  container.querySelector('#sq-account').addEventListener('change', (e) => { accountId = e.target.value; loadDaily(); });

  function renderSummary(data) {
    const el = container.querySelector('#sq-summary');
    el.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr><th>Nguồn tiền</th><th>Tồn đầu</th><th>Thu</th><th>Chi</th><th>Tồn cuối</th></tr></thead>
          <tbody>
            ${data.accounts.map((a) => `
              <tr>
                <td>${escapeHtml(a.name)}</td>
                <td>${formatVND(a.opening)}</td>
                <td>${formatVND(a.thu)}</td>
                <td>${formatVND(a.chi)}</td>
                <td>${formatVND(a.closing)}</td>
              </tr>
            `).join('')}
            <tr style="font-weight:700">
              <td>TỔNG</td>
              <td>${formatVND(data.total.opening)}</td>
              <td>${formatVND(data.total.thu)}</td>
              <td>${formatVND(data.total.chi)}</td>
              <td>${formatVND(data.total.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDaily(days) {
    const el = container.querySelector('#sq-daily');
    if (!days.length) { el.innerHTML = '<p>Không có dữ liệu trong khoảng ngày này.</p>'; return; }
    el.innerHTML = days.map((d) => `
      <div class="tc-row">
        <div class="tc-row-main">
          <div class="tc-row-top">
            <span class="tc-code">${new Date(d.day).toLocaleDateString('vi-VN')}</span>
            <span class="tc-amount ${d.net >= 0 ? 'thu' : 'chi'}">${formatVND(d.net)}</span>
          </div>
          <div class="tc-row-meta">Thu ${formatVND(d.thu)} · Chi ${formatVND(d.chi)}</div>
        </div>
      </div>
    `).join('');
  }

  async function loadAccounts() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      container.querySelector('#sq-account').innerHTML = '<option value="">Tất cả nguồn tiền</option>' +
        res.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    } catch { /* bỏ qua, bộ lọc theo nguồn tiền không dùng được nhưng bảng tổng vẫn xem được */ }
  }

  async function loadSummary() {
    const el = container.querySelector('#sq-summary');
    try {
      const data = await api.get(`/api/mgr/cashbook/summary?from=${range.from}&to=${range.to}`);
      renderSummary(data);
    } catch {
      el.innerHTML = '<p>Không tải được sổ quỹ.</p>';
    }
  }

  async function loadDaily() {
    const el = container.querySelector('#sq-daily');
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (accountId) params.set('account_id', accountId);
      const data = await api.get(`/api/mgr/cashbook/daily?${params.toString()}`);
      renderDaily(data.days);
    } catch {
      el.innerHTML = '<p>Không tải được dòng tiền theo ngày.</p>';
    }
  }

  async function loadAll() {
    await Promise.all([loadSummary(), loadDaily()]);
  }

  await loadAccounts();
  await loadAll();
}
