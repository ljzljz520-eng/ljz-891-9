/* 通用工具：API 请求、提示条、弹窗 */
window.API = {
  async request(method, url, body) {
    const opt = { method, headers: {} };
    if (body instanceof FormData) {
      opt.body = body;
    } else if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const token = localStorage.getItem('admin_token');
    if (token) opt.headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url, opt);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401) {
      if (location.pathname.startsWith('/admin/') && !location.pathname.endsWith('login.html')
          && !location.pathname.endsWith('reset.html')) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        location.href = '/admin/login.html';
      }
    }
    if (!res.ok || (data && data.code !== 0)) {
      const err = new Error((data && data.message) || `请求失败 (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};

window.escapeHtml = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
};

const STATE_LABEL = { valid: '有效', pending: '未生效', expiring: '即将到期', expired: '已过期', revoked: '已撤销' };
window.stateLabel = (s) => STATE_LABEL[s] || s;

window.toast = function (msg, ms = 2200) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
};

window.es = function (tag, attrs = {}, html = '') {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  if (html !== '') el.innerHTML = html;
  return el;
};
