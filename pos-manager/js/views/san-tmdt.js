// Việc 1 (18/08/2026) — Kênh bán hàng > Sàn TMĐT (ảnh mẫu Website v2\Kênh bán hàng\*, ảnh 1).
//
// GIỚI HẠN CHỦ Ý (đã hỏi & được chủ quán xác nhận trước khi làm — quán bán qua Zalo/Facebook/web
// tự làm, CHƯA bán qua sàn TMĐT nào): đây là màn GIAO DIỆN, KHÔNG nối API thật Shopee/Lazada/
// TikTok Shop Open Platform (cần đăng ký seller + API key riêng cho từng sàn, quán chưa có). Bấm
// "Liên kết gian hàng" báo THẬT THÀ "chưa cấu hình" thay vì giả vờ kết nối thành công.
import { alertDialog } from '../ui.js';
import { icon } from '../icons.js';

const CHANNELS = [
  { key: 'shopee', label: 'Liên kết gian hàng Shopee', bg: '#EE4D2D' },
  { key: 'lazada', label: 'Liên kết gian hàng Lazada', bg: '#1A0DAB' },
  { key: 'tiktok', label: 'Liên kết gian hàng TikTok Shop', bg: '#111111' },
];

const BENEFITS = [
  'Đồng bộ sản phẩm 1 cách thông minh và nhanh chóng',
  'Theo dõi việc bán hàng đa kênh trên một ứng dụng',
  'Quản lý tồn kho đa kênh theo thời gian thực',
  'Báo cáo tổng quan về tình hình kinh doanh của từng shop trên các sàn TMĐT',
  'Xem đánh giá khách hàng trên các sàn',
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem Kênh bán hàng.</p>';
    return;
  }

  container.innerHTML = `
    <h2>Sàn TMĐT</h2>
    <div class="stm-card">
      <h3 class="stm-title">Liên kết sàn Thương Mại Điện Tử</h3>
      <ul class="stm-benefits">
        ${BENEFITS.map((b) => `<li>${icon('ok')} <span>${b}</span></li>`).join('')}
      </ul>
      <div class="stm-channels">
        ${CHANNELS.map((c) => `
          <button type="button" class="stm-channel-btn" data-ch="${c.key}" style="background:${c.bg}">
            ${icon('san-tmdt')} ${c.label}
          </button>`).join('')}
      </div>
      <p class="hint stm-note">Quán chưa kết nối gian hàng nào trên sàn TMĐT nào. Bấm một nút phía
        trên để bắt đầu liên kết — cần tài khoản người bán trên sàn đó.</p>
    </div>
  `;

  container.querySelectorAll('[data-ch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = CHANNELS.find((x) => x.key === btn.dataset.ch);
      alertDialog(
        `Chưa cấu hình liên kết với ${c.label.replace('Liên kết gian hàng ', '')}. Tính năng này cần ` +
        `đăng ký tài khoản người bán + khoá kết nối (API) riêng của sàn — liên hệ đội kỹ thuật để bật khi quán bắt đầu bán qua sàn này.`,
        { title: 'Chưa cấu hình' }
      );
    });
  });
}
