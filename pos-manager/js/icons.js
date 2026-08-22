// GĐ7 — Bộ icon SVG thay toàn bộ emoji, vẽ theo phong cách app Sổ Bán Hàng:
// nét 1.8px, bo tròn đầu nét, khung 24×24, tô bằng currentColor để đổi màu qua CSS.
// Dùng: icon('ban-hang') -> chuỗi HTML <svg>. Tên icon trùng tên route cho dễ nhớ.
//
// GĐ9 (04/08/2026) — 22 icon chính đã được thay bằng BẢN GỐC lấy trên app.sobanhang.com
// (xem icons-sbh.js). Bộ vẽ tay dưới đây chỉ còn dùng cho các icon app không có sẵn.
import { SBH_ICONS } from './icons-sbh.js';

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

// Icon tô đặc (dùng cho tab đang chọn) — không có stroke.
const F = (body) => `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">${body}</svg>`;

export const ICONS = {
  // ── Điều hướng chính ────────────────────────────────────────────────────
  'trang-chu': S('<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>'),
  'quan-ly': S('<path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M4.5 9.5v9A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-9"/><path d="M3.5 9.5a2.6 2.6 0 0 0 4.2 0 2.6 2.6 0 0 0 4.3 0 2.6 2.6 0 0 0 4.3 0 2.6 2.6 0 0 0 4.2 0"/>'),
  'ban-hang': S('<path d="M3 4h2.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>'),
  'ban-nhanh': S('<path d="M13.2 2.5 5 13.5h5.6L9.8 21.5 18.5 10h-5.9z"/>'),
  'don-hang': S('<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 3h6a1 1 0 0 1 1 1v1.5H8V4a1 1 0 0 1 1-1z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>'),
  'them': S('<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
  // Thùng rác — dùng cho mục "Xoá" trong menu 3 chấm (Task 2, 10/08/2026). Trước đây chỉ có
  // 'chinh-sua' nên mục Xoá phải đứng trơ không icon, lệch hẳn với mục bên trên.
  'xoa': S('<path d="M4 6.5h16"/><path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"/><path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5"/><path d="M10.5 10v6M13.5 10v6"/>'),
  // Task 3 (13/08/2026) — 2 mục của nhóm "Quản lý hoá đơn". Tờ giấy có dấu CỘNG = hoá đơn nhà
  // cung cấp gửi VÀO quán; tờ giấy có mấy dòng chữ = hoá đơn quán xuất RA cho khách (đúng cặp
  // icon app.sobanhang.com dùng ở ảnh HD-01 và HD-06).
  'hoa-don-vao': S('<path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M13 3.5V9h5"/><path d="M11.5 12v5M9 14.5h5"/>'),
  'hoa-don-ra': S('<path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M13 3.5V9h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'),
  // Đợt 7 (18/08/2026) — nhóm "Đối tác": bong bóng chat cho màn Hội thoại.
  'hoi-thoai': S('<path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v9A1.5 1.5 0 0 1 20 17.5H9l-4.5 4V17.5A1.5 1.5 0 0 1 3 16V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M8 10h8M8 13h5"/>'),

  // ── Bán hàng & vận hành ─────────────────────────────────────────────────
  'quan-ly-ban': S('<ellipse cx="12" cy="7.5" rx="8" ry="3"/><path d="M4 7.5v1.2c0 1.7 3.6 3 8 3s8-1.3 8-3V7.5"/><path d="M12 11.7V21"/><path d="M8.5 21h7"/>'),
  'bep': S('<path d="M4.5 11h15"/><path d="M5.5 11v6a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-6"/><path d="M9 7.5c0-1 .8-1.6.8-2.6M12 7.5c0-1.2 1-1.8 1-3M15 7.5c0-1 .8-1.6.8-2.6"/>'),
  'nhan-vien': S('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.8a3 3 0 0 1 0 5.4"/><path d="M17 15.2a5.5 5.5 0 0 1 3.5 4.8"/>'),
  'quan-ly-ca': S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>'),

  // ── Tiền ────────────────────────────────────────────────────────────────
  'nguon-tien': S('<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'),
  'thu-chi': S('<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>'),
  'so-quy': S('<path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V8"/>'),
  'so-no': S('<path d="M5 4.5h11.5L20 8v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5V6a1.5 1.5 0 0 1 1-1.5z"/><path d="M15.5 4.5V8H20"/><path d="M8 12.5h7M8 16h4.5"/>'),

  // ── Báo cáo ─────────────────────────────────────────────────────────────
  'bao-cao-ban-hang': S('<path d="M3.5 18.5h17"/><path d="M6.5 18.5V12M11 18.5V6.5M15.5 18.5v-4M20 18.5V9"/>'),
  'lai-lo': S('<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4"/><path d="M14.6 9.2H10.8a1.9 1.9 0 0 0 0 3.8h2.4a1.9 1.9 0 0 1 0 3.8H9.4"/>'),
  'bao-cao-thu-chi': S('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>'),
  'uoc-tinh-thue': S('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7h7"/><path d="M8.7 11h.01M12 11h.01M15.3 11h.01M8.7 14.3h.01M12 14.3h.01M15.3 14.3v3.2M8.7 17.5h.01M12 17.5h.01"/>'),
  // Việc "Thuế" (19/08/2026) — icon dự phòng cho giao diện v1 (v2 dùng bản thật SBH_ICONS, xem icons-sbh.js).
  'nhat-ky-ke-khai': S('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  'ke-khai-thue': S('<path d="M14 3v5a1 1 0 0 0 1 1h5"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9 13l2 2 4-4"/>'),
  'thiet-lap-so-ke-toan': S('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  'gia-von': S('<path d="M3.5 12.5 12 4h5.5a2.5 2.5 0 0 1 2.5 2.5V12l-8.5 8.5z"/><circle cx="16" cy="8" r="1.3"/>'),

  // ── Hàng hoá & kho ──────────────────────────────────────────────────────
  'san-pham': S('<path d="M20.5 8.2v7.6a1.5 1.5 0 0 1-.8 1.3l-6.9 3.7a1.5 1.5 0 0 1-1.6 0l-6.9-3.7a1.5 1.5 0 0 1-.8-1.3V8.2"/><path d="M3.9 7.4 12 3.2l8.1 4.2L12 11.7z"/><path d="M12 11.7V21"/>'),
  'ton-kho': S('<path d="M3.5 9.5 12 4l8.5 5.5V20H3.5z"/><path d="M8.5 20v-6h7v6"/>'),
  // Đợt 6 (17/08/2026) — tách "Nhập / Xuất kho" thành 2 icon riêng (mũi tên xuống = hàng vào kho,
  // mũi tên lên = hàng ra khỏi kho), thay cho icon xe tải cũ dùng chung cho cả 2 chiều.
  'nhap-hang': S('<rect x="4" y="12" width="16" height="8" rx="1.5"/><path d="M12 3v9"/><path d="M8 8.5 12 12.5 16 8.5"/>'),
  'xuat-kho': S('<rect x="4" y="12" width="16" height="8" rx="1.5"/><path d="M12 12V3"/><path d="M8 6.5 12 2.5 16 6.5"/>'),
  'so-kho': S('<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8.5 3.5v17"/><path d="M11.5 8h5M11.5 12h5M11.5 16h3"/>'),
  'kiem-kho': S('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20.5 20.5"/>'),
  'nha-cung-cap': S('<circle cx="8.5" cy="7" r="3"/><path d="M3 19.5a5.6 5.6 0 0 1 8.4-4.8"/><rect x="13.5" y="12.8" width="7.5" height="7.2" rx="1"/><path d="M13.5 16h7.5M17.25 12.8V20"/>'),
  // Việc 1 (18/08/2026) — nhóm "Kênh bán hàng": Sàn TMĐT (biểu tượng địa cầu, khớp icon sidebar
  // ảnh mẫu), Đơn/Sản phẩm TMĐT (túi hàng, thẻ giá — 2 màn khoá), Hoá đơn TMĐT (tờ hoá đơn).
  'san-tmdt': S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.8 2.1 2.8 15.4 0 17-2.8-1.6-2.8-14.9 0-17z"/>'),
  'don-hang-tmdt': S('<path d="M6.5 8.5h11l-1 10.5A2 2 0 0 1 14.5 21h-5a2 2 0 0 1-2-1.9z"/><path d="M9 8.5V6.2a3 3 0 0 1 6 0v2.3"/>'),
  'san-pham-tmdt': S('<path d="M11 3.5h5.5L20.5 7.5v5.5L13 20.5a1.5 1.5 0 0 1-2.1 0L4.5 14a1.5 1.5 0 0 1 0-2.1z"/><circle cx="15.2" cy="8.3" r="1.4"/>'),
  'hoa-don-tmdt': S('<path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M13 3.5V9h5"/><path d="M8.5 12.5h7M8.5 16h7"/>'),
  'nhom-tuy-chon': S('<path d="M3.5 12.5a7 7 0 0 0 14 0z"/><path d="M3.5 12.5h14"/><circle cx="18" cy="6.5" r="3.3"/><path d="M18 5v3M16.5 6.5h3"/>'),
  'in-tem-ma-vach': S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9v6M10 9v6M13 9v6M16.5 9v6M7 9h2.5M7 15h2.5"/><path d="M3.5 8h17"/>'),

  // ── Nguyên liệu ─────────────────────────────────────────────────────────
  'nvl': S('<path d="M9 3.5h6l-.6 4.2 3.4 9.4A2.5 2.5 0 0 1 15.5 20.5h-7a2.5 2.5 0 0 1-2.3-3.4l3.4-9.4z"/><path d="M8.4 13.5h7.2"/>'),
  'nhap-nvl': S('<path d="M5 7.5h14l-1.3 12A2 2 0 0 1 15.7 21H8.3a2 2 0 0 1-2-1.5z"/><path d="M12 3v6.5"/><path d="M9.3 6.2 12 3.4l2.7 2.8"/>'),
  'cong-thuc': S('<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/><circle cx="16.5" cy="16" r="2.4" fill="none"/>'),
  'ton-nvl': S('<path d="M12 20.5c-3.6 0-6.5-2.5-6.5-5.5 0-3.5 3-6 6.5-11 3.5 5 6.5 7.5 6.5 11 0 3-2.9 5.5-6.5 5.5z"/>'),

  // ── Khách & khuyến mãi ──────────────────────────────────────────────────
  'khach-hang': S('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  'nhom-khach': S('<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.4"/><path d="M2.8 19.5a5.8 5.8 0 0 1 11.4 0"/><path d="M15 15.2a4.6 4.6 0 0 1 6.2 4.3"/>'),
  'tich-diem': S('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>'),
  'khuyen-mai': S('<rect x="3" y="8.5" width="18" height="12" rx="2"/><path d="M3 12.5h18"/><path d="M12 8.5v12"/><path d="M12 8.5S10.4 4 7.8 4a2.3 2.3 0 0 0 0 4.5zM12 8.5S13.6 4 16.2 4a2.3 2.3 0 0 1 0 4.5z"/>'),

  // ── Khác ────────────────────────────────────────────────────────────────
  'cai-dat': S('<circle cx="12" cy="12" r="3"/><path d="M19.2 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2A1.6 1.6 0 0 0 4.8 7l-.1-.1A1.9 1.9 0 1 1 7.4 4.2l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
  'thong-bao': S('<path d="M18 9a6 6 0 1 0-12 0c0 5.2-2 6.8-2 6.8h16S18 14.2 18 9z"/><path d="M13.7 19.3a2 2 0 0 1-3.4 0"/>'),
  // GĐ9 đợt 2/3 — Danh mục sản phẩm · Báo cáo kho · Vai trò · Chuyển tiền giữa nguồn tiền
  'danh-muc': S('<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l1.8 2.2H19A1.5 1.5 0 0 1 20.5 9.2v8.3A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M8 12.5h8"/>'),
  'bao-cao-kho': S('<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/><path d="M8 14v3.2M12 15v3.2M16 14v3.2"/>'),
  'vai-tro': S('<path d="M12 3.5 5 6v5.5c0 4 2.9 7.4 7 9 4.1-1.6 7-5 7-9V6z"/><circle cx="12" cy="10.5" r="2.2"/><path d="M8.4 16.5a3.9 3.9 0 0 1 7.2 0"/>'),
  'chuyen-tien': S('<path d="M4 8.5h13"/><path d="M13.8 5.3 17 8.5l-3.2 3.2"/><path d="M20 15.5H7"/><path d="M10.2 12.3 7 15.5l3.2 3.2"/>'),
  'doanh-thu': S('<path d="M3.5 18.5h17"/><path d="M6.5 18.5V12M11 18.5V6.5M15.5 18.5v-4M20 18.5V9"/>'),
  'so-don': S('<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 3h6a1 1 0 0 1 1 1v1.5H8V4a1 1 0 0 1 1-1z"/><path d="M8.5 11h7M8.5 14.5h4"/>'),
  'loi-nhuan': S('<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4"/><path d="M14.6 9.2H10.8a1.9 1.9 0 0 0 0 3.8h2.4a1.9 1.9 0 0 1 0 3.8H9.4"/>'),
  'chinh-sua': S('<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17z"/><path d="M14.5 7.7 16.3 9.5"/>'),
  'dang-xuat': S('<path d="M15 5.5V4.4A1.4 1.4 0 0 0 13.6 3H5.4A1.4 1.4 0 0 0 4 4.4v15.2A1.4 1.4 0 0 0 5.4 21h8.2a1.4 1.4 0 0 0 1.4-1.4v-1.1"/><path d="M9.5 12h11"/><path d="M17.8 8.8 21 12l-3.2 3.2"/>'),
  'tim-kiem': S('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20.5 20.5"/>'),
  'quay-lai': S('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),

  // ── Icon nhỏ dùng trong các màn GĐ1–GĐ6 (thay emoji cũ) ─────────────────
  'dong': S('<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>'),
  'canh-bao': S('<path d="M10.6 4.1 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2A1.6 1.6 0 0 0 21.5 18L13.4 4.1a1.6 1.6 0 0 0-2.8 0z"/><path d="M12 9.5v4M12 17.2h.01"/>'),
  'chuong': S('<path d="M18 9a6 6 0 1 0-12 0c0 5.2-2 6.8-2 6.8h16S18 14.2 18 9z"/><path d="M13.7 19.3a2 2 0 0 1-3.4 0"/>'),
  'tat-tieng': S('<path d="M10.5 6 6.8 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.8l3.7 3z"/><path d="M16 10l5 4M21 10l-5 4"/>'),
  'toan-man-hinh': S('<path d="M8.5 3.5H5A1.5 1.5 0 0 0 3.5 5v3.5M15.5 3.5H19A1.5 1.5 0 0 1 20.5 5v3.5M20.5 15.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5M8.5 20.5H5A1.5 1.5 0 0 1 3.5 19v-3.5"/>'),
  'ok': S('<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>'),
  'thich': S('<path d="M7 20.5V10l4.2-7a2.2 2.2 0 0 1 3 2.9L12.8 9.5h5.4a2.2 2.2 0 0 1 2.1 2.8l-1.8 6.4a2.2 2.2 0 0 1-2.1 1.8z"/><rect x="3" y="10" width="4" height="10.5" rx="1"/>'),
  'tai-xuong': S('<path d="M12 3.5v11.5"/><path d="M7.8 10.8 12 15l4.2-4.2"/><path d="M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>'),
  // Task 2 (09/08/2026) — nút gộp 2 ô ngày ở màn Đơn hàng.
  'lich': S('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3M16 3.5v3"/>'),
  'in': S('<path d="M7 9V4.5h10V9"/><path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5V11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5.5A1.5 1.5 0 0 1 18.5 18H17"/><rect x="7" y="14.5" width="10" height="6" rx="1"/>'),
  'mon-an': S('<path d="M5 3.5v7a2.5 2.5 0 0 0 5 0v-7"/><path d="M7.5 10.5V20.5"/><path d="M16.5 20.5V13c-1.6 0-2.5-1.2-2.5-3.5s.9-6 2.5-6 2.5 3.7 2.5 6-.9 3.5-2.5 3.5"/>'),
  'mang-ve': S('<path d="M4.5 8.5h15l-1.2 11A2 2 0 0 1 16.3 21H7.7a2 2 0 0 1-2-1.5z"/><path d="M8.5 8.5 10 3.5h4l1.5 5"/>'),
  'giao-hang': S('<circle cx="6" cy="17.5" r="2.6"/><circle cx="18" cy="17.5" r="2.6"/><path d="M8.6 17.5h6.8"/><path d="M6 17.5 9.5 8h4.2l2.6 7"/><path d="M12.5 5.5h3"/>'),
  'ma-qr': S('<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v3M17.5 20.5h3"/>'),
  'phieu': S('<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  'but': S('<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17z"/><path d="M14.5 7.7 16.3 9.5"/>'),
  'nghi': S('<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/>'),
  // 10/08/2026 — 2 nút mới trong hộp thoại "Chi tiết đơn hàng" (theo ảnh Sổ Bán Hàng).
  'sao-chep': S('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>'),
  'tra-hang': S('<path d="M9.5 6.5H16a4.5 4.5 0 0 1 0 9H6"/><path d="M9 3.5 5.5 6.5 9 9.5"/><path d="M6 15.5v5"/>'),
};

// Màu icon trong lưới tính năng — bám theo bảng màu của Sổ Bán Hàng (cam / hồng / lá / dương / tím).
export const ICON_COLORS = {
  'ban-hang': '#CA6A11', 'ban-nhanh': '#E8A33D', 'quan-ly-ban': '#0EA5A5', 'don-hang': '#D96285',
  'bep': '#E2582C', 'nhan-vien': '#6C5CE7', 'quan-ly-ca': '#0F9D58',
  'nguon-tien': '#0F9D58', 'thu-chi': '#CA6A11', 'so-quy': '#169939', 'so-no': '#D96285',
  'bao-cao-ban-hang': '#0F9D58', 'lai-lo': '#0F9D58', 'bao-cao-thu-chi': '#169939',
  'uoc-tinh-thue': '#6C5CE7', 'gia-von': '#CA6A11',
  'nhat-ky-ke-khai': '#6C5CE7', 'ke-khai-thue': '#6C5CE7', 'thiet-lap-so-ke-toan': '#6C5CE7',
  'san-pham': '#E8A33D', 'ton-kho': '#0EA5A5', 'nhap-hang': '#169939', 'xuat-kho': '#D9534F',
  'so-kho': '#0F9D58',
  'kiem-kho': '#6C5CE7', 'nha-cung-cap': '#D96285', 'nhom-tuy-chon': '#CA6A11', 'in-tem-ma-vach': '#5F6B7A',
  'nvl': '#E2582C', 'nhap-nvl': '#CA6A11', 'cong-thuc': '#169939', 'ton-nvl': '#0F9D58',
  'khach-hang': '#169939', 'nhom-khach': '#6C5CE7', 'tich-diem': '#E8A33D', 'khuyen-mai': '#D96285',
  'cai-dat': '#5F6B7A',
  // GĐ8-K + GĐ9 đợt 2/3
  'thong-bao': '#E2582C', 'danh-muc': '#E8A33D', 'bao-cao-kho': '#0EA5A5', 'vai-tro': '#6C5CE7',
  // Việc 1 (18/08/2026) — Kênh bán hàng
  'san-tmdt': '#0EA5A5', 'don-hang-tmdt': '#D96285', 'san-pham-tmdt': '#CA6A11', 'hoa-don-tmdt': '#6C5CE7',
};

// Ưu tiên icon gốc của Sổ Bán Hàng; chưa có thì mới dùng bản vẽ tay.
export function icon(name) {
  return SBH_ICONS[name] || ICONS[name] || ICONS['them'];
}

export function iconColor(name) {
  return ICON_COLORS[name] || 'var(--primary)';
}
