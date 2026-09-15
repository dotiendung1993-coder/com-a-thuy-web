// Việc "Thuế" (19/08/2026) — wizard "Thiết lập sổ kế toán" (ảnh Website v2\Thuế\Screenshot
// 2026-08-12 225118.png — khớp ĐÚNG bước 1). Bước 2 "Phương pháp thuế" KHÔNG có ảnh mẫu — tự thiết
// kế theo đúng tinh thần bước 1 (Nhóm 2 chọn PP1/PP2, Nhóm 3 cố định 17% lợi nhuận) + nguyên tắc đã
// chốt với chủ quán: KHÔNG tự bịa số % GTGT theo ngành / TNCN theo PP1 (ảnh không cho số cụ thể) —
// để trống, chủ quán/kế toán tự điền, giống nguyên tắc đã áp dụng ở Cài đặt > Quản lý thuế.
// Lưu qua settings-service.js key 'tax_classification' (route generic /api/mgr/settings/:key,
// KHÔNG dùng key 'tax' — xem buglog "tax-key-collision"). Trang con của "Kê khai thuế", không phải
// mục sidebar riêng (nav.js: sidebarHidden: true) — breadcrumb "Thuế › Thiết lập sổ kế toán" do
// app.js vẽ tự động từ route.group/title, view này chỉ vẽ phần thân.
import { api } from '../api.js';
import { escapeHtml, toast } from '../ui.js';

const REVENUE_GROUPS = [
  { value: '1', title: 'Nhóm 1 — Dưới 1 tỷ/năm', subtitle: 'Miễn thuế GTGT & TNCN' },
  { value: '2', title: 'Nhóm 2 — 1 tỷ – 3 tỷ/năm', subtitle: 'GTGT theo ngành + TNCN chọn PP1 (%DT) hoặc PP2 (15% lợi nhuận)' },
  { value: '3', title: 'Nhóm 3 — 3 tỷ – 50 tỷ/năm', subtitle: 'GTGT theo ngành + TNCN 17% lợi nhuận' },
];

