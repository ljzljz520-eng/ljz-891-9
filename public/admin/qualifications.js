let page = 1;
const pageSize = 20;
let rowCache = new Map();

function el(id) { return document.getElementById(id); }

async function load() {
  const tbody = el('tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="center muted">加载中…</td></tr>';
  try {
    const params = new URLSearchParams({
      page: String(page), page_size: String(pageSize),
      keyword: el('keyword').value.trim(),
      state: el('stateFilter').value,
    });
    const { data } = await API.get('/api/qualifications?' + params.toString());
    rowCache = new Map(data.list.map((r) => [r.id, r]));
    if (!data.list.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="center muted">暂无数据</td></tr>';
    } else {
      tbody.innerHTML = data.list.map((r) => `
        <tr>
          <td>${escapeHtml(r.dealer_name)}</td>
          <td>${escapeHtml(r.store_code)}</td>
          <td><b>${escapeHtml(r.brand)}</b></td>
          <td>${escapeHtml(r.region)}</td>
          <td>${escapeHtml(r.parent_agent || '—')}</td>
          <td class="muted" style="white-space:nowrap">${r.valid_from}<br>~ ${r.valid_until}</td>
          <td>${escapeHtml(r.opened_at || '—')}</td>
          <td><span class="badge badge-${r.state}">${stateLabel(r.state)}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-ghost" data-act="edit" data-id="${r.id}">编辑</button>
              <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">删除</button>
            </div>
          </td>
        </tr>`).join('');
    }
    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
    el('totalInfo').textContent = `共 ${data.total} 条`;
    el('pageInfo').textContent = `${page} / ${totalPages}`;
    el('prevBtn').disabled = page <= 1;
    el('nextBtn').disabled = page >= totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="center" style="color:var(--red)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function openModal(row) {
  el('modalTitle').textContent = row ? '编辑资质' : '新增资质';
  el('f_id').value = row ? row.id : '';
  for (const f of ['dealer_name', 'store_code', 'brand', 'region', 'parent_agent', 'valid_from', 'valid_until', 'opened_at']) {
    el('f_' + f).value = row ? (row[f] || '') : '';
  }
  el('f_status').value = row ? row.status : 'active';
  el('modalMask').classList.add('show');
}
function closeModal() { el('modalMask').classList.remove('show'); }

async function save() {
  const body = {
    dealer_name: el('f_dealer_name').value.trim(),
    store_code: el('f_store_code').value.trim(),
    brand: el('f_brand').value.trim(),
    region: el('f_region').value.trim(),
    parent_agent: el('f_parent_agent').value.trim(),
    valid_from: el('f_valid_from').value,
    valid_until: el('f_valid_until').value,
    opened_at: el('f_opened_at').value || '',
    status: el('f_status').value,
  };
  const id = el('f_id').value;
  el('saveBtn').disabled = true;
  try {
    if (id) await API.put('/api/qualifications/' + id, body);
    else await API.post('/api/qualifications', body);
    toast(id ? '已更新' : '已新增');
    closeModal();
    load();
  } catch (err) {
    toast(err.message);
  } finally {
    el('saveBtn').disabled = false;
  }
}

// 事件绑定（模板内容已被搬进 #adminMain，需在 DOMContentLoaded 后）
document.addEventListener('DOMContentLoaded', () => {
  el('searchBtn').addEventListener('click', () => { page = 1; load(); });
  el('resetBtn').addEventListener('click', () => { el('keyword').value = ''; el('stateFilter').value = ''; page = 1; load(); });
  el('keyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') { page = 1; load(); } });
  el('stateFilter').addEventListener('change', () => { page = 1; load(); });
  el('prevBtn').addEventListener('click', () => { page--; load(); });
  el('nextBtn').addEventListener('click', () => { page++; load(); });
  el('addBtn').addEventListener('click', () => openModal(null));
  el('cancelBtn').addEventListener('click', closeModal);
  el('saveBtn').addEventListener('click', save);
  el('modalMask').addEventListener('click', (e) => { if (e.target === el('modalMask')) closeModal(); });

  el('tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') {
      const row = rowCache.get(Number(id)) || rowCache.get(id);
      if (row) openModal(row);
      else toast('记录未找到，请刷新后重试');
    } else if (btn.dataset.act === 'del') {
      if (!confirm('确定删除该条授权资质？删除后客户将无法查询到它。')) return;
      try {
        await API.del('/api/qualifications/' + id);
        toast('已删除');
        load();
      } catch (err) { toast(err.message); }
    }
  });

  load();
});
