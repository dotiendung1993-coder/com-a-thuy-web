// Đối chiếu giá vốn NVL (2026-09-18) — Task 2: màn hình BỔ SUNG, KHÔNG đụng gia-von.js (nhập tay
// menu.cost_price) hay report-service.js::profitReport() hiện có — 2 màn hoạt động độc lập.
// Chủ quán CHỐT: giá vốn tạm tính theo XUẤT (qua công thức pos_recipes — phiếu xuất tự động không
// lưu giá thật trên phiếu, xem report-service.js::ingredientCostReport) TÁCH RIÊNG theo từng
// món/size (mỗi size mâm S/M/L đã là 1 menu_id riêng sẵn). "Chi phí khác" (Thu Chi) chỉ hiện
// tham khảo, KHÔNG cộng vào vốn/suất.
//
// GHI CHÚ TRUNG THỰC (đọc trước khi thắc mắc sao mọi số đều 0/—): kiểm tra bằng SQL thật lúc xây
// tính năng (2026-09-18) — pos_ingredients/pos_ingredient_moves/pos_recipes đều 0 dòng, hạ tầng
// NVL CHƯA TỪNG được dùng thật. Màn này tự báo % công thức mỗi lần tải (banner cảnh báo) — KHÔNG
// được hiểu 0đ/— là "vốn bằng 0", mà là "chưa đủ dữ liệu để tính".
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, pageTabsHtml } from '../ui.js';
import { createTabbedRangePicker, tabbedRangePickerHtml } from '../date-range-picker.js';
import { rangeDates } from '../date-utils.js';

