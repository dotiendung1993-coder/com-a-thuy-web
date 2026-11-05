// GĐ8 mục L — Cỡ chữ / hướng màn hình, sao chép 2 mục cùng tên trong Cài đặt của Sổ Bán Hàng.
//
// Hai tầng, giống cách GĐ7 làm với thanh dưới:
//   1. Cài đặt của QUÁN (pos_settings.display) — chủ quán đặt, áp cho mọi máy chưa chỉnh riêng.
//   2. Đè riêng của TỪNG MÁY (localStorage) — máy tính tiền để bàn khoá ngang, điện thoại của
//      chủ quán để tự động; hai cái không nên ép giống nhau.
import { api } from './api.js';

const KEY = 'posmgr.display.v1';
export const FONT_SCALES = { nho: 0.9, vua: 1, lon: 1.15, 'rat-lon': 1.3 };
export const FONT_LABEL = { nho: 'Nhỏ', vua: 'Vừa', lon: 'Lớn', 'rat-lon': 'Rất lớn' };
export const ORIENTATION_LABEL = { auto: 'Tự động', doc: 'Khoá dọc', ngang: 'Khoá ngang' };

const FALLBACK = { font_scale: 'vua', orientation: 'auto', big_touch: false };

export function readLocalOverride() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

export function saveLocalOverride(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...(readLocalOverride() || {}), ...patch }));
  } catch { /* chế độ riêng tư: bỏ qua */ }
}

export function clearLocalOverride() {
  try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}

/** Áp ngay vào trang: cỡ chữ + nút to + khoá hướng màn hình. */
export function applyDisplay(config) {
  const c = { ...FALLBACK, ...(config || {}) };
  const scale = FONT_SCALES[c.font_scale] ?? 1;
  document.documentElement.style.setProperty('--font-scale', String(scale));
  document.body.classList.toggle('big-touch', !!c.big_touch);

  // Khoá hướng chỉ chạy được trên trình duyệt di động khi app đã ở chế độ toàn màn hình (PWA).
  // Không hỗ trợ thì im lặng bỏ qua — không được để app vỡ vì một tính năng tiện nghi.
  const lock = screen.orientation && screen.orientation.lock;
  if (typeof lock === 'function') {
    if (c.orientation === 'doc') screen.orientation.lock('portrait').catch(() => {});
    else if (c.orientation === 'ngang') screen.orientation.lock('landscape').catch(() => {});
    else if (screen.orientation.unlock) { try { screen.orientation.unlock(); } catch { /* bỏ qua */ } }
  }
  return c;
}

/** Lấy cài đặt của quán rồi phủ đè cài đặt riêng của máy, sau đó áp vào trang. */
export async function loadAndApplyDisplay() {
  let shopConfig = FALLBACK;
  try {
    const res = await api.get('/api/mgr/settings/display-config');
    shopConfig = res.display || FALLBACK;
  } catch { /* chưa đăng nhập / mất mạng: dùng mặc định, app vẫn chạy */ }
  return applyDisplay({ ...shopConfig, ...(readLocalOverride() || {}) });
}
