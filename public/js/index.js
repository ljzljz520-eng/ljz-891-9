(function () {
  const form = document.getElementById('queryForm');
  const alertBox = document.getElementById('alertBox');
  const result = document.getElementById('resultSection');
  const btn = document.getElementById('queryBtn');

  function showAlert(msg) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    result.style.display = 'none';

    const dealerName = document.getElementById('dealerName').value.trim();
    const storeCode = document.getElementById('storeCode').value.trim();
    if (!dealerName) return showAlert('请输入经销商名称');
    if (!storeCode) return showAlert('请输入门店编号');

    btn.disabled = true;
    btn.textContent = '查询中…';
    try {
      const qs = new URLSearchParams({ dealer_name: dealerName, store_code: storeCode });
      const resp = await API.get('/api/query?' + qs.toString());
      if (!resp.data) {
        result.style.display = 'block';
        result.innerHTML = `
          <div class="alert alert-info">
            <b>未查询到匹配的授权资质。</b><br>
            请确认经销商名称与门店编号是否正确；若信息无误仍无结果，可能该门店暂无有效授权，请联系上级代理核实。
          </div>`;
        return;
      }
      render(resp.data);
    } catch (err) {
      showAlert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 查询资质';
    }
  });

  function render(d) {
    const rows = d.authorizations.map((a) => `
      <tr>
        <td><b>${escapeHtml(a.brand)}</b></td>
        <td>${escapeHtml(a.region)}</td>
        <td>${escapeHtml(a.parent_agent)}</td>
        <td>${escapeHtml(a.valid_from)} 至 ${escapeHtml(a.valid_until)}</td>
        <td><span class="badge badge-${a.state}">${stateLabel(a.state)}</span></td>
      </tr>`).join('');

    const headBadge = d.overall_state === 'authorized'
      ? '<span class="badge badge-valid">存在有效授权</span>'
      : '<span class="badge badge-expired">授权均已失效</span>';

    result.style.display = 'block';
    result.innerHTML = `
      <div class="result-head">
        <h2>🏬 ${escapeHtml(d.dealer_name)}</h2>
        ${headBadge}
      </div>
      <div class="meta-grid">
        <div class="meta-item"><div class="k">门店编号</div><div class="v">${escapeHtml(d.store_code)}</div></div>
        <div class="meta-item"><div class="k">授权区域</div><div class="v">${escapeHtml(d.region)}</div></div>
        <div class="meta-item"><div class="k">门店开通时间</div><div class="v">${escapeHtml(d.opened_at)}</div></div>
        <div class="meta-item"><div class="k">授权品牌数</div><div class="v">${d.brands.length} 个</div></div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>授权品牌</th><th>授权区域</th><th>上级代理</th><th>有效期</th><th>状态</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted mt-2">状态说明：有效 = 当前日期在授权期内；未生效 = 授权尚未开始；已过期 = 授权已超过截止日期。</p>`;
  }
})();
