// GĐ5 — Tồn NVL: bảng tổng quan tồn nguyên liệu hiện tại.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem tồn NVL.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  const state = { q: '', only_low: false };
  let data = { items: [], summary: {} };

  container.innerHTML = `
    <h2>Tồn NVL</h2>
    ${pageTabsHtml('ton-nvl', staff)}
    <div class="today-card" id="tnvl-summary"></div>
    <div class="filter-row">
      <input id="tnvl-q" type="search" placeholder="Tìm tên / mã NVL…" />
      <label style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <input id="tnvl-low" type="checkbox" style="width:auto;min-height:auto" /> Chỉ sắp hết / âm
      </label>
    </div>
    ${canManage ? '<button id="tnvl-sync" class="btn" style="width:100%;margin-bottom:8px">Đồng bộ trừ NVL theo đơn đã bán</button>' : ''}
    <div id="tnvl-list"><p>Đang tải…</p></div>
  `;

  let timer = null;
  container.querySelector('#tnvl-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#tnvl-low').addEventListener('change', (e) => {
    state.only_low = e.target.checked; load();
  });
  if (canManage) {
    container.querySelector('#tnvl-sync').addEventListener('click', async () => {
      try {
        const r = await api.post('/api/mgr/ingredients/sync-sold');
        toast(`Đã tạo ${r.created} phiếu xuất, huỷ ${r.voided} phiếu`);
        await load();
      } catch (err) { toast(err?.body?.message || 'Không đồng bộ được', 'error'); }
    });
  }

  function renderSummary() {
    const s = data.summary || {};
    container.querySelector('#tnvl-summary').innerHTML = `
      <div class="today-card-title">TỒN NGUYÊN LIỆU HIỆN TẠI</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Tổng NVL</span><span class="value">${s.total ?? 0}</span></div>
        <div class="today-stat"><span class="label">Sắp hết</span><span class="value">${s.low_stock ?? 0}</span></div>
        <div class="today-stat"><span class="label">Tồn âm</span><span class="value" style="color:${s.negative_stock ? '#c00' : 'inherit'}">${s.negative_stock ?? 0}</span></div>
        <div class="today-stat"><span class="label">Giá trị tồn</span><span class="value">${formatVND(s.total_value || 0)}</span></div>
      </div>
      ${s.negative_stock
    ? `<div class="warn-banner"><span class="inline-ico">${icon('canh-bao')}</span> ${s.negative_stock} NVL đang tồn âm — có thể chưa ghi nhập đủ. <a href="#/nhap-nvl">Nhập NVL →</a></div>`
    : ''}`;
  }

  function renderList() {
    const el = container.querySelector('#tnvl-list');
    if (!data.items.length) {
      el.innerHTML = state.only_low
        ? `<p class="ok-note"><span class="inline-ico">${icon('ok')}</span> Không có NVL nào cần chú ý.</p>`
        : '<p>Chưa có nguyên liệu nào. Vào màn <b>Nguyên liệu</b> tạo trước.</p>';
      return;
    }
    el.innerHTML = data.items.map((it) => `
      <div class="stock-row ${it.negative_stock ? 'low' : it.low_stock ? 'low' : ''}">
        <div class="stock-main">
          <div class="stock-name">${escapeHtml(it.name)}
            ${it.negative_stock ? '<span class="badge-warn" style="background:#fdd">Tồn âm</span>' : it.low_stock ? '<span class="badge-warn">Sắp hết</span>' : ''}
          </div>
          <div class="stock-meta">
            ${escapeHtml(it.code)} · Định mức: ${it.min_qty} ${escapeHtml(it.unit)}
            ${it.cost_price ? ' · ' + formatVND(it.cost_price) + '/' + escapeHtml(it.unit) : ''}
            ${it.supplier_name ? ' · NCC: ' + escapeHtml(it.supplier_name) : ''}
          </div>
        </div>
        <div class="stock-qty" style="color:${it.negative_stock ? '#c00' : 'inherit'}">
          ${Number(it.on_hand).toFixed(3).replace(/\.?0+$/, '')} ${escapeHtml(it.unit)}
          ${it.cost_price && it.on_hand > 0
    ? `<div class="stock-sub">${formatVND(Math.round(it.on_hand * it.cost_price))}</div>` : ''}
        </div>
      </div>`).join('');
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.only_low) params.set('only_low', '1');
    try {
      data = await api.get(`/api/mgr/ingredients?${params}`);
      renderSummary();
      renderList();
    } catch {
      container.querySelector('#tnvl-list').innerHTML = '<p>Không tải được tồn NVL.</p>';
    }
  }

  await load();
}
