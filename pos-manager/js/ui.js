// nav.js là danh sách màn + quyền, KHÔNG import ngược lại ui.js nên nhập ở đây không tạo vòng lặp.
import { FEATURES, allowedFeatures } from './nav.js';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function formatVND(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('vi-VN') + '₫';
}

// ─── Định dạng số cho Ô NHẬP (TASK-dinh-dang-so.md, 22/09/2026) ───────────────────────────────
// input type=number KHÔNG gõ được dấu chấm ngăn hàng nghìn (trình duyệt chặn ký tự không phải số,
// el.value trả về rỗng). Đổi ô cần định dạng sang type=text + inputmode, dùng 3 hàm dưới đây: định
// dạng để HIỆN (formatNumberInput), gỡ định dạng để ĐỌC (parseNumberInput), và gắn hành vi tự định
// dạng lúc gõ cho 1 input thật (attachNumberInput). Quy ước: dấu CHẤM ngăn hàng nghìn, dấu PHẨY cho
// phần lẻ — khớp formatVND()/toLocaleString('vi-VN') ở trên, KHÔNG áp dụng cho ô là chuỗi-số/định
// danh (SĐT, PIN, mã vạch, SKU, OTP, năm, số bàn...) — những ô đó giữ nguyên type=number hoặc text thường.

// Gỡ định dạng để ĐỌC giá trị thật từ ô đã định dạng. '' (hoặc chỉ khoảng trắng) -> null (CHƯA NHẬP,
// khác số 0). Chuỗi không phải số -> NaN (để nơi gọi tự quyết định báo lỗi, không âm thầm hoá thành 0).
// Chấp nhận cả input đã có dấu chấm/phẩy (do formatNumberInput/liveFormatNumberInput tạo ra, hoặc do
// dán từ nơi khác) lẫn chuỗi số trơn/số JS thường (tương thích ngược với Number(el.value) cũ).
export function parseNumberInput(text) {
  if (typeof text === 'number') return text;
  const s = String(text ?? '').trim();
  if (s === '') return null;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  return Number(normalized);
}

// Định dạng số để HIỂN THỊ trong ô nhập lúc dựng HTML ban đầu (value="..."). Nhận số JS hoặc chuỗi
// (kể cả chuỗi đã có định dạng sẵn — idempotent). decimals: số chữ số lẻ TỐI ĐA, không đệm thêm số 0
// thừa (0.3 -> "0,3", không phải "0,300"). Giá trị rỗng/không hợp lệ -> '' (không hiện "NaN"/"null").
export function formatNumberInput(value, { decimals = 0 } = {}) {
  const n = parseNumberInput(value);
  if (n === null || !Number.isFinite(n)) return '';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: decimals });
}

