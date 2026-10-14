// Server-rendered catalog: JavaScript only handles age confirmation and existing analytics.
(() => {
  const main = document.getElementById('mainContent');
  const gate = document.getElementById('ageGate');
  const enter = () => {
    try { localStorage.setItem('ageConfirmed', '1'); } catch {}
    gate.classList.add('hidden');
    main.inert = false;
  };
  document.getElementById('enterBtn').addEventListener('click', enter);
  document.getElementById('leaveBtn').addEventListener('click', () => { location.href = 'https://www.google.com/'; });
  try { if (localStorage.getItem('ageConfirmed') === '1') enter(); } catch {}
  const products = JSON.parse(document.getElementById('catalogProducts').textContent);
  const sources = {sale:'sale_page', vr:'vr_page', new:'new_page'};
  // A failed cover must not remove the card's title, prices or FANZA button.
  for (const image of document.querySelectorAll('.catalog-image')) {
    const hideUnavailable = () => { image.parentElement.hidden = true; };
    image.addEventListener('error', hideUnavailable, {once:true});
    // Handle an image that failed before this deferred script was loaded.
    if (image.complete && image.naturalWidth === 0) hideUnavailable();
  }
  for (const link of document.querySelectorAll('[data-product]')) {
    const activate = event => {
      if (main.inert || (event.type === 'auxclick' && event.button !== 1)) return;
      const product = products[Number(link.dataset.product)];
      if (!product?.id || !product.url) return;
      const payload = {content_id:product.id, title:product.title, actress:product.actresses.join(', '), maker:product.maker, genre:product.genres.join(', '), link_source:sources[document.body.dataset.catalog], link_type:link.dataset.linkType === 'image' ? 'image' : 'button'};
      // Navigation remains native and synchronous, including middle-click and modifier-click.
      try { fetch('/api/click', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), keepalive:true}).catch(() => {}); } catch {}
      try { if (typeof window.gtag === 'function') window.gtag('event','fanza_click',{...payload,link_url:product.url,transport_type:'beacon'}); } catch {}
      try {
        const history = JSON.parse(localStorage.getItem('viewHistory') || '[]');
        localStorage.setItem('viewHistory', JSON.stringify([product, ...history.filter(p => p.id !== product.id)].slice(0,50)));
        localStorage.setItem('relatedSourceProduct', JSON.stringify(product));
      } catch {}
    };
    link.addEventListener('click', activate);
    link.addEventListener('auxclick', activate);
  }
})();
