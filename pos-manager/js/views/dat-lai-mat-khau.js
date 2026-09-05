// Việc header (23/08/2026) — Đặt PIN mới bằng token nhận qua email (mở từ link trong mail,
// dạng #/dat-lai-mat-khau?token=...). Đặt xong thì mọi phiên đăng nhập cũ (mọi thiết bị) bị huỷ.
import { api } from '../api.js';
import { toast } from '../ui.js';
import { icon } from '../icons.js';

export function render(container, { params } = {}) {
  const token = params?.token || '';

  if (!token) {
    container.innerHTML = `
      <div class="login-wrap">
        <div class="login-logo">${icon('quan-ly')}</div>
        <h1>Thiếu mã đặt lại mật khẩu</h1>
        <p class="login-sub">Link không đúng hoặc đã mất mã. Hãy mở lại link trong email, hoặc yêu cầu gửi lại.</p>
        <a href="#/quen-mat-khau" class="btn btn-primary" style="width:100%;display:block;text-align:center">Yêu cầu gửi lại</a>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">${icon('quan-ly')}</div>
      <h1>Đặt mật khẩu mới</h1>
      <p class="login-sub">Chọn mã PIN mới (6 số). Sau khi đổi, mọi thiết bị đang đăng nhập sẽ phải đăng nhập lại.</p>
      <form id="dlmk-form">
        <div class="field">
          <label for="dlmk-pin">Mã PIN mới (6 số)</label>
          <input id="dlmk-pin" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required />
        </div>
        <div class="field">
          <label for="dlmk-pin2">Nhập lại mã PIN mới</label>
          <input id="dlmk-pin2" name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Đặt mật khẩu mới</button>
      </form>
    </div>
  `;

  const form = container.querySelector('#dlmk-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = form.pin.value.trim();
    const pin2 = form.pin2.value.trim();
    if (pin !== pin2) { toast('Mã PIN nhập lại không khớp', 'error'); return; }
    try {
      await api.post('/api/mgr/auth/reset-password', { token, pin });
      toast('Đã đặt lại mật khẩu, hãy đăng nhập lại');
      location.hash = '#/dang-nhap';
    } catch (err) {
      toast(err?.body?.message || 'Không đặt lại được, link có thể đã hết hạn', 'error');
    }
  });
}
