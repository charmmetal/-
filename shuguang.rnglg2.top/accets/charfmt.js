/* 人物卡格式转换：群里用的 Excel 人物卡模板导出的 JSON（[{name, rows: {行号: {列字母: 值}}}]）→ 网页人物卡。
   按单元格里的标签文字定位，不写死行号：玩家「自行下拉」加了行也能读。
   浏览器里是 window.SG_FMT，构建脚本里用 require。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SG_FMT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const col2n = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const n2col = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const str = (v) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').trim();
  const flat = (v) => str(v).replace(/\s+/g, '');
  // 模板里的「AA」「BB」就是 2A、2B
  const grade = (g) => { g = str(g).toUpperCase(); return /^([ABCD])\1$/.test(g) ? '2' + g[0] : str(g); };
  const TALENTS = ['物系天赋', '魔系天赋', '神系天赋', '科系天赋'];
  const TALENT_ALIASES = [
    ['物系天赋', '物', '物系'], ['魔系天赋', '魔', '魔系'],
    ['神系天赋', '精神天赋', '神', '神系', '神（精神）', '精神力天赋', '精神力'],
    ['科系天赋', '科', '科系'],
  ];
  // v2：talents 固定按物、魔、神、科排列；选开天赋独立保存为 [名称, 值]。
  // 无版本的旧数组顺序是物、魔、科、驾驶、精神力，不能直接截取前四项。
  function normalizeTalents(o) {
    const scalar = (v) => v == null || typeof v === 'object' ? '' : str(v);
    const t = o.talents;
    const pick = (names) => {
      for (const src of [t, o]) if (src && !Array.isArray(src)) {
        for (const k of names) if (src[k] != null && scalar(src[k]) !== '') return scalar(src[k]);
      }
      return '';
    };
    const modern = +o.schemaVersion >= 2;
    const talents = Array.isArray(t)
      ? (modern ? [0, 1, 2, 3] : [0, 1, 4, 2]).map((i, n) => scalar(t[i]) || pick(TALENT_ALIASES[n]))
      : TALENT_ALIASES.map(pick);
    const extraTalents = Array.isArray(o.extraTalents) ? o.extraTalents.map((r) => [scalar(r && r[0]), scalar(r && r[1])]) : [];
    // 有些旧 JSON 将精神天赋按名称放在附加天赋里。
    for (let i = extraTalents.length - 1; i >= 0; i--) if (TALENT_ALIASES[2].includes(extraTalents[i][0])) {
      if (!talents[2]) talents[2] = extraTalents[i][1];
      extraTalents.splice(i, 1);
    }
    const driving = Array.isArray(t) && !modern ? scalar(t[3]) : pick(['驾驶天赋', '驾驶']);
    if ((!Array.isArray(o.extraTalents) || driving !== '') && !extraTalents.some(([n]) => n === '驾驶' || n === '驾驶天赋')) extraTalents.unshift(['驾驶', driving]);
    return { schemaVersion: 2, talents, extraTalents, talentFloor: +o.talentFloor === 100 ? 100 : 50 };
  }

  function isRaw(o) {
    return Array.isArray(o) && o.length > 0 && o.every((s) => s && typeof s === 'object' && s.rows && typeof s.rows === 'object');
  }

  function grid(sheet) {
    const rows = new Map();
    if (!sheet) return { rows, at: () => '', find: () => [] };
    for (const [r, cells] of Object.entries(sheet.rows || {})) {
      const m = new Map();
      for (const [c, v] of Object.entries(cells || {})) if (/^[A-Z]{1,3}$/.test(c)) m.set(col2n(c), str(v));
      rows.set(+r, m);
    }
    const order = [...rows.keys()].sort((a, b) => a - b);
    const at = (r, c) => (rows.get(r) && rows.get(r).get(c)) || '';
    // 找出所有文字等于 label 的单元格（忽略空白和换行）
    const find = (label, test) => {
      const out = [];
      for (const r of order) for (const [c, v] of rows.get(r)) if (test ? test(flat(v)) : flat(v) === label) out.push([r, c]);
      return out;
    };
    return { rows, order, at, find };
  }

  const LABELS = new Set(['姓名', '玩家', '年龄', '体型', '国籍', '种裔', '性别', '身份', '世界观', '剩余奖励点', '剩余支线剧情', '基本信息', '世界观及背景']);

  function fromRaw(sheets) {
    const byName = (n, i) => sheets.find((s) => s.name === n) || sheets[i];
    const G = grid(byName('人物卡', 0));
    const X = grid(byName('强化及道具总览', 1));
    const first = (label, test) => G.find(label, test)[0];
    // 标签右边一两格里第一个非空、且不是别的标签的值
    const right = (label) => {
      const p = first(label); if (!p) return '';
      for (let k = 1; k <= 3; k++) { const v = G.at(p[0], p[1] + k); if (v) return LABELS.has(flat(v)) ? '' : v; }
      return '';
    };
    const below = (label) => { const p = first(label); return p ? G.at(p[0] + 1, p[1]) : ''; };

    const c = {
      name: right('姓名'), player: right('玩家'), age: right('年龄'), body: right('体型'), nation: right('国籍'),
      race: right('种裔'), sex: right('性别'), job: right('身份'), world: right('世界观'),
    };
    const story = first('', (v) => v === '人物背景');
    c.story = story ? G.at(story[0], story[1] + 1) : '';

    // 六维：表头行（智力、精神力……）定列，「初始/强化/锻炼/上限」行取标签右边一格
    const SIXS = ['智力', '精神力', '细胞活性', '神经反应', '肌肉强度', '免疫力'];
    const head = first('智力');
    const rowOf = (lab) => { const p = G.find(lab).find(([r]) => head && r > head[0] && r < head[0] + 10); return p ? p[0] : 0; };
    const rr = { base: rowOf('初始'), enh: rowOf('强化'), train: rowOf('锻炼'), cap: rowOf('上限') };
    c.attrs = SIXS.map((k) => {
      const p = head && G.find(k).find(([r]) => r === head[0]);
      const o = {};
      for (const key of Object.keys(rr)) o[key] = p && rr[key] ? G.at(rr[key], p[1] + 1).replace(/[^\d]/g, '') : '';
      return o;
    });

    const pts = first('剩余奖励点');
    c.points = right('剩余奖励点');
    c.grades = ['S', 'A', 'B', 'C', 'D'].map((g) => {
      if (!pts) return '';
      const p = G.find(g).find(([r, cc]) => r === pts[0] && cc > pts[1]);
      return p ? G.at(p[0] + 1, p[1]) : '';
    });

    // 主要／次要强化项目：标题行下一行是「等级 | 名称」，再下一行是等级
    c.main = []; c.minor = [];
    for (const [r, cc] of G.find('', (v) => v === '主要强化项目' || v === '次要强化项目')) {
      const lab = G.find('等级').find(([r2, c2]) => r2 === r + 1 && c2 === cc);
      if (!lab) continue;
      const n = G.at(r + 1, cc + 1), g = grade(G.at(r + 2, cc));
      if (!n && !g) continue;
      (flat(G.at(r, cc)) === '主要强化项目' ? c.main : c.minor).push([n, g]);
    }
    while (c.main.length < 3) c.main.push(['', '']);

    // 修炼体系：标题行下一行是「体系名 | 备注」，往下几行有「体系境界」
    c.systems = [];
    for (const [r, cc] of G.find('修炼体系')) {
      const name = G.at(r + 1, cc); if (!name) continue;
      const noteAt = G.find('备注').find(([r2, c2]) => r2 === r && c2 > cc && c2 <= cc + 4);
      const realmAt = G.find('体系境界').find(([r2, c2]) => c2 === cc && r2 > r && r2 <= r + 5);
      c.systems.push([name, realmAt ? G.at(realmAt[0] + 1, cc) : '', noteAt ? G.at(r + 1, noteAt[1]) : '']);
    }

    c.schemaVersion = 2;
    // 裸「精神力」也可能是六维表头，只在天赋表头所在行读取此别名。
    const talentRows = new Set(TALENT_ALIASES[0].flatMap((t) => G.find(t).map(([r]) => r)));
    c.talents = TALENT_ALIASES.map((names) => {
      for (const name of names) {
        const p = G.find(name).find(([r]) => name !== '精神力' || talentRows.has(r));
        if (p && G.at(p[0] + 1, p[1]) !== '') return G.at(p[0] + 1, p[1]);
      }
      return '';
    });
    c.extraTalents = [['驾驶', below('驾驶天赋') || below('驾驶')]];
    const known = new Set(TALENT_ALIASES.flat().concat(['驾驶天赋', '驾驶']));
    for (const [r, cc] of G.find('', (v) => v.endsWith('天赋') && !known.has(v))) {
      if (talentRows.has(r)) c.extraTalents.push([G.at(r, cc), G.at(r + 1, cc)]);
    }
    const skv = first('初始技能数值'), tr = first('物系天赋');
    c.skill = [skv && tr ? G.at(tr[0] + 1, skv[1]) : '', skv ? G.at(skv[0] + 1, skv[1]) : ''];
    c.origin = [below('源位面'), below('位面能级'), below('文明等级')];

    // 收支：按表头定列，直到「合计」或「行数不够」那一行
    const ledger = (srcLabel) => {
      const h = first(srcLabel); if (!h) return [];
      const r0 = h[0], hr = G.rows.get(r0);
      const cols = [...hr.keys()].sort((a, b) => a - b);
      const nCol = cols.filter((x) => x < h[1] && flat(hr.get(x)) === '场次').pop();
      const pCol = cols.find((x) => x > h[1] && flat(hr.get(x)) === '奖励点');
      const gCols = ['S', 'A', 'B', 'C', 'D'].map((g) => cols.find((x) => x > (pCol || h[1]) && flat(hr.get(x)) === g));
      const out = [];
      for (const r of G.order) {
        if (r <= r0) continue;
        if ((nCol && /^行数不够/.test(flat(G.at(r, nCol)))) || [nCol, h[1], pCol].filter(Boolean).some((col) => /^合计(?:奖励点(?:收入|支出)?|支线剧情)?$/.test(flat(G.at(r, col))))) break;
        const x = { n: nCol ? G.at(r, nCol) : '', src: G.at(r, h[1]), pts: pCol ? G.at(r, pCol) : '', g: gCols.map((k) => (k ? G.at(r, k) : '')) };
        if (x.n || x.src || x.pts) out.push(x);
      }
      return out;
    };
    c.income = ledger('收入来源');
    c.expense = ledger('支出去向');

    c.npc = [];
    const npcH = first('', (v) => v.startsWith('NPC人物或势力'));
    if (npcH) {
      const hr = G.rows.get(npcH[0]);
      const cols = [...hr.keys()].sort((a, b) => a - b);
      const nCol = cols.filter((x) => x < npcH[1] && flat(hr.get(x)) === '场次').pop();
      const relCol = cols.find((x) => x > npcH[1]);
      for (const r of G.order) {
        if (r <= npcH[0] || r > npcH[0] + 40) continue;
        const x = { n: nCol ? G.at(r, nCol) : '', who: G.at(r, npcH[1]), rel: relCol ? G.at(r, relCol) : '' };
        if (x.who || x.rel) c.npc.push(x);
      }
    }

    const misc = first('杂项记录');
    c.misc = misc ? G.order.filter((r) => r > misc[0] && r <= misc[0] + 12).map((r) => G.at(r, misc[1])).filter((v) => v && !/^本栏用以记录/.test(v)).join('\n') : '';

    // 强化及道具总览：表头里有两个「名称」，左边是强化，右边是道具
    c.enh = []; c.items = [];
    const hdr = X.order && X.order.find((r) => [...X.rows.get(r).values()].filter((v) => flat(v) === '名称').length >= 2);
    if (hdr) {
      const hr = X.rows.get(hdr);
      const cols = [...hr.keys()].sort((a, b) => a - b);
      const names = cols.filter((x) => flat(hr.get(x)) === '名称');
      const map = (from, to, dict) => {
        const m = {};
        for (const x of cols) if (x >= from && x < to) { const k = dict[flat(hr.get(x))]; if (k && !m[k]) m[k] = x; }
        return m;
      };
      const L = map(names[0], names[1], { 名称: 'n', 等级: 'g', 奖励点: 'pts', 熟练度: 'lv', 类别: 'type', 来源: 'from', 效果: 'eff', 备注: 'note' });
      const R = map(names[1], 1e9, { 名称: 'n', 等级: 'g', 奖励点: 'pts', 数量: 'qty', 类别: 'type', 类型: 'kind', 来源: 'from', 效果: 'eff', 备注: 'note' });
      const SKIP_E = new Set(['强化身体素质', '修复']);
      const SKIP_I = new Set(['道具修复', '知识书籍', '技能/功法秘籍', '科技类物品图纸', '开启恐怖片', '回归上一场恐怖片', '回归上一场以外的恐怖片']);
      const get = (r, m, k) => (m[k] ? X.at(r, m[k]) : '');
      for (const r of X.order) {
        if (r <= hdr) continue;
        if (names.some((col) => /^合计(?:奖励点|支线剧情)?$/.test(flat(X.at(r, col))))) break;
        const en = get(r, L, 'n');
        if (en && !SKIP_E.has(en)) c.enh.push({ n: en, g: grade(get(r, L, 'g')), pts: get(r, L, 'pts'), lv: get(r, L, 'lv'), type: get(r, L, 'type'), from: get(r, L, 'from'), eff: get(r, L, 'eff'), note: get(r, L, 'note') });
        const it = get(r, R, 'n');
        if (it && !SKIP_I.has(it)) c.items.push({ n: it, g: grade(get(r, R, 'g')), pts: get(r, R, 'pts'), qty: get(r, R, 'qty'), type: [get(r, R, 'type'), get(r, R, 'kind')].filter(Boolean).join('／'), from: get(r, R, 'from'), eff: get(r, R, 'eff'), note: get(r, R, 'note') });
      }
    }
    return c;
  }

  // 群骰的属性录入指令：.bd 智力100 精神力100 细胞活性100 神经反应100 肌肉组织200 免疫力100 物系天赋150 魔系天赋150 科系天赋150
  //   精神天赋9496 驾驶天赋（其他）561 初始技能0 剩余奖励点0 S0 A0 B0 C0 D0
  // 六维写的是合计；天赋顺序是物、魔、科、精神（网页里是物、魔、神、科）。名字认几种常见写法，顺序不限。
  const BD_SIX = ['智力', '精神力', '细胞活性', '神经反应', '肌肉组织', '免疫力'];
  const BD_TALENTS = [[0, '物系天赋'], [1, '魔系天赋'], [3, '科系天赋'], [2, '精神天赋']];
  const BD_KEYS = (() => {
    const m = new Map();
    const add = (key, ...names) => names.forEach((n) => m.set(n, key));
    add('a0', '智力'); add('a1', '精神力'); add('a2', '细胞活性');
    add('a3', '神经反应', '神经反应速度'); add('a4', '肌肉组织', '肌肉强度', '肌肉组织强度'); add('a5', '免疫力', '免疫力强度');
    TALENT_ALIASES.forEach((names, i) => add('t' + i, ...names.filter((n) => n.length > 1 && n !== '精神力')));
    add('drive', '驾驶天赋', '驾驶'); add('skill', '初始技能', '技能数值'); add('points', '剩余奖励点', '奖励点');
    'SABCD'.split('').forEach((g, i) => add('g' + i, g));
    return m;
  })();
  const bdLabel = (s) => s.replace(/\s+/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[:：=]$/, '').toUpperCase();

  // 读一条 .bd 指令。返回读到的值（都是字符串）和没认出的片段；一个都没认出返回 null
  function parseBd(text) {
    let s = str(text);
    const at = s.search(/[.。]bd(?![a-z])/i);
    if (at >= 0) s = s.slice(at + 3);
    const out = { attrs: Array(6).fill(null), talents: Array(4).fill(null), drive: null, skill: null, points: null, grades: Array(5).fill(null), unknown: [] };
    let hits = 0;
    for (const [, rawLabel, value] of s.matchAll(/([^\s\d+-]+(?:\s*[（(][^）)]*[）)])?)\s*([+-]?\d+(?:\.\d+)?)/g)) {
      const key = BD_KEYS.get(bdLabel(rawLabel));
      if (!key) { out.unknown.push(rawLabel.trim() + value); continue; }
      hits++;
      const i = +key.slice(1);
      if (key[0] === 'a' && key.length === 2) out.attrs[i] = value;
      else if (key[0] === 't') out.talents[i] = value;
      else if (key[0] === 'g') out.grades[i] = value;
      else out[key] = value;
    }
    return hits ? out : null;
  }

  // 由网页人物卡生成 .bd 指令。空着的项写 0；填了但不是数字的项也写 0，名字放进 notNumber 提醒玩家
  function toBd(c) {
    const notNumber = [];
    const n = (label, v) => {
      const t = str(v).replace(/[,，\s]/g, '');
      if (t === '') return label + '0';
      if (/^[+-]?\d+(?:\.\d+)?$/.test(t)) return label + t;
      notNumber.push(label); return label + '0';
    };
    const tot = (a) => ['base', 'enh', 'train'].some((k) => str(a && a[k]) !== '') ? String(['base', 'enh', 'train'].reduce((s, k) => s + (+str(a[k]) || 0), 0)) : '';
    const drive = (c.extraTalents || []).find(([k]) => k === '驾驶' || k === '驾驶天赋');
    const parts = [
      ...BD_SIX.map((l, i) => n(l, tot((c.attrs || [])[i]))),
      ...BD_TALENTS.map(([i, l]) => n(l, (c.talents || [])[i])),
      n('驾驶天赋（其他）', drive ? drive[1] : ''),
      n('初始技能', (c.skill || [])[1]),
      n('剩余奖励点', c.points),
      ...'SABCD'.split('').map((g, i) => n(g, (c.grades || [])[i])),
    ];
    return { text: '.bd ' + parts.join(' '), notNumber };
  }

  return { isRaw, fromRaw, normalizeTalents, parseBd, toBd, TALENTS, grade, col2n, n2col };
});
