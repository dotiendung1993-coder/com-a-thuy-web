// Việc 1 (18/08/2026) — Kênh bán hàng > Đơn hàng TMĐT.
// Trong ảnh mẫu, mục này có khoá NGAY TRONG sidebar gốc (icon ổ khoá) — tính năng trả phí của
// Sổ Bán Hàng, chỉ mở khi có gian hàng TMĐT đã liên kết và nâng gói. Quán chưa liên kết sàn nào
// (xem #/san-tmdt) nên màn này CHỈ giải thích, không có bảng dữ liệu giả.
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem Kênh bán hàng.</p>';
    return;
  }
  container.innerHTML = `
    <h2>Đơn hàng TMĐT</h2>
    <div class="stm-locked">
      ${icon('don-hang-tmdt')}
      <h3>Chưa mở tính năng này</h3>
      <p class="hint">Đơn hàng TMĐT hiện là mục khoá trong ảnh mẫu Sổ Bán Hàng — chỉ dùng được sau
        khi quán liên kết ít nhất một gian hàng trên sàn TMĐT. Vào <a href="#/san-tmdt">Sàn TMĐT</a>
        để liên kết trước.</p>
    </div>
  `;
}
