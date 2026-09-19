// Việc header (23/08/2026) — Đăng ký tài khoản chủ quán. CHỈ mở khi quán CHƯA có ai (bootstrap),
// để chủ quán tự chọn SĐT/PIN/email dễ nhớ thay vì dùng tài khoản admin tạo sẵn bằng script lúc
// cài đặt — đúng gốc vấn đề chủ quán nêu ("khó nhớ và khó kiểm soát khi quên mật khẩu admin").
// Sau khi đã có chủ quán, route này khoá lại — dùng "Quên mật khẩu" (quen-mat-khau.js) để khôi phục.
import { api } from '../api.js';
import { toast } from '../ui.js';
import { icon } from '../icons.js';

export async function render(container, { onLoggedIn } = {}) {
  container.innerHTML = `<div class="login-wrap"><p>Đang kiểm tra…</p></div>`;

  let boot;
  try {
    boot = await api.get('/api/mgr/auth/bootstrap-status');
  } catch {
    boot = { has_owner: true }; // không kiểm tra được thì an toàn hơn: coi như đã có, chặn đăng ký
  }

  if (boot.has_owner) {
    container.innerHTML = `
      <div class="login-wrap">
        <div class="login-logo">${icon('quan-ly')}</div>
        <h1>Quán đã có chủ tài khoản</h1>
        <p class="login-sub">Quán đã có tài khoản chủ quán. Hãy đăng nhập, hoặc dùng "Quên mật khẩu" nếu không nhớ PIN.</p>
        <a href="#/dang-nhap" class="btn btn-primary" style="width:100%;display:block;text-align:center">Về trang đăng nhập</a>
        <p class="login-sub" style="margin-top:14px"><a href="#/quen-mat-khau">Quên mật khẩu?</a></p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">${icon('quan-ly')}</div>
      <h1>Đăng ký tài khoản chủ quán</h1>
      <p class="login-sub">Quán chưa có tài khoản nào — tự đặt SĐT, mã PIN và email của bạn (dùng để khôi phục sau này).</p>
      <form id="dk-form">
        <div class="field">
          <label for="dk-name">Tên chủ quán</label>
          <input id="dk-name" name="name" type="text" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="dk-phone">Số điện thoại</label>
          <input id="dk-phone" name="phone" type="tel" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="dk-email">Email khôi phục</label>
          <input id="dk-email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="dk-pin">Mã PIN (6 số)</label>
          <input id="dk-pin" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required />
        </div>
        <div class="field">
          <label for="dk-pin2">Nhập lại mã PIN</label>
          <input id="dk-pin2" name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Đăng ký</button>
      </form>
      <p class="login-sub" style="margin-top:14px">Đã có tài khoản? <a href="#/dang-nhap">Đăng nhập</a></p>
    </div>
  `;

  const form = container.querySelector('#dk-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = form.email.value.trim();
    const pin = form.pin.value.trim();
    const pin2 = form.pin2.value.trim();
    if (pin !== pin2) { toast('Mã PIN nhập lại không khớp', 'error'); return; }
    try {
      const staff = await api.post('/api/mgr/auth/register', { name, phone, pin, email });
      toast(`Đã tạo tài khoản, xin chào ${staff.name}`);
      if (onLoggedIn) onLoggedIn(staff);
      else location.hash = '#/trang-chu';
    } catch (err) {
      toast(err?.body?.message || 'Không đăng ký được, thử lại', 'error');
    }
  });
}
