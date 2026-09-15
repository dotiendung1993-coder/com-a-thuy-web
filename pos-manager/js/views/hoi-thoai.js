// Đợt 7 (18/08/2026) — nhóm "Đối tác": Hội thoại (route #/hoi-thoai).
// Ảnh mẫu: Website v2\Đối tác\Hội thoại\Screenshot 2026-08-12 22*.png. App gốc SoBanHang gộp chat
// đa kênh (Facebook/Zalo/TikTok Shop) + 2 mục hệ thống "Thông báo"/"Đơn hàng" vào một hộp thư
// "Hội thoại", panel bên phải mặc định là màn chào mừng mời "Kết nối ngay" các kênh mạng xã hội.
// Quán Cơm A Thúy ĐÃ CÓ Chat Center riêng cho Zalo/Facebook/Telegram (khác hẳn phần này) và CHƯA
// kết nối kênh nào qua app Sổ Bán Hàng, nên màn này chỉ dựng ĐÚNG GIAO DIỆN: 2 mục hệ thống nối
// thẳng API thật có sẵn (GET /api/mgr/notifications, GET /api/mgr/orders) — không cần backend mới.
// Nút "Kết nối ngay" + bộ lọc kênh (ảnh 224512/224523/224529/224539 — Kênh/Nhãn hội thoại/Thời
// gian/Fanpage) là tính năng upsell kết nối MXH của app gốc, KHÔNG áp dụng ở đây nên chỉ báo toast
// "đang phát triển" thay vì làm giả. Thanh tab trên cùng "Hỗ trợ/Trợ lý" (chat người thật/AI) và
// "Tài chính" của ảnh gốc cũng bỏ vì quán không có các "kênh" đó qua app này — dựng thêm sẽ là tab
// chết không làm gì, trái nguyên tắc Simplicity First.
import { api } from '../api.js';
import { escapeHtml, toast, formatVND } from '../ui.js';
import { icon } from '../icons.js';

// Icon "bộ lọc" (sliders) app gốc dùng — không có sẵn trong icons.js (không được sửa file đó ở
// đợt này) nên vẽ thẳng tại đây, cùng phong cách nét 1.8px với các icon khác trong app.
const FILTER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M4 12h16M4 17.5h16"/>'
  + '<circle cx="9" cy="6.5" r="1.8" fill="currentColor" stroke="none"/>'
  + '<circle cx="16" cy="12" r="1.8" fill="currentColor" stroke="none"/>'
  + '<circle cx="10" cy="17.5" r="1.8" fill="currentColor" stroke="none"/></svg>';

const STATUS_LABEL = {
  payment_pending: 'Chờ xác nhận', confirmed: 'Đang xử lý', preparing: 'Đang xử lý',
  paid: 'Đã giao', delivered: 'Đã giao', returned: 'Trả hàng', cancelled: 'Huỷ',
};

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

