// GĐ6 — Tích điểm: sổ cái điểm + cộng / đổi điểm thủ công.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.customer) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.customer_manage;

  const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
  let state = { customer_id: urlParams.get('customer_id') || '', q: '', direction: '' };
  let data = { rows: [], total: 0 };
  let loyaltyConfig = null;

  container.innerHTML = `
    <h2>Tích điểm</h2>
    ${pageTabsHtml('tich-diem', staff)}
    <div class="today-card" id="td-config"></div>
    ${canManage ? `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button id="td-add" class="btn btn-primary">+ Cộng điểm</button>
        <button id="td-redeem" class="btn">Đổi điểm</button>
        <button id="td-sync" class="btn">Đồng bộ đơn bán</button>
      </div>` : ''}
    <div class="filter-row">
      <input id="td-q" type="search" placeholder="Tìm SĐT / tên khách…" value="${escapeHtml(state.customer_id ? '' : '')}" />
      <select id="td-dir">
        <option value="">Tất cả</option>
        <option value="tich">Tích điểm</option>
        <option value="doi">Đổi điểm</option>
      </select>
    </div>
    <div id="td-list"><p>Đang tải…</p></div>
  `;

  const qEl = container.querySelector('#td-q');
  const dirEl = container.querySelector('#td-dir');

  let timer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = qEl.value.trim(); state.customer_id = ''; load(); }, 300);
  });
  dirEl.addEventListener('change', () => { state.direction = dirEl.value; load(); });

  if (canManage) {
    container.querySelector('#td-add').addEventListener('click', () => openAddForm());
    container.querySelector('#td-redeem').addEventListener('click', () => openRedeemForm());
    container.querySelector('#td-sync').addEventListener('click', async () => {
      try {
        const r = await api.post('/api/mgr/customers/loyalty/sync', {});
        toast(`Đồng bộ xong — đã tích ${r.created} đơn`);
        await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi đồng bộ', 'error'); }
    });
  }

  function renderConfig() {
    if (!loyaltyConfig) return;
    const cfg = loyaltyConfig;
    container.querySelector('#td-config').innerHTML = `
      <div class="today-card-title">CẤU HÌNH TÍCH ĐIỂM</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Trạng thái</span><span class="value" style="color:${cfg.enabled ? '#1a7' : '#c00'}">${cfg.enabled ? 'Bật' : 'Tắt'}</span></div>
        <div class="today-stat"><span class="label">Mỗi điểm</span><span class="value">${Number(cfg.earn_per_point).toLocaleString('vi')}đ</span></div>
        <div class="today-stat"><span class="label">Đổi 1 điểm</span><span class="value">${Number(cfg.redeem_value).toLocaleString('vi')}đ</span></div>
        <div class="today-stat"><span class="label">Tối thiểu đổi</span><span class="value">${cfg.min_redeem_points} điểm</span></div>
      </div>`;
  }

  function renderList() {
    const el = container.querySelector('#td-list');
    if (!data.rows.length) { el.innerHTML = '<p>Không có giao dịch điểm nào.</p>'; return; }
    el.innerHTML = data.rows.map((r) => `
      <div class="stock-row ${r.voided_at ? 'inactive' : ''}">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(r.customer_name || r.customer_phone || '—')}
            <span class="badge-default" style="background:${r.direction === 'tich' ? '#d4edda' : '#fff3cd'}">${r.direction === 'tich' ? 'Tích' : 'Đổi'}</span>
            ${r.voided_at ? '<span class="badge-warn">Đã huỷ</span>' : ''}
          </div>
          <div class="stock-meta">
            ${r.source === 'order'
              ? `<span class="inline-ico">${icon('phieu')}</span> Từ đơn hàng`
              : `<span class="inline-ico">${icon('but')}</span> Thủ công`}
            ${r.note ? ' · ' + escapeHtml(r.note) : ''}
            · ${new Date(r.created_at).toLocaleString('vi')}
            ${r.created_by_name ? ' · ' + escapeHtml(r.created_by_name) : ''}
          </div>
        </div>
        <div class="stock-qty" style="color:${r.direction === 'tich' ? '#1a7' : '#e60'}">
          ${r.direction === 'tich' ? '+' : '−'}${r.points} điểm
        </div>
        ${canManage && !r.voided_at ? `<div class="stock-actions"><button data-void="${r.id}">Huỷ</button></div>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-void]').forEach((btn) => {
        btn.addEventListener('click', () => openVoidForm(btn.dataset.void));
      });
    }
  }

  function openAddForm() {
    const modal = openModal(`
      <h3>Cộng điểm thủ công</h3>
      <div class="field"><label>SĐT khách hàng</label>
        <input id="td-phone" type="tel" placeholder="0912345678" /></div>
      <div class="field"><label>Số điểm cộng</label>
        <input id="td-pts" type="number" min="1" value="1" /></div>
      <div class="field"><label>Ghi chú (tuỳ chọn)</label>
        <input id="td-note" type="text" placeholder="Lý do cộng điểm…" /></div>
      <button id="td-do-add" class="btn btn-primary" style="width:100%">Cộng điểm</button>
    `);
    modal.overlay.querySelector('#td-do-add').addEventListener('click', async () => {
      const phone = modal.overlay.querySelector('#td-phone').value.trim();
      const points = Number(modal.overlay.querySelector('#td-pts').value);
      const note = modal.overlay.querySelector('#td-note').value.trim();
      if (!phone) { toast('Nhập SĐT khách', 'error'); return; }
      if (!points || points < 1) { toast('Số điểm phải >= 1', 'error'); return; }
      try {
        const r = await api.post('/api/mgr/customers/loyalty/add', { phone, points, note });
        toast(`Đã cộng ${points} điểm (còn ${r.balance} điểm)`);
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không cộng được điểm', 'error'); }
    });
  }

  function openRedeemForm() {
    const modal = openModal(`
      <h3>Đổi điểm lấy tiền giảm</h3>
      <div class="field"><label>SĐT khách hàng</label>
        <input id="td-rphone" type="tel" placeholder="0912345678" /></div>
      <div class="field"><label>Số điểm đổi</label>
        <input id="td-rpts" type="number" min="1" value="1" /></div>
      <div class="field"><label>Ghi chú (tuỳ chọn)</label>
        <input id="td-rnote" type="text" placeholder="Mã đơn, lý do…" /></div>
      <button id="td-do-redeem" class="btn btn-primary" style="width:100%">Đổi điểm</button>
    `);
    modal.overlay.querySelector('#td-do-redeem').addEventListener('click', async () => {
      const phone = modal.overlay.querySelector('#td-rphone').value.trim();
      const points = Number(modal.overlay.querySelector('#td-rpts').value);
      const note = modal.overlay.querySelector('#td-rnote').value.trim();
      if (!phone) { toast('Nhập SĐT khách', 'error'); return; }
      if (!points || points < 1) { toast('Số điểm phải >= 1', 'error'); return; }
      try {
        const r = await api.post('/api/mgr/customers/loyalty/redeem', { phone, points, note });
        toast(`Đã đổi ${points} điểm (còn ${r.balance} điểm)`);
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không đổi được điểm', 'error'); }
    });
  }

  function openVoidForm(id) {
    const modal = openModal(`
      <h3>Huỷ giao dịch điểm</h3>
      <div class="field"><label>Lý do huỷ</label>
        <input id="td-vreason" type="text" placeholder="Nhập lý do…" /></div>
      <button id="td-do-void" class="btn" style="width:100%;color:#c00">Xác nhận huỷ</button>
    `);
    modal.overlay.querySelector('#td-do-void').addEventListener('click', async () => {
      const reason = modal.overlay.querySelector('#td-vreason').value.trim();
      try {
        await api.post(`/api/mgr/customers/loyalty/${id}/void`, { reason });
        toast('Đã huỷ giao dịch điểm');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không huỷ được', 'error'); }
    });
  }

  async function load() {
    const params = new URLSearchParams({ limit: '200' });
    if (state.customer_id) params.set('customer_id', state.customer_id);
    if (state.q) params.set('q', state.q);
    if (state.direction) params.set('direction', state.direction);
    try {
      [data, loyaltyConfig] = await Promise.all([
        api.get(`/api/mgr/customers/loyalty?${params}`),
        api.get('/api/mgr/settings/loyalty').then((r) => r.value).catch(() => null),
      ]);
      renderConfig();
      renderList();
    } catch {
      container.querySelector('#td-list').innerHTML = '<p>Không tải được sổ tích điểm.</p>';
    }
  }

  await load();
}
