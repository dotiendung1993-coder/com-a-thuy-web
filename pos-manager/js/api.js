import { toast, showOfflineScreen } from './ui.js';

const LS_KEY = 'posmgr_api_base';
let apiBase = localStorage.getItem(LS_KEY) || null;

async function loadApiUrl(force = false) {
  if (apiBase && !force) return apiBase;
  const res = await fetch('./api-url.json', { cache: 'no-store' });
  const data = await res.json();
  apiBase = data.url;
  localStorage.setItem(LS_KEY, apiBase);
  return apiBase;
}

class ApiError extends Error {
  constructor(status, body) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch(path, opts = {}) {
  if (!apiBase) {
    try { await loadApiUrl(); } catch { /* offline screen bên dưới sẽ xử lý */ }
  }

  const doFetch = () => fetch(`${apiBase}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let res;
  try {
    res = await doFetch();
  } catch (networkErr) {
    // Tunnel có thể vừa đổi URL — đọc lại api-url.json rồi thử lại 1 lần.
    try {
      await loadApiUrl(true);
      res = await doFetch();
    } catch (err2) {
      showOfflineScreen(true);
      throw err2;
    }
  }
  showOfflineScreen(false);

  if (res.status === 401) {
    if (!location.hash.startsWith('#/dang-nhap')) location.hash = '#/dang-nhap';
    throw new ApiError(401, null);
  }
  if (res.status === 403) {
    toast('Bạn không có quyền thực hiện thao tác này', 'error');
    throw new ApiError(403, null);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export const api = {
  get: (path) => apiFetch(path, { method: 'GET' }),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
};

// T9 — views cần URL API trực tiếp (vd mở bill in ở tab mới bằng window.open, không qua apiFetch).
export function getApiBase() { return apiBase; }

export { ApiError, loadApiUrl };
