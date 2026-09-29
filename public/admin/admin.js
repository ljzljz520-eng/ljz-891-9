/* 后台公共逻辑：鉴权 + 侧边栏渲染 */
(function () {
  const token = localStorage.getItem('admin_token');
  const userRaw = localStorage.getItem('admin_user');
  if (!token) location.replace('/admin/login.html');
  let user = null;
  try { user = userRaw ? JSON.parse(userRaw) : null; } catch (e) { /* */ }

  window.ADMIN = {
    get user() { return user; },
    get isSuper() { return user && user.role === 'super_admin'; },
    logout() {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      location.href = '/admin/login.html';
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    const shell = document.getElementById('adminShell');
    if (!shell || !user) return;
    const here = location.pathname.split('/').pop();
    const menu = [
      { href: 'index.html', icon: '📊', label: '概览' },
      { href: 'qualifications.html', icon: '📇', label: '资质管理' },
      { href: 'import.html', icon: '📥', label: 'CSV 导入' },
    ];
    if (user.role === 'super_admin') menu.push({ href: 'admins.html', icon: '👥', label: '管理员账号' });

    shell.innerHTML = `
      <aside class="sidebar">
        <div class="brand"><span class="logo">🏷️</span>资质管理后台</div>
        <nav>
          ${menu.map((m) => `<a href="${m.href}" class="${here === m.href ? 'active' : ''}">${m.icon} ${m.label}</a>`).join('')}
        </nav>
        <div class="userbox">
          <div class="name">${escapeHtml(user.name || user.username)}</div>
          <div class="muted">${user.role === 'super_admin' ? '超级管理员' : '管理员'}</div>
          <div class="mt-2"><a href="password.html">修改密码</a> · <a href="#" id="logoutLink">退出</a></div>
        </div>
      </aside>
      <main class="main" id="adminMain"></main>`;
    // 把原页面 .page-content 内容迁入 main
    const tpl = document.getElementById('pageContent');
    if (tpl) document.getElementById('adminMain').appendChild(tpl.content.cloneNode(true));
    document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); ADMIN.logout(); });
  });
})();
