function el(id) { return document.getElementById(id); }
let cache = [];

async function load() {
  try {
    const { data } = await API.get('/api/admins');
    cache = data;
    const me = ADMIN.user;
    el('tbody').innerHTML = data.map((a) => `
      <tr>
        <td>${a.id}</td>
        <td><b>${escapeHtml(a.username)}</b>${a.id === me.id ? ' <span class="muted">(当前账号)</span>' : ''}</td>
        <td>${escapeHtml(a.display_name)}</td>
        <td>${escapeHtml(a.email || '—')}</td>
        <td>${a.role === 'super_admin' ? '<span class="badge badge-valid">超级管理员</span>' : '<span class="badge badge-pending">管理员</span>'}</td>
        <td>${a.is_active ? '<span class="badge badge-valid">启用</span>' : '<span class="badge badge-revoked">停用</span>'}</td>
        <td class="muted">${a.created_at ? a.created_at.slice(0, 16) : ''}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm btn-ghost" data-act="edit" data-id="${a.id}">编辑</button>
            ${a.id === me.id ? '' : `<button class="btn btn-sm btn-danger" data-act="del" data-id="${a.id}">删除</button>`}
          </div>
        </td>
      </tr>`).join('');
  } catch (err) {
    toast(err.message);
  }
}

function collect() {
  return {
    username: el('f_username').value.trim(),
    display_name: el('f_display_name').value.trim(),
    email: el('f_email').value.trim(),
    role: el('f_role').value,
    is_active: el('f_is_active').value === '1',
    password: el('f_password').value,
  };
}

function openModal(row) {
  el('modalTitle').textContent = row ? '编辑管理员' : '新建管理员';
  el('f_id').value = row ? row.id : '';
  el('f_username').value = row ? row.username : '';
  el('f_display_name').value = row ? row.display_name : '';
  el('f_email').value = row ? (row.email || '') : '';
  el('f_role').value = row ? row.role : 'admin';
  el('f_is_active').value = row ? String(row.is_active) : '1';
  el('f_password').value = '';
  el('pwdLabel').innerHTML = row
    ? '新密码 <span class="hint">留空表示不修改；填写则重置为该密码（8-64 位）</span>'
    : '初始密码 * <span class="hint">8-64 位</span>';
  el('modalMask').classList.add('show');
}
function closeModal() { el('modalMask').classList.remove('show'); }

document.addEventListener('DOMContentLoaded', () => {
  // 非超级管理员直接访问时后端会 403；菜单里也没有入口
  el('addBtn').addEventListener('click', () => openModal(null));
  el('cancelBtn').addEventListener('click', closeModal);
  el('modalMask').addEventListener('click', (e) => { if (e.target === el('modalMask')) closeModal(); });

  el('saveBtn').addEventListener('click', async () => {
    const body = collect();
    const id = el('f_id').value;
    if (!id && !body.password) return toast('请填写初始密码');
    el('saveBtn').disabled = true;
    try {
      if (id) await API.put('/api/admins/' + id, body);
      else await API.post('/api/admins', body);
      toast('保存成功');
      closeModal();
      load();
    } catch (err) {
      toast(err.message);
    } finally {
      el('saveBtn').disabled = false;
    }
  });

  el('tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.act === 'edit') {
      openModal(cache.find((a) => a.id === id));
    } else if (btn.dataset.act === 'del') {
      if (!confirm('确定删除该管理员账号？此操作不可恢复。')) return;
      try {
        await API.del('/api/admins/' + id);
        toast('已删除');
        load();
      } catch (err) { toast(err.message); }
    }
  });

  load();
});
