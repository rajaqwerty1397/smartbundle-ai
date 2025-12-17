/**
 * Alintro AI Upsell & Bundles - Widget v3.0
 * Reliable version - redirects to /cart after adding items
 * (Cart drawer can be added as enhancement later)
 */

(function() {
  'use strict';

  if (window.AlintroWidgetInitialized) return;
  window.AlintroWidgetInitialized = true;

  var config = window.AlintroConfig || {};
  var settings = {
    appUrl: config.appUrl || '',
    shopDomain: config.shopDomain || '',
    productId: config.productId || '',
    variantId: config.variantId || '',
    productTitle: config.productTitle || 'This Product',
    productPrice: config.productPrice || 0,
    currencySymbol: config.currencySymbol || '$',
  };

  var state = { bundle: null, selectedOption: 'bundle', productData: {} };

  function init() {
    console.log('Alintro: v3.0 (reliable)');
    if (!settings.productId || !settings.appUrl) return;
    
    fetch(settings.appUrl + '/api/bundles?productId=' + settings.productId + '&shop=' + settings.shopDomain, 
      { headers: { 'Accept': 'application/json', 'ngrok-skip-browser-warning': 'true' } })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function(data) {
      if (data.bundles?.length) {
        state.bundle = data.bundles[0];
        return fetch('/products.json?limit=250').then(function(r){return r.json();}).then(function(pd) {
          state.bundle.products.forEach(function(p) {
            var id = p.id?.match(/\/Product\/(\d+)/)?.[1];
            var f = pd.products.find(function(x){return x.id.toString()===id;});
            if (f) state.productData[p.id] = { image: f.images[0]?.src, variantId: f.variants[0]?.id };
          });
          hideOriginalButtons();
          renderWidget();
        });
      }
    })
    .catch(console.error);
  }

  function hideOriginalButtons() {
    var s = document.createElement('style');
    s.textContent = 'form[action*="/cart/add"] .product-form__buttons,form[action*="/cart/add"] .shopify-payment-button,product-form .product-form__buttons,product-form .shopify-payment-button{display:none!important}';
    document.head.appendChild(s);
  }

  function toCents(p) { p = parseFloat(p)||0; return p < 1000 ? Math.round(p*100) : p; }
  function formatMoney(c) { return settings.currencySymbol + (c/100).toFixed(2); }
  function esc(t) { var d=document.createElement('div'); d.textContent=t||''; return d.innerHTML; }

  function renderWidget() {
    var b = state.bundle, c = document.getElementById('alintro-container') || document.createElement('div');
    c.id = 'alintro-container';
    var form = document.querySelector('form[action*="/cart/add"]');
    if (form?.parentNode) form.parentNode.insertBefore(c, form);
    
    var cp = settings.productPrice, bt = b.products.reduce(function(s,p){return s+toCents(p.price);},0);
    var d = b.discountValue||10, sv = Math.round(bt*d/100), bp = bt-sv;

    var ph = b.products.map(function(p,i) {
      var pd = state.productData[p.id]||{}, img = pd.image ? pd.image.replace(/\.(jpg|jpeg|png|webp)/gi,'_100x100.$1') : '';
      var pr = toCents(p.price), dp = Math.round(pr*(1-d/100));
      return (i?'<span class="al-plus">+</span>':'') + '<div class="al-prod"><div class="al-img">'+(img?'<img src="'+img+'">':'')+'</div><div class="al-name">'+esc(p.title)+'</div><div class="al-prices"><span class="al-new">'+formatMoney(dp)+'</span><span class="al-old">'+formatMoney(pr)+'</span></div></div>';
    }).join('');

    c.innerHTML = '<style>#alintro-container{margin:1rem 0}.al-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px}.al-line{flex:1;height:1px;background:#ddd}.al-title{font-size:11px;font-weight:600;letter-spacing:1px;color:#666}.al-opts{display:flex;flex-direction:column;gap:8px}.al-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e5e5e5;border-radius:8px;cursor:pointer;background:#fff;position:relative}.al-opt:hover{border-color:#ccc}.al-opt.sel{border-color:#000;background:#fafafa}.al-radio{width:18px;height:18px;border:2px solid #ccc;border-radius:50%;display:flex;align-items:center;justify-content:center}.al-opt.sel .al-radio{border-color:#000;background:#000}.al-radio i{width:6px;height:6px;background:#fff;border-radius:50%;display:none}.al-opt.sel .al-radio i{display:block}.al-body{flex:1}.al-opt-title{font-weight:600;font-size:14px}.al-opt-sub{font-size:12px;color:#666}.al-green{color:#16a34a!important}.al-opt-price{font-weight:700}.al-opt-prices{text-align:right}.al-opt-old{font-size:12px;color:#999;text-decoration:line-through}.al-badge{position:absolute;top:-8px;right:12px;background:#000;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px}.al-prev{max-height:0;overflow:hidden;transition:max-height .3s;background:#fafafa;border:2px solid #000;border-top:0;border-radius:0 0 8px 8px;margin-top:-10px}.al-prev.show{max-height:300px;padding:16px;margin-bottom:6px}.al-prods{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}.al-prod{width:80px;text-align:center}.al-img{width:64px;height:64px;margin:0 auto;border-radius:8px;overflow:hidden;background:#fff;border:1px solid #eee}.al-img img{width:100%;height:100%;object-fit:cover}.al-name{font-size:10px;margin-top:6px;line-height:1.2;height:2.4em;overflow:hidden}.al-prices{font-size:10px;margin-top:2px}.al-new{font-weight:600}.al-old{color:#999;text-decoration:line-through;margin-left:3px}.al-plus{font-size:18px;color:#ccc}.al-btns{margin-top:12px;display:flex;flex-direction:column;gap:8px}.al-btn{width:100%;padding:14px;font-family:inherit;font-size:inherit;cursor:pointer;border-radius:0}.al-atc{background:#fff;color:#000;border:1px solid #000}.al-buy{background:#000;color:#fff;border:1px solid #000}.al-btn:disabled{opacity:.5}</style>' +
      '<div class="al-hdr"><span class="al-line"></span><span class="al-title">BUNDLE & SAVE</span><span class="al-line"></span></div>' +
      '<div class="al-opts">' +
        '<div class="al-opt'+(state.selectedOption==='single'?' sel':'')+'" data-opt="single"><div class="al-radio"><i></i></div><div class="al-body"><div class="al-opt-title">'+esc(settings.productTitle)+'</div><div class="al-opt-sub">Standard price</div></div><div class="al-opt-price">'+formatMoney(cp)+'</div></div>' +
        '<div class="al-opt'+(state.selectedOption==='bundle'?' sel':'')+'" data-opt="bundle"><span class="al-badge">SAVE '+d+'%</span><div class="al-radio"><i></i></div><div class="al-body"><div class="al-opt-title">Complete the bundle</div><div class="al-opt-sub al-green">Save '+formatMoney(sv)+'!</div></div><div class="al-opt-prices"><div class="al-opt-price">'+formatMoney(bp)+'</div><div class="al-opt-old">'+formatMoney(bt)+'</div></div></div>' +
        '<div class="al-prev'+(state.selectedOption==='bundle'?' show':'')+'"><div class="al-prods">'+ph+'</div></div>' +
      '</div>' +
      '<div class="al-btns"><button class="al-btn al-atc">Add to cart</button><button class="al-btn al-buy">Buy it now</button></div>';

    c.querySelectorAll('.al-opt').forEach(function(o) {
      o.onclick = function() {
        state.selectedOption = this.dataset.opt;
        c.querySelectorAll('.al-opt').forEach(function(x){x.classList.remove('sel');});
        this.classList.add('sel');
        c.querySelector('.al-prev').classList.toggle('show', state.selectedOption==='bundle');
      };
    });
    c.querySelector('.al-atc').onclick = function(){addToCart(this,false);};
    c.querySelector('.al-buy').onclick = function(){addToCart(this,true);};
  }

  function addToCart(btn, buyNow) {
    if (btn.disabled) return;
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Adding...';

    var items = [];
    if (state.selectedOption === 'single') {
      items.push({ id: parseInt(settings.variantId), quantity: 1 });
    } else {
      state.bundle.products.forEach(function(p) {
        var pd = state.productData[p.id];
        if (pd?.variantId) items.push({ id: parseInt(pd.variantId), quantity: 1 });
      });
    }

    console.log('Alintro: Adding', items.length, 'items');

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    })
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function() {
      console.log('Alintro: Items added');
      btn.textContent = 'Added! Redirecting...';
      
      var discountCode = state.selectedOption === 'bundle' ? state.bundle.discountCode : null;
      
      // Apply discount and redirect
      setTimeout(function() {
        if (buyNow) {
          window.location.href = discountCode ? '/discount/'+discountCode+'?redirect=/checkout' : '/checkout';
        } else {
          window.location.href = discountCode ? '/discount/'+discountCode+'?redirect=/cart' : '/cart';
        }
      }, 500);
    })
    .catch(function(e) {
      console.error('Alintro: Error', e);
      btn.textContent = 'Error';
      setTimeout(function() { btn.textContent = orig; btn.disabled = false; }, 2000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();