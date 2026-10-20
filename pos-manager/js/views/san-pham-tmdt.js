// Việc 1 (18/08/2026) — Kênh bán hàng > Sản phẩm TMĐT.
// Cùng lý do với don-hang-tmdt.js: mục khoá trong ảnh mẫu (icon ổ khoá), tính năng trả phí, chỉ
// mở khi quán liên kết gian hàng TMĐT thật.
import { icon } from '../icons.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem Kênh bán hàng.</p>';
    return;
  }
  container.innerHTML = `
    <h2>Sản phẩm TMĐT</h2>
    <div class="stm-locked">
      ${icon('san-pham-tmdt')}
      <h3>Chưa mở tính năng này</h3>
      <p class="hint">Sản phẩm TMĐT hiện là mục khoá trong ảnh mẫu Sổ Bán Hàng — chỉ dùng được sau
        khi quán liên kết ít nhất một gian hàng trên sàn TMĐT (để đồng bộ sản phẩm giữa kho quán và
        gian hàng). Vào <a href="#/san-tmdt">Sàn TMĐT</a> để liên kết trước.</p>
    </div>
  `;
}