// Lõi thuần định dạng lúc ĐANG GÕ, tách riêng khỏi DOM để test được không cần trình duyệt thật.
// dirty = el.value NGAY SAU keystroke (trình duyệt đã tự chèn ký tự vào chỗ con trỏ cũ rồi);
// cursor = el.selectionStart cùng thời điểm đó. Trả về {value, cursor} đã định dạng lại + vị trí
// con trỏ mới — GIỮ NGUYÊN cảm giác gõ (không nhảy về cuối như set value ngây thơ).
//
// Dấu CHẤM không bao giờ có nghĩa (luôn là dấu TA tự chèn để nhóm hàng nghìn, hoặc gõ nhầm) nên LUÔN
// bị bỏ qua vô điều kiện. Dấu PHẨY ĐẦU TIÊN gặp được là mốc phần lẻ (chỉ khi decimals>0); mọi dấu phẩy
// sau đó bị bỏ qua (ca "gõ nhiều dấu phẩy liên tiếp"). Không thể dùng dấu chấm làm mốc phần lẻ vì cùng
// ký tự với dấu TA tự chèn — không có cách nào phân biệt an toàn hai trường hợp đó.
export function liveFormatNumberInput(dirty, cursor, { decimals = 0 } = {}) {
  const s = String(dirty ?? '');
  const c = Math.max(0, Math.min(cursor ?? s.length, s.length));

  let sigBeforeCursor = 0;
  let intRaw = '';
  let decRaw = '';
  let seenComma = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    let significant = false;
    if (ch >= '0' && ch <= '9') {
      if (!seenComma) { intRaw += ch; significant = true; }
      // decimals=0 hoặc phần lẻ đã đủ chữ số: số dư sau dấu phẩy bị BỎ hẳn (không nối ngược vào phần
      // nguyên) — dán '12,5' vào ô số nguyên phải ra '12', KHÔNG được âm thầm ra '125' (sai 10 lần).
      else if (decimals > 0 && decRaw.length < decimals) { decRaw += ch; significant = true; }
    } else if (ch === ',' && !seenComma) {
      seenComma = true;
      significant = decimals > 0; // decimals=0: dấu phẩy cũng vô nghĩa, không có phần lẻ để tách
    }
    if (significant && i < c) sigBeforeCursor++;
  }
  const showDecimal = seenComma && decimals > 0;

  if (intRaw === '' && !showDecimal) return { value: '', cursor: 0 };

  intRaw = intRaw.replace(/^0+(?=\d)/, '');
  if (intRaw === '') intRaw = '0';
  const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const out = showDecimal ? `${grouped},${decRaw}` : grouped;

  let newCursor = 0, seen = 0;
  for (let i = 0; i < out.length; i++) {
    if ((out[i] >= '0' && out[i] <= '9') || out[i] === ',') {
      seen++;
      if (seen === sigBeforeCursor) { newCursor = i + 1; break; }
    }
    newCursor = i + 1;
  }
  if (sigBeforeCursor === 0) newCursor = 0;

  return { value: out, cursor: newCursor };
}

// Gắn hành vi tự định dạng khi gõ cho 1 ô input thật: đổi type=text + inputmode phù hợp (numeric =
// bàn phím số nguyên, decimal = bàn phím có dấu thập phân), định dạng lại mỗi lần gõ và GIỮ NGUYÊN vị
// trí con trỏ. Nơi gọi vẫn phải tự đặt value="${formatNumberInput(...)}" lúc dựng HTML ban đầu (hàm
// này chỉ gắn HÀNH VI lúc gõ, không tự set giá trị đầu) và tự đọc lại bằng parseNumberInput(el.value)
// ở MỌI nơi trước đây dùng Number(el.value)/parseInt/parseFloat/valueAsNumber cho ô này.
export function attachNumberInput(el, { decimals = 0 } = {}) {
  el.type = 'text';
  el.inputMode = decimals > 0 ? 'decimal' : 'numeric';
  el.addEventListener('input', () => {
    const { value, cursor } = liveFormatNumberInput(el.value, el.selectionStart, { decimals });
    el.value = value;
    if (el.setSelectionRange) el.setSelectionRange(cursor, cursor);
  });
}

// Khu vực bàn được LƯU dưới dạng mã không dấu ('trong-nha' | 'ngoai-san') từ migration 029, còn
// bàn tạo mới ở POS Manager lại lưu thẳng tên có dấu ('Trong nhà'). Hàm này đổi mã sang tên đọc
// được, tên có dấu thì giữ nguyên — cùng cách quy đổi mà bill-print.js / in-qr / sell.js đang dùng.
const ZONE_LABELS = { 'trong-nha': 'Trong nhà', 'ngoai-san': 'Ngoài sân' };
export function zoneLabel(zone) {
  const z = String(zone ?? '').trim();
  return ZONE_LABELS[z] || z;
}

