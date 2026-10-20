// Toán ngày thuần chuỗi 'YYYY-MM-DD' — dùng chung cho mọi màn có bảng lịch chọn khoảng ngày
// (Đơn hàng, Quản lý bếp, …). Tách ra tệp riêng từ 12/08/2026 vì trước đó nằm trong
// views/orders.js nên màn Bếp muốn có bảng lịch phải chép lại toàn bộ.
//
// KHÔNG dùng `new Date()` giờ máy rồi toISOString(): hàm đó trả ngày UTC nên từ 0h đến 7h sáng
// giờ VN sẽ lùi về hôm trước (bug-062). Mọi phép cộng/trừ dưới đây chạy trên mốc UTC của đúng
// ngày dương lịch đã cho, nên không phụ thuộc múi giờ của máy nhân viên.
import { todayVN } from './ui.js';

export const MONTH_NAMES = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Bộ chọn nhanh khoảng thời gian — đúng các lối tắt bảng lịch của Sổ Bán Hàng (ảnh 14).
// KHÔNG thêm/xoá phần tử — orders.js/kitchen.js dựa vào ĐÚNG 7 lối tắt này (test posmgr-t92
// kiểm QUICK_RANGES.length === 7). Tab "Mốc" của màn Lãi lỗ cần bộ lối tắt khác (8 mục, có
// "7 ngày qua"/"90 ngày qua" mà màn Đơn hàng/Bếp không có) — xem MOC_RANGES bên dưới, tách hẳn
// mảng riêng thay vì sửa mảng này.
export const QUICK_RANGES = [
  ['hom-nay', 'Hôm nay'],
  ['hom-qua', 'Hôm qua'],
  ['tuan-nay', 'Tuần này'],
  ['tuan-truoc', 'Tuần trước'],
  ['thang-nay', 'Tháng này'],
  ['thang-truoc', 'Tháng trước'],
  ['30-ngay', '30 ngày gần nhất'],
];

// Đợt 7 (18/08/2026) — tab "Mốc" của bảng lịch 5-tab (Lãi lỗ). Cùng hệ khoá với rangeDates() bên
// dưới ('tuan-nay'/'thang-nay' TÁI DÙNG lại đúng phép tính "đầu tuần/tháng đến nay" đã có, chỉ đổi
// NHÃN hiển thị cho khớp ảnh mẫu Website v2\Báo cáo\Lãi lỗ) — không tính lại, không trùng logic.
export const MOC_RANGES = [
  ['hom-nay', 'Hôm nay'],
  ['hom-qua', 'Hôm qua'],
  ['7-ngay', '7 ngày qua'],
  ['30-ngay', '30 ngày gần nhất'],
  ['90-ngay', '90 ngày qua'],
  ['thang-truoc', 'Tháng trước'],
  ['tuan-nay', 'Đầu tuần đến nay'],
  ['thang-nay', 'Đầu tháng đến nay'],
];

function pad2(n) { return String(n).padStart(2, '0'); }
export function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
export function parseYMD(s) { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; }
function utcOf(s) { const { y, m, d } = parseYMD(s); return new Date(Date.UTC(y, m - 1, d)); }

export function addDays(s, n) {
  const dt = utcOf(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
/** 0 = Thứ Hai … 6 = Chủ Nhật (tuần VN bắt đầu từ Thứ Hai). */
export function weekdayMon0(s) { return (utcOf(s).getUTCDay() + 6) % 7; }
export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Trả [từ, đến] dạng YYYY-MM-DD theo GIỜ VN. `key` = 'nam:2026' để lấy trọn một năm. */
export function rangeDates(key, today = todayVN()) {
  const { y, m } = parseYMD(today);
  if (key === 'hom-nay') return [today, today];
  if (key === 'hom-qua') { const yd = addDays(today, -1); return [yd, yd]; }
  if (key === 'tuan-nay') return [addDays(today, -weekdayMon0(today)), today];
  if (key === 'tuan-truoc') {
    const start = addDays(today, -weekdayMon0(today) - 7);
    return [start, addDays(start, 6)];
  }
  // "30 ngày gần nhất" tính CẢ hôm nay → lùi 29 ngày, không phải 30 (lùi 30 là thành 31 ngày).
  if (key === '30-ngay') return [addDays(today, -29), today];
  // Đợt 7 — 2 lối tắt riêng của tab "Mốc" màn Lãi lỗ, cùng quy tắc tính cả hôm nay như "30 ngày".
  if (key === '7-ngay') return [addDays(today, -6), today];
  if (key === '90-ngay') return [addDays(today, -89), today];
  if (key === 'thang-nay') return [ymd(y, m, 1), today];
  if (key === 'thang-truoc') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return [ymd(py, pm, 1), ymd(py, pm, daysInMonth(py, pm))];
  }
  // "Năm": chủ quán muốn chọn nhanh trọn một năm — từ 1/1 tới hết 31/12 của năm đó.
  if (String(key).startsWith('nam:')) {
    const yr = parseInt(String(key).slice(4), 10);
    if (Number.isInteger(yr)) return [ymd(yr, 1, 1), ymd(yr, 12, 31)];
  }
  return ['', ''];
}

/** Lưới 6 hàng × 7 cột của một tháng; ô ngoài tháng = null. Tách riêng để test chạy được. */
export function monthMatrix(year, month) {
  const first = weekdayMon0(ymd(year, month, 1));
  const total = daysInMonth(year, month);
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(ymd(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

// Đợt 7 — tab "Tuần" của bảng lịch Lãi lỗ: chia tháng thành các khối 7 ngày LIÊN TỤC bắt đầu từ
// ngày 1 (KHÔNG phải tuần lịch Thứ Hai→Chủ Nhật) — khớp đúng ảnh mẫu (Tuần 5 của tháng 6/2026 là
// 29/06 → 05/07, vắt 2 ngày cuối tháng 6 + 5 ngày đầu tháng 7). Tháng 30 ngày ra 5 khối, tháng 28
// ngày ra đúng 4 khối không dư.
export function weeksOfMonth(year, month) {
  const total = daysInMonth(year, month);
  const weeks = [];
  let day = 1;
  let n = 1;
  while (day <= total) {
    const from = ymd(year, month, day);
    const to = addDays(from, 6);
    weeks.push({ n, from, to });
    day += 7;
    n += 1;
  }
  return weeks;
}

/** '2026-08-09' → '09/08/2026' (rỗng thì trả ''). */
export function dmy(s) {
  if (!s) return '';
  const { y, m, d } = parseYMD(s);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}
