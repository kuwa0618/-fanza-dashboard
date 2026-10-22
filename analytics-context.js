// Run before the Google tag. Internal checks must not count as customer visits/clicks.
(() => {
  const key = 'fanza-internal-test';
  const value = new URLSearchParams(window.location.search).get('internal_test');
  let internal = value === '1';
  try {
    if (value === '1') sessionStorage.setItem(key, '1');
    if (value === '0') sessionStorage.removeItem(key);
    internal = value === '1' || (value !== '0' && sessionStorage.getItem(key) === '1');
  } catch {}
  window.FanzaAnalytics = Object.freeze({ isInternal: internal });
  if (!internal) return;
  window['ga-disable-G-RK6R5HVKZC'] = true;
  document.addEventListener('DOMContentLoaded', () => {
    const note = document.createElement('p');
    note.setAttribute('role', 'status');
    note.textContent = '動作確認モード：このタブの閲覧・作品リンククリックを集計しません。';
    const exit = document.createElement('a');
    const url = new URL(window.location.href);
    url.searchParams.set('internal_test', '0');
    exit.href = url.href;
    exit.textContent = '通常の計測に戻す';
    note.append(' ', exit);
    note.style.cssText = 'padding:12px;margin:0;background:#fff4d7;color:#202735;text-align:center;font-size:14px';
    document.body.prepend(note);
  }, { once: true });
})();
