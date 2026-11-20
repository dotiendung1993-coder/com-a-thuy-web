// Task 4 (13/08/2026) — Panel "Yêu cầu" (chuông) dùng CHUNG cho màn Bán hàng và Quản lý bàn.
//
// Ảnh mẫu app.sobanhang.com_mission-control (8).png: bấm chuông mở ra 1 tấm trượt bên PHẢI
// "Thông báo mới" có 2 tab lớn "Hỗ trợ" / "Chờ chế biến"; trong "Chờ chế biến" có 3 tab con
// (Đang xử lý / Đang chế biến / Đã xong), 2 kiểu xem (Theo bàn / Theo món), khoảng ngày, ô tìm.
//
// Quán ĐÃ CÓ toàn bộ dữ liệu + logic này ở màn "Quản lý bếp" (js/views/kitchen.js) — cùng 3
// trạng thái pending/cooking/done, cùng kiểu gom theo bàn/theo món, cùng khoảng ngày + tìm kiếm,
// đã chạy thật và có test. Panel này KHÔNG viết lại — chỉ dựng khung "tấm trượt" (tiêu đề + nút
// đóng + tab Hỗ trợ/Chờ chế biến) rồi MOUNT thẳng kitchen.render() vào bên trong tab "Chờ chế
// biến", đúng yêu cầu "dùng chung 1 component, đừng viết trùng lặp code".
//
// Tab "Hỗ trợ": quán CHƯA CÓ nguồn dữ liệu nào cho "yêu cầu hỗ trợ" kiểu Sổ Bán Hàng (không có
// bảng/API lưu lịch sử khách bấm gọi nhân viên) — nút "Gọi PV" hiện có (kitchen.js rowActions)
// chỉ bắn thẳng 1 tin Telegram, không lưu lại để liệt kê. Thà hiện thật "chưa có dữ liệu" còn
// hơn bịa danh sách rỗng giả vờ là tính năng đầy đủ.
import * as kitchen from './views/kitchen.js';
import { icon } from './icons.js';

let panelEl = null;

export function openYeuCauPanel() {
  if (panelEl) return; // đã mở rồi thì thôi, tránh mở chồng 2 lớp
  const overlay = document.createElement('div');
  overlay.className = 'yc-overlay';
  overlay.innerHTML = `
    <div class="yc-drawer" role="dialog" aria-label="Yêu cầu">
      <div class="yc-head">
        <h3>Thông báo mới</h3>
        <button type="button" class="yc-close" aria-label="Đóng">${icon('dong')}</button>
      </div>
      <div class="tab-row yc-tabs" role="tablist">
        <button type="button" class="tab active" data-yc-tab="ho-tro" role="tab">Hỗ trợ</button>
        <button type="button" class="tab" data-yc-tab="cho-che-bien" role="tab">Chờ chế biến</button>
      </div>
      <div class="yc-pane yc-pane-hotro">
        <div class="hd-empty">
          <p>Chưa có yêu cầu hỗ trợ nào được ghi nhận.<br>
            Khách/bàn cần gọi nhân viên xin dùng nút "Gọi PV" trong từng món ở tab
            <b>Chờ chế biến</b> (đã bắn tin Telegram ngay cho nhóm phục vụ).</p>
        </div>
      </div>
      <div class="yc-pane yc-pane-kds hidden">
        <div class="yc-kds-mount"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  panelEl = overlay;

  const drawer = overlay.querySelector('.yc-drawer');
  const kdsMount = overlay.querySelector('.yc-kds-mount');
  const paneHotro = overlay.querySelector('.yc-pane-hotro');
  const paneKds = overlay.querySelector('.yc-pane-kds');
  let kdsMounted = false;

  function close() {
    if (kdsMounted) kitchen.destroy();
    overlay.remove();
    panelEl = null;
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.yc-close').addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key !== 'Escape') return;
    document.removeEventListener('keydown', onEsc);
    if (panelEl === overlay) close();
  });

  overlay.querySelectorAll('[data-yc-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('[data-yc-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      const showKds = btn.dataset.ycTab === 'cho-che-bien';
      paneHotro.classList.toggle('hidden', showKds);
      paneKds.classList.toggle('hidden', !showKds);
      if (showKds && !kdsMounted) {
        kdsMounted = true;
        kitchen.render(kdsMount);
      }
    });
  });

  // Mở panel là bấm ngay tab "Chờ chế biến" — đây mới là phần khách/bàn thật sự cần theo dõi;
  // "Hỗ trợ" đứng trước theo đúng thứ tự ảnh mẫu nhưng chưa có dữ liệu nên không cần mở mặc định.
  drawer.querySelector('[data-yc-tab="cho-che-bien"]').click();
}
