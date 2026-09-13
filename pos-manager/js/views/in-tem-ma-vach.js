// Đợt 5 (17/08/2026) — In tem mã vạch: màn riêng theo giao diện SoBanHang v2.
// 3 cột: chọn khổ giấy → chọn kích cỡ/số lượng → nội dung tem. Bên dưới: sản phẩm cần in.
import { api, getApiBase } from '../api.js';
import { escapeHtml, formatVND, toast } from '../ui.js';
import { icon } from '../icons.js';

const PAPER_TYPES = [
  {
    id: 'kho-2-tem',
    label: 'Khổ 2 tem',
    sizes: [
      { id: '72x22', label: 'Khổ 72×22 mm', sub: '(2.83×0.86 inch)', copies: 1, apiSize: '35x22' },
    ],
  },
  {
    id: 'kho-3-tem',
    label: 'Khổ 3 tem',
    sizes: [
      { id: '110x22', label: 'Khổ 110×22 mm', sub: '(4.33×0.86 inch)', copies: 1, apiSize: '50x30' },
    ],
  },
  {
    id: 'kho-a4',
    label: 'Khổ giấy A4',
    sizes: [
      { id: 'tomy138', label: 'Tomy No.138 - 100 tem', sub: '38.1×21.2 mm / tờ A4', copies: 1, apiSize: '70x40' },
      { id: 'tomy145', label: 'Tomy No.145 - 65 tem', sub: '38.1×21.2 mm / tờ A4', copies: 1, apiSize: '70x40' },
      { id: 'tomy146', label: 'Tomy No.146 - 180 tem', sub: '25.4×10 mm / tờ A4', copies: 1, apiSize: '70x40' },
    ],
  },
  {
    id: 'kho-a5',
    label: 'Khổ giấy A5',
    sizes: [
      { id: 'tomy108', label: 'Tomy No.108 - 40 tem', sub: '52.5×29.7 mm / tờ A5', copies: 1, apiSize: '50x30' },
    ],
  },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }

  let selectedPaper = PAPER_TYPES[0];
  let selectedSize = PAPER_TYPES[0].sizes[0];
  let printItems = [];      // { product, copies }
  let allProducts = [];
  let productSearch = '';

  container.innerHTML = `
    <div class="page-head">
      <h2>In tem mã vạch</h2>
    </div>

    <!-- 3-panel row -->
    <div id="itm-panels" style="display:grid;grid-template-columns:220px 1fr 1fr;gap:12px;margin-bottom:20px;align-items:start">
      <!-- Panel 1: Chọn khổ giấy -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Chọn khổ giấy in</div>
        <div id="itm-paper-list"></div>
      </div>
      <!-- Panel 2: Chọn kích cỡ -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Chọn kích cỡ, số lượng</div>
        <div id="itm-size-list"></div>
      </div>
      <!-- Panel 3: Nội dung tem -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Nội dung tem</div>
        <div id="itm-content" style="padding:16px;color:#999;font-size:13px;text-align:center;min-height:80px;display:flex;align-items:center;justify-content:center">
          Chọn kích cỡ để tuỳ chỉnh nội dung hiện thị trên tem
        </div>
      </div>
    </div>

    <!-- Sản phẩm in tem -->
    <div class="card" style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <strong>Sản phẩm in tem</strong>
        <div style="display:flex;align-items:center;gap:12px">
          <a id="itm-guide" href="#" style="font-size:13px;color:var(--primary,#16a34a)">Hướng dẫn cài đặt máy in</a>
          <button id="itm-pdf" class="btn btn-primary" style="display:flex;align-items:center;gap:6px">
            ${icon('in-tem-ma-vach')} Xuất file PDF
          </button>
        </div>
      </div>
      <input id="itm-search" type="search" placeholder="Tìm theo mã SKU hoặc tên sản phẩm…" style="margin-bottom:12px" />
      <div id="itm-search-results" style="max-height:180px;overflow-y:auto;border:1px solid var(--border,#e5e7eb);border-radius:8px;display:none"></div>
      <div id="itm-items" style="margin-top:8px"></div>
    </div>
  `;

  container.querySelector('#itm-guide').addEventListener('click', (e) => {
    e.preventDefault();
    toast('Xem hướng dẫn tại: https://sobanhang.com/huong-dan-may-in-tem', 'info');
  });

  // ── Panel 1: paper types ─────────────────────────────────────────────────────
  function renderPaperList() {
    const el = container.querySelector('#itm-paper-list');
    el.innerHTML = PAPER_TYPES.map((p) => `
      <div class="itm-paper-opt ${p.id === selectedPaper.id ? 'active' : ''}" data-pid="${p.id}"
        style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#f0f0f0);
               ${p.id === selectedPaper.id ? 'background:var(--primary,#16a34a);color:#fff;font-weight:600' : ''}">
        <span>${escapeHtml(p.label)}</span>
        <span style="font-size:14px">›</span>
      </div>`).join('');
    el.querySelectorAll('[data-pid]').forEach((div) => {
      div.addEventListener('click', () => {
        selectedPaper = PAPER_TYPES.find((p) => p.id === div.dataset.pid) || PAPER_TYPES[0];
        selectedSize = selectedPaper.sizes[0];
        renderPaperList();
        renderSizeList();
      });
    });
  }

  // ── Panel 2: sizes ──────────────────────────────────────────────────────────
  function renderSizeList() {
    const el = container.querySelector('#itm-size-list');
    el.innerHTML = selectedPaper.sizes.map((s) => `
      <div class="itm-size-opt ${s.id === selectedSize.id ? 'active' : ''}" data-sid="${s.id}"
        style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border,#f0f0f0);
               ${s.id === selectedSize.id ? 'background:var(--primary-light,#f0fdf4);border-left:3px solid var(--primary,#16a34a)' : ''}">
        <div style="font-weight:500">${escapeHtml(s.label)}</div>
        <div style="font-size:12px;color:#666">${escapeHtml(s.sub)}</div>
      </div>`).join('');
    el.querySelectorAll('[data-sid]').forEach((div) => {
      div.addEventListener('click', () => {
        selectedSize = selectedPaper.sizes.find((s) => s.id === div.dataset.sid) || selectedPaper.sizes[0];
        renderSizeList();
      });
    });
  }

  // ── Product search ──────────────────────────────────────────────────────────
  let searchTimer = null;
  container.querySelector('#itm-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    productSearch = e.target.value.trim();
    if (!productSearch) { container.querySelector('#itm-search-results').style.display = 'none'; return; }
    searchTimer = setTimeout(() => renderSearchResults(), 300);
  });

  function renderSearchResults() {
    const el = container.querySelector('#itm-search-results');
    const q = productSearch.toLowerCase();
    const matches = allProducts.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q))
    ).slice(0, 20);

    if (!matches.length) {
      el.innerHTML = '<p class="hint" style="padding:10px 12px;margin:0">Không tìm thấy sản phẩm nào</p>';
      el.style.display = 'block';
      return;
    }
    el.innerHTML = matches.map((p) => `
      <div class="itm-sp-item" data-pid="${p.id}" style="padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#f5f5f5)">
        <div>
          <div style="font-weight:500">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:#888">${escapeHtml(p.code || '')}${p.barcode ? ' · MV: ' + escapeHtml(p.barcode) : ''}</div>
        </div>
        <button class="btn" style="font-size:12px;padding:4px 10px;flex-shrink:0">Thêm</button>
      </div>`).join('');
    el.style.display = 'block';

    el.querySelectorAll('[data-pid]').forEach((div) => {
      div.addEventListener('click', () => {
        const p = allProducts.find((x) => String(x.id) === div.dataset.pid);
        if (!p) return;
        if (printItems.some((i) => i.product.id === p.id)) {
          toast('Sản phẩm đã có trong danh sách', 'info'); return;
        }
        printItems.push({ product: p, copies: 1 });
        container.querySelector('#itm-search').value = '';
        productSearch = '';
        el.style.display = 'none';
        renderPrintItems();
      });
    });
  }

  function renderPrintItems() {
    const el = container.querySelector('#itm-items');
    if (!printItems.length) {
      el.innerHTML = `<div class="empty-state" style="text-align:center;padding:24px">
        <div class="sbh-empty-ico">${icon('in-tem-ma-vach')}</div>
        <p style="font-weight:600;margin:0">Chưa có sản phẩm nào để in tem</p>
        <p class="hint" style="margin:4px 0 0">Tìm theo mã SKU hoặc tên sản phẩm ở trên để thêm vào danh sách in</p>
      </div>`;
      return;
    }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border,#e5e7eb)">
        <th style="text-align:left;padding:6px">Sản phẩm</th>
        <th style="width:120px;padding:6px">Số lượng tem</th>
        <th style="width:40px"></th>
      </tr></thead>
      <tbody>
        ${printItems.map((item, i) => `
        <tr style="border-bottom:1px solid var(--border,#f5f5f5)">
          <td style="padding:8px 6px">
            <div style="font-weight:500">${escapeHtml(item.product.name)}</div>
            <div style="font-size:12px;color:#888">${escapeHtml(item.product.code || '')} · ${formatVND(item.product.price)}</div>
          </td>
          <td style="padding:6px">
            <input type="number" min="1" max="99" value="${item.copies}" data-idx="${i}"
              class="itm-copies" style="width:80px;text-align:center" />
          </td>
          <td style="padding:6px">
            <button data-rm="${i}" style="color:#c00;background:none;border:none;cursor:pointer;font-size:18px">×</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;

    el.querySelectorAll('.itm-copies').forEach((inp) => {
      inp.addEventListener('change', () => {
        printItems[+inp.dataset.idx].copies = Math.max(1, parseInt(inp.value) || 1);
      });
    });
    el.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        printItems.splice(+btn.dataset.rm, 1);
        renderPrintItems();
      });
    });
  }

  // ── PDF export ───────────────────────────────────────────────────────────────
  container.querySelector('#itm-pdf').addEventListener('click', () => {
    if (!printItems.length) { toast('Thêm ít nhất 1 sản phẩm để in', 'error'); return; }
    const ids = printItems.map((i) => i.product.id).join(',');
    const copies = printItems.map((i) => i.copies).join(',');
    const params = new URLSearchParams({
      ids,
      copies,
      size: selectedSize.apiSize,
      price: '1',
    });
    window.open(`${getApiBase()}/api/mgr/stock/barcodes/print?${params}`, '_blank');
  });

  // ── Load products ────────────────────────────────────────────────────────────
  async function loadProducts() {
    try {
      const res = await api.get('/api/mgr/products?tab=tat-ca&limit=500');
      allProducts = res.items || [];
    } catch { /* không ảnh hưởng */ }
  }

  renderPaperList();
  renderSizeList();
  renderPrintItems();
  await loadProducts();
}
