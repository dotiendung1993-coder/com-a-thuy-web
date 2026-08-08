// T12 — Danh sách đơn hàng.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, todayVN, dateVN, monthStartVN } from '../ui.js';
import { icon } from '../icons.js';

const TABS = [
  ['tat-ca', 'Tất cả'],
  ['cho-xac-nhan', 'Chờ xác nhận'],
  ['dang-xu-ly', 'Đang xử lý'],
  ['da-giao', 'Đã giao'],
  ['tra-hang', 'Trả hàng'],
  ['huy', 'Đã huỷ'],
];
const STATUS_LABEL = {
  payment_pending: 'Chờ xác nhận', confirmed: 'Đang xử lý', preparing: 'Đang xử lý',
  paid: 'Đã giao', delivered: 'Đã giao', returned: 'Trả hàng', cancelled: 'Huỷ',
};
const DELIVERY_LABEL = { 'tai-ban': 'Tại bàn', 'mang-ve': 'Mang về', 'giao-hang': 'Giao hàng' };
const NEXT_STATUS = {
  confirmed: [['preparing', 'Bắt đầu chuẩn bị'], ['delivered', 'Đánh dấu đã giao']],
  preparing: [['delivered', 'Đánh dấu đã giao']],
  paid: [['delivered', 'Đánh dấu đã giao'], ['returned', 'Trả hàng']],
  delivered: [['returned', 'Trả hàng']],
};

// ── Task 2 mục 4 (2026-08-08): sắp xếp + lọc nhanh theo thời gian ─────────────────────────────
// Khoá phải KHỚP CHÍNH XÁC ORDER_SORTS trong src/pos-manager/services/order-service.js — server
// chỉ chấp nhận đúng 4 khoá này, giá trị lạ sẽ âm thầm rơi về 'moi-nhat'.
const SORTS = {
  'moi-nhat': 'Mới nhất trước',
  'cu-nhat': 'Cũ nhất trước',
  'tien-cao': 'Tiền cao → thấp',
  'tien-thap': 'Tiền thấp → cao',
};
const DEFAULT_SORT = 'moi-nhat';

const QUICK_RANGES = [
  ['hom-nay', 'Hôm nay'],
  ['hom-qua', 'Hôm qua'],
  ['7-ngay', '7 ngày'],
  ['thang-nay', 'Tháng này'],
];

// Trả [từ, đến] dạng YYYY-MM-DD theo GIỜ VN. Phải dùng dateVN/todayVN của ui.js chứ không phải
// toISOString() — hàm đó trả ngày UTC nên từ 0h đến 7h sáng sẽ lùi về hôm trước (bug-062).
function rangeDates(key) {
  const today = todayVN();
  if (key === 'hom-nay') return [today, today];
  if (key === 'hom-qua') { const y = dateVN(-1); return [y, y]; }
  if (key === '7-ngay') return [dateVN(-6), today];
  if (key === 'thang-nay') return [monthStartVN(), today];
  return ['', ''];
}

