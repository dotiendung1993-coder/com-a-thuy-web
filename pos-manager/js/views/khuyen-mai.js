// GĐ6 — Khuyến mãi: 3 loại (giảm hoá đơn / giảm theo món / tặng món).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.promo) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.promo_manage;

  let data = { promotions: [], kinds: [] };
  let menuItems = [];

  container.innerHTML = `
    <h2>Khuyến mãi</h2>
    ${canManage ? '<button id="km-add" class="btn btn-primary" style="margin-bottom:12px">+ Tạo khuyến mãi</button>' : ''}
    <div id="km-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#km-add').addEventListener('click', () => openForm(null));
  }

  async function loadMenu() {
    try {
      const res = await api.get('/api/mgr/menu?limit=500');
      menuItems = (res.items || res.menu || []).filter((m) => !m.deleted_at);
    } catch { /* không cần menu để xem danh sách */ }
  }

  function kindLabel(k) {
    return { 'hoa-don': 'Giảm hoá đơn', 'mon': 'Giảm theo món', 'tang-mon': 'Tặng món' }[k] || k;
  }

  function renderList() {
    const el = container.querySelector('#km-list');
    if (!data.promotions.length) {
      el.innerHTML = '<p>Chưa có khuyến mãi nào. Tạo mã để áp dụng khi bán hàng.</p>';
      return;
    }
    el.innerHTML = data.promotions.map((p) => `
      <div class="stock-row ${p.active ? '' : 'inactive'}">
        <div class="stock-main">
          <div class="stock-name"><b>${escapeHtml(p.code)}</b>
            <span class="badge-default">${escapeHtml(kindLabel(p.kind))}</span>
            ${p.active ? '' : '<span class="badge-warn">Tắt</span>'}
          </div>
          <div class="stock-meta">
            ${escapeHtml(p.name || '')}
            ${p.discount_type === 'percent'
              ? ` · Giảm ${p.discount_value}%`
              : p.kind !== 'tang-mon' ? ` · Giảm ${formatVND(p.discount_value)}` : ''}
            ${p.min_order_amount ? ` · Đơn tối thiểu ${formatVND(p.min_order_amount)}` : ''}
            ${p.usage_limit ? ` · ${p.used_count}/${p.usage_limit} lượt` : ''}
            ${p.valid_from ? ` · Từ ${new Date(p.valid_from).toLocaleDateString('vi')}` : ''}
            ${p.valid_until ? ` đến ${new Date(p.valid_until).toLocaleDateString('vi')}` : ''}
          </div>
        </div>
        ${canManage ? `<div class="stock-actions"><button data-edit="${p.id}">Sửa</button></div>` : ''}
      </div>`).join('');

    if (canManage) {
      el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openForm(data.promotions.find((p) => String(p.id) === btn.dataset.edit)));
      });
    }
  }

  function menuOptions(selectedIds = []) {
    return menuItems.map((m) =>
      `<option value="${m.id}" ${selectedIds.includes(m.id) ? 'selected' : ''}>${escapeHtml(m.name)} — ${formatVND(m.price)}</option>`
    ).join('');
  }

  function openForm(p) {
    const isNew = !p;
    const kind = p?.kind || 'hoa-don';
    const modal = openModal(`
      <h3>${isNew ? 'Tạo khuyến mãi' : 'Sửa khuyến mãi'}</h3>
      <div class="field"><label>Mã khuyến mãi (viết liền, không dấu)</label>
        <input id="km-code" type="text" value="${escapeHtml(p?.code || '')}" placeholder="VD: GIAM10, FREESHIP…" ${isNew ? '' : 'readonly'} /></div>
      <div class="field"><label>Tên hiển thị</label>
        <input id="km-name" type="text" value="${escapeHtml(p?.name || '')}" placeholder="VD: Giảm 10% cuối tuần" /></div>
      ${isNew ? `
      <div class="field"><label>Loại khuyến mãi</label>
        <select id="km-kind">
          <option value="hoa-don">Giảm hoá đơn</option>
          <option value="mon">Giảm theo món</option>
          <option value="tang-mon">Tặng món</option>
        </select></div>` : `<p style="color:#888">Loại: <b>${escapeHtml(kindLabel(kind))}</b> (không thay đổi được)</p>`}
      <div id="km-kind-fields">
        ${renderKindFields(kind, p)}
      </div>
      <div class="field"><label>Đơn tối thiểu (VND, 0 = không giới hạn)</label>
        <input id="km-min" type="number" min="0" step="1000" value="${p?.min_order_amount ?? 0}" /></div>
      <div class="field"><label>Giới hạn lượt dùng (0 = không giới hạn)</label>
        <input id="km-limit" type="number" min="0" value="${p?.usage_limit ?? 0}" /></div>
      <div class="field"><label>Có hiệu lực từ (tuỳ chọn)</label>
        <input id="km-from" type="datetime-local" value="${p?.valid_from ? new Date(p.valid_from).toISOString().slice(0,16) : ''}" /></div>
      <div class="field"><label>Hết hạn (tuỳ chọn)</label>
        <input id="km-until" type="datetime-local" value="${p?.valid_until ? new Date(p.valid_until).toISOString().slice(0,16) : ''}" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="km-active" type="checkbox" style="width:auto;min-height:auto" ${!p || p.active ? 'checked' : ''} /> Kích hoạt
      </label>
      <button id="km-save" class="btn btn-primary" style="width:100%">Lưu</button>
    `);

    if (isNew) {
      modal.overlay.querySelector('#km-kind').addEventListener('change', (e) => {
        modal.overlay.querySelector('#km-kind-fields').innerHTML = renderKindFields(e.target.value, null);
      });
    }

    modal.overlay.querySelector('#km-save').addEventListener('click', async () => {
      const currentKind = isNew ? modal.overlay.querySelector('#km-kind').value : kind;
      const body = {
        code: modal.overlay.querySelector('#km-code').value.trim().toUpperCase(),
        name: modal.overlay.querySelector('#km-name').value.trim(),
        kind: currentKind,
        min_order_amount: Number(modal.overlay.querySelector('#km-min').value) || 0,
        usage_limit: Number(modal.overlay.querySelector('#km-limit').value) || 0,
        valid_from: modal.overlay.querySelector('#km-from').value || null,
        valid_until: modal.overlay.querySelector('#km-until').value || null,
        active: modal.overlay.querySelector('#km-active').checked,
      };
      if (!body.code) { toast('Nhập mã khuyến mãi', 'error'); return; }

      if (currentKind === 'tang-mon') {
        body.buy_menu_id = modal.overlay.querySelector('#km-buy')?.value || null;
        body.buy_qty = Number(modal.overlay.querySelector('#km-buyqty')?.value) || 1;
        body.gift_menu_id = modal.overlay.querySelector('#km-gift')?.value || null;
        body.gift_qty = Number(modal.overlay.querySelector('#km-giftqty')?.value) || 1;
        if (!body.buy_menu_id || !body.gift_menu_id) { toast('Chọn món mua và món tặng', 'error'); return; }
      } else {
        body.discount_type = modal.overlay.querySelector('#km-dtype').value;
        body.discount_value = Number(modal.overlay.querySelector('#km-dval').value) || 0;
        if (!body.discount_value) { toast('Nhập giá trị giảm', 'error'); return; }
        if (currentKind === 'mon') {
          const selOpts = [...modal.overlay.querySelectorAll('#km-menus option:checked')].map((o) => o.value);
          body.menu_ids = selOpts;
          if (!selOpts.length) { toast('Chọn ít nhất 1 món', 'error'); return; }
        }
        if (body.discount_type === 'percent') body.max_discount = Number(modal.overlay.querySelector('#km-maxd')?.value) || null;
      }

      try {
        if (isNew) await api.post('/api/mgr/promotions', body);
        else await api.patch(`/api/mgr/promotions/${p.id}`, body);
        toast(isNew ? 'Đã tạo khuyến mãi' : 'Đã lưu');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  function renderKindFields(k, p) {
    if (k === 'tang-mon') {
      return `
        <div class="field"><label>Mua món nào</label>
          <select id="km-buy">${menuOptions(p?.buy_menu_id ? [p.buy_menu_id] : [])}</select></div>
        <div class="field"><label>Số lượng mua</label>
          <input id="km-buyqty" type="number" min="1" value="${p?.buy_qty ?? 1}" /></div>
        <div class="field"><label>Tặng món nào</label>
          <select id="km-gift">${menuOptions(p?.gift_menu_id ? [p.gift_menu_id] : [])}</select></div>
        <div class="field"><label>Số lượng tặng</label>
          <input id="km-giftqty" type="number" min="1" value="${p?.gift_qty ?? 1}" /></div>`;
    }
    return `
      <div class="field"><label>Kiểu giảm</label>
        <select id="km-dtype">
          <option value="percent" ${p?.discount_type === 'percent' ? 'selected' : ''}>Phần trăm (%)</option>
          <option value="amount" ${p?.discount_type === 'amount' ? 'selected' : ''}>Số tiền cố định (VND)</option>
        </select></div>
      <div class="field"><label>Giá trị giảm</label>
        <input id="km-dval" type="number" min="0" value="${p?.discount_value ?? 0}" /></div>
      <div class="field"><label>Giảm tối đa (VND, chỉ áp dụng khi giảm %)</label>
        <input id="km-maxd" type="number" min="0" step="1000" value="${p?.max_discount ?? 0}" /></div>
      ${k === 'mon' ? `<div class="field"><label>Áp dụng cho món (giữ Ctrl để chọn nhiều)</label>
        <select id="km-menus" multiple size="5">${menuOptions(p?.menu_ids || [])}</select></div>` : ''}`;
  }

  async function load() {
    try {
      data = await api.get('/api/mgr/promotions');
      renderList();
    } catch {
      container.querySelector('#km-list').innerHTML = '<p>Không tải được danh sách khuyến mãi.</p>';
    }
  }

  await loadMenu();
  await load();
}
