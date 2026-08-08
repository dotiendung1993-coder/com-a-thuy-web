// GĐ6 — Khách hàng: danh sách + gán nhóm + xem điểm tích luỹ.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.customer) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.customer_manage;

  let state = { q: '', group_id: '' };
  let data = { customers: [], total: 0 };
  let groups = [];

  container.innerHTML = `
    <h2>Khách hàng</h2>
    <div class="filter-row">
      <input id="kh-q" type="search" placeholder="Tìm tên / SĐT…" />
      <select id="kh-group"><option value="">Tất cả nhóm</option></select>
    </div>
    <div id="kh-list"><p>Đang tải…</p></div>
  `;

  const qEl = container.querySelector('#kh-q');
  const groupEl = container.querySelector('#kh-group');

  let timer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = qEl.value.trim(); load(); }, 300);
  });
  groupEl.addEventListener('change', () => { state.group_id = groupEl.value; load(); });

  async function loadGroups() {
    try {
      const res = await api.get('/api/mgr/customers/groups');
      groups = res.groups || [];
      groupEl.innerHTML = '<option value="">Tất cả nhóm</option>'
        + groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}${g.active ? '' : ' (ẩn)'}</option>`).join('');
    } catch { /* không tải được nhóm thì vẫn dùng được */ }
  }

  function renderList() {
    const el = container.querySelector('#kh-list');
    if (!data.customers.length) {
      el.innerHTML = '<p>Không tìm thấy khách hàng nào.</p>';
      return;
    }
    el.innerHTML = data.customers.map((c) => `
      <div class="stock-row">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(c.name || '—')}
            ${c.group_name ? `<span class="badge-default">${escapeHtml(c.group_name)}</span>` : ''}
          </div>
          <div class="stock-meta">${escapeHtml(c.phone)}
            ${c.address ? ' · ' + escapeHtml(c.address) : ''}
          </div>
        </div>
        <div class="stock-qty">
          <span class="inline-ico" style="color:#E8A33D">${icon('tich-diem')} ${c.points ?? 0} điểm</span>
          ${c.group_discount_percent > 0 ? `<div class="stock-sub">Giảm ${c.group_discount_percent}%</div>` : ''}
        </div>
        ${canManage ? `<div class="stock-actions"><button data-detail="${c.id}">Chi tiết</button></div>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-detail]').forEach((btn) => {
        btn.addEventListener('click', () => openDetail(data.customers.find((c) => String(c.id) === btn.dataset.detail)));
      });
    }
  }

  function openDetail(c) {
    const modal = openModal(`
      <h3>${escapeHtml(c.name || c.phone)}</h3>
      <p style="margin:4px 0">SĐT: <b>${escapeHtml(c.phone)}</b></p>
      <p style="margin:4px 0">Điểm hiện tại: <b>${c.points ?? 0}</b></p>
      <div class="field"><label>Gán nhóm khách</label>
        <select id="kh-grp-sel">
          <option value="">— Không nhóm —</option>
          ${groups.filter((g) => g.active).map((g) => `<option value="${g.id}" ${c.group_id === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </div>
      <button id="kh-save-grp" class="btn btn-primary" style="width:100%">Lưu nhóm</button>
      <button id="kh-view-loyalty" class="btn" style="width:100%;margin-top:8px">Xem lịch sử điểm →</button>
    `);
    modal.overlay.querySelector('#kh-save-grp').addEventListener('click', async () => {
      const group_id = modal.overlay.querySelector('#kh-grp-sel').value || null;
      try {
        await api.patch(`/api/mgr/customers/${c.id}/group`, { group_id });
        toast('Đã cập nhật nhóm');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
    modal.overlay.querySelector('#kh-view-loyalty').addEventListener('click', () => {
      modal.close();
      location.hash = `#/tich-diem?customer_id=${c.id}`;
    });
  }

  async function load() {
    const params = new URLSearchParams({ limit: '200' });
    if (state.q) params.set('q', state.q);
    if (state.group_id) params.set('group_id', state.group_id);
    try {
      data = await api.get(`/api/mgr/customers?${params}`);
      renderList();
    } catch {
      container.querySelector('#kh-list').innerHTML = '<p>Không tải được danh sách khách hàng.</p>';
    }
  }

  await loadGroups();
  await load();
}