export async function render(container) {
  let tab = 'tat-ca';
  let filters = { search: '', date_from: '', date_to: '', delivery_type: '', staff_id: '', sort: DEFAULT_SORT };
  let orders = [];
  let counts = {};
  let staffList = [];

  container.innerHTML = `
    <div class="page-head">
      <h2>Đơn hàng</h2>
      <a class="btn btn-primary" href="#/ban-hang">+ Tạo đơn hàng</a>
    </div>
    <div class="tab-row orders-tabs" id="ord-tabs"></div>
    <div class="orders-filters">
      <input id="ord-search" type="search" placeholder="Tìm mã đơn / tên khách / SĐT" />
      <!-- Task 2 mục 4 (2026-08-08): hàng nút chọn nhanh khoảng thời gian giống SoBanHang —
           thao tác hay dùng nhất (xem doanh thu hôm nay) chỉ còn 1 lần bấm thay vì gõ 2 ô ngày. -->
      <div class="ord-quick-range" id="ord-quick-range">
        ${QUICK_RANGES.map(([key, label]) => `<button type="button" class="chip" data-range="${key}">${label}</button>`).join('')}
      </div>
      <div class="orders-filters-row">
        <input id="ord-date-from" type="date" />
        <input id="ord-date-to" type="date" />
        <select id="ord-delivery-type">
          <option value="">Mọi hình thức</option>
          <option value="tai-ban">Tại bàn</option>
          <option value="mang-ve">Mang về</option>
          <option value="giao-hang">Giao hàng</option>
        </select>
        <select id="ord-staff"><option value="">Mọi nhân viên</option></select>
        <select id="ord-sort">
          ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <button id="ord-reset" class="btn" type="button">Xoá lọc</button>
        <button id="ord-export" class="btn"><span class="inline-ico">${icon('tai-xuong')}</span> Xuất Excel</button>
      </div>
    </div>
    <div class="orders-list" id="ord-list"><p>Đang tải…</p></div>
  `;

  function renderTabs() {
    container.querySelector('#ord-tabs').innerHTML = TABS.map(([key, label]) =>
      `<button class="tab ${key === tab ? 'active' : ''}" data-tab="${key}">${label} <span class="tab-count">(${counts[key] ?? 0})</span></button>`
    ).join('');
    container.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.tab; load(); });
    });
  }

  function renderList() {
    const el = container.querySelector('#ord-list');
    if (!orders.length) { el.innerHTML = '<p>Không có đơn nào phù hợp.</p>'; return; }
    el.innerHTML = orders.map((o) => `
      <button class="order-card" data-code="${escapeHtml(o.order_code)}">
        <div class="order-card-top">
          <span class="order-code">${escapeHtml(o.order_code)}</span>
          <span class="order-status-badge status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
        </div>
        <div class="order-card-mid">
          <span>${escapeHtml(o.customer_name || 'Khách lẻ')}</span>
          <span>${DELIVERY_LABEL[o.delivery_type] || o.delivery_type}${o.table_no ? ' — Bàn ' + o.table_no : ''}</span>
        </div>
        <div class="order-card-bottom">
          <span>${new Date(o.created_at).toLocaleString('vi-VN')}</span>
          <span class="order-total">${formatVND(o.total)}</span>
        </div>
      </button>
    `).join('');
    el.querySelectorAll('.order-card').forEach((card) => {
      card.addEventListener('click', () => openDetailModal(card.dataset.code));
    });
  }

  function queryString() {
    const params = new URLSearchParams({ tab, ...filters });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    return params.toString();
  }

  async function load() {
    renderTabs();
    try {
      const res = await api.get(`/api/mgr/orders?${queryString()}`);
      orders = res.orders;
      counts = res.counts;
      renderTabs();
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#ord-list').innerHTML = '<p>Không tải được danh sách đơn.</p>';
      }
    }
  }

  // Gõ tìm kiếm: chờ 300ms rồi mới gọi API. Bản cũ gọi mỗi lần gõ một PHÍM nên tìm "Nguyễn" là
  // bắn 6 request liên tiếp, kết quả về không đúng thứ tự còn làm nháy danh sách.
  let searchTimer = null;
  container.querySelector('#ord-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
  container.querySelector('#ord-date-from').addEventListener('change', (e) => { filters.date_from = e.target.value; syncQuickRange(); load(); });
  container.querySelector('#ord-date-to').addEventListener('change', (e) => { filters.date_to = e.target.value; syncQuickRange(); load(); });
  container.querySelector('#ord-delivery-type').addEventListener('change', (e) => { filters.delivery_type = e.target.value; load(); });
  container.querySelector('#ord-staff').addEventListener('change', (e) => { filters.staff_id = e.target.value; load(); });
  container.querySelector('#ord-sort').addEventListener('change', (e) => {
    filters.sort = SORTS[e.target.value] ? e.target.value : DEFAULT_SORT;
    load();
  });

  // Chip khoảng thời gian: bấm lần nữa vào chip đang chọn thì bỏ lọc ngày (hành vi bật/tắt).
  container.querySelectorAll('#ord-quick-range .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const [from, to] = chip.classList.contains('active') ? ['', ''] : rangeDates(chip.dataset.range);
      filters.date_from = from;
      filters.date_to = to;
      container.querySelector('#ord-date-from').value = from;
      container.querySelector('#ord-date-to').value = to;
      syncQuickRange();
      load();
    });
  });

  // Tô đậm chip khớp với cặp ngày đang lọc (kể cả khi người dùng tự gõ tay đúng khoảng đó).
  function syncQuickRange() {
    container.querySelectorAll('#ord-quick-range .chip').forEach((chip) => {
      const [from, to] = rangeDates(chip.dataset.range);
      chip.classList.toggle('active', Boolean(filters.date_from) && filters.date_from === from && filters.date_to === to);
    });
  }

  container.querySelector('#ord-reset').addEventListener('click', () => {
    filters = { search: '', date_from: '', date_to: '', delivery_type: '', staff_id: '', sort: DEFAULT_SORT };
    container.querySelector('#ord-search').value = '';
    container.querySelector('#ord-date-from').value = '';
    container.querySelector('#ord-date-to').value = '';
    container.querySelector('#ord-delivery-type').value = '';
    container.querySelector('#ord-staff').value = '';
    container.querySelector('#ord-sort').value = DEFAULT_SORT;
    syncQuickRange();
    load();
  });

  container.querySelector('#ord-export').addEventListener('click', () => {
    window.open(`${getApiBase()}/api/mgr/orders/export?${queryString()}`, '_blank');
  });

  // Danh sách nhân viên cho ô lọc. Thu ngân thường KHÔNG có quyền xem danh sách nhân viên (403) —
  // trường hợp đó chỉ ẩn ô lọc đi, không báo lỗi, vì họ vốn chỉ thấy đơn của chính mình.
  async function loadStaffFilter() {
    try {
      const res = await api.get('/api/mgr/staff');
      staffList = res.staff || [];
      const sel = container.querySelector('#ord-staff');
      sel.innerHTML = '<option value="">Mọi nhân viên</option>'
        + staffList.map((s) => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>`).join('');
    } catch {
      container.querySelector('#ord-staff').classList.add('hidden');
    }
  }
  loadStaffFilter();

  // ── Chi tiết đơn: món, đổi trạng thái, in lại, huỷ ──
  function openDetailModal(code) {
    const modal = openModal('<p>Đang tải…</p>');

    function renderDetail(order) {
      const nextOptions = NEXT_STATUS[order.status] || [];
      modal.overlay.querySelector('.modal-box').innerHTML = `
        <h3>${escapeHtml(order.order_code)} <span class="order-status-badge status-${order.status}">${STATUS_LABEL[order.status] || order.status}</span></h3>
        <p>${escapeHtml(order.customer_name || 'Khách lẻ')}${order.customer_phone ? ' — ' + escapeHtml(order.customer_phone) : ''}</p>
        <p>${DELIVERY_LABEL[order.delivery_type] || order.delivery_type}${order.table_no ? ' — Bàn ' + order.table_no : ''} · NV bán: ${escapeHtml(order.sold_by_staff_name || '—')}</p>
        <div class="cart-panel" style="margin-top:8px">
          ${(order.items || []).map((it) => `
            <div class="cart-item-top" style="border-bottom:1px solid #eee;padding:6px 0">
              <div>
                <div class="cart-item-name">${it.qty}× ${escapeHtml(it.name)}</div>
                ${it.note ? `<div class="cart-item-size">${escapeHtml(it.note)}</div>` : ''}
              </div>
              <span>${formatVND(it.qty * it.price)}</span>
            </div>
          `).join('')}
          <div class="cart-total-row"><span>Tổng</span><span>${formatVND(order.total)}</span></div>
        </div>
        <div class="order-detail-actions">
          <button id="od-print" class="btn" type="button"><span class="inline-ico">${icon('in')}</span> In lại</button>
          ${nextOptions.map(([st, label]) => `<button class="btn" data-next="${st}">${escapeHtml(label)}</button>`).join('')}
          ${order.status !== 'cancelled' ? '<button id="od-cancel" class="btn" style="color:var(--danger)">Huỷ đơn</button>' : ''}
        </div>
      `;

      modal.overlay.querySelector('#od-print').addEventListener('click', () => {
        window.open(`${getApiBase()}/api/mgr/bill/${encodeURIComponent(order.order_code)}/print`, '_blank');
      });
      modal.overlay.querySelectorAll('[data-next]').forEach((b) => {
        b.addEventListener('click', () => changeStatus(order.order_code, b.dataset.next));
      });
      const cancelBtn = modal.overlay.querySelector('#od-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (!(await confirmDialog(`Huỷ đơn ${order.order_code}?`))) return;
          changeStatus(order.order_code, 'cancelled');
        });
      }
    }

    async function changeStatus(code, status) {
      try {
        await api.patch(`/api/mgr/orders/${code}/status`, { status });
        toast('Đã cập nhật trạng thái đơn');
        await refresh();
        load();
      } catch (err) {
        toast(err?.body?.message || 'Không đổi được trạng thái', 'error');
      }
    }

    async function refresh() {
      const res = await api.get(`/api/mgr/orders/${code}`);
      renderDetail(res.order);
    }

    refresh().catch(() => { modal.overlay.querySelector('.modal-box').innerHTML = '<p>Không tải được chi tiết đơn.</p>'; });
  }

  await load();
}
