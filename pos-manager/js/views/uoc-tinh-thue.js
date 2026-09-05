// GĐ3 — Ước tính thuế: doanh thu kỳ/năm, miễn thuế hay không, VAT/TNCN/môn bài, cấu hình thuế (chủ quán).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, todayVN, dateVN, monthStartVN, pageTabsHtml } from '../ui.js';

const todayStr = todayVN;
const daysAgoStr = (n) => dateVN(-n);
const monthStartStr = monthStartVN;

const ERROR_MESSAGES = {
  invalid_date: 'Ngày không hợp lệ',
  invalid_rate: 'Thuế suất không hợp lệ',
  invalid_threshold: 'Ngưỡng doanh thu không hợp lệ',
  invalid_range: 'Khoảng ngày không hợp lệ',
};
function errMsg(err) { return ERROR_MESSAGES[err?.body?.error] || err?.body?.message || 'Có lỗi xảy ra'; }

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.report_manage;

  let range = { from: monthStartStr(), to: todayStr() };

  container.innerHTML = `
    ${pageTabsHtml('uoc-tinh-thue', staff)}
    <div class="sq-quick-range">
      <button class="chip" data-range="today">Hôm nay</button>
      <button class="chip" data-range="7d">7 ngày</button>
      <button class="chip active" data-range="month">Tháng này</button>
    </div>
    <div class="orders-filters-row" style="margin:8px 0">
      <input id="th-from" type="date" value="${range.from}" />
      <input id="th-to" type="date" value="${range.to}" />
    </div>
    ${canManage ? '<button id="th-config" class="btn" style="margin-bottom:10px">Cấu hình thuế</button>' : ''}
    <div id="th-body"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (b.dataset.range === 'today') range = { from: todayStr(), to: todayStr() };
      else if (b.dataset.range === '7d') range = { from: daysAgoStr(6), to: todayStr() };
      else range = { from: monthStartStr(), to: todayStr() };
      container.querySelector('#th-from').value = range.from;
      container.querySelector('#th-to').value = range.to;
      load();
    });
  });
  container.querySelector('#th-from').addEventListener('change', (e) => { range.from = e.target.value; load(); });
  container.querySelector('#th-to').addEventListener('change', (e) => { range.to = e.target.value; load(); });
  if (canManage) container.querySelector('#th-config').addEventListener('click', () => openConfigModal());

  let lastData = null;

  function renderBody(d) {
    lastData = d;
    const revenueBlock = `
      <div class="tc-totals">
        <div class="tc-total-box"><span class="label">Doanh thu trong kỳ</span><span class="value">${formatVND(d.revenue_period)}</span></div>
        <div class="tc-total-box"><span class="label">Từ đầu năm (${d.ytd_from} → ${d.ytd_to})</span><span class="value">${formatVND(d.revenue_ytd)}</span></div>
        <div class="tc-total-box"><span class="label">Cả năm ước tính</span><span class="value">${formatVND(d.revenue_year_projected)}</span></div>
      </div>
      <p class="rp-note">${escapeHtml(d.exempt_reason || '')}</p>
    `;

    let taxBlock;
    if (d.exempt) {
      taxBlock = `
        <div class="rp-exempt-box">
          <strong>Tạm tính: chưa phải nộp thuế</strong>
          <div class="rp-what-if">Nếu vượt ngưỡng miễn thuế thì sẽ đóng khoảng: Thuế GTGT ${formatVND(d.vat_if_taxable)} · Thuế TNCN ${formatVND(d.pit_if_taxable)}</div>
        </div>
      `;
    } else {
      taxBlock = `
        <div class="pay-summary">
          <div><span>Thuế GTGT (${d.settings.vat_rate}%)</span><span>${formatVND(d.vat)}</span></div>
          <div><span>Thuế TNCN (${d.settings.pit_rate}%)</span><span>${formatVND(d.pit)}</span></div>
          <div><span>Tổng thuế</span><span>${formatVND(d.total_tax)}</span></div>
          <div><span>Lệ phí môn bài${d.license_fee_tier ? ' (' + escapeHtml(d.license_fee_tier) + ')' : ''}</span><span>${formatVND(d.license_fee)}</span></div>
          <div class="pay-total"><span>TỔNG PHẢI NỘP</span><span>${formatVND(d.total_with_license)}</span></div>
        </div>
      `;
    }

    container.querySelector('#th-body').innerHTML = `
      ${revenueBlock}
      ${taxBlock}
      <div class="rp-disclaimer">${escapeHtml(d.disclaimer || '')}</div>
    `;
  }

  function openConfigModal() {
    if (!lastData) return;
    const s = lastData.settings;
    const modal = openModal(`
      <h3>Cấu hình thuế</h3>
      <div class="field"><label>Loại hình hoạt động</label><input id="ts-activity" type="text" value="${escapeHtml(s.activity_label || '')}" /></div>
      <div class="field"><label>Thuế suất GTGT (%)</label><input id="ts-vat" type="number" step="0.1" min="0" value="${s.vat_rate}" /></div>
      <div class="field"><label>Thuế suất TNCN (%)</label><input id="ts-pit" type="number" step="0.1" min="0" value="${s.pit_rate}" /></div>
      <div class="field"><label>Ngưỡng doanh thu miễn thuế/năm</label><input id="ts-threshold" type="number" min="0" value="${s.exempt_threshold_year}" /></div>
      <div class="field"><label><input id="ts-license" type="checkbox" ${s.license_fee_enabled ? 'checked' : ''} style="width:auto;min-height:auto;vertical-align:middle" /> Tính lệ phí môn bài</label></div>
      <button id="ts-submit" class="btn btn-primary" style="width:100%">Lưu cấu hình</button>
    `);
    modal.overlay.querySelector('#ts-submit').addEventListener('click', async () => {
      const payload = {
        activity_label: modal.overlay.querySelector('#ts-activity').value.trim(),
        vat_rate: Number(modal.overlay.querySelector('#ts-vat').value),
        pit_rate: Number(modal.overlay.querySelector('#ts-pit').value),
        exempt_threshold_year: Number(modal.overlay.querySelector('#ts-threshold').value),
        license_fee_enabled: modal.overlay.querySelector('#ts-license').checked,
      };
      try {
        await api.put('/api/mgr/reports/tax-settings', payload);
        toast('Đã lưu cấu hình thuế');
        modal.close();
        await load();
      } catch (err) {
        toast(errMsg(err), 'error');
      }
    });
  }

  async function load() {
    const el = container.querySelector('#th-body');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const data = await api.get(`/api/mgr/reports/tax?from=${range.from}&to=${range.to}`);
      renderBody(data);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được ước tính thuế.</p>';
    }
  }

  await load();
}