const CHANNELS = [
  { value: 'san-tmdt', label: 'Các sàn TMĐT (Shopee, Lazada, Tiktok Shop,...)' },
  { value: 'giao-do-an', label: 'Ứng dụng giao đồ ăn (ShopeeFood, GrabFood, BeFood,...)' },
  { value: 'mang-xa-hoi', label: 'Mạng xã hội (Facebook, Zalo,...)' },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let step = 1;
  let form = {
    revenue_group: '', seasonal: '', other_channels: [],
    pit_method: '', pit_rate_pp1: '', vat_rate_industry: '', activity_label: 'Dịch vụ ăn uống',
  };

  container.innerHTML = '<p>Đang tải…</p>';
  try {
    const res = await api.get('/api/mgr/settings/tax_classification');
    const v = res.value || {};
    form = {
      revenue_group: v.revenue_group || '', seasonal: v.seasonal || '',
      other_channels: Array.isArray(v.other_channels) ? v.other_channels : [],
      pit_method: v.pit_method || '', pit_rate_pp1: v.pit_rate_pp1 || '',
      vat_rate_industry: v.vat_rate_industry || '', activity_label: v.activity_label || 'Dịch vụ ăn uống',
    };
  } catch { /* chưa có dữ liệu — dùng mặc định trống */ }

  function stepsHtml() {
    // Bước đã xong tô màu qua CSS (.wiz-step.done), không dùng ký tự dấu tick (bị chặn bởi quy tắc
    // "không emoji" của bộ test — xem tests/*emoji*).
    return `<div class="wiz-steps">
      <div class="wiz-step ${step === 1 ? 'active' : 'done'}"><span class="wiz-step-num">1</span>Nhóm doanh thu & hình thức</div>
      <div class="wiz-step-line"></div>
      <div class="wiz-step ${step === 2 ? 'active' : ''}"><span class="wiz-step-num">2</span>Phương pháp thuế</div>
    </div>`;
  }

  function step1Html() {
    return `
      <h3>Nhóm doanh thu năm</h3>
      ${REVENUE_GROUPS.map((g) => `
        <label class="wiz-option ${form.revenue_group === g.value ? 'selected' : ''}">
          <input type="radio" name="wiz-group" value="${g.value}" ${form.revenue_group === g.value ? 'checked' : ''} />
          <span class="wiz-option-body"><strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.subtitle)}</span></span>
        </label>
      `).join('')}

      <h3 style="margin-top:20px">2. Doanh thu của bạn có tập trung mạnh vào một vài tháng cụ thể trong năm không? <span style="font-weight:400;color:var(--text-3)">(Không bắt buộc)</span></h3>
      <label class="wiz-option ${form.seasonal === 'co' ? 'selected' : ''}">
        <input type="radio" name="wiz-seasonal" value="co" ${form.seasonal === 'co' ? 'checked' : ''} />
        <span class="wiz-option-body">Có</span>
      </label>
      <label class="wiz-option ${form.seasonal === 'khong' ? 'selected' : ''}">
        <input type="radio" name="wiz-seasonal" value="khong" ${form.seasonal === 'khong' ? 'checked' : ''} />
        <span class="wiz-option-body">Không</span>
      </label>

      <h3 style="margin-top:20px">3. Ngoài bán trực tiếp tại cửa hàng, bạn có doanh thu từ các kênh nào khác không? <span style="font-weight:400;color:var(--text-3)">(Không bắt buộc)</span></h3>
      ${CHANNELS.map((c) => `
        <label class="wiz-option ${form.other_channels.includes(c.value) ? 'selected' : ''}">
          <input type="checkbox" name="wiz-channel" value="${c.value}" ${form.other_channels.includes(c.value) ? 'checked' : ''} />
          <span class="wiz-option-body">${escapeHtml(c.label)}</span>
        </label>
      `).join('')}

      <div class="wiz-actions"><button id="wiz-next" class="btn btn-primary">Tiếp tục</button></div>
    `;
  }

  function step2Html() {
    const g = form.revenue_group;
    let body = '';
    if (g === '1') {
      body = '<div class="wiz-note">Nhóm 1 (dưới 1 tỷ/năm) được <strong>miễn thuế GTGT &amp; TNCN</strong> — không cần chọn phương pháp tính thuế.</div>';
    } else {
      if (g === '2') {
        body += `
          <h3>Phương pháp tính TNCN</h3>
          <label class="wiz-option ${form.pit_method === 'pp1' ? 'selected' : ''}">
            <input type="radio" name="wiz-pit" value="pp1" ${form.pit_method === 'pp1' ? 'checked' : ''} />
            <span class="wiz-option-body"><strong>PP1</strong><span>Tính theo % doanh thu</span></span>
          </label>
          <label class="wiz-option ${form.pit_method === 'pp2' ? 'selected' : ''}">
            <input type="radio" name="wiz-pit" value="pp2" ${form.pit_method === 'pp2' ? 'checked' : ''} />
            <span class="wiz-option-body"><strong>PP2</strong><span>Tính theo 15% lợi nhuận</span></span>
          </label>
          <div class="field" id="wiz-pp1-rate-field" style="${form.pit_method === 'pp1' ? '' : 'display:none'}">
            <label>Tỷ lệ TNCN theo PP1 — % doanh thu</label>
            <input id="wiz-pp1-rate" type="text" inputmode="decimal" placeholder="Chủ quán/kế toán tự điền" value="${escapeHtml(form.pit_rate_pp1)}" />
          </div>
        `;
      } else if (g === '3') {
        body += '<div class="wiz-note">Nhóm 3 (3 tỷ – 50 tỷ/năm) áp dụng <strong>TNCN 17% lợi nhuận</strong> (cố định, không cần chọn phương pháp).</div>';
      }
      body += `
        <div class="field">
          <label>Tỷ lệ GTGT theo ngành nghề (%)</label>
          <input id="wiz-vat-rate" type="text" inputmode="decimal" placeholder="Chủ quán/kế toán tự điền" value="${escapeHtml(form.vat_rate_industry)}" />
        </div>
      `;
    }
    body += `
      <div class="field">
        <label>Ngành nghề kinh doanh</label>
        <input id="wiz-activity" type="text" value="${escapeHtml(form.activity_label)}" />
      </div>
      <div class="wiz-actions">
        <button id="wiz-back" class="btn">Quay lại</button>
        <button id="wiz-finish" class="btn btn-primary">Hoàn tất</button>
      </div>
    `;
    return body;
  }

  function bindStep1() {
    container.querySelectorAll('input[name="wiz-group"]').forEach((el) => {
      el.addEventListener('change', () => { form.revenue_group = el.value; paint(); });
    });
    container.querySelectorAll('input[name="wiz-seasonal"]').forEach((el) => {
      el.addEventListener('change', () => { form.seasonal = el.value; paint(); });
    });
    container.querySelectorAll('input[name="wiz-channel"]').forEach((el) => {
      el.addEventListener('change', () => {
        const set = new Set(form.other_channels);
        if (el.checked) set.add(el.value); else set.delete(el.value);
        form.other_channels = [...set];
        paint();
      });
    });
    const next = container.querySelector('#wiz-next');
    next.disabled = !form.revenue_group;
    next.addEventListener('click', () => {
      if (!form.revenue_group) { toast('Chọn 1 nhóm doanh thu trước khi tiếp tục', 'error'); return; }
      // Nhóm 1/3 tự gán sẵn phương pháp (khớp ảnh: không có lựa chọn ở bước 2 cho 2 nhóm này).
      if (form.revenue_group === '1') form.pit_method = 'exempt';
      else if (form.revenue_group === '3') form.pit_method = 'fixed_17';
      else if (!['pp1', 'pp2'].includes(form.pit_method)) form.pit_method = '';
      step = 2;
      paint();
    });
  }

  function bindStep2() {
    container.querySelectorAll('input[name="wiz-pit"]').forEach((el) => {
      el.addEventListener('change', () => { form.pit_method = el.value; paint(); });
    });
    container.querySelector('#wiz-pp1-rate')?.addEventListener('input', (e) => { form.pit_rate_pp1 = e.target.value; });
    container.querySelector('#wiz-vat-rate')?.addEventListener('input', (e) => { form.vat_rate_industry = e.target.value; });
    container.querySelector('#wiz-activity').addEventListener('input', (e) => { form.activity_label = e.target.value; });
    container.querySelector('#wiz-back').addEventListener('click', () => { step = 1; paint(); });
    container.querySelector('#wiz-finish').addEventListener('click', async () => {
      if (form.revenue_group === '2' && !['pp1', 'pp2'].includes(form.pit_method)) {
        toast('Chọn phương pháp tính TNCN (PP1 hoặc PP2) trước khi hoàn tất', 'error');
        return;
      }
      try {
        await api.patch('/api/mgr/settings/tax_classification', { ...form, completed: true });
        toast('Đã lưu thiết lập sổ kế toán');
        location.hash = '#/ke-khai-thue';
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được thiết lập', 'error');
      }
    });
  }

  function paint() {
    container.innerHTML = stepsHtml() + (step === 1 ? step1Html() : step2Html());
    if (step === 1) bindStep1(); else bindStep2();
  }

  paint();
}
