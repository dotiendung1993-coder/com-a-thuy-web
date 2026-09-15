// GĐ8 mục G — màn Chuyển bàn / Tách bàn / Gộp bàn / Tách hoá đơn.
// Sao chép fnb_change_table / fnb_split_table / fnb_merge_table / split_bill của Sổ Bán Hàng.
// Dùng chung một hộp thoại cho cả 4 việc vì cách bấm gần giống nhau: chọn món (nếu cần) + chọn bàn.
import { api } from '../api.js';
import { escapeHtml, formatVND, toast, openModal, zoneLabel, tableName } from '../ui.js';

const TITLE = {
  move: 'Chuyển bàn',
  'split-table': 'Tách bàn',
  'split-bill': 'Tách hoá đơn',
  'merge-table': 'Gộp bàn',
};

const HINT = {
  move: 'Dời TOÀN BỘ đơn của bàn này sang một bàn trống khác. Tiền không thay đổi.',
  'split-table': 'Chọn món cần tách rồi chọn bàn TRỐNG để chuyển sang. Tiền hàng, giảm giá và phụ thu được chia theo đúng tỷ lệ.',
  'split-bill': 'Chọn món của nhóm khách muốn trả riêng. Đơn mới vẫn ở nguyên bàn này, thu tiền riêng được ngay.',
  'merge-table': 'Dồn đơn của bàn này sang bàn khác đang có khách. Đơn cũ được đóng lại và ghi rõ đã gộp sang đâu.',
};

/**
 * @param {object} order  đơn đang mở của bàn (phải có order_code + items)
 * @param {number} tableNo bàn hiện tại
 * @param {'move'|'split-table'|'split-bill'|'merge-table'} op
 * @param {{ onDone?: function }} handlers
 */
export function openTableOpsModal(order, tableNo, op, { onDone } = {}) {
  const needsItems = op === 'split-table' || op === 'split-bill';
  const needsTable = op !== 'split-bill';
  const items = Array.isArray(order?.items) ? order.items : [];
  // Số lượng đang chọn cho từng dòng món (mặc định 0 = không tách dòng này)
  const picked = items.map(() => 0);

  const modal = openModal(`
    <h3>${TITLE[op]} — bàn ${tableNo}</h3>
    <p class="hint">${HINT[op]}</p>
    ${needsItems ? '<div id="tops-items"></div>' : ''}
    ${needsTable ? '<div class="field"><label>Bàn nhận</label><select id="tops-table"><option value="">Đang tải danh sách bàn…</option></select></div>' : ''}
    <div id="tops-summary" class="hint"></div>
    <div class="modal-close-row">
      <button id="tops-cancel">Đóng</button>
      <button id="tops-ok" class="btn btn-primary">${TITLE[op]}</button>
    </div>
  `);

  function renderItems() {
    if (!needsItems) return;
    const el = modal.overlay.querySelector('#tops-items');
    el.innerHTML = items.map((it, i) => `
      <div class="cart-item-top" style="border-bottom:1px solid #eee;padding:6px 0;gap:8px">
        <div style="flex:1">
          <div class="cart-item-name">${escapeHtml(it.name)}</div>
          <div class="cart-item-size">Đang có ${it.qty} · ${formatVND(it.price)}/phần</div>
        </div>
        <input type="number" data-pick="${i}" min="0" max="${it.qty}" step="1" value="${picked[i]}"
               style="width:72px;text-align:center" />
      </div>`).join('');
    el.querySelectorAll('[data-pick]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.pick);
        const max = Number(items[i].qty);
        let v = Math.floor(Number(input.value));
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > max) { v = max; input.value = String(max); }
        picked[i] = v;
        renderSummary();
      });
    });
  }

  function renderSummary() {
    const el = modal.overlay.querySelector('#tops-summary');
    if (!needsItems) { el.textContent = ''; return; }
    const money = items.reduce((sum, it, i) => sum + picked[i] * Number(it.price || 0), 0);
    const count = picked.reduce((a, b) => a + b, 0);
    el.textContent = count
      ? `Đang chọn ${count} phần — tiền hàng ${formatVND(money)} (giảm giá / phụ thu sẽ được chia theo tỷ lệ).`
      : 'Chưa chọn món nào.';
  }

  async function loadTables() {
    if (!needsTable) return;
    const select = modal.overlay.querySelector('#tops-table');
    try {
      const res = await api.get('/api/mgr/tables');
      // Chuyển bàn / Tách bàn cần bàn TRỐNG. Gộp bàn thì ngược lại: bàn nhận phải đang có khách.
      const wantBusy = op === 'merge-table';
      const options = (res.tables || [])
        .filter((t) => t.table_no !== tableNo && (wantBusy ? t.status === 'dang-dung' : t.status === 'trong'));
      select.innerHTML = options.length
        // LỖI cũ: `zone === 'ngoai-san' ? 'Ngoài sân' : 'Trong nhà'` gọi MỌI khu vực khác là
        // "Trong nhà" — quán thêm "Tầng 2" là nhân viên chuyển bàn nhầm tầng.
        ? options.map((t) => `<option value="${t.table_no}">${escapeHtml(tableName(t))} — ${escapeHtml(zoneLabel(t.zone))}${wantBusy ? ' · ' + formatVND(t.open_total) : ''}</option>`).join('')
        : `<option value="">${wantBusy ? 'Không có bàn nào đang có khách để gộp vào' : 'Không còn bàn trống'}</option>`;
    } catch {
      select.innerHTML = '<option value="">Không tải được danh sách bàn</option>';
    }
  }

  function selections() {
    return items
      .map((it, i) => ({ index: i, qty: picked[i] }))
      .filter((s) => s.qty > 0);
  }

  modal.overlay.querySelector('#tops-cancel').addEventListener('click', () => modal.close());
  modal.overlay.querySelector('#tops-ok').addEventListener('click', async () => {
    const toTable = needsTable ? Number(modal.overlay.querySelector('#tops-table').value) : null;
    if (needsTable && !toTable) { toast('Chọn bàn nhận trước', 'error'); return; }
    const picks = selections();
    if (needsItems && !picks.length) { toast('Chọn ít nhất 1 món để tách', 'error'); return; }

    try {
      if (op === 'move') {
        await api.post(`/api/mgr/table-ops/${order.order_code}/move`, { to_table_no: toTable });
        toast(`Đã chuyển sang bàn ${toTable}`);
      } else if (op === 'merge-table') {
        await api.post('/api/mgr/table-ops/merge', { from_table_no: tableNo, to_table_no: toTable });
        toast(`Đã gộp bàn ${tableNo} vào bàn ${toTable}`);
      } else if (op === 'split-table') {
        await api.post(`/api/mgr/table-ops/${order.order_code}/split-table`, { to_table_no: toTable, items: picks });
        toast(`Đã tách sang bàn ${toTable}`);
      } else {
        const res = await api.post(`/api/mgr/table-ops/${order.order_code}/split-bill`, { items: picks });
        toast(`Đã tách thành hoá đơn ${res.new_order?.order_code || 'mới'}`);
      }
      modal.close();
      if (onDone) onDone();
    } catch (err) {
      toast(err?.body?.message || 'Không thực hiện được', 'error');
    }
  });

  renderItems();
  renderSummary();
  loadTables();
  return modal;
}
