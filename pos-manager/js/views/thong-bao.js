// GĐ8 mục K — Trung tâm thông báo, sao chép màn "Thông báo" của app Sổ Bán Hàng.
// Mỗi nhân viên chỉ thấy thông báo dành cho vai trò của mình, và có dấu "đã đọc" riêng.
import { api } from '../api.js';
import { escapeHtml, toast } from '../ui.js';

const LEVEL_CLASS = { info: '', warn: 'badge-warn', urgent: 'badge-warn' };

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

export async function render(container) {
  let data = { notifications: [], unread: 0, types: [] };
  let unreadOnly = false;
  let typeFilter = '';

  container.innerHTML = `
    <h2>Thông báo</h2>
    <div class="sell-chips" id="tb-chips"></div>
    <div class="modal-close-row" style="justify-content:flex-start;margin-bottom:8px">
      <button id="tb-unread">Chỉ chưa đọc</button>
      <button id="tb-read-all" class="btn">Đánh dấu đã đọc hết</button>
    </div>
    <div id="tb-list"><p>Đang tải…</p></div>
  `;

  function renderChips() {
    const el = container.querySelector('#tb-chips');
    const chips = [['', 'Tất cả'], ...data.types.map((t) => [t.value, t.label])];
    el.innerHTML = chips.map(([value, label]) =>
      `<button class="chip ${value === typeFilter ? 'active' : ''}" data-type="${escapeHtml(value)}">${escapeHtml(label)}</button>`
    ).join('');
    el.querySelectorAll('[data-type]').forEach((b) => {
      b.addEventListener('click', () => { typeFilter = b.dataset.type; load(); });
    });
  }

  function renderList() {
    const el = container.querySelector('#tb-list');
    if (!data.notifications.length) {
      el.innerHTML = `<p>${unreadOnly ? 'Không còn thông báo nào chưa đọc.' : 'Chưa có thông báo nào.'}</p>`;
      return;
    }
    el.innerHTML = data.notifications.map((n) => `
      <div class="stock-row ${n.read ? 'inactive' : ''}" data-id="${n.id}">
        <div class="stock-main">
          <div class="stock-name">
            ${n.read ? '' : '<span class="badge-default">Mới</span>'}
            ${escapeHtml(n.title)}
            ${n.level !== 'info' ? `<span class="${LEVEL_CLASS[n.level]}">${n.level === 'urgent' ? 'Gấp' : 'Chú ý'}</span>` : ''}
          </div>
          ${n.body ? `<div class="stock-meta">${escapeHtml(n.body)}</div>` : ''}
          <div class="stock-meta">${escapeHtml(n.type_label)} · ${timeAgo(n.created_at)}</div>
        </div>
        <div class="stock-actions">
          ${n.link ? `<button data-go="${escapeHtml(n.link)}" data-mark="${n.id}">Xem</button>` : ''}
          ${n.read ? '' : `<button data-mark="${n.id}">Đã đọc</button>`}
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-mark]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await api.post(`/api/mgr/notifications/${btn.dataset.mark}/read`); } catch { /* bỏ qua */ }
        if (btn.dataset.go) { location.hash = btn.dataset.go; return; }
        await load();
      });
    });
  }

  container.querySelector('#tb-unread').addEventListener('click', () => {
    unreadOnly = !unreadOnly;
    container.querySelector('#tb-unread').classList.toggle('btn-primary', unreadOnly);
    load();
  });
  container.querySelector('#tb-read-all').addEventListener('click', async () => {
    try {
      const res = await api.post('/api/mgr/notifications/read-all');
      toast(`Đã đánh dấu ${res.marked} thông báo`);
      await load();
    } catch (err) { toast(err?.body?.message || 'Không đánh dấu được', 'error'); }
  });

  async function load() {
    try {
      const params = new URLSearchParams();
      if (unreadOnly) params.set('unread', '1');
      if (typeFilter) params.set('type', typeFilter);
      data = await api.get('/api/mgr/notifications?' + params.toString());
      renderChips();
      renderList();
    } catch (err) {
      if (err?.status !== 401) container.querySelector('#tb-list').innerHTML = '<p>Không tải được thông báo.</p>';
    }
  }

  await load();
}
