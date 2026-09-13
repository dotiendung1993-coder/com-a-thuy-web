// Việc header (23/08/2026) — Quên mật khẩu: gõ SĐT, hệ thống gửi link đặt lại PIN qua email đã
// đăng ký (nếu SĐT có tài khoản + email). Luôn báo "đã gửi nếu có" — không lộ SĐT nào có tài
// khoản, giống hệt luồng "quên mật khẩu" của khách đặt món (src/pos/customer-auth.js).
import { api } from '../api.js';
import { toast, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

export function render(container) {
  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">${icon('quan-ly')}</div>
      <h1>Quên mật khẩu</h1>
      <p class="login-sub">Nhập số điện thoại đăng nhập — nếu có tài khoản đã đăng ký email, hệ thống sẽ gửi link đặt lại PIN.</p>
      <form id="qmk-form">
        <div class="field">
          <label for="qmk-phone">Số điện thoại</label>
          <input id="qmk-phone" name="phone" type="tel" autocomplete="username" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Gửi email đặt lại mật khẩu</button>
      </form>
      <div id="qmk-result"></div>
      <p class="login-sub" style="margin-top:14px"><a href="#/dang-nhap">Về trang đăng nhập</a></p>
    </div>
  `;

  const form = container.querySelector('#qmk-form');
  const resultEl = container.querySelector('#qmk-result');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = form.phone.value.trim();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api.post('/api/mgr/auth/forgot-password', { phone });
      resultEl.innerHTML = res.sent
        ? `<p class="ok-note">${icon('ok')}<span>Đã gửi link đặt lại mật khẩu tới ${escapeHtml(res.email)}. Kiểm tra hộp thư (cả mục spam) trong 30 phút.</span></p>`
        : `<p class="ok-note">${icon('ok')}<span>Nếu số điện thoại này có tài khoản và đã đăng ký email, thư đặt lại mật khẩu đã được gửi.</span></p>`;
      form.classList.add('hidden');
    } catch (err) {
      toast(err?.body?.message || 'Không gửi được, thử lại sau', 'error');
      btn.disabled = false;
    }
  });
}
