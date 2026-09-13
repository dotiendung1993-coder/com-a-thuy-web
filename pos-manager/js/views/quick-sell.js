// T10 — Bán nhanh: tên sản phẩm tự gõ + giá bán nhập bằng bàn phím số, không cần có trong thực
// đơn (vd nước khách mang gửi, đồ mua hộ...). Tạo 1 đơn 1 dòng rồi mở đúng màn Thanh toán dùng
// chung với Bán hàng (T8) — xem js/views/payment-modal.js.
import { api } from '../api.js';
import { formatVND, toast, escapeHtml } from '../ui.js';
// Quy ước GĐ7: mọi màn dùng icon SVG, KHÔNG dùng emoji (test T60 quét cả thư mục views/).
import { icon } from '../icons.js';
import { openPaymentModal } from './payment-modal.js';

const MAX_DIGITS = 9; // đủ cho giá trị dưới 1 tỷ, khớp giới hạn hợp lý của một dòng bán nhanh
const MAX_QTY = 99;

// Task 2 mục 2 (2026-08-08) — chủ quán: "giao diện bán nhanh đơn giản quá, không đẹp và xấu".
// Mệnh giá bấm nhanh: đúng các mức hay gặp ở quán cơm (trà đá, nước ngọt, bia, đồ mua hộ) nên
// phần lớn trường hợp chỉ cần 1 lần bấm thay vì gõ từng chữ số trên bàn phím.
const QUICK_AMOUNTS = [5000, 10000, 15000, 20000, 25000, 50000];
// Tên hay dùng — bấm là điền sẵn, vẫn sửa lại được.
const QUICK_NAMES = ['Trà đá', 'Nước ngọt', 'Bia', 'Thuốc lá', 'Mua hộ'];

export function render(container) {
  let priceDigits = '';
  let qty = 1;

  container.innerHTML = `
    <div class="page-head"><h2>Bán nhanh</h2></div>
    <div class="quick-sell qs-card">
      <p class="qs-hint">Dành cho món KHÔNG có trong thực đơn — nước khách gửi, đồ mua hộ… Tạo đơn 1 dòng rồi thanh toán ngay.</p>

      <div class="field">
        <label for="qs-name">Tên sản phẩm</label>
        <input id="qs-name" type="text" placeholder="VD: Trà đá" autocomplete="off" />
      </div>
      <div class="qs-chips" id="qs-name-chips">
        ${QUICK_NAMES.map((n) => `<button type="button" class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}
      </div>

      <div class="qs-amount-block">
        <span class="qs-amount-label">Giá bán</span>
        <div class="qs-price-display" id="qs-price-display">${formatVND(0)}</div>
      </div>
      <div class="qs-chips" id="qs-amount-chips">
        ${QUICK_AMOUNTS.map((a) => `<button type="button" class="chip" data-amount="${a}">${formatVND(a)}</button>`).join('')}
      </div>

      <div class="qs-qty-row">
        <span class="qs-amount-label">Số lượng</span>
        <div class="qs-stepper">
          <button type="button" id="qs-minus" aria-label="Bớt 1">−</button>
          <span id="qs-qty">1</span>
          <button type="button" id="qs-plus" aria-label="Thêm 1">+</button>
        </div>
      </div>

      <div class="qs-keypad">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
          .map((k) => `<button type="button" class="qs-key ${k === 'clear' || k === 'back' ? 'fn' : ''}" data-k="${k}">${k === 'back' ? '⌫' : k === 'clear' ? 'Xoá' : k}</button>`)
          .join('')}
      </div>

      <!-- Task 3 (10/08/2026) — ô "Hẹn giao" cũng có ở Bán nhanh: khách gửi trước tiền nước/đồ
           mua hộ rồi hẹn chiều lấy là việc hay xảy ra ở quán cơm. -->
      <div class="field cart-sched">
        <label for="qs-sched">Hẹn giao <span class="cart-sched-opt">(để trống = giao ngay)</span></label>
        <div class="cart-sched-row">
          <input id="qs-sched" type="datetime-local" />
          <button type="button" class="btn cart-sched-clear" id="qs-sched-clear" title="Bỏ hẹn giao">${icon('dong')}</button>
        </div>
      </div>

      <div class="qs-total-row">
        <span>Thành tiền</span>
        <b id="qs-total">${formatVND(0)}</b>
      </div>
      <button id="qs-confirm" class="btn btn-primary qs-confirm">Xác nhận &amp; thanh toán</button>
    </div>
  `;

  const nameInput = container.querySelector('#qs-name');
  const priceDisplay = container.querySelector('#qs-price-display');
  const totalEl = container.querySelector('#qs-total');
  const qtyEl = container.querySelector('#qs-qty');
  const confirmBtn = container.querySelector('#qs-confirm');

  function currentPrice() {
    return priceDigits ? parseInt(priceDigits, 10) : 0;
  }

  function renderPrice() {
    priceDisplay.textContent = formatVND(currentPrice());
    qtyEl.textContent = String(qty);
    totalEl.textContent = formatVND(currentPrice() * qty);
    // Chưa đủ tên + giá thì khoá nút cho khỏi bấm nhầm rồi ăn toast lỗi.
    confirmBtn.disabled = !nameInput.value.trim() || currentPrice() <= 0;
  }

  nameInput.addEventListener('input', renderPrice);

  container.querySelector('#qs-name-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-name]');
    if (!btn) return;
    nameInput.value = btn.dataset.name;
    renderPrice();
  });

  container.querySelector('#qs-amount-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-amount]');
    if (!btn) return;
    priceDigits = btn.dataset.amount;
    renderPrice();
  });

  container.querySelector('#qs-minus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    renderPrice();
  });
  container.querySelector('#qs-plus').addEventListener('click', () => {
    qty = Math.min(MAX_QTY, qty + 1);
    renderPrice();
  });

  container.querySelector('.qs-keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('.qs-key');
    if (!btn) return;
    const k = btn.dataset.k;
    if (k === 'clear') {
      priceDigits = '';
    } else if (k === 'back') {
      priceDigits = priceDigits.slice(0, -1);
    } else if (priceDigits.length < MAX_DIGITS) {
      // Bỏ số 0 dư ở đầu (vd "0" + "5" phải ra "5", không phải "05").
      priceDigits = priceDigits === '0' ? k : priceDigits + k;
    }
    renderPrice();
  });

  const schedInput = container.querySelector('#qs-sched');
  container.querySelector('#qs-sched-clear').addEventListener('click', () => { schedInput.value = ''; });

  function resetForm() {
    priceDigits = '';
    qty = 1;
    nameInput.value = '';
    schedInput.value = '';
    renderPrice();
  }

  confirmBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const price = currentPrice();
    if (!name) { toast('Vui lòng nhập tên sản phẩm', 'error'); return; }
    if (price <= 0) { toast('Vui lòng nhập giá bán', 'error'); return; }

    const label = confirmBtn.innerHTML; // giữ nguyên cả icon để khôi phục sau khi tạo xong
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Đang tạo đơn…';
    try {
      const res = await api.post('/api/mgr/orders', {
        delivery_type: 'mang-ve',
        scheduled_at: schedInput.value || '',
        items: [{ custom: true, name, price, qty }],
      });
      openPaymentModal(res.order, res.fees, { onDone: resetForm });
    } catch (err) {
      toast(err?.body?.message || 'Không tạo được đơn', 'error');
    } finally {
      confirmBtn.innerHTML = label;
      renderPrice(); // tự tính lại trạng thái bật/tắt nút thay vì bật cứng
    }
  });

  renderPrice();
}