const TARGET_KEY = 'posmgr.doi-chieu-von.target-profit';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  const [defFrom, defTo] = rangeDates('thang-nay');
  let range = { from: defFrom, to: defTo };
  let lastData = null;
  const savedTarget = Number(localStorage.getItem(TARGET_KEY));
  let targetProfit = Number.isFinite(savedTarget) && savedTarget > 0 ? savedTarget : null;
  let loadSeq = 0;

  container.innerHTML = `
    ${pageTabsHtml('doi-chieu-von', staff)}
    <div class="ll-head">
      <h2>Đối chiếu giá vốn NVL</h2>
      <div class="ord-date-wrap" id="dcv-range"></div>
    </div>
    <p class="hint">Giá vốn TẠM TÍNH mỗi suất = NVL đã xuất dùng để nấu trong kỳ (qua công thức), tính
      riêng theo từng món/size. Không thay thế màn <a href="#/gia-von">Giá vốn</a> (nhập tay) — hai màn
      hoạt động độc lập, dùng cái nào tuỳ bạn.</p>

    <div id="dcv-coverage"></div>
    <div class="sbh-kpi" id="dcv-kpi"></div>

    <div class="card" style="margin:12px 0">
      <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        Lợi nhuận mục tiêu / suất
        <input id="dcv-target" type="number" min="0" step="1000" placeholder="vd 20000"
          value="${targetProfit ?? ''}" style="width:140px" /> đồng
      </label>
    </div>

    <div class="card">
      <h3>Theo từng món</h3>
      <div class="table-scroll">
        <table class="ll-detail-table">
          <thead><tr>
            <th>Món</th><th style="text-align:right">SL bán</th>
            <th style="text-align:right">Giá bán TB</th>
            <th style="text-align:right">Vốn tạm tính/suất</th>
            <th style="text-align:right">Vốn mục tiêu</th>
            <th style="text-align:right">So sánh</th>
          </tr></thead>
          <tbody id="dcv-body"><tr><td colspan="6">Đang tải…</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Xu hướng vài kỳ gần nhất</h3>
      <div id="dcv-trend"><p>Đang tải…</p></div>
    </div>

    <p class="hint" id="dcv-other-expense"></p>
  `;

  const rangeIds = { btn: 'dcv-date-btn', label: 'dcv-date-label', pop: 'dcv-date-pop', tabs: 'dcv-date-tabs', body: 'dcv-date-body' };
  container.querySelector('#dcv-range').innerHTML = tabbedRangePickerHtml(rangeIds, 'Chọn khoảng thời gian', 'Chọn khoảng thời gian', 'dcv-date-btn');
  createTabbedRangePicker(container.querySelector('#dcv-range'), rangeIds, {
    emptyLabel: 'Chọn khoảng thời gian',
    getFrom: () => range.from,
    getTo: () => range.to,
    set: (from, to) => { range = { from, to }; },
    onCommit: () => load(),
    onWarn: (m) => toast(m, 'error'),
  });

  container.querySelector('#dcv-target').addEventListener('input', (e) => {
    const v = e.target.value === '' ? null : Number(e.target.value);
    targetProfit = Number.isFinite(v) && v >= 0 ? v : null;
    if (targetProfit != null) localStorage.setItem(TARGET_KEY, String(targetProfit));
    else localStorage.removeItem(TARGET_KEY);
    if (lastData) renderTable(lastData);
  });

  function renderCoverage(d) {
    const el = container.querySelector('#dcv-coverage');
    const { dishes_sold, dishes_with_recipe, coverage_percent } = d.coverage;
    if (!dishes_sold) {
      el.innerHTML = '<div class="rp-warning-banner">Chưa có đơn hàng nào trong kỳ này — chưa có gì để tính.</div>';
    } else if (coverage_percent < 100) {
      el.innerHTML = `<div class="rp-warning-banner">⚠️ Chỉ ${dishes_with_recipe}/${dishes_sold} món bán ra trong kỳ (${coverage_percent}%) đã khai công thức — các món còn lại KHÔNG tính được vốn (hiện "—" ở bảng dưới, không phải 0đ). "Tổng chi phí NVL" và "Vốn tạm tính/suất" bên dưới chỉ tính trên ${dishes_with_recipe} món đã có công thức. Vào <a href="#/cong-thuc">Công thức</a> để khai thêm.</div>`;
    } else {
      el.innerHTML = '';
    }
  }

  function renderKpi(d) {
    container.querySelector('#dcv-kpi').innerHTML = `
      <div class="kpi-card kpi-c1">
        <div class="kpi-label">Tổng chi phí NVL (kỳ này)</div>
        <div class="kpi-val">${d.summary.cost_total == null ? '—' : formatVND(d.summary.cost_total)}</div>
      </div>
      <div class="kpi-card kpi-c1">
        <div class="kpi-label">Vốn tạm tính / suất (bình quân)</div>
        <div class="kpi-val">${d.summary.cost_per_serving_avg == null ? '—' : formatVND(d.summary.cost_per_serving_avg)}</div>
      </div>
      <div class="kpi-card kpi-c1">
        <div class="kpi-label">Tổng số suất bán được (mọi món)</div>
        <div class="kpi-val">${d.summary.qty_total_all}</div>
      </div>`;
  }

  function compareCell(costPerDish, avgPrice) {
    if (costPerDish == null) return '<span style="color:var(--text-3)">— (chưa có công thức)</span>';
    if (targetProfit == null) return '<span style="color:var(--text-3)">—</span>';
    const diff = (avgPrice - targetProfit) - costPerDish;
    return diff >= 0
      ? `<span class="rp-positive">✓ Đạt (dư ${formatVND(diff)})</span>`
      : `<span class="rp-negative">✗ Vượt ${formatVND(-diff)}</span>`;
  }

  function renderTable(d) {
    const body = container.querySelector('#dcv-body');
    if (!d.dishes.length) { body.innerHTML = '<tr><td colspan="6">Chưa có món nào bán ra trong kỳ này.</td></tr>'; return; }
    body.innerHTML = d.dishes.map((it) => {
      const targetCost = targetProfit != null ? it.avg_price - targetProfit : null;
      return `<tr>
        <td>${escapeHtml(it.name)}${it.has_recipe ? '' : ' <span class="hint" style="margin:0">(chưa có công thức)</span>'}</td>
        <td style="text-align:right">${it.qty_sold}</td>
        <td style="text-align:right">${formatVND(it.avg_price)}</td>
        <td style="text-align:right">${it.cost_per_dish == null ? '—' : formatVND(it.cost_per_dish)}</td>
        <td style="text-align:right">${targetCost == null ? '—' : formatVND(targetCost)}</td>
        <td style="text-align:right">${compareCell(it.cost_per_dish, it.avg_price)}</td>
      </tr>`;
    }).join('');
  }

  function renderTrend(t) {
    const el = container.querySelector('#dcv-trend');
    const withData = (t.periods || []).filter((p) => p.qty_total_with_recipe > 0);
    if (withData.length < 2) {
      el.innerHTML = '<p class="hint">Chưa đủ dữ liệu lịch sử để so sánh xu hướng (cần ít nhất 2 kỳ đã có công thức + đơn hàng).</p>';
      return;
    }
    el.innerHTML = `<div class="table-scroll"><table class="ll-detail-table">
      <thead><tr><th>Kỳ</th><th style="text-align:right">Vốn tạm tính/suất</th><th style="text-align:right">% món có công thức</th></tr></thead>
      <tbody>${t.periods.map((p) => `<tr><td>${escapeHtml(p.from)} — ${escapeHtml(p.to)}</td>
        <td style="text-align:right">${p.cost_per_serving_avg == null ? '—' : formatVND(p.cost_per_serving_avg)}</td>
        <td style="text-align:right">${p.coverage_percent}%</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function load() {
    const mySeq = ++loadSeq;
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const [data, trend] = await Promise.all([
        api.get(`/api/mgr/reports/ingredient-cost?${params}`),
        api.get(`/api/mgr/reports/ingredient-cost-trend?${params}&periods=6`),
      ]);
      if (mySeq !== loadSeq) return;
      lastData = data;
      renderCoverage(data);
      renderKpi(data);
      renderTable(data);
      renderTrend(trend);
      container.querySelector('#dcv-other-expense').textContent =
        `Tham khảo — Chi phí khác trong kỳ (Thu Chi: gas/điện/nhân công/mặt bằng…, KHÔNG cộng vào vốn/suất ở trên): ${formatVND(data.other_expense_ref)}`;
    } catch (err) {
      if (mySeq !== loadSeq) return;
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#dcv-kpi').innerHTML = '<p>Không tải được báo cáo.</p>';
      }
    }
  }

  await load();
}