export async function render(container) {
  let notif = { notifications: [], unread: 0 };
  let notifUnreadOnly = false;
  let orders = { orders: [], counts: {} };
  let activeThread = null; // null | 'thong-bao' | 'don-hang'
  let subTab = 'tat-ca'; // 'tat-ca' | 'chua-doc'
  let searchOpen = false;
  let searchQuery = '';

  container.innerHTML = `
    <div class="page-head"><h2>Hội thoại</h2></div>
    <div class="hoithoai-wrap">
      <div class="hoithoai-list">
        <div class="hoithoai-list-head">
          <div class="hoithoai-list-title">Hội thoại</div>
          <div class="hoithoai-list-tools">
            <button type="button" class="hoithoai-icon-btn" id="ht-search-btn" aria-label="Tìm kiếm">${icon('tim-kiem')}</button>
            <button type="button" class="hoithoai-icon-btn" id="ht-filter-btn" aria-label="Bộ lọc">${FILTER_SVG}</button>
            <button type="button" class="hoithoai-icon-btn hoithoai-add-btn" id="ht-add-btn" aria-label="Kết nối kênh mới">+</button>
          </div>
        </div>
        <div class="hoithoai-search-row hidden" id="ht-search-row">
          <input type="search" id="ht-search-input" placeholder="Tìm hội thoại" />
        </div>
        <div class="tab-row hoithoai-subtabs" id="ht-subtabs"></div>
        <div id="ht-items"><p class="hoithoai-empty">Đang tải…</p></div>
      </div>
      <div class="hoithoai-panel" id="ht-panel"></div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);

  function pendingOrderCount() {
    return orders.counts?.['cho-xac-nhan'] || 0;
  }

  function threadItems() {
    const list = [
      {
        key: 'thong-bao', title: 'Thông báo', unread: notif.unread || 0,
        time: notif.notifications[0]?.created_at, avatarClass: 'notif', avatarIcon: icon('chuong'),
      },
      {
        key: 'don-hang', title: 'Đơn hàng', unread: pendingOrderCount(),
        time: orders.orders[0]?.created_at, avatarClass: 'orders', avatarIcon: icon('don-hang'),
      },
    ];
    let out = list;
    if (subTab === 'chua-doc') out = out.filter((it) => it.unread > 0);
    const q = searchQuery.trim().toLowerCase();
    if (q) out = out.filter((it) => it.title.toLowerCase().includes(q));
    return out;
  }

  function renderSubtabs() {
    const unreadCount = [
      notif.unread || 0 ? 1 : 0,
      pendingOrderCount() ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    $('#ht-subtabs').innerHTML = `
      <button class="tab ${subTab === 'tat-ca' ? 'active' : ''}" type="button" data-sub="tat-ca">Tất cả</button>
      <button class="tab ${subTab === 'chua-doc' ? 'active' : ''}" type="button" data-sub="chua-doc">Chưa đọc${unreadCount ? ` (${unreadCount})` : ''}</button>
    `;
    $('#ht-subtabs').querySelectorAll('[data-sub]').forEach((b) => {
      b.addEventListener('click', () => { subTab = b.dataset.sub; renderItems(); });
    });
  }

  function renderItems() {
    renderSubtabs();
    const list = threadItems();
    const el = $('#ht-items');
    if (!list.length) {
      el.innerHTML = `<p class="hoithoai-empty">${subTab === 'chua-doc' ? 'Không còn hội thoại nào chưa đọc.' : 'Chưa có hội thoại nào.'}</p>`;
      return;
    }
    el.innerHTML = list.map((it) => `
      <div class="hoithoai-item ${activeThread === it.key ? 'active' : ''}" data-thread="${it.key}">
        <div class="hoithoai-avatar ${it.avatarClass}">${it.avatarIcon}</div>
        <div class="hoithoai-item-main">
          <div class="hoithoai-item-title">${escapeHtml(it.title)}${it.unread ? `<span class="badge-count">${it.unread}</span>` : ''}</div>
        </div>
        <div class="hoithoai-item-time">${escapeHtml(timeAgo(it.time))}</div>
      </div>`).join('');
    el.querySelectorAll('[data-thread]').forEach((row) => {
      row.addEventListener('click', () => openThread(row.dataset.thread));
    });
  }

  function renderWelcome() {
    $('#ht-panel').innerHTML = `
      <div class="hoithoai-welcome">
        <h3>Chào mừng bạn đến với tin hội thoại</h3>
        <p>Xem lại thông báo hệ thống và đơn hàng cần chú ý ngay tại đây. Quán đang dùng Chat Center
           riêng để nhắn tin với khách qua Facebook, Zalo, Telegram — kết nối thêm kênh qua Sổ Bán
           Hàng chỉ để gộp thêm tin nhắn khách hàng vào đúng chỗ này.</p>
        <div class="hoithoai-upsell">
          <div class="hoithoai-upsell-chan hoithoai-chan-fb" title="Facebook">f</div>
          <div class="hoithoai-upsell-chan hoithoai-chan-zalo" title="Zalo">Z</div>
          <div class="hoithoai-upsell-chan hoithoai-chan-tiktok" title="TikTok Shop">t</div>
        </div>
        <button type="button" class="btn btn-primary" id="ht-connect">Kết nối ngay</button>
      </div>`;
    $('#ht-connect')?.addEventListener('click', () => {
      toast('Tính năng đang phát triển — quán đang dùng Chat Center riêng cho Zalo/Facebook/Telegram', 'info');
    });
  }

  function renderNotifPanel() {
    const el = $('#ht-panel');
    const list = notifUnreadOnly ? notif.notifications.filter((n) => !n.read) : notif.notifications;
    el.innerHTML = `
      <div class="hoithoai-panel-head">
        <h3>Thông báo</h3>
        <div class="hoithoai-panel-actions">
          <button type="button" class="btn btn-ghost" id="ht-notif-unread">${notifUnreadOnly ? 'Xem tất cả' : 'Chỉ chưa đọc'}</button>
          <button type="button" class="btn" id="ht-notif-readall">Đánh dấu đã đọc hết</button>
        </div>
      </div>
      <div class="hoithoai-thread-list">
        ${list.length ? list.map((n) => `
          <div class="stock-row ${n.read ? 'inactive' : ''}" data-id="${n.id}">
            <div class="stock-main">
              <div class="stock-name">${n.read ? '' : '<span class="badge-default">Mới</span>'}${escapeHtml(n.title)}</div>
              ${n.body ? `<div class="stock-meta">${escapeHtml(n.body)}</div>` : ''}
              <div class="stock-meta">${escapeHtml(n.type_label)} · ${escapeHtml(timeAgo(n.created_at))}</div>
            </div>
            <div class="stock-actions">
              ${n.link ? `<button type="button" data-go="${escapeHtml(n.link)}" data-mark="${n.id}">Xem</button>` : ''}
              ${n.read ? '' : `<button type="button" data-mark="${n.id}">Đã đọc</button>`}
            </div>
          </div>`).join('') : '<p class="hoithoai-empty">Chưa có thông báo nào.</p>'}
      </div>`;
    $('#ht-notif-unread').addEventListener('click', () => { notifUnreadOnly = !notifUnreadOnly; renderNotifPanel(); });
    $('#ht-notif-readall').addEventListener('click', async () => {
      try {
        const res = await api.post('/api/mgr/notifications/read-all');
        toast(`Đã đánh dấu ${res.marked} thông báo`);
        await loadNotifications();
        renderItems();
        renderNotifPanel();
      } catch (err) { toast(err?.body?.message || 'Không đánh dấu được', 'error'); }
    });
    el.querySelectorAll('[data-mark]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await api.post(`/api/mgr/notifications/${btn.dataset.mark}/read`); } catch { /* bỏ qua */ }
        if (btn.dataset.go) { location.hash = btn.dataset.go; return; }
        await loadNotifications();
        renderItems();
        renderNotifPanel();
      });
    });
  }

  function renderOrdersPanel() {
    const el = $('#ht-panel');
    const list = orders.orders || [];
    el.innerHTML = `
      <div class="hoithoai-panel-head">
        <h3>Đơn hàng cần chú ý</h3>
        <a class="btn" href="#/don-hang">Xem tất cả đơn hàng</a>
      </div>
      <div class="hoithoai-thread-list">
        ${list.length ? list.map((o) => `
          <div class="stock-row" data-code="${escapeHtml(o.order_code)}">
            <div class="stock-main">
              <div class="stock-name">${escapeHtml(o.order_code)} <span class="order-status-badge status-${escapeHtml(o.status)}">${escapeHtml(STATUS_LABEL[o.status] || o.status)}</span></div>
              <div class="stock-meta">${escapeHtml(o.customer_name || 'Khách lẻ')}${o.customer_phone ? ' · ' + escapeHtml(o.customer_phone) : ''}</div>
              <div class="stock-meta">${escapeHtml(timeAgo(o.created_at))} · ${escapeHtml(formatVND(o.total))}</div>
            </div>
          </div>`).join('') : '<p class="hoithoai-empty">Không có đơn nào đang chờ xác nhận.</p>'}
      </div>`;
    el.querySelectorAll('[data-code]').forEach((row) => {
      row.addEventListener('click', () => { location.hash = '#/don-hang'; });
    });
  }

  function openThread(key) {
    activeThread = key;
    renderItems();
    if (key === 'thong-bao') renderNotifPanel();
    else if (key === 'don-hang') renderOrdersPanel();
    else renderWelcome();
  }

  $('#ht-search-btn').addEventListener('click', () => {
    searchOpen = !searchOpen;
    $('#ht-search-row').classList.toggle('hidden', !searchOpen);
    if (searchOpen) { $('#ht-search-input').focus(); } else { searchQuery = ''; $('#ht-search-input').value = ''; renderItems(); }
  });
  $('#ht-search-input').addEventListener('input', (e) => { searchQuery = e.target.value; renderItems(); });
  $('#ht-filter-btn').addEventListener('click', () => {
    toast('Bộ lọc theo kênh (Facebook/Zalo/TikTok…) — tính năng đang phát triển', 'info');
  });
  $('#ht-add-btn').addEventListener('click', () => {
    toast('Kết nối kênh mới — tính năng đang phát triển', 'info');
  });

  async function loadNotifications() {
    try { notif = await api.get('/api/mgr/notifications?limit=20'); } catch (err) {
      if (err?.status !== 401) notif = { notifications: [], unread: 0 };
    }
  }
  async function loadOrders() {
    try { orders = await api.get('/api/mgr/orders?tab=cho-xac-nhan&sort=moi-nhat&pageSize=20'); } catch {
      orders = { orders: [], counts: {} };
    }
  }

  await Promise.all([loadNotifications(), loadOrders()]);
  renderItems();
  renderWelcome();
}
