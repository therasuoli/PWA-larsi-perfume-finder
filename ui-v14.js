(() => {
  const root = document.documentElement;
  const button = document.getElementById('themeToggle');
  const saved = localStorage.getItem('pf_theme_v14');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  let theme = saved || (prefersLight ? 'light' : 'dark');
  function applyTheme(){
    root.dataset.theme = theme;
    if(button){button.textContent = theme === 'dark' ? '☼' : '☾';button.setAttribute('aria-label',theme === 'dark' ? 'فعال‌کردن حالت روز' : 'فعال‌کردن حالت شب');button.title=theme === 'dark' ? 'حالت روز' : 'حالت شب';}
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#0d1115':'#f4f6f3';
  }
  applyTheme();
  button?.addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';localStorage.setItem('pf_theme_v14',theme);applyTheme();});
})();
