// Đợt 5 (17/08/2026) v2 — Nguyên vật liệu: giao diện SoBanHang v2.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

const COMMON_UNITS = ['kg', 'g', 'lít', 'ml', 'cái', 'hộp', 'gói', 'lọ', 'chai', 'lon', 'túi', 'thùng', 'bó', 'vỉ', 'tép', 'muỗng', 'ounce'];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem nguyên liệu.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  const state = { q: '', only_low: false };
  let data = { items: [], summary: {} };
  let page = 1; let pageSize = 20;

  container.innerHTML = `
    <div class="page-head">
      <h2>Nguyên vật liệu</h2>
      <div class="page-head-actions">
        ${canManage ? '<button id="nvl-add" class="btn btn-primary">+ Tạo nguyên vật liệu</button>' : ''}
      </div>
    </div>
    <div class="sbh-card">
      <div class="sbh-card-tools">
        <input id="nvl-q" class="sbh-card-search" type="search" placeholder="Tìm tên nguyên vật liệu" />
        <div class="sbh-tools-right">
          <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:13px;cursor:pointer">
            <input id="nvl-low" type="checkbox" style="width:auto;min-height:auto" /> Sắp hết
          </label>
        </div>
      </div>
      <div id="nvl-list"><p style="padding:0 14px 14px">Đang tải…</p></div>
    </div>
  `;

  let timer = null;
  container.querySelector('#nvl-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300);
  });
  container.querySelector('#nvl-low').addEventListener('change', (e) => {
    state.only_low = e.target.checked; load();
  });
  if (canManage) {
    container.querySelector('#nvl-add').addEventListener('click', () => openModal_(null));
  }

  function renderSummary() { /* summary hidden in v2 layout */ }

  function renderList() {
    const el = container.querySelector('#nvl-list');
    if (!data.items.length) {
      el.innerHTML = state.only_low || state.q
        ? '<p style="padding:0 14px 14px">Không có NVL nào phù hợp.</p>'
        : `<div class="empty-state" style="text-align:center;padding:48px 0">
            <div class="sbh-empty-ico">${icon('nvl')}</div>
            <p style="font-weight:600;margin:0">Chưa có nguyên vật liệu nào</p>
            <p class="hint" style="margin:4px 0 16px">Tạo nguyên vật liệu để dùng trong công thức sản phẩm</p>
            ${canManage ? '<button id="nvl-add-2" class="btn btn-primary">Tạo ngay</button>' : ''}
          </div>`;
      if (canManage && !state.q && !state.only_low) {
        const btn2 = el.querySelector('#nvl-add-2');
        if (btn2) btn2.addEventListener('click', () => openModal_(null));
      }
      return;
    }

    const items = data.items;
    const total = items.length;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const paged = items.slice((page - 1) * pageSize, page * pageSize);

    el.innerHTML = `<table class="sp-table" style="width:100%">
      <thead><tr>
        <th>TÊN NGUYÊN VẬT LIỆU</th>
        <th style="width:70px;text-align:center">ĐƠN VỊ</th>
        <th style="width:110px;text-align:right">GIÁ VỐN</th>
        <th style="width:100px;text-align:right">TỒN KHO</th>
        <th style="width:120px;text-align:right">GIÁ TRỊ KHO</th>
        ${canManage ? '<th style="width:48px"></th>' : ''}
      </tr></thead>
      <tbody>
        ${paged.map((it) => `
        <tr class="${it.negative_stock ? 'row-warn' : it.low_stock ? 'row-low' : ''}">
          <td>
            <div style="font-weight:500">${escapeHtml(it.name)}
              ${it.negative_stock ? '<span class="badge-warn" style="margin-left:6px">Tồn âm</span>' : it.low_stock ? '<span class="badge-warn" style="margin-left:6px">Sắp hết</span>' : ''}
            </div>
            ${it.code ? `<div class="stock-meta">${escapeHtml(it.code)}</div>` : ''}
          </td>
          <td style="text-align:center">${escapeHtml(it.unit)}</td>
          <td style="text-align:right">${it.cost_price ? formatVND(it.cost_price) : '—'}</td>
          <td style="text-align:right;color:${it.negative_stock ? '#c00' : 'inherit'}">${it.on_hand.toLocaleString('vi-VN')}</td>
          <td style="text-align:right">${it.cost_price ? formatVND(it.cost_price * it.on_hand) : '—'}</td>
          ${canManage ? `<td class="dm-act">
            <div class="dm-kebab-wrap">
              <button class="ord-kebab" data-gid="${it.id}" aria-label="Thao tác">${icon('them')}</button>
              <div class="row-menu dm-kebab-menu hidden" role="menu">
                <button type="button" role="menuitem" data-act="edit" data-gid="${it.id}">${icon('chinh-sua')} Chỉnh sửa</button>
              </div>
            </div>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="ord-pager">
      <span style="color:var(--text-2);font-size:13px">Hiển thị ${from}–${to} / ${total} kết quả</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2)">Hiển thị dòng</span>
        <select class="nvl-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
          ${[10,20,30,50].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span class="ord-page-cur">${page} / ${Math.max(1, Math.ceil(total / pageSize))}</span>
        <button class="ord-page-btn" data-pg="next" ${page >= Math.ceil(total / pageSize) ? 'disabled' : ''}>›</button>
      </div>
    </div>`;

    if (canManage) {
      const closeAll = () => el.querySelectorAll('.dm-kebab-menu').forEach((m) => {
        m.classList.add('hidden');
        m.parentElement.querySelector('.ord-kebab')?.setAttribute('aria-expanded', 'false');
      });
      el.querySelectorAll('.ord-kebab[data-gid]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAll();
          menu.classList.toggle('hidden', !willOpen);
          btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });
      document.addEventListener('click', closeAll);
      el.querySelectorAll('[data-act="edit"]').forEach((btn) => {
        const item = data.items.find((it) => String(it.id) === btn.dataset.gid);
        if (item) btn.addEventListener('click', () => { closeAll(); openModal_(item); });
      });
    }

    el.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pg === 'prev' && page > 1) { page--; renderList(); }
        else if (btn.dataset.pg === 'next' && page < Math.ceil(total / pageSize)) { page++; renderList(); }
      });
    });
    const sizeEl = el.querySelector('.nvl-page-size');
    if (sizeEl) sizeEl.addEventListener('change', (e) => { pageSize = Number(e.target.value); page = 1; renderList(); });
  }

  function openModal_(item) {
    const isNew = !item;
    let nameLen = item?.name?.length || 0;

    const modal = openModal(`
      <h3>${isNew ? 'Tạo nguyên vật liệu' : 'Sửa nguyên vật liệu'}</h3>
      <div class="field">
        <label style="display:flex;justify-content:space-between">
          Tên nguyên vật liệu <i class="req">*</i>
          <span id="nvl-m-name-len" style="color:#999;font-size:12px">${nameLen}/30</span>
        </label>
        <input id="nvl-m-name" maxlength="30" value="${item ? escapeHtml(item.name) : ''}" placeholder="Ví dụ: Hạt cà phê rang" />
      </div>
      <div class="field">
        <label>Đơn vị <i class="req">*</i></label>
        <input id="nvl-m-unit" list="nvl-units-list" value="${item ? escapeHtml(item.unit) : ''}" placeholder="Chọn đơn vị…" />
        <datalist id="nvl-units-list">
          ${COMMON_UNITS.map((u) => `<option value="${u}">`).join('')}
        </datalist>
      </div>
      <div class="field"><label>Giá vốn</label>
        <input id="nvl-m-cost" type="number" min="0" value="${item?.cost_price ?? 0}" /></div>
      <div class="field"><label>Tồn kho</label>
        <input id="nvl-m-stock" type="number" min="0" step="0.001" value="${item?.on_hand ?? 0}" ${!isNew ? 'readonly style="background:var(--input-disabled-bg,#f5f5f5)"' : ''} />
        ${!isNew ? '<p class="hint" style="margin:4px 0 0">Điều chỉnh tồn qua màn "Nhập / Xuất NVL"</p>' : ''}
      </div>
      <div class="field">
        <label>Cảnh báo tồn thấp</label>
        <input id="nvl-m-min" type="number" min="0" step="0.001" value="${item?.min_qty ?? ''}" placeholder="Nhập tồn kho để đặt cảnh báo" />
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button id="nvl-m-cancel" class="btn btn-ghost" style="flex:1">Huỷ</button>
        <button id="nvl-m-save" class="btn btn-primary" style="flex:1">${isNew ? 'Tạo nguyên vật liệu' : 'Lưu'}</button>
        ${!isNew ? `<button id="nvl-m-del" class="btn" style="color:#c00">Xoá</button>` : ''}
      </div>
    `);
    const ov = modal.overlay;

    ov.querySelector('#nvl-m-name').addEventListener('input', (e) => {
      nameLen = e.target.value.length;
      const span = ov.querySelector('#nvl-m-name-len');
      if (span) span.textContent = `${nameLen}/30`;
    });

    ov.querySelector('#nvl-m-cancel').addEventListener('click', modal.close);
    ov.querySelector('#nvl-m-save').addEventListener('click', async () => {
      const name = ov.querySelector('#nvl-m-name').value.trim();
      const unit = ov.querySelector('#nvl-m-unit').value.trim();
      if (!name) { toast('Tên NVL không được trống', 'error'); return; }
      if (!unit) { toast('Đơn vị không được trống', 'error'); return; }
      const body = {
        name,
        unit,
        cost_price: parseFloat(ov.querySelector('#nvl-m-cost').value) || 0,
        min_qty: parseFloat(ov.querySelector('#nvl-m-min').value) || 0,
      };
      if (isNew) {
        const initStock = parseFloat(ov.querySelector('#nvl-m-stock').value) || 0;
        if (initStock > 0) body.initial_on_hand = initStock;
      }
      try {
        if (isNew) await api.post('/api/mgr/ingredients', body);
        else await api.patch(`/api/mgr/ingredients/${item.id}`, body);
        toast(isNew ? 'Đã tạo nguyên vật liệu' : 'Đã cập nhật');
        modal.close(); await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
    });

    if (!isNew) {
      ov.querySelector('#nvl-m-del').addEventListener('click', async () => {
        if (!(await confirmDialog(`Xoá NVL "${item.name}"?`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/ingredients/${item.id}`);
          toast('Đã xoá'); modal.close(); await load();
        } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
      });
    }
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.only_low) params.set('only_low', '1');
    try {
      data = await api.get(`/api/mgr/ingredients?${params}`);
      page = 1;
      renderList();
    } catch {
      container.querySelector('#nvl-list').innerHTML = '<p>Không tải được danh sách NVL.</p>';
    }
  }

  await load();
}
