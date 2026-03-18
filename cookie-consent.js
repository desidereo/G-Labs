(function(){
  if(localStorage.getItem('g_labs_cookie_consent'))return;

  var css=document.createElement('style');
  css.textContent=
    '#glCookieBanner{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#131722;border-top:1px solid #2a2e39;padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:.88rem;color:#ccc;box-shadow:0 -4px 20px rgba(0,0,0,.3)}'+
    '#glCookieBanner a{color:#2962ff;text-decoration:underline}'+
    '#glCookieBanner button{border:none;border-radius:6px;padding:8px 22px;font-weight:600;font-size:.85rem;cursor:pointer;transition:opacity .15s}'+
    '#glCookieAccept{background:#2962ff;color:#fff}#glCookieAccept:hover{opacity:.85}'+
    '#glCookieDecline{background:transparent;color:#999;border:1px solid #444}#glCookieDecline:hover{color:#fff;border-color:#888}'+
    '@media(max-width:600px){#glCookieBanner{flex-direction:column;text-align:center;gap:10px;padding:14px 16px}}';
  document.head.appendChild(css);

  var bar=document.createElement('div');
  bar.id='glCookieBanner';
  bar.innerHTML=
    '<span>We use cookies and Google Analytics to improve your experience. By continuing, you consent to our use of cookies. <a href="privacy.html">Privacy Policy</a></span>'+
    '<div style="display:flex;gap:8px;flex-shrink:0">'+
    '<button id="glCookieAccept">Accept</button>'+
    '<button id="glCookieDecline">Decline</button>'+
    '</div>';
  document.body.appendChild(bar);

  document.getElementById('glCookieAccept').addEventListener('click',function(){
    localStorage.setItem('g_labs_cookie_consent','accepted');
    bar.remove();
  });

  document.getElementById('glCookieDecline').addEventListener('click',function(){
    localStorage.setItem('g_labs_cookie_consent','declined');
    bar.remove();
    window['ga-disable-G-HC5C84CZPP']=true;
    if(window.gtag)gtag('consent','update',{analytics_storage:'denied'});
  });
})();
