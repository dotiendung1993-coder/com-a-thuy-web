// GĐ3 — Báo cáo bán hàng: tổng quan doanh thu + 7 bảng chi tiết theo ngày/món/danh mục/kênh/...
import { api } from '../api.js';
import { formatVND, escapeHtml, todayVN, dateVN, monthStartVN } from '../ui.js';

const todayStr = todayVN;
const daysAgoStr = (n) => dateVN(-n);
const monthStartStr = monthStartVN;

// Máy chủ trả chuỗi 'YYYY-MM-DD' đã cắt theo giờ Việt Nam. Đưa qua new Date() rồi format là
// lại rơi vào bẫy lệch 1 ngày (bug-062) — cứ đảo chuỗi là chắc chắn đúng.
const dmy = (ymd) => (ymd || '').split('-').reverse().join('/');

const SECTIONS = [
  {
    key: 'by_day', label: 'Theo ngày', head: ['Ngày', 'Số đơn', 'Doanh thu'],
    row: (r) => [dmy(r.day), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'by_item', label: 'Món bán chạy', head: ['Tên món', 'Danh mục', 'SL', 'Doanh thu'],
    row: (r) => [escapeHtml(r.name), escapeHtml(r.category || 'Chưa phân loại'), r.qty, formatVND(r.revenue)],
  },
  {
    key: 'by_category', label: 'Theo danh mục', head: ['Danh mục', 'SL', 'Doanh thu'],
    row: (r) => [escapeHtml(r.category || 'Chưa phân loại'), r.qty, formatVND(r.revenue)],
  },
  {
    key: 'by_channel', label: 'Theo kênh', head: ['Kênh', 'Số đơn', 'Doanh thu'],
    row: (r) => [escapeHtml(r.label), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'by_delivery', label: 'Cách nhận hàng', head: ['Cách nhận hàng', 'Số đơn', 'Doanh thu'],
    row: (r) => [escapeHtml(r.label), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'by_payment', label: 'Thanh toán', head: ['Thanh toán', 'Số đơn', 'Doanh thu'],
    row: (r) => [escapeHtml(r.label), r.order_count, formatVND(r.revenue)],
  },
  {
    key: 'by_staff', label: 'Theo nhân viên', head: ['Nhân viên', 'Số đơn', 'Doanh thu'],
    row: (r) => [escapeHtml(r.staff_name || 'Không rõ'), r.order_count, formatVND(r.revenue)],
  },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let range = { from: monthStartStr(), to: todayStr() };
  let data = null;
  let activeKey = SECTIONS[0].key;

  container.innerHTML = `
    <div class="sq-quick-range">
      <button class="chip" data-range="today">Hôm nay</button>
      <button class="chip" data-range="7d">7 ngày</button>
      <button class="chip active" data-range="month">Tháng này</button>
    </div>
    <div class="orders-filters-row" style="margin:8px 0">
      <input id="bh-from" type="date" value="${range.from}" />
      <input id="bh-to" type="date" value="${range.to}" />
    </div>
    <div id="bh-summary"><p>Đang tải…</p></div>
    <p class="rp-note">Chỉ tính đơn đã thanh toán / đã giao. Đơn huỷ không tính.</p>
    <div class="orders-tabs" id="bh-tabs">
      ${SECTIONS.map((s) => `<button class="chip ${s.key === activeKey ? 'active' : ''}" data-tab="${s.key}">${s.label}</button>`).join('')}
    </div>
    <div id="bh-table"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') range = { from: todayStr(), to: todayStr() };
      else if (b.dataset.range === '7d') range = { from: daysAgoStr(6), to: todayStr() };
      else range = { from: monthStartStr(), to: todayStr() };
      container.querySelector('#bh-from').value = range.from;
      container.querySelector('#bh-to').value = range.to;
      load();
    });
  });
  container.querySelector('#bh-from').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  container.querySelector('#bh-to').addEventListener('change', (e) => { range.to = e.target.value; load(); });
  container.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      activeKey = b.dataset.tab;
      renderActiveTable();
    });
  });

  function renderSummary(s) {
    container.querySelector('#bh-summary').innerHTML = `
      <div class="tc-totals">
        <div class="tc-total-box"><span class="label">Doanh thu</span><span class="value thu">${formatVND(s.revenue)}</span></div>
        <div class="tc-total-box"><span class="label">Số đơn</span><span class="value">${s.order_count}</span></div>
        <div class="tc-total-box"><span class="label">TB / đơn</span><span class="value">${formatVND(s.avg_order_value)}</span></div>
        <div class="tc-total-box"><span class="label">Tiền hàng</span><span class="value">${formatVND(s.subtotal)}</span></div>
        <div class="tc-total-box"><span class="label">Phí giao</span><span class="value">${formatVND(s.delivery_fee)}</span></div>
      </div>
    `;
  }

  function renderActiveTable() {
    const section = SECTIONS.find((s) => s.key === activeKey);
    const el = container.querySelector('#bh-table');
    if (!data) { el.innerHTML = '<p>Đang tải…</p>'; return; }
    const rows = data[section.key] || [];
    if (!rows.length) { el.innerHTML = '<p>Không có dữ liệu trong khoảng ngày này.</p>'; return; }
    el.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr>${section.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${section.row(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    container.querySelector('#bh-summary').innerHTML = '<p>Đang tải…</p>';
    container.querySelector('#bh-table').innerHTML = '<p>Đang tải…</p>';
    try {
      data = await api.get(`/api/mgr/reports/sales?from=${range.from}&to=${range.to}`);
      renderSummary(data.summary);
      renderActiveTable();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#bh-summary').innerHTML = '<p>Không tải được báo cáo bán hàng.</p>';
        container.querySelector('#bh-table').innerHTML = '';
      }
    }
  }

  await load();
}