// Tên hiển thị của bàn (migration 091, 03/09/2026). Chủ quán đặt được tên chữ cho bàn ("Bàn VIP",
// "Phòng lạnh 1"); bàn chưa đặt tên vẫn hiện "Bàn <số>" y như trước. Nhận cả object bàn
// (`{name, table_no}` từ /api/mgr/tables) lẫn dòng đơn hàng/phiếu bếp (`{table_name, table_no}`),
// vì cùng một nhãn phải hiện ở 6 màn mà mỗi API lại đặt tên trường khác nhau.
//
// PHẢI xét `table_name` TRƯỚC và, nếu object có trường đó, KHÔNG được lùi về `name`: dòng phiếu bếp
// (`SELECT k.*` của pos_kitchen_items) có sẵn cột `name` là TÊN MÓN. Bản đầu viết
// `t.name ?? t.table_name` nên màn Bếp hiện "Cơm Ba chỉ rang cải cay" ở chỗ đáng lẽ là tên bàn
// (bug-614, bắt được khi bấm tay chứ test đọc mã nguồn không thấy).
// Bản sao phía máy chủ: src/pos/table-name.js — sửa một bên thì sửa cả hai.
export function tableName(t) {
  if (!t) return '';
  const raw = Object.hasOwn(t, 'table_name') ? t.table_name : t.name;
  const name = String(raw ?? '').trim();
  return name || `Bàn ${t.table_no}`;
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
function baseDialog({ title, bodyHTML, okText = 'Lưu', cancelText = 'Huỷ', danger = false, onOk, onMount }) {
  return new Promise((resolve) => {
    const { overlay, close } = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <div class="dlg-body">${bodyHTML}</div>
      <div class="dlg-actions">
        ${cancelText ? `<button type="button" class="btn btn-ghost" data-dlg="cancel">${escapeHtml(cancelText)}</button>` : ''}
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dlg="ok">${escapeHtml(okText)}</button>
      </div>`);
    if (onMount) onMount(overlay);

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
// format=true (chỉ có tác dụng khi type:'number'): ô hiện dấu chấm hàng nghìn/phẩy lẻ như mọi ô số
// khác trong POS Manager (TASK-dinh-dang-so.md) — nơi gọi phải tự đọc kết quả trả về bằng
// parseNumberInput(), KHÔNG dùng Number() nữa (chuỗi trả về giờ có thể chứa dấu chấm/phẩy).
// Bỏ trống format (mặc định false) giữ NGUYÊN ô number gốc của trình duyệt — dùng cho ô là
// định danh (vd đổi SỐ BÀN ở tables.js) chứ không phải số lượng/tiền.
export function promptDialog(label, {
  title = 'Nhập thông tin', value = '', placeholder = '', okText = 'Lưu',
  type = 'text', multiline = false, required = false, hint = '', format = false, decimals = 0,
} = {}) {
  const field = multiline
    ? `<textarea class="dlg-input" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : type === 'number' && format
    ? `<input class="dlg-input" type="text" inputmode="${decimals > 0 ? 'decimal' : 'numeric'}" value="${escapeHtml(formatNumberInput(value, { decimals }))}" placeholder="${escapeHtml(placeholder)}" />`
    : `<input class="dlg-input" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`;
  return baseDialog({
    title, okText,
    bodyHTML: `<label class="dlg-label">${escapeHtml(label)}</label>${field}
               ${hint ? `<p class="dlg-hint">${escapeHtml(hint)}</p>` : ''}
               <p class="dlg-error hidden"></p>`,
    onMount: type === 'number' && format ? (overlay) => attachNumberInput(overlay.querySelector('.dlg-input'), { decimals }) : undefined,
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
  }).then((v) => (v === undefined ? promptDialog(label, { title, value, placeholder, okText, type, multiline, required, hint, format, decimals }) : v));
}

// Hộp thoại chỉ để BÁO (thay alert). Chỉ có 1 nút.
export function alertDialog(message, { title = 'Thông báo', okText = 'Đã hiểu' } = {}) {
  return baseDialog({ title, bodyHTML: `<p class="dlg-msg">${escapeHtml(message)}</p>`, okText, cancelText: '', onOk: () => true });
}

// Ảnh món lưu trong DB dạng tương đối theo GỐC TRANG LANDING ('assets/img/dishes/x.png') vì trang
// deploy lên GitHub Pages theo đường dẫn con, dùng '/assets/...' sẽ trỏ sai gốc tên miền. POS
// Manager nằm trong thư mục con pos-manager/ nên phải lùi 1 cấp. Đường dẫn http(s) hoặc đã có '../'
// thì giữ nguyên. Xem scripts/sync-menu-images.js.
// Task 2 (09/08/2026) — chuyển từ sell.js sang đây vì màn Sản phẩm cũng cần xem trước ảnh; sell.js
// vẫn xuất lại tên này để không phải sửa nơi khác.
export function resolveImg(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('../') || s.startsWith('/')) return s;
  return `../${s}`;
}

// ─── Task 3 (09/08/2026): thanh tab dùng chung của nhóm HÀNG HOÁ ──────────────────────────────
// Chủ quán: "thanh menu đó để chuyển nhanh giữa các tab có cùng chức năng là thuộc Hàng hoá giống
// phần kho mà bạn đã làm đúng — khi ấn sang tab khác thì KHÔNG bị mất". Trước đây chỉ màn Sản phẩm
// có thanh này (viết thẳng trong san-pham.js) nên bấm sang Nhóm tuỳ chọn / Danh mục là thanh biến
// mất, không có đường quay lại. Đặt ở đây để 3 màn dùng CÙNG MỘT nguồn — thêm/sửa tab chỉ một chỗ,
// không sợ 3 bản chép lệch nhau như thanh .kho-nav.
export const GOODS_TABS = [
  ['san-pham',       'Sản phẩm'],
  ['nhom-tuy-chon',  'Bán kèm'],
  ['in-tem-ma-vach', 'In tem mã vạch'],
  ['danh-muc',       'Danh mục'],
  ['nvl',            'Nguyên vật liệu'],
  ['cong-thuc',      'Công thức'],
];

export function goodsTabsHtml(activeRoute) {
  return `<div class="tab-row page-tabs goods-nav">
    ${GOODS_TABS.map(([route, label]) => (route === activeRoute
    ? `<button class="tab active" type="button" aria-current="page">${escapeHtml(label)}</button>`
    : `<a class="tab" href="#/${route}">${escapeHtml(label)}</a>`)).join('')}
  </div>`;
}

// ─── Task 3 (09/08/2026): thanh tab dùng chung cho MỌI nhóm màn ───────────────────────────────
// Chủ quán: "phần nguyên liệu, số tiền, khách hàng, báo cáo, quản lý cũng thêm thanh menu giống
// phần hàng hoá / kho — cái nào cùng chức năng thì gom gần nhau, cái nào chỉ có một thì thôi
// (như Nhà cung cấp)". Mỗi mảng dưới đây là MỘT cụm màn cùng việc; màn không nằm trong cụm nào
// (Sổ nợ, Khuyến mãi, Thông báo, Nhà cung cấp…) thì KHÔNG có thanh tab, đúng ý đó.
//
// Nhãn tab lấy từ FEATURES của nav.js để không phải chép tên màn lần thứ hai (thanh .kho-nav cũ
// bị chép ra 4 bản, sửa tên một chỗ là lệch ngay).
export const PAGE_TAB_GROUPS = [
  // Task 1 (09/08/2026 đợt 3) — thứ tự tab PHẢI trùng thứ tự ở cột trái: cột trái xếp
  // "Nhập / Xuất NVL" rồi mới tới "Tồn NVL", nên thanh tab cũng vậy (trước đây ngược nhau,
  // chủ quán nhìn hai chỗ thấy hai thứ tự khác nhau).
  ['nhap-nvl', 'ton-nvl'],                     // Kho nguyên liệu
  // Việc 2 (13/08/2026) — trước đây 'so-no' CỐ Ý đứng ngoài cụm này (xem chú thích cũ ở trên: "màn
  // không nằm trong cụm nào (Sổ nợ...) thì KHÔNG có thanh tab, đúng ý đó"). Ảnh mẫu tài chính Sổ
  // Bán Hàng (tai chinh (38).png) lại hiện "Sổ nợ" là 1 trong 4 tab CÙNG hàng với Thu chi/Sổ quỹ/
  // Nguồn tiền — ghi đè quyết định cũ, gộp lại đủ 4 màn cho khớp ảnh mẫu, thứ tự trùng ảnh.
  ['thu-chi', 'so-no', 'so-quy', 'nguon-tien'], // Sổ tiền (Tài chính)
  // Đợt 7 (18/08/2026) — ảnh mẫu "Đối tác > Khách hàng"/"Nhóm khách hàng" của Sổ Bán Hàng v2
  // KHÔNG còn thanh tab ngang này nữa (chỉ còn sidebar). Bỏ 'khach-hang'/'nhom-khach' khỏi cụm,
  // để 'tich-diem' đứng một mình — pageTabsHtml tự ẩn khi cụm còn dưới 2 màn (xem hàm bên dưới).
  ['tich-diem'],                                // Hồ sơ khách

  // Đối chiếu giá vốn NVL (2026-09-18) — thêm vào cụm sẵn có, KHÔNG tạo cụm mới (báo cáo liên
  // quan trực tiếp tới giá vốn/lợi nhuận, hợp lý đứng cạnh 'gia-von').
  ['lai-lo', 'bao-cao-ban-hang', 'gia-von', 'doi-chieu-von'],   // Doanh thu & lợi nhuận (Lãi lỗ đứng đầu theo ảnh SoBanHang v2)
  // Task 1 — chủ quán xin gộp thêm "Báo cáo kho" vào cụm này (trước đây nó đứng một mình
  // nên không có thanh tab, phải quay ra cột trái mới mở được).
  // Việc "Thuế" (19/08/2026) — 'uoc-tinh-thue' CHUYỂN sang cụm 'Thuế' mới bên dưới (nav.js đã đổi
  // group của nó), bỏ khỏi cụm này để khỏi mâu thuẫn với sidebar (còn lại 2 mục vẫn đủ hiện thanh tab).
  ['bao-cao-thu-chi', 'bao-cao-kho'],          // Dòng tiền & kho
  ['nhan-vien', 'vai-tro', 'quan-ly-ca'],      // Nhân sự
  // Việc "Thuế" (19/08/2026) — 3 mục sidebar của nhóm Thuế, đúng thứ tự ảnh mẫu. 'thiet-lap-so-ke-toan'
  // KHÔNG vào đây — nó là trang con (breadcrumb riêng "Thuế › Thiết lập sổ kế toán"), không phải tab ngang.
  ['nhat-ky-ke-khai', 'ke-khai-thue', 'uoc-tinh-thue'], // Thuế
];

/**
 * Thanh tab của cụm chứa `activeRoute`. Trả chuỗi RỖNG nếu màn đó không thuộc cụm nào, hoặc sau
 * khi lọc theo quyền chỉ còn đúng một màn — một cái tab lẻ loi chỉ tổ rối mắt.
 */
export function pageTabsHtml(activeRoute, staff) {
  const group = PAGE_TAB_GROUPS.find((g) => g.includes(activeRoute));
  if (!group) return '';
  const allowed = staff ? new Set(allowedFeatures(staff).map((f) => f.route)) : null;
  const items = group
    .filter((r) => r === activeRoute || !allowed || allowed.has(r))
    .map((r) => [r, FEATURES.find((f) => f.route === r)?.label || r]);
  if (items.length < 2) return '';
  return `<div class="tab-row page-tabs group-nav">
    ${items.map(([route, label]) => (route === activeRoute
    ? `<button class="tab active" type="button" aria-current="page">${escapeHtml(label)}</button>`
    : `<a class="tab" href="#/${route}">${escapeHtml(label)}</a>`)).join('')}
  </div>`;
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

// Tấm trượt bên phải — dùng cho Tạo bàn / Quản lý khu vực / Tải QR bàn (khác openModal nổi giữa)
export function openDrawer({ title, bodyHTML, footerHTML = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'pm-drawer-overlay';
  overlay.innerHTML = `
    <div class="pm-drawer" role="dialog" aria-modal="true">
      <div class="pm-drawer-head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="pm-drawer-close" aria-label="Đóng">&#215;</button>
      </div>
      <div class="pm-drawer-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="pm-drawer-foot">${footerHTML}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.pm-drawer-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  return { overlay, close };
}
