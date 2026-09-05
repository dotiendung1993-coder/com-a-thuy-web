// T8 màn Bán hàng + T10 Bán nhanh dùng chung 1 màn thanh toán (3 cách: tiền mặt / chuyển khoản /
// ghi nợ) — tách riêng ra đây (trước nằm trong sell.js) để không viết lại 2 lần.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';

// order, fees: kết quả trả về từ POST /api/mgr/orders.
// onDone(): gọi sau khi đóng modal (kể cả bấm "Để thanh toán sau") — nơi gọi dọn giỏ hàng/màn hình.
export function openPaymentModal(order, fees, { onDone } = {}) {
  const modal = openModal(`
    <h3>Thanh toán — ${escapeHtml(order.order_code)}</h3>
    <button id="pay-print" class="btn" type="button" style="width:100%;margin-bottom:8px"><span class="inline-ico">${icon('in')}</span> In hoá đơn</button>
    <div class="pay-summary">
      <div><span>Tiền món</span><span>${formatVND(order.subtotal)}</span></div>
      ${fees.packaging_fee ? `<div><span>Phí đóng gói</span><span>${formatVND(fees.packaging_fee)}</span></div>` : ''}
      ${fees.ship_fee ? `<div><span>Phí giao hàng</span><span>${formatVND(fees.ship_fee)}</span></div>` : ''}
      ${fees.ship_pending ? '<div class="pay-warn">Chưa tính được phí ship cho địa chỉ này — thu sau</div>' : ''}
      <div class="pay-total"><span>Tổng thu</span><span>${formatVND(order.total)}</span></div>
    </div>
    <div class="pay-methods">
      <button data-method="tien-mat" class="btn btn-primary">Tiền mặt</button>
      <button data-method="chuyen-khoan" class="btn">Chuyển khoản</button>
      <button data-method="ghi-no" class="btn">Ghi nợ</button>
    </div>
    <div id="pay-detail"></div>
    <div class="modal-close-row"><button data-action="later">Để thanh toán sau</button></div>
  `);
  const detail = modal.overlay.querySelector('#pay-detail');

  modal.overlay.querySelector('#pay-print').addEventListener('click', () => {
    window.open(`${getApiBase()}/api/mgr/bill/${encodeURIComponent(order.order_code)}/print`, '_blank');
  });

  function finish() {
    modal.close();
    if (onDone) onDone();
  }

  async function submitPay(body, okMessage) {
    try {
      const res = await api.post(`/api/mgr/orders/${order.order_code}/pay`, body);
      toast(okMessage(res));
      finish();
    } catch (err) {
      toast(err?.body?.message || 'Thanh toán không thành công', 'error');
    }
  }

  function renderCash() {
    detail.innerHTML = `
      <label>Tiền khách đưa</label>
      <input id="cash-given" type="number" inputmode="numeric" min="0" step="1000" value="${order.total}" />
      <div class="pay-change">Tiền thối: <b id="cash-change">${formatVND(0)}</b></div>
      <button id="cash-confirm" class="btn btn-primary" style="width:100%">Xác nhận đã nhận tiền</button>
    `;
    const input = detail.querySelector('#cash-given');
    const changeEl = detail.querySelector('#cash-change');
    const recalc = () => {
      const given = Number(input.value) || 0;
      changeEl.textContent = given >= order.total ? formatVND(given - order.total) : 'thiếu ' + formatVND(order.total - given);
    };
    input.addEventListener('input', recalc);
    recalc();
    detail.querySelector('#cash-confirm').addEventListener('click', () => {
      submitPay(
        { method: 'tien-mat', cash_given: Number(input.value) || 0 },
        (res) => `Đã thu tiền. Tiền thối ${formatVND(res.order.change_due)}`
      );
    });
  }

  async function renderTransfer() {
    detail.innerHTML = '<p>Đang tạo mã QR…</p>';
    try {
      const qr = await api.get(`/api/mgr/orders/${order.order_code}/qr`);
      detail.innerHTML = `
        <img class="pay-qr" src="${escapeHtml(qr.qr_url)}" alt="QR chuyển khoản ${escapeHtml(qr.memo)}" />
        <p class="pay-qr-note">Số tiền ${formatVND(qr.amount)} · Nội dung <b>${escapeHtml(qr.memo)}</b></p>
        <button id="transfer-confirm" class="btn btn-primary" style="width:100%">Đã nhận tiền</button>
      `;
      detail.querySelector('#transfer-confirm').addEventListener('click', () => {
        submitPay({ method: 'chuyen-khoan' }, () => 'Đã xác nhận nhận tiền chuyển khoản');
      });
    } catch (err) {
      detail.innerHTML = `<p class="pay-warn">${escapeHtml(err?.body?.message || 'Không tạo được QR')}</p>`;
    }
  }

  function renderDebt() {
    if (!order.customer_phone) {
      detail.innerHTML = '<p class="pay-warn">Ghi nợ bắt buộc có số điện thoại khách. Hãy huỷ đơn này và lên lại đơn có SĐT.</p>';
      return;
    }
    detail.innerHTML = `
      <p>Ghi nợ ${formatVND(order.total)} cho khách <b>${escapeHtml(order.customer_name || order.customer_phone)}</b>.</p>
      <button id="debt-confirm" class="btn btn-primary" style="width:100%">Xác nhận ghi nợ</button>
    `;
    detail.querySelector('#debt-confirm').addEventListener('click', () => {
      submitPay({ method: 'ghi-no' }, () => 'Đã ghi nợ cho khách');
    });
  }

  modal.overlay.addEventListener('click', (e) => {
    const methodBtn = e.target.closest('[data-method]');
    if (methodBtn) {
      modal.overlay.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('btn-primary', b === methodBtn));
      if (methodBtn.dataset.method === 'tien-mat') renderCash();
      else if (methodBtn.dataset.method === 'chuyen-khoan') renderTransfer();
      else renderDebt();
      return;
    }
    if (e.target.dataset.action === 'later') {
      // Đơn đã nằm trong DB và bếp đã nhận phiếu — đóng màn này chỉ là chưa thu tiền.
      finish();
      toast('Đã lưu đơn, thanh toán sau ở màn Đơn hàng');
    }
  });

  renderCash();
}
