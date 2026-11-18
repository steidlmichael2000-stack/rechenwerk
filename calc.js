/* Rechenwerk – Rechenkern
 * Zerlegt die interne Eingabe in Tokens, baut einen Syntaxbaum,
 * rechnet ihn aus und sucht für das Ergebnis eine exakte Darstellung
 * (Bruch, Vielfaches von π, Wurzelausdruck).
 *
 * Interne Zeichen:
 *   ⁄  Bruchstrich (bindet stärker als × und ÷)
 *   ᴇ  ×10^ innerhalb einer Zahl (1ᴇ-5)
 *   ℙ ℂ  nPr / nCr
 *   ⑩  die Zahl 10 als eigenes Token (für die 10ˣ-Taste)
 *   ℯ  Eulersche Zahl
 */
(function (global) {
  'use strict';

  class CalcError extends Error {
    constructor(kind, msg) { super(msg || kind); this.kind = kind; }
  }
  const syntax = (m) => new CalcError('Syntax', m);
  const math = (m) => new CalcError('Math', m);

  const NAMES = [
    'deriv(', 'integ(', 'ranint(', 'prod(', 'intg(', 'gcd(', 'lcm(', 'int(', 'sum(', 'asinh(', 'acosh(', 'atanh(',
    'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(',
    'sqrt(', 'cbrt(', 'root(', 'logb(',
    'abs(', 'sin(', 'cos(', 'tan(', 'log(', 'Ran#',
    'ln(', 'Ans',
  ];
  const VARS = 'ABCDEFXYM';
  const POSTFIX = ['⁻¹', '²', '³', '!', '%'];

  // ---------- Lexer ----------
  // Mit opts.cursor markiert das Zeichen ‸ die Cursorposition: das folgende Token bekommt
  // cur = true, innerhalb einer Zahl wird curAt (Stelle in der Zahl) gesetzt,
  // am Ende steht tokens.cursorAtEnd.
  const CURSOR = '‸';
  function lex(src, opts) {
    const withCursor = !!(opts && opts.cursor);
    const out = [];
    let pending = false;
    const push = (tok) => { if (pending) { tok.cur = true; pending = false; } out.push(tok); };
    const isDigit = (ch) => ch !== undefined && /[0-9.]/.test(ch);
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ') { i++; continue; }
      if (withCursor && c === CURSOR) { pending = true; i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i, raw = '', curAt;
        while (j < src.length) {
          if (isDigit(src[j])) { raw += src[j]; j++; continue; }
          if (withCursor && src[j] === CURSOR && raw && isDigit(src[j + 1])) { curAt = raw.length; j++; continue; }
          break;
        }
        if ((raw.match(/\./g) || []).length > 1 || raw === '.') throw syntax('Zahl');
        if (src[j] === 'ᴇ') {
          let k = j + 1;
          if (src[k] === '-' || src[k] === '+') k++;
          const s = k;
          while (k < src.length && /[0-9]/.test(src[k])) k++;
          if (k === s) throw syntax('Exponent');
          raw += 'e' + src.slice(j + 1, k);
          j = k;
        }
        push({ type: 'num', v: raw, curAt, pos: i });
        i = j;
        continue;
      }
      if (c === 'ᴇ') { // ᴇ ohne Mantisse: 1ᴇ…
        let k = i + 1;
        if (src[k] === '-' || src[k] === '+') k++;
        const s = k;
        while (k < src.length && /[0-9]/.test(src[k])) k++;
        if (k === s) throw syntax('Exponent');
        push({ type: 'num', v: '1e' + src.slice(i + 1, k), pos: i });
        i = k;
        continue;
      }
      if (c === '⑩') { push({ type: 'num', v: '10', ten: true, pos: i }); i++; continue; }
      const name = NAMES.find((n) => src.startsWith(n, i));
      if (name) {
        if (name.endsWith('(')) push({ type: 'func', v: name.slice(0, -1), pos: i });
        else if (name === 'Ans') push({ type: 'ans', pos: i });
        else push({ type: 'rand', pos: i });
        i += name.length;
        continue;
      }
      const pf = POSTFIX.find((p) => src.startsWith(p, i));
      if (pf) { push({ type: 'post', v: pf, pos: i }); i += pf.length; continue; }
      if (c === 'π' || c === 'ℯ') { push({ type: 'const', v: c, pos: i }); i++; continue; }
      if (VARS.includes(c)) { push({ type: 'var', v: c, pos: i }); i++; continue; }
      if ('+-×÷^⁄ℙℂ'.includes(c)) { push({ type: 'op', v: c, pos: i }); i++; continue; }
      if (c === '(' || c === ')' || c === ',') { push({ type: c, pos: i }); i++; continue; }
      throw syntax('Zeichen ' + c);
    }
    out.cursorAtEnd = pending;
    return out;
  }

  // ---------- Parser ----------
  // add  := mul (('+'|'-') mul)*
  // mul  := perm (('×'|'÷') perm)*
  // perm := term (('ℙ'|'ℂ') term)*
  // term := frac (frac)*            implizite Multiplikation, bindet stärker als ÷
  // frac := unary ('⁄' unary)*
  // unary:= ('-'|'+') unary | pow
  // pow  := post ('^' unary)?
  // post := prim (POSTFIX)*
  //
  // opts.lenient: unvollständige Eingaben (für die Anzeige beim Tippen) – fehlende Operanden
  // werden zu {k:'empty'} (Platzhalter-Kästchen) statt eines Syntaxfehlers.
  // Cursor-Markierungen landen als cur / closeCur / sepCur / curAt an den Knoten.
  function parse(src, opts) {
    opts = opts || {};
    const t = lex(src, opts);
    let atEnd = !!t.cursorAtEnd;
    let p = 0;
    const peek = () => t[p];
    const next = () => t[p++];
    const isOp = (v) => peek() && peek().type === 'op' && peek().v === v;
    const startsPrimary = (tk) => tk && ['num', 'const', 'var', 'func', '(', 'ans', 'rand'].includes(tk.type);

    function binary(sub, ops) {
      let a = sub();
      while (ops.some(isOp)) {
        const tk = next();
        a = { k: 'bin', op: tk.v, a, b: sub(), cur: tk.cur };
      }
      return a;
    }
    const add = () => binary(mul, ['+', '-']);
    const mul = () => binary(perm, ['×', '÷']);
    const perm = () => binary(term, ['ℙ', 'ℂ']);
    function term() {
      let a = frac();
      while (startsPrimary(peek())) a = { k: 'bin', op: 'imp', a, b: frac() };
      return a;
    }
    const frac = () => binary(unary, ['⁄']);
    function unary() {
      if (isOp('-')) { const tk = next(); return { k: 'neg', a: unary(), cur: tk.cur }; }
      if (isOp('+')) { next(); return unary(); }
      return pow();
    }
    function pow() {
      const a = post();
      if (isOp('^')) { const tk = next(); return { k: 'bin', op: '^', a, b: unary(), cur: tk.cur }; }
      return a;
    }
    function post() {
      let a = prim();
      while (peek() && peek().type === 'post') { const tk = next(); a = { k: 'post', op: tk.v, a, cur: tk.cur }; }
      return a;
    }
    function closeParen(node) {
      // fehlende schließende Klammern am Ende werden ergänzt
      if (!peek()) {
        if (atEnd) { node.closeCur = true; atEnd = false; }
        return false;
      }
      if (peek().type !== ')') throw syntax('Klammer');
      if (next().cur) node.closeCur = true;
      return true;
    }
    function empty() {
      const n = { k: 'empty' };
      const tk = peek();
      if (!tk && atEnd) { n.cur = true; atEnd = false; }
      else if (tk && tk.cur) { n.cur = true; tk.cur = false; } // Cursor ins Kästchen statt davor
      return n;
    }
    function prim() {
      const tk = peek();
      if (!tk) {
        if (opts.lenient) return empty();
        throw syntax('Ende');
      }
      if (opts.lenient && (tk.type === ')' || tk.type === ',' || tk.type === 'post' || tk.type === 'op')) return empty();
      next();
      switch (tk.type) {
        case 'num': {
          const v = Number(tk.v);
          if (!isFinite(v)) throw math('Überlauf');
          return { k: 'num', v, raw: tk.v, ten: !!tk.ten, cur: tk.cur, curAt: tk.curAt };
        }
        case 'const': return { k: 'const', v: tk.v, cur: tk.cur };
        case 'var': return { k: 'var', v: tk.v, cur: tk.cur };
        case 'ans': return { k: 'ans', cur: tk.cur };
        case 'rand': return { k: 'rand', cur: tk.cur };
        case '(': {
          const node = { k: 'paren', cur: tk.cur };
          node.a = add();
          node.closed = closeParen(node);
          return node;
        }
        case 'func': {
          const node = { k: 'func', f: tk.v, cur: tk.cur, sepCur: [] };
          node.args = [add()];
          while (peek() && peek().type === ',') {
            if (next().cur) node.sepCur[node.args.length - 1] = true;
            node.args.push(add());
          }
          node.closed = closeParen(node);
          return node;
        }
        default: throw syntax('unerwartet');
      }
    }

    if (!t.length) return null;
    const tree = add();
    if (p < t.length) throw syntax('Rest');
    if (atEnd) {
      // Cursor am Ende gehört ins rechteste Feld (Nenner, Exponent …), nicht hinter die Formel
      let n = tree;
      while (n.k === 'bin' || n.k === 'neg') n = n.k === 'bin' ? n.b : n.a;
      n.curAfter = true;
    }
    return tree;
  }

  // ---------- Auswertung ----------
  const FACT = [1];
  for (let i = 1; i <= 170; i++) FACT[i] = FACT[i - 1] * i;

  function isInt(x) { return Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9 && Math.abs(x) < 1e15; }

  function toRad(x, angle) { return angle === 'R' ? x : angle === 'G' ? (x * Math.PI) / 200 : (x * Math.PI) / 180; }
  function fromRad(x, angle) { return angle === 'R' ? x : angle === 'G' ? (x * 200) / Math.PI : (x * 180) / Math.PI; }

  // exakte Werte für Vielfache von 90° (bzw. 100 gon, π/2) – vermeidet 1.2e-16 statt 0
  function quarter(x, angle) {
    const q = angle === 'R' ? x / (Math.PI / 2) : angle === 'G' ? x / 100 : x / 90;
    const r = Math.round(q);
    if (Math.abs(q - r) < 1e-12) return ((r % 4) + 4) % 4;
    return -1;
  }

  function realPow(a, b) {
    if (a < 0 && !Number.isInteger(b)) {
      // (-8)^(1/3) = -2: Exponent als Bruch mit ungeradem Nenner
      const fr = toFraction(b, 99);
      if (fr && fr.q % 2 === 1) {
        const v = Math.pow(-a, b);
        return fr.p % 2 === 0 ? v : -v;
      }
      throw math('negative Basis');
    }
    if (a === 0 && b < 0) throw math('Division durch 0');
    return Math.pow(a, b);
  }

  function evaluate(node, env) {
    const ang = env.angle || 'D';
    const ev = (n) => evaluate(n, env);
    switch (node.k) {
      case 'num': return node.v;
      case 'const': return node.v === 'π' ? Math.PI : Math.E;
      case 'var': return env.vars[node.v] || 0;
      case 'ans': return env.ans || 0;
      case 'rand': return Math.round(Math.random() * 1000) / 1000;
      case 'paren': return ev(node.a);
      case 'empty': throw syntax('Platzhalter leer');
      case 'neg': return -ev(node.a);
      case 'post': {
        const a = ev(node.a);
        switch (node.op) {
          case '²': return a * a;
          case '³': return a * a * a;
          case '⁻¹': if (a === 0) throw math('Division durch 0'); return 1 / a;
          case '%': return a / 100;
          case '!':
            if (!isInt(a) || a < 0 || a > 170) throw math('Fakultät');
            return FACT[Math.round(a)];
        }
        break;
      }
      case 'bin': {
        const a = ev(node.a), b = ev(node.b);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '×': case 'imp': return a * b;
          case '÷': case '⁄': if (b === 0) throw math('Division durch 0'); return a / b;
          case '^': return realPow(a, b);
          case 'ℙ': case 'ℂ': {
            if (!isInt(a) || !isInt(b) || a < 0 || b < 0 || b > a) throw math('nPr/nCr');
            const n = Math.round(a), r = Math.round(b);
            let v = 1;
            for (let i = 0; i < r; i++) v *= n - i;
            if (node.op === 'ℂ') { let f = 1; for (let i = 2; i <= r; i++) f *= i; v = Math.round(v / f); }
            return v;
          }
        }
        break;
      }
      case 'func': {
        if (['integ', 'deriv', 'sum', 'prod'].includes(node.f)) return analysis(node, env);
        const x = node.args.map(ev);
        const need = (n) => { if (x.length !== n) throw syntax('Argumente'); };
        const [a, b] = x;
        switch (node.f) {
          case 'sin': { need(1); const q = quarter(a, ang); if (q >= 0) return [0, 1, 0, -1][q]; return Math.sin(toRad(a, ang)); }
          case 'cos': { need(1); const q = quarter(a, ang); if (q >= 0) return [1, 0, -1, 0][q]; return Math.cos(toRad(a, ang)); }
          case 'tan': {
            need(1);
            const q = quarter(a, ang);
            if (q === 1 || q === 3) throw math('tan(90°)');
            if (q === 0 || q === 2) return 0;
            return Math.tan(toRad(a, ang));
          }
          case 'asin': need(1); if (a < -1 || a > 1) throw math('asin'); return fromRad(Math.asin(a), ang);
          case 'acos': need(1); if (a < -1 || a > 1) throw math('acos'); return fromRad(Math.acos(a), ang);
          case 'atan': need(1); return fromRad(Math.atan(a), ang);
          case 'sinh': need(1); return Math.sinh(a);
          case 'cosh': need(1); return Math.cosh(a);
          case 'tanh': need(1); return Math.tanh(a);
          case 'asinh': need(1); return Math.asinh(a);
          case 'acosh': need(1); if (a < 1) throw math('acosh'); return Math.acosh(a);
          case 'atanh': need(1); if (a <= -1 || a >= 1) throw math('atanh'); return Math.atanh(a);
          case 'ln': need(1); if (a <= 0) throw math('ln'); return Math.log(a);
          case 'log': {
            if (x.length === 2) { // log(b,x) wie logₐb
              if (a <= 0 || a === 1 || b <= 0) throw math('log'); return Math.log(b) / Math.log(a);
            }
            need(1); if (a <= 0) throw math('log');
            const r = Math.log10(a);
            return isInt(r) ? Math.round(r) : r;
          }
          case 'logb': {
            need(2); if (a <= 0 || a === 1 || b <= 0) throw math('log');
            const r = Math.log(b) / Math.log(a);
            return Math.abs(r - Math.round(r)) < 1e-13 ? Math.round(r) : r;
          }
          case 'sqrt': need(1); if (a < 0) throw math('Wurzel'); return Math.sqrt(a);
          case 'cbrt': need(1); return Math.cbrt(a);
          case 'root': {
            need(2);
            if (a === 0) throw math('0. Wurzel');
            if (b < 0) {
              if (isInt(a) && Math.round(a) % 2 !== 0) return -Math.pow(-b, 1 / a);
              throw math('Wurzel');
            }
            const r = Math.pow(b, 1 / a);
            return Math.abs(r - Math.round(r)) < 1e-12 * Math.max(1, Math.abs(r)) ? Math.round(r) : r;
          }
          case 'abs': need(1); return Math.abs(a);
          case 'int': need(1); return Math.trunc(a);
          case 'intg': need(1); return Math.floor(a);
          case 'gcd': case 'lcm': {
            need(2);
            if (!isInt(a) || !isInt(b)) throw math('GCD/LCM nur ganzzahlig');
            const g = gcd(Math.round(a), Math.round(b));
            if (node.f === 'gcd') return g;
            return g === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / g;
          }
          case 'ranint': {
            need(2);
            if (!isInt(a) || !isInt(b) || a > b) throw math('RanInt');
            return Math.round(a) + Math.floor(Math.random() * (Math.round(b) - Math.round(a) + 1));
          }
        }
        throw syntax('Funktion');
      }
    }
    throw syntax('Knoten');
  }

  // ∫(f(x),a,b)  d/dx(f(x),a)  Σ(f(x),a,b) – x ist die Laufvariable
  function analysis(node, env) {
    const vars = Object.assign({}, env.vars);
    const e2 = Object.assign({}, env, { vars });
    const body = node.args[0];
    const f = (x) => { vars.X = x; const v = evaluate(body, e2); if (!Number.isFinite(v)) throw math('Funktion'); return v; };
    const arg = (i) => evaluate(node.args[i], env);
    if (node.f === 'deriv') {
      if (node.args.length !== 2) throw syntax('d/dx(f(x), a)');
      const a = arg(1);
      const h = 1e-3 * Math.max(1, Math.abs(a));
      const d = (-f(a + 2 * h) + 8 * f(a + h) - 8 * f(a - h) + f(a - 2 * h)) / (12 * h);
      return snap(d, 1e-8);
    }
    if (node.args.length !== 3) throw syntax(node.f + '(f(x), a, b)');
    const a = arg(1), b = arg(2);
    if (node.f === 'sum' || node.f === 'prod') {
      if (!isInt(a) || !isInt(b) || a > b || b - a > 1e6) throw math('Grenzen');
      const prod = node.f === 'prod';
      let s = prod ? 1 : 0;
      for (let i = Math.round(a); i <= Math.round(b); i++) s = prod ? s * f(i) : s + f(i);
      return s;
    }
    if (a === b) return 0;
    let budget = 200000;
    const simpson = (l, r, fl, fm, fr) => ((r - l) / 6) * (fl + 4 * fm + fr);
    function rec(l, r, fl, fm, fr, whole, eps, depth) {
      const m = (l + r) / 2, lm = (l + m) / 2, rm = (m + r) / 2;
      const flm = f(lm), frm = f(rm);
      budget -= 2;
      const left = simpson(l, m, fl, flm, fm), right = simpson(m, r, fm, frm, fr);
      const diff = left + right - whole;
      if (depth <= 0 || budget <= 0 || Math.abs(diff) <= 15 * eps) return left + right + diff / 15;
      return rec(l, m, fl, flm, fm, left, eps / 2, depth - 1) + rec(m, r, fm, frm, fr, right, eps / 2, depth - 1);
    }
    // in 16 Stücke vorteilen, damit schmale Spitzen nicht übersehen werden
    const n = 16, w = (b - a) / n;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const l = a + i * w, r = i === n - 1 ? b : l + w, m = (l + r) / 2;
      const fl = f(l), fm = f(m), fr = f(r);
      total += rec(l, r, fl, fm, fr, simpson(l, r, fl, fm, fr), 1e-12, 40);
    }
    if (budget <= 0) throw math('Integral konvergiert nicht');
    return snap(total, 1e-10);
  }
  function snap(v, tol) {
    const r = Math.round(v);
    return Math.abs(v - r) < tol * Math.max(1, Math.abs(v)) ? r : v;
  }

  function calculate(src, env) {
    const tree = parse(src);
    if (!tree) return { tree: null, value: null };
    const value = evaluate(tree, env);
    if (!Number.isFinite(value) || Math.abs(value) >= 1e100) throw math('Überlauf');
    // Rundungsrauschen jenseits der 15. Stelle abschneiden
    const clean = Number(value.toPrecision(15));
    return { tree, value: Object.is(clean, -0) ? 0 : clean };
  }

  // ---------- exakte Darstellung ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

  function toFraction(x, maxDen) {
    if (!Number.isFinite(x)) return null;
    const sign = x < 0 ? -1 : 1;
    let v = Math.abs(x);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
    let y = v;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(y);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(v - h1 / k1) <= 1e-12 * Math.max(1, v)) return { p: sign * h1, q: k1 };
      const f = y - a;
      if (f < 1e-15) break;
      y = 1 / f;
    }
    return null;
  }

  function digits(n) { return String(Math.abs(n)).length; }

  function simplifySqrt(n) { // √n = a·√b
    let a = 1, b = n;
    for (let f = 2; f * f <= b; f++) while (b % (f * f) === 0) { b /= f * f; a *= f; }
    return { a, b };
  }

  /** Liefert {type, p, q, a, b} oder null. */
  function exactForm(x) {
    if (!Number.isFinite(x) || Number.isInteger(x)) return null;
    if (Math.abs(x) >= 1e10 || Math.abs(x) < 1e-6) return null;
    const fr = toFraction(x, 100000);
    if (fr && fr.q > 1 && digits(fr.p) + digits(fr.q) <= 10) return { type: 'frac', p: fr.p, q: fr.q };
    const pi = toFraction(x / Math.PI, 1000);
    if (pi && Math.abs(pi.p) <= 10000) return { type: 'pi', p: pi.p, q: pi.q };
    const sq = toFraction(x * x, 10000);
    if (sq && sq.p > 0 && sq.p * sq.q < 1e9) {
      const { a, b } = simplifySqrt(sq.p * sq.q);
      if (b > 1) {
        const g = gcd(a, sq.q);
        return { type: 'sqrt', sign: x < 0 ? -1 : 1, a: a / g, b, q: sq.q / g };
      }
    }
    return null;
  }

  function primeFactors(n) {
    if (!Number.isInteger(n) || n < 2 || n > 1e12) return null;
    const out = [];
    for (let f = 2; f * f <= n; f += f === 2 ? 1 : 2) {
      let e = 0;
      while (n % f === 0) { n /= f; e++; }
      if (e) out.push([f, e]);
    }
    if (n > 1) out.push([n, 1]);
    return out;
  }

  // ---------- Zahlenformat ----------
  /** 10 signifikante Stellen; ab 1e10 oder unter 1e-9 mit Zehnerpotenz. */
  function formatNumber(x, sig) {
    sig = sig || 10;
    if (x === 0) return { m: '0' };
    const r = Number(x.toPrecision(sig));
    const e = Math.floor(Math.log10(Math.abs(r)));
    if (Math.abs(r) >= 1e10 || Math.abs(r) < 1e-9) {
      let m = r / Math.pow(10, e);
      m = Number(m.toPrecision(sig));
      let ee = e;
      if (Math.abs(m) >= 10) { m /= 10; ee++; }
      return { m: trimZeros(m.toFixed(sig - 1)), e: ee };
    }
    return { m: trimZeros(r.toFixed(Math.min(20, Math.max(0, sig - 1 - e)))) };
  }
  function formatEng(x, k) {
    const m = x / Math.pow(10, k);
    return { m: trimZeros(Number(m.toPrecision(10)).toFixed(Math.max(0, 9 - Math.floor(Math.log10(Math.abs(m) || 1))))), e: k };
  }
  function trimZeros(s) {
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  global.Calc = { lex, parse, primeFactors, evaluate, calculate, exactForm, formatNumber, formatEng, toFraction, CalcError };
})(typeof window !== 'undefined' ? window : globalThis);
