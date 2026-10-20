// Việc "Thuế" (19/08/2026) — Nhật ký kê khai (ảnh Website v2\Thuế\Screenshot 2026-08-12 225118.png
// cho thấy mục sidebar này tồn tại; nội dung KHÔNG có ảnh mẫu). Danh sách CHỈ ĐỌC các hành động đã
// làm ở màn Kê khai thuế (tạo/sửa/xoá kỳ, đánh dấu gửi) — ghi tự động bởi tax-filing-service.js,
// không có thao tác tạo/sửa tay ở đây.
import { api } from '../api.js';
import { escapeHtml, pageTabsHtml } from '../ui.js';

const ACTION_LABEL = {
  tao_ky: 'Tạo kỳ kê khai',
  sua_ky: 'Sửa kỳ kê khai',
  xoa_ky: 'Xoá kỳ kê khai',
  danh_dau_gui: 'Đánh dấu đã gửi (thủ công)',
};

function fmtDateTimeVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  container.innerHTML = `
    ${pageTabsHtml('nhat-ky-ke-khai', staff)}
    <div class="card">
      <div class="card-head"><h3>Nhật ký kê khai</h3></div>
      <p style="color:var(--text-3);font-size:13px;margin-top:-6px">Ghi lại các thao tác tạo/sửa/xoá kỳ kê khai ở màn Kê khai thuế.</p>
      <div id="nkkk-list"><p>Đang tải…</p></div>
    </div>
  `;

  try {
    const { log } = await api.get('/api/mgr/tax-filing/log');
    const el = container.querySelector('#nkkk-list');
    if (!log.length) { el.innerHTML = '<p>Chưa có hoạt động nào.</p>'; return; }
    el.innerHTML = `<div class="sbh-card" style="padding:0"><div style="overflow-x:auto"><table class="sp-table" style="width:100%;border-radius:0">
      <thead><tr><th>Thời gian</th><th>Hành động</th><th>Chi tiết</th><th>Người thực hiện</th></tr></thead>
      <tbody>
        ${log.map((r) => `<tr>
          <td style="white-space:nowrap">${fmtDateTimeVN(r.created_at)}</td>
          <td>${escapeHtml(ACTION_LABEL[r.action] || r.action)}</td>
          <td>${escapeHtml(r.detail || '')}</td>
          <td>${escapeHtml(r.staff_name || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
  } catch (err) {
    if (err?.status !== 401 && err?.status !== 403) {
      container.querySelector('#nkkk-list').innerHTML = '<p>Không tải được nhật ký.</p>';
    }
  }
}
