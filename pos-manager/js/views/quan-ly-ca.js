// GĐ6 — Quản lý ca: mở ca / đóng ca / kiểm quỹ / lịch sử giao ca.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, pageTabsHtml } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.shift) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let currentShift = null;
  let shifts = [];

  container.innerHTML = `
    <h2>Quản lý ca</h2>
    ${pageTabsHtml('quan-ly-ca', staff)}
    <div id="qlc-current"><p>Đang tải ca hiện tại…</p></div>
    <h3 style="margin-top:20px">Lịch sử ca</h3>
    <div id="qlc-list"><p>Đang tải…</p></div>
  `;

  function renderCurrent() {
    const el = container.querySelector('#qlc-current');
    if (!currentShift) {
      el.innerHTML = `
        <div class="today-card">
          <div class="today-card-title">KHÔNG CÓ CA ĐANG MỞ</div>
          <p style="margin:8px 0">Chưa có ca nào đang chạy. Bấm mở ca để bắt đầu theo dõi quỹ và doanh thu theo ca.</p>
          <button id="qlc-open" class="btn btn-primary">Mở ca mới</button>
        </div>`;
      container.querySelector('#qlc-open').addEventListener('click', () => openShiftForm());
      return;
    }
    const s = currentShift;
    const totals = s.totals || {};
    el.innerHTML = `
      <div class="today-card">
        <div class="today-card-title">CA ĐANG MỞ · ${escapeHtml(s.code)}</div>
        <div class="today-stats">
          <div class="today-stat"><span class="label">Tiền đầu ca</span><span class="value">${formatVND(s.opening_cash)}</span></div>
          <div class="today-stat"><span class="label">Thu tiền mặt</span><span class="value" style="color:#1a7">+${formatVND(totals.cash_in ?? 0)}</span></div>
          <div class="today-stat"><span class="label">Chi tiền mặt</span><span class="value" style="color:#e60">−${formatVND(totals.cash_out ?? 0)}</span></div>
          <div class="today-stat"><span class="label">Quỹ dự kiến</span><span class="value">${formatVND(totals.expected_cash ?? 0)}</span></div>
        </div>
        <div class="today-stats" style="margin-top:8px">
          <div class="today-stat"><span class="label">Đơn hàng</span><span class="value">${totals.order_count ?? 0}</span></div>
          <div class="today-stat"><span class="label">Doanh thu</span><span class="value">${formatVND(totals.order_revenue ?? 0)}</span></div>
          <div class="today-stat"><span class="label">Mở ca lúc</span><span class="value">${new Date(s.opened_at).toLocaleTimeString('vi', {hour:'2-digit',minute:'2-digit'})}</span></div>
          <div class="today-stat"><span class="label">NV mở ca</span><span class="value">${escapeHtml(s.opened_by_name || '—')}</span></div>
        </div>
        <button id="qlc-close" class="btn btn-primary" style="margin-top:12px">Đóng ca</button>
        <button id="qlc-refresh" class="btn" style="margin-top:8px;margin-left:8px">Cập nhật số liệu</button>
      </div>`;
    container.querySelector('#qlc-close').addEventListener('click', () => closeShiftForm(s));
    container.querySelector('#qlc-refresh').addEventListener('click', () => load());
  }

  function renderList() {
    const el = container.querySelector('#qlc-list');
    if (!shifts.length) { el.innerHTML = '<p>Chưa có ca nào được ghi nhận.</p>'; return; }
    el.innerHTML = shifts.map((s) => `
      <div class="stock-row">
        <div class="stock-main">
          <div class="stock-name"><b>${escapeHtml(s.code)}</b>
            <span class="badge-default" style="background:${s.status === 'open' ? '#d4edda' : '#eee'}">${s.status === 'open' ? 'Đang mở' : 'Đã đóng'}</span>
          </div>
          <div class="stock-meta">
            Mở: ${new Date(s.opened_at).toLocaleString('vi')} · ${escapeHtml(s.opened_by_name || '—')}
            ${s.closed_at ? ` · Đóng: ${new Date(s.closed_at).toLocaleString('vi')} · ${escapeHtml(s.closed_by_name || '—')}` : ''}
          </div>
        </div>
        <div class="stock-qty">
          <span>${s.order_count ?? 0} đơn</span>
          <div class="stock-sub">${formatVND(s.order_revenue ?? 0)}</div>
          ${s.difference != null ? `<div class="stock-sub" style="color:${s.difference < 0 ? '#c00' : s.difference > 0 ? '#e60' : '#1a7'}">
            Lệch ${s.difference > 0 ? '+' : ''}${formatVND(s.difference)}
          </div>` : ''}
        </div>
      </div>`).join('');
  }

  function openShiftForm() {
    const modal = openModal(`
      <h3>Mở ca mới</h3>
      <div class="field"><label>Tiền mặt đầu ca (VND)</label>
        <input id="qlc-cash" type="number" min="0" step="1000" value="0" /></div>
      <div class="field"><label>Ghi chú (tuỳ chọn)</label>
        <input id="qlc-note" type="text" placeholder="Ca sáng, ca chiều…" /></div>
      <button id="qlc-do-open" class="btn btn-primary" style="width:100%">Mở ca</button>
    `);
    modal.overlay.querySelector('#qlc-do-open').addEventListener('click', async () => {
      const opening_cash = Number(modal.overlay.querySelector('#qlc-cash').value) || 0;
      const note = modal.overlay.querySelector('#qlc-note').value.trim();
      try {
        await api.post('/api/mgr/shifts/open', { opening_cash, note });
        toast('Đã mở ca');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không mở được ca', 'error'); }
    });
  }

  function closeShiftForm(s) {
    const modal = openModal(`
      <h3>Đóng ca ${escapeHtml(s.code)}</h3>
      <div class="field"><label>Tiền mặt thực tế đếm được (VND)</label>
        <input id="qlc-actual" type="number" min="0" step="1000" value="${s.totals?.expected_cash ?? 0}" /></div>
      <div class="field"><label>Ghi chú (tuỳ chọn)</label>
        <input id="qlc-cnote" type="text" placeholder="Bàn giao cho ca sau…" /></div>
      <button id="qlc-do-close" class="btn btn-primary" style="width:100%">Đóng ca</button>
    `);
    modal.overlay.querySelector('#qlc-do-close').addEventListener('click', async () => {
      const actual_cash = Number(modal.overlay.querySelector('#qlc-actual').value) || 0;
      const note = modal.overlay.querySelector('#qlc-cnote').value.trim();
      try {
        const r = await api.post('/api/mgr/shifts/close', { actual_cash, note });
        const diff = r.shift?.difference ?? 0;
        toast(`Đã đóng ca · Lệch quỹ: ${diff >= 0 ? '+' : ''}${formatVND(diff)}`);
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không đóng được ca', 'error'); }
    });
  }

  async function load() {
    try {
      const [cur, list] = await Promise.all([
        api.get('/api/mgr/shifts/current'),
        api.get('/api/mgr/shifts'),
      ]);
      currentShift = cur.shift || null;
      shifts = list.shifts || [];
      renderCurrent();
      renderList();
    } catch {
      container.querySelector('#qlc-current').innerHTML = '<p>Không tải được thông tin ca.</p>';
    }
  }

  await load();
}
