const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function formatVND(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('vi-VN') + '₫';
}

// Khu vực bàn được LƯU dưới dạng mã không dấu ('trong-nha' | 'ngoai-san') từ migration 029, còn
// bàn tạo mới ở POS Manager lại lưu thẳng tên có dấu ('Trong nhà'). Hàm này đổi mã sang tên đọc
// được, tên có dấu thì giữ nguyên — cùng cách quy đổi mà bill-print.js / in-qr / sell.js đang dùng.
const ZONE_LABELS = { 'trong-nha': 'Trong nhà', 'ngoai-san': 'Ngoài sân' };
export function zoneLabel(zone) {
  const z = String(zone ?? '').trim();
  return ZONE_LABELS[z] || z;
}

// Ngày theo GIỜ VIỆT NAM, dạng YYYY-MM-DD. KHÔNG dùng toISOString() — hàm đó trả ngày theo giờ
// UTC nên từ 0h đến 7h sáng sẽ lùi về hôm trước (cùng loại lỗi với bug-062 ở sổ quỹ).
export function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function dateVN(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function monthStartVN() {
  return todayVN().slice(0, 8) + '01';
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Hộp thoại trong ứng dụng (KHÔNG dùng alert/confirm/prompt của trình duyệt) ───────────────
// Hộp thoại mặc định của trình duyệt hiện tên miền + kiểu dáng của Chrome, trông như thông báo
// lỗi trang web chứ không như một phần mềm bán hàng. Bộ dưới đây dùng đúng khung .modal-box
// sẵn có nên nhìn đồng bộ với mọi hộp thoại khác trong POS Manager.
//
// Cả 3 hàm đều: đóng bằng Esc, bấm ra ngoài, hoặc nút Huỷ; trả về Promise.
function baseDialog({ title, bodyHTML, okText = 'Lưu', cancelText = 'Huỷ', danger = false, onOk }) {
  return new Promise((resolve) => {
    const { overlay, close } = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <div class="dlg-body">${bodyHTML}</div>
      <div class="dlg-actions">
        ${cancelText ? `<button type="button" class="btn btn-ghost" data-dlg="cancel">${escapeHtml(cancelText)}</button>` : ''}
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dlg="ok">${escapeHtml(okText)}</button>
      </div>`);

    let done = false;
    const finish = (v) => { if (done) return; done = true; document.removeEventListener('keydown', onKey); close(); resolve(v); };
    function onKey(e) {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter' && !e.shiftKey && overlay.querySelector('textarea') !== document.activeElement) {
        e.preventDefault(); overlay.querySelector('[data-dlg="ok"]')?.click();
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    overlay.querySelector('[data-dlg="cancel"]')?.addEventListener('click', () => finish(null));
    overlay.querySelector('[data-dlg="ok"]').addEventListener('click', () => finish(onOk ? onOk(overlay) : true));

    const first = overlay.querySelector('input, textarea, select');
    if (first) { first.focus(); if (first.select) first.select(); }
  });
}

// Xác nhận Có/Không. Trả về true nếu người dùng đồng ý.
export function confirmDialog(message, { title = 'Xác nhận', okText = 'Đồng ý', danger = false } = {}) {
  return baseDialog({
    title, bodyHTML: `<p class="dlg-msg">${escapeHtml(message)}</p>`,
    okText, danger, onOk: () => true,
  }).then((v) => v === true);
}

// Nhập 1 dòng chữ/số. Trả về chuỗi đã nhập, hoặc null nếu huỷ.
// required=true → để trống thì báo ngay tại chỗ, không đóng hộp thoại.
export function promptDialog(label, {
  title = 'Nhập thông tin', value = '', placeholder = '', okText = 'Lưu',
  type = 'text', multiline = false, required = false, hint = '',
} = {}) {
  const field = multiline
    ? `<textarea class="dlg-input" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : `<input class="dlg-input" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`;
  return baseDialog({
    title, okText,
    bodyHTML: `<label class="dlg-label">${escapeHtml(label)}</label>${field}
               ${hint ? `<p class="dlg-hint">${escapeHtml(hint)}</p>` : ''}
               <p class="dlg-error hidden"></p>`,
    onOk: (overlay) => {
      const input = overlay.querySelector('.dlg-input');
      const val = String(input.value ?? '').trim();
      if (required && !val) {
        const err = overlay.querySelector('.dlg-error');
        err.textContent = 'Chỗ này không được để trống.';
        err.classList.remove('hidden');
        input.focus();
        return undefined; // undefined = chưa xong, giữ hộp thoại mở
      }
      return val;
    },
  }).then((v) => (v === undefined ? promptDialog(label, { title, value, placeholder, okText, type, multiline, required, hint }) : v));
}

// Hộp thoại chỉ để BÁO (thay alert). Chỉ có 1 nút.
export function alertDialog(message, { title = 'Thông báo', okText = 'Đã hiểu' } = {}) {
  return baseDialog({ title, bodyHTML: `<p class="dlg-msg">${escapeHtml(message)}</p>`, okText, cancelText: '', onOk: () => true });
}

export function openModal(innerHTML) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box">${innerHTML}</div>`;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { overlay, close };
}

export function showOfflineScreen(show) {
  const el = document.getElementById('offline-screen');
  if (el) el.classList.toggle('hidden', !show);
}
