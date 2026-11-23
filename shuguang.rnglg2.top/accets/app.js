/* 曙光 · 离线版。Preact + htm（UMD 全局），兼容 file:// 直接打开。 */
(function () {
  'use strict';
  const { h, render } = preact;
  const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = preactHooks;
  const html = htm.bind(h);

  // ---------------------------------------------------------------- 数据
  const IDX = window.SG_INDEX;
  const CATS = IDX.cats;
  const ITEMS = IDX.items.map((r, i) => {
    const p = IDX.paths[r[1]];
    return { i, id: r[0], cat: p[0], l1: p[1], l2: p[2], l3: p[3], name: r[2], grade: r[3], rank: r[4], pts: r[5], ptsN: r[6], req: r[7], src: r[8], len: r[9],
      nameL: r[2].toLowerCase(), srcL: (r[8] || '').toLowerCase(), reqL: (r[7] || '').toLowerCase(), idL: r[0].toLowerCase(), pathL: (p[1] + ' ' + p[2] + ' ' + p[3]).toLowerCase() };
  });
  const BY_ID = new Map(ITEMS.map((x) => [x.id, x]));
  const BY_NAME = new Map();
  for (const x of ITEMS) if (!BY_NAME.has(x.name)) BY_NAME.set(x.name, x);
  const CAT_ART = ['cat_tech', 'cat_magic', 'cat_support', 'cat_fun'];
  const CAT_EN = ['Technology', 'Arcana & Legend', 'Enhancement', 'Provisions'];
  const GRADES = ['D', '2D', 'C', '2C', 'B', '2B', 'A', '2A', 'S', '2S', 'SS', '2SS', 'SSS'];
  const RULES = window.SG_RULES;
  const META = window.SG_META;
  const PHOTOS = window.SG_PHOTOS || {};
  const artOf = (it) => (PHOTOS[it.name] ? ['assets/img/photo/' + PHOTOS[it.name].file, 50] : ['assets/img/' + CAT_ART[CATS.indexOf(it.cat)] + '.jpg', [15, 38, 62, 85][hash(it.name) % 4]]);

  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('无法加载 ' + src)); document.head.appendChild(s); });
    return loaded[src];
  }
  window.SG_DESC = window.SG_DESC || [];
  const descReady = [false, false, false, false];
  function applyDesc() {
    for (const part of window.SG_DESC) {
      if (part.applied || part.v !== IDX.v) continue;
      part.d.forEach((d, k) => { const it = ITEMS[part.start + k]; it.desc = d; it.descL = d.toLowerCase(); });
      for (const [id, a] of Object.entries(part.a || {})) { const it = BY_ID.get(id); if (it) it.attr = a; }
      part.applied = true; descReady[part.cat] = true;
    }
  }
  // 正文按位置对到索引上。页面开着时网站更新了（或拿到了缓存的旧索引），新正文套到旧索引上会整体错位，所以版本不同就不套，刷新一次拿新索引
  function staleReload() {
    let tried = false;
    try { tried = sessionStorage.getItem('sg-stale') === String(IDX.v); sessionStorage.setItem('sg-stale', String(IDX.v)); } catch (e) {}
    if (!tried) location.reload();
    return Promise.reject(new Error('网站数据已更新，请刷新页面'));
  }
  const DESC_Q = /^https?:/.test(location.protocol) && IDX.v ? '?v=' + IDX.v : '';
  function loadDesc(cat) {
    if (descReady[cat]) return Promise.resolve();
    return loadScript('data/desc-' + cat + '.js' + DESC_Q).then(() => { applyDesc(); if (!descReady[cat]) return staleReload(); });
  }
  function loadAllDesc() { return Promise.all([0, 1, 2, 3].map(loadDesc)); }

  // 字体按 unicode-range 切片（fonts.py），只有页面上出现的字才会下载对应切片。
  // 打印、导出、离屏量卡面时字还没上屏，要先按这段文字把各字体用到的切片载好，否则会缺字或量错尺寸。
  const FONT_SPECS = ['400 16px Song', '600 16px Song', '900 16px Song', '400 16px Kai', '600 16px Garamond', 'italic 600 16px Garamond', '500 16px Mono'];
  function loadFonts(text) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    // 控制字符、BOM、U+FFF0–FFFF 不会显示，留着会白白触发下载生僻字切片（export.js 源码里就有 U+FFFE/FFFF）
    const t = [...new Set(String(text || '').replace(/[\u0000-\u001f\u007f\ufeff\ufff0-\uffff]/g, ''))].join('') || ' ';
    return Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, t).catch(() => {}))).then(() => {});
  }
  window.SG_FONTS = { load: loadFonts };

  // ---------------------------------------------------------------- 工具
  const num = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US'));
  // 多档价格／等级（500/1200/1500、2B/A/A/2A）只在斜杠后断行，避免撑破格子
  const slashWrap = (s) => String(s).split('/').map((p, k, a) => (k < a.length - 1 ? html`${p}/<wbr />` : p));
  // 价格下的小字：真单位（/立方厘米）照写；多档价格（/1200/1500…）写「起」；没有单位写「奖励点」
  const ptsUnit = (pts) => { const rest = String(pts || '').split('\n')[0].replace(/^\d+/, ''); return !rest ? '奖励点' : /^\/\s*\d/.test(rest) ? '起' : rest; };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; /* 隐私模式、存储已满 */ } },
  };
  const firstGrade = (g) => (g || '').split(/[\/／]/)[0].replace(/权限.*/, '');
  function sealCls(g) { return g.length >= 3 ? 'l3' : g.length === 2 ? 'l2' : ''; }
  function Seal({ g, big }) {
    g = firstGrade(g);
    if (!g || g === '无支线' || g === '仅介绍') return html`<span class=${'seal-s none' + (big ? ' big' : '') + (g === '仅介绍' ? ' intro' : '')} title=${g === '仅介绍' ? '仅介绍，不可兑换' : '无需支线剧情'}>${g === '仅介绍' ? '介' : '无'}</span>`;
    return html`<span class=${'seal-s ' + sealCls(g) + (big ? ' big' : '')} title=${'支线等级 ' + g}>${g}</span>`;
  }
  let toastTimer;
  function toast(msg) {
    // 宣传片里的通知卡：白底、墨黑竖条、蓝色硬投影，抬头一行等宽字
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.innerHTML = '<b>SYSTEM　·　主神</b><span></span>'; document.body.appendChild(el); }
    el.querySelector('span').textContent = msg; el.classList.remove('out', 'in'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); }, 2200);
  }
  function hl(text, terms) {
    if (!terms || !terms.length || !text) return text;
    const re = new RegExp('(' + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    const parts = String(text).split(re);
    return parts.map((p, i) => (i % 2 ? html`<mark>${p}</mark>` : p));
  }
  function stripSource(d) { return (d || '').replace(/^(出自|来自|源自)[^，,。\n]{0,40}[，,]\s*/, ''); }
  function cardFit(t) {
    for (const f of [7.6, 7.0, 6.6, 6.15]) {
      const mm = f * 0.3528, cpl = 54.6 / mm, lines = Math.floor(41 / (mm * 1.5));
      if (t.length <= cpl * lines * 0.86 || f === 6.15) return `font-size:${f}pt;-webkit-line-clamp:${lines}`;
    }
  }
  function cardText(it, max = 270) {
    let d = stripSource(it.desc || '').replace(/\n+/g, ' ');
    if (!d) return it.src ? '出自《' + it.src + '》。' : '';
    if (d.length > max) { const cut = d.lastIndexOf('。', max); d = d.slice(0, cut > max * 0.55 ? cut + 1 : max) + (cut > max * 0.55 ? '' : '……'); }
    return d;
  }
  function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }

  // ---------------------------------------------------------------- 通用组件
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    check: '<path d="M5.5 12.5l4.2 4.2 8.8-9.2"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.9 12.2h8.6L17.2 7M10.2 10.5v5.5M13.8 10.5v5.5"/>',
    print: '<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="7.5" rx="1.5"/><path d="M7.5 13.5h9v6h-9z"/>',
    down: '<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
    up: '<path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M5 19.5h14"/>',
    dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.2"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    cards: '<rect x="7.5" y="4" width="12" height="16" rx="2"/><path d="M4.5 7.5v10.5a2 2 0 0 0 2 2h8"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
    moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
    auto: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
    reset: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/>',
    open: '<path d="M13.5 4.5h6v6M19.5 4.5l-8 8M10.5 6.5h-5v12h12v-5"/>',
    edit: '<path d="M14.5 5l4.5 4.5L9.5 19H5v-4.5z"/><path d="M12.5 7l4.5 4.5"/>',
  };
  const Icon = ({ n, cls = '' }) => html`<svg class=${'ic ' + cls} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] }}></svg>`;
  const iconHTML = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const Chevron = () => html`<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function Select({ value, options, onChange, label, className = '', style = '', display }) {
    const [open, setOpen] = useState(false);
    const [up, setUp] = useState(false);
    const [hi, setHi] = useState(0);
    const ref = useRef();
    const k = options.findIndex((o) => String(o[0]) === String(value));
    const cur = options[k] || options[0];
    useEffect(() => {
      if (!open) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f);
    }, [open]);
    useLayoutEffect(() => {
      if (!open || !ref.current) return;
      const el = ref.current.querySelector('.sel-opt.hi');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [open, hi]);
    const toggle = () => {
      if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setUp(r.bottom + 330 > innerHeight && r.top > 330); setHi(Math.max(0, k)); }
      setOpen(!open);
    };
    const pick = (o) => { setOpen(false); if (String(o[0]) !== String(value)) onChange(o[0]); ref.current && ref.current.querySelector('.sel-btn').focus(); };
    const onKey = (e) => {
      if (!open) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
      else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
      else if (e.key === 'End') { e.preventDefault(); setHi(options.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[hi]); }
      else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'Tab') setOpen(false);
    };
    return html`<div class=${'sel ' + className + (open ? ' open' : '') + (up ? ' up' : '')} ref=${ref} style=${style}>
      <button type="button" class="sel-btn" aria-haspopup="listbox" aria-expanded=${open} aria-label=${label} onClick=${toggle} onKeyDown=${onKey}><span>${cur ? (display ? display(cur[0]) : cur[1]) : ''}</span><${Chevron} /></button>
      ${open ? html`<ul class="sel-pop" role="listbox" aria-label=${label}>${options.map((o, i) => html`<li role="option" aria-selected=${i === k} class=${'sel-opt' + (i === hi ? ' hi' : '') + (o[2] ? ' grp' : '')} onPointerEnter=${() => setHi(i)} onClick=${() => pick(o)}>${o[1]}</li>`)}</ul>` : null}
    </div>`;
  }
  function askConfirm(msg, okText = '确定') {
    return new Promise((res) => {
      const d = document.createElement('dialog');
      d.className = 'sg-dialog';
      // 宣传片的「主神」弹窗：白色抬头条 + 黑底粗白框 + 错开的蓝色硬投影
      d.innerHTML = `<div class="dlg-bar"><span>SYSTEM　·　主神</span><button class="dlg-x" value="no" aria-label="关闭">${iconHTML('x')}</button></div><p>${esc(msg)}</p><div class="dlg-btns"><button class="btn" value="no">取消<i>NO</i></button><button class="btn primary" value="yes">${esc(okText)}<i>YES</i></button></div>`;
      document.body.appendChild(d);
      d.querySelectorAll('button').forEach((b) => { b.onclick = () => d.close(b.value); });
      d.addEventListener('close', () => { res(d.returnValue === 'yes'); setTimeout(() => d.remove(), 200); });
      d.addEventListener('click', (e) => { if (e.target === d) d.close('no'); });
      d.showModal();
      d.querySelector('.btn.primary').focus();
    });
  }

  // 弹窗：<dialog> 进顶层（盖住导航，Esc 关闭，关掉后焦点回到原处）。进场、退场都用类名驱动的关键帧：
  // Safari 和 QQ 内置浏览器不支持 overlay／allow-discrete 过渡，所以关闭时先播完退场动画再真正 close()
  let openModals = 0;
  function Modal({ open, onDismiss, label, cls = '', bodyKey, foot, children, suspended = false }) {
    const ref = useRef();
    const [shown, setShown] = useState(open);
    const tok = useRef(0);
    const origin = useRef(null);
    const dismiss = useRef(onDismiss);
    dismiss.current = onDismiss;
    const isSuspended = useRef(suspended); isSuspended.current = suspended;
    useLayoutEffect(() => {
      const d = ref.current;
      if (suspended) { if (d?.open) d.close(); return; }
      if (open) {
        tok.current++;
        if (!shown) { setShown(true); return; }
        if (d) { d.classList.remove('closing'); if (!d.open) { origin.current = { el: document.activeElement, y: scrollY }; d.showModal(); window.scrollTo(0, origin.current.y); } }
        return;
      }
      if (!shown || !d) return;
      const my = ++tok.current;
      const fin = () => { if (tok.current !== my) return; tok.current++; const y = scrollY; if (d.open) d.close(); setShown(false); if (origin.current?.el?.isConnected && !origin.current.el.closest('[hidden]')) origin.current.el.focus({ preventScroll: true }); window.scrollTo(0, y); };
      d.classList.add('closing');
      if (REDUCED) fin();
      else { d.addEventListener('animationend', (e) => { if (e.target === d) fin(); }); setTimeout(fin, 420); }
    }, [open, shown, suspended]);
    useLayoutEffect(() => {
      if (!shown || suspended) return;
      const d = ref.current;
      openModals++; document.documentElement.classList.add('modal-open');
      const onCancel = (e) => { e.preventDefault(); dismiss.current && dismiss.current(); };
      const onClose = () => { if (!isSuspended.current) dismiss.current && dismiss.current(); };
      d.addEventListener('cancel', onCancel); d.addEventListener('close', onClose);
      return () => {
        d.removeEventListener('cancel', onCancel); d.removeEventListener('close', onClose);
        if (--openModals <= 0) { openModals = 0; document.documentElement.classList.remove('modal-open'); }
      };
    }, [shown, suspended]);
    if (!shown) return null;
    return html`<dialog class=${'x-dlg ' + cls} ref=${ref} aria-label=${label} onClick=${(e) => { if (e.target === ref.current) dismiss.current(); }}>
      <div class="dlg-bar"><span>${label}</span><button class="dlg-x" aria-label="关闭" onClick=${() => dismiss.current()}><${Icon} n="x" /></button></div>
      <div class="x-body" key=${bodyKey}>${children}</div>
      ${foot ? html`<div class="x-foot">${foot}</div>` : null}
    </dialog>`;
  }

  // ---------------------------------------------------------------- 路由
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    return { parts: path.split('/').filter(Boolean), q };
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let routeNow = parseHash();
  const scrollMemory = new Map();
  const scrollPanes = '[data-scroll], .vlist, .sheet-preview, .reader aside, .filters, .sys-list, .realm-scroll, .dyn-wrap';
  const routeKey = (r) => r.parts.join('/') + (r.q.s ? '?s=' + r.q.s : '') + (r.q.anchor ? '@' + r.q.anchor : '');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function useRoute() {
    const [r, setR] = useState(routeNow);
    useEffect(() => {
      let jump = false;
      const onLink = (e) => { const href = e.target.closest('a')?.getAttribute('href') || ''; jump = href.startsWith('#/rules/') && href.includes('anchor='); };
      const f = () => {
        const page = document.querySelector('.page:not([hidden])');
        scrollMemory.set(routeKey(routeNow), { y: scrollY, panes: page ? [...page.querySelectorAll(scrollPanes)].map((el) => [el.scrollLeft, el.scrollTop]) : [] });
        routeNow = { ...parseHash(), jump }; jump = false; setR(routeNow);
      };
      addEventListener('hashchange', f); document.addEventListener('click', onLink, true);
      return () => { removeEventListener('hashchange', f); document.removeEventListener('click', onLink, true); };
    }, []);
    useLayoutEffect(() => {
      const saved = scrollMemory.get(routeKey(r));
      const page = document.querySelector('.page:not([hidden])');
      if (saved && page) page.querySelectorAll(scrollPanes).forEach((el, i) => { el.scrollLeft = saved.panes[i]?.[0] || 0; el.scrollTop = saved.panes[i]?.[1] || 0; });
      const anchor = r.parts[0] === 'rules' && r.q.anchor && document.getElementById(r.q.anchor);
      if (anchor && (!saved || r.jump)) anchor.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, saved ? saved.y : 0);
    }, [r]);
    return r;
  }
  function go(path) { location.hash = path; }
  function replaceQuery(base, q) {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString();
    const url = '#' + base + (s ? '?' + s : '');
    if (location.hash !== url) history.replaceState(null, '', url);
  }

  // ---------------------------------------------------------------- 外壳
  const NAV = [['rules', '规则'], ['catalog', '图鉴'], ['systems', '体系'], ['sheet', '人物卡'], ['cards', '卡牌'], ['log', '更新']];
  function Rail({ at }) {
    const navRef = useRef();
    const [ind, setInd] = useState(null);
    useLayoutEffect(() => {
      const place = () => {
        const a = navRef.current && navRef.current.querySelector('a[aria-current="page"]');
        if (!a) { setInd(null); return; }
        setInd({ x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight });
      };
      place(); addEventListener('resize', place); return () => removeEventListener('resize', place);
    }, [at]);
    return html`<header class="rail">
      <a class="orb" href="#/" aria-label="首页"></a>
      <nav aria-label="主导航" ref=${navRef}>${NAV.map(([k, t]) => html`<a href=${'#/' + k} aria-current=${at === k ? 'page' : null}>${t}</a>`)}
        <span class="ind" aria-hidden="true" style=${ind ? `--x:${ind.x}px;--y:${ind.y}px;--w:${ind.w}px;--h:${ind.h}px;opacity:1` : 'opacity:0'}></span></nav>
      <span class="rail-tag" aria-hidden="true">SHUGUANG · INFINITE TRPG</span>
    </header>`;
  }

  function App() {
    const r = useRoute();
    const at = r.parts[0] || '';
    useEffect(() => {
      const f = (e) => {
        if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); if (at !== 'catalog') go('/catalog'); setTimeout(() => document.getElementById('cat-search')?.focus(), 30); }
      };
      addEventListener('keydown', f); return () => removeEventListener('keydown', f);
    }, [at]);
    // Keep visited page state (including virtual-list measurements and inline expansion).
    // Only the active page participates in layout; route memory restores all scroll containers.
    const pages = useRef(new Map());
    pages.current.set(at, r);
    const pageFor = (key, saved) => {
      const active = key === at;
      if (key === 'rules') return html`<${Rules} id=${saved.parts[1]} />`;
      if (key === 'catalog') return html`<${Catalog} q=${saved.q} active=${active} />`;
      if (key === 'systems') return html`<${Systems} tab=${saved.parts[1] || 'realm'} q=${saved.q} />`;
      if (key === 'sheet') return html`<${Sheet} q=${saved.q} active=${active} />`;
      if (key === 'cards') return html`<${Cards} active=${active} />`;
      if (key === 'log') return html`<${Log} />`;
      return html`<${Home} />`;
    };
    return html`<div class="app"><${Rail} at=${at} /><main class="main" id="main">${[...pages.current].map(([key, saved]) => html`<div class="page" key=${key} hidden=${key !== at}>${pageFor(key, saved)}</div>`)}</main></div>`;
  }

  // ---------------------------------------------------------------- 首页
  function Home() {
    const [q, setQ] = useState('');
    const counts = CATS.map((c) => ITEMS.filter((x) => x.cat === c).length);
    const parts = [];
    for (const c of RULES.chunks) {
      if (c.kind === 'part') parts.push({ ...c, chapters: [] });
      else if (c.kind === 'chapter' && parts.length) parts[parts.length - 1].chapters.push(c);
    }
    const blurb = ['枪炮、战衣、机甲、载具与自律机械。', '神兵、法器、饰品、储物空间与奇物阵图。', '血统、改造、职业、能量循环、功法与技能。', '主神功能、天材地宝、药物与各类材料。'];
    const title = (n, t, en) => html`<h2><b>${n}</b>${t}<span>${en}</span></h2>`;
    return html`<div>
      <section class="hero">
        <div class="hero-art"><img src="assets/img/hero.jpg" alt="巨大的白色光球悬在破碎的城市上空，一个女孩仰头看着它" /></div>
        <div class="hero-title">
          <h1 aria-label="曙光">${[...'曙光'].map((ch, i) => html`<span style=${'--i:' + i} aria-hidden="true">${ch}</span>`)}</h1>
          <div class="sub">无限流跑团规则书</div>
          <div class="en">Dawn · An Infinite-Flow Tabletop Roleplaying Game</div>
        </div>
        <div class="hero-pop">
          <div class="pop-bar"><span>SYSTEM　·　主神</span><span aria-hidden="true">×</span></div>
          <div class="pop-body">
            <div class="q">三十秒内进入光柱。</div>
            <div class="qe">Transfer target locked. Thirty seconds.</div>
            <form class="hero-search" onSubmit=${(e) => { e.preventDefault(); go('/catalog' + (q ? '?q=' + encodeURIComponent(q) : '')); }}>
              <label class="sr" for="hero-q">搜索兑换表</label>
              <input id="hero-q" type="search" placeholder=${'搜索 ' + num(ITEMS.length) + ' 条兑换'} value=${q} onInput=${(e) => setQ(e.target.value)} autocomplete="off" />
              <kbd>/</kbd>
            </form>
            <div class="cats">${CATS.map((c, i) => html`<a href=${'#/catalog?sel=' + encodeURIComponent(c)}><span>${short(c)}</span><b>${num(counts[i])}</b></a>`)}</div>
          </div>
        </div>
      </section>
      <section class="home-sec">${title('01', '规则', 'Rules')}
        <div class="toc-grid">${parts.map((p) => html`<div class="toc-part"><a href=${'#/rules/' + p.id}><b>${p.num}</b><span>${p.title}</span></a>
          <ol>${p.chapters.map((c) => html`<li><a href=${'#/rules/' + c.id}><i>${c.num}</i><span>${c.title}</span></a></li>`)}</ol></div>`)}</div>
      </section>
      <section class="home-sec">${title('02', '兑换', 'The Exchange')}
        <div class="cat-plates">${CATS.map((c, i) => html`<a class="cat-plate" href=${'#/catalog?sel=' + encodeURIComponent(c)}><span class="img"><img src=${'assets/img/' + CAT_ART[i] + '.jpg'} alt="" loading="lazy" /></span>
          <div class="t"><span>${c}</span><b>${num(counts[i])}</b></div><p>${blurb[i]}</p></a>`)}</div>
      </section>
      <section class="home-sec">${title('03', '工具', 'Tools')}
        <div class="home-tools">
          <a href="#/sheet"><i>TOOL · 01</i><b>人物卡</b><span>掷骰、填写、保存，打印成规则书同款版式</span></a>
          <a href="#/cards"><i>TOOL · 02</i><b>卡牌工坊</b><span>把兑换条目排成 63 × 88 毫米卡片，每页九张</span></a>
          <a href="#/systems"><i>TOOL · 03</i><b>境界对照</b><span>三十余种体系对齐到同一把战力标尺</span></a>
        </div>
      </section>
      <div class="colophon">${META.sync ? `兑换数据每 15 分钟同步自腾讯文档「曙光表」在线版，最近一次同步：${META.sync.synced}。` : '数据整理自曙光表。'}更新记录至第 ${META.lastNo} 号（${META.lastDate}）。插图为原创绘制，网页中统一处理成黑、蓝、白三色。
        <details><summary>器物照片来源</summary><ul>${Object.entries(PHOTOS).map(([k, v]) => html`<li>${k}：${v.author || '佚名'}，${v.license}，<a href=${v.source} target="_blank" rel="noopener">Wikimedia Commons</a></li>`)}</ul></details></div>
    </div>`;
  }

  // ---------------------------------------------------------------- 规则阅读
  function Rules({ id }) {
    const chunks = RULES.chunks;
    const idx = Math.max(0, chunks.findIndex((c) => c.id === id));
    const cur = chunks[idx];
    const ref = useRef();
    useLayoutEffect(() => { if (ref.current) { fitStdCards(ref.current); pinAnatomy(ref.current); } }, [id]);
    const toc = [];
    for (const c of chunks) {
      if (c.kind === 'part') toc.push(html`<a class="grp" href=${'#/rules/' + c.id}><b>${c.num}</b>${c.title}</a>`);
      else toc.push(html`<a class="ch" href=${'#/rules/' + c.id} aria-current=${c.id === cur.id ? 'page' : null}><i>${c.num || ''}</i><span>${c.title}</span></a>`);
    }
    const prev = chunks[idx - 1], next = chunks[idx + 1];
    return html`<div class="reader">
      <aside aria-label="规则目录"><div class="side-head"><i>01 · RULEBOOK</i><b>规则书</b></div>${toc}</aside>
      <div>
        <div class="reader-mtoc"><${Select} label="章节" value=${cur.id} onChange=${(v) => go('/rules/' + v)} options=${chunks.map((c) => [c.id, c.kind === 'part' ? '第' + c.num + '篇　' + c.title : (c.num ? c.num + '　' : '') + c.title, c.kind === 'part'])} /></div>
        <article key=${cur.id}>
          <div class="rules" ref=${ref} dangerouslySetInnerHTML=${{ __html: cur.html }}></div>
          <nav class="pager" aria-label="翻页">
            ${prev ? html`<a href=${'#/rules/' + prev.id}><span>上一节</span><b>${prev.title}</b></a>` : html`<span></span>`}
            ${next ? html`<a href=${'#/rules/' + next.id}><span>下一节</span><b>${next.title}</b></a>` : null}
          </nav>
        </article>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- 兑换图鉴
  const SORTS = { def: '表内顺序', gradeA: '支线等级 低→高', gradeD: '支线等级 高→低', ptsA: '奖励点 低→高', ptsD: '奖励点 高→低', name: '名称' };
  function useDebounced(v, ms) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }

  function buildTree(list) {
    const root = new Map();
    for (const x of list) {
      let c = root.get(x.cat); if (!c) root.set(x.cat, c = { n: 0, kids: new Map() }); c.n++;
      if (!x.l1) continue;
      let a = c.kids.get(x.l1); if (!a) c.kids.set(x.l1, a = { n: 0, kids: new Map() }); a.n++;
      if (!x.l2) continue;
      let b = a.kids.get(x.l2); if (!b) a.kids.set(x.l2, b = { n: 0, kids: new Map() }); b.n++;
      if (!x.l3) continue;
      let d = b.kids.get(x.l3); if (!d) b.kids.set(x.l3, d = { n: 0, kids: new Map() }); d.n++;
    }
    return root;
  }
  const short = (s) => s.replace(/（.*?）|\(.*?\)/g, '');

  function matchItem(x, terms, full) {
    let score = 0;
    for (const t of terms) {
      let s = 0;
      if (x.nameL === t) s = 100; else if (x.idL === t) s = 95; else if (x.nameL.startsWith(t)) s = 60; else if (x.nameL.includes(t)) s = 40;
      else if (x.srcL.includes(t)) s = 16; else if (x.pathL.includes(t)) s = 10; else if (x.reqL.includes(t)) s = 8;
      else if (full && x.descL && x.descL.includes(t)) s = 3;
      if (!s) return 0;
      score += s;
    }
    return score;
  }
  function snippet(x, terms) {
    if (!x.descL || !terms.length) return null;
    for (const t of terms) {
      const p = x.descL.indexOf(t);
      if (p >= 0 && !x.nameL.includes(t)) { const a = Math.max(0, p - 18); return (a ? '…' : '') + x.desc.slice(a, p + 40).replace(/\n/g, ' '); }
    }
    return null;
  }

  function Catalog({ q: rq, active }) {
    const [query, setQuery] = useState(rq.q || '');
    const [sel, setSel] = useState(rq.sel || '');
    const [grades, setGrades] = useState(new Set((rq.g || '').split(',').filter(Boolean)));
    const [pmin, setPmin] = useState(rq.min || '');
    const [pmax, setPmax] = useState(rq.max || '');
    const [hideIntro, setHideIntro] = useState(rq.hide === '1');
    const [noReq, setNoReq] = useState(rq.noreq === '1');
    const [full, setFull] = useState(rq.full === '1');
    const [sort, setSort] = useState(rq.sort || 'def');
    const [cur, setCur] = useState(rq.id || '');
    const [descTick, setDescTick] = useState(0);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [expansion, setExpansion] = useState(() => ({ all: store.get('sg.catalog.expandAll', false) === true, exceptions: new Set() }));
    const [inlineReady, setInlineReady] = useState(() => !expansion.all || descReady.every(Boolean));
    useEffect(() => { if (!inlineReady) loadAllDesc().then(() => setInlineReady(true)).catch((e) => { setInlineReady(true); toast(e.message); }); }, [inlineReady]);
    useEffect(() => {
      if (!expansion.all || !inlineReady) return;
      // 先完成当前窗口的 200ms 展开，再预取其余大类，避免正文脚本解析阻塞动画。
      const timer = setTimeout(() => loadAllDesc().catch((e) => toast(e.message)), 300);
      return () => clearTimeout(timer);
    }, [expansion.all, inlineReady]);
    const setAll = (all) => { store.set('sg.catalog.expandAll', all); setExpansion({ all, exceptions: new Set(), bulk: true }); };
    const toggleInline = (id) => setExpansion((v) => { const exceptions = new Set(v.exceptions); exceptions.has(id) ? exceptions.delete(id) : exceptions.add(id); return { ...v, exceptions, bulk: false }; });
    const [queue, setQueue] = useState(store.get('sg.cards', []));
    useEffect(() => { if (active) setQueue(store.get('sg.cards', [])); }, [active]);
    const dq = useDebounced(query, 140);

    useEffect(() => { if (rq.id && rq.id !== cur) setCur(rq.id); if (rq.q != null && rq.q !== query) setQuery(rq.q); if (rq.sel != null && rq.sel !== sel) setSel(rq.sel); }, [rq.id, rq.q, rq.sel]);
    useEffect(() => { if (full) loadAllDesc().then(() => setDescTick((t) => t + 1)).catch((e) => toast(e.message)); }, [full]);
    useEffect(() => { if (!active) return; replaceQuery('/catalog', { q: dq, sel, g: [...grades].join(','), min: pmin, max: pmax, hide: hideIntro ? 1 : '', noreq: noReq ? 1 : '', full: full ? 1 : '', sort: sort === 'def' ? '' : sort, id: cur }); }, [dq, sel, grades, pmin, pmax, hideIntro, noReq, full, sort, cur, active]);
    useEffect(() => { store.set('sg.cards', queue); }, [queue]);

    const terms = useMemo(() => dq.trim().toLowerCase().split(/\s+/).filter(Boolean).map((t) => t.replace(/^([科魔辅娱])\s*0*(\d+)$/, '$1$2')), [dq]);
    const base = useMemo(() => {
      const lo = pmin === '' ? -Infinity : +pmin, hi = pmax === '' ? Infinity : +pmax;
      const out = [];
      for (const x of ITEMS) {
        if (grades.size) { const g = firstGrade(x.grade) || '无支线'; if (!grades.has(GRADES.includes(g) ? g : g === '无支线' || !x.grade ? '无支线' : '其他')) continue; }
        if (pmin !== '' || pmax !== '') { if (x.ptsN == null || x.ptsN < lo || x.ptsN > hi) continue; }
        if (hideIntro && /仅介绍|待调整/.test(x.req + x.grade)) continue;
        if (noReq && x.req) continue;
        let s = 1;
        if (terms.length) { s = matchItem(x, terms, full); if (!s) continue; }
        out.push([x, s]);
      }
      return out;
    }, [terms, grades, pmin, pmax, hideIntro, noReq, full, descTick]);
    const tree = useMemo(() => buildTree(base.map((r) => r[0])), [base]);
    const list = useMemo(() => {
      const path = sel ? sel.split('|') : [];
      let l = base.filter(([x]) => (!path[0] || x.cat === path[0]) && (!path[1] || x.l1 === path[1]) && (!path[2] || x.l2 === path[2]) && (!path[3] || x.l3 === path[3]));
      const cmp = {
        def: (a, b) => (terms.length ? b[1] - a[1] : 0) || a[0].i - b[0].i,
        gradeA: (a, b) => (a[0].rank - b[0].rank) || ((a[0].ptsN ?? 0) - (b[0].ptsN ?? 0)),
        gradeD: (a, b) => (b[0].rank - a[0].rank) || ((b[0].ptsN ?? 0) - (a[0].ptsN ?? 0)),
        ptsA: (a, b) => (a[0].ptsN ?? Infinity) - (b[0].ptsN ?? Infinity),
        ptsD: (a, b) => (b[0].ptsN ?? -1) - (a[0].ptsN ?? -1),
        name: (a, b) => a[0].name.localeCompare(b[0].name, 'zh-Hans-CN'),
      }[sort];
      return l.sort(cmp).map((r) => r[0]);
    }, [base, sel, sort]);
    const curItem = cur ? BY_ID.get(cur) : null;

    const toggleGrade = (g) => setGrades((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
    const inQueue = (id) => queue.includes(id);
    const toggleQueue = (id) => setQueue((q) => (q.includes(id) ? q.filter((x) => x !== id) : [...q, id]));
    const open = (x) => { setCur(x.id); };
    const reset = () => { setQuery(''); setSel(''); setGrades(new Set()); setPmin(''); setPmax(''); setHideIntro(false); setNoReq(false); };

    const treeNode = (name, node, path, depth) => {
      const key = path.join('|');
      const on = sel === key;
      const expanded = sel === key || sel.startsWith(key + '|') || (depth === 0 && !sel && false);
      return html`<li class=${depth === 0 ? 'cat' : ''}><button aria-pressed=${on} onClick=${() => setSel(on ? path.slice(0, -1).join('|') : key)}><span>${short(name)}</span><span class="n">${num(node.n)}</span></button>
        ${(expanded || (depth === 0 && sel.startsWith(key))) && node.kids.size ? html`<ul>${[...node.kids].map(([k, v]) => treeNode(k, v, [...path, k], depth + 1))}</ul>` : null}</li>`;
    };

    return html`<div class="catalog">
      <section class=${'filters' + (filtersOpen ? ' open' : '')} aria-label="筛选">
        <div class="side-head"><i>02 · THE EXCHANGE</i><h1>兑换图鉴</h1><button class="btn small only-narrow" onClick=${() => setFiltersOpen(false)}>完成</button></div>
        <div class="grp"><div class="label"><span>分类</span>${sel ? html`<button onClick=${() => setSel('')}>全部</button>` : null}</div>
          <ul class="tree">${CATS.filter((c) => tree.has(c)).map((c) => treeNode(c, tree.get(c), [c], 0))}</ul></div>
        <div class="grp"><div class="label"><span>支线等级</span>${grades.size ? html`<button onClick=${() => setGrades(new Set())}>清除</button>` : null}</div>
          <div class="grades">${[...GRADES, '无支线'].map((g) => html`<button class="chip" aria-pressed=${grades.has(g)} onClick=${() => toggleGrade(g)}>${g}</button>`)}</div></div>
        <div class="grp"><div class="label"><span>奖励点</span>${pmin || pmax ? html`<button onClick=${() => { setPmin(''); setPmax(''); }}>清除</button>` : null}</div>
          <div class="range"><input class="input" inputmode="numeric" placeholder="最低" value=${pmin} onInput=${(e) => setPmin(e.target.value.replace(/\D/g, ''))} aria-label="最低奖励点" /><span class="muted">至</span><input class="input" inputmode="numeric" placeholder="最高" value=${pmax} onInput=${(e) => setPmax(e.target.value.replace(/\D/g, ''))} aria-label="最高奖励点" /></div></div>
        <div class="grp"><div class="label"><span>其他</span></div>
          <label class="check"><input type="checkbox" checked=${noReq} onChange=${(e) => setNoReq(e.target.checked)} />只看无前置需求</label>
          <label class="check"><input type="checkbox" checked=${hideIntro} onChange=${(e) => setHideIntro(e.target.checked)} />隐藏“仅介绍”与“待调整”</label>
          <label class="check"><input type="checkbox" checked=${full} onChange=${(e) => setFull(e.target.checked)} />搜索正文${full && !descReady.every(Boolean) ? '（加载中）' : ''}</label></div>
        <div class="grp"><button class="btn small" onClick=${reset}><${Icon} n="reset" />重置全部筛选</button></div>
      </section>
      <section class="list-col" aria-label="结果">
        <div class="list-bar">
          <div class="search"><${Icon} n="search" cls="lead" />
            <label class="sr" for="cat-search">搜索</label>
            <input id="cat-search" class="input" type="search" placeholder="名称、出处、编号或前置需求" value=${query} onInput=${(e) => setQuery(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Escape') setQuery(''); }} autocomplete="off" />
            ${query ? html`<button class="clear" aria-label="清除搜索" onClick=${() => { setQuery(''); document.getElementById('cat-search').focus(); }}><${Icon} n="x" /></button>` : null}</div>
          <div class="list-meta"><span><b>${num(list.length)}</b> 条</span>
            <span class="sort"><button class="btn small" onClick=${() => setAll(true)}>全部展开</button><button class="btn small" onClick=${() => setAll(false)}>全部收起</button><button class="btn small only-narrow" onClick=${() => setFiltersOpen(true)}>筛选</button>
              <button class="btn small" disabled=${!list.length} onClick=${() => { const ids = list.slice(0, 90).map((x) => x.id); setQueue((q) => [...q, ...ids.filter((id) => !q.includes(id))]); toast('已把前 ' + ids.length + ' 条加入卡牌工坊'); }}><${Icon} n="cards" />全部加入卡牌</button>
              <${Select} label="排序" value=${sort} onChange=${setSort} options=${Object.entries(SORTS)} className="sel-sm" /></span></div>
        </div>
        ${!inlineReady ? html`<div class="empty" role="status">正在加载完整介绍…</div>` : list.length ? html`<${VList} items=${list} cur=${cur} onOpen=${open} terms=${terms} full=${full} expansion=${expansion} onToggle=${toggleInline} onPath=${setSel} />` : html`<div class="empty">没有符合条件的条目。<br /><button class="btn small" style="margin-top:12px" onClick=${reset}>重置筛选</button></div>`}
      </section>
      <${Detail} active=${active} list=${list} onSelect=${(x) => setCur(x.id)} item=${curItem} terms=${terms} onClose=${() => setCur('')} inQueue=${curItem && inQueue(curItem.id)} onQueue=${() => curItem && toggleQueue(curItem.id)} onPath=${(p) => setSel(p)} />
    </div>`;
  }

  // 正文按自然文档流排版；仅窗口外的条目用占位高度代替。
  // ResizeObserver 每帧批量测量，按首个可见条目补偿上方高度变化，避免浏览器重复锚定。
  function VList({ items, cur, onOpen, terms, full, expansion, onToggle, onPath }) {
    const ref = useRef();
    const sizes = useRef(new Map());
    const mounted = useRef(new Set());
    const previous = useRef(null);
    const pinned = useRef(null), lastExpansion = useRef(expansion), programTop = useRef(0);
    const observer = useRef();
    const [tick, redraw] = useState(0);
    const [viewport, setViewport] = useState({ top: 0, height: 800, width: 0 });
    const isOpen = (x) => expansion.all !== expansion.exceptions.has(x.id);
    const offsets = useMemo(() => {
      const out = [0];
      for (const x of items) {
        const m = sizes.current.get(x.id), open = isOpen(x);
        const valid = m && m.width === viewport.width && (m.open === open || mounted.current.has(x.id));
        // 未见过的正文只估高，进入窗口后立即由真实排版接管。
        const estimate = open ? 360 + x.len * 16 / Math.max(12, viewport.width / 16) : 0;
        out.push(out[out.length - 1] + (valid ? m.height : 72 + estimate));
      }
      return out;
    }, [items, expansion, viewport.width, tick]);
    const locate = (ys, y) => {
      let lo = 0, hi = ys.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ys[mid] <= y) lo = mid; else hi = mid - 1; }
      return Math.min(lo, ys.length - 2);
    };
    const old = previous.current;
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - programTop.current) > 1) pinned.current = null;
    if (lastExpansion.current !== expansion && el) {
      const y = el.getBoundingClientRect().top;
      const node = [...el.querySelectorAll('.vitem')].find((n) => n.getBoundingClientRect().bottom > y);
      pinned.current = expansion.bulk && node ? { id: node.dataset.id, y: node.getBoundingClientRect().top - y, until: performance.now() + 800 } : null;
      lastExpansion.current = expansion;
    }
    if (pinned.current && (performance.now() > pinned.current.until || (old && old.items !== items))) pinned.current = null;
    const pin = pinned.current, pinIndex = pin ? items.findIndex((x) => x.id === pin.id) : -1;
    let top = viewport.top;
    if (old && old.items !== items) top = 0;
    else if (old && old.offsets !== offsets) {
      const actual = ref.current ? ref.current.scrollTop : top;
      const k = locate(old.offsets, actual);
      top = Math.max(0, actual + offsets[k] - old.offsets[k]);
    }
    if (pinIndex >= 0) top = Math.max(0, offsets[pinIndex] - pin.y);
    const start = Math.max(0, locate(offsets, top) - 3);
    const end = Math.min(items.length, locate(offsets, top + viewport.height) + 5);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el.clientWidth) return;
      if (old && (old.items !== items || old.offsets !== offsets)) {
        el.scrollTop = top;
        if (viewport.top !== el.scrollTop) setViewport((v) => ({ ...v, top: el.scrollTop }));
      }
      // 同一帧内锁住首个可见行：包括上方缓冲行跳至最终高度的那一帧。
      if (pinIndex >= 0) {
        const node = [...el.querySelectorAll('.vitem')].find((n) => n.dataset.id === pin.id);
        if (node) el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - pin.y;
        if (viewport.top !== el.scrollTop) setViewport((v) => ({ ...v, top: el.scrollTop }));
      }
      programTop.current = el.scrollTop;
      previous.current = { items, offsets };
      const nodes = [...el.querySelectorAll('.vitem')];
      let measured = false;
      for (const n of nodes) {
        // 新进入窗口的正文必须在绘制前实测，不能等 RO 下一帧才修正估高。
        if (!mounted.current.has(n.dataset.id) || sizes.current.get(n.dataset.id)?.open !== (n.dataset.open === 'true')) {
          const height = n.getBoundingClientRect().height, m = sizes.current.get(n.dataset.id);
          if (!m || Math.abs(m.height - height) > .1 || m.width !== el.clientWidth || m.open !== (n.dataset.open === 'true')) {
            sizes.current.set(n.dataset.id, { height, width: el.clientWidth, open: n.dataset.open === 'true' });
            measured = true;
          }
        }
        observer.current?.observe(n);
      }
      mounted.current = new Set(nodes.map((n) => n.dataset.id));
      if (measured) redraw((n) => n + 1);
    });
    useLayoutEffect(() => {
      const el = ref.current;
      const ro = new ResizeObserver((entries) => {
        let changed = false;
        for (const e of entries) {
          if (e.target === el) {
            if (!el.clientWidth || !el.clientHeight) continue;
            setViewport((v) => ({ ...v, width: el.clientWidth, height: el.clientHeight }));
          } else if (e.target.isConnected && el.clientWidth) {
            const n = e.target, height = n.getBoundingClientRect().height;
            const m = sizes.current.get(n.dataset.id);
            if (!m || Math.abs(m.height - height) > .1 || m.width !== el.clientWidth || m.open !== (n.dataset.open === 'true')) {
              sizes.current.set(n.dataset.id, { height, width: el.clientWidth, open: n.dataset.open === 'true' });
              changed = true;
            }
          } else ro.unobserve(e.target);
        }
        if (changed) redraw((n) => n + 1);
      });
      observer.current = ro;
      ro.observe(el);
      for (const n of el.querySelectorAll('.vitem')) ro.observe(n);
      return () => ro.disconnect();
    }, []);
    useLayoutEffect(() => {
      const k = items.findIndex((x) => x.id === cur), el = ref.current;
      if (k < 0) return;
      if (offsets[k] < el.scrollTop || offsets[k] + 72 > el.scrollTop + el.clientHeight) {
        el.scrollTop = offsets[k]; setViewport((v) => ({ ...v, top: el.scrollTop }));
      }
    }, [cur]);
    const onKey = (e) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault(); pinned.current = null;
      const row = e.target.closest('.vitem');
      const k = row ? items.findIndex((x) => x.id === row.dataset.id) : locate(offsets, top);
      const n = Math.min(items.length - 1, Math.max(0, k + (e.key === 'ArrowDown' ? 1 : -1)));
      const el = ref.current;
      el.scrollTop = offsets[n];
      setViewport((v) => ({ ...v, top: el.scrollTop }));
      requestAnimationFrame(() => el.querySelector('[data-id="' + items[n].id + '"] .vrow')?.focus({ preventScroll: true }));
    };
    const rows = [];
    for (let k = start; k < end; k++) {
      const x = items[k], open = isOpen(x), sn = full && terms.length ? snippet(x, terms) : null;
      rows.push(html`<div class="vitem" key=${x.id} data-id=${x.id} data-open=${open} data-current=${cur === x.id}>
        <div class="inline-head">
          <button class="vrow" aria-expanded=${open} aria-controls=${'cat-inline-' + x.id} onClick=${() => onToggle(x.id)}>
            <${Seal} g=${x.grade || (x.req === '仅介绍' ? '仅介绍' : '')} />
            <span style="min-width:0"><span class="nm">${hl(x.name, terms)}</span>${sn ? html`<span class="hit">${hl(sn, terms)}</span>` : html`<span class="pth">${short(x.cat)} · ${short(x.l2 || x.l1)}${x.l3 ? ' · ' + x.l3 : ''}${x.src ? '　《' + x.src + '》' : ''}</span>`}</span>
            <span class="pts">${x.ptsN != null ? num(x.ptsN) : '—'}<small>${x.pts && x.ptsN != null ? ptsUnit(x.pts) : x.req && x.req.length < 8 ? x.req : ''}</small></span><${Chevron} />
          </button>
          <button class="btn small inline-detail" aria-label=${x.name + '详情'} onClick=${() => onOpen(x)}>详情</button>
        </div>
        <${InlineEntry} id=${'cat-inline-' + x.id} open=${open} animate=${offsets[k] + 72 > top} item=${x} terms=${terms} onPath=${onPath} />
      </div>`);
    }
    return html`<div class="vlist" ref=${ref} tabindex="0" onPointerDown=${() => { pinned.current = null; }} onWheel=${() => { pinned.current = null; }} onTouchStart=${() => { pinned.current = null; }} onScroll=${(e) => { const top = e.target.scrollTop; if (Math.abs(top - programTop.current) > 1) pinned.current = null; setViewport((v) => ({ ...v, top })); }} onKeyDown=${onKey} aria-label="兑换条目列表">
      <div aria-hidden="true" style=${'height:' + offsets[start] + 'px'}></div>${rows}<div aria-hidden="true" style=${'height:' + (offsets[items.length] - offsets[end]) + 'px'}></div>
    </div>`;
  }

  // 像素高度过渡兼容手机内置浏览器；关闭时保留内容至动画结束，重新进入虚拟窗口不重播动画。
  function InlineEntry({ id, open, animate = true, item, row, terms = [], onPath }) {
    const box = useRef(), inner = useRef(), first = useRef(true);
    const [visited, setVisited] = useState(open);
    const [, redraw] = useState(0);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
      if (!open || !item || item.desc !== undefined) return;
      let live = true;
      setError(false);
      loadDesc(CATS.indexOf(item.cat)).then(() => live && redraw((n) => n + 1)).catch(() => { if (live) setError(true); });
      return () => { live = false; };
    }, [open, item && item.id, retry]);
    useLayoutEffect(() => { if (open && !visited) setVisited(true); }, [open]);
    useLayoutEffect(() => {
      const el = box.current, content = inner.current;
      const fit = () => { if (!content.offsetWidth) return; el.style.height = open ? content.getBoundingClientRect().height + 'px' : '0px'; };
      if (first.current || !animate) {
        // 虚拟窗口重新挂载已展开条目时直接呈现最终高度，不再次播放展开。
        el.style.transition = 'none'; fit(); void el.offsetHeight; el.style.transition = ''; first.current = false;
      } else fit();
      const ro = new ResizeObserver(fit); ro.observe(content);
      return () => ro.disconnect();
    }, [open, visited, animate, item && item.id]);
    const showOwn = row && row.eff && !(item && item.desc && dupText(row.eff, item.desc) && sig(row.eff).length <= sig(item.desc).length * 1.05);
    return html`<div id=${id} ref=${box} class="inline-collapse" aria-hidden=${!open} inert=${!open ? '' : undefined} style="height:0px">
      <div ref=${inner}><div class="inline-body">${visited ? html`
        ${item ? item.desc !== undefined ? html`<${EntryBody} item=${item} terms=${terms} onPath=${onPath} />` : html`<p class="d-loading" role="status">${error ? '正文加载失败。' : '正在加载完整介绍…'}${error ? html`<button class="btn small" onClick=${() => { delete loaded['data/desc-' + CATS.indexOf(item.cat) + '.js']; setRetry((n) => n + 1); }}>重试</button>` : null}</p>` : html`<div class="d-head"><h2>${row?.n || '未命名'}</h2></div>`}
        ${row ? html`<dl class="x-facts">${[['等级', row.g], ['奖励点', ptsShow(row.pts)], ['熟练度', row.lv], ['数量', row.qty], ['类别', row.type], ['来源', row.from]].filter(([, v]) => v).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : null}
        ${showOwn ? html`<div class="label">人物卡里记的效果</div><div class="d-body">${renderDesc(row.eff, terms)}</div>` : null}
        ${row?.note ? html`<div class="label">备注</div><div class="d-attr">${row.note}</div>` : null}
      ` : null}</div></div>
    </div>`;
  }

  function renderDesc(desc, terms) {
    return desc.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => {
      if (/^(注|※|PS|ps)\s*\d*[：:]/.test(p)) return html`<p class="note">${hl(p, terms)}</p>`;
      const m = p.match(/^([^：:，。“”「」]{1,14})[：:](.+)$/);
      if (m && !/出自/.test(m[1])) return html`<p class="lab"><b>${hl(m[1], terms)}：</b>${hl(m[2], terms)}</p>`;
      return html`<p>${hl(p, terms)}</p>`;
    });
  }

  // 条目详情的主体（路径、标题、方印、要素、属性配比、正文）。图鉴右栏和人物卡弹窗共用，保证两边一模一样
  function EntryBody({ item, terms, onPath }) {
    const paths = [[item.cat, item.cat]];
    if (item.l1) paths.push([item.l1, [item.cat, item.l1].join('|')]);
    if (item.l2) paths.push([item.l2, [item.cat, item.l1, item.l2].join('|')]);
    if (item.l3) paths.push([item.l3, [item.cat, item.l1, item.l2, item.l3].join('|')]);
    return html`
        <div class="d-path">${paths.map(([t, p], k) => html`${k ? html`<span>/</span>` : null}${onPath ? html`<button onClick=${() => onPath(p)}>${short(t)}</button>` : html`<span class="path-label">${short(t)}</span>`}`)}</div>
        <div class="d-head"><div><h2>${item.name}</h2>${item.src ? html`<div class="src">出自《${item.src}》</div>` : null}</div><${Seal} g=${item.grade || (item.req === '仅介绍' ? '仅介绍' : '')} big /></div>
        ${PHOTOS[item.name] ? html`<figure class="d-photo"><img src=${'assets/img/photo/' + PHOTOS[item.name].file} alt=${item.name} /><figcaption>照片：${PHOTOS[item.name].author || '佚名'}，${PHOTOS[item.name].license}，经黑蓝白三色处理</figcaption></figure>` : null}
        <div class="d-facts">
          <div><span class="label">支线剧情</span><b class=${/^[0-9A-Z]+$/.test(item.grade || '') ? '' : 't'}>${slashWrap(item.grade || '无支线')}</b></div>
          <div><span class="label">奖励点</span><b class=${/^\d+$/.test((item.pts || '').trim()) ? '' : 't'}>${item.pts ? item.pts.split('\n').map((l, k) => html`${k ? html`<br />` : null}${/^\d+$/.test(l) ? num(l) : slashWrap(l)}`) : '—'}</b></div>
          ${item.req ? html`<div><span class="label">前置需求</span><b class="t">${item.req}</b></div>` : null}
          <div><span class="label">编号</span><b class="no-big"><span>${item.id.slice(0, 1)}</span>${item.id.slice(1).padStart(4, '0')}</b></div>
        </div>
        ${item.attr ? html`<div class="label">属性点配比</div><div class="d-attr">${item.attr.replace(/属性点配比[：:]?\s*/, '')}</div>` : null}
        <div class="d-body" key=${item.id + (item.desc ? '' : '-wait')} style=${item.desc ? '' : 'min-height:' + Math.min(900, 60 + item.len * 0.9) + 'px'}>${item.desc ? renderDesc(item.desc, terms) : null}</div>`;
  }

  const relatedCache = new Map();
  function mentions(text, item) {
    return (item.name.length >= 2 && text.includes(item.name)) || (text.includes(item.id) && new RegExp(item.id + '(?![0-9])').test(text));
  }
  function relatedItems(item) {
    if (relatedCache.has(item.id)) return relatedCache.get(item.id);
    const out = [];
    for (const x of ITEMS) {
      if (x.id === item.id) continue;
      const why = [];
      if (mentions(item.req || '', x)) why.push('前置引用');
      if (mentions((x.req || '') + '\n' + (x.desc || ''), item)) why.push('引用本条');
      const branch = item.l3 || item.l2;
      if (branch && x.cat === item.cat && x.l1 === item.l1 && (item.l3 ? x.l3 === branch && x.l2 === item.l2 : x.l2 === branch)) why.push('同体系');
      if (item.src && x.src === item.src) why.push('同出处');
      if (why.length) out.push({ item: x, why, score: why.some((w) => w.includes('引用')) ? 1 : 0 });
    }
    out.sort((a, b) => b.score - a.score);
    if (relatedCache.size >= 128) relatedCache.delete(relatedCache.keys().next().value);
    relatedCache.set(item.id, out); return out;
  }
  let ruleIndex;
  function relatedRules(item) {
    if (!ruleIndex) {
      ruleIndex = [];
      for (const c of RULES.chunks) {
        const doc = new DOMParser().parseFromString(c.html, 'text/html');
        let title = c.title, anchor = c.id;
        for (const el of doc.querySelectorAll('h1,h2,h3,h4,p,li,td')) {
          if (/^H/.test(el.tagName)) { title = el.textContent.trim(); anchor = el.id || anchor; }
          else { const text = el.textContent.trim(); if (text.length > 12) ruleIndex.push({ chapter: c.id, title, anchor, text }); }
        }
      }
    }
    const words = [...new Set([item.name, item.cat, item.l1, item.l2, item.l3, ...[item.cat, item.l1, item.l2, item.l3].flatMap((s) => (s || '').replace(/类$/, '').split(/[·／/、（）()\s]+/))].filter((s) => s && s.length >= 2))];
    return ruleIndex.map((r) => ({ ...r, hits: words.filter((w) => (r.title + r.text).includes(w)) })).filter((r) => r.hits.length).sort((a, b) => b.hits.length - a.hits.length).slice(0, 60);
  }
  function EntryExplorer({ item, entryKey, sequence, onSelect, children, terms = [] }) {
    const [tab, setTab] = useState('detail'), [limit, setLimit] = useState(40);
    const [direction, setDirection] = useState(1), [relatedTick, refreshRelated] = useState(0);
    useEffect(() => { if (tab !== 'related' || descReady.every(Boolean)) return; let live = true; loadAllDesc().then(() => { relatedCache.clear(); if (live) refreshRelated((n) => n + 1); }).catch((e) => toast(e.message)); return () => { live = false; }; }, [tab]);
    const touch = useRef(), content = useRef(), previousEntry = useRef(null);
    const pos = sequence.findIndex((x) => x.key === entryKey);
    if (pos >= 0) previousEntry.current = sequence[pos];
    const move = (d) => { const next = sequence[pos + d]; if (pos < 0 || !next) return; setDirection(d); onSelect(next); };
    const related = useMemo(() => tab === 'related' && item ? relatedItems(item) : [], [tab, item, relatedTick]);
    const rules = useMemo(() => tab === 'rules' && item ? relatedRules(item) : [], [tab, item]);
    useLayoutEffect(() => { setLimit(40); if (content.current) { const box = content.current.closest('.x-body'); if (box) box.scrollTop = 0; } }, [entryKey, tab]);
    useLayoutEffect(() => { if (content.current) fitStdCards(content.current); }, [entryKey, tab, item?.desc]);
    return html`<div class="entry-explorer" onTouchStart=${(e) => { if (e.touches.length === 1 && !e.target.closest('input,textarea,select,button,a')) touch.current = [e.touches[0].clientX, e.touches[0].clientY]; else touch.current = null; }} onTouchEnd=${(e) => { if (!touch.current || !e.changedTouches.length) return; const [x, y] = touch.current; touch.current = null; const dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); }} onTouchCancel=${() => { touch.current = null; }}>
      <div class="entry-controls"><div class="entry-tools"><button class="btn small" aria-label="上一个条目" disabled=${pos <= 0} onClick=${() => move(-1)}>← 上一条</button><span aria-live="polite">${pos >= 0 ? (pos + 1) + ' / ' + sequence.length : previousEntry.current ? html`<button class="x-mini" onClick=${() => { onSelect(previousEntry.current); setTab('detail'); }}>返回原条目</button>` : '相关条目'}</span><button class="btn small" aria-label="下一个条目" disabled=${pos < 0 || pos >= sequence.length - 1} onClick=${() => move(1)}>下一条 →</button></div>
      <div class="entry-tabs" role="tablist" aria-label="条目内容">${[['detail', '详情'], ['related', '相关条目'], ['rules', '相关规则']].map(([k, t]) => html`<button class="chip" role="tab" aria-selected=${tab === k} aria-pressed=${tab === k} onClick=${() => setTab(k)}>${t}</button>`)}</div></div>
      <div class="entry-content" role="tabpanel" ref=${content} key=${entryKey + tab} style=${'--entry-direction:' + direction}>
        ${tab === 'detail' ? children : !item ? html`<p class="x-hint">此项尚未关联图鉴，请先关联后查看。</p>` : tab === 'related' ? html`
          <p class="x-hint">${item.name} · ${related.length} 条关联。按体系分类、出处和前置需求匹配。</p>
          <ul class="entry-links">${related.slice(0, limit).map((r) => html`<li key=${r.item.id}><button onClick=${() => { setDirection(1); onSelect({ key: r.item.id, item: r.item }); setTab('detail'); }}><b>${r.item.name}</b><span>${r.why.join(' · ')} · ${r.item.grade || '无支线'} · ${r.item.pts || '—'}</span></button></li>`)}</ul>
          ${limit < related.length ? html`<button class="btn small" onClick=${() => setLimit(limit + 40)}>继续显示</button>` : !related.length ? html`<p class="x-hint">没有匹配的相关条目。</p>` : null}
        ` : html`<p class="x-hint">按类别、体系与名称检索规则正文；匹配段落供查阅。</p><ul class="entry-links rule-links">${rules.map((r) => { const at = Math.max(0, r.text.indexOf(r.hits[0]) - 30); return html`<li><a href=${'#/rules/' + r.chapter + '?anchor=' + encodeURIComponent(r.anchor)}><b>${r.title}</b><span>${hl((at ? '…' : '') + r.text.slice(at, at + 150) + (r.text.length > at + 150 ? '…' : ''), r.hits)}</span></a></li>`; })}</ul>${!rules.length ? html`<p class="x-hint">未找到匹配的规则段落。</p>` : null}`}
      </div>
    </div>`;
  }
  function Detail({ item: target, terms, onClose, inQueue, onQueue, list, onSelect, active }) {
    const last = useRef(null), [, redraw] = useState(0);
    if (target) last.current = target;
    const item = target || last.current;
    useEffect(() => { if (!target || target.desc !== undefined) return; let live = true; loadDesc(CATS.indexOf(target.cat)).then(() => live && redraw((n) => n + 1)).catch((e) => toast(e.message)); return () => { live = false; }; }, [target]);
    const sequence = useMemo(() => list.map((item) => ({ key: item.id, item })), [list]);
    const copy = () => { const t = item.name + '\n' + [item.cat, item.l1, item.l2, item.l3].filter(Boolean).join(' / ') + '\n支线：' + (item.grade || '无') + '　奖励点：' + (item.pts || '—') + '\n前置：' + (item.req || '无') + '\n\n' + (item.desc || ''); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('已复制条目文本'), () => toast('复制失败，请手动选择文字')); };
    return html`<${Modal} open=${!!target} suspended=${!active} onDismiss=${onClose} label="ENTRY　·　图鉴详情" cls="x-wide entry-modal">
      ${item ? html`<${EntryExplorer} item=${item} entryKey=${item.id} sequence=${sequence} onSelect=${(x) => onSelect(x.item)}>
        <${EntryBody} item=${item} terms=${terms} />
        <div class="d-actions"><button class="btn small" onClick=${onQueue}><${Icon} n=${inQueue ? 'check' : 'plus'} />${inQueue ? '已在卡牌工坊' : '加入卡牌工坊'}</button><button class="btn small" onClick=${copy}><${Icon} n="copy" />复制文本</button><a class="btn small" href="#/cards">打开卡牌工坊</a></div>
        ${item.desc ? html`<div class="d-card" ref=${fitRef} dangerouslySetInnerHTML=${{ __html: cardHTML(item) }}></div>` : null}
      </${EntryExplorer}>` : null}
    </${Modal}>`;
  }

  // ---------------------------------------------------------------- 卡牌
  function sealHTML(g) {
    g = firstGrade(g);
    if (!g || g === '无支线' || g === '仅介绍') return '<span class="seal none">无</span>';
    return `<span class="seal ${g.length >= 3 ? 's3' : g.length === 2 ? 's2' : ''}">${esc(g)}</span>`;
  }
  const CARD_KEY = { 科技类: 'tech', 魔法传说类: 'magic', 辅助类: 'support', 娱乐类: 'fun' };
  const GLYPH = {
    tech: '<circle cx="12" cy="12" r="6.2"/><path d="M12 2.8v5M12 16.2v5M2.8 12h5M16.2 12h5"/>',
    magic: '<path d="M12 3.2l2 6.8 6.8 2-6.8 2-2 6.8-2-6.8-6.8-2 6.8-2z"/>',
    support: '<path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9M9.4 7h5.2M9.4 17h5.2"/>',
    fun: '<path d="M9.5 3h5M10.5 3v5.6L5.9 16.9A2.7 2.7 0 0 0 8.3 21h7.4a2.7 2.7 0 0 0 2.4-4.1l-4.6-8.3V3M7.6 14h8.8"/>',
  };
  const cardNo = (id) => `<b class="no"><span>${esc(id.slice(0, 1))}</span>${esc(id.slice(1).padStart(4, '0'))}</b>`;
  const fmtNo = (id) => id.slice(0, 1) + ' ' + id.slice(1).padStart(4, '0');
  // 标准卡 63×88，大卡 88×126（同一结构，大卡放完整描述）
  function cardHTML(it, lg = false) {
    const [src, pos] = artOf(it);
    const key = CARD_KEY[it.cat];
    const g = firstGrade(it.grade), has = GRADES.includes(g);
    const unit = ptsUnit(it.pts);
    const body = esc(it.desc || (it.src ? '出自《' + it.src + '》。' : '')) + (it.req ? '\n前置：' + esc(it.req) : '');
    return `<div class="card c-${key}${lg ? ' lg' : ''}" data-card-id="${esc(it.id)}"><div class="cf">
      <div class="ch"><span class="ct"><svg viewBox="0 0 24 24">${GLYPH[key]}</svg>${esc(it.cat.replace('类', ''))} · ${esc(short(it.l2 || it.l1))}</span>${cardNo(it.id)}</div>
      <div class="art"><img src="${src}" style="object-position:${pos}% 50%" alt=""></div>
      <span class="seal ${has ? (g.length >= 3 ? 's3' : g.length === 2 ? 's2' : '') : 'none'}">${has ? esc(g) : '无'}</span>
      <div class="nm${[...it.name].length > (lg ? 12 : 9) ? ' long' : ''}">${esc(it.name)}</div>
      <div class="src">${it.src ? '出自《' + esc(it.src) + '》' : '&nbsp;'}</div>
      <div class="rule"><i></i></div>
      <div class="tx">${body}</div>
      <div class="ft"><span class="pts">${it.ptsN != null ? num(it.ptsN) : '—'}<small>${esc(unit)}</small></span><span class="gr${has ? '' : ' none'}"><small>支线</small>${has ? esc(g) : '无'}</span></div>
    </div></div>`;
  }
  const cardLHTML = (it) => cardHTML(it, true);
  // 卡背：墨黑底、白框，主神光球压着错开的蓝色硬投影，下面是二十道光柱
  const RAYS = `<svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<rect x="${(i * 198 / 19).toFixed(2)}" y="0" width="2" height="100" fill="#F2F2FF"/>`).join('')}</svg>`;
  const cardBackHTML = (lg) => `<div class="card back${lg ? ' lg' : ''}"><div class="cb"><i class="cb-top">SYSTEM · 主神</i><span class="cb-rays">${RAYS}</span><span class="cb-orb"><b>曙光</b></span><i class="cb-foot">SHUGUANG · INFINITE TRPG</i></div></div>`;
  // 实测卡面：先缩字（最低 6pt），再按 Unicode 码点拆成续卡。保留全文和换行。
  function fitStdCards(root) {
    if (!root.offsetWidth) return;
    root.querySelectorAll('.card:not([data-fitted])').forEach((card) => {
      const tx = card.querySelector('.tx'); if (!tx) return;
      card.dataset.fitted = '1';
      const lg = card.classList.contains('lg'), max = lg ? 82 : 74, min = 60;
      const over = (el) => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
      const size = (n) => { tx.style.fontSize = n / 10 + 'pt'; };
      size(max);
      if (over(tx)) {
        size(min);
        if (!over(tx)) {
          let a = min, b = max;
          while (b - a > 1) { const m = (a + b) >> 1; size(m); if (over(tx)) b = m; else a = m; }
          size(a);
        }
      }
      if (!over(tx)) return;
      let rest = [...tx.textContent], current = card, part = 1;
      const title = card.querySelector('.nm').textContent;
      while (rest.length) {
        const body = current.querySelector('.tx');
        body.style.fontSize = min / 10 + 'pt';
        body.textContent = rest.join('');
        if (!over(body)) break;
        let a = 0, b = rest.length;
        while (a < b) { const m = Math.ceil((a + b) / 2); body.textContent = rest.slice(0, m).join(''); if (over(body)) b = m - 1; else a = m; }
        if (!a) throw new Error('卡面标题过长，正文没有可用空间：' + title);
        body.textContent = rest.slice(0, a).join(''); rest = rest.slice(a);
        const next = card.cloneNode(true);
        next.dataset.continuation = String(++part);
        next.querySelector('.nm').textContent = title + '（续 ' + part + '）';
        next.querySelector('.nm').classList.add('long');
        current.after(next); current = next;
      }
    });
  }
  function pinAnatomy(root) {
    root.querySelectorAll('.anatomy .awrap').forEach((w) => {
      w.querySelectorAll('.pin, .lead').forEach((x) => x.remove());
      const card = w.querySelector('.card'), wr = w.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const k = wr.width / w.offsetWidth || 1;
      w.querySelectorAll('[data-pin]').forEach((el) => {
        const r = el.getBoundingClientRect(), n = el.dataset.pin, right = n === '2' || n === '8';
        const y = (r.top + r.height / 2 - wr.top) / k;
        const px = right ? (cr.right - wr.left) / k + 12 : (cr.left - wr.left) / k - 12;
        const ex = right ? (r.right - wr.left) / k : (r.left - wr.left) / k;
        const lead = document.createElement('span'); lead.className = 'lead';
        lead.style.cssText = 'left:' + Math.min(px, ex) + 'px;width:' + Math.abs(ex - px) + 'px;top:' + y + 'px';
        const p = document.createElement('span'); p.className = 'pin'; p.textContent = n; p.style.left = px + 'px'; p.style.top = y + 'px';
        w.appendChild(lead); w.appendChild(p);
      });
    });
  }
  const fitCards = fitStdCards;
  // 详情页的卡牌预览也走同一套排版（缩字＋续卡），否则长正文被底栏切断（手机上尤其明显）
  const fitRef = (el) => {
    if (!el) return;
    requestAnimationFrame(() => {
      try { fitCards(el); } catch (e) { /* 标题过长时保持原样 */ }
      // 预览只留第一张（正文已在整字处收住），续卡多时写一句去卡牌工坊看全套，免得手机上拉成一长串
      const cards = el.querySelectorAll('.card'); el.querySelector('.d-card-more')?.remove();
      if (cards.length > 1) {
        cards.forEach((c, i) => { if (i) c.remove(); });
        const note = document.createElement('p'); note.className = 'd-card-more';
        note.textContent = '正文较长，打印共 ' + cards.length + ' 张（含续卡），可在卡牌工坊查看全部';
        el.appendChild(note);
      }
    });
  };

  function CardPage({ markup, onOpen }) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current;
      const fit = () => { const p = el.firstElementChild; if (p) p.style.transform = `scale(${el.clientWidth / (210 * 96 / 25.4)})`; };
      fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
    }, [markup]);
    return html`<div class="ws-paper" ref=${ref} onClick=${(e) => { const c = e.target.closest('[data-card-id]'); if (c) onOpen(c.dataset.cardId); }} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { const c = e.target.closest('[data-card-id]'); if (c) { e.preventDefault(); onOpen(c.dataset.cardId); } } }} dangerouslySetInnerHTML=${{ __html: markup }}></div>`;
  }
  function Cards({ active }) {
    const [queue, setQueue] = useState(() => store.get('sg.cards', []));
    const [qty, setQty] = useState(() => store.get('sg.cardqty', {}));
    useEffect(() => { if (active) { setQueue(store.get('sg.cards', [])); setQty(store.get('sg.cardqty', {})); } }, [active]);
    const [size, setSize] = useState(store.get('sg.cardsize', 'std'));
    const [backs, setBacks] = useState(store.get('sg.cardbacks', false));
    const [pages, setPages] = useState([]), [total, setTotal] = useState(0), [ready, setReady] = useState(false);
    const [q, setQ] = useState(''), [cat, setCat] = useState(''), [grade, setGrade] = useState(''), [pmin, setPmin] = useState(''), [pmax, setPmax] = useState('');
    const [panel, setPanel] = useState(''), [cur, setCur] = useState(''), [report, setReport] = useState(null);
    const [busy, setBusy] = useState(''), [files, setFiles] = useState([]);
    const drag = useRef(null), exporting = useRef(false), lastPanel = useRef('');
    if (panel) lastPanel.current = panel;
    const view = panel || lastPanel.current;
    const items = useMemo(() => [...new Set(queue)].map((id) => BY_ID.get(id)).filter(Boolean), [queue]);
    const count = (id) => Math.max(1, Math.min(3, +qty[id] || 1));
    useEffect(() => { store.set('sg.cards', queue); }, [queue]);
    useEffect(() => { store.set('sg.cardqty', qty); }, [qty]);
    useEffect(() => { store.set('sg.cardsize', size); store.set('sg.cardbacks', backs); }, [size, backs]);
    useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files]);
    useEffect(() => {
      if (!active) return;
      let live = true;
      setReady(false);
      (async () => {
        await Promise.all([...new Set(items.map((x) => CATS.indexOf(x.cat)))].map(loadDesc));
        await loadFonts(items.map((x) => (size === 'std' ? cardHTML(x) : cardLHTML(x))).join(''));
        await document.fonts.ready;
        if (!live) return;
        const host = document.createElement('div'); host.className = 'ws-measure'; document.body.appendChild(host);
        try {
          const cards = [];
          for (const x of items) {
            host.innerHTML = size === 'std' ? cardHTML(x) : cardLHTML(x);
            fitCards(host);
            const parts = [...host.querySelectorAll('.card')].map((el) => { el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', x.name + (el.dataset.continuation ? ' 续卡 ' + el.dataset.continuation : '')); return el.outerHTML; });
            for (let n = 0; n < count(x.id); n++) cards.push(...parts);
          }
          const per = size === 'std' ? 9 : 4, result = [];
          for (let i = 0; i < cards.length; i += per) {
            const chunk = cards.slice(i, i + per), cls = size === 'std' ? 'grid9' : 'grid4';
            const page = (body, back = false) => `<section class="print-page${back ? ' mirror' : ''}"><div class="${cls}">${body}</div></section>`;
            result.push(page(chunk.join('')));
            // 填满所有槽位再镜像，保证末页不足一排时正反面也对齐。
            if (backs) result.push(page(Array.from({ length: per }, (_, j) => j < chunk.length ? cardBackHTML(size !== 'std') : '<div class="card-slot"></div>').join(''), true));
          }
          setPages(result); setTotal(cards.length); setReady(true);
        } finally { host.remove(); }
      })().catch((e) => { if (live) toast('排版失败：' + e.message); });
      return () => { live = false; };
    }, [items, qty, size, backs, active]);
    const add = (id) => { setQueue((v) => v.includes(id) ? v : [...v, id]); setQty((v) => ({ ...v, [id]: v[id] || 1 })); };
    const remove = (id) => { setQueue((v) => v.filter((x) => x !== id)); setQty((v) => { const n = { ...v }; delete n[id]; return n; }); };
    const move = (id, to) => setQueue((v) => { const n = [...v], from = n.indexOf(id); if (from < 0 || to < 0 || to >= n.length) return v; n.splice(from, 1); n.splice(to, 0, id); return n; });
    const sorted = (mode) => setQueue((v) => [...v].sort((a, b) => {
      const x = BY_ID.get(a), y = BY_ID.get(b); if (!x || !y) return 0;
      return (mode === 'cat' ? CATS.indexOf(x.cat) - CATS.indexOf(y.cat) : (x.ptsN ?? Infinity) - (y.ptsN ?? Infinity)) || x.i - y.i;
    }));
    const sugg = useMemo(() => {
      const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return ITEMS.filter((x) => (!cat || ([x.cat, x.l1, x.l2, x.l3].filter(Boolean).join('|') + '|').startsWith(cat + '|')) && (!grade || (GRADES.includes(firstGrade(x.grade)) ? firstGrade(x.grade) : !x.grade || firstGrade(x.grade) === '无支线' ? '无支线' : '其他') === grade) && (pmin === '' || x.ptsN != null && x.ptsN >= +pmin) && (pmax === '' || x.ptsN != null && x.ptsN <= +pmax) && (!terms.length || matchItem(x, terms, false)));
    }, [q, cat, grade, pmin, pmax]);
    const categories = useMemo(() => [['', '全部类别'], ...[...new Set(ITEMS.flatMap((x) => { const p = [x.cat, x.l1, x.l2, x.l3].filter(Boolean); return p.map((_, i) => p.slice(0, i + 1).join('|')); }))].map((v) => [v, v.replaceAll('|', ' / ')])], []);
    const importCharacter = () => {
      const lib = store.get('sg.chars', null), c = lib?.list?.[lib.cur || 0];
      if (!c) { setReport({ name: '', matched: 0, added: 0, missing: [], empty: true }); setPanel('import'); return; }
      const rows = [...(c.enh || []), ...(c.items || [])].filter((r) => r.n || r.id), found = [], missing = [];
      rows.forEach((r) => { const x = resolveRow(r); if (x) found.push(x.id); else missing.push(r.n || r.id); });
      const ids = [...new Set(found)];
      setQueue((v) => [...new Set([...v, ...ids])]);
      setReport({ name: c.name || '未命名角色', matched: found.length, added: ids.filter((id) => !queue.includes(id)).length, missing, empty: !rows.length }); setPanel('import');
    };
    const doPrint = async () => {
      const root = document.querySelector('.print-root'); root.innerHTML = pages.join('');
      await Promise.all([...root.querySelectorAll('img')].map((im) => im.decode().catch(() => {})).concat(loadFonts(root.textContent)));
      window.print();
    };
    useEffect(() => { const f = () => { document.querySelector('.print-root').innerHTML = ''; }; addEventListener('afterprint', f); return () => removeEventListener('afterprint', f); }, []);
    const run = async (kind) => {
      if (exporting.current || !ready) return;
      exporting.current = true; setFiles([]); setPanel('export'); setBusy('正在准备导出……');
      try {
        await loadScript('assets/export.js');
        const result = await window.SGX.cards(pages, kind, (i, n) => setBusy(`正在生成第 ${i} / ${n} 页……`));
        setFiles(result.map((f, i) => ({ ...f, name: '曙光卡牌-' + (kind === 'pdf' ? 'A4' : String(i + 1).padStart(2, '0')) + '.' + kind, url: URL.createObjectURL(f.blob) })));
      } catch (e) { toast('导出失败：' + e.message); }
      setBusy(''); exporting.current = false;
    };
    return html`<div>
      <div class="page-head"><div><i class="eyebrow">05 · CARD WORKSHOP</i><h1>卡牌工坊</h1><p>${items.length} 种 · ${ready ? total : '…'} 张（含数量与续卡） · ${ready ? pages.length : '…'} 页 A4</p></div></div>
      <div class="cards-ws">
        <div class="ws-actions"><button class="btn small" onClick=${() => setPanel('search')}><${Icon} n="plus" />添加</button><button class="btn small" onClick=${() => setPanel('settings')}><${Icon} n="cards" />管理</button><button class="btn small" disabled=${!ready || !items.length || !!busy} onClick=${() => run('pdf')} aria-label="导出 PDF"><${Icon} n="down" />PDF</button><button class="btn small" disabled=${!ready || !items.length || !!busy} onClick=${() => run('png')} aria-label="导出 PNG"><${Icon} n="down" />PNG</button><button class="btn small" disabled=${!ready || !items.length} onClick=${doPrint}><${Icon} n="print" />打印</button></div>
        <p class="ws-note">${size === 'std' ? '63 × 88 mm · 每页 9 张' : '88 × 126 mm · 每页 4 张'}${backs ? ' · 附卡背' : ''}。正文最低 6pt，超长自动续卡。打印选 A4、实际大小 100%、无边距${backs ? '，双面长边翻转' : ''}。</p>
        <div class="ws-queue" aria-label="卡牌队列">${items.map((x, i) => html`<div class="ws-row" key=${x.id} data-id=${x.id} draggable="true" onDragStart=${(e) => { if (e.target.closest('button')) { e.preventDefault(); return; } drag.current = x.id; e.dataTransfer.setData('text/plain', x.id); e.dataTransfer.effectAllowed = 'move'; }} onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => { e.preventDefault(); if (drag.current) move(drag.current, i); drag.current = null; }} onDragEnd=${() => { drag.current = null; }}>
          <span class="ws-grip" title="拖动排序" aria-hidden="true">::</span><button class="ws-name" onClick=${() => setCur(x.id)}><small>${String(i + 1).padStart(2, '0')} · ${short(x.cat)}</small><b>${x.name}</b></button><div class="ws-row-tools"><button class="btn small" aria-label=${x.name + ' 数量'} onClick=${() => setQty((v) => ({ ...v, [x.id]: count(x.id) % 3 + 1 }))}>×${count(x.id)}</button><button class="btn small" aria-label=${'上移 ' + x.name} disabled=${i === 0} onClick=${() => move(x.id, i - 1)}>↑</button><button class="btn small" aria-label=${'下移 ' + x.name} disabled=${i === items.length - 1} onClick=${() => move(x.id, i + 1)}>↓</button><button class="btn small" aria-label=${'移除 ' + x.name} onClick=${() => remove(x.id)}><${Icon} n="x" /></button></div>
        </div>`)}</div>
        <div class=${'ws-pages' + (!ready ? ' preparing' : '')} aria-busy=${!ready}>${pages.map((markup, i) => html`<figure class="ws-page" key=${i}><figcaption>A4 · ${i + 1} / ${pages.length}${backs ? i % 2 ? ' · 背面（已镜像）' : ' · 正面' : ''}</figcaption><${CardPage} markup=${markup} onOpen=${setCur} /></figure>`)}</div>
        ${!items.length ? html`<div class="empty"><p>搜索添加图鉴条目，或从当前人物卡导入。</p><button class="btn" onClick=${importCharacter}><${Icon} n="user" />从人物卡导入全部兑换项</button></div>` : null}
      </div>
      <${Modal} open=${!!panel} suspended=${!active} onDismiss=${() => setPanel('')} label=${view === 'search' ? 'ADD · 搜索添加' : view === 'export' ? 'EXPORT · 导出卡牌' : view === 'import' ? 'IMPORT · 导入结果' : 'WORKSHOP · 卡牌管理'} cls="x-wide" bodyKey=${view}>
        <div class="x-view">
        ${view === 'search' ? html`<div class="ws-filters"><input class="input" aria-label="添加卡片" placeholder="名称、编号、出处或前置" value=${q} onInput=${(e) => setQ(e.target.value)} /><${Select} label="类别" value=${cat} options=${categories} onChange=${setCat} /><${Select} label="等级" value=${grade} options=${[['', '全部等级'], ...[...GRADES, '无支线', '其他'].map((g) => [g, g])]} onChange=${setGrade} /><div class="ws-prices"><input class="input" inputmode="numeric" placeholder="最低价格" aria-label="最低价格" value=${pmin} onInput=${(e) => setPmin(e.target.value.replace(/\D/g, ''))} /><span>—</span><input class="input" inputmode="numeric" placeholder="最高价格" aria-label="最高价格" value=${pmax} onInput=${(e) => setPmax(e.target.value.replace(/\D/g, ''))} /></div><button class="btn small" onClick=${() => { setQ(''); setCat(''); setGrade(''); setPmin(''); setPmax(''); }}>重置筛选</button></div><p class="ws-note">${sugg.length} 项匹配 · 显示前 60 项</p><div class="ws-results">${sugg.slice(0, 60).map((x) => html`<button class="ws-result" disabled=${queue.includes(x.id)} onClick=${() => add(x.id)}><${Seal} g=${x.grade} /><span><b>${x.name}</b><small>${x.cat} · ${x.pts || '—'}</small></span><span>${queue.includes(x.id) ? '已加入' : '＋'}</span></button>`)}</div>` : null}
        ${view === 'settings' ? html`<div class="ws-settings"><${Select} label="卡片尺寸" value=${size} options=${[['std', '标准卡 63 × 88 mm'], ['large', '大卡 88 × 126 mm']]} onChange=${setSize} /><label class="check"><input type="checkbox" checked=${backs} onChange=${(e) => setBacks(e.target.checked)} />附背面（双面打印长边翻转）</label><button class="btn" onClick=${() => sorted('cat')}>按类别排序</button><button class="btn" onClick=${() => sorted('price')}>按价格排序（低 → 高）</button><button class="btn" onClick=${importCharacter}><${Icon} n="user" />从人物卡导入全部兑换项</button><button class="btn" disabled=${!items.length} onClick=${() => askConfirm('清空卡牌工坊中的 ' + items.length + ' 种卡？', '清空').then((ok) => { if (ok) { setQueue([]); setQty({}); setPanel(''); } })}><${Icon} n="trash" />清空</button><p class="ws-note">数量按钮在 ×1–×3 间循环。手机点 ↑ ↓ 排序；电脑也可拖动队列行。</p></div>` : null}
        ${view === 'import' && report ? html`<p>${report.name}：匹配 ${report.matched} 项，新加入 ${report.added} 种（已有条目保留数量）。</p>${report.empty ? html`<p>当前人物卡没有兑换项，请先在人物卡页面选择或导入角色。</p>` : null}<p>未匹配 ${report.missing.length} 项${report.missing.length ? '，可在搜索添加中查找：' : '。'}</p><ul>${report.missing.map((n) => html`<li>${n}</li>`)}</ul><button class="btn" onClick=${() => setPanel('search')}>搜索添加</button>` : null}
        ${view === 'export' ? html`<p class="ws-note">A4 · ${pages.length} 页 · 300 dpi。PDF 与 PNG 使用同一份卡面和分页。</p><p role="status">${busy || (files.length ? '已生成，点击保存。PNG 也可长按图片保存或转发。' : '未生成文件，请关闭后重试。')}</p><ul class="xp-files">${files.map((f) => html`<li><span class="xp-fn"><b>${f.name}</b><small>${kb(f.blob.size)}${f.w ? ' · ' + f.w + ' × ' + f.h : ''}</small></span><a class="btn small" href=${f.url} download=${f.name}>保存</a>${navigator.canShare && navigator.canShare({ files: [new File([f.blob], f.name, { type: f.blob.type })] }) ? html`<button class="btn small" onClick=${() => navigator.share({ files: [new File([f.blob], f.name, { type: f.blob.type })] }).catch(() => {})}>分享</button>` : null}</li>`)}</ul>${files.filter((f) => f.w).map((f) => html`<figure class="xp-img"><img loading="lazy" decoding="async" src=${f.url} width=${f.w} height=${f.h} alt=${f.name} /></figure>`)}<p class="xp-tip">QQ 若拦截下载，请在右上角选择“在浏览器打开”；PNG 可直接长按保存。打印店请按 A4 实际大小打印，不要缩放。</p>` : null}
        </div>
      </${Modal}>
      <${Detail} active=${active} list=${items} item=${BY_ID.get(cur)} terms=${[]} onSelect=${(x) => setCur(x.id)} onClose=${() => setCur('')} inQueue=${queue.includes(cur)} onQueue=${() => add(cur)} />
    </div>`;
  }

  // ---------------------------------------------------------------- 体系
  function Systems({ tab, q }) {
    const [ok, setOk] = useState(!!window.SG_SYS);
    useEffect(() => { if (!ok) loadScript('data/systems.js').then(() => setOk(true)).catch((e) => toast(e.message)); }, []);
    return html`<div>
      <div class="page-head"><div><i class="eyebrow">03 · POWER SYSTEMS</i><h1>力量体系</h1><p>境界对照、逐阶战力参考，以及六十余种体系的详细介绍。</p></div></div>
      <nav class="tabs" aria-label="体系分页"><a href="#/systems" aria-current=${tab === 'realm' ? 'page' : null}>境界对照</a><a href="#/systems/power" aria-current=${tab === 'power' ? 'page' : null}>战力参考</a><a href="#/systems/intro" aria-current=${tab === 'intro' ? 'page' : null}>体系介绍</a></nav>
      ${!ok ? html`<div class="empty">正在载入……</div>` : tab === 'power' ? html`<${Power} />` : tab === 'intro' ? html`<${SysIntro} s=${q.s} />` : html`<${Realm} />`}
    </div>`;
  }
  function Realm() {
    const R = window.SG_SYS.realm;
    const [f, setF] = useState('');
    const [hov, setHov] = useState(null);
    const rows = R.systems.filter((s) => !f || s.name.includes(f));
    return html`<div>
      <div class="realm-tools"><input class="input" placeholder="筛选体系名称" value=${f} onInput=${(e) => setF(e.target.value)} aria-label="筛选体系" /><span class="label">格子跨越几列，表示该境界覆盖的战力区间。悬停可高亮对应档位。</span></div>
      <div class="realm-scroll"><table class="realm-t"><thead><tr><th class="sys">体系</th>${R.tiers.map((t, k) => html`<th class=${hov && k >= hov[0] && k < hov[0] + hov[1] ? 'hl' : ''}>${t}</th>`)}</tr></thead>
        <tbody>${rows.map((s) => {
          const tds = []; let col = 0;
          for (const c of s.cells) {
            while (col < c.from) { tds.push(html`<td></td>`); col++; }
            const span = Math.min(c.span, 18 - col);
            const from = col;
            tds.push(html`<td class="f" colspan=${span} onMouseEnter=${() => setHov([from, span])} onMouseLeave=${() => setHov(null)}>${c.text}</td>`);
            col += span;
          }
          while (col < 18) { tds.push(html`<td></td>`); col++; }
          const cont = s.name.endsWith('（续）');
          return html`<tr><td class=${'sys' + (cont ? ' cont' : '')}>${cont ? '〃 ' + s.name.replace('（续）', '') : s.name}</td>${tds}</tr>`;
        })}</tbody></table></div>
    </div>`;
  }
  function Power() {
    const P = window.SG_SYS.power;
    return html`<div><div class="tiers">${P.map((t) => html`<div class="tier-w"><h3>${t.k}</h3><dl>${t.rows.map(([a, b]) => html`<dt>${a}</dt><dd>${b.split(/\n+/).map((p, k) => html`${k ? html`<br />` : null}${p}`)}</dd>`)}</dl></div>`)}</div>
      <div class="home-sec" style="padding-top:0"><h2>对标示例角色</h2><table class="realm-t" style="min-width:0;width:100%"><tbody>${window.SG_SYS.bench.map(([k, v]) => html`<tr><td class="sys" style="position:static">${k}</td><td style="text-align:left">${v.join('　')}</td></tr>`)}</tbody></table></div></div>`;
  }
  function SysIntro({ s }) {
    const S = window.SG_SYS.sections;
    const [f, setF] = useState('');
    const k = Math.min(S.length - 1, Math.max(0, +(s || 0)));
    const sec = S[k];
    const body = [];
    for (const r of sec.rows) {
      const c = r.cells;
      if (r.single) {
        if (c[0].length <= 16 && !/[，。]/.test(c[0])) body.push(html`<h3>${c[0]}</h3>`);
        else c[0].split(/\n+/).filter(Boolean).forEach((p) => body.push(html`<p>${p}</p>`));
      } else if (c.length >= 3) body.push(html`<div class="ent"><b>${c[0]}</b><div><div class="c">${c[1]}</div>${c.slice(2).join('\n').split(/\n+/).filter(Boolean).map((p) => html`<p>${p}</p>`)}</div></div>`);
      else body.push(html`<div class="ent"><b>${c[0]}</b><div>${(c[1] || '').split(/\n+/).filter(Boolean).map((p) => html`<p>${p}</p>`)}</div></div>`);
    }
    return html`<div class="sys-layout">
      <div class="sys-list"><input class="input" placeholder="筛选" value=${f} onInput=${(e) => setF(e.target.value)} style="margin-bottom:10px" aria-label="筛选体系" />
        ${S.map((x, i) => (!f || x.title.includes(f)) ? html`<button aria-pressed=${i === k} onClick=${() => go('/systems/intro?s=' + i)}>${x.title.replace(/体系介绍$|体系$/, '')}</button>` : null)}</div>
      <div class="sys-body" key=${k}><h2>${sec.title}</h2>${body}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- 更新日志
  function Log() {
    const [ok, setOk] = useState(!!window.SG_LOG);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('');
    const [op, setOp] = useState('');
    const dq = useDebounced(q, 150);
    useEffect(() => { if (!ok) loadScript('data/changelog.js').then(() => setOk(true)).catch((e) => toast(e.message)); }, []);
    const rows = useMemo(() => {
      if (!ok) return [];
      const t = dq.trim();
      return window.SG_LOG.filter((r) => (!cat || r[3] === cat) && (!op || r[4] === op) && (!t || r[1].includes(t) || r[5].includes(t) || String(r[0]) === t));
    }, [ok, dq, cat, op]);
    const ref = useRef(); const [top, setTop] = useState(0); const [hgt, setHgt] = useState(800);
    useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setHgt(el.clientHeight)); ro.observe(el); return () => ro.disconnect(); }, [ok]);
    useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [rows]);
    const RH = 40, start = Math.max(0, Math.floor(top / RH) - 5), end = Math.min(rows.length, Math.ceil((top + hgt) / RH) + 5);
    const opCls = (o) => (o === '添加' ? 'add' : o === '删除' ? 'del' : 'adj');
    const vis = [];
    for (let k = start; k < end; k++) {
      const r = rows[k]; const it = BY_NAME.get(r[1]);
      vis.push(html`<div class="lrow" style=${'top:' + k * RH + 'px'} key=${k + ':' + r[0] + ':' + r[1]}>
        <span class="no">${r[0]}</span>${it ? html`<a onClick=${() => go('/catalog?id=' + encodeURIComponent(it.id))} title="在兑换图鉴中打开">${r[1]}</a>` : html`<span>${r[1]}</span>`}
        <span class="gar">${r[2]}</span><span>${r[3]}</span><span class=${'op ' + opCls(r[4])}>${r[4]}</span><span>${r[5]}</span><span class="dt">${r[6]}</span><span class="muted">${r[7]}</span></div>`);
    }
    const cats = ok ? [...new Set(window.SG_LOG.map((r) => r[3]).filter(Boolean))] : [];
    const ops = ok ? [...new Set(window.SG_LOG.map((r) => r[4]).filter(Boolean))] : [];
    return html`<div class="log-page">
      <div class="page-head"><div><i class="eyebrow">06 · CHANGELOG</i><h1>更新日志</h1><p class="log-sum">${ok ? `共 ${num(window.SG_LOG.length)} 条记录，当前显示 ${num(rows.length)} 条。点击条目名称可跳到兑换图鉴。` : '共 ——— 条记录，当前显示 ——— 条。点击条目名称可跳到兑换图鉴。'}</p></div></div>
      <div class="log-tools"><input class="input" type="search" placeholder="条目名称、作者或编号" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="搜索更新日志" />
        <${Select} label="分类" value=${cat} onChange=${setCat} options=${[['', '全部分类'], ...cats.map((c) => [c, c])]} />
        <${Select} label="操作" value=${op} onChange=${setOp} options=${[['', '全部操作'], ...ops.map((c) => [c, c])]} /></div>
      <div class="log-head"><span>编号</span><span>名称</span><span>支线</span><span>分类</span><span>操作</span><span>作者</span><span>日期</span><span>原因</span></div>
      <div class="vlist" ref=${ref} onScroll=${(e) => setTop(e.target.scrollTop)}><div style=${'height:' + rows.length * RH + 'px'}></div>${vis}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- 人物卡
  const SIX = ['智力', '精神力', '细胞活性', '神经反应速度', '肌肉组织强度', '免疫力强度'];
  const SIXS = ['智力', '精神力', '细胞活性', '神经反应', '肌肉强度', '免疫力'];
  const TALENTS = window.SG_FMT.TALENTS;
  const extraLabel = (n) => n.endsWith('天赋') ? n : n + '天赋';
  const KIND = { enh: '强化', items: '道具' };
  function blankChar() {
    return { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: '', player: '', age: '', body: '', nation: '', race: '人类', sex: '', job: '', world: '', story: '', points: '', grades: ['', '', '', '', ''],
      attrs: SIX.map(() => ({ base: '', enh: '', train: '', cap: '' })), schemaVersion: 2, talents: ['', '', '', ''], extraTalents: [['驾驶', '']], talentFloor: 50, skill: ['', ''], origin: ['', '', ''],
      main: [['', ''], ['', ''], ['', '']], minor: [['', ''], ['', ''], ['', '']], systems: [['基因锁', '', ''], ['', '', ''], ['', '', '']],
      enh: [], items: [], income: [], expense: [], npc: [], misc: '', portrait: '' };
  }
  // 导入的文件、本地存的旧数据都先过一遍：缺字段补齐、类型不对的丢掉。以前缺一列六维就会让整页白屏，而且存进浏览器后每次打开都白屏
  function normChar(o) {
    const b = blankChar();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return b;
    const s = (v) => (v == null || typeof v === 'object' ? '' : String(v));
    const list = (v, f, min = 0) => { const a = Array.isArray(v) ? v.map(f) : []; while (a.length < min) a.push(f(null)); return a; };
    const fix = (v, n) => list(v, s, n).slice(0, n);
    const row = (keys) => (e) => { const r = {}; for (const k of keys) r[k] = s(e && e[k]); return r; };
    const c = { id: s(o.id) || b.id };
    for (const k of ['name', 'player', 'age', 'body', 'nation', 'race', 'sex', 'job', 'world', 'story', 'points', 'misc']) c[k] = s(o[k]);
    if (o.race == null) c.race = b.race;
    c.portrait = typeof o.portrait === 'string' && /^(data:image\/|assets\/img\/)/.test(o.portrait) ? o.portrait : '';
    c.grades = fix(o.grades, 5); Object.assign(c, window.SG_FMT.normalizeTalents(o)); c.skill = fix(o.skill, 2); c.origin = fix(o.origin, 3);
    c.attrs = list(o.attrs, (a) => ({ base: s(a && a.base), enh: s(a && a.enh), train: s(a && a.train), cap: s(a && a.cap) }), 6).slice(0, 6);
    const pair = (m) => [s(m && m[0]), s(m && m[1])];
    c.main = list(o.main, pair, 3); c.minor = list(o.minor, pair);
    c.systems = list(o.systems, (r) => [s(r && r[0]), s(r && r[1]), s(r && r[2])]);
    c.enh = list(o.enh, row(['n', 'g', 'pts', 'lv', 'type', 'from', 'eff', 'note', 'id']));
    c.items = list(o.items, row(['n', 'g', 'pts', 'qty', 'type', 'from', 'eff', 'note', 'id']));
    const led = (x) => ({ n: s(x && x.n), src: s(x && x.src), pts: s(x && x.pts), g: fix(x && x.g, 5) });
    c.income = list(o.income, led); c.expense = list(o.expense, led);
    c.npc = list(o.npc, row(['n', 'who', 'rel']));
    return c;
  }
  function loadSample() {
    return loadScript('data/sample.js').then(() => normChar({ ...JSON.parse(JSON.stringify(window.SG_SAMPLE)), id: 'sample', portrait: 'assets/img/portrait.jpg' }));
  }
  const tot = (a) => ['base', 'enh', 'train'].reduce((s, k) => s + (+a[k] || 0), 0);
  const roll = (n, d) => { const r = []; for (let i = 0; i < n; i++) r.push(1 + Math.floor(Math.random() * d)); return r; };
  const ptsNum = (v) => { const t = String(v ?? '').replace(/[,，\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };
  const ptsShow = (v) => { const n = ptsNum(v); return n != null ? num(n) : String(v ?? ''); };
  const sumPts = (l) => l.reduce((s, x) => s + (+String(x.pts).replace(/\D/g, '') || 0), 0);
  const today = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  // 人物卡里的名字和图鉴对上号：先看关联的编号，再看同名（忽略空格、间隔号、书名号），最后去掉玩家加的括号注释再试一次
  const lite = (s) => String(s || '').toLowerCase().replace(/[\s•·・.。《》「」『』“”"'‘’【】]/g, '');
  const unbracket = (s) => String(s || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();
  const normGrade = (g) => { g = String(g || '').trim().toUpperCase(); return /^([ABCD])\1$/.test(g) ? '2' + g[0] : g; };
  let BY_LITE = null;
  function liteIndex() {
    if (!BY_LITE) { BY_LITE = new Map(); for (const x of ITEMS) { const k = lite(x.name); if (!BY_LITE.has(k)) BY_LITE.set(k, []); BY_LITE.get(k).push(x); } }
    return BY_LITE;
  }
  function resolveRow(r) {
    if (!r) return null;
    if (r.id && BY_ID.has(r.id)) return BY_ID.get(r.id);
    const n = String(r.n || '').trim(); if (!n) return null;
    const idx = liteIndex();
    const c = idx.get(lite(n)) || idx.get(lite(unbracket(n)));
    if (!c) return null;
    const g = normGrade(r.g);
    return c.find((x) => firstGrade(x.grade) === g) || c[0];
  }
  // 对不上时给几个相近的：包含关系优先，其余按两字组重合度
  function suggestFor(name, k = 6) {
    const q = lite(unbracket(name)); if (!q) return [];
    const big = (s) => { const a = [...s], o = new Set(); for (let i = 0; i < a.length - 1; i++) o.add(a[i] + a[i + 1]); if (a.length === 1) o.add(a[0]); return o; };
    const qb = big(q), out = [];
    for (const x of ITEMS) {
      const n = x.liteN || (x.liteN = lite(x.name));
      let s = 0;
      if (n === q) s = 3;
      else if (n.includes(q) || (n.length >= 2 && q.includes(n))) s = 1 + Math.min(n.length, q.length) / Math.max(n.length, q.length);
      else { const nb = x.big || (x.big = big(n)); let hit = 0; for (const b of qb) if (nb.has(b)) hit++; if (hit) s = (2 * hit) / (qb.size + nb.size); }
      if (s >= 0.34) out.push([s, x]);
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].i - b[1].i).slice(0, k).map((r) => r[1]);
  }
  // 人物卡里记的效果是不是图鉴原文（或其开头摘要）
  const sig = (t) => stripSource(String(t || '')).replace(/[\s，。、；：！？“”‘’（）《》【】,.;:!?()"'\-—…]/g, '');
  function dupText(own, desc) {
    const a = sig(own), b = sig(desc);
    if (!a || !b) return false;
    const k = Math.min(24, a.length, b.length);
    return b.includes(a.slice(0, k)) || a.includes(b.slice(0, k));
  }

  function radarSVG(vals, size = 150) {
    const c = size / 2, r = size * 0.33, pad = size * 0.2, max = Math.max(...vals, 1);
    const pt = (i, k) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k]; };
    let s = `<svg viewBox="${-pad} 0 ${size + pad * 2} ${size}" xmlns="http://www.w3.org/2000/svg">`;
    for (let k = 1; k <= 4; k++) s += `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => pt(i, k / 4).join(',')).join(' ')}" fill="none" stroke="${k === 4 ? '#050A18' : 'rgba(5,10,24,.2)'}" stroke-width="${k === 4 ? 0.9 : 0.45}"/>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${c}" y1="${c}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="rgba(5,10,24,.2)" stroke-width=".45"/>`;
    if (vals.some((v) => v)) {
      s += `<polygon points="${vals.map((v, i) => pt(i, Math.min(1, v / max)).join(',')).join(' ')}" fill="#3E9BE8" fill-opacity=".55" stroke="#050A18" stroke-width="1.2" stroke-linejoin="miter"/>`;
      vals.forEach((v, i) => { const [x, y] = pt(i, Math.min(1, v / max)); s += `<rect x="${x - 2}" y="${y - 2}" width="4" height="4" fill="#050A18"/>`; });
    }
    SIXS.forEach((l, i) => {
      const [x, y] = pt(i, 1.24); const anchor = Math.abs(x - c) < 2 ? 'middle' : x > c ? 'start' : 'end';
      s += `<text x="${x}" y="${y + 2}" font-size="${size * 0.058}" text-anchor="${anchor}" fill="#050A18" font-family="Song" font-weight="600">${l}</text>`;
      if (vals[i]) s += `<text x="${x}" y="${y + 2 + size * 0.07}" font-size="${size * 0.062}" text-anchor="${anchor}" fill="#12305C" font-family="Garamond" font-weight="600">${num(vals[i])}</text>`;
    });
    return s + '</svg>';
  }

  function sheetHTML(s) {
    const v = (x) => esc(x ?? '');
    const f = (lab, val = '', style = '') => `<div class="f" style="${style}"><span class="lab">${v(lab)}</span><span class="val">${v(val)}</span></div>`;
    const totals = s.attrs.map(tot);
    const rows = (n, data, cols) => Array.from({ length: Math.max(n, data.length) }, (_, i) => `<tr>${cols.map((c) => `<td>${data[i] ? esc(c(data[i]) ?? '') : ''}</td>`).join('')}</tr>`).join('');
    const filled = ' filled';
    // 强化项目：方印 + 名称的小块，主要三项实心方印，次要描边（和网页上的强化项目同一套样子）
    const tile = (m, main) => { const g = normGrade(m[1]); return `<div class="et-t${main ? ' m' : ''}"><b class="${[...g].length >= 3 ? 'l3' : ''}">${v(g || '—')}</b><span>${v(m[0])}</span></div>`; };
    const minor = s.minor.filter((m) => m[0] || m[1]);
    const p1 = `<section class="sheet${filled}">
    <div class="hd"><b>曙光　人物卡</b><span>轮回者档案　第一页</span></div>
    <div class="grid" style="grid-template-columns: 46mm 1fr 52mm; gap: 3mm">
      <div class="portrait-box" style="height: 62mm">${s.portrait ? `<img src="${esc(s.portrait)}" alt="">` : '立绘'}</div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; align-content: start">
        ${f('姓名', s.name)}${f('玩家', s.player)}${f('年龄', s.age)}${f('体型', s.body)}${f('国籍', s.nation)}${f('种裔', s.race)}${f('性别', s.sex)}${f('身份', s.job)}
        ${f('世界观', s.world, 'grid-column: span 2')}
        <div style="grid-column: span 2"><span class="lab">剩余奖励点 ／ 剩余支线剧情</span>
          <div class="grid" style="grid-template-columns: 22mm 1fr; gap: 1.6mm; margin-top: .8mm"><div class="box" style="display:flex;align-items:center;justify-content:center;font:500 13pt Garamond">${v(s.points)}</div>
          <div class="grades">${['S', 'A', 'B', 'C', 'D'].map((g, i) => `<div><b>${g}</b><i>${v(s.grades[i])}</i></div>`).join('')}</div></div></div>
      </div>
      <div class="radar box" style="height: 62mm; padding: 1mm">${radarSVG(totals)}</div>
    </div>
    <div class="sec">身体素质</div>
    <div class="attr6">${s.attrs.map((a, i) => `<div><div class="an">${SIXS[i]}</div><div class="tot">${totals[i] ? num(totals[i]) : ''}</div>${[['初始', 'base'], ['强化', 'enh'], ['锻炼', 'train'], ['上限', 'cap']].map(([l, key]) => `<div class="ln"><span>${l}</span><i>${v(a[key])}</i></div>`).join('')}</div>`).join('')}</div>
    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 3mm">
      <div><div class="sec">基础天赋</div>
        <div class="grid" style="grid-template-columns: repeat(4, 1fr)">${TALENTS.map((k, i) => f(k, s.talents[i])).join('')}</div>
        <div class="sec">额外天赋 · 主神选开</div>
        <div class="grid" style="grid-template-columns: repeat(2, 1fr)">${s.extraTalents.filter(([n, v]) => n || v).map(([n, v]) => f(extraLabel(n), v)).join('')}</div>
        <div class="grid" style="grid-template-columns: 2fr 1fr 1fr 1fr; margin-top: 1.2mm">${f('初始技能', s.skill[0])}${f('技能数值', s.skill[1])}${f('位面能级', s.origin[1])}${f('文明等级', s.origin[2])}</div>
        ${f('源位面', s.origin[0])}
      </div>
      <div><div class="sec">强化项目</div>
        <div class="et-l">主要</div><div class="et">${s.main.map((m) => tile(m, true)).join('')}</div>
        <div class="et-l">次要</div><div class="et">${(minor.length ? minor : [['', ''], ['', ''], ['', '']]).map((m) => tile(m, false)).join('')}</div></div>
    </div>
    <div class="sec">修炼体系</div>
    <table><thead><tr><th style="width:36mm">体系</th><th style="width:46mm">境界</th><th>备注（招式、心灵之光、熟练度等）</th></tr></thead><tbody>${rows(6, s.systems, [(r) => r[0], (r) => r[1], (r) => r[2]])}</tbody></table>
    <div class="sec">人物背景</div>
    <div class="box lines" style="flex: 1; min-height: 18mm; padding: 1.4mm 2mm; font: 400 7.6pt/5.8mm Kai">${v((s.story || '').replace(/\n+/g, ' '))}</div>
    <div class="foot"><span>曙光 · 无限流跑团规则书</span><span>人物卡 · 1／2</span></div></section>`;
    const g5 = (x) => x.g || ['', '', '', '', ''];
    const p2 = `<section class="sheet${filled}">
    <div class="hd"><b>强化与道具</b><span>轮回者档案　第二页</span></div>
    <div class="sec">血统 ／ 职业 ／ 改造 ／ 功法 ／ 技能 ／ 能量</div>
    <table><thead><tr><th style="width:40mm">名称</th><th style="width:11mm">等级</th><th style="width:14mm">奖励点</th><th style="width:12mm">熟练度</th><th style="width:12mm">类别</th><th style="width:16mm">来源</th><th>效果摘要</th></tr></thead>
    <tbody>${rows(12, s.enh, [(e) => e.n, (e) => e.g, (e) => e.pts, (e) => e.lv, (e) => e.type, (e) => e.from, (e) => e.eff])}</tbody></table>
    <div class="sec">装备 ／ 道具</div>
    <table><thead><tr><th style="width:44mm">名称</th><th style="width:11mm">等级</th><th style="width:10mm">数量</th><th style="width:22mm">类别</th><th style="width:16mm">来源</th><th>效果摘要</th></tr></thead>
    <tbody>${rows(7, s.items, [(e) => e.n, (e) => e.g, (e) => e.qty, (e) => e.type, (e) => e.from, (e) => e.eff])}</tbody></table>
    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 3mm">
      <div><div class="sec">收入记录</div><table><thead><tr><th style="width:7mm">场</th><th>来源</th><th style="width:12mm">奖励点</th>${['S', 'A', 'B', 'C', 'D'].map((g) => `<th style="width:4.6mm">${g}</th>`).join('')}</tr></thead>
        <tbody>${rows(10, s.income, [(x) => x.n, (x) => x.src, (x) => x.pts, ...[0, 1, 2, 3, 4].map((k) => (x) => g5(x)[k])])}</tbody></table></div>
      <div><div class="sec">支出记录</div><table><thead><tr><th style="width:7mm">场</th><th>去向</th><th style="width:12mm">奖励点</th>${['S', 'A', 'B', 'C', 'D'].map((g) => `<th style="width:4.6mm">${g}</th>`).join('')}</tr></thead>
        <tbody>${rows(10, s.expense, [(x) => x.n, (x) => x.src, (x) => x.pts, ...[0, 1, 2, 3, 4].map((k) => (x) => g5(x)[k])])}</tbody></table></div>
    </div>
    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 3mm; flex: 1">
      <div style="display:flex;flex-direction:column"><div class="sec">人脉 ／ 势力 ／ 好感度</div><table><thead><tr><th style="width:8mm">场次</th><th>人物或势力</th><th>关系 ／ 状态</th></tr></thead><tbody>${rows(4, s.npc, [(x) => x.n, (x) => x.who, (x) => x.rel])}</tbody></table></div>
      <div style="display:flex;flex-direction:column"><div class="sec">杂项记录</div><div class="box lines" style="flex:1; min-height: 28mm; padding: 1.4mm 2mm; font: 400 7.6pt/5.8mm Kai">${v(s.misc)}</div></div>
    </div>
    <div class="foot"><span>曙光 · 无限流跑团规则书</span><span>人物卡 · 2／2</span></div></section>`;
    return p1 + p2;
  }

  // 导出用的整理好的数据：兑换项对上图鉴，按需要补上图鉴原文；立绘统一成 data URL（file:// 下画布不能读本地图片）
  async function exportModel(c, withCat) {
    const keep = (list) => c[list].filter((r) => r.n || r.eff || r.note);
    const linked = [...keep('enh'), ...keep('items')].map(resolveRow).filter(Boolean);
    if (withCat) await Promise.all([...new Set(linked.map((x) => CATS.indexOf(x.cat)))].map(loadDesc));
    let portrait = c.portrait || '';
    if (portrait && !portrait.startsWith('data:')) {
      if (portrait === 'assets/img/portrait.jpg') await loadScript('data/portrait.js').catch(() => {});
      portrait = portrait === 'assets/img/portrait.jpg' && window.SG_PORTRAIT ? window.SG_PORTRAIT : location.protocol === 'file:' ? '' : portrait;
    }
    const rows = (list) => keep(list).map((r) => {
      const it = resolveRow(r);
      let eff = r.eff || '', catText = '';
      if (withCat && it && it.desc) {
        if (!eff) catText = it.desc;
        else if (dupText(eff, it.desc)) { if (sig(eff).length < sig(it.desc).length * 0.9) { eff = ''; catText = it.desc; } }
        else catText = it.desc;
      }
      return { n: r.n, g: normGrade(r.g) || r.g, pts: r.pts, lv: r.lv || '', qty: r.qty || '', type: r.type, from: r.from, note: r.note || '', eff, catText, cat: it ? { id: it.id, no: fmtNo(it.id), name: it.name, src: it.src || '' } : null };
    });
    return {
      title: c.name || '未命名角色', player: c.player, date: today(), site: 'shuguang.rnglg2.top', withCat,
      info: [['姓名', c.name], ['玩家', c.player], ['年龄', c.age], ['体型', c.body], ['国籍', c.nation], ['种裔', c.race], ['性别', c.sex], ['身份', c.job], ['世界观', c.world]],
      portrait,
      attrs: c.attrs.map((a, i) => ({ k: SIXS[i], full: SIX[i], base: a.base, enh: a.enh, train: a.train, cap: a.cap, tot: tot(a) })),
      talents: TALENTS.map((k, i) => [k, c.talents[i]]),
      extraTalents: c.extraTalents.filter(([n, v]) => n || v).map(([n, v]) => [extraLabel(n), v]),
      skill: [['初始技能', c.skill[0]], ['技能数值', c.skill[1]]],
      origin: [['源位面', c.origin[0]], ['位面能级', c.origin[1]], ['文明等级', c.origin[2]]],
      points: c.points, grades: ['S', 'A', 'B', 'C', 'D'].map((g, i) => [g, c.grades[i]]),
      main: c.main.filter((m) => m[0] || m[1]).map((m) => [m[0], normGrade(m[1]) || m[1]]), minor: c.minor.filter((m) => m[0] || m[1]).map((m) => [m[0], normGrade(m[1]) || m[1]]),
      systems: c.systems.filter((r) => r.some(Boolean)), story: c.story,
      enh: rows('enh'), items: rows('items'),
      income: c.income.filter((x) => x.n || x.src || x.pts), expense: c.expense.filter((x) => x.n || x.src || x.pts),
      totals: { in: sumPts(c.income), out: sumPts(c.expense) },
      npc: c.npc.filter((x) => x.who || x.rel), misc: c.misc,
    };
  }
  function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  const fileBase = (c) => (c.name || '人物卡').replace(/[\\/:*?"<>|]/g, '_');
  function exportJSON(c) {
    const b = new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' });
    const u = URL.createObjectURL(b); download(u, fileBase(c) + '.json'); setTimeout(() => URL.revokeObjectURL(u), 4000);
    toast('已导出 JSON：' + fileBase(c));
  }

  // 等级：方印样式的下拉（强化项目），或普通下拉（编辑兑换项）
  function GradePick({ value, onChange, label, seal, fill }) {
    const v = value || '';
    const opts = [['', '未定'], ...GRADES.map((g) => [g, g]), ['无支线', '无支线']];
    if (v && !opts.some((o) => o[0] === v)) opts.push([v, v]);
    if (!seal) return html`<${Select} label=${label} value=${v} options=${opts} onChange=${onChange} />`;
    const n = [...v].length;
    return html`<${Select} label=${label} value=${v} options=${opts} onChange=${onChange} display=${(x) => (!x ? '—' : x === '无支线' ? '无' : x)}
      className=${'sel-seal' + (fill ? ' fill' : '') + (!v || v === '无支线' ? ' none' : '') + (n >= 3 && v !== '无支线' ? ' l3' : n === 2 ? ' l2' : '')} />`;
  }

  const resultRow = (x, onClick, terms) => html`<li key=${x.id}><button class="vrow st" onClick=${onClick}>
    <${Seal} g=${x.grade || (x.req === '仅介绍' ? '仅介绍' : '')} />
    <div style="min-width:0"><div class="nm">${hl(x.name, terms)}</div><div class="pth">${short(x.cat)} · ${short(x.l2 || x.l1)}${x.l3 ? ' · ' + x.l3 : ''}${x.src ? '　《' + x.src + '》' : ''}</div></div>
    <div class="pts">${x.ptsN != null ? num(x.ptsN) : '—'}<small>${x.ptsN != null ? '奖励点' : x.req && x.req.length < 8 ? x.req : ''}</small></div>
  </button></li>`;

  function RowEditor({ row, kind, onPatch }) {
    const f = (k, label, ph = '', cls = '') => html`<label class=${'fld ' + cls}><span>${label}</span><input class="input" value=${row[k] || ''} placeholder=${ph} onInput=${(e) => onPatch({ [k]: e.target.value })} /></label>`;
    return html`<div class="fgrid c2 x-edit">
      ${f('n', '名称', '兑换项的名字', 'full')}
      <div class="fld"><span>等级</span><${GradePick} value=${row.g || ''} label="等级" onChange=${(g) => onPatch({ g })} /></div>
      ${f('pts', '奖励点', '例如 3000')}
      ${kind === 'enh' ? f('lv', '熟练度', '入门、小成、大成、圆满') : f('qty', '数量', '例如 1')}
      ${f('type', '类别', kind === 'enh' ? '职业、功法、技艺……' : '武器、杂物……')}
      ${f('from', '来源', '主神兑换、剧情世界……', 'full')}
      <label class="fld full"><span>效果</span><textarea class="input" rows="7" value=${row.eff || ''} onInput=${(e) => onPatch({ eff: e.target.value })}></textarea></label>
      <label class="fld full"><span>备注</span><textarea class="input x-note-in" rows="2" value=${row.note || ''} onInput=${(e) => onPatch({ note: e.target.value })}></textarea></label>
    </div>`;
  }

  // 人物卡里的条目弹窗：查看一行（对上图鉴就显示和图鉴一样的详情）、从图鉴添加、关联图鉴、自定义一行
  function SheetModal({ open, m, c, setM, close, ops, active }) {
    const [q, setQ] = useState('');
    const [draft, setDraft] = useState({});
    const [, redraw] = useState(0);
    const box = useRef();
    const qRef = useRef();
    const dq = useDebounced(q, 120);
    const view = m ? m.view : '';
    const nav = (x) => setM({ ...x, back: m });
    const back = () => setM(m.back || null);
    useEffect(() => { if (view === 'search') { setQ(m.q || ''); setTimeout(() => qRef.current && qRef.current.focus({ preventScroll: true }), 60); } }, [view, m && m.q, m && m.mode]);
    useEffect(() => { if (view === 'new') setDraft({ n: m.q || '', g: '', pts: '', lv: '', qty: '', type: '', from: '', eff: '', note: '' }); }, [view]);
    const row = m && m.view === 'row' ? (c[m.list] || [])[m.idx] : null;
    const it = m ? (m.view === 'entry' ? BY_ID.get(m.id) : m.view === 'row' ? resolveRow(row) : null) : null;
    useEffect(() => {
      if (!it || it.desc) return;
      let live = true;
      loadDesc(CATS.indexOf(it.cat)).then(() => live && redraw((n) => n + 1)).catch((e) => toast(e.message));
      return () => { live = false; };
    }, [it && it.id]);
    useLayoutEffect(() => { if (box.current && box.current.offsetWidth) fitStdCards(box.current); });
    const terms = useMemo(() => dq.trim().toLowerCase().split(/\s+/).filter(Boolean).map((t) => t.replace(/^([科魔辅娱])\s*0*(\d+)$/, '$1$2')), [dq]);
    const results = useMemo(() => {
      if (!terms.length) return [];
      const out = [];
      for (const x of ITEMS) { const s = matchItem(x, terms, false); if (s) out.push([x, s]); }
      return out.sort((a, b) => b[1] - a[1] || a[0].i - b[0].i).slice(0, 60).map((r) => r[0]);
    }, [terms]);
    if (!m) return html`<${Modal} open=${false} onDismiss=${close} label="" />`;

    const entry = (x) => html`
      <${EntryBody} item=${x} terms=${[]} />
      ${x.desc ? html`<div class="d-card" ref=${fitRef} dangerouslySetInnerHTML=${{ __html: cardHTML(x) }}></div>` : null}`;
    let label = 'ENTRY　·　兑换项', body = null, foot = null;

    if (view === 'row') {
      if (!row) body = html`<div class="empty">这一行已经删除。</div>`;
      else {
        const kind = m.list;
        const facts = [['等级', row.g], ['奖励点', ptsShow(row.pts)], kind === 'enh' ? ['熟练度', row.lv] : ['数量', row.qty], ['类别', row.type], ['来源', row.from]];
        const showOwn = row.eff && !(it && it.desc && dupText(row.eff, it.desc) && sig(row.eff).length <= sig(it.desc).length * 1.05);
        const del = () => askConfirm('删除“' + (row.n || '这一行') + '”？', '删除').then((ok) => {
          if (!ok) return;
          const { list, idx } = m;
          close(); toast('已删除：' + (row.n || '未命名'));
          setTimeout(() => ops.delRow(list, idx), 280);
        });
        const relink = () => nav({ view: 'search', mode: 'link', list: kind, idx: m.idx, q: unbracket(row.n) });
        const sugg = !it && !m.edit ? suggestFor(row.n) : [];
        body = html`<div class="x-view" ref=${box}>
          <div class="x-rec">
            <div class="x-rec-top"><span class="x-tag">${KIND[kind]} · ${String(m.idx + 1).padStart(2, '0')}</span><b>人物卡记录</b>${it && !m.edit ? html`<span class="x-linked">${row.id ? '已关联' : '按名称对上'} ${fmtNo(it.id)}</span>` : null}</div>
            ${m.edit ? html`<${RowEditor} row=${row} kind=${kind} onPatch=${(p) => ops.setRow(kind, m.idx, p)} />`
              : it ? html`<dl class="x-facts">${facts.filter(([, v]) => v).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : null}
          </div>
          ${m.edit ? null : it ? html`
            <div class="x-sep"><span>图鉴条目</span>${row.id ? null : html`<button class="x-mini" onClick=${relink}>不是这一条？</button>`}</div>
            ${entry(it)}
            ${showOwn ? html`<div class="x-own"><div class="label">人物卡里记的效果</div><div class="d-body">${renderDesc(row.eff, [])}</div></div>` : null}
            ${row.note ? html`<div class="label">备注</div><div class="d-attr">${row.note}</div>` : null}`
          : html`
            <div class="d-head"><div><h2>${row.n || '未命名'}</h2>${row.type || row.from ? html`<div class="src">${[row.type, row.from].filter(Boolean).join(' · ')}</div>` : null}</div><${Seal} g=${row.g || ''} big /></div>
            <div class="d-facts">${facts.slice(0, 3).map(([k, v]) => html`<div><span class="label">${k}</span><b class=${/^[0-9A-Z,\/]+$/.test(v || '') ? '' : 't'}>${v || '—'}</b></div>`)}</div>
            <div class="d-body">${row.eff ? renderDesc(row.eff, []) : html`<p class="x-quiet">人物卡里没有记效果。点下面的「编辑」可以补上。</p>`}</div>
            ${row.note ? html`<div class="label">备注</div><div class="d-attr">${row.note}</div>` : null}
            <div class="x-miss">
              <div class="x-sep"><span>图鉴里没有同名条目</span></div>
              <p>可能是剧情世界里得到的、自制的，或者名字和图鉴写法不一样。${sugg.length ? '下面是名字相近的条目，点开确认后可以关联到这一行。' : ''}</p>
              ${sugg.length ? html`<ul class="x-results">${sugg.map((x) => resultRow(x, () => nav({ view: 'entry', id: x.id, mode: 'link', list: kind, idx: m.idx })))}</ul>` : null}
              <button class="btn small" onClick=${relink}><${Icon} n="search" />在图鉴里搜索</button>
            </div>`}
        </div>`;
        foot = html`
          <button class="btn small" onClick=${() => setM({ ...m, edit: !m.edit })}><${Icon} n=${m.edit ? 'check' : 'edit'} />${m.edit ? '完成编辑' : '编辑'}</button>
          <button class="btn small" onClick=${del}><${Icon} n="trash" />删除</button>
          
          <span class="sp"></span>
          <button class="btn small primary" onClick=${close}>关闭</button>`;
      }
    } else if (view === 'entry' && it) {
      const add = m.mode === 'add', link = m.mode === 'link';
      label = add ? 'ADD　·　从图鉴添加' : link ? 'LINK　·　关联图鉴条目' : 'ENTRY　·　兑换项';
      body = html`<div class="x-view" ref=${box}>
        ${link ? html`<p class="x-hint">确认是这一条，就点下面的「关联到这一行」。人物卡里记的等级、熟练度和效果都会保留。</p>` : null}
        ${entry(it)}</div>`;
      const suggestEnh = it.cat === '辅助类';
      const addTo = (list) => {
        const x = it;
        const r = { n: x.name, g: x.grade || '无支线', pts: x.ptsN != null ? String(x.ptsN) : (x.pts || '').split('\n')[0], type: list === 'enh' ? short(x.l1 || '') : short(x.cat.replace('类', '') + '／' + (x.l2 || x.l1 || '')), from: '主神兑换', eff: x.desc ? cardText(x, 80) : '', note: '', id: x.id };
        if (list === 'enh') r.lv = ''; else r.qty = '1';
        ops.addRow(list, r);
        toast('已加入' + KIND[list] + '：' + x.name);
        back();
      };
      foot = add ? html`
          <button class="btn small" onClick=${back}>返回</button><span class="sp"></span>
          <button class=${'btn small' + (suggestEnh ? ' primary' : '')} onClick=${() => addTo('enh')}><${Icon} n="plus" />加入强化</button>
          <button class=${'btn small' + (suggestEnh ? '' : ' primary')} onClick=${() => addTo('items')}><${Icon} n="plus" />加入道具</button>`
        : link ? html`
          <button class="btn small" onClick=${back}>返回</button><span class="sp"></span>
          <button class="btn small primary" onClick=${() => { ops.setRow(m.list, m.idx, { id: it.id }); toast('已关联：' + it.name); setM({ view: 'row', list: m.list, idx: m.idx }); }}><${Icon} n="check" />关联到这一行</button>`
        : html`
          <span class="sp"></span>
          <button class="btn small primary" onClick=${close}>关闭</button>`;
    } else if (view === 'search') {
      const add = m.mode === 'add';
      label = add ? 'ADD　·　从图鉴添加' : 'LINK　·　关联图鉴条目';
      body = html`<div class="x-view x-search">
        <div class="search"><${Icon} n="search" cls="lead" />
          <input class="input" type="search" ref=${qRef} placeholder="搜索图鉴：名称、出处或编号" aria-label="搜索图鉴" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && results[0]) nav({ view: 'entry', id: results[0].id, mode: m.mode, list: m.list, idx: m.idx, q }); }} autocomplete="off" />
          ${q ? html`<button class="clear" aria-label="清除搜索" onClick=${() => { setQ(''); qRef.current && qRef.current.focus(); }}><${Icon} n="x" /></button>` : null}</div>
        <div class="x-meta">${terms.length ? html`<span><b>${results.length >= 60 ? '60+' : results.length}</b> 条</span>` : html`<span>${add ? '找到条目后点开确认，再选加入强化或道具。' : '找到对应的条目，点开确认后关联。'}</span>`}
          ${add ? html`<button class="btn small" onClick=${() => setM({ view: 'new', list: 'enh', q: q.trim(), back: { ...m, q } })}><${Icon} n="edit" />自定义一行</button>` : null}</div>
        ${results.length ? html`<ul class="x-results">${results.map((x) => resultRow(x, () => setM({ view: 'entry', id: x.id, mode: m.mode, list: m.list, idx: m.idx, back: { ...m, q } }), terms))}</ul>`
          : terms.length ? html`<div class="empty">图鉴里没有符合的条目。${add ? '没收录的可以「自定义一行」。' : ''}</div>` : null}
      </div>`;
      foot = html`<span class="sp"></span><button class="btn small primary" onClick=${m.back ? back : close}>${m.back ? '返回' : '完成'}</button>`;
    } else if (view === 'new') {
      label = 'NEW　·　自定义一行';
      body = html`<div class="x-view">
        <p class="x-hint">图鉴里没有的兑换项（剧情世界奖励、自制道具、活动兑换……）可以自己写一行，导出和打印都会带上。</p>
        <div class="x-kind" role="group" aria-label="加到哪一栏">${['enh', 'items'].map((k) => html`<button class="chip" aria-pressed=${m.list === k} onClick=${() => setM({ ...m, list: k })}>${KIND[k]}</button>`)}</div>
        <${RowEditor} row=${draft} kind=${m.list} onPatch=${(p) => setDraft((d) => ({ ...d, ...p }))} />
      </div>`;
      foot = html`<button class="btn small" onClick=${back}>返回</button><span class="sp"></span>
        <button class="btn small primary" disabled=${!String(draft.n || '').trim()} onClick=${() => {
          const r = { ...draft, n: draft.n.trim() };
          if (m.list === 'enh') delete r.qty; else delete r.lv;
          const idx = ops.addRow(m.list, r);
          toast('已加入' + KIND[m.list] + '：' + r.n);
          setM({ view: 'row', list: m.list, idx });
        }}><${Icon} n="plus" />加入${KIND[m.list]}</button>`;
    } else body = html`<div class="empty">找不到这个条目。</div>`;

    const key = [view, m.list, m.idx, m.id, m.mode, m.edit ? 'e' : ''].join('|');
    const sequence = ['enh', 'items'].flatMap((list) => c[list].map((row, idx) => ({ key: list + idx, item: resolveRow(row), target: { view: 'row', list, idx } })));
    for (const slot of [...c.main, ...c.minor]) { const x = resolveRow({ n: slot[0] }); if (x && !sequence.some((s) => s.item?.id === x.id)) sequence.push({ key: x.id, item: x, target: { view: 'entry', id: x.id } }); }
    const entryKey = view === 'row' ? m.list + m.idx : it?.id;
    const select = (x) => setM(x.target || sequence.find((s) => s.item?.id === x.item.id)?.target || { view: 'entry', id: x.item.id });
    return html`<${Modal} open=${open} suspended=${!active} onDismiss=${close} label=${label} cls="x-wide entry-modal" bodyKey=${m.edit ? 'edit' : view === 'row' || view === 'entry' ? 'entry' : view} foot=${foot}>
      ${(view === 'row' || view === 'entry') && !m.edit ? html`<${EntryExplorer} item=${it} entryKey=${entryKey} sequence=${sequence} onSelect=${select}>${body}</${EntryExplorer}>` : html`<div key=${key}>${body}</div>`}
    </${Modal}>`;
  }

  const FORMATS = [['png', 'PNG', '长图', '发到群里，手机上直接看'], ['pdf', 'PDF', 'A4 文档', '分页排好，可以打印'], ['xlsx', 'XLSX', 'Excel 表格', '强化、道具、收支分表，可以接着改'], ['json', 'JSON', '数据备份', '可以再导入网页']];
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function ExportPanel({ open, c, onClose, onPrint }) {
    const [withCat, setWithCat] = useState(() => store.get('sg.exp.cat', true));
    const [busy, setBusy] = useState('');
    const [res, setRes] = useState(null);
    useEffect(() => { store.set('sg.exp.cat', withCat); }, [withCat]);
    useEffect(() => { if (open) setRes(null); }, [open]);
    useEffect(() => () => { if (res) res.files.forEach((f) => URL.revokeObjectURL(f.url)); }, [res]);
    const canShare = useMemo(() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); } catch (e) { return false; } }, []);
    const run = async (kind) => {
      if (busy) return;
      if (kind === 'json') { exportJSON(c); return; }
      setBusy('正在生成……');
      try {
        await loadScript('assets/export.js');
        const M = await exportModel(c, withCat);
        const base = fileBase(c);
        let files;
        if (kind === 'png') { const out = await window.SGX.png(M); files = out.map((o, i) => ({ blob: o.blob, w: o.w, h: o.h, name: base + (out.length > 1 ? `-${i + 1}` : '') + '.png', note: `${o.w} × ${o.h}` })); }
        else if (kind === 'pdf') { const o = await window.SGX.pdf(M, (i, n) => setBusy(`正在排版第 ${i} ／ ${n} 页……`)); files = [{ blob: o.blob, name: base + '.pdf', note: 'A4 · ' + o.pages + ' 页' }]; }
        else { const o = window.SGX.xlsx(M); files = [{ blob: o.blob, name: base + '.xlsx', note: o.sheets.length + ' 张表：' + o.sheets.join('、') }]; }
        files.forEach((f) => { f.url = URL.createObjectURL(f.blob); f.size = f.blob.size; });
        setRes({ kind, files });
        // 电脑上直接下载；手机上等玩家点「保存」，有的内置浏览器会把自动下载当成跳转
        if (matchMedia('(pointer: fine)').matches) files.forEach((f, i) => setTimeout(() => download(f.url, f.name), i * 300));
      } catch (e) { console.error(e); toast('导出失败：' + (e.message || e)); }
      setBusy('');
    };
    const share = (f) => navigator.share({ files: [new File([f.blob], f.name, { type: f.blob.type })], title: f.name }).catch(() => {});
    const name = FORMATS.find((f) => res && f[0] === res.kind);
    const body = res ? html`<div class="x-view xp">
        <div class="x-sep"><span>${name[2]}已生成</span><button class="x-mini" onClick=${() => setRes(null)}>换个格式</button></div>
        <ul class="xp-files">${res.files.map((f) => html`<li><span class="no-big xp-ext">${name[1]}</span><span class="xp-fn"><b>${f.name}</b><small>${kb(f.size)} · ${f.note}</small></span>
          <span class="xp-act"><a class="btn small primary" href=${f.url} download=${f.name}><${Icon} n="down" />保存</a>${canShare ? html`<button class="btn small" onClick=${() => share(f)}>分享</button>` : null}</span></li>`)}</ul>
        ${res.kind === 'png' ? res.files.map((f) => html`<figure class="xp-img"><img src=${f.url} width=${f.w} height=${f.h} alt=${f.name} /></figure>`) : null}
        <p class="xp-tip">${res.kind === 'png' ? '手机上可以直接长按图片保存或转发。' : ''}在 QQ 里打开时下载可能被拦截，可以点右上角「…」选「在浏览器打开」再导出。</p>
      </div>`
      : html`<div class="x-view xp">
        <p class="xp-lead">把「${c.name || '未命名角色'}」导出成文件。内容完整：基本信息、六维、强化项目、修炼体系、全部兑换项的效果，还有收支记录。</p>
        <div class="xp-grid">${FORMATS.map(([k, ext, t, d]) => html`<button class="xp-opt" disabled=${!!busy} onClick=${() => run(k)}><span class="no-big xp-ext">${ext}</span><b>${t}</b><span>${d}</span></button>`)}</div>
        <label class="check"><input type="checkbox" checked=${withCat} onChange=${(e) => setWithCat(e.target.checked)} />附上图鉴原文</label>
        <p class="xp-sub">兑换项对上图鉴条目时，把图鉴里的完整说明一起导出（人物卡里已经抄了全文的不会重复）。</p>
        <div class=${'xp-busy' + (busy ? ' on' : '')} aria-live="polite"><i></i><span>${busy}</span></div>
      </div>`;
    const foot = html`<button class="btn small" onClick=${onPrint}><${Icon} n="print" />打印</button><span class="sp"></span><button class="btn small primary" onClick=${onClose}>完成</button>`;
    return html`<${Modal} open=${open} onDismiss=${onClose} label="EXPORT　·　导出人物卡" cls="x-wide xp-dlg" bodyKey=${res ? 'res' : 'pick'} foot=${foot}>${body}</${Modal}>`;
  }

  // 多行字段随内容和容器宽度撑高，导入长文本后无需滚动单元格。
  function GrowText(props) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current;
      const fit = () => {
        if (!el.clientWidth) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + el.offsetHeight - el.clientHeight) + 'px';
      };
      fit();
      let width = el.clientWidth;
      const ro = new ResizeObserver(() => { if (el.clientWidth && el.clientWidth !== width) { width = el.clientWidth; fit(); } });
      ro.observe(el);
      document.fonts.ready.then(() => { if (el.isConnected) fit(); });
      return () => ro.disconnect();
    }, [props.value]);
    return html`<textarea ...${props} ref=${ref} rows="1" />`;
  }

  function Sheet({ q, active }) {
    const init = () => {
      const lib = store.get('sg.chars', null);
      if (lib && Array.isArray(lib.list) && lib.list.length) { const list = lib.list.map(normChar); return { list, cur: Math.min(Math.max(0, +lib.cur || 0), list.length - 1) }; }
      return { list: [blankChar()], cur: 0 };
    };
    const [lib, setLib] = useState(init);
    const [log, setLog] = useState('');
    const [deck, setDeck] = useState(() => store.get('sg.sheet.deck', false));
    const [inlineOpen, setInlineOpen] = useState(new Set());
    const toggleSheetInline = (key) => setInlineOpen((v) => { const n = new Set(v); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const [m, setM] = useState(null);
    const [xp, setXp] = useState(false);
    const lastM = useRef(null);
    if (m) lastM.current = m;
    const prevRef = useRef();
    const warned = useRef(false);
    const [zoom, setZoom] = useState(() => { const w = innerWidth <= 1180 ? innerWidth - 68 : (innerWidth - 68) / 2; return Math.min(1, (w - 48) / 794); });
    useEffect(() => {
      if (q.sample !== '1') return;
      history.replaceState(null, '', '#/sheet');
      loadSample().then((s) => setLib((L) => {
        const k = L.list.findIndex((c) => c.id === 'sample');
        if (k < 0) return { list: [...L.list, s], cur: L.list.length };
        // 以前打开过的示例没有兑换项的效果文字，按名称补上（不覆盖玩家改过的内容）
        const old = L.list[k], list = L.list.slice();
        const fill = (key) => old[key].map((r) => { if (r.eff) return r; const f = s[key].find((x) => x.n === r.n); return f ? { ...r, eff: f.eff, note: r.note || f.note, pts: r.pts || f.pts } : r; });
        list[k] = { ...old, enh: fill('enh'), items: fill('items') };
        return { list, cur: k };
      })).catch((e) => toast(e.message));
    }, [q.sample]);
    useEffect(() => {
      if (!store.set('sg.chars', lib) && !warned.current) { warned.current = true; toast('浏览器存储已满，最近的修改没有保存。请先导出 JSON 备份，再删掉用不到的角色或立绘'); }
    }, [lib]);
    useLayoutEffect(() => {
      // 先同步量一次再监听：ResizeObserver 的第一次回调要等下一帧，预览会先按估算缩放画一帧再跳一下
      const el = prevRef.current; if (!el) return;
      const fit = () => { if (el.clientWidth) setZoom(Math.min(1, (el.clientWidth - 48) / 794)); };
      fit();
      const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
    }, []);
    const c = lib.list[lib.cur] || lib.list[0];
    useLayoutEffect(() => setLog(''), [c.id]);
    const previewHTML = useDebounced(useMemo(() => sheetHTML(c), [c]), 200);
    const set = (patch) => setLib((L) => { const list = L.list.slice(); list[L.cur] = { ...list[L.cur], ...patch }; return { ...L, list }; });
    const setIn = (key, idx, val) => { const arr = c[key].slice(); arr[idx] = val; set({ [key]: arr }); };
    const setAttr = (i, k, val) => { const a = c.attrs.map((x) => ({ ...x })); a[i][k] = val.replace(/[^\d]/g, ''); set({ attrs: a }); };
    const ops = {
      setRow: (list, i, p) => setLib((L) => { const ch = L.list[L.cur], rows = ch[list].slice(); const r = { ...rows[i], ...p }; if ('n' in p && !('id' in p) && rows[i].id) r.id = ''; rows[i] = r; const all = L.list.slice(); all[L.cur] = { ...ch, [list]: rows }; return { ...L, list: all }; }),
      addRow: (list, r) => { const idx = c[list].length; setLib((L) => { const ch = L.list[L.cur]; const all = L.list.slice(); all[L.cur] = { ...ch, [list]: [...ch[list], r] }; return { ...L, list: all }; }); return idx; },
      delRow: (list, i) => setLib((L) => { const ch = L.list[L.cur]; const all = L.list.slice(); all[L.cur] = { ...ch, [list]: ch[list].filter((_, j) => j !== i) }; return { ...L, list: all }; }),
    };
    const totals = c.attrs.map(tot);
    const baseSum = c.attrs.reduce((s, a) => s + (+a.base || 0), 0);
    const income = sumPts(c.income), expense = sumPts(c.expense);

    const fld = (label, key, cls = '', type = 'text') => html`<label class=${'fld ' + cls}><span>${label}</span><input class="input" type=${type} value=${c[key]} onInput=${(e) => set({ [key]: e.target.value })} /></label>`;
    const rollAttrs = () => { const r = roll(6, 200); set({ attrs: c.attrs.map((a, i) => ({ ...a, base: String(r[i]) })) }); setLog(`六维各掷 1d200：${r.map((x, i) => SIXS[i] + ' <b>' + x + '</b>').join('、')}，合计 <b>${r.reduce((a, b) => a + b, 0)}</b>`); };
    const rollTalents = () => {
      const r = TALENTS.map(() => roll(3, 100)).map((dice) => ({ dice, sum: dice.reduce((a, b) => a + b, 0) })).sort((a, b) => b.sum - a.sum);
      const values = r.map((x) => Math.max(c.talentFloor, x.sum));
      set({ talents: values.map(String) });
      setLog(r.map((x, i) => `${TALENTS[i]}：${x.dice.join(' + ')} = <b>${x.sum}</b>${x.sum < c.talentFloor ? ` → 保底 <b>${c.talentFloor}</b>` : ''}`).join('；') + `。合计 <b>${values.reduce((a, b) => a + b, 0)}</b>，按从高到低填入物、魔、神、科，可自行调换。`);
    };
    const rollSkill = () => { const r = roll(3, 100); setIn('skill', 1, String(r.reduce((a, b) => a + b, 0))); setLog(`初始技能 3d100：${r.join(' + ')} = <b>${r.reduce((a, b) => a + b, 0)}</b>`); };
    const setExtra = (i, k, value) => set({ extraTalents: c.extraTalents.map((r, j) => j === i ? r.map((v, n) => n === k ? value : v) : r) });
    const rollExt = (i) => {
      const r = roll(3, 100), value = r.reduce((a, b) => a + b, 0);
      setExtra(i, 1, String(value));
      setLog(`额外天赋 ${esc(c.extraTalents[i][0])} 3d100：${r.join(' + ')} = <b>${value}</b>（是否开放及骰法由主神决定）`);
    };
    // 群骰 .bd 指令：粘贴进来填人物卡；也能由当前人物卡生成一条复制到群里
    const [bd, setBd] = useState('');
    const bdOut = useMemo(() => window.SG_FMT.toBd(c), [c]);
    const applyBd = () => {
      const r = window.SG_FMT.parseBd(bd);
      if (!r) { toast('没读出属性，指令要写成 .bd 智力100 精神力100 …'); return; }
      const patch = {}, done = [], notes = [];
      if (r.attrs.some((v) => v != null)) {
        // 指令里是合计：保留已填的强化和锻炼，倒推初始值；倒推成负数就整项改成初始值
        patch.attrs = c.attrs.map((a, i) => {
          const v = r.attrs[i]; if (v == null) return a;
          const kept = (+a.enh || 0) + (+a.train || 0);
          if (+v - kept >= 0) return { ...a, base: String(+v - kept) };
          notes.push(SIXS[i]); return { ...a, base: v, enh: '', train: '' };
        });
        done.push('六维 ' + r.attrs.filter((v) => v != null).length + ' 项');
      }
      if (r.talents.some((v) => v != null)) { patch.talents = c.talents.map((v, i) => r.talents[i] ?? v); done.push('天赋 ' + r.talents.filter((v) => v != null).length + ' 项'); }
      if (r.drive != null) {
        const k = c.extraTalents.findIndex(([n]) => n === '驾驶' || n === '驾驶天赋');
        patch.extraTalents = k < 0 ? [...c.extraTalents, ['驾驶', r.drive]] : c.extraTalents.map((x, j) => (j === k ? [x[0], r.drive] : x));
        done.push('驾驶');
      }
      if (r.skill != null) { patch.skill = [c.skill[0], r.skill]; done.push('初始技能'); }
      if (r.points != null) { patch.points = r.points; done.push('奖励点'); }
      if (r.grades.some((v) => v != null)) { patch.grades = c.grades.map((v, i) => r.grades[i] ?? v); done.push('支线'); }
      set(patch);
      setBd('');
      toast('已填入：' + done.join('、'));
      setLog('已按 .bd 指令填入' + done.join('、') + '。'
        + (notes.length ? `${esc(notes.join('、'))}的合计比已填的强化 + 锻炼还小，这几项改成了只填初始值。` : '六维按合计填，已有的强化和锻炼保留不变。')
        + (r.unknown.length ? `没认出：${esc(r.unknown.join(' '))}。` : ''));
    };
    const copyBd = () => (navigator.clipboard ? navigator.clipboard.writeText(bdOut.text) : Promise.reject()).then(
      () => toast(bdOut.notNumber.length ? `已复制。${bdOut.notNumber.join('、')}不是数字，按 0 写入` : '已复制录入指令，发到群里即可'),
      () => toast('复制失败，请手动选择文字'));
    const [dice, setDice] = useState('3d100');
    const rollAny = () => { const mm = dice.match(/^(\d{1,2})d(\d{1,6})$/i); if (!mm) { setLog('骰子格式写成 3d100 这样'); return; } const r = roll(+mm[1], +mm[2]); setLog(`${dice}：${r.join(' + ')} = <b>${r.reduce((a, b) => a + b, 0)}</b>`); };

    const dynTable = (k, cols, wide) => html`<div class=${'dyn-wrap' + (wide ? ' wide' : '')}><table class="dyn"><thead><tr>${cols.map(([l, , w]) => html`<th style=${w ? 'width:' + w : ''}>${l}</th>`)}<th></th></tr></thead><tbody>
      ${c[k].map((row, i) => html`<tr>${cols.map(([l, f]) => html`<td><${GrowText} aria-label=${l} value=${f.includes('.') ? (row[f.split('.')[0]] || [])[+f.split('.')[1]] || '' : row[f] ?? ''} onInput=${(e) => {
        const list = c[k].map((r) => ({ ...r }));
        if (f.includes('.')) { const [a, b] = f.split('.'); const g = (list[i][a] || ['', '', '', '', '']).slice(); g[+b] = e.target.value; list[i][a] = g; } else list[i][f] = e.target.value;
        set({ [k]: list });
      }} /></td>`)}<td class="x"><button aria-label="删除这一行" onClick=${() => set({ [k]: c[k].filter((_, j) => j !== i) })}><${Icon} n="x" /></button></td></tr>`)}
    </tbody></table></div>`;
    const importFile = (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // 同一个文件再选一次也要触发
      if (!file) return;
      file.text().then(async (t) => {
        let o = JSON.parse(t.replace(/^﻿/, ''));
        const sheets = Array.isArray(o) ? o : o && Array.isArray(o.sheets) ? o.sheets : null;
        let from = '';
        if (sheets) {
          if (!window.SG_FMT.isRaw(sheets)) throw new Error('bad');
          o = window.SG_FMT.fromRaw(sheets); from = '（Excel 人物卡）';
        }
        if (!o || typeof o !== 'object' || !('name' in o || 'attrs' in o || 'enh' in o)) throw new Error('bad');
        const n = normChar({ ...o, id: 'c' + Date.now().toString(36) });
        setLib((L) => ({ list: [...L.list, n], cur: L.list.length }));
        toast(`已导入${from}：${n.name || '未命名'}，${n.enh.length} 项强化、${n.items.length} 件道具`);
      }).catch(() => toast('文件不是有效的人物卡 JSON'));
    };
    const printSheet = () => {
      setXp(false);
      const root = document.querySelector('.print-root'); root.innerHTML = sheetHTML(c);
      const imgs = [...root.querySelectorAll('img')];
      Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))).concat(loadFonts(root.textContent))).then(() => setTimeout(() => window.print(), 260));
    };
    useEffect(() => { const f = () => { document.querySelector('.print-root').innerHTML = ''; }; addEventListener('afterprint', f); return () => removeEventListener('afterprint', f); }, []);

    // 强化项目：保留等级和名称编辑；关联条目可就地展开，也可单独打开详情。
    const setSlot = (key, i, k, v) => { const a = c[key].map((x) => x.slice()); a[i][k] = v; set({ [key]: a }); };
    const slotTarget = (n) => {
      const nm = lite(unbracket(n)); if (!nm) return null;
      for (const list of ['enh', 'items']) { const i = c[list].findIndex((r) => r.n && (lite(r.n) === nm || lite(unbracket(r.n)) === nm)); if (i >= 0) return { view: 'row', list, idx: i }; }
      const it = resolveRow({ n }); return it ? { view: 'entry', id: it.id } : null;
    };
    const slot = (key, mm, i) => {
      const main = key === 'main', tg = slotTarget(mm[0]), what = (main ? '主要' : '次要') + '强化 ' + (i + 1);
      const row = tg?.view === 'row' ? c[tg.list][tg.idx] : null, it = row ? resolveRow(row) : tg ? BY_ID.get(tg.id) : null;
      const ik = c.id + '-' + key + i + '-' + mm[0], expanded = inlineOpen.has(ik), panel = 'slot-inline-' + key + i;
      return html`<div class="slot-entry" key=${key + i}><div class=${'eslot' + (main ? ' main' : '')}>
        ${main ? html`<span class="es-no">${String(i + 1).padStart(2, '0')}</span>` : null}
        <${GradePick} seal fill=${main} value=${mm[1]} label=${what + ' 等级'} onChange=${(g) => setSlot(key, i, 1, g)} />
        <${GrowText} class="es-in" value=${mm[0]} placeholder=${main ? '主要强化项目' : '次要强化项目'} aria-label=${what} onInput=${(e) => setSlot(key, i, 0, e.target.value)} />
        ${tg ? html`<button class="btn small slot-toggle" aria-expanded=${expanded} aria-controls=${panel} onClick=${() => toggleSheetInline(ik)}><${Chevron} />${expanded ? '收起' : '展开'}</button>` : null}
        <button class=${'es-btn' + (tg ? '' : ' off')} disabled=${!tg} aria-label=${'查看' + (mm[0] || '')} title="查看详情" onClick=${() => tg && setM(tg)}>详情</button>
        ${main ? null : html`<button class="es-btn x" aria-label=${'删除' + what} title="删除" onClick=${() => set({ minor: c.minor.filter((_, j) => j !== i) })}><${Icon} n="x" /></button>`}
      </div>${tg ? html`<${InlineEntry} key=${ik} id=${panel} open=${expanded} item=${it} row=${row} />` : null}</div>`;
    };
    const xrow = (list, r, i) => {
      const it = resolveRow(r);
      const ik = c.id + '-' + list + i + '-' + r.n, expanded = inlineOpen.has(ik), panel = 'sheet-inline-' + list + i;
      const eff = r.eff || '';
      const meta = [r.type, r.from, list === 'enh' ? r.lv && '熟练度 ' + r.lv : r.qty && '数量 ' + r.qty].filter(Boolean).join(' · ');
      const p = ptsShow(r.pts);
      return html`<li key=${list + i}><div class="inline-head"><button class="xrow" onClick=${() => toggleSheetInline(ik)} aria-expanded=${expanded} aria-controls=${panel} aria-label=${(expanded ? '收起 ' : '展开 ') + (r.n || '未命名')}>
        <${Seal} g=${r.g || (it && it.grade) || ''} />
        <span class="xr-t"><span class="xr-nm"><u>${r.n || '未命名'}</u>${it ? html`<i class="xr-no">${fmtNo(it.id)}</i>` : html`<i class="xr-no off">未收录</i>`}</span>
          <span class="xr-meta">${meta || (it ? short(it.l2 || it.l1) : '—')}</span>
          ${eff ? html`<span class="xr-eff">${eff}</span>` : it && it.src ? html`<span class="xr-eff">出自《${it.src}》</span>` : null}</span>
        <span class="xr-pts">${p || '—'}<small>${ptsNum(r.pts) != null ? '奖励点' : ''}</small></span>
      <${Chevron} /></button><button class="btn small inline-detail" onClick=${() => setM({ view: 'row', list, idx: i })}>详情</button></div>
      <${InlineEntry} key=${ik} id=${panel} open=${expanded} item=${it} row=${r} /></li>`;
    };
    const xlist = (list, title, sub) => html`<div class="x-sub"><b>${title}</b><span>${sub}</span><i>${c[list].length}</i></div>
      ${c[list].length ? deck ? html`<div class="deck-grid">${c[list].map((r, i) => { const it = resolveRow(r); return html`<button class="deck-card" onClick=${() => setM({ view: 'row', list, idx: i })}><span class="deck-art"><${Seal} g=${r.g || it?.grade || ''} /><${Icon} n="cards" /></span><b>${r.n || '未命名'}</b><span>${r.type || it?.l2 || it?.l1 || '自定义'}</span><small>${ptsShow(r.pts) || it?.pts || '—'} 奖励点</small></button>`; })}</div>` : html`<ul class="xlist">${c[list].map((r, i) => xrow(list, r, i))}</ul>`
        : html`<div class="x-empty"><span>还没有${title}。</span><button class="btn small" onClick=${() => setM({ view: 'search', mode: 'add' })}><${Icon} n="plus" />添加</button></div>`}`;
    const mm = m || lastM.current;

    return html`<div class="sheet-page">
      <div class="sheet-form">
        <div class="side-head"><i>04 · CHARACTER SHEET</i><h1>人物卡</h1></div>
        <div class="bar">
          <${Select} label="选择角色" value=${lib.cur} onChange=${(v) => setLib((L) => ({ ...L, cur: +v }))} options=${lib.list.map((x, i) => [i, x.name || '未命名角色'])} style="min-width:180px" />
          <button class="btn small" onClick=${() => setLib((L) => ({ list: [...L.list, blankChar()], cur: L.list.length }))}><${Icon} n="plus" />新建</button>
          <button class="btn small" onClick=${() => setLib((L) => ({ list: [...L.list, { ...JSON.parse(JSON.stringify(c)), id: blankChar().id, name: (c.name || '角色') + '（副本）' }], cur: L.list.length }))}><${Icon} n="copy" />复制</button>
          <button class="btn small" onClick=${() => askConfirm('删除“' + (c.name || '未命名角色') + '”？删除后无法恢复。', '删除').then((ok) => ok && setLib((L) => { const list = L.list.filter((_, i) => i !== L.cur); return { list: list.length ? list : [blankChar()], cur: 0 }; }))}><${Icon} n="trash" />删除</button>
          <a class="btn small" href="#/sheet?sample=1"><${Icon} n="user" />示例：白上未花</a>
          <label class="btn small"><${Icon} n="up" />导入<input type="file" accept="application/json,.json" hidden onChange=${importFile} /></label>
          <button class="btn small primary" onClick=${() => setXp(true)}><${Icon} n="down" />导出</button>
        </div>
        <p class="label">数据保存在本浏览器里；换电脑或清理浏览器数据前，请先导出 JSON 备份。网页导出的 JSON 和群里 Excel 人物卡转出的 JSON 都能导入。</p>

        <fieldset class="fs"><legend>基本信息</legend>
          <div class="fgrid">${fld('姓名', 'name')}${fld('玩家', 'player')}${fld('年龄', 'age')}${fld('体型', 'body')}${fld('国籍', 'nation')}${fld('种裔', 'race')}${fld('性别', 'sex')}${fld('身份', 'job')}${fld('世界观', 'world', 'wide')}
            <div class="fld wide"><span>立绘</span><span style="display:flex;gap:6px;align-items:center"><label class="btn small"><${Icon} n="up" />${c.portrait ? '更换立绘' : '上传立绘'}<input type="file" accept="image/*" hidden onChange=${(e) => { const fl = e.target.files[0]; e.target.value = ''; if (!fl) return; const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); const sc = Math.min(1, 600 / im.width); cv.width = im.width * sc; cv.height = im.height * sc; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); set({ portrait: cv.toDataURL('image/jpeg', 0.82) }); }; im.onerror = () => toast('这张图片打不开，换一张试试'); im.src = rd.result; }; rd.readAsDataURL(fl); }} /></label>${c.portrait ? html`<button class="btn small" onClick=${() => set({ portrait: '' })}><${Icon} n="x" />移除</button>` : null}</span></div>
            <label class="fld full"><span>人物背景</span><textarea class="input" value=${c.story} onInput=${(e) => set({ story: e.target.value })}></textarea></label></div>
        </fieldset>

        <fieldset class="fs"><legend>身体素质<span><button class="btn small" onClick=${rollAttrs}><${Icon} n="dice" />随机分配（6 × 1d200）</button></span></legend>
          <table class="attr-table"><thead><tr><th>属性</th><th>初始</th><th>强化</th><th>锻炼</th><th>锻炼上限</th><th>合计</th></tr></thead>
            <tbody>${SIX.map((n, i) => html`<tr><td>${n}</td>${['base', 'enh', 'train', 'cap'].map((k) => html`<td><input inputmode="numeric" aria-label=${n + k} value=${c.attrs[i][k]} onInput=${(e) => setAttr(i, k, e.target.value)} /></td>`)}<td class="tot">${totals[i] ? num(totals[i]) : ''}</td></tr>`)}</tbody></table>
          <div class="attr-sum"><span>初始属性合计 <b class=${baseSum > 1200 ? 'warn' : ''}>${baseSum}</b>　随机分配上限 1200，自由分配上限 700</span>${c.attrs.some((a) => a.base !== '' && +a.base < 50) ? html`<span class="warn">有属性低于 50</span>` : null}</div>
        </fieldset>

        <fieldset class="fs"><legend>基础天赋<span><button class="btn small" onClick=${rollTalents}><${Icon} n="dice" />四项天赋</button></span></legend>
          <div class="fgrid talents">${TALENTS.map((l, i) => html`<label class="fld"><span>${l}</span><input class="input" inputmode="numeric" value=${c.talents[i]} onInput=${(e) => setIn('talents', i, e.target.value)} /></label>`)}</div>
          <div class="deck-switch" role="group" aria-label="天赋保底">${[50, 100].map((n) => html`<button class="chip" aria-pressed=${c.talentFloor === n} onClick=${() => set({ talentFloor: n })}>保底 ${n}</button>`)}</div>
          <p class="fs-tip">物、魔、神（精神）、科四种基础天赋，各取三次 1–100 之和；保底由主神决定，仅用于新骰点。神系天赋用于精神力、灵魂力量体系。</p>
          <p class="fs-tip">精神天赋强化参照：50 → 精神力四初，100 → 半步四阶，150 → 三阶，200 → 二阶；250 可直接强化要求精神力者天赋的技能；300 在心灵之海人类的情况下可成为天生精神力控制者。具体由主神判定。</p>
        </fieldset>
        <div class="dice-log" aria-live="polite" dangerouslySetInnerHTML=${{ __html: log }}></div>
        <fieldset class="fs"><legend>额外天赋<span><button class="btn small" onClick=${() => set({ extraTalents: [...c.extraTalents, ['', '']] })}><${Icon} n="plus" />加天赋</button></span></legend>
          <p class="fs-tip">驾驶等额外选开天赋由主神决定是否开放；骰法由主神决定，快捷骰点采用 3d100，也可手动填写。</p>
          ${c.extraTalents.map(([n, v], i) => html`<div class="extra-talent">
            <label class="fld"><span>名称</span><input class="input" aria-label=${'额外天赋名称 ' + (i + 1)} value=${n} onInput=${(e) => setExtra(i, 0, e.target.value)} /></label>
            <label class="fld"><span>数值</span><input class="input" inputmode="numeric" aria-label=${'额外天赋数值 ' + (i + 1)} value=${v} onInput=${(e) => setExtra(i, 1, e.target.value)} /></label>
            <button class="btn small" aria-label=${'骰额外天赋 ' + (i + 1)} onClick=${() => rollExt(i)}><${Icon} n="dice" /></button>
            <button class="btn small" aria-label=${'删除额外天赋 ' + (i + 1)} onClick=${() => set({ extraTalents: c.extraTalents.filter((_, j) => j !== i) })}><${Icon} n="x" /></button>
          </div>`)}
        </fieldset>
        <fieldset class="fs"><legend>技能与位面<span><button class="btn small" onClick=${rollSkill}><${Icon} n="dice" />初始技能</button></span></legend>
          <div class="fgrid c3" style="margin-top:10px"><label class="fld"><span>初始技能</span><input class="input" value=${c.skill[0]} onInput=${(e) => setIn('skill', 0, e.target.value)} /></label><label class="fld"><span>技能数值</span><input class="input" inputmode="numeric" value=${c.skill[1]} onInput=${(e) => setIn('skill', 1, e.target.value)} /></label>
            <label class="fld"><span>通用骰</span><span style="display:flex;gap:6px"><input class="input" value=${dice} onInput=${(e) => setDice(e.target.value.trim())} aria-label="骰子，例如 3d100" /><button class="btn small" onClick=${rollAny} aria-label="掷骰"><${Icon} n="dice" />掷</button></span></label></div>
          <div class="fgrid c3" style="margin-top:10px">${['源位面', '位面能级', '文明等级'].map((l, i) => html`<label class="fld"><span>${l}</span><input class="input" value=${c.origin[i]} onInput=${(e) => setIn('origin', i, e.target.value)} /></label>`)}</div>
        </fieldset>

        <fieldset class="fs"><legend>奖励点与支线</legend>
          <div class="fgrid c3"><label class="fld"><span>剩余奖励点</span><input class="input" value=${c.points} onInput=${(e) => set({ points: e.target.value })} /></label></div>
          <div class="fgrid c5" style="margin-top:10px">${['S', 'A', 'B', 'C', 'D'].map((g, i) => html`<label class="fld"><span>${g} 级支线</span><input class="input" inputmode="numeric" value=${c.grades[i]} onInput=${(e) => setIn('grades', i, e.target.value)} /></label>`)}</div>
        </fieldset>

        <fieldset class="fs"><legend>强化项目<span><button class="btn small" onClick=${() => set({ minor: [...c.minor, ['', '']] })}><${Icon} n="plus" />加次要强化</button></span></legend>
          <div class="es-h"><b>主要</b><span>MAIN</span><i>点方印选等级；名字对上兑换项后，点展开看完整介绍，点详情可编辑</i></div>
          <div class="eslots main">${c.main.map((x, i) => slot('main', x, i))}</div>
          <div class="es-h"><b>次要</b><span>MINOR</span></div>
          ${c.minor.length ? html`<div class="eslots">${c.minor.map((x, i) => slot('minor', x, i))}</div>` : html`<div class="x-empty"><span>还没有次要强化。</span></div>`}
        </fieldset>

        <fieldset class="fs"><legend>修炼体系<span><button class="btn small" onClick=${() => set({ systems: [...c.systems, ['', '', '']] })}><${Icon} n="plus" />加一行</button></span></legend>
          <table class="dyn sys"><thead><tr><th>体系</th><th>境界</th><th>备注</th><th></th></tr></thead><tbody>${c.systems.map((r, i) => html`<tr>${[0, 1, 2].map((k) => html`<td><${GrowText} value=${r[k]} placeholder=${['体系', '境界', '备注'][k]} aria-label=${['体系', '境界', '备注'][k]} onInput=${(e) => { const a = c.systems.map((x) => x.slice()); a[i][k] = e.target.value; set({ systems: a }); }} /></td>`)}<td class="x"><button aria-label="删除这一行" onClick=${() => set({ systems: c.systems.filter((_, j) => j !== i) })}><${Icon} n="x" /></button></td></tr>`)}</tbody></table>
        </fieldset>

        <fieldset class="fs"><legend>强化与道具<span><button class="btn small primary" onClick=${() => setM({ view: 'search', mode: 'add' })}><${Icon} n="plus" />添加兑换项</button></span></legend>
          <div class="deck-switch" role="group" aria-label="兑换项视图">${[[false, '列表'], [true, '卡组']].map(([v, t]) => html`<button class="chip" aria-pressed=${deck === v} onClick=${() => { setDeck(v); store.set('sg.sheet.deck', v); }}>${t}</button>`)}</div>
          <p class="fs-tip">${deck ? '点卡片查看详情；用左右箭头或滑动切换，关闭后仍留在卡组。' : '点一项就地展开完整内容，再点收起；点「详情」可查看弹窗和编辑。可以从图鉴搜索添加，也可以自定义一行。'}</p>
          ${xlist('enh', '强化', '血统 · 职业 · 改造 · 功法 · 技能 · 能量')}
          ${xlist('items', '道具', '装备 · 道具')}
        </fieldset>

        <fieldset class="fs"><legend>收支记录<span class="label">收入 <b class="gar">${num(income)}</b>　支出 <b class="gar">${num(expense)}</b>　结余 <b class="gar">${num(income - expense)}</b></span></legend>
          <div class="label" style="margin-top:8px;display:flex;justify-content:space-between">收入<button class="btn small" onClick=${() => set({ income: [...c.income, { n: String(c.income.length + 1), src: '', pts: '', g: ['', '', '', '', ''] }] })}><${Icon} n="plus" />加一场</button></div>
          ${dynTable('income', [['场', 'n', '7%'], ['来源', 'src'], ['奖励点', 'pts', '12%'], ['S', 'g.0', '6%'], ['A', 'g.1', '6%'], ['B', 'g.2', '6%'], ['C', 'g.3', '6%'], ['D', 'g.4', '6%']], 1)}
          <div class="label" style="margin-top:14px;display:flex;justify-content:space-between">支出<button class="btn small" onClick=${() => set({ expense: [...c.expense, { n: String(c.expense.length + 1), src: '', pts: '', g: ['', '', '', '', ''] }] })}><${Icon} n="plus" />加一场</button></div>
          ${dynTable('expense', [['场', 'n', '7%'], ['去向', 'src'], ['奖励点', 'pts', '12%'], ['S', 'g.0', '6%'], ['A', 'g.1', '6%'], ['B', 'g.2', '6%'], ['C', 'g.3', '6%'], ['D', 'g.4', '6%']], 1)}
        </fieldset>

        <fieldset class="fs"><legend>人脉与杂项<span><button class="btn small" onClick=${() => set({ npc: [...c.npc, { n: '', who: '', rel: '' }] })}><${Icon} n="plus" />加人脉</button></span></legend>
          ${dynTable('npc', [['场次', 'n', '10%'], ['人物或势力', 'who', '40%'], ['关系／状态', 'rel']])}
          <label class="fld full" style="margin-top:12px"><span>杂项记录</span><textarea class="input" value=${c.misc} onInput=${(e) => set({ misc: e.target.value })}></textarea></label>
        </fieldset>
      </div>
      <div class="sheet-preview" ref=${prevRef}><span class="label">PRINT PREVIEW · 打印预览</span><div class="sheet-scale" style=${'zoom:' + zoom} dangerouslySetInnerHTML=${{ __html: previewHTML }}></div></div>
      <${SheetModal} active=${active} open=${!!m} m=${mm} c=${c} setM=${setM} close=${() => setM(null)} ops=${ops} />
      <${ExportPanel} open=${xp && active} c=${c} onClose=${() => setXp(false)} onPrint=${printSheet} />
    </div>`;
  }

  // 字体是切片按需下载的：先透明地渲染一遍，排版时浏览器才知道首屏要哪些切片；
  // 等这些切片到齐再一起显示（最多等 2.5 秒），不会出现字一块块冒出来或换字体闪一下。
  // 用 opacity 而不是 visibility，挂载时自动聚焦搜索框仍然有效。
  const root = document.getElementById('root');
  root.style.opacity = '0';
  render(html`<${App} />`, root);
  void root.offsetHeight;
  const firstFonts = document.fonts && document.fonts.ready
    ? new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => document.fonts.ready)
    : Promise.resolve();
  Promise.race([firstFonts, new Promise((r) => setTimeout(r, 2500))]).catch(() => {}).then(() => {
    root.style.opacity = '';
    document.documentElement.classList.add('ready');
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 600));
    idle(() => loadAllDesc().catch(() => {}));
    // 空闲时把常用字切片预先载好（文件名带内容哈希、长期缓存），之后翻列表、看详情基本不用再等字体
    const warm = window.SG_FONTWARM || '';
    if (warm && document.fonts && document.fonts.load) idle(() => {
      [['400 16px Song', warm], ['600 16px Song', warm.slice(0, 10)], ['400 16px Kai', warm.slice(0, 10)], ['900 16px Song', warm.slice(0, 4)]]
        .forEach(([f, t]) => document.fonts.load(f, t).catch(() => {}));
    });
  });
})();
