import { api } from '../api.js';
import { toast } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { onLoggedIn } = {}) {
  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">${icon('quan-ly')}</div>
      <h1>POS Cơm A Thuý</h1>
      <p class="login-sub">Đăng nhập bằng số điện thoại và mã PIN của bạn</p>
      <form id="login-form">
        <div class="field">
          <label for="phone">Số điện thoại</label>
          <input id="phone" name="phone" type="tel" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="pin">Mã PIN (6 số)</label>
          <input id="pin" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Đăng nhập</button>
      </form>
      <p class="login-sub" id="login-links" style="margin-top:14px"><a href="#/quen-mat-khau">Quên mật khẩu?</a></p>
    </div>
  `;

  // Việc header (23/08/2026) — "Đăng ký tài khoản" chỉ hiện khi quán CHƯA có chủ (bootstrap),
  // tránh gợi ý đăng ký khi đã có tài khoản thật đang dùng.
  try {
    const boot = await api.get('/api/mgr/auth/bootstrap-status');
    if (!boot.has_owner) {
      const links = container.querySelector('#login-links');
      if (links) links.innerHTML += ' · <a href="#/dang-ky">Đăng ký tài khoản mới</a>';
    }
  } catch { /* không kiểm tra được thì thôi, chỉ ẩn bớt gợi ý, không chặn đăng nhập */ }

  const form = container.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = form.phone.value.trim();
    const pin = form.pin.value.trim();
    try {
      const staff = await api.post('/api/mgr/auth/login', { phone, pin });
      toast(`Xin chào ${staff.name}`);
      if (onLoggedIn) onLoggedIn(staff);
      else location.hash = '#/trang-chu';
    } catch (err) {
      if (err.status === 429) toast(err.body?.message || 'Sai PIN quá nhiều lần, thử lại sau 15 phút', 'error');
      else if (err.status === 401) toast('Sai số điện thoại hoặc PIN', 'error');
      else toast('Không đăng nhập được, thử lại', 'error');
    }
  });
}
