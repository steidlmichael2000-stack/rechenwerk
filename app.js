/* Rechenwerk – Oberfläche
 * Tastenfeld nach dem Vorbild klassischer Schulrechner,
 * Eingabe als Token-Liste mit Cursor, Ergebnis in Formelschreibweise.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- Anzeige der internen Tokens ----------
  const DISP = {
    '-': '−', 'sqrt(': '√(', 'cbrt(': '∛(', 'root(': 'ˣ√(', 'abs(': 'Abs(', 'logb(': 'logₐb(',
    'asin(': 'sin⁻¹(', 'acos(': 'cos⁻¹(', 'atan(': 'tan⁻¹(',
    'asinh(': 'sinh⁻¹(', 'acosh(': 'cosh⁻¹(', 'atanh(': 'tanh⁻¹(',
    'integ(': '∫(', 'deriv(': 'd/dx(', 'sum(': 'Σ(', 'prod(': 'Π(', 'ranint(': 'RanInt(',
    'gcd(': 'GCD(', 'lcm(': 'LCM(', 'int(': 'Int(', 'intg(': 'Intg(',
    '⑩': '10', 'ℯ': 'e', 'X': 'x', 'ℙ': 'P', 'ℂ': 'C', '^(': '^(',
  };
  const disp = (t) => DISP[t] || t;
  const VARNAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
  // Tokens, nach denen ein Ergebnis mit „Ans“ weitergeführt wird
  const CONTINUE = new Set(['+', '-', '×', '÷', '^(', '⁄', '²', '³', '⁻¹', '!', '%', 'ℙ', 'ℂ']);

  // ---------- Zustand ----------
  const S = {
    tokens: [], cur: 0, mode: 'edit', // edit | result | error
    shift: false, alpha: false, sto: false,
    ans: 0, preAns: 0, vars: Object.fromEntries(VARNAMES.map((v) => [v, 0])),
    angle: 'D', fmt: 'exact', engK: null,
    result: null, err: null,
    hist: [], histIdx: -1,
    theme: 'glas', vib: true, comma: true, motion: 'dezent',
  };

  const STORE = 'rechenwerk.v1';
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      for (const k of ['ans', 'preAns', 'angle', 'theme', 'vib', 'comma', 'motion']) if (d[k] !== undefined) S[k] = d[k];
      if (d.vars) Object.assign(S.vars, d.vars);
      if (Array.isArray(d.hist)) S.hist = d.hist.slice(-60);
    } catch (e) { /* privater Modus o. Ä. */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        ans: S.ans, preAns: S.preAns, vars: S.vars, angle: S.angle, theme: S.theme, vib: S.vib, comma: S.comma, motion: S.motion, hist: S.hist,
      }));
    } catch (e) { /* egal */ }
  }

  const env = () => ({ angle: S.angle, vars: S.vars, ans: S.ans });

  // ---------- Formelsatz ----------
  const strip = (n) => (n && n.k === 'paren' ? n.a : n);
  const BOX = '<span class="box"></span>';
  const frac = (a, b) => `<span class="frac"><span class="fn">${a}</span><span class="fd">${b}</span></span>`;
  const root = (idx, body) => `<span class="rt">${idx ? `<sup class="ri">${idx}</sup>` : ''}<span class="rs">√</span><span class="rb">${body}</span></span>`;
  const sup = (x) => `<sup>${x}</sup>`;
  const op = (x) => `<span class="op">${x}</span>`;
  const FN = {
    sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin' + sup('−1'), acos: 'cos' + sup('−1'), atan: 'tan' + sup('−1'),
    sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asinh: 'sinh' + sup('−1'), acosh: 'cosh' + sup('−1'), atanh: 'tanh' + sup('−1'),
    ln: 'ln', log: 'log', ranint: 'RanInt', gcd: 'GCD', lcm: 'LCM', int: 'Int', intg: 'Intg',
  };
  function leftmost(n) {
    while (n && (n.k === 'bin' || n.k === 'post')) n = n.a;
    return n;
  }
  function numStr(s) { return S.comma ? s.replace('.', ',') : s; }
  // Anzeige eines Tokens in der einfachen Zeile: Dezimalkomma und ; als Trenner
  function tokStr(t) {
    if (t === '.') return S.comma ? ',' : '.';
    if (t === ',') return S.comma ? ';' : ',';
    return disp(t);
  }

  // Formelsatz. Cursor-Markierungen aus dem Parser (cur = davor, curAfter = dahinter,
  // closeCur = vor der schließenden Klammer, sepCur = vor dem Trenner, curAt = in der Zahl)
  const CUR = '<span class="cursor"></span>';
  const pre = (n) => (n && n.cur ? CUR : '');
  const post = (n) => (n && n.curAfter ? CUR : '');
  // Inhalt ohne äußere Klammer (für Zähler, Nenner, Exponent, Funktionsargumente)
  function inner(n) {
    if (n && n.k === 'paren') return pre(n) + render(n.a) + (n.closeCur ? CUR : '') + post(n);
    return render(n);
  }
  function render(n) {
    if (!n) return BOX;
    if (n.k === 'empty') return n.cur ? `<span class="box has-cur">${CUR}</span>` : BOX;
    return pre(n) + renderBody(n) + post(n);
  }
  function renderBody(n) {
    const R = render;
    switch (n.k) {
      case 'num': {
        if (n.ten) return '10';
        let [m, e] = n.raw.split('e');
        m = numStr(m);
        if (n.curAt !== undefined) m = m.slice(0, n.curAt) + CUR + m.slice(n.curAt);
        if (e === undefined) return m;
        return m + '×10' + sup(e.replace('-', '−'));
      }
      case 'const': return n.v === 'π' ? 'π' : '<i>e</i>';
      case 'var': return `<i>${n.v === 'X' ? 'x' : n.v}</i>`;
      case 'ans': return 'Ans';
      case 'rand': return 'Ran#';
      case 'paren': return `(${R(n.a)}${n.closeCur ? CUR : ''}${n.closed ? ')' : '<span class="ghost">)</span>'}`;
      case 'neg': return '−' + R(n.a);
      case 'post': {
        const a = R(n.a);
        if (n.op === '²') return a + sup(2);
        if (n.op === '³') return a + sup(3);
        if (n.op === '⁻¹') return a + sup('−1');
        return a + n.op;
      }
      case 'bin': {
        const c = n.cur ? CUR : ''; // Cursor vor dem Operator = hinter dem linken Teil
        switch (n.op) {
          case '+': return R(n.a) + c + op('+') + R(n.b);
          case '-': return R(n.a) + c + op('−') + R(n.b);
          case '×': return R(n.a) + c + op('×') + R(n.b);
          case '÷': return R(n.a) + c + op('÷') + R(n.b);
          case 'ℙ': return R(n.a) + c + '<span class="pc">P</span>' + R(n.b);
          case 'ℂ': return R(n.a) + c + '<span class="pc">C</span>' + R(n.b);
          case '⁄': return frac(inner(n.a) + c, inner(n.b));
          case '^': return R(n.a) + c + sup(inner(n.b));
          case 'imp': {
            const l = leftmost(n.b);
            return R(n.a) + (l && l.k === 'num' ? op('×') : '') + R(n.b);
          }
        }
        break;
      }
      case 'func': {
        const last = n.args.length - 1;
        const A = n.args.map((x, i) => inner(x) + ((i === last ? n.closeCur : n.sepCur && n.sepCur[i]) ? CUR : ''));
        const a = (i) => (A[i] !== undefined ? A[i] : BOX);
        const close = n.closed ? ')' : '<span class="ghost">)</span>';
        const sep = S.comma ? '; ' : ', ';
        switch (n.f) {
          case 'sqrt': return root('', a(0));
          case 'cbrt': return root('3', a(0));
          case 'root': return root(a(0), a(1));
          case 'abs': return `<span class="abs">|${a(0)}|</span>`;
          case 'logb': return `log<sub>${a(0)}</sub>(${a(1)}${close}`;
          case 'integ':
            return `<span class="big"><span class="lim">${a(2)}</span><span class="sym">∫</span><span class="lim">${a(1)}</span></span>${a(0)}<span class="dx">d<i>x</i></span>`;
          case 'prod':
            return `<span class="big"><span class="lim">${a(2)}</span><span class="sym">Π</span><span class="lim"><i>x</i>=${a(1)}</span></span>(${a(0)}${close}`;
          case 'sum':
            return `<span class="big"><span class="lim">${a(2)}</span><span class="sym">Σ</span><span class="lim"><i>x</i>=${a(1)}</span></span>(${a(0)}${close}`;
          case 'deriv':
            return `${frac('d', 'd<i>x</i>')}(${a(0)})<span class="at">|<sub><i>x</i>=${a(1)}</sub></span>`;
          default:
            return `${FN[n.f] || n.f}(${A.join(sep) || BOX}${close}`;
        }
      }
    }
    return '?';
  }

  // ---------- Ergebnis formatieren ----------
  function numHtml(f) {
    const m = numStr(f.m.replace('-', '−'));
    return f.e === undefined ? m : `${m}<span class="x10">×10${sup(String(f.e).replace('-', '−'))}</span>`;
  }
  function exactHtml(x) {
    if (S.fmt === 'eng') {
      if (S.engK === null) S.engK = x === 0 ? 0 : Math.floor(Math.floor(Math.log10(Math.abs(x))) / 3) * 3;
      return numHtml(Calc.formatEng(x, S.engK));
    }
    if (S.fmt === 'fact') {
      const pf = Calc.primeFactors(Math.abs(x));
      if (pf) return (x < 0 ? '−' : '') + pf.map(([p, e]) => (e > 1 ? p + sup(e) : p)).join(op('×'));
    }
    const ex = S.fmt === 'dec' ? null : Calc.exactForm(x);
    if (!ex) return numHtml(Calc.formatNumber(x));
    const sg = (s) => (s < 0 ? '−' : '');
    if (ex.type === 'frac') {
      const p = Math.abs(ex.p);
      if (S.fmt === 'mixed' && p > ex.q) {
        return sg(ex.p) + Math.floor(p / ex.q) + frac(p % ex.q, ex.q);
      }
      return sg(ex.p) + frac(p, ex.q);
    }
    if (ex.type === 'pi') {
      const top = (Math.abs(ex.p) === 1 ? '' : Math.abs(ex.p)) + 'π';
      return sg(ex.p) + (ex.q === 1 ? top : frac(top, ex.q));
    }
    if (ex.type === 'sqrt') {
      const top = (ex.a === 1 ? '' : ex.a) + root('', ex.b);
      return sg(ex.sign) + (ex.q === 1 ? top : frac(top, ex.q));
    }
    return numHtml(Calc.formatNumber(x));
  }

  // ---------- Bildschirm ----------
  function draw() {
    const ind = [];
    if (S.shift) ind.push('<b class="i-s">S</b>');
    if (S.alpha) ind.push('<b class="i-a">A</b>');
    if (S.sto) ind.push('<b>STO</b>');
    if (S.vars.M) ind.push('<b>M</b>');
    ind.push(`<b class="i-ang">${S.angle}</b>`);
    if (S.fmt === 'eng' && S.mode === 'result') ind.push('<b>ENG</b>');
    if (S.histIdx >= 0) ind.push('<b>▲▼</b>');
    $('ind').innerHTML = ind.join('');

    const inEl = $('lineIn'), outEl = $('lineOut');
    if (S.mode === 'edit') {
      // Eingabe als Formel (Brüche übereinander); geht das nicht, als einfache Zeile
      let html = null;
      if (S.tokens.length) {
        try {
          const src = S.tokens.slice(0, S.cur).join('') + '‸' + S.tokens.slice(S.cur).join('');
          const tree = Calc.parse(src, { lenient: true, cursor: true });
          if (tree) html = render(tree);
        } catch (e) { html = null; }
      } else html = CUR;
      if (html !== null) {
        inEl.className = 'line-in pretty editing';
        inEl.innerHTML = html;
      } else {
        const parts = S.tokens.map((t) => `<span>${escapeHtml(tokStr(t))}</span>`);
        parts.splice(S.cur, 0, CUR);
        inEl.className = 'line-in linear';
        inEl.innerHTML = parts.join('');
      }
      outEl.className = 'line-out preview';
      outEl.style.fontSize = '';
      outEl.innerHTML = preview();
      lastShown = '';
      const c = inEl.querySelector('.cursor');
      if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (S.mode === 'result') {
      inEl.className = 'line-in pretty';
      let tree = null;
      try { tree = Calc.parse(S.result.tokens.join('')); } catch (e) { /* bleibt linear */ }
      inEl.innerHTML = tree ? render(tree) : escapeHtml(S.result.tokens.map(tokStr).join(''));
      inEl.scrollLeft = 0;
      outEl.className = 'line-out';
      outEl.innerHTML = `<span class="val">${exactHtml(S.result.value)}</span>`;
      fitText(outEl);
      revealResult(outEl, S.result.tokens.join('') + '|' + S.result.value + '|' + S.fmt + '|' + S.engK + '|' + S.histIdx);
    } else {
      inEl.className = 'line-in';
      inEl.innerHTML = `<div class="err"><strong>${S.err.title}</strong><span>${S.err.text}</span><small>[AC] : Abbrechen &nbsp; [◀][▶] : Gehe zu</small></div>`;
      outEl.innerHTML = '';
    }
    for (const el of document.querySelectorAll('.calc')) {
      el.classList.toggle('is-shift', S.shift);
      el.classList.toggle('is-alpha', S.alpha);
    }
  }

  // Ergebnis verkleinern, bis es in die Zeile passt
  function fitText(el) {
    el.style.fontSize = '';
    const v = el.querySelector('.val');
    if (!v) return;
    const avail = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft || 0) - parseFloat(getComputedStyle(el).paddingRight || 0);
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (v.getBoundingClientRect().width > avail && size > 20) {
      size *= 0.9;
      el.style.fontSize = size + 'px';
    }
  }

  function preview() {
    if (!S.tokens.length) return '';
    try {
      const src = S.tokens.join('');
      if (/Ran#|ranint\(/.test(src)) return '';
      const { value } = Calc.calculate(src, env());
      if (value === null) return '';
      return '= ' + numHtml(Calc.formatNumber(value));
    } catch (e) { return ''; }
  }

  function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }

  // ---------- Aktionen ----------
  function startEdit(fromResult) {
    if (S.mode === 'result' && fromResult) {
      S.tokens = S.result.tokens.slice();
    } else if (S.mode === 'error') {
      S.tokens = S.err.tokens.slice();
    }
    S.mode = 'edit';
    S.histIdx = -1;
  }

  function ins(t, opts) {
    opts = opts || {};
    if (S.mode !== 'edit') {
      const cont = S.mode === 'result' && CONTINUE.has(t) && !opts.fresh;
      S.mode = 'edit';
      S.histIdx = -1;
      S.tokens = cont ? ['Ans'] : [];
      S.cur = S.tokens.length;
    }
    const list = Array.isArray(t) ? t : [t];
    S.tokens.splice(S.cur, 0, ...list);
    S.cur += list.length;
    if (opts.hint) toast(opts.hint);
  }

  function del() {
    if (S.mode === 'result') { startEdit(true); S.cur = S.tokens.length; return; }
    if (S.mode === 'error') { startEdit(); S.cur = S.tokens.length; return; }
    if (S.cur > 0) { S.tokens.splice(S.cur - 1, 1); S.cur--; } else if (S.tokens.length) S.tokens.splice(0, 1);
  }

  function ac() {
    S.tokens = []; S.cur = 0; S.mode = 'edit'; S.sto = false; S.histIdx = -1; S.fmt = 'exact'; S.engK = null;
  }

  function equals(approx) {
    let tokens;
    if (S.mode === 'result') tokens = S.result.tokens;
    else if (S.mode === 'error') return;
    else tokens = S.tokens;
    if (!tokens.length) return;
    try {
      const { value } = Calc.calculate(tokens.join(''), env());
      if (value === null) return;
      S.preAns = S.ans;
      S.ans = value;
      S.result = { tokens: tokens.slice(), value };
      S.mode = 'result';
      S.fmt = approx ? 'dec' : 'exact';
      S.engK = null;
      S.histIdx = -1;
      const last = S.hist[S.hist.length - 1];
      if (!last || last.tokens.join('') !== S.result.tokens.join('') || last.value !== value) {
        S.hist.push({ tokens: tokens.slice(), value });
        if (S.hist.length > 60) S.hist.shift();
      }
      save();
    } catch (e) {
      const kind = e && e.kind === 'Math' ? 'Math' : 'Syntax';
      S.err = {
        tokens: tokens.slice(),
        title: kind === 'Math' ? 'Rechenfehler' : 'Syntaxfehler',
        text: kind === 'Math' ? 'Ergebnis nicht definiert oder zu groß' : 'Eingabe unvollständig oder ungültig',
      };
      S.mode = 'error';
      if (!(e instanceof Calc.CalcError)) console.error(e);
    }
  }

  function move(dir) {
    if (S.mode === 'result') { startEdit(true); S.cur = dir < 0 ? S.tokens.length : 0; return; }
    if (S.mode === 'error') { startEdit(); S.cur = S.tokens.length; return; }
    S.cur = Math.max(0, Math.min(S.tokens.length, S.cur + dir));
  }

  function replay(dir) {
    if (!S.hist.length) { toast('Noch keine Rechnungen'); return; }
    let i = S.histIdx < 0 ? (dir < 0 ? S.hist.length - 1 : -1) : S.histIdx + dir;
    if (S.histIdx < 0 && dir < 0 && S.mode === 'result') i = S.hist.length - 2;
    if (i < 0) i = 0;
    if (i >= S.hist.length) { S.histIdx = -1; ac(); return; }
    showHist(i);
  }
  function showHist(i) {
    const h = S.hist[i];
    S.histIdx = i;
    S.result = { tokens: h.tokens.slice(), value: h.value };
    S.mode = 'result';
    S.fmt = 'exact';
    S.engK = null;
  }

  function currentValue() {
    // Für STO/M+: offene Eingabe erst ausrechnen
    if (S.mode === 'edit' && S.tokens.length) {
      equals(false);
      if (S.mode !== 'result') return null;
    }
    return S.mode === 'result' ? S.result.value : S.ans;
  }

  function store(v) {
    S.sto = false;
    const val = currentValue();
    if (val === null) return;
    S.vars[v] = val;
    save();
    toast(`${val === S.result?.value ? 'Ergebnis' : 'Ans'} → ${v === 'X' ? 'x' : v}`);
  }

  function mplus(sign) {
    const val = currentValue();
    if (val === null) return;
    S.vars.M += sign * val;
    save();
    toast(`M ${sign > 0 ? '+' : '−'}= ${Calc.formatNumber(val).m}  →  M = ${Calc.formatNumber(S.vars.M).m}`);
  }

  function setFmt(f) {
    if (S.mode !== 'result') { toast('Erst mit [=] ausrechnen'); return; }
    const v = S.result.value;
    if (f === 'sd') {
      if (!Calc.exactForm(v)) { S.fmt = 'exact'; return; }
      S.fmt = S.fmt === 'dec' ? 'exact' : 'dec';
    } else if (f === 'mixed') {
      const ex = Calc.exactForm(v);
      if (!ex || ex.type !== 'frac') { toast('Kein Bruch'); return; }
      S.fmt = S.fmt === 'mixed' ? 'exact' : 'mixed';
    } else if (f === 'fact') {
      if (!Calc.primeFactors(Math.abs(v))) { toast('FACT nur für ganze Zahlen ≥ 2'); return; }
      S.fmt = S.fmt === 'fact' ? 'exact' : 'fact';
    }
    S.engK = null;
  }

  function eng(dir) {
    if (S.mode !== 'result') { toast('Erst mit [=] ausrechnen'); return; }
    const v = S.result.value;
    if (S.fmt !== 'eng') {
      S.fmt = 'eng';
      S.engK = v === 0 ? 0 : Math.floor(Math.floor(Math.log10(Math.abs(v))) / 3) * 3;
      if (dir > 0) S.engK += 3;
    } else S.engK += dir > 0 ? 3 : -3;
  }

  function cycleAngle() {
    S.angle = { D: 'R', R: 'G', G: 'D' }[S.angle];
    save();
    toast({ D: 'Gradmaß (Deg)', R: 'Bogenmaß (Rad)', G: 'Neugrad (Gon)' }[S.angle]);
  }

  const soon = (name) => () => toast(`${name} gibt es in dieser Version noch nicht`);

  function rnd() {
    if (S.mode !== 'result') { toast('Erst mit [=] ausrechnen'); return; }
    const v = Number(S.result.value.toPrecision(10));
    S.ans = v;
    S.result.value = v;
    save();
    toast('Ans auf Anzeigegenauigkeit gerundet');
  }

  // ---------- Tasten ----------
  // m = Hauptfunktion, s = SHIFT (gelb), a = ALPHA (rot), b = Basis-n-Beschriftung (blau, nur Deko)
  const T = (t, hint) => () => ins(t, { hint });
  const trig = (f, inv) => () => ins((inv ? 'a' : '') + f + '(');
  const V = (v) => ['', () => (S.sto ? store(v) : ins(v)), v];
  const SEP = () => (S.comma ? ';' : ',');
  const toggleShift = () => { S.shift = !S.shift; S.alpha = false; };
  const toggleAlpha = () => { S.alpha = !S.alpha; S.shift = false; };
  const toggleSto = () => { S.sto = !S.sto; if (S.sto) toast('STO: Variablentaste drücken (A–F, x, Y, M)'); };
  const MIXED = '▪' + frac('▪', '▫');

  const FN_KEYS = [
    { id: 'shift', cls: 'ctl k-shift', m: ['SHIFT', toggleShift] },
    { id: 'alpha', cls: 'ctl k-alpha', m: ['ALPHA', toggleAlpha] },
    { id: 'pad', pad: true },
    { id: 'menu', cls: 'ctl', m: ['MENU', () => openMenu()], s: ['SETUP', () => openMenu()] },
    { id: 'on', cls: 'ctl k-on', m: ['ON', () => ac()] },

    { id: 'optn', cls: 'ctl', m: ['OPTN', () => openOptn()], s: ['QR', soon('QR-Code')] },
    { id: 'calc', cls: 'ctl', m: ['CALC', soon('CALC')], s: ['SOLVE', soon('SOLVE')], a: ['=', soon('Gleichungen (=)')] },
    { id: 'integ', cls: 'ctl', m: ['∫▫', () => ins('integ(', { hint: `∫( f(x) ${SEP()} a ${SEP()} b )` })], s: ['d/dx▪', () => ins('deriv(', { hint: `d/dx( f(x) ${SEP()} x-Stelle )` })], a: [':', soon('Mehrfachbefehle (:)')] },
    { id: 'x', cls: 'ctl', m: ['<i>x</i>', T('X')], s: ['Σ▫', () => ins('sum(', { hint: `Σ( f(x) ${SEP()} von ${SEP()} bis )` })], a: ['Π▫', () => ins('prod(', { hint: `Π( f(x) ${SEP()} von ${SEP()} bis )` })] },

    { id: 'frac', m: [frac('▪', '▫'), T('⁄')], s: [MIXED, soon('Gemischte Brüche bei der Eingabe')], a: ['÷R', soon('Division mit Rest')] },
    { id: 'sqrt', m: ['√▫', T('sqrt(')], s: ['∛▫', T('cbrt(')] },
    { id: 'sq', m: ['<i>x</i>²', T('²')], s: ['<i>x</i>³', T('³')], b: 'DEC' },
    { id: 'pow', m: ['<i>x</i><sup>▫</sup>', T('^(')], s: ['<sup>▫</sup>√▫', () => ins('root(', { hint: `ˣ√( n ${SEP()} Zahl )` })], b: 'HEX' },
    { id: 'logb', m: ['log<sub>▪</sub>▫', () => ins('logb(', { hint: `log( Basis ${SEP()} Zahl )` })], s: ['10<sup>▫</sup>', T(['⑩', '^('])], b: 'BIN' },
    { id: 'ln', m: ['ln', T('ln(')], s: ['e<sup>▫</sup>', T(['ℯ', '^('])], b: 'OCT' },

    { id: 'neg', m: ['(−)', () => ins('-', { fresh: true })], s: ['log', T('log(')], a: V('A') },
    { id: 'dms', m: ['°′″', soon('Grad-Minuten-Sekunden')], s: ['FACT', () => setFmt('fact')], a: V('B') },
    { id: 'inv', m: ['<i>x</i><sup>−1</sup>', T('⁻¹')], s: ['<i>x</i>!', T('!')], a: V('C') },
    { id: 'sin', m: ['sin', trig('sin')], s: ['sin<sup>−1</sup>', trig('sin', true)], a: V('D') },
    { id: 'cos', m: ['cos', trig('cos')], s: ['cos<sup>−1</sup>', trig('cos', true)], a: V('E') },
    { id: 'tan', m: ['tan', trig('tan')], s: ['tan<sup>−1</sup>', trig('tan', true)], a: V('F') },

    { id: 'sto', m: ['STO', toggleSto], s: ['RECALL', () => openVars()] },
    { id: 'eng', m: ['ENG', () => eng(-1)], s: ['∠', soon('Polarform ∠')], a: ['<i>i</i>', soon('Komplexe Zahlen')] },
    { id: 'lp', m: ['(', T('(')], s: ['Abs', T('abs(')] },
    { id: 'rp', m: [')', T(')')], s: [';', T(',')], a: ['<i>x</i>', () => (S.sto ? store('X') : ins('X'))] },
    { id: 'sd', m: ['S⇔D', () => setFmt('sd')], s: ['a<sup>b</sup>/<sub>c</sub>⇔<sup>d</sup>/<sub>c</sub>', () => setFmt('mixed')], a: V('Y') },
    { id: 'mp', m: ['M+', () => mplus(1)], s: ['M−', () => mplus(-1)], a: V('M') },
  ];

  const NUM_KEYS = [
    { id: 'n7', cls: 'num', m: ['7', T('7')], s: ['CONST', soon('CONST (Naturkonstanten)')] },
    { id: 'n8', cls: 'num', m: ['8', T('8')], s: ['CONV', soon('CONV (Einheiten)')] },
    { id: 'n9', cls: 'num', m: ['9', T('9')], s: ['RESET', () => resetAll()] },
    { id: 'del', cls: 'num k-del', m: ['DEL', () => del()], s: ['INS', soon('INS')], a: ['UNDO', () => undo()] },
    { id: 'ac', cls: 'num k-ac', m: ['AC', () => ac()], s: ['OFF', () => { ac(); toast('Aus gibt es hier nicht – einfach App schließen'); }] },

    { id: 'n4', cls: 'num', m: ['4', T('4')] },
    { id: 'n5', cls: 'num', m: ['5', T('5')] },
    { id: 'n6', cls: 'num', m: ['6', T('6')] },
    { id: 'mul', cls: 'num k-op', m: ['×', T('×')], s: ['nPr', T('ℙ')], a: ['GCD', () => ins('gcd(', { hint: `GCD( a ${SEP()} b )` })] },
    { id: 'div', cls: 'num k-op', m: ['÷', T('÷')], s: ['nCr', T('ℂ')], a: ['LCM', () => ins('lcm(', { hint: `LCM( a ${SEP()} b )` })] },

    { id: 'n1', cls: 'num', m: ['1', T('1')] },
    { id: 'n2', cls: 'num', m: ['2', T('2')] },
    { id: 'n3', cls: 'num', m: ['3', T('3')] },
    { id: 'add', cls: 'num k-op', m: ['+', T('+')], s: ['Pol', soon('Pol')], a: ['Int', T('int(')] },
    { id: 'sub', cls: 'num k-op', m: ['−', T('-')], s: ['Rec', soon('Rec')], a: ['Intg', T('intg(')] },

    { id: 'n0', cls: 'num', m: ['0', T('0')], s: ['Rnd', () => rnd()], a: ['RndFix', soon('RndFix')] },
    { id: 'dot', cls: 'num', m: ['.', T('.')], s: ['Ran#', T('Ran#')], a: ['RanInt', () => ins('ranint(', { hint: `RanInt( von ${SEP()} bis )` })] },
    { id: 'exp', cls: 'num', m: ['×10<sup><i>x</i></sup>', T('ᴇ')], s: ['π', T('π')], a: ['e', T('ℯ')] },
    { id: 'ans', cls: 'num', m: ['Ans', T('Ans')], s: ['%', T('%')] },
    { id: 'eq', cls: 'num k-eq', m: ['=', () => equals(false)], s: ['≈', () => equals(true)] },
  ];


  function numToTokens(x) {
    const s = String(x).replace('e+', 'e').split('e');
    const out = [];
    if (s[0].startsWith('-')) { out.push('-'); s[0] = s[0].slice(1); }
    out.push(...s[0].split(''));
    if (s[1] !== undefined) { out.push('ᴇ'); out.push(...s[1].split('')); }
    return out;
  }

  const ALL = {};
  function buildPad(el, keys) {
    for (const k of keys) {
      ALL[k.id] = k;
      if (k.pad) { el.appendChild(buildDpad()); continue; }
      const cell = document.createElement('div');
      cell.className = 'cell';
      const top = document.createElement('div');
      top.className = 'lbl';
      top.innerHTML = boxes(`<span class="ls">${k.s ? k.s[0] : ''}</span>${k.b ? `<span class="lb">${k.b}</span>` : ''}<span class="la">${k.a ? (k.a[0] || k.a[2]) : ''}</span>`);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key ' + (k.cls || 'fn');
      b.innerHTML = `<span>${k.id === 'dot' ? (S.comma ? ',' : '.') : boxes(k.m[0])}</span>`;
      b.setAttribute('aria-label', stripTags(k.m[0]));
      b.addEventListener('click', () => press(k.id));
      cell.append(top, b);
      el.appendChild(cell);
    }
  }
  // ▪ = gefülltes, ▫ = leeres Eingabekästchen, als gezeichnete Box statt Unicode-Zeichen
  function boxes(h) {
    return h.replace(/▪/g, '<span class="bx f"></span>').replace(/▫/g, '<span class="bx"></span>');
  }
  function stripTags(h) { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; }

  function buildDpad() {
    const w = document.createElement('div');
    w.className = 'dpad';
    w.innerHTML = `
      <button type="button" class="dp up" aria-label="Hoch (Verlauf zurück)"></button>
      <button type="button" class="dp left" aria-label="Cursor links"></button>
      <button type="button" class="dp right" aria-label="Cursor rechts"></button>
      <button type="button" class="dp down" aria-label="Runter (Verlauf vor)"></button>
      <span class="dp-mid"></span>`;
    const map = { up: () => replay(-1), down: () => replay(1), left: () => move(-1), right: () => move(1) };
    for (const [cls, fn] of Object.entries(map)) {
      w.querySelector('.' + cls).addEventListener('click', () => { buzz(); S.shift = S.alpha = false; fn(); draw(); });
    }
    return w;
  }

  const undoStack = [];
  function snapshot() {
    const snap = JSON.stringify({ tokens: S.tokens, cur: S.cur, mode: S.mode, result: S.result, err: S.err, fmt: S.fmt });
    if (undoStack[undoStack.length - 1] !== snap) undoStack.push(snap);
    if (undoStack.length > 60) undoStack.shift();
  }
  function undo() {
    const snap = undoStack.pop();
    if (!snap) { toast('Nichts rückgängig zu machen'); return; }
    Object.assign(S, JSON.parse(snap));
    S.histIdx = -1;
  }

  function press(id) {
    const k = ALL[id];
    if (!k) return;
    buzz();
    if (!(S.alpha && id === 'del') && !['shift', 'alpha'].includes(id)) snapshot();
    let act;
    if (S.sto && k.a && k.a[2]) act = k.a; // STO + Variablentaste, ohne ALPHA
    else if (S.sto && id === 'rp') act = k.a;
    else if (S.shift && k.s) act = k.s;
    else if (S.alpha && k.a) act = k.a;
    else act = k.m;
    const wasModifier = id === 'shift' || id === 'alpha';
    if (!wasModifier) { S.shift = false; S.alpha = false; }
    if (S.sto && id !== 'sto' && !(act === k.a)) S.sto = false;
    act[1]();
    draw();
  }

  function buildPads() {
    for (const k in ALL) delete ALL[k];
    $('padFn').innerHTML = '';
    $('padNum').innerHTML = '';
    buildPad($('padFn'), FN_KEYS);
    buildPad($('padNum'), NUM_KEYS);
  }

  function buzz() { if (S.vib && navigator.vibrate) navigator.vibrate(8); }

  // ---------- Animationen ----------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animated = () => !reduceMotion.matches && S.motion !== 'aus' && document.documentElement.dataset.style !== 'klassik';

  // Licht unter dem Finger + Welle beim Antippen, federndes Zurückschnellen beim Loslassen
  function pressFx(el, e) {
    if (!animated()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX ?? r.left + r.width / 2) - r.left, y = (e.clientY ?? r.top + r.height / 2) - r.top;
    el.style.setProperty('--px', x + 'px');
    el.style.setProperty('--py', y + 'px');
    el.classList.add('pressed');
    const w = document.createElement('span');
    w.className = 'wave';
    const d = Math.max(r.width, r.height) * 2.2;
    Object.assign(w.style, { width: d + 'px', height: d + 'px', left: x - d / 2 + 'px', top: y - d / 2 + 'px' });
    el.appendChild(w);
    w.addEventListener('animationend', () => w.remove());
  }
  function releaseFx(el) {
    if (!el.classList.contains('pressed')) return;
    el.classList.remove('pressed');
    if (!animated()) return;
    el.animate([
      { transform: 'scale(.95)' },
      { transform: 'scale(1.025)', offset: .45 },
      { transform: 'scale(1)' },
    ], { duration: 380, easing: 'cubic-bezier(.25,.8,.3,1)' });
  }
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.key, .dp, .top-btn');
    if (el) pressFx(el, e);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    document.addEventListener(ev, () => document.querySelectorAll('.pressed').forEach(releaseFx), true);
  }

  // Ergebnis weich einblenden
  let lastShown = '';
  function revealResult(el, key) {
    if (key === lastShown) return;
    lastShown = key;
    if (!animated() || !key) return;
    el.animate([
      { opacity: 0, filter: 'blur(6px)', transform: 'translateY(6px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'none' },
    ], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  // ---------- Physische Tastatur ----------
  window.addEventListener('keydown', (e) => {
    if (!$('sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const simple = { '*': '×', '/': '÷', '-': '-', '+': '+', '^': '^(', '(': '(', ')': ')', '!': '!', '%': '%', ',': S.comma ? '.' : ',', ';': ',', '.': '.', p: 'π', e: 'ℯ', x: 'X', E: 'ᴇ' };
    let handled = true;
    if (/^[0-9]$/.test(k)) ins(k);
    else if (k in simple) ins(simple[k], k === '-' ? {} : {});
    else if (k === 'Enter' || k === '=') equals(false);
    else if (k === 'Backspace') del();
    else if (k === 'Escape' || k === 'Delete') ac();
    else if (k === 'ArrowLeft') move(-1);
    else if (k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp') replay(-1);
    else if (k === 'ArrowDown') replay(1);
    else handled = false;
    if (handled) { e.preventDefault(); S.shift = S.alpha = false; draw(); }
  });

  // ---------- Panels ----------
  function openSheet(title, html) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = html;
    $('sheet').hidden = false;
    $('sheetBack').hidden = false;
    requestAnimationFrame(() => { $('sheet').classList.add('open'); $('sheetBack').classList.add('open'); });
  }
  function closeSheet() {
    $('sheet').classList.remove('open');
    $('sheetBack').classList.remove('open');
    setTimeout(() => { $('sheet').hidden = true; $('sheetBack').hidden = true; }, 180);
  }
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetBack').addEventListener('click', closeSheet);

  const THEMES = [
    ['glas', 'Glas', '#0b0f1a', 'rgba(255,255,255,.12)'],
    ['glas-hell', 'Glas hell', '#f2f2f4', 'rgba(255,255,255,.9)'],
    ['modern', 'Modern', '#0f1116', '#6f7dff'],
    ['modern-hell', 'Modern hell', '#f3f4f7', '#5060f0'],
    ['klassik', 'Klassik', '#1b2130', '#c5cfbf'],
    ['nacht', 'Nacht', '#050608', '#10161a'],
    ['kreide', 'Kreide', '#eceae4', '#d4dccd'],
    ['petrol', 'Petrol', '#0f3b45', '#bfd4cc'],
    ['bordeaux', 'Bordeaux', '#3c1420', '#d8cbbf'],
    ['violett', 'Violett', '#2a1f4a', '#cfcbe0'],
  ];

  function openMenu() {
    const ang = [['D', 'Gradmaß'], ['R', 'Bogenmaß'], ['G', 'Gon']];
    openSheet('Einstellungen', `
      <div class="seg"><button id="optHist">Verlauf anzeigen</button></div>
      <h3>Winkeleinheit</h3>
      <div class="seg">${ang.map(([v, l]) => `<button data-ang="${v}" class="${S.angle === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <h3>Aussehen</h3>
      <div class="themes">${THEMES.map(([id, l, body, scr]) => `
        <button data-theme="${id}" class="${S.theme === id ? 'on' : ''}">
          <span class="sw" style="background:${body}"><i style="background:${scr}"></i></span>${l}</button>`).join('')}
      </div>
      <h3>Animationen</h3>
      <div class="seg">${[['lebendig', 'Lebendig'], ['dezent', 'Dezent'], ['aus', 'Aus (Akku sparen)']].map(([v, l]) => `<button data-mot="${v}" class="${S.motion === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p class="hint">Lebendig: Hintergrund bewegt sich langsam. Dezent: Hintergrund steht, Tasten federn. Aus: keine Animationen.</p>
      <h3>Bedienung</h3>
      <label class="row"><input type="checkbox" id="optVib" ${S.vib ? 'checked' : ''}> Vibration beim Tastendruck</label>
      <label class="row"><input type="checkbox" id="optComma" ${S.comma ? 'checked' : ''}> Komma als Dezimaltrennzeichen</label>
      <h3>Speicher</h3>
      <div class="seg"><button id="optReset" class="danger">Alles zurücksetzen</button></div>
      <p class="hint">Rechenwerk läuft komplett offline. Keine Werbung, keine Konten, keine Daten verlassen das Gerät.</p>`);
    const body = $('sheetBody');
    body.querySelectorAll('[data-ang]').forEach((b) => b.addEventListener('click', () => {
      S.angle = b.dataset.ang; save(); draw(); openMenu();
    }));
    body.querySelectorAll('[data-mot]').forEach((b) => b.addEventListener('click', () => {
      S.motion = b.dataset.mot; applyTheme(); save(); openMenu();
    }));
    body.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
      S.theme = b.dataset.theme; applyTheme(); save(); openMenu();
    }));
    $('optHist').addEventListener('click', () => { closeSheet(); setTimeout(openHist, 200); });
    $('optVib').addEventListener('change', (e) => { S.vib = e.target.checked; save(); });
    $('optComma').addEventListener('change', (e) => { S.comma = e.target.checked; save(); buildPads(); draw(); });
    $('optReset').addEventListener('click', () => { closeSheet(); resetAll(); });
  }

  function openOptn() {
    const items = [
      ['Hyperbelfunktionen', [['sinh', 'sinh('], ['cosh', 'cosh('], ['tanh', 'tanh('], ['sinh⁻¹', 'asinh('], ['cosh⁻¹', 'acosh('], ['tanh⁻¹', 'atanh(']]],
      ['Weitere', [['Abs', 'abs('], ['logₐb', 'logb('], ['d/dx', 'deriv('], ['∫', 'integ('], ['Σ', 'sum('], ['Π', 'prod('], ['GCD', 'gcd('], ['LCM', 'lcm('], ['Int', 'int('], ['Intg', 'intg('], ['RanInt', 'ranint(']]],
    ];
    openSheet('OPTN', items.map(([h, list]) => `<h3>${h}</h3><div class="grid3">${list.map(([l, t]) => `<button data-t="${t}">${l}</button>`).join('')}</div>`).join(''));
    $('sheetBody').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      ins(b.dataset.t); closeSheet(); draw();
    }));
  }

  function openVars() {
    openSheet('Variablen (RCL)', `<div class="vars">${VARNAMES.map((v) => `
      <button data-v="${v}"><b>${v === 'X' ? '<i>x</i>' : v}</b><span>${Calc.formatNumber(S.vars[v]).m}${Calc.formatNumber(S.vars[v]).e !== undefined ? 'ᴇ' + Calc.formatNumber(S.vars[v]).e : ''}</span></button>`).join('')}
      </div><p class="hint">Antippen fügt die Variable ein. Speichern: Ergebnis berechnen, dann [STO] und Variablentaste.</p>`);
    $('sheetBody').querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      ins(b.dataset.v); closeSheet(); draw();
    }));
  }

  function openHist() {
    if (!S.hist.length) { openSheet('Verlauf', '<p class="hint">Noch keine Rechnungen.</p>'); return; }
    const rows = S.hist.map((h, i) => {
      let expr;
      try { expr = render(Calc.parse(h.tokens.join(''))); } catch (e) { expr = escapeHtml(h.tokens.map(tokStr).join('')); }
      return `<button class="hrow" data-i="${i}"><span class="he">${expr}</span><span class="hv">= ${numHtml(Calc.formatNumber(h.value))}</span></button>`;
    }).reverse().join('');
    openSheet('Verlauf', `<div class="hist">${rows}</div><div class="seg"><button id="histClear" class="danger">Verlauf löschen</button></div>`);
    $('sheetBody').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      showHist(Number(b.dataset.i)); closeSheet(); draw();
    }));
    $('histClear').addEventListener('click', () => { S.hist = []; S.histIdx = -1; save(); closeSheet(); draw(); });
  }

  function resetAll() {
    if (!confirm('Variablen, Verlauf und Ans zurücksetzen?')) return;
    for (const v of VARNAMES) S.vars[v] = 0;
    S.ans = S.preAns = 0; S.hist = [];
    ac(); save(); draw();
    toast('Zurückgesetzt');
  }

  function applyTheme() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.motion = S.motion;
    document.documentElement.dataset.style = S.theme.startsWith('glas') ? 'glass' : S.theme.startsWith('modern') ? 'modern' : 'klassik';
    const t = THEMES.find((x) => x[0] === S.theme) || THEMES[0];
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t[2]);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Start ----------
  load();
  applyTheme();
  buildPads();
  draw();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
