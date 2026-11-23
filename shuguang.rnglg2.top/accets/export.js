/* 曙光 · 人物卡导出：PNG 长图、A4 PDF、Excel。点「导出」时才加载，不依赖第三方库。
   PNG／PDF 用 Canvas 直接排版，字体用页面已经加载好的网页字体，file:// 离线打开也能用；
   PDF 是把每页画成 JPEG 后写进一个最小的 PDF 文件；Excel 是手写的 OOXML（带样式）+ 不压缩的 zip。
   输入是 app.js 整理好的 model（exportModel），这里只管排版和打包。 */
(function sgExport() {
  'use strict';
  const FAM = {
    song: '"Song", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
    kai: '"Kai", "LXGW WenKai", "KaiTi", "STKaiti", serif',
    gar: '"Garamond", "Song", serif',
    mono: '"Mono", "Song", monospace',
  };
  const font = (s, w, fam) => `${w} ${s.toFixed(2)}px ${FAM[fam]}`;
  const num = (n) => (n == null || n === '' || isNaN(+n) ? String(n ?? '') : Number(n).toLocaleString('en-US'));
  const numOf = (v) => { const t = String(v ?? '').replace(/[,，\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };

  // 宣传片色板。PNG 是墨黑底；PDF 是白色阅读面（打印省墨），抬头仍是墨黑条
  const DARK = { bg: '#050A18', panel: '#0B1B33', line: '#12305C', line2: '#24518A', text: '#F2F2FF', sub: '#D6ECF8', mute: '#8DB0D6', blue: '#3E9BE8', sky: '#6CC4F4', ink: '#050A18', head: '#050A18', headText: '#F2F2FF', headRule: '#12305C', frame: '#F2F2FF', fillA: 'rgba(62,155,232,.55)', ring: 'rgba(214,236,248,.2)', ringOut: 'rgba(214,236,248,.6)' };
  const LIGHT = { bg: '#FFFFFF', panel: '#EEF4FB', line: '#C5D3E6', line2: '#8DA6C6', text: '#050A18', sub: '#12305C', mute: '#4F6A8E', blue: '#3E9BE8', sky: '#12305C', ink: '#050A18', head: '#050A18', headText: '#F2F2FF', headRule: '#050A18', frame: '#050A18', fillA: 'rgba(62,155,232,.45)', ring: 'rgba(5,10,24,.16)', ringOut: '#050A18' };

  // ---------------------------------------------------------------- 文字排版
  const mctx = document.createElement('canvas').getContext('2d');
  const MC = new Map();
  function measure(f, t) {
    const k = f + '\u0001' + t;
    let v = MC.get(k);
    if (v == null) { mctx.font = f; v = mctx.measureText(t).width; if (MC.size > 60000) MC.clear(); MC.set(k, v); }
    return v;
  }
  const OPEN = /^[（《「『“‘(\[【〔〈]$/;
  const tokens = (t) => t.match(/[A-Za-z0-9][A-Za-z0-9.,%'’+\-_/:#]*|[ \t　]+|[\s\S]/gu) || [];
  const isSpace = (t) => /^[ \t　]+$/.test(t);
  // runs: [{t, f, c}] → 行：[{segs:[{t,f,c,x,w}], w}]。中文逐字断行，拉丁词优先整词，超宽词拆字；显式换行保留
  function wrap(runs, width) {
    const lines = [];
    let segs = [], x = 0;
    const flush = () => {
      while (segs.length && isSpace(segs[segs.length - 1].t)) x -= segs.pop().w;
      lines.push({ segs, w: x }); segs = []; x = 0;
    };
    const put = (t, r, w) => { segs.push({ t, f: r.f, c: r.c, x, w }); x += w; };
    for (const r of runs) {
      for (const tk of tokens(String(r.t).replace(/\r\n?/g, '\n'))) {
        if (tk === '\n') { flush(); continue; }
        const w = measure(r.f, tk);
        if (!segs.length && isSpace(tk)) continue;
        if (x + w > width && segs.length) {
          if (isSpace(tk)) { flush(); continue; }
          const carry = [];
          while (segs.length > 1 && OPEN.test(segs[segs.length - 1].t)) { const s = segs.pop(); x -= s.w; carry.unshift(s); }
          flush();
          for (const s of carry) { s.x = x; segs.push(s); x += s.w; }
          if (x + w > width && segs.length) flush();
        }
        if (w > width) { for (const ch of tk) { const cw = measure(r.f, ch); if (x + cw > width && segs.length) flush(); put(ch, r, cw); } continue; }
        put(tk, r, w);
      }
    }
    if (segs.length || !lines.length || runs.at(-1)?.t.endsWith('\n')) flush();
    return lines;
  }
  function drawLine(g, line, x, y, lh) {
    g.textBaseline = 'middle'; g.textAlign = 'left';
    const s = line.segs;
    for (let i = 0; i < s.length;) {
      let j = i, t = '';
      while (j < s.length && s[j].f === s[i].f && s[j].c === s[i].c) t += s[j++].t;
      g.font = s[i].f; g.fillStyle = s[i].c; g.fillText(t, x + s[i].x, y + lh / 2);
      i = j;
    }
  }
  function text(g, t, x, y, f, c, align = 'left') { g.font = f; g.fillStyle = c; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; }
  function spaced(g, t, x, y, f, sp, c) { g.font = f; g.fillStyle = c; g.textBaseline = 'middle'; g.textAlign = 'left'; for (const ch of t) { g.fillText(ch, x, y); x += measure(f, ch) + sp; } return x; }
  const spacedW = (t, f, sp) => [...t].reduce((s, ch) => s + measure(f, ch) + sp, 0) - sp;
  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function frame(g, x, y, w, h, c, lw = 2) { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }

  // 支线等级方印：主要强化实心蓝底，其余是天蓝描边
  function seal(g, T, z, grade, x, y, size, filled) {
    const v = String(grade || '').split(/[\/／]/)[0].trim();
    const none = !v || v === '无支线' || v === '仅介绍' || v === '无';
    if (filled && !none) rect(g, x, y, size, size, T.blue);
    frame(g, x, y, size, size, none ? T.line2 : filled ? T.blue : T.sky, Math.max(2, size * 0.055));
    const t = none ? '无' : v;
    const n = [...t].length;
    const f = none ? font(size * 0.4, 400, 'song') : /^[0-9A-Z+]+$/.test(t) ? font(size * (n >= 3 ? 0.34 : n === 2 ? 0.42 : 0.5), 600, 'gar') : font(size * (n >= 3 ? 0.26 : n === 2 ? 0.34 : 0.42), 600, 'song');
    text(g, t, x + size / 2, y + size / 2 + size * 0.02, f, filled && !none ? T.ink : none ? T.mute : T.sky, 'center');
  }

  // 六维雷达：r 是半径；标签字号固定，不跟着图缩放（缩小后标签会挤进旁边的表格）
  function radar(g, T, cx, cy, r, vals, labels, lf, vf, ls) {
    const max = Math.max(...vals, 1);
    const pt = (i, k) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]; };
    const poly = (k) => { g.beginPath(); for (let i = 0; i < 6; i++) { const [x, y] = pt(i, k); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    for (let k = 1; k <= 4; k++) { poly(k / 4); g.strokeStyle = k === 4 ? T.ringOut : T.ring; g.lineWidth = k === 4 ? 1.2 : 0.7; g.stroke(); }
    for (let i = 0; i < 6; i++) { const [x, y] = pt(i, 1); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.strokeStyle = T.ring; g.lineWidth = 0.7; g.stroke(); }
    if (vals.some((v) => v)) {
      g.beginPath(); vals.forEach((v, i) => { const [x, y] = pt(i, Math.min(1, v / max)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = T.fillA; g.fill(); g.strokeStyle = T.frame; g.lineWidth = 1.6; g.lineJoin = 'miter'; g.stroke();
      vals.forEach((v, i) => { const [x, y] = pt(i, Math.min(1, v / max)); rect(g, x - 2.6, y - 2.6, 5.2, 5.2, T.frame); });
    }
    labels.forEach((l, i) => {
      const [x, y] = pt(i, 1.2);
      const al = Math.abs(x - cx) < 2 ? 'center' : x > cx ? 'left' : 'right';
      const dy = i === 0 ? -ls * 0.9 : i === 3 ? ls * 0.6 : 0;
      text(g, l, x, y + dy - (vals[i] ? ls * 0.5 : 0), lf, T.text, al);
      if (vals[i]) text(g, num(vals[i]), x, y + dy + ls * 0.6, vf, T.sky, al);
    });
  }

  // ---------------------------------------------------------------- 版面：一串 atom，每个 atom 有高度和画法；分页只在 atom 之间断
  function build(M, L) {
    const T = L.T, cw = L.cw, z = L.fm, S = (n) => n * z, F = (s, w = 400, fam = 'song') => font(S(s), w, fam);
    const A = [];
    const push = (h, draw, o = {}) => A.push({ h, draw, gap: o.gap || 0, keep: !!o.keep });

    // 段落 → 行。「标签：正文」的段落把标签加粗（和图鉴详情一致）
    const runsOf = (p, o) => {
      const m = o.lab !== false && p.match(/^([^：:，。“”「」]{1,14})[：:]([\s\S]+)$/);
      return m && !/出自/.test(m[1]) ? [{ t: m[1] + '：', f: o.fb, c: o.cb }, { t: m[2], f: o.f, c: o.c }] : [{ t: p, f: o.f, c: o.c }];
    };
    function lines(txt, o) {
      const paras = String(txt || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
      paras.forEach((p, pi) => {
        wrap(runsOf(p, o), o.w).forEach((ln, li) => {
          const extra = li === 0 && pi > 0 ? o.pgap : 0, h = o.lh + extra;
          push(h, (g, cx, y) => { if (o.deco) o.deco(g, cx, y, h); drawLine(g, ln, cx + o.x, y + extra, o.lh); }, { gap: li === 0 && pi === 0 ? o.gap || 0 : 0 });
        });
      });
    }
    function section(title, note) {
      const h = S(44);
      push(h, (g, cx, y) => {
        rect(g, cx, y + S(15), S(12), S(12), T.blue);
        spaced(g, title, cx + S(22), y + S(21), F(19, 900), S(2.4), T.text);
        if (note) text(g, note, cx + cw, y + S(22), F(11.5, 400, 'mono'), T.mute, 'right');
        rect(g, cx, y + h - S(3), cw, S(3), T.frame);
      }, { gap: S(30), keep: true });
    }
    function label(t, en, count, gap = S(14)) {
      push(S(28), (g, cx, y) => {
        rect(g, cx, y + S(11), S(7), S(7), T.blue);
        const x = spaced(g, t, cx + S(14), y + S(15), F(14, 900), S(1.2), T.text);
        if (en) text(g, en, x + S(10), y + S(15.5), F(10.5, 400, 'mono'), T.mute);
        if (count != null) text(g, String(count), cx + cw, y + S(15.5), F(15, 600, 'gar'), T.sky, 'right');
      }, { gap, keep: true });
    }
    // 表格：cols = [{t 表头, w 比例或像素, al 对齐, f 字体键}]，每个文字行一个 atom
    function table(cols, rows, o = {}) {
      const fixed = cols.reduce((s, c) => s + (c.px ? S(c.px) : 0), 0), flex = cols.reduce((s, c) => s + (c.px ? 0 : c.w || 1), 0);
      let x = 0; const X = cols.map((c) => { const w = c.px ? S(c.px) : ((cw - fixed) * (c.w || 1)) / flex; const r = [x, w]; x += w; return r; });
      const hh = S(28);
      push(hh, (g, cx, y) => {
        cols.forEach((c, i) => text(g, c.t, cx + X[i][0] + (c.al === 'right' ? X[i][1] - S(8) : c.al === 'center' ? X[i][1] / 2 : S(8)), y + hh / 2, F(10.5, 400, 'mono'), T.sky, c.al || 'left'));
        rect(g, cx, y + hh - S(2), cw, S(2), T.line2);
      }, { gap: o.gap ?? S(10), keep: true });
      const lh = S(21);
      rows.forEach((r, ri) => {
        const cells = cols.map((c, i) => {
          const v = String(r[i] ?? '');
          const f = c.num ? F(15, 600, 'gar') : c.b ? F(13.5, 600) : F(13.5);
          const col = c.num ? T.text : c.b ? T.text : T.sub;
          return { ls: wrap([{ t: c.num ? num(v) : v, f, c: col }], X[i][1] - S(16)), f, col };
        });
        const n = Math.max(1, ...cells.map((c) => c.ls.length));
        // 每个视觉行独立分页，背景连续；一条记录再长也不会越过画布底部。
        for (let k = 0; k < n; k++) {
          const before = k === 0 ? S(6) : 0, after = k === n - 1 ? S(6) : 0;
          const h = lh + before + after;
          push(h, (g, cx, y) => {
            if (o.zebra && ri % 2) rect(g, cx, y, cw, h, T.panel);
            cells.forEach((c, i) => {
              const ln = c.ls[k]; if (!ln) return;
              const al = cols[i].al, room = X[i][1] - S(16);
              const dx = al === 'right' ? room - ln.w : al === 'center' ? (room - ln.w) / 2 : 0;
              drawLine(g, ln, cx + X[i][0] + S(8) + dx, y + before, lh);
            });
            if (after) rect(g, cx, y + h - 1, cw, 1, T.line);
          });
        }
      });
    }

    // ---- 抬头
    const playerLine = [M.player && '玩家　' + M.player, '曙光 · 无限流跑团　轮回者档案'].filter(Boolean).join('　·　');
    const longMast = /\n/.test(M.title + playerLine) || spacedW(M.title, F(20, 900), S(2.4)) > cw - S(150) || measure(F(13, 400, 'kai'), playerLine) > cw;
    if (longMast) {
      const deco = (g, cx, y, h) => rect(g, 0, y, L.W, h, T.head);
      push(S(56), (g, cx, y) => { deco(g, cx, y, S(56)); text(g, '04 · CHARACTER SHEET', cx, y + S(30), F(12, 500, 'mono'), DARK.sky); });
      lines(M.title, { x: 0, w: cw, f: F(28, 900), c: T.headText, lh: S(42), pgap: 0, deco, lab: false });
      lines(playerLine, { x: 0, w: cw, f: F(13, 400, 'kai'), c: DARK.mute, lh: S(24), pgap: 0, deco, lab: false });
      push(S(14), (g, cx, y) => deco(g, cx, y, S(14)));
    } else {
      const mastH = S(136);
      push(mastH, (g, cx, y) => {
        rect(g, 0, y, L.W, mastH, T.head);
        const tag = '04 · CHARACTER SHEET', tf = F(10, 500, 'mono');
        const tw = spacedW(tag, tf, S(2)) + S(18);
        rect(g, cx, y + S(26), tw, S(22), T.blue);
        spaced(g, tag, cx + S(9), y + S(37.5), tf, S(2), T.ink);
        let ns = 34;
        const name = M.title;
        while (ns > 20 && spacedW(name, F(ns, 900), S(ns * 0.12)) > cw - S(150)) ns -= 2;
        spaced(g, name, cx, y + S(80), F(ns, 900), S(ns * 0.12), T.headText);
        text(g, playerLine, cx, y + S(111), F(13, 400, 'kai'), DARK.mute);
        text(g, 'SHUGUANG · INFINITE TRPG', cx + cw, y + S(37), F(9.5, 400, 'mono'), DARK.mute, 'right');
        text(g, M.date, cx + cw, y + S(55), F(11, 400, 'mono'), DARK.sky, 'right');
        rect(g, 0, y + mastH - S(2), L.W, S(2), T.headRule);
        rect(g, cx, y + mastH - S(3), S(88), S(6), T.blue);
      });

    }

    // ---- 立绘 + 基本信息 + 奖励点
    const infoWidth = (cw - (M.img ? Math.round(cw * (L.wide ? 0.27 : 0.34)) + S(26) : 0));
    const infoCols = infoWidth > S(470) ? 3 : 2;
    const pointsWidth = Math.min(S(170), infoWidth * 0.36);
    const gradeWidth = (infoWidth - pointsWidth - S(10)) / 5 - S(6);
    const longInfo = M.info.some(([k, v]) => /\n/.test(v) || measure(F(15, 600), v) > infoWidth / (k === '世界观' ? 1 : infoCols) - S(14))
      || /\n/.test(M.points) || measure(F(28, 600, 'gar'), num(M.points) || '—') > pointsWidth - S(24)
      || M.grades.some(([, v]) => /\n/.test(v) || measure(F(22, 600, 'gar'), String(v || '—')) > gradeWidth - S(4));
    if (longInfo) {
      if (M.img) push(S(180), (g, cx, y) => {
        const scale = Math.min(cw / M.img.naturalWidth, S(180) / M.img.naturalHeight);
        g.drawImage(M.img, cx, y, M.img.naturalWidth * scale, M.img.naturalHeight * scale);
      }, { gap: S(30) });
      table([{ t: '基本信息', w: 1 }, { t: '内容', w: 4 }], M.info);
      table([{ t: '奖励与支线', w: 1 }, { t: '剩余', w: 4 }], [['奖励点', M.points], ...M.grades]);
    } else {
      const img = M.img;
      const pw = img ? Math.round(cw * (L.wide ? 0.27 : 0.34)) : 0, ph = Math.round(pw * 4 / 3);
      const rx = img ? pw + S(26) : 0, rw = cw - rx;
      const cols = rw > S(470) ? 3 : 2;
      const info = M.info.filter(([k]) => k !== '世界观'), world = M.info.find(([k]) => k === '世界观');
      const cellH = S(46), rowsN = Math.ceil(info.length / cols) + (world ? 1 : 0);
      const infoH = rowsN * cellH;
      const ptsH = S(70);
      const h = Math.max(ph + S(8), infoH + S(16) + ptsH);
      push(h, (g, cx, y) => {
        if (img) {
          rect(g, cx + S(6), y + S(6), pw, ph, T.blue);
          rect(g, cx, y, pw, ph, T.panel);
          const ir = img.naturalWidth / img.naturalHeight, br = pw / ph;
          let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
          if (ir > br) { sw = sh * br; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / br; sy = (img.naturalHeight - sh) * 0.15; }
          g.drawImage(img, sx, sy, sw, sh, cx, y, pw, ph);
          frame(g, cx, y, pw, ph, T.frame, S(3));
        }
        const cwid = rw / cols;
        const cell = (k, v, i, j, span = 1) => {
          const x = cx + rx + j * cwid, yy = y + i * cellH;
          text(g, k, x, yy + S(11), F(10.5, 400, 'mono'), T.sky);
          text(g, v || '—', x, yy + S(30), F(15, 600), v ? T.text : T.line2);
          rect(g, x, yy + cellH - S(5), cwid * span - S(12), 1, T.line);
        };
        info.forEach(([k, v], n) => cell(k, v, Math.floor(n / cols), n % cols));
        if (world) cell(world[0], world[1], rowsN - 1, 0, cols);
        // 奖励点与支线
        const py = y + infoH + S(16);
        const pwid = Math.min(S(170), rw * 0.36);
        frame(g, cx + rx, py, pwid, ptsH, T.frame, 2);
        text(g, '剩余奖励点', cx + rx + S(12), py + S(16), F(10.5, 400, 'mono'), T.sky);
        text(g, num(M.points) || '—', cx + rx + S(12), py + S(46), F(28, 600, 'gar'), T.text);
        const gx = cx + rx + pwid + S(10), gw = (rw - pwid - S(10)) / 5;
        M.grades.forEach(([k, v], i) => {
          const x = gx + i * gw;
          frame(g, x, py, gw - S(6), ptsH, T.line2, 2);
          rect(g, x, py, gw - S(6), S(24), T.panel);
          text(g, k, x + (gw - S(6)) / 2, py + S(12.5), F(13, 600, 'gar'), T.sky, 'center');
          text(g, v === '' || v == null ? '—' : String(v), x + (gw - S(6)) / 2, py + S(47), F(22, 600, 'gar'), v ? T.text : T.line2, 'center');
        });
      }, { gap: S(30) });
    }

    // ---- 身体素质
    section('身体素质', '初始 + 强化 + 锻炼 = 合计');
    {
      const lf = F(12.5, 600), vf = F(13, 600, 'gar'), ls = S(15);
      const hh = S(28), rh = S(33), th = hh + 6 * rh;
      const cols = [['属性', 0.24], ['初始', 0.13], ['强化', 0.13], ['锻炼', 0.13], ['上限', 0.13], ['合计', 0.24]];
      const table = (g, x0, y, tw) => {
        let xx = 0; const X = cols.map(([, w]) => { const r = [xx, tw * w]; xx += tw * w; return r; });
        cols.forEach(([t], i) => text(g, t, x0 + X[i][0] + (i ? X[i][1] - S(6) : 0), y + hh / 2, F(10.5, 400, 'mono'), T.sky, i ? 'right' : 'left'));
        rect(g, x0, y + hh - S(2), tw, S(2), T.line2);
        M.attrs.forEach((a, r) => {
          const yy = y + hh + r * rh;
          text(g, a.k, x0, yy + rh / 2, F(14, 600), T.text);
          [a.base, a.enh, a.train, a.cap].forEach((v, k) => text(g, v ? num(v) : '—', x0 + X[k + 1][0] + X[k + 1][1] - S(6), yy + rh / 2, F(15, 500, 'gar'), v ? T.sub : T.line2, 'right'));
          text(g, a.tot ? num(a.tot) : '—', x0 + X[5][0] + X[5][1] - S(6), yy + rh / 2, F(19, 700, 'gar'), T.text, 'right');
          rect(g, x0, yy + rh - 1, tw, 1, T.line);
        });
      };
      const draw = (g, cx, cy, r) => radar(g, T, cx, cy, r, M.attrs.map((a) => a.tot), M.attrs.map((a) => a.k), lf, vf, ls);
      if (cw < S(620)) {
        // 窄版（PNG）：雷达居中在上，表格占满一行
        const r = S(78), h = r * 2 + S(86);
        push(h, (g, cx, y) => draw(g, cx + cw / 2, y + h / 2, r), { gap: S(10), keep: true });
        push(th, (g, cx, y) => table(g, cx, y, cw), { gap: S(8) });
      } else {
        const R = Math.round(cw * 0.38), tx = R + S(20), tw = cw - tx;
        const r = Math.min(R / 2 - S(64), th / 2 - S(34));
        push(th, (g, cx, y) => { draw(g, cx + R / 2, y + th / 2, r); table(g, cx + tx, y, tw); }, { gap: S(14) });
      }
    }

    // ---- 天赋与技能
    section('基础天赋', '物 · 魔 · 神（精神） · 科');
    {
      const ch = S(58), gp = S(8);
      const row1 = M.talents, row2 = [[...M.skill[0], 2], [...M.skill[1], 1], [...M.origin[0], 2], [...M.origin[1], 1], [...M.origin[2], 1]];
      const cellRow = (cells, units) => {
        const u = (cw - gp * (cells.length - 1)) / units;
        if (cells.some(([, v, span = 1]) => /\n/.test(v) || measure(numOf(v) != null ? F(21, 600, 'gar') : F(15, 600), numOf(v) != null ? num(v) : String(v || '—')) > u * span - S(20))) {
          table(cells.map(([t, , w = 1]) => ({ t, w })), [cells.map(([, v]) => v)]);
          return;
        }
        push(ch, (g, cx, y) => {
          const u = (cw - gp * (cells.length - 1)) / units;
          let x = cx;
          cells.forEach(([k, v, span = 1]) => {
            const w = u * span;
            frame(g, x, y, w, ch, T.line2, 2);
            text(g, k, x + S(10), y + S(15), F(10.5, 400, 'mono'), T.sky);
            const isN = numOf(v) != null;
            const f = isN ? F(21, 600, 'gar') : F(15, 600);
            text(g, isN ? num(v) : v || '—', x + S(10), y + S(39), f, v ? T.text : T.line2);
            x += w + gp;
          });
        }, { gap: S(10) });
      };
      cellRow(row1, row1.length);
      if (M.extraTalents.length) {
        section('额外天赋', '主神决定是否开放');
        table([{ t: '天赋', w: 1 }, { t: '数值', w: 1 }], M.extraTalents);
      }
      section('技能与位面');
      cellRow(row2, 7);
    }

    // ---- 强化项目：主要三项实心方印 + 白框硬投影，次要描边
    if (M.main.length || M.minor.length) {
      section('强化项目', `主要 ${M.main.length} · 次要 ${M.minor.length}`);
      const tiles = (list, main) => {
        const cols = 3, gp = S(12), tw = (cw - gp * (cols - 1)) / cols, th = main ? S(62) : S(52), ss = main ? S(40) : S(32);
        for (let i = 0; i < list.length; i += cols) {
          const part = list.slice(i, i + cols);
          if (part.some(([n, gr]) => /\n/.test(n) || wrap([{ t: n, f: main ? F(15, 600) : F(14, 600), c: T.text }], tw - ss - S(28)).length > 2 || String(gr).length > 4)) {
            table([{ t: '名称', w: 4, b: 1 }, { t: '等级', w: 1 }], part);
            continue;
          }
          push(th, (g, cx, y) => {
            part.forEach(([n, gr], k) => {
              const x = cx + k * (tw + gp);
              if (main) { rect(g, x + S(5), y + S(5), tw, th, T.blue); rect(g, x, y, tw, th, T.bg); frame(g, x, y, tw, th, T.frame, 2); }
              else frame(g, x, y, tw, th, T.line2, 2);
              seal(g, T, z, gr, x + S(10), y + (th - ss) / 2, ss, main);
              const nx = x + S(10) + ss + S(10), nw = tw - (nx - x) - S(8);
              const f = main ? F(15, 600) : F(14, 600);
              const ls = wrap([{ t: n || '（未填）', f, c: n ? T.text : T.line2 }], nw);
              const lh = main ? S(20) : S(18), shown = ls;
              shown.forEach((ln, j) => drawLine(g, ln, nx, y + th / 2 - (shown.length * lh) / 2 + j * lh, lh));
            });
          }, { gap: i ? S(12) : S(4) });
        }
      };
      if (M.main.length) { label('主要强化', 'MAIN', null, S(14)); tiles(M.main, true); }
      if (M.minor.length) { label('次要强化', 'MINOR', null, S(22)); tiles(M.minor, false); }
    }

    // ---- 修炼体系
    if (M.systems.length) {
      section('修炼体系', M.systems.length + ' 项');
      table([{ t: '体系', w: 3, b: 1 }, { t: '境界', w: 3 }, { t: '备注', w: 5 }], M.systems);
    }

    // ---- 人物背景
    if (M.story) {
      section('人物背景');
      lines(M.story, { x: 0, w: cw, f: F(15, 400, 'kai'), fb: F(15, 400, 'kai'), c: T.sub, cb: T.sub, lh: S(28), pgap: S(8), gap: S(12), lab: false });
    }

    // ---- 兑换项：每条一个抬头 atom（方印、名称、奖励点、类别），下面逐行正文；左侧一道竖线把一条串起来
    const entries = (list, title, en) => {
      if (!list.length) return;
      label(title, en, list.length, S(20));
      const deco = (g, cx, y, h) => rect(g, cx + S(16), y, S(2), h, T.line);
      list.forEach((r, i) => {
        const meta = [r.type, r.from, r.lv && '熟练度 ' + r.lv, r.qty && '数量 ' + r.qty, r.cat && '图鉴 ' + r.cat.no].filter(Boolean).join('　·　');
        const ptsT = numOf(r.pts) != null ? num(numOf(r.pts)) : r.pts || '—';
        const pw = Math.max(S(60), measure(F(19, 600, 'gar'), ptsT) + S(4));
        const longHead = /\n/.test(r.n + meta + ptsT) || String(r.g).length > 4 || pw > cw / 3
          || measure(F(16.5, 600), r.n || '（未命名）') > cw - S(62) - pw
          || measure(F(12.5, 400, 'kai'), meta || '—') > cw - S(118);
        if (longHead) {
          table([{ t: '兑换项目', w: 1 }, { t: '内容', w: 5 }], [['名称', r.n], ['等级', r.g], ['奖励点', ptsT], ['类别／来源', meta]], { gap: S(6) });
        } else {
          const hh = S(60);
          push(hh, (g, cx, y) => {
            if (i) rect(g, cx, y, cw, 1, T.line);
            seal(g, T, z, r.g, cx, y + S(13), S(34), false);
            const ptsT = numOf(r.pts) != null ? num(numOf(r.pts)) : r.pts || '—';
            const pf = F(19, 600, 'gar'), pw = Math.max(S(60), measure(pf, ptsT) + S(4));
            text(g, r.n || '（未命名）', cx + S(48), y + S(24), F(16.5, 600), T.text);
            text(g, ptsT, cx + cw, y + S(24), pf, r.pts ? T.text : T.line2, 'right');
            text(g, r.pts ? (numOf(r.pts) != null ? '奖励点' : '') : '', cx + cw, y + S(44), F(10.5, 400, 'kai'), T.mute, 'right');
            const meta = [r.type, r.from, r.lv && '熟练度 ' + r.lv, r.qty && '数量 ' + r.qty, r.cat && '图鉴 ' + r.cat.no].filter(Boolean).join('　·　');
            text(g, meta || '—', cx + S(48), y + S(46), F(12.5, 400, 'kai'), T.mute);
            if (r.eff || r.catText || r.note) rect(g, cx + S(16), y + S(47), S(2), hh - S(47), T.line);
          }, { gap: i ? S(6) : S(6), keep: !!(r.eff || r.catText || r.note) });
        }
        const body = { x: S(48), w: cw - S(48), lh: S(23), pgap: S(7), deco };
        if (r.eff) lines(r.eff, { ...body, f: F(13.5), fb: F(13.5, 600), c: T.sub, cb: T.text, gap: S(2) });
        if (r.catText) {
          lines('图鉴原文 · ' + r.cat.no + (r.cat.src ? '　出自《' + r.cat.src + '》' : ''), { ...body, f: F(12, 400, 'kai'), c: T.sky, lh: S(24), gap: S(6), lab: false });
          lines(r.catText, { ...body, f: F(13), fb: F(13, 600), c: T.mute, cb: T.sub, lh: S(22), gap: 0 });
        }
        if (r.note) {
          push(S(26), (g, cx, y) => { deco(g, cx, y, S(26)); text(g, '备注', cx + S(48), y + S(14), F(10.5, 500, 'mono'), T.sky); }, { gap: S(4), keep: true });
          lines(r.note, { ...body, f: F(13, 400, 'kai'), fb: F(13, 400, 'kai'), c: T.sub, cb: T.sub, gap: 0, lab: false });
        }
      });
    };
    if (M.enh.length || M.items.length) {
      section('强化与道具', `${M.enh.length + M.items.length} 项`);
      entries(M.enh, '强化', 'BLOODLINE · CLASS · ART · SKILL');
      entries(M.items, '装备与道具', 'GEAR · ITEMS');
    }

    // ---- 收支
    if (M.income.length || M.expense.length) {
      section('收支记录', `收入 ${num(M.totals.in)}　支出 ${num(M.totals.out)}　结余 ${num(M.totals.in - M.totals.out)}`);
      const led = (list, t, en, src) => {
        if (!list.length) return;
        label(t, en, list.length, S(16));
        table([{ t: '场', px: 40, al: 'center', one: 1 }, { t: src, w: 1 }, { t: '奖励点', px: 82, al: 'right', num: 1 }, ...['S', 'A', 'B', 'C', 'D'].map((g) => ({ t: g, px: 30, al: 'center', one: 1 }))],
          list.map((x) => [x.n, x.src, x.pts, ...x.g]), { gap: S(6), zebra: 1 });
      };
      led(M.income, '收入', 'INCOME', '来源');
      led(M.expense, '支出', 'EXPENSE', '去向');
    }
    if (M.npc.length) {
      section('人脉与势力', M.npc.length + ' 项');
      table([{ t: '场次', px: 56, one: 1 }, { t: '人物或势力', w: 2, b: 1 }, { t: '关系／状态', w: 3 }], M.npc.map((x) => [x.n, x.who, x.rel]));
    }
    if (M.misc) {
      section('杂项记录');
      lines(M.misc, { x: 0, w: cw, f: F(14, 400, 'kai'), fb: F(14, 400, 'kai'), c: T.sub, cb: T.sub, lh: S(26), pgap: S(6), gap: S(12), lab: false });
    }
    // ---- 落款
    // 落款：放得下就左右各一段，窄版（PNG）放不下就分两行，免得两段字压在一起
    const credL = 'SHUGUANG · INFINITE TRPG', credR = `曙光 · 无限流跑团　人物卡导出于 ${M.date}　${M.site}`;
    const credTwo = measure(F(10, 400, 'mono'), credL) + measure(F(11.5, 400, 'kai'), credR) + S(24) > cw;
    push(credTwo ? S(92) : S(70), (g, cx, y) => {
      rect(g, cx, y + S(18), cw, 1, T.line);
      rect(g, cx, y + S(16), S(40), S(5), T.blue);
      text(g, credL, cx, y + S(42), F(10, 400, 'mono'), T.mute);
      text(g, credR, credTwo ? cx : cx + cw, y + S(credTwo ? 66 : 42), F(11.5, 400, 'kai'), T.mute, credTwo ? 'left' : 'right');
    }, { gap: S(26) });
    return A;
  }

  function paginate(A, firstTop, top, bottom) {
    const pages = [];
    let cur = [], y = firstTop;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      let need = (cur.length ? a.gap : 0) + a.h;
      if (a.keep) for (let j = i; A[j].keep && j + 1 < A.length; j++) need += A[j + 1].gap + A[j + 1].h;
      if (cur.length && y + need > bottom) { pages.push(cur); cur = []; y = top; }
      const g = cur.length ? a.gap : 0;
      cur.push({ a, y: y + g }); y += g + a.h;
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('浏览器无法生成图片，可能是内存不足'))), type, q));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  async function prepare(M) {
    // 字体是按 unicode-range 切片的，画布不会等字体：先把这张人物卡上所有字所在的切片载好
    if (window.SG_FONTS) {
      // 画布上的固定标题、表头写在本文件里，用函数源码把这些字一并算上
      await window.SG_FONTS.load(JSON.stringify(M, (k, v) => (k === 'portrait' ? undefined : v)) + sgExport.toString());
    } else if (document.fonts && document.fonts.load) {
      await Promise.all(['400 16px Song', '600 16px Song', '900 16px Song', '400 16px Kai', '600 16px Garamond', '700 16px Garamond', '500 16px Mono'].map((f) => document.fonts.load(f, '曙光0A').catch(() => {})));
    }
    return { ...M, img: await loadImg(M.portrait) };
  }

  // ---------------------------------------------------------------- PNG：一张长图（太长就分成几张，避免手机浏览器画布超限）
  async function png(model) {
    const M = await prepare(model);
    const L = { W: 600, pad: 28, fm: 1.12, T: DARK, wide: false };
    L.cw = L.W - L.pad * 2;
    const A = build(M, L);
    const bottom = L.fm * 6;
    const total = A.reduce((s, a, i) => s + a.h + (i ? a.gap : 0), 0) + bottom;
    // iOS Safari／QQ 内置浏览器单张画布约 1677 万像素上限。一张长图优先（发群方便），最低 1.25 倍清晰度；再长才分成几张 2 倍图
    const BUDGET = 16e6;
    let parts;
    if (L.W * total * 4 <= BUDGET) parts = [{ list: paginate(A, 0, 0, Infinity)[0], h: total, s: 2 }];
    else if (L.W * total * 1.5625 <= BUDGET) parts = [{ list: paginate(A, 0, 0, Infinity)[0], h: total, s: Math.sqrt(BUDGET / (L.W * total)) }];
    else {
      const maxH = BUDGET / (L.W * 4);
      parts = paginate(A, 0, L.fm * 28, maxH - bottom).map((p) => { const l = p[p.length - 1]; return { list: p, h: l.y + l.a.h + bottom, s: 2 }; });
    }
    const out = [];
    for (const p of parts) {
      const cv = document.createElement('canvas');
      cv.width = Math.round(L.W * p.s); cv.height = Math.round(p.h * p.s);
      const g = cv.getContext('2d');
      g.scale(p.s, p.s);
      rect(g, 0, 0, L.W, p.h, L.T.bg);
      for (const { a, y } of p.list) a.draw(g, L.pad, y);
      out.push({ blob: await toBlob(cv, 'image/png'), w: cv.width, h: cv.height });
      cv.width = cv.height = 0;
      await tick();
    }
    return out;
  }

  // ---------------------------------------------------------------- PDF：A4 分页，每页一张 JPEG
  async function pdf(model, onProgress) {
    const M = await prepare(model);
    const L = { W: 880, H: 1245, pad: 52, fm: 1, T: LIGHT, wide: true };
    L.cw = L.W - L.pad * 2;
    const A = build(M, L);
    const headH = 40, top = headH + 26, bottom = L.H - 58;
    const pages = paginate(A, 0, top, bottom);
    const k = 1.8, T = L.T, out = [];
    for (let i = 0; i < pages.length; i++) {
      const cv = document.createElement('canvas');
      cv.width = Math.round(L.W * k); cv.height = Math.round(L.H * k);
      const g = cv.getContext('2d');
      g.scale(k, k);
      rect(g, 0, 0, L.W, L.H, T.bg);
      if (i) {
        rect(g, 0, 0, L.W, headH, T.head);
        const x = spaced(g, '曙光 · 人物卡', L.pad, headH / 2, font(13, 900, 'song'), 2, T.headText);
        text(g, measure(font(13, 400, 'kai'), M.title) <= 300 && !/\n/.test(M.title) ? M.title : '轮回者档案（续）', x + 14, headH / 2, font(13, 400, 'kai'), DARK.mute);
        text(g, 'DOSSIER · CONTINUED', L.W - L.pad, headH / 2, font(9.5, 400, 'mono'), DARK.sky, 'right');
        rect(g, L.pad, headH - 3, 60, 6, T.blue);
      }
      for (const { a, y } of pages[i]) a.draw(g, L.pad, y);
      const fy = L.H - 34;
      rect(g, L.pad, fy - 14, L.cw, 1, T.line);
      text(g, '曙光 · 无限流跑团　人物卡', L.pad, fy, font(11, 400, 'kai'), T.mute);
      text(g, `${i + 1} / ${pages.length}`, L.W - L.pad, fy, font(11, 500, 'mono'), T.sub, 'right');
      const jpg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', 0.86)).arrayBuffer());
      out.push({ jpg, pw: cv.width, ph: cv.height });
      cv.width = cv.height = 0;
      if (onProgress) onProgress(i + 1, pages.length);
      await tick();
    }
    return { blob: pdfFile(out, M.title + ' · 曙光人物卡'), pages: out.length };
  }
  function pdfFile(pages, title) {
    const enc = new TextEncoder(), chunks = [], xref = [];
    let len = 0;
    const w = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const start = (id) => { xref[id] = len; w(`${id} 0 obj\n`); };
    const W = 595.28, H = 841.89, n = pages.length;
    const hex = (s) => 'FEFF' + [...s].map((ch) => { const c = ch.codePointAt(0); if (c < 0x10000) return c.toString(16).padStart(4, '0'); const v = c - 0x10000; return ((v >> 10) + 0xD800).toString(16) + ((v & 0x3FF) + 0xDC00).toString(16); }).join('').toUpperCase();
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    w(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    start(1); w('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    start(2); w(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${4 + 3 * i} 0 R`).join(' ')}] >>\nendobj\n`);
    start(3); w(`<< /Title <${hex(title)}> /Creator <${hex('曙光 · 无限流跑团')}> /Producer (Shuguang offline) /CreationDate (D:${stamp}) >>\nendobj\n`);
    pages.forEach((p, i) => {
      const P = 4 + 3 * i, cs = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
      start(P); w(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${P + 2} 0 R >> >> /Contents ${P + 1} 0 R >>\nendobj\n`);
      start(P + 1); w(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
      start(P + 2); w(`<< /Type /XObject /Subtype /Image /Width ${p.pw} /Height ${p.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);
      w(p.jpg); w('\nendstream\nendobj\n');
    });
    const N = 4 + 3 * n, xo = len;
    let x = `xref\n0 ${N}\n0000000000 65535 f \n`;
    for (let i = 1; i < N; i++) x += String(xref[i]).padStart(10, '0') + ' 00000 n \n';
    w(x + `trailer\n<< /Size ${N} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xo}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  // ---------------------------------------------------------------- Excel：OOXML + 不压缩的 zip
  const XE = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  // 样式编号（对应 STYLES 里 cellXfs 的顺序）
  const X = { TITLE: 1, SUB: 2, TAG: 3, SEC: 4, HEAD: 5, LABEL: 6, TEXT: 7, LONG: 8, NUM: 9, CENTER: 10, BOLD: 11, TLAB: 12, TNUM: 13, HEADL: 14, NOTE: 15, LINK: 16 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="9">
<font><sz val="11"/><color rgb="FF050A18"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><b/><sz val="18"/><color rgb="FFF2F2FF"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><sz val="10"/><color rgb="FF8DB0D6"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><b/><sz val="10"/><color rgb="FF050A18"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><b/><sz val="13"/><color rgb="FF050A18"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><b/><sz val="10"/><color rgb="FFF2F2FF"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><sz val="10"/><color rgb="FF12305C"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><b/><sz val="11"/><color rgb="FF050A18"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
<font><sz val="10"/><color rgb="FF4F6A8E"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF050A18"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF3E9BE8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FB"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFC5D3E6"/></left><right style="thin"><color rgb="FFC5D3E6"/></right><top style="thin"><color rgb="FFC5D3E6"/></top><bottom style="thin"><color rgb="FFC5D3E6"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FF050A18"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFC5D3E6"/></left><right style="thin"><color rgb="FFC5D3E6"/></right><top style="medium"><color rgb="FF050A18"/></top><bottom style="thin"><color rgb="FFC5D3E6"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="7" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`.replace(/<alignment(?![^>]*wrapText)/g, '<alignment wrapText="1"');

  function Sheet(name, widths) {
    const rows = new Map(), merges = [], heights = new Map();
    let r = 1;
    const sh = {
      name, widths, rows, merges, heights, freeze: 0,
      get r() { return r; }, set r(v) { r = v; },
      put(row, col, v, s = X.TEXT, f) { if (!rows.has(row)) rows.set(row, new Map()); rows.get(row).set(col, { v, s, f }); },
      span(row, c1, c2, v, s) { for (let c = c1; c <= c2; c++) sh.put(row, c, c === c1 ? v : '', s); if (c2 > c1) merges.push(`${colName(c1)}${row}:${colName(c2)}${row}`); },
      height(row, h) { heights.set(row, h); },
      widthOf(c1, c2) { let w = 0; for (let c = c1; c <= c2; c++) w += widths[c - 1] || 10; return w; },
    };
    return sh;
  }
  // 列宽以西文字符计，预留字体差异和单元格内边距；按词换行也计入高度。
  function linesFor(t, width) {
    const room = Math.max(1, width - 2.5);
    let lines = 1, used = 0;
    const units = (ch) => /[^\x00-\x7f]/u.test(ch) ? 2.4 : ch === '\t' ? 5.2 : 1.3;
    for (const tk of tokens(String(t ?? '').replace(/\r\n?/g, '\n'))) {
      if (tk === '\n') { lines++; used = 0; continue; }
      const w = [...tk].reduce((n, ch) => n + units(ch), 0);
      if (w <= room) {
        if (used && used + w > room) { lines++; used = 0; }
        used += w;
      } else for (const ch of tk) {
        const u = units(ch);
        if (used && used + u > room) { lines++; used = 0; }
        used += u;
      }
    }
    return lines;
  }
  const fitH = (lines, base = 15) => Math.max(20, lines * base + 8);
  const excelBase = (style) => style === X.TITLE ? 26 : style === X.SEC ? 19 : 16;
  function cellParts(value, width, base) {
    if (typeof value !== 'string' || !value) return [value];
    const chars = [...value], parts = [];
    let start = 0;
    while (start < chars.length) {
      const prefix = parts.length ? '（续）' : '';
      // 除行高外也遵守单元格 32767 字符限制；按码点拆分，不切断代理对。
      let lo = 0, hi = Math.min(chars.length - start, 16000);
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const t = prefix + chars.slice(start, start + mid).join('');
        if (fitH(linesFor(t, width), base) <= 409) lo = mid;
        else hi = mid - 1;
      }
      const take = Math.max(1, lo);
      parts.push(prefix + chars.slice(start, start + take).join(''));
      start += take;
    }
    return parts;
  }
  // 所有工作表共用续行处理，保留横向合并；数字只出现一次，公式引用跟随行号移动。
  function expandSheet(sh) {
    const out = Sheet(sh.name, sh.widths), starts = new Map(), ends = new Map();
    const spans = new Map();
    for (const ref of sh.merges) {
      const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)\d+$/);
      const cnum = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const row = +m[2];
      if (!spans.has(row)) spans.set(row, new Map());
      spans.get(row).set(cnum(m[1]), cnum(m[3]));
    }
    const last = Math.max(...sh.rows.keys());
    let next = 1;
    for (let r = 1; r <= last; r++) {
      starts.set(r, next);
      const merged = spans.get(r) || new Map();
      const cells = [...(sh.rows.get(r) || [])].map(([c, cell]) => {
        const width = sh.widthOf(c, merged.get(c) || c);
        const base = excelBase(cell.s);
        // 大字号和缩进对应更小的可用字符数。
        const room = width * 16 / base - ([X.TITLE, X.SUB, X.SEC].includes(cell.s) ? 3 : 0);
        return { c, cell, room, base, parts: cell.f ? [cell.v] : cellParts(cell.v, room, base) };
      });
      const count = Math.max(1, ...cells.map((c) => c.parts.length));
      for (let i = 0; i < count; i++) {
        let height = i ? 20 : Math.min(409, sh.heights.get(r) || 18);
        for (const { c, cell, room, base, parts } of cells) {
          const v = parts[i] ?? '';
          out.put(next, c, v, cell.s, i ? undefined : cell.f);
          height = Math.max(height, fitH(linesFor(v, room), base));
        }
        for (const [c1, c2] of merged) out.merges.push(`${colName(c1)}${next}:${colName(c2)}${next}`);
        if (cells.length) out.height(next, Math.ceil(height * 4) / 4);
        next++;
      }
      ends.set(r, next - 1);
    }
    const ref = (c, dollar, r, end = false) => c + dollar + ((end ? ends : starts).get(+r) || r);
    for (const row of out.rows.values()) for (const cell of row.values()) if (cell.f) {
      cell.f = cell.f.replace(/(\$?[A-Z]+)(\$?)(\d+)(?::(\$?[A-Z]+)(\$?)(\d+))?/g,
        (_, c, d, r, c2, d2, r2) => ref(c, d, r) + (c2 ? ':' + ref(c2, d2, r2, true) : ''));
    }
    out.freeze = sh.freeze ? ends.get(sh.freeze) : 0;
    return out;
  }
  function sheetXML(sh) {
    let maxC = sh.widths.length, maxR = 1;
    const body = [...sh.rows.keys()].sort((a, b) => a - b).map((r) => {
      maxR = Math.max(maxR, r);
      const cells = [...sh.rows.get(r).entries()].sort((a, b) => a[0] - b[0]).map(([c, { v, s, f }]) => {
        maxC = Math.max(maxC, c);
        const ref = colName(c) + r;
        if (f) return `<c r="${ref}" s="${s}"><f>${XE(f)}</f>${typeof v === 'number' ? `<v>${v}</v>` : ''}</c>`;
        if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
        if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
        return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${XE(v)}</t></is></c>`;
      }).join('');
      const h = sh.heights.get(r);
      return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells}</row>`;
    }).join('');
    const pane = sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze + 1}" sqref="A${sh.freeze + 1}"/>` : '<selection activeCell="A1" sqref="A1"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><tabColor rgb="FF3E9BE8"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${colName(maxC)}${maxR}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18" customHeight="1"/><cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }

  function xlsx(M) {
    const sheets = [];
    const head = (sh, title, cols) => {
      sh.span(1, 1, cols, title, X.TITLE); sh.height(1, 36);
      sh.span(2, 1, cols, [M.player && '玩家　' + M.player, '导出于 ' + M.date, '曙光 · 无限流跑团　' + M.site].filter(Boolean).join('　·　'), X.SUB); sh.height(2, 20);
      sh.r = 4;
    };
    const sec = (sh, no, title, cols) => {
      if (sh.r > 4) sh.r++;
      sh.put(sh.r, 1, String(no).padStart(2, '0'), X.TAG);
      sh.span(sh.r, 2, cols, title, X.SEC); sh.height(sh.r, 26);
      sh.r++;
    };
    const nv = (v) => { const n = numOf(v); return n != null ? n : v ?? ''; };

    // 1. 人物卡总览
    {
      const sh = Sheet('人物卡', [12, 15, 12, 15, 12, 15, 12, 15]);
      head(sh, '曙光 · 人物卡　' + M.title, 8);
      sec(sh, 1, '基本信息', 8);
      const info = M.info.filter(([k]) => k !== '世界观');
      for (let i = 0; i < info.length; i += 4) {
        info.slice(i, i + 4).forEach(([k, v], j) => { sh.put(sh.r, j * 2 + 1, k, X.LABEL); sh.put(sh.r, j * 2 + 2, v, X.TEXT); });
        sh.height(sh.r, 22); sh.r++;
      }
      const world = M.info.find(([k]) => k === '世界观');
      if (world) { sh.put(sh.r, 1, '世界观', X.LABEL); sh.span(sh.r, 2, 8, world[1], X.TEXT); sh.height(sh.r, 22); sh.r++; }
      sh.r++;
      ['剩余奖励点', ...M.grades.map(([g]) => g + ' 级支线')].forEach((t, i) => sh.put(sh.r, i + 1, t, X.HEAD)); sh.height(sh.r, 22); sh.r++;
      sh.put(sh.r, 1, nv(M.points), numOf(M.points) != null ? X.NUM : X.CENTER);
      M.grades.forEach(([, v], i) => sh.put(sh.r, i + 2, nv(v), X.CENTER)); sh.height(sh.r, 22); sh.r++;

      sec(sh, 2, '身体素质', 8);
      ['属性', '初始', '强化', '锻炼', '锻炼上限', '合计'].forEach((t, i) => sh.put(sh.r, i + 1, t, X.HEAD)); sh.height(sh.r, 22); sh.r++;
      M.attrs.forEach((a) => {
        const r = sh.r;
        sh.put(r, 1, a.full, X.LABEL);
        [a.base, a.enh, a.train, a.cap].forEach((v, i) => sh.put(r, i + 2, numOf(v) != null ? numOf(v) : '', X.NUM));
        sh.put(r, 6, a.tot || 0, X.TNUM, `SUM(B${r}:D${r})`);
        sh.height(r, 22); sh.r++;
      });

      sec(sh, 3, '基础天赋 · 物、魔、神（精神）、科', 8);
      M.talents.forEach(([k], i) => sh.put(sh.r, i + 1, k, X.HEAD)); sh.height(sh.r, 22); sh.r++;
      M.talents.forEach(([, v], i) => sh.put(sh.r, i + 1, nv(v), numOf(v) != null ? X.NUM : X.CENTER)); sh.height(sh.r, 22); sh.r++;
      if (M.extraTalents.length) {
        sh.span(sh.r, 1, 8, '额外天赋（主神决定是否开放）', X.HEADL); sh.height(sh.r, 22); sh.r++;
        M.extraTalents.forEach(([k, v]) => {
          sh.span(sh.r, 1, 2, k, X.LABEL); sh.put(sh.r, 3, nv(v), numOf(v) != null ? X.NUM : X.CENTER); sh.height(sh.r, fitH(linesFor(k, 27))); sh.r++;
        });
      }
      [...M.skill, ...M.origin].forEach(([k], i) => sh.put(sh.r, i + 1, k, X.HEAD)); sh.height(sh.r, 22); sh.r++;
      [...M.skill, ...M.origin].forEach(([, v], i) => sh.put(sh.r, i + 1, nv(v), numOf(v) != null ? X.NUM : X.CENTER)); sh.height(sh.r, 22); sh.r++;

      sec(sh, 4, '强化项目', 8);
      sh.put(sh.r, 1, '类型', X.HEAD); sh.span(sh.r, 2, 6, '名称', X.HEADL); sh.put(sh.r, 7, '等级', X.HEAD); sh.height(sh.r, 22); sh.r++;
      [...M.main.map((m) => ['主要', ...m]), ...M.minor.map((m) => ['次要', ...m])].forEach(([t, n, g]) => {
        sh.put(sh.r, 1, t, t === '主要' ? X.TAG : X.LINK); sh.span(sh.r, 2, 6, n, t === '主要' ? X.BOLD : X.TEXT); sh.put(sh.r, 7, g, X.CENTER); sh.height(sh.r, 22); sh.r++;
      });

      if (M.systems.length) {
        sec(sh, 5, '修炼体系', 8);
        sh.span(sh.r, 1, 2, '体系', X.HEADL); sh.span(sh.r, 3, 4, '境界', X.HEADL); sh.span(sh.r, 5, 8, '备注', X.HEADL); sh.height(sh.r, 22); sh.r++;
        M.systems.forEach(([a, b, c]) => {
          sh.span(sh.r, 1, 2, a, X.BOLD); sh.span(sh.r, 3, 4, b, X.TEXT); sh.span(sh.r, 5, 8, c, X.TEXT);
          sh.height(sh.r, fitH(Math.max(linesFor(a, 27), linesFor(b, 27), linesFor(c, 54))));
          sh.r++;
        });
      }
      if (M.story) {
        sec(sh, 6, '人物背景', 8);
        String(M.story).split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((p) => { sh.span(sh.r, 1, 8, p, X.LONG); sh.height(sh.r, fitH(linesFor(p, sh.widthOf(1, 8)))); sh.r++; });
      }
      sheets.push(sh);
    }

    // 2. 强化与道具：一张表，第一列分类，可以筛选
    {
      const cols = ['分类', '名称', '等级', '奖励点', '熟练度', '数量', '类别', '来源', '图鉴编号', '效果', '备注'];
      const widths = [7, 22, 8, 10, 9, 7, 14, 11, 10, 62, 18];
      if (M.withCat) { cols.push('图鉴原文'); widths.push(62); }
      const sh = Sheet('强化与道具', widths);
      head(sh, '强化与道具　' + M.title, cols.length);
      sh.r = 3;
      cols.forEach((t, i) => sh.put(3, i + 1, t, X.HEAD)); sh.height(3, 24); sh.freeze = 3;
      let r = 4;
      const first = r;
      [...M.enh.map((x) => ['强化', x]), ...M.items.map((x) => ['道具', x])].forEach(([k, x]) => {
        const v = [k, x.n, x.g, nv(x.pts), x.lv || '', x.qty || '', x.type, x.from, x.cat ? x.cat.no : '', x.eff, x.note];
        if (M.withCat) v.push(x.catText || '');
        v.forEach((val, i) => sh.put(r, i + 1, val, i === 0 ? (k === '强化' ? X.TAG : X.LINK) : i === 1 ? X.BOLD : i === 2 || i === 4 || i === 5 ? X.CENTER : i === 3 ? (typeof val === 'number' ? X.NUM : X.CENTER) : i === 8 ? X.LINK : i >= 9 ? X.LONG : X.TEXT));
        sh.height(r, fitH(Math.max(linesFor(x.n, 22), linesFor(x.eff, 62), linesFor(x.note, 18), M.withCat ? linesFor(x.catText, 62) : 1)));
        r++;
      });
      const sum = [...M.enh, ...M.items].reduce((s, x) => s + (numOf(x.pts) || 0), 0);
      sh.put(r, 1, '合计', X.TLAB); sh.span(r, 2, 3, `${M.enh.length} 项强化，${M.items.length} 件道具`, X.TLAB);
      sh.put(r, 4, sum, X.TNUM, r > first ? `SUM(D${first}:D${r - 1})` : undefined);
      for (let c = 5; c <= cols.length; c++) sh.put(r, c, '', X.TLAB);
      sh.height(r, 24);
      sheets.push(sh);
    }

    // 3. 收支
    {
      const sh = Sheet('收支记录', [8, 46, 12, 7, 7, 7, 7, 7]);
      head(sh, '收支记录　' + M.title, 8);
      const totals = {};
      const block = (no, title, list, srcT, key) => {
        sec(sh, no, title, 8);
        ['场次', srcT, '奖励点', 'S', 'A', 'B', 'C', 'D'].forEach((t, i) => sh.put(sh.r, i + 1, t, X.HEAD)); sh.height(sh.r, 22); sh.r++;
        const a = sh.r;
        list.forEach((x) => {
          sh.put(sh.r, 1, nv(x.n), X.CENTER); sh.put(sh.r, 2, x.src, X.TEXT);
          sh.put(sh.r, 3, nv(x.pts), numOf(x.pts) != null ? X.NUM : X.CENTER);
          x.g.forEach((v, i) => sh.put(sh.r, i + 4, nv(v), X.CENTER));
          sh.height(sh.r, fitH(linesFor(x.src, 46))); sh.r++;
        });
        const b = sh.r - 1;
        sh.put(sh.r, 1, '合计', X.TLAB); sh.put(sh.r, 2, '', X.TLAB);
        const tot = list.reduce((s, x) => s + (numOf(x.pts) || 0), 0);
        sh.put(sh.r, 3, tot, X.TNUM, b >= a ? `SUM(C${a}:C${b})` : undefined);
        for (let i = 0; i < 5; i++) sh.put(sh.r, i + 4, list.reduce((s, x) => s + (numOf(x.g[i]) || 0), 0), X.TNUM, b >= a ? `SUM(${colName(i + 4)}${a}:${colName(i + 4)}${b})` : undefined);
        sh.height(sh.r, 22);
        totals[key] = { row: sh.r, v: tot };
        sh.r++;
      };
      block(1, '收入记录', M.income, '收入来源', 'in');
      block(2, '支出记录', M.expense, '支出去向', 'out');
      sh.r++;
      sh.put(sh.r, 1, '结余', X.TLAB); sh.put(sh.r, 2, '收入合计 − 支出合计', X.TLAB);
      sh.put(sh.r, 3, totals.in.v - totals.out.v, X.TNUM, `C${totals.in.row}-C${totals.out.row}`);
      sh.height(sh.r, 24);
      sheets.push(sh);
    }

    // 4. 人脉与杂项（有内容才加）
    if (M.npc.length || M.misc) {
      const sh = Sheet('人脉与杂项', [10, 30, 50]);
      head(sh, '人脉与杂项　' + M.title, 3);
      if (M.npc.length) {
        sec(sh, 1, '人脉 ／ 势力 ／ 好感度', 3);
        ['场次', '人物或势力', '关系／状态'].forEach((t, i) => sh.put(sh.r, i + 1, t, X.HEAD)); sh.height(sh.r, 22); sh.r++;
        M.npc.forEach((x) => { sh.put(sh.r, 1, nv(x.n), X.CENTER); sh.put(sh.r, 2, x.who, X.BOLD); sh.put(sh.r, 3, x.rel, X.TEXT); sh.height(sh.r, fitH(Math.max(linesFor(x.who, 30), linesFor(x.rel, 50)))); sh.r++; });
      }
      if (M.misc) {
        sec(sh, 2, '杂项记录', 3);
        String(M.misc).split(/\n+/).filter((s) => s.trim()).forEach((p) => { sh.span(sh.r, 1, 3, p.trim(), X.LONG); sh.height(sh.r, fitH(linesFor(p, 90))); sh.r++; });
      }
      sheets.push(sh);
    }

    const enc = new TextEncoder();
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${XE(M.title + ' · 曙光人物卡')}</dc:title><dc:creator>曙光 · 无限流跑团</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${XE(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', STYLES],
      ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXML(expandSheet(s))]),
    ].map(([name, s]) => ({ name, data: enc.encode(s) }));
    return { blob: zip(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), sheets: sheets.map((s) => s.name) };
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files, type) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const size = central.reduce((s, b) => s + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, off, true); e.setUint16(20, 0, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type });
  }

  // 工坊使用浏览器已经排好的卡面。内联字体、图片和计算样式后绘入 300dpi A4，
  // PNG 和 PDF 共用此画布；PDF 打包继续复用人物卡的 pdfFile，不添加依赖。
  const cardAssets = new Map();
  function dataAsset(url) {
    if (!cardAssets.has(url)) cardAssets.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('素材加载失败'); return r.blob(); }).then((b) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(b); })).catch((e) => { cardAssets.delete(url); throw e; }));
    return cardAssets.get(url);
  }
  // 字体按 unicode-range 切片，几百个切片不能全内联：只取这一页文字用得到的切片。
  // 没写 unicode-range 的字体规则照旧全部带上。
  function rangeHits(range, cps) {
    if (!range) return true;
    return range.split(',').some((part) => {
      const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
      if (!m) return true;
      if (!m[2] && !m[1].includes('?')) return cps.has(parseInt(m[1], 16));
      const lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16);
      for (const c of cps) if (c >= lo && c <= hi) return true;
      return false;
    });
  }
  // 返回内联字体 CSS，以及每个字体切片的一个“探针字”（取自这一页的文字，保证落在该切片里）。
  async function cardFonts(text) {
    const rules = [], probes = [], cps = new Set([...text].map((c) => c.codePointAt(0)));
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch (e) { continue; }
      for (const r of list) if (r.type === CSSRule.FONT_FACE_RULE) {
        const ur = r.style.getPropertyValue('unicode-range');
        if (!rangeHits(ur, cps)) continue;
        let css = r.cssText;
        for (const m of [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)]) css = css.replace(m[0], `url("${await dataAsset(new URL(m[1], sheet.href || location.href).href)}")`);
        rules.push(css);
        // 探针字要有笔画：跳过空白（含全角空格）和零宽字符
        const one = new Set(); const ch = [...cps].find((c) => !/[\s​-‍﻿]/.test(String.fromCodePoint(c)) && (one.clear(), one.add(c), rangeHits(ur, one)));
        if (ch) probes.push({ fam: r.style.getPropertyValue('font-family').replace(/["']/g, ''), w: (r.style.getPropertyValue('font-weight') || '400').split(' ')[0], st: r.style.getPropertyValue('font-style') || 'normal', ch: String.fromCodePoint(ch) });
      }
    }
    return { css: rules.join('\n'), probes };
  }
  const cardStyleKeys = ('display position box-sizing width height min-width min-height max-width max-height top right bottom left margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius background-color background-image background-size background-position color opacity overflow overflow-x overflow-y font-family font-size font-style font-weight font-variant-numeric line-height letter-spacing text-align text-indent text-transform text-decoration white-space overflow-wrap word-break word-spacing text-autospace text-overflow vertical-align flex flex-direction flex-shrink flex-grow flex-basis align-items align-self align-content justify-items justify-self justify-content gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow grid-auto-rows direction transform transform-origin object-fit object-position box-shadow z-index fill stroke stroke-width stroke-linecap stroke-linejoin').split(' ');
  async function cardSnapshot(el) {
    const copy = el.cloneNode(false), style = getComputedStyle(el);
    copy.removeAttribute('id'); copy.removeAttribute('tabindex'); copy.removeAttribute('role');
    const apply = (node, cs) => { node.style.cssText = cardStyleKeys.map((k) => `${k}:${cs.getPropertyValue(k)};`).join(''); };
    apply(copy, style);
    // 固定离屏测量容器的 visibility 不应进入导出。
    copy.style.visibility = 'visible';
    if (el.tagName === 'IMG') copy.src = await dataAsset(el.src);
    const pseudo = (which) => {
      const cs = getComputedStyle(el, which);
      if (!cs.content || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return;
      const span = document.createElement('span'); apply(span, cs); span.textContent = cs.content.replace(/^["']|["']$/g, ''); copy.appendChild(span);
    };
    // SVG 不接受 HTML 伪元素，原生子节点和描边样式直接保留。
    if (el.namespaceURI !== 'http://www.w3.org/2000/svg') pseudo('::before');
    for (const child of el.childNodes) copy.appendChild(child.nodeType === 1 ? await cardSnapshot(child) : child.cloneNode());
    if (el.namespaceURI !== 'http://www.w3.org/2000/svg') pseudo('::after');
    return copy;
  }
  async function cards(pages, kind, onProgress) {
    await document.fonts.ready;
    const out = [], jpgs = [];
    const W = 210 * 96 / 25.4, H = 297 * 96 / 25.4;
    const host = document.createElement('div'); host.className = 'ws-measure'; document.body.appendChild(host);
    try {
      for (let i = 0; i < pages.length; i++) {
        if (onProgress) onProgress(i + 1, pages.length);
        host.innerHTML = pages[i];
        await Promise.all([...host.querySelectorAll('img')].map((im) => im.decode()));
        const page = await cardSnapshot(host.firstElementChild);
        const fonts = await cardFonts(page.textContent + ' ');
        const xml = new XMLSerializer().serializeToString(page);
        // SVG 图片里内联的字体在 img.decode() 之后才陆续载完（载完前中文是空白，Chromium 实测），
        // 所以在页面下方加一条探针：每个字体切片一个字，画布上看到每个探针都有笔画了再画正式页面（最多等 4 秒）。
        const PW = 28, cols = Math.floor(W / PW), PH = Math.max(1, Math.ceil(fonts.probes.length / cols)) * PW;
        const probe = `<div style="position:absolute;left:0;top:${H}px;width:${W}px;height:${PH}px;background:#fff">${fonts.probes.map((p, k) => `<span style="position:absolute;left:${(k % cols) * PW}px;top:${Math.floor(k / cols) * PW}px;width:${PW}px;font-family:'${p.fam}';font-weight:${p.w};font-style:${p.st};font-size:20px;line-height:${PW}px;text-align:center;color:#000">${p.ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`).join('')}</div>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + PH}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${fonts.css}</style>${xml}${probe}</div></foreignObject></svg>`;
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const pc = document.createElement('canvas'); pc.width = Math.ceil(W); pc.height = PH;
        const pg = pc.getContext('2d', { willReadFrequently: true });
        const inked = () => {
          pg.fillStyle = '#fff'; pg.fillRect(0, 0, pc.width, pc.height); pg.drawImage(img, 0, H, W, PH, 0, 0, W, PH);
          const d = pg.getImageData(0, 0, pc.width, pc.height).data;
          return fonts.probes.every((_, k) => {
            const x0 = (k % cols) * PW, y0 = Math.floor(k / cols) * PW;
            for (let y = y0; y < y0 + PW; y++) for (let x = x0; x < x0 + PW; x++) if (d[(y * pc.width + x) * 4] < 128) return true;
            return false;
          });
        };
        for (let t = 0; t < 40 && !inked(); t++) await new Promise((r) => setTimeout(r, 100));
        const cv = document.createElement('canvas'); cv.width = 2480; cv.height = 3508;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, W, H, 0, 0, cv.width, cv.height);
        if (kind === 'pdf') jpgs.push({ jpg: new Uint8Array(await (await toBlob(cv, 'image/jpeg', .96)).arrayBuffer()), pw: cv.width, ph: cv.height });
        else out.push({ blob: await pngDPI(await toBlob(cv, 'image/png')), w: cv.width, h: cv.height });
        cv.width = cv.height = 0; img.src = ''; await tick();
      }
      if (kind === 'pdf') out.push({ blob: pdfFile(jpgs, '曙光卡牌 · A4'), pages: pages.length });
      return out;
    } finally { host.remove(); }
  }
  // PNG pHYs 元数据：300dpi，供打印软件读取物理尺寸。
  async function pngDPI(blob) {
    const data = new Uint8Array(await blob.arrayBuffer()), chunk = new Uint8Array(21), v = new DataView(chunk.buffer);
    v.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); v.setUint32(8, 11811); v.setUint32(12, 11811); chunk[16] = 1;
    v.setUint32(17, crc32(chunk.subarray(4, 17)));
    return new Blob([data.subarray(0, 33), chunk, data.subarray(33)], { type: 'image/png' });
  }

  window.SGX = { png, pdf, xlsx, cards };
})();
