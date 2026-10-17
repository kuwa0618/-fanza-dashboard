// Share only public search conditions and campaign tags from the displayed URL.
(() => {
  const button = document.getElementById('copyCatalogLink');
  const field = document.getElementById('catalogShareUrl');
  const status = document.getElementById('catalogShareStatus');
  const form = document.getElementById('catalogFilterForm');
  const current = new URL(location.href);
  const shared = new URL(current.pathname, current.origin);
  const keys = ['actress','genre','maker'];
  const campaigns = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  for (const key of [...keys, ...campaigns]) {
    const value = current.searchParams.get(key);
    if (value && value.length <= (keys.includes(key) ? 80 : 200)) shared.searchParams.set(key, value);
  }
  for (const key of campaigns) {
    const value = shared.searchParams.get(key);
    if (!value) continue;
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = key; input.value = value; form.appendChild(input);
  }
  field.value = shared.href;
  button.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shared.href);
      status.textContent = '表示中の条件のリンクをコピーしました。';
    } catch {
      field.hidden = false; field.focus(); field.select();
      status.textContent = '自動コピーできませんでした。選択されたURLをコピーしてください。';
    }
  });
})();
