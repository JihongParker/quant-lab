/* 동적 모형 엔진 44종 + 공용 캔버스 차트 라이브러리.
   난수를 쓰는 패널은 브라우저에서 다시 돌린 재현이므로 카드 하단 표의
   엑셀 기록값과 수치가 다를 수 있다. 이 사실은 각 패널 캡션에 적는다. */

/* ============ 유틸 ============ */
const F = {
  n(v, d = 0) {
    if (!isFinite(v)) return "-";
    return v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct(v, d = 2) { return (v * 100).toFixed(d) + "%"; },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 표준정규 역함수 (Acklam) — 엑셀 NORM.S.INV 대응 */
function normInv(p) {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function nCDF(x) { /* 표준정규 누적분포 (Zelen-Severo) */
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const dpdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  let p = dpdf * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function bs(S, K, r, sig, T, q = 0) {
  const d1 = (Math.log(S / K) + (r - q + sig * sig / 2) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);
  return {
    d1, d2, Nd1: nCDF(d1), Nd2: nCDF(d2),
    call: S * Math.exp(-q * T) * nCDF(d1) - K * Math.exp(-r * T) * nCDF(d2),
    put: K * Math.exp(-r * T) * nCDF(-d2) - S * Math.exp(-q * T) * nCDF(-d1),
  };
}
function triInv(a, c, b, u) { /* 삼각분포 역함수 — 엑셀 실습 수식과 동일 */
  const lo = c - a, hi = b - c, tot = b - a;
  return u < lo / tot ? a + Math.sqrt(u * lo * tot) : b - Math.sqrt((1 - u) * hi * tot);
}
function binomInv(n, p, u) { /* BINOM.INV 대응 */
  let cum = 0, q = Math.pow(1 - p, n), k = 0;
  for (k = 0; k <= n; k++) {
    cum += q;
    if (u <= cum + 1e-12) return k;
    q *= (p / (1 - p)) * (n - k) / (k + 1);
  }
  return n;
}
function ols(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - a - b * xs[i]) ** 2;
  return { a, b, r2: syy ? 1 - sse / syy : 0, se: Math.sqrt(sse / (n - 2)) };
}
function quantile(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function stdev(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

/* ============ 테마 토큰 ============ */
function TK() {
  const cs = getComputedStyle(document.documentElement);
  const g = (k) => cs.getPropertyValue(k).trim();
  return {
    s1: g("--ch-s1"), s2: g("--ch-s2"), s3: g("--ch-s3"),
    red: g("--ch-red"), good: g("--ch-good"), crit: g("--ch-crit"),
    ink: g("--text"), mut: g("--ch-mut"), grid: g("--ch-grid"),
    base: g("--ch-base"), surf: g("--panel"),
  };
}
const REDRAW = new Set(); /* 테마 전환 시 다시 그릴 함수 */
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  REDRAW.forEach((f) => { try { f(); } catch (e) { } });
});

/* ============ 캔버스 차트 ============ */
let TIP = null;
function tip() {
  if (!TIP) {
    TIP = document.createElement("div");
    TIP.className = "ch-tip";
    document.body.appendChild(TIP);
  }
  return TIP;
}
function showTip(x, y, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = "block";
  const w = t.offsetWidth, vw = document.documentElement.clientWidth;
  t.style.left = Math.min(x + 14, vw - w - 8) + "px";
  t.style.top = (y + 14) + "px";
}
function hideTip() { if (TIP) TIP.style.display = "none"; }

function mkCanvas(host, h = 230) {
  const cv = document.createElement("canvas");
  cv.className = "ch";
  cv.style.height = h + "px";
  host.appendChild(cv);
  return cv;
}
/* 좌표계 준비: 격자·눈금·라벨을 그리고 매핑 함수를 돌려준다 */
function frame(cv, o) {
  const dpr = devicePixelRatio || 1;
  const cw = cv.clientWidth || 560, chh = parseInt(cv.style.height) || 230;
  cv.width = cw * dpr; cv.height = chh * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = TK();
  const padL = o.padL ?? 52, padR = o.padR ?? 14, padT = o.padT ?? 12, padB = o.padB ?? 30;
  const W = cw - padL - padR, H = chh - padT - padB;
  const px = (x) => padL + (x - o.x0) / (o.x1 - o.x0) * W;
  const py = (y) => padT + (1 - (y - o.y0) / (o.y1 - o.y0)) * H;
  ctx.clearRect(0, 0, cw, chh);
  ctx.font = "11px system-ui,-apple-system,sans-serif";
  ctx.fillStyle = t.mut; ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
  const yt = o.yTicks ?? 4;
  for (let i = 0; i <= yt; i++) {
    const v = o.y0 + (o.y1 - o.y0) * i / yt, y = py(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(o.yfmt ? o.yfmt(v) : F.n(v), padL - 6, y);
  }
  const xt = o.xTicks ?? 5;
  for (let i = 0; xt > 0 && i <= xt; i++) {
    const v = o.x0 + (o.x1 - o.x0) * i / xt, x = px(v);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(o.xfmt ? o.xfmt(v) : F.n(v), x, padT + H + 6);
  }
  ctx.strokeStyle = t.base;
  ctx.beginPath(); ctx.moveTo(padL, padT + H); ctx.lineTo(padL + W, padT + H); ctx.stroke();
  if (o.xlab) { ctx.fillStyle = t.mut; ctx.textAlign = "right"; ctx.fillText(o.xlab, padL + W, padT + H - 14); }
  return { ctx, t, px, py, padL, padT, W, H, cw, ch: chh };
}
function line(f, pts, color, w = 2, dash) {
  const c = f.ctx; c.save();
  if (dash) c.setLineDash(dash);
  c.strokeStyle = color; c.lineWidth = w; c.lineJoin = "round"; c.beginPath();
  pts.forEach((p, i) => { const x = f.px(p[0]), y = f.py(p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke(); c.restore();
}
function dots(f, pts, color, r = 4) {
  const c = f.ctx;
  pts.forEach((p) => {
    c.beginPath(); c.arc(f.px(p[0]), f.py(p[1]), r, 0, 7);
    c.fillStyle = color; c.fill();
    c.lineWidth = 2; c.strokeStyle = f.t.surf; c.stroke();
  });
}
function vline(f, x, color, label, dash = [4, 4]) {
  const c = f.ctx; c.save(); c.setLineDash(dash); c.strokeStyle = color; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(f.px(x), f.padT); c.lineTo(f.px(x), f.padT + f.H); c.stroke(); c.restore();
  if (label) { c.fillStyle = color; c.textAlign = "left"; c.textBaseline = "top"; c.font = "10.5px system-ui,sans-serif"; c.fillText(label, f.px(x) + 4, f.padT + 2); }
}
/* 히스토그램: 4px 라운드 상단, 막대 사이 2px 간격 */
function histo(cv, data, o = {}) {
  if (!data.length) return;
  const bins = o.bins ?? 30;
  let lo = o.lo ?? Math.min(...data), hi = o.hi ?? Math.max(...data);
  /* 부동소수 잔차 수준의 범위는 퇴화로 취급 — 동일값이 여러 빈으로
     쪼개지고 눈금이 전부 같은 값으로 찍히는 것을 막는다 */
  if (hi - lo < Math.max(Math.abs(hi), Math.abs(lo), 1) * 1e-6) {
    const m = (lo + hi) / 2; lo = m - 1; hi = m + 1;
  }
  const cnt = new Array(bins).fill(0);
  data.forEach((v) => { let i = Math.floor((v - lo) / (hi - lo) * bins); i = Math.max(0, Math.min(bins - 1, i)); cnt[i]++; });
  const ymax = Math.max(...cnt) * 1.08;
  const f = frame(cv, { x0: lo, x1: hi, y0: 0, y1: ymax, xfmt: o.xfmt, yfmt: (v) => F.n(v), xTicks: o.xTicks ?? 5, xlab: o.xlab });
  const bw = f.W / bins;
  for (let i = 0; i < bins; i++) {
    if (!cnt[i]) continue;
    const x = f.px(lo + (hi - lo) * i / bins) + 1, y = f.py(cnt[i]);
    const h = f.padT + f.H - y, w = Math.max(1, bw - 2);
    const bx = lo + (hi - lo) * (i + 0.5) / bins;
    f.ctx.fillStyle = o.colorFn ? o.colorFn(bx) : (o.color || f.t.s1);
    f.ctx.beginPath();
    f.ctx.roundRect(x, y, w, h, [4, 4, 0, 0]);
    f.ctx.fill();
  }
  (o.marks || []).forEach((m) => vline(f, m.x, m.color || f.t.crit, m.label));
  cv.onmousemove = (ev) => {
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const i = Math.floor((mx - f.padL) / bw);
    if (i < 0 || i >= bins) { hideTip(); return; }
    const b0 = lo + (hi - lo) * i / bins, b1 = lo + (hi - lo) * (i + 1) / bins;
    showTip(ev.clientX, ev.clientY, `${(o.xfmt || F.n)(b0)} ~ ${(o.xfmt || F.n)(b1)}<br><b>${F.n(cnt[i])}회</b> (${F.pct(cnt[i] / data.length, 1)})`);
  };
  cv.onmouseleave = hideTip;
  return f;
}
/* 세로 막대 (범주형) */
function bars(cv, labels, values, o = {}) {
  const ymax = o.ymax ?? Math.max(...values.map((v) => Math.max(...(Array.isArray(v) ? v : [v])))) * 1.15;
  const ymin = o.ymin ?? Math.min(0, ...values.flat ? values.flat() : values);
  const series = Array.isArray(values[0]) ? values[0].length : 1;
  const f = frame(cv, { x0: 0, x1: labels.length, y0: ymin, y1: ymax || 1, xTicks: 0, yfmt: o.yfmt });
  const gw = f.W / labels.length;
  const colors = o.colors || [f.t.s1, f.t.s2, f.t.s3];
  labels.forEach((lb, i) => {
    const vs = Array.isArray(values[i]) ? values[i] : [values[i]];
    const bw = Math.min(46, (gw - 14) / series);
    vs.forEach((v, s) => {
      const x = f.padL + gw * i + gw / 2 - bw * series / 2 + s * bw + 1;
      const y0 = f.py(Math.max(0, ymin)), y = f.py(v);
      f.ctx.fillStyle = o.colorFn ? o.colorFn(i, s, v) : colors[s % colors.length];
      f.ctx.beginPath();
      const top = Math.min(y, y0), h = Math.abs(y0 - y);
      f.ctx.roundRect(x, top, Math.max(1, bw - 2), Math.max(h, 0.5), v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]);
      f.ctx.fill();
    });
    f.ctx.fillStyle = f.t.mut; f.ctx.textAlign = "center"; f.ctx.textBaseline = "top";
    f.ctx.font = "11px system-ui,sans-serif";
    f.ctx.fillText(lb, f.padL + gw * i + gw / 2, f.padT + f.H + 6);
    if (o.valueLabels) {
      const v0 = vs[0];
      f.ctx.fillStyle = f.t.ink; f.ctx.textBaseline = "bottom"; f.ctx.font = "11px system-ui,sans-serif";
      f.ctx.fillText((o.yfmt || F.n)(v0), f.padL + gw * i + gw / 2, f.py(Math.max(v0, 0)) - 3);
    }
  });
  cv.onmousemove = (ev) => {
    const r = cv.getBoundingClientRect();
    const i = Math.floor((ev.clientX - r.left - f.padL) / gw);
    if (i < 0 || i >= labels.length) { hideTip(); return; }
    const vs = Array.isArray(values[i]) ? values[i] : [values[i]];
    showTip(ev.clientX, ev.clientY, `${labels[i]}<br>` + vs.map((v, s) => `<b>${(o.yfmt || F.n)(v)}</b>${o.seriesNames ? " " + o.seriesNames[s] : ""}`).join("<br>"));
  };
  cv.onmouseleave = hideTip;
  return f;
}

/* ============ 컨트롤 ============ */
function E(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function slider(label, min, max, step, val, fmt, on) {
  const w = E("label", "ctl");
  const name = E("span", "ctl-name", label);
  const out = E("b", "ctl-val", fmt(val));
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
  inp.addEventListener("input", () => { out.textContent = fmt(+inp.value); on(+inp.value); });
  w.append(name, inp, out);
  w.get = () => +inp.value;
  w.set = (v) => { inp.value = v; out.textContent = fmt(v); };
  return w;
}
function seg(options, initial, on) {
  const w = E("div", "seg");
  options.forEach((op, i) => {
    const b = E("button", null, op);
    b.type = "button";
    b.setAttribute("aria-pressed", String(i === initial));
    b.addEventListener("click", () => {
      w.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      on(i);
    });
    w.appendChild(b);
  });
  return w;
}
function btn(label, on) { const b = E("button", "act", label); b.type = "button"; b.addEventListener("click", on); return b; }
function tile(label, sub) {
  const w = E("div", "tile");
  const v = E("b", null, "-");
  w.append(E("span", null, label), v);
  if (sub) w.append(E("small", null, sub));
  w.set = (x, cls) => { v.textContent = x; v.className = cls || ""; };
  return w;
}
function note(txt) { return E("p", "eng-note", txt); }
function ctlRow(...items) { const r = E("div", "ctl-row"); r.append(...items); return r; }
function tileRow(...items) { const r = E("div", "tile-row"); r.append(...items); return r; }
function legendRow(entries) {
  const r = E("div", "leg");
  entries.forEach(([color, name]) => {
    const it = E("span", "leg-it");
    const sw = E("i"); sw.style.background = color;
    it.append(sw, document.createTextNode(name));
    r.appendChild(it);
  });
  return r;
}

/* 애니메이션 도우미: 카드가 닫히면 스스로 멈춘다 */
function animate(host, stepFn) {
  let stop = false;
  function loop() {
    if (stop || !host.isConnected) return;
    const d = host.closest("details");
    if (d && !d.open) { stop = true; return; }
    if (stepFn() !== false) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { stop = true; };
}

/* MC 실행: 프레임당 batch 회씩 total 회 시행 후 done */
function runMC(host, total, batch, drawEvery, sampleFn, drawFn) {
  const acc = [];
  return animate(host, () => {
    for (let i = 0; i < batch && acc.length < total; i++) acc.push(sampleFn(acc.length));
    if (acc.length % drawEvery < batch || acc.length >= total) drawFn(acc, acc.length >= total);
    return acc.length < total ? true : false;
  });
}

/* ============ 엔진 정의 ============ */
const ENGINES = {};

/* ---- O01 단순회귀 ---- */
ENGINES.O01 = (host) => {
  const d = EDATA.O01, fit = ols(d.x, d.y);
  const cv = mkCanvas(host, 250);
  const t1 = tile("추정원가"), t2 = tile("잔차"), t3 = tile("R²");
  let q = 450;
  function draw() {
    const f = frame(cv, { x0: 150, x1: 900, y0: 40000, y1: 220000, yfmt: (v) => F.n(v / 1000) + "천", xlab: "생산량" });
    const lo = [], hio = [], ln = [];
    for (let x = 150; x <= 900; x += 25) {
      const y = fit.a + fit.b * x;
      ln.push([x, y]); lo.push([x, y - 2 * fit.se]); hio.push([x, y + 2 * fit.se]);
    }
    line(f, lo, f.t.mut, 1.5, [4, 4]); line(f, hio, f.t.mut, 1.5, [4, 4]);
    line(f, ln, f.t.s1, 2);
    dots(f, d.x.map((x, i) => [x, d.y[i]]), f.t.s2, 4);
    vline(f, q, f.t.s3, "예측 지점");
    const py = fit.a + fit.b * q;
    dots(f, [[q, py]], f.t.s3, 5);
    t1.set(F.n(py));
    const idx = d.x.indexOf(q);
    t2.set(idx >= 0 ? F.n(d.y[idx] - py) : "-", idx >= 0 && Math.abs(d.y[idx] - py) > 2 * fit.se ? "warn" : "");
    t3.set(fit.r2.toFixed(4));
  }
  host.append(
    ctlRow(slider("예측 생산량", 150, 900, 10, q, (v) => F.n(v), (v) => { q = v; draw(); })),
    cv,
    legendRow([[TK().s2, "실측 16개월"], [TK().s1, "추정 원가함수"], [TK().mut, "±2s 관리한계"]]),
    tileRow(t1, t2, t3),
    note("16개월 관측치로 최소제곱 원가함수를 브라우저에서 그대로 다시 추정합니다. 점선 밖의 잔차는 생산량 외 요인이 작용한 달입니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- O02 다중회귀 예측기 ---- */
ENGINES.O02 = (host) => {
  const co = { b0: 3319.4, gnp: 0.1570, ue: -102.70, ir: -77.98, q: [180.62, 380.45, 203.21, 0] };
  const cv = mkCanvas(host, 200);
  const tP = tile("예측 매출");
  let gnp = 3000, ue = 7, ir = 10, qi = 1;
  function draw() {
    const labels = ["GNP(×100)", "실업률", "이자율", "1분기", "2분기", "3분기"];
    const vals = [co.gnp * 100, co.ue, co.ir, co.q[0], co.q[1], co.q[2]];
    bars(cv, labels, vals, {
      yfmt: (v) => F.n(v, 0), valueLabels: true,
      colorFn: (i, s, v) => v >= 0 ? TK().s1 : TK().red,
    });
    const y = co.b0 + co.gnp * gnp + co.ue * ue + co.ir * ir + co.q[qi];
    tP.set(F.n(y, 1));
  }
  host.append(
    ctlRow(
      slider("국민총생산", 2000, 4000, 50, gnp, F.n, (v) => { gnp = v; draw(); }),
      slider("실업률 %", 3, 12, 0.5, ue, (v) => v + "%", (v) => { ue = v; draw(); }),
      slider("이자율 %", 4, 16, 0.5, ir, (v) => v + "%", (v) => { ir = v; draw(); }),
    ),
    ctlRow(seg(["1분기", "2분기", "3분기", "4분기(기준)"], qi, (i) => { qi = i; draw(); }), tP),
    cv,
    note("막대는 추정된 계수(부호로 색 구분, GNP 계수는 ×100 표시). 슬라이더를 움직이면 추정식 그대로 분기별 매출을 예측합니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- O03 학습곡선 ---- */
ENGINES.O03 = (host) => {
  const d = EDATA.O03;
  const cv = mkCanvas(host, 240);
  const tL = tile("원가 하락률"), tM = tile("MAPE");
  let L = 0.8432;
  function draw() {
    const b = Math.log(L) / Math.log(2);
    const a = d.ac[0] / Math.pow(d.cq[0], b);
    const lx0 = Math.log10(d.cq[0]) - 0.1, lx1 = Math.log10(d.cq[d.cq.length - 1]) + 0.15;
    const f = frame(cv, {
      x0: lx0, x1: lx1, y0: 1200, y1: 4200,
      xfmt: (v) => F.n(Math.pow(10, v) / 1000) + "천", xlab: "누적생산량(로그)",
    });
    const ln = [];
    for (let lx = lx0; lx <= lx1; lx += 0.03) ln.push([lx, a * Math.pow(Math.pow(10, lx), b)]);
    line(f, ln, f.t.s1, 2);
    dots(f, d.cq.map((x, i) => [Math.log10(x), d.ac[i]]), f.t.s2, 4);
    let ape = 0;
    d.cq.forEach((x, i) => { ape += Math.abs(a * Math.pow(x, b) - d.ac[i]) / d.ac[i]; });
    tL.set(F.pct(1 - L, 2)); tM.set(F.pct(ape / d.cq.length, 2));
  }
  host.append(
    ctlRow(slider("학습률", 0.72, 0.96, 0.002, L, (v) => F.pct(v, 1), (v) => { L = v; draw(); })),
    cv,
    legendRow([[TK().s2, "실측 누적평균원가"], [TK().s1, "멱함수 곡선"]]),
    tileRow(tL, tM),
    note("학습률을 움직여 실측 7개 점에 곡선이 가장 잘 붙는 자리를 찾아보세요. 통합문서의 적합치는 84.3%입니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- O04 민감도분석 ---- */
ENGINES.O04 = (host) => {
  const d = EDATA.O04;
  const npv = (cf, r) => cf.reduce((s, c, i) => s + c / Math.pow(1 + r, i), 0);
  /* 교차 이자율 이분법 */
  let lo = 0.01, hi = 0.3;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (npv(d.A, m) - npv(d.B, m) > 0) ? lo = m : hi = m; }
  const cross = (lo + hi) / 2;
  const cv = mkCanvas(host, 240);
  const tA = tile("A안 NPV"), tB = tile("B안 NPV"), tW = tile("우세");
  let r = 0.12;
  function draw() {
    const f = frame(cv, { x0: 0.01, x1: 0.25, y0: -50, y1: 500, xfmt: (v) => F.pct(v, 0), xlab: "할인율" });
    const A = [], B = [];
    for (let x = 0.01; x <= 0.2505; x += 0.005) { A.push([x, npv(d.A, x)]); B.push([x, npv(d.B, x)]); }
    line(f, A, f.t.s1, 2); line(f, B, f.t.s2, 2);
    line(f, [[0.01, 0], [0.25, 0]], f.t.base, 1);
    vline(f, cross, f.t.crit, "역전 " + F.pct(cross, 2));
    vline(f, r, f.t.s3, "");
    const a = npv(d.A, r), b2 = npv(d.B, r);
    dots(f, [[r, a]], f.t.s1, 5); dots(f, [[r, b2]], f.t.s2, 5);
    tA.set(F.n(a, 1)); tB.set(F.n(b2, 1));
    tW.set(a > b2 ? "A안" : "B안");
  }
  host.append(
    ctlRow(slider("할인율", 0.01, 0.25, 0.0025, r, (v) => F.pct(v, 2), (v) => { r = v; draw(); })),
    cv,
    legendRow([[TK().s1, "A안"], [TK().s2, "B안"]]),
    tileRow(tA, tB, tW),
    note("두 투자안의 현금흐름은 통합문서 값 그대로입니다. 슬라이더로 데이터표 전체를 훑으면 13.18%에서 우열이 뒤집힙니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- O05 LP 인력배치 ---- */
ENGINES.O05 = (host) => {
  const wage = [1, 0.7, 0.8, 0.5];
  const opt = [10, 400, 1400, 10];
  const cons = [
    { name: "산출 1 (생산 20,000/인)", coef: [0, 20000, 0, 0], min: 8000000 },
    { name: "산출 2 (판매 5,000/인)", coef: [0, 0, 5000, 0], min: 7000000 },
    { name: "산출 3 (혼합)", coef: [0, 2200, 2500, 2000], min: 500000 },
  ];
  let x = opt.slice();
  const tC = tile("총 인건비", "억원");
  const gauges = cons.map(() => { const g = E("div", "gauge"); g.append(E("i"), E("span")); return g; });
  const sliders = ["개발", "생산", "판매", "관리"].map((nm, i) =>
    slider(nm, 0, 2000, 10, opt[i], F.n, (v) => { x[i] = v; update(); }));
  function update() {
    const cost = x.reduce((s, v, i) => s + v * wage[i], 0);
    const optCost = opt.reduce((s, v, i) => s + v * wage[i], 0);
    let feas = true;
    cons.forEach((c, i) => {
      const got = c.coef.reduce((s, k, j) => s + k * x[j], 0);
      const ok = got >= c.min; feas = feas && ok;
      const bar = gauges[i].querySelector("i"), lab = gauges[i].querySelector("span");
      bar.style.width = Math.min(100, got / c.min * 100) + "%";
      bar.style.background = ok ? TK().good : TK().crit;
      lab.textContent = `${c.name} — ${F.n(got)} / ${F.n(c.min)} ${ok ? "충족" : "미달"}`;
    });
    tC.set(F.n(cost, 1) + (feas ? (cost <= optCost + 0.01 ? " (최적)" : ` (+${F.n(cost - optCost, 1)})`) : " · 제약 미달"), feas ? "" : "warn");
  }
  host.append(
    ctlRow(...sliders),
    ctlRow(btn("최적해로 복원", () => { x = opt.slice(); sliders.forEach((s, i) => s.set(opt[i])); update(); }), tC),
    ...gauges,
    note("인원을 직접 움직여 보세요. 제약을 지키면서 1,415억보다 싼 조합은 만들 수 없습니다 — 그것이 단체법이 찾은 최적해의 의미입니다."),
  );
  update();
};

/* ---- O06 GRG 경사하강 ---- */
const DW = { f: (x) => 0.05 * x ** 4 - 1.2 * x ** 2 + 0.3 * x + 8, df: (x) => 0.2 * x ** 3 - 2.4 * x + 0.3 };
ENGINES.O06 = (host) => {
  const cv = mkCanvas(host, 240);
  const tX = tile("도달한 해 x"), tF = tile("목적함수 값");
  let x0 = 1.5, cur = x0, trail = [], stopA = null;
  function drawBase() {
    const f = frame(cv, { x0: -5.5, x1: 5.5, y0: -2, y1: 14, xfmt: (v) => v.toFixed(0) });
    const ln = [];
    for (let x = -5.5; x <= 5.5; x += 0.05) ln.push([x, DW.f(x)]);
    line(f, ln, f.t.s1, 2);
    return f;
  }
  function start() {
    if (stopA) stopA();
    cur = x0; trail = [];
    stopA = animate(host, () => {
      for (let i = 0; i < 3; i++) { cur -= 0.02 * DW.df(cur); }
      trail.push(cur);
      const f = drawBase();
      dots(f, trail.slice(-40).map((v) => [v, DW.f(v)]), f.t.mut, 2.5);
      dots(f, [[cur, DW.f(cur)]], f.t.s2, 6);
      tX.set(cur.toFixed(3)); tF.set(DW.f(cur).toFixed(3));
      if (Math.abs(DW.df(cur)) < 1e-4) return false;
    });
  }
  host.append(
    ctlRow(slider("시작점 x₀", -5, 5, 0.1, x0, (v) => v.toFixed(1), (v) => { x0 = v; start(); }), btn("다시 굴리기", start)),
    cv, tileRow(tX, tF),
    note("개념 시연: 골짜기가 두 개인 함수 위에서 기울기를 따라 내려가면 출발점에 따라 다른 골짜기에 멈춥니다. 통합문서에서는 GRG가 같은 성질을 보였습니다."),
  );
  start();
};

/* ---- O07 유전 알고리즘 ---- */
ENGINES.O07 = (host) => {
  const cv = mkCanvas(host, 240);
  const tG = tile("세대"), tB = tile("최선 x"), tF = tile("f(최선)");
  let stopA = null;
  function start() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    let pop = Array.from({ length: 24 }, () => -5 + 10 * rng());
    let gen = 0;
    stopA = animate(host, () => {
      gen++;
      pop.sort((a, b) => DW.f(a) - DW.f(b));
      const elite = pop.slice(0, 8);
      pop = elite.concat(Array.from({ length: 16 }, () => {
        const p = elite[(rng() * 8) | 0];
        return Math.max(-5.5, Math.min(5.5, p + (rng() - 0.5) * 2.4 / Math.sqrt(gen)));
      }));
      const f = frame(cv, { x0: -5.5, x1: 5.5, y0: -2, y1: 14, xfmt: (v) => v.toFixed(0) });
      const ln = []; for (let x = -5.5; x <= 5.5; x += 0.05) ln.push([x, DW.f(x)]);
      line(f, ln, f.t.s1, 2);
      dots(f, pop.map((v) => [v, DW.f(v)]), f.t.s3, 3.5);
      dots(f, [[pop[0], DW.f(pop[0])]], f.t.s2, 6);
      tG.set(String(gen)); tB.set(pop[0].toFixed(3)); tF.set(DW.f(pop[0]).toFixed(3));
      if (gen >= 40) return false;
    });
  }
  host.append(
    ctlRow(btn("진화 다시 시작", start), tG, tB, tF),
    cv,
    legendRow([[TK().s3, "모집단"], [TK().s2, "현세대 최선해"]]),
    note("개념 시연: 같은 함수를 모집단 기반 전역 탐색으로 풉니다. 무작위로 뿌린 해들이 세대를 거치며 전역 최소 골짜기로 모입니다."),
  );
  start();
};

/* ---- O08 수송문제 ---- */
ENGINES.O08 = (host) => {
  const d = EDATA.O08;
  const cv = mkCanvas(host, 290);
  const sup = ["A", "B", "C", "D", "E"], cus = ["1", "2", "3", "4"];
  const total = d.ship.flat().reduce((s, v, i) => s + v * d.cost.flat()[i], 0);
  function draw() {
    const f = frame(cv, { x0: 0, x1: 1, y0: 0, y1: 1, xTicks: 0, yTicks: 0, padL: 8, padR: 8, padB: 8, padT: 8 });
    const c = f.ctx;
    /* 마지막 노드의 하단 라벨(+26px)이 캔버스 안에 들어오도록 여백 확보 */
    const sy = (i) => f.padT + 24 + i * (f.H - 64) / 4;
    const cy = (j) => f.padT + 30 + j * (f.H - 60) / 3;
    const sx = f.padL + 60, cx2 = f.padL + f.W - 60;
    d.ship.forEach((row, i) => row.forEach((q, j) => {
      if (!q) return;
      c.strokeStyle = f.t.s1; c.globalAlpha = 0.75; c.lineWidth = Math.max(1.5, q / 6);
      c.beginPath(); c.moveTo(sx + 26, sy(i)); c.lineTo(cx2 - 26, cy(j)); c.stroke();
      c.globalAlpha = 1;
    }));
    sup.forEach((nm, i) => {
      c.fillStyle = f.t.s2; c.beginPath(); c.arc(sx, sy(i), 16, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "bold 12px system-ui,sans-serif";
      c.fillText(nm, sx, sy(i));
      c.fillStyle = f.t.mut; c.font = "10.5px system-ui,sans-serif";
      c.fillText("공급 " + d.cap[i], sx, sy(i) + 26);
    });
    cus.forEach((nm, j) => {
      c.fillStyle = f.t.s3; c.beginPath(); c.arc(cx2, cy(j), 16, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.font = "bold 12px system-ui,sans-serif"; c.fillText(nm, cx2, cy(j));
      c.fillStyle = f.t.mut; c.font = "10.5px system-ui,sans-serif";
      c.fillText("수요 " + d.dem[j], cx2, cy(j) + 26);
    });
    cv.onmousemove = (ev) => {
      const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best = null, bd = 12;
      d.ship.forEach((row, i) => row.forEach((q, j) => {
        if (!q) return;
        const x1 = sx + 26, y1 = sy(i), x2 = cx2 - 26, y2 = cy(j);
        const tt = Math.max(0, Math.min(1, ((mx - x1) * (x2 - x1) + (my - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
        const dist = Math.hypot(mx - (x1 + tt * (x2 - x1)), my - (y1 + tt * (y2 - y1)));
        if (dist < bd) { bd = dist; best = { i, j, q }; }
      }));
      if (best) showTip(ev.clientX, ev.clientY, `${sup[best.i]} → 수요지 ${cus[best.j]}<br>물량 <b>${best.q}</b> · 단가 ${d.cost[best.i][best.j]} · 비용 <b>${best.q * d.cost[best.i][best.j]}</b>`);
      else hideTip();
    };
    cv.onmouseleave = hideTip;
  }
  const tT = tile("총 수송비용"), tD = tile("수요 충족");
  tT.set(F.n(total)); tD.set(F.n(d.dem.reduce((a, b) => a + b, 0)) + " / 100%");
  host.append(cv, tileRow(tT, tD), note("선 굵기가 배송 물량입니다. 선 위에 마우스를 올리면 경로별 물량·단가·비용이 보입니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O09 제품배합 1 ---- */
ENGINES.O09 = (host) => {
  const cv = mkCanvas(host, 210);
  const tP = tile("영업이익");
  const labor = E("div", "gauge"); labor.append(E("i"), E("span"));
  const mat = E("div", "gauge"); mat.append(E("i"), E("span"));
  function draw() {
    bars(cv, ["제품 1", "제품 2", "제품 3", "제품 4", "제품 5"], [0, 966, 0, 0, 379], { valueLabels: true, yfmt: (v) => F.n(v) });
    const set = (g, used, cap, nm) => {
      g.querySelector("i").style.width = (used / cap * 100) + "%";
      g.querySelector("i").style.background = TK().s1;
      g.querySelector("span").textContent = `${nm} — ${F.n(used, 1)} / ${F.n(cap)} (${F.pct(used / cap, 1)})`;
    };
    set(labor, 3998, 4000, "노동시간"); set(mat, 4499.5, 4500, "원재료");
    tP.set(F.n(54605));
  }
  host.append(cv, labor, mat, tileRow(tP),
    note("다섯 품목 중 둘만 생산하는 최적해. 두 자원이 모두 99.9% 소진되어 있어 어느 쪽을 늘려도 해가 움직입니다 — 이중가격이 양수인 상태입니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O10 제품배합 2 (불연속) ---- */
ENGINES.O10 = (host) => {
  const cv = mkCanvas(host, 240);
  const tQ = tile("생산량"), tU = tile("단위 공헌이익");
  let q = 42553;
  const kink = 20000, m1 = 5.2, m2 = 6.75; /* 전환점 이후 단가가 낮아져 기여가 커지는 구조(대표값) */
  const contrib = (x) => x < kink ? m1 * x : m1 * kink + m2 * (x - kink);
  function draw() {
    const f = frame(cv, { x0: 0, x1: 70000, y0: 0, y1: contrib(70000) * 1.05, xfmt: (v) => F.n(v / 1000) + "천", yfmt: (v) => F.n(v / 1000) + "천", xlab: "제품 1 생산량" });
    const p1 = [], p2 = [];
    for (let x = 0; x <= kink; x += 500) p1.push([x, contrib(x)]);
    for (let x = kink; x <= 70000; x += 500) p2.push([x, contrib(x)]);
    line(f, p1, f.t.s1, 2); line(f, p2, f.t.s2, 2);
    vline(f, kink, f.t.mut, "구간 전환점");
    vline(f, 42553, f.t.s3, "최적해 42,553");
    dots(f, [[q, contrib(q)]], f.t.s3, 5);
    tQ.set(F.n(q)); tU.set(q < kink ? m1.toFixed(2) + " (고단가 구간)" : m2.toFixed(2) + " (저단가 구간)");
  }
  host.append(
    ctlRow(slider("생산량 이동", 0, 70000, 500, q, (v) => F.n(v), (v) => { q = v; draw(); })),
    cv,
    note("개념 시연(계수는 대표값): 전환점을 넘으면 단위원가가 낮아져 기울기가 꺾입니다. 이 꺾임 때문에 선형계획이 아닌 진화 알고리즘으로 풀었고, 최적해는 세 제품 모두 전환점 위였습니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- O11 광고예산 ---- */
ENGINES.O11 = (host) => {
  const cv = mkCanvas(host, 210);
  function draw() {
    bars(cv, ["TV", "신문", "잡지", "라디오", "직접우편"], [3000 / 1500, 1.1, 0.9, 0.6 / 1.0, 0.45], {
      yfmt: (v) => v.toFixed(2), valueLabels: true,
      colorFn: (i) => i === 0 ? TK().s1 : TK().s3,
    });
  }
  host.append(cv,
    note("회당 광고비 1단위당 도달 시청자(효율). TV(회당 1,500에 3,000명)가 가장 효율적이라 상한 없이 두면 예산이 TV로 쏠립니다 — 매체당 2~20회의 상·하한이 분산을 강제합니다. TV·라디오 외 매체의 막대는 통합문서의 효율 순위를 따른 상대값입니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O12 디지털 광고 ---- */
ENGINES.O12 = (host) => {
  const cv = mkCanvas(host, 210);
  const tR = tile("최적해 순수익");
  function draw() {
    bars(cv, ["검색", "디스플레이", "동영상", "메일"], [770.2, 3229.8, 500, 500], {
      valueLabels: true, yfmt: (v) => F.n(v, 0),
      colorFn: (i) => i === 1 ? TK().s1 : TK().s3,
    });
    tR.set(F.n(109931));
  }
  host.append(cv, tileRow(tR),
    note("총예산 5,000의 최적 배분. 전환당 비용이 가장 낮은 디스플레이에 65%가 몰렸고 동영상·메일은 하한(500)에서 멈췄습니다. 실제 전환 추적 데이터 368행으로 채널 효율을 추정한 결과입니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O13 생산계획 ---- */
ENGINES.O13 = (host) => {
  const cv = mkCanvas(host, 210);
  const tL = tile("센터별 주당 부하"), tB = tile("조업도 벌점");
  function draw() {
    bars(cv, ["1주차", "2주차", "3주차", "4주차"], [14, 14, 13, 9], { valueLabels: true });
    tL.set("76.25"); tB.set("0", "");
  }
  host.append(cv, tileRow(tL, tB),
    note("계획 생산량을 4주에 나눠 배정한 결과. 조업도 차이에 벌점을 부과했더니 부하가 76.25로 균일해졌고 벌점은 0으로 수렴했습니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O14 물류원가 ---- */
ENGINES.O14 = (host) => {
  const cv = mkCanvas(host, 210);
  const tC = tile("총 배송량"), tN = tile("수용량 대비");
  function draw() {
    bars(cv, ["광주 (운임 500)", "청주 (운임 400)", "춘천 (운임 300)"], [0, 60, 200], {
      valueLabels: true,
      colorFn: (i, s, v) => v === 0 ? TK().mut : TK().s1,
    });
    tC.set("260"); tN.set("260 / 300");
  }
  host.append(cv, tileRow(tC, tN),
    note("운임이 가장 싼 춘천 경로에 물량이 쏠리고 가장 비싼 광주는 빠졌습니다. 수용량 300에 여유가 남아 수요 제약만 구속되는 해입니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O15 복수 자본예산 ---- */
ENGINES.O15 = (host) => {
  const cv = mkCanvas(host, 210);
  const tV = tile("순현재가치 합"), tD = tile("분할 대비 손실");
  const vals = [74.44, 70.00, 55.00];
  let mode = 0;
  function draw() {
    bars(cv, ["분할투자", "미분할 (0/1)", "종속관계"], vals, {
      valueLabels: true, yfmt: (v) => v.toFixed(2),
      colorFn: (i) => i === mode ? TK().s1 : TK().grid,
    });
    tV.set(vals[mode].toFixed(2));
    tD.set(mode === 0 ? "-" : `${(vals[0] - vals[mode]).toFixed(2)} (${F.pct((vals[0] - vals[mode]) / vals[0], 1)})`, mode === 0 ? "" : "warn");
  }
  host.append(
    ctlRow(seg(["분할투자", "미분할", "종속투자"], 0, (i) => { mode = i; draw(); })),
    cv, tileRow(tV, tD),
    note("같은 사업 목록에 제약만 바꿔 세 번 푼 결과입니다. 쪼갤 수 없다는 조건만으로 6%, 종속관계까지 걸리면 26%의 가치가 사라집니다 — 제약의 가격표입니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- 소형 선형대수: 대칭행렬 역행렬 (가우스-조던) ---- */
function matInv(M) {
  const n = M.length, A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => i === j ? 1 : 0)));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[p][c])) p = r2;
    [A[c], A[p]] = [A[p], A[c]];
    const pv = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= pv;
    for (let r2 = 0; r2 < n; r2++) {
      if (r2 === c) continue;
      const k = A[r2][c];
      for (let j = 0; j < 2 * n; j++) A[r2][j] -= k * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}
function covOf(rets) {
  const n = rets.length, k = rets[0].length;
  const mu = Array.from({ length: k }, (_, j) => mean(rets.map((r) => r[j])));
  const C = Array.from({ length: k }, () => new Array(k).fill(0));
  rets.forEach((r) => {
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) C[i][j] += (r[i] - mu[i]) * (r[j] - mu[j]);
  });
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) C[i][j] /= (n - 1);
  return { mu, C };
}

/* ---- O16 최소분산 포트폴리오 ---- */
ENGINES.O16 = (host) => {
  const { mu, C } = covOf(EDATA.O16.rets);
  const inv = matInv(C.map((r) => r.slice()));
  const ones = [1, 1, 1, 1];
  const iv1 = ones.map((_, i) => inv[i].reduce((s, v, j) => s + v * ones[j], 0));
  const denom = iv1.reduce((a, b) => a + b, 0);
  const wmv = iv1.map((v) => v / denom);
  const pstat = (w) => {
    const m = w.reduce((s, wi, i) => s + wi * mu[i], 0);
    let v = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) v += w[i] * w[j] * C[i][j];
    return [Math.sqrt(v), m];
  };
  const mv = pstat(wmv);
  const cv = mkCanvas(host, 250);
  const cv2 = mkCanvas(host, 150);
  const tS = tile("최소분산 σ"), tW = tile("비중");
  let cloud = [];
  function draw() {
    const xs = cloud.map((p) => p[0]).concat([mv[0]]);
    const ys = cloud.map((p) => p[1]).concat([mv[1]]);
    const f = frame(cv, {
      x0: Math.min(...xs) * 0.92, x1: Math.max(...xs) * 1.06,
      y0: Math.min(...ys) - Math.abs(Math.min(...ys)) * 0.2 - 0.01, y1: Math.max(...ys) * 1.15 + 0.01,
      xfmt: (v) => F.pct(v, 1), yfmt: (v) => F.pct(v, 1), xlab: "위험 σ",
    });
    dots(f, cloud, f.t.s3, 2.5);
    dots(f, [mv], f.t.s2, 7);
    bars(cv2, ["A", "B", "C", "D"], wmv, { yfmt: (v) => F.pct(v, 1), valueLabels: true, ymin: Math.min(0, ...wmv) });
    tS.set(F.pct(mv[0], 2));
    tW.set(wmv.map((w) => F.pct(w, 0)).join(" · "));
  }
  function resample() {
    const rng = mulberry32((Math.random() * 1e9) | 0);
    cloud = [];
    runMC(host, 1200, 60, 60, () => {
      let w = [rng(), rng(), rng(), rng()];
      const s = w.reduce((a, b) => a + b, 0);
      w = w.map((v) => v / s);
      cloud.push(pstat(w));
      return 1;
    }, () => draw());
  }
  host.append(ctlRow(btn("무작위 포트폴리오 1,200개 재추첨", resample), tS, tW), cv,
    legendRow([[TK().s3, "무작위 비중 조합"], [TK().s2, "최소분산 포트폴리오"]]), cv2,
    note("통합문서의 4개 자산 수익률 82개 관측치로 공분산을 다시 추정해, 무작위 비중 1,200개와 해석적 최소분산해를 함께 찍습니다. 어떤 무작위 조합도 주황 점보다 왼쪽으로 가지 못합니다."));
  resample();
};

/* ---- O17 손실확률 ---- */
ENGINES.O17 = (host) => {
  const { mu, C } = covOf(EDATA.O16.rets.map((r) => r.slice(0, 3)));
  const w = [0.4647, 0.1832, 0.3521];
  const pm = w.reduce((s, wi, i) => s + wi * mu[i], 0);
  let pv = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pv += w[i] * w[j] * C[i][j];
  const ps = Math.sqrt(pv);
  const cv = mkCanvas(host, 230);
  const tP = tile("손실확률"), tM = tile("평균 수익률");
  let trials = 1000;
  function run() {
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    runMC(host, trials, 100, 200, () => {
      const r = pm + ps * normInv(rng());
      acc.push(r); return r;
    }, (a, done) => {
      histo(cv, acc, {
        bins: 36, xfmt: (v) => F.pct(v, 0),
        colorFn: (x) => x < 0 ? TK().red : TK().s1,
        marks: [{ x: 0, label: "0", color: TK().ink }],
      });
      const p = acc.filter((v) => v < 0).length / acc.length;
      tP.set(F.pct(p, 2), p > 0.3 ? "warn" : "");
      tM.set(F.pct(mean(acc), 2));
    });
  }
  host.append(
    ctlRow(slider("시행 횟수", 200, 5000, 100, trials, F.n, (v) => { trials = v; }), btn("다시 돌리기", run), tP, tM),
    cv,
    note("비중 46.5 / 18.3 / 35.2%로 포트폴리오 수익률을 반복 생성해 음수 구간의 도수를 직접 셉니다. 붉은 막대가 손실 구간입니다. 자산 모수는 통합문서의 수익률 관측치에서 재추정한 값입니다."),
  );
  run();
};

/* ---- O18 샤프지수 ---- */
ENGINES.O18 = (host) => {
  const { mu, C } = covOf(EDATA.O16.rets.map((r) => r.slice(0, 3)));
  const cv = mkCanvas(host, 250);
  const tS = tile("최대 샤프지수"), tW = tile("그때 비중");
  let rf = 0.02, best = null, cloud = [];
  function pstat(w) {
    const m = w.reduce((s, wi, i) => s + wi * mu[i], 0);
    let v = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v += w[i] * w[j] * C[i][j];
    return { s: Math.sqrt(v), m, w };
  }
  function draw() {
    if (!cloud.length) return;
    const ys = cloud.map((p) => p.m);
    const f = frame(cv, {
      x0: 0, x1: Math.max(...cloud.map((p) => p.s)) * 1.08 || 1,
      y0: Math.min(rf, Math.min(...ys)) - 0.02, y1: Math.max(...ys) * 1.2 + 0.02,
      xfmt: (v) => F.pct(v, 1), yfmt: (v) => F.pct(v, 1), xlab: "위험 σ",
    });
    const s3 = f.t.s3, s1 = f.t.s1;
    cloud.forEach((p) => {
      const sr = (p.m - rf) / p.s;
      f.ctx.globalAlpha = 0.7;
      f.ctx.fillStyle = sr > (best ? (best.m - rf) / best.s * 0.85 : 0.5) ? s1 : s3;
      f.ctx.beginPath(); f.ctx.arc(f.px(p.s), f.py(p.m), 2.5, 0, 7); f.ctx.fill();
      f.ctx.globalAlpha = 1;
    });
    if (best) {
      line(f, [[0, rf], [best.s * 1.4, rf + (best.m - rf) * 1.4]], f.t.s2, 1.5, [5, 4]);
      dots(f, [[best.s, best.m]], f.t.s2, 7);
      tS.set(((best.m - rf) / best.s).toFixed(3));
      tW.set(best.w.map((w) => F.pct(w, 0)).join(" · "));
    }
  }
  function resample() {
    const rng = mulberry32(20240811); /* 시드 고정 — 통합문서와 같은 재현성 원칙 */
    cloud = []; best = null;
    runMC(host, 1500, 75, 75, () => {
      let w = [rng(), rng(), rng()];
      const s = w.reduce((a, b) => a + b, 0);
      const p = pstat(w.map((v) => v / s));
      cloud.push(p);
      if (!best || (p.m - rf) / p.s > (best.m - rf) / best.s) best = p;
      return 1;
    }, () => draw());
  }
  host.append(
    ctlRow(slider("무위험이자율", 0, 0.05, 0.0025, rf, (v) => F.pct(v, 2), (v) => { rf = v; best = null; cloud.forEach((p) => { if (!best || (p.m - rf) / p.s > (best.m - rf) / best.s) best = p; }); draw(); }), btn("재탐색 (시드 고정)", resample), tS, tW),
    cv,
    legendRow([[TK().s2, "샤프지수 최대점 · 자본배분선"], [TK().s3, "탐색된 조합"]]),
    note("점선이 무위험이자율에서 출발하는 자본배분선입니다. 무위험이자율을 움직이면 접점이 바뀝니다 — 목적함수가 분수라 통합문서에서도 진화 알고리즘을 썼고, 여기서도 시드를 고정해 재현성을 지켰습니다."),
  );
  resample();
};

/* ---- O19 수익률곡선 ---- */
ENGINES.O19 = (host) => {
  const d = EDATA.O19;
  /* 원자료 배열 끝의 null 패딩을 걷어낸다 — 그대로 그리면 (0,0)으로
     좌표화되어 화면 밖으로 선이 뻗는다 */
  const T = [], S = [];
  d.t.forEach((t, i) => { if (t != null && d.spot[i] != null) { T.push(t); S.push(d.spot[i]); } });
  const fwd = T.map((t, i) => {
    if (i === 0) return null;
    return Math.pow(Math.pow(1 + S[i], t) / Math.pow(1 + S[i - 1], T[i - 1]), 1 / (t - T[i - 1])) - 1;
  });
  const x0 = T[0], x1 = T[T.length - 1];
  const cv = mkCanvas(host, 240);
  function draw() {
    const f = frame(cv, { x0, x1, y0: 0.038, y1: 0.056, xfmt: (v) => v + "년", yfmt: (v) => F.pct(v, 1), xlab: "만기" });
    line(f, T.map((t, i) => [t, S[i]]), f.t.s1, 2);
    dots(f, T.map((t, i) => [t, S[i]]), f.t.s1, 4);
    const fp = T.map((t, i) => fwd[i] ? [t, fwd[i]] : null).filter(Boolean);
    line(f, fp, f.t.s2, 2, [6, 4]);
    dots(f, fp, f.t.s2, 4);
    cv.onmousemove = (ev) => {
      const r = cv.getBoundingClientRect();
      const x = x0 + (ev.clientX - r.left - f.padL) / f.W * (x1 - x0);
      const i = Math.max(0, Math.min(T.length - 1, Math.round(x) - 1));
      showTip(ev.clientX, ev.clientY,
        `만기 ${T[i]}년<br>현물 <b>${F.pct(S[i], 2)}</b>` + (fwd[i] ? `<br>선도 <b>${F.pct(fwd[i], 2)}</b>` : ""));
    };
    cv.onmouseleave = hideTip;
  }
  host.append(cv,
    legendRow([[TK().s1, "현물이자율"], [TK().s2, "선도이자율 (t-1→t)"]]),
    note("통합문서의 현물이자율 곡선에서 선도이자율을 브라우저에서 다시 역산했습니다. 우상향 현물곡선 위에서는 선도가 항상 현물보다 위에 섭니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O20 종이 재활용 ---- */
ENGINES.O20 = (host) => {
  const cv = mkCanvas(host, 220);
  function draw() {
    bars(cv, ["신문용지", "포장재", "인쇄용지"], [[500], [600], [300]], {
      valueLabels: true,
      colorFn: () => TK().s1,
    });
  }
  host.append(cv,
    note("제품별 요구 펄프량(톤). 원료 4종(신문지·혼합지·백상지·골판지)은 수율 70~90%와 단가가 제각각이라, 요구량을 채우는 가장 싼 배합을 선형계획으로 찾았습니다. 원료별 투입량 행렬은 옆 시트 슬라이드에 있습니다."));
  draw(); REDRAW.add(draw);
};

/* ---- O21 APT ---- */
ENGINES.O21 = (host) => {
  const d = EDATA.O21;
  const ret = (s) => s.slice(1).map((v, i) => v / s[i] - 1);
  const rx = ret(d.spx), ry = ret(d.lly);
  const fit = ols(rx, ry);
  const cv = mkCanvas(host, 250);
  const tB = tile("베타"), tA = tile("알파(일)"), tR = tile("R²");
  let mode = 0;
  function draw() {
    if (mode === 0) {
      const n = d.lly.length;
      const f = frame(cv, { x0: 0, x1: n - 1, y0: 70, y1: 135, xfmt: (v) => F.n(v) + "일", xlab: "거래일" });
      line(f, d.lly.map((v, i) => [i, v / d.lly[0] * 100]), f.t.s1, 2);
      line(f, d.spx.map((v, i) => [i, v / d.spx[0] * 100]), f.t.s2, 2);
      cv.onmousemove = (ev) => {
        const r = cv.getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left - f.padL) / f.W * (n - 1))));
        showTip(ev.clientX, ev.clientY, `${i}일째<br>LLY <b>${(d.lly[i] / d.lly[0] * 100).toFixed(1)}</b> · S&P500 <b>${(d.spx[i] / d.spx[0] * 100).toFixed(1)}</b>`);
      };
    } else {
      const f = frame(cv, { x0: -0.04, x1: 0.04, y0: -0.08, y1: 0.08, xfmt: (v) => F.pct(v, 0), yfmt: (v) => F.pct(v, 0), xlab: "시장 수익률" });
      dots(f, rx.map((x, i) => [x, ry[i]]), f.t.s3, 3);
      line(f, [[-0.04, fit.a + fit.b * -0.04], [0.04, fit.a + fit.b * 0.04]], f.t.s1, 2);
      cv.onmousemove = null;
    }
    cv.onmouseleave = hideTip;
    tB.set(fit.b.toFixed(4)); tA.set(fit.a.toExponential(2)); tR.set(fit.r2.toFixed(4));
  }
  host.append(
    ctlRow(seg(["가격 추이 (지수화 100)", "수익률 회귀"], 0, (i) => { mode = i; draw(); }), tB, tR),
    cv,
    legendRow([[TK().s1, "일라이 릴리 (LLY)"], [TK().s2, "S&P 500"]]),
    note("실제 1년치 주가 250 거래일 자료입니다. 수익률 회귀 탭에서 개별 종목 수익률을 시장 요인에 회귀하면 β 0.646, R² 0.076 — 시장만으로는 7.6%밖에 설명되지 않습니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- 공용: 다항분포 재고 MC (S01·S02·S04) ---- */
function newsvendor(host, cfg) {
  const cv = mkCanvas(host, 230);
  const cv2 = mkCanvas(host, 190);
  const tM = tile("평균 이윤"), tS = tile("표준편차"), tB = tile("기대이윤 최대 주문량");
  let q = cfg.q0, trials = 1000, fixSeed = cfg.fixSeed ?? false, stopA = null;
  const profit = (dm, qq) => {
    const sold = Math.min(dm, qq);
    return cfg.p * sold - cfg.c * qq + cfg.s * Math.max(qq - dm, 0);
  };
  const expProfit = (qq) => cfg.dist.reduce((s, [dm, pr]) => s + pr * profit(dm, qq), 0);
  function sampleD(u) {
    let cum = 0;
    for (const [dm, pr] of cfg.dist) { cum += pr; if (u <= cum + 1e-12) return dm; }
    return cfg.dist[cfg.dist.length - 1][0];
  }
  function drawCurve() {
    const qs = [], lo = cfg.qRange[0], hi = cfg.qRange[1];
    let bq = lo, bv = -Infinity;
    for (let x = lo; x <= hi; x += cfg.qStep) {
      const v = expProfit(x); qs.push([x, v]);
      if (v > bv) { bv = v; bq = x; }
    }
    const f = frame(cv2, {
      x0: lo, x1: hi, y0: Math.min(...qs.map((p) => p[1])) * 1.1, y1: bv * 1.15,
      xfmt: (v) => F.n(v), yfmt: (v) => F.n(v / cfg.unit) + cfg.unitLab, xlab: "주문량",
    });
    line(f, qs, f.t.s1, 2);
    dots(f, [[bq, bv]], f.t.s2, 6);
    vline(f, q, f.t.s3, "현재 " + F.n(q));
    tB.set(F.n(bq));
    cv2.onmousemove = (ev) => {
      const r = cv2.getBoundingClientRect();
      const x = lo + Math.round((ev.clientX - r.left - f.padL) / f.W * (hi - lo) / cfg.qStep) * cfg.qStep;
      if (x < lo || x > hi) { hideTip(); return; }
      showTip(ev.clientX, ev.clientY, `주문량 ${F.n(x)}<br>기대이윤 <b>${F.n(expProfit(x))}</b>`);
    };
    cv2.onmouseleave = hideTip;
  }
  function run() {
    if (stopA) stopA();
    const rng = mulberry32(fixSeed ? 20260811 : (Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, trials, 100, 200, () => {
      const v = profit(sampleD(rng()), q);
      acc.push(v); return v;
    }, (a) => {
      histo(cv, acc, {
        bins: 24, xfmt: (v) => F.n(v / cfg.unit) + cfg.unitLab,
        colorFn: (x) => x < 0 ? TK().red : TK().s1,
        marks: [{ x: mean(acc), label: "평균", color: TK().ink }],
      });
      tM.set(F.n(mean(acc))); tS.set(F.n(acc.length > 1 ? stdev(acc) : 0));
    });
  }
  const controls = [
    slider("주문량", cfg.qRange[0], cfg.qRange[1], cfg.qStep, q, F.n, (v) => { q = v; drawCurve(); run(); }),
    slider("시행 횟수", 200, 5000, 100, trials, F.n, (v) => { trials = v; }),
    btn("다시 돌리기", run),
  ];
  if (cfg.seedToggle) controls.push(seg(["난수 미고정", "난수 고정"], fixSeed ? 1 : 0, (i) => { fixSeed = i === 1; run(); }));
  host.append(ctlRow(...controls), cv, tileRow(tM, tS, tB), cv2, note(cfg.note));
  drawCurve(); run();
  REDRAW.add(drawCurve);
}

ENGINES.S01 = (host) => newsvendor(host, {
  p: 10000, c: 7500, s: 2500,
  dist: [[100, 0.30], [150, 0.20], [200, 0.30], [250, 0.15], [300, 0.05]],
  q0: 200, qRange: [100, 300], qStep: 50, unit: 10000, unitLab: "만",
  note: "구입 7,500 · 판매 10,000 · 반품 2,500의 통합문서 손익구조 그대로입니다. 위는 몬테카를로 이윤 분포(붉은색 = 손실), 아래는 모든 주문량의 기대이윤을 정확히 계산한 곡선 — 시뮬레이션이 이 곡선 주위를 흔들리며 수렴합니다.",
});
ENGINES.S02 = (host) => newsvendor(host, {
  p: 1500, c: 1000, s: 900,
  dist: [[20, 0.30], [25, 0.15], [30, 0.15], [35, 0.20], [40, 0.20]],
  q0: 30, qRange: [20, 40], qStep: 5, unit: 1, unitLab: "",
  seedToggle: true, fixSeed: false,
  note: "자동차 딜러 과제. '난수 고정'을 켜면 몇 번을 다시 돌려도 같은 분포가 나옵니다 — 통합문서에서 난수 고정판과 미고정판을 나란히 만든 이유(재현성 대 우연)를 그대로 체험할 수 있습니다.",
});
ENGINES.S04 = (host) => {
  /* 정규분포 수요 버전 */
  const cfg = { p: 10000, c: 7500, s: 2500, mu: 500, sd: 20 };
  const cv = mkCanvas(host, 230);
  const tM = tile("평균 이윤"), tP = tile("수요 530 이하 확률");
  let q = 500, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 2000, 150, 300, () => {
      const dm = Math.max(0, Math.round(cfg.mu + cfg.sd * normInv(rng())));
      const v = cfg.p * Math.min(dm, q) - cfg.c * q + cfg.s * Math.max(q - dm, 0);
      acc.push(v); return v;
    }, () => {
      histo(cv, acc, {
        bins: 30, xfmt: (v) => F.n(v / 10000) + "만",
        colorFn: (x) => x < 0 ? TK().red : TK().s1,
        marks: [{ x: mean(acc), label: "평균", color: TK().ink }],
      });
      tM.set(F.n(mean(acc)));
    });
    tP.set(F.pct(nCDF((530 - cfg.mu) / cfg.sd), 2));
  }
  host.append(
    ctlRow(slider("주문량", 440, 560, 5, q, F.n, (v) => { q = v; run(); }), btn("다시 돌리기", run)),
    cv, tileRow(tM, tP),
    note("수요를 N(500, 20)의 역함수로 생성해 같은 손익구조에 대입합니다. 다항분포와 달리 관측된 다섯 값 사이·바깥의 수요도 나옵니다 — 꼬리를 어떻게 보느냐가 주문량을 바꿉니다."),
  );
  run();
};

/* ---- S03 입찰 ---- */
ENGINES.S03 = (host) => {
  const cost = 1000, lo = 1000, hi = 3000, K = 4;
  const cv = mkCanvas(host, 230);
  const tW = tile("낙찰확률"), tE = tile("기대이윤"), tMC = tile("MC 평균이윤");
  let bid = 1100;
  function draw() {
    const f = frame(cv, { x0: 1000, x1: 2200, y0: 0, y1: 185, xfmt: (v) => F.n(v), yfmt: (v) => F.n(v), xlab: "입찰가 (만원)" });
    const pw = (b) => Math.pow((hi - b) / (hi - lo), K);
    const ep = [], wp = [];
    for (let b = 1000; b <= 2200; b += 10) { ep.push([b, (b - cost) * pw(b)]); }
    line(f, ep, f.t.s1, 2);
    /* 낙찰확률은 오른쪽 보조 없이 비율 스케일로 겹치지 않게 별도 표기 */
    vline(f, bid, f.t.s3, "현재 입찰가");
    let bx = 1000, bv = 0;
    ep.forEach(([b, v]) => { if (v > bv) { bv = v; bx = b; } });
    dots(f, [[bx, bv]], f.t.s2, 6);
    tW.set(F.pct(pw(bid), 1)); tE.set(F.n((bid - cost) * pw(bid), 1));
    /* MC 검증 */
    const rng = mulberry32((Math.random() * 1e9) | 0);
    let s = 0; const N = 3000;
    for (let i = 0; i < N; i++) {
      let minc = Infinity;
      for (let k = 0; k < K; k++) minc = Math.min(minc, lo + (hi - lo) * rng());
      s += bid < minc ? bid - cost : 0;
    }
    tMC.set(F.n(s / N, 1));
  }
  host.append(
    ctlRow(slider("PNU 입찰가", 1000, 2200, 10, bid, F.n, (v) => { bid = v; draw(); })),
    cv,
    legendRow([[TK().s1, "기대이윤 (해석적)"], [TK().s2, "기대이윤 최대점"]]),
    tileRow(tW, tE, tMC),
    note("경쟁자 4곳의 입찰가는 U(1,000, 3,000)입니다. 입찰가를 올리면 이윤 폭은 커지지만 네 곳 모두를 밑돌 확률이 4제곱으로 꺾입니다. MC 평균이윤 타일은 매번 3,000회 재추첨한 검증값입니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- S05 초과예약 ---- */
ENGINES.S05 = (host) => {
  const seats = 36, fare = 30, fixed = 100, varc = 10, comp = 60, pShow = 0.9;
  const cv = mkCanvas(host, 220);
  const cv2 = mkCanvas(host, 180);
  const tE = tile("기대이윤"), tB = tile("양보 발생 확률"), tOpt = tile("기대이윤 최대 예약");
  let book = 40;
  const pmf = (n, k) => {
    let logc = 0;
    for (let i = 0; i < k; i++) logc += Math.log(n - i) - Math.log(i + 1);
    return Math.exp(logc + k * Math.log(pShow) + (n - k) * Math.log(1 - pShow));
  };
  const profitAt = (n, k) => {
    const board = Math.min(k, seats), bump = Math.max(k - seats, 0);
    return board * fare - fixed - board * varc - bump * comp;
  };
  const eProfit = (n) => { let s = 0; for (let k = 0; k <= n; k++) s += pmf(n, k) * profitAt(n, k); return s; };
  const pBump = (n) => { let s = 0; for (let k = seats + 1; k <= n; k++) s += pmf(n, k); return s; };
  function draw() {
    /* 탑승자 수 분포 */
    const xs = [], probs = [];
    for (let k = Math.max(0, Math.floor(book * pShow) - 12); k <= book; k++) { xs.push(k); probs.push(pmf(book, k)); }
    const f = frame(cv, { x0: xs[0] - 0.5, x1: xs[xs.length - 1] + 0.5, y0: 0, y1: Math.max(...probs) * 1.15, xfmt: (v) => F.n(v), yfmt: (v) => F.pct(v, 0) });
    const bw = f.W / xs.length;
    xs.forEach((k, i) => {
      const x = f.px(k - 0.5) + 1, y = f.py(probs[i]);
      f.ctx.fillStyle = k > seats ? f.t.crit : f.t.s1;
      f.ctx.beginPath(); f.ctx.roundRect(x, y, Math.max(1, bw - 2), f.padT + f.H - y, [4, 4, 0, 0]); f.ctx.fill();
    });
    vline(f, seats + 0.5, f.t.ink, "좌석 36");
    /* 기대이윤 곡선 */
    const eps = [];
    let bq = 36, bv = -Infinity;
    for (let n = 36; n <= 46; n++) { const v = eProfit(n); eps.push([n, v]); if (v > bv) { bv = v; bq = n; } }
    const f2 = frame(cv2, { x0: 36, x1: 46, y0: Math.min(...eps.map((p) => p[1])) - 10, y1: bv + 15, xfmt: (v) => F.n(v), xlab: "예약 수" });
    line(f2, eps, f2.t.s1, 2);
    dots(f2, [[bq, bv]], f2.t.s2, 6);
    vline(f2, book, f2.t.s3, "현재");
    tE.set(F.n(eProfit(book), 1)); tB.set(F.pct(pBump(book), 2), pBump(book) > 0.2 ? "warn" : ""); tOpt.set(F.n(bq));
  }
  host.append(
    ctlRow(slider("예약 접수", 36, 46, 1, book, F.n, (v) => { book = v; draw(); })),
    cv, tileRow(tE, tB, tOpt), cv2,
    note("탑승 확률 90%의 이항분포입니다. 위 분포에서 붉은 막대가 좌석 36을 넘겨 보상금 60만원이 나가는 구간 — 예약을 늘릴수록 수입과 보상 위험이 맞교환됩니다. 아래 곡선이 예약 수별 기대이윤입니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- S06 프로젝트 수익성 ---- */
ENGINES.S06 = (host) => {
  const invest = 300000000, muS = 200000, sdS = 50000, price = 1300, vc = 700, r = 0.10, years = 3;
  const cv = mkCanvas(host, 230);
  const tM = tile("평균 NPV"), tNeg = tile("NPV<0 확률"), tX = tile("엑셀 기록 평균", "1,000회 시행 당시");
  tX.set(F.n(312017048));
  let stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 2000, 100, 250, () => {
      let npv = -invest;
      for (let t = 1; t <= years; t++) {
        const sales = Math.max(0, muS + sdS * normInv(rng()));
        npv += sales * (price - vc) / Math.pow(1 + r, t);
      }
      acc.push(npv); return npv;
    }, () => {
      histo(cv, acc, {
        bins: 32, xfmt: (v) => F.n(v / 1e8, 1) + "억",
        colorFn: (x) => x < 0 ? TK().red : TK().s1,
        marks: [{ x: mean(acc), label: "평균", color: TK().ink }],
      });
      tM.set(F.n(mean(acc)));
      tNeg.set(F.pct(acc.filter((v) => v < 0).length / acc.length, 1));
    });
  }
  host.append(
    ctlRow(btn("2,000회 다시 돌리기", run), tM, tNeg, tX),
    cv,
    note("투자 3억, 판매량 N(200,000, 50,000), 마진 600원, 할인율 10%로 NPV 분포를 다시 생성합니다. 단일 값이 아니라 분포가 목적입니다 — 평균이 양수여도 붉은 구간(음수 NPV)의 비중이 판단을 바꿉니다. 연차 구성이 통합문서와 달라 평균 수준은 기록값과 차이가 납니다."),
  );
  run();
};

/* ---- S07 삼각분포 ---- */
ENGINES.S07 = (host) => {
  const cv = mkCanvas(host, 230);
  const tM = tile("평균"), tS = tile("표준편차");
  let a = 25000, c = 40000, b = 45000, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 3000, 200, 400, () => {
      const v = triInv(a, c, b, rng()); acc.push(v); return v;
    }, () => {
      const f = histo(cv, acc, { bins: 36, lo: 20000, hi: 50000, xfmt: (v) => F.n(v / 1000) + "천" });
      if (f) {
        /* 이론 밀도 겹쳐 그리기 (도수 스케일) */
        const n = acc.length, binw = (50000 - 20000) / 36;
        const dens = (x) => x < a || x > b ? 0 : (x <= c ? 2 * (x - a) / ((b - a) * (c - a)) : 2 * (b - x) / ((b - a) * (b - c)));
        const pts = [];
        for (let x = 20000; x <= 50000; x += 250) pts.push([x, dens(x) * n * binw]);
        line(f, pts, f.t.s2, 2);
      }
      tM.set(F.n(mean(acc))); tS.set(F.n(stdev(acc)));
    });
  }
  host.append(
    ctlRow(
      slider("최소", 20000, 39000, 500, a, (v) => F.n(v / 1000) + "천", (v) => { a = Math.min(v, c - 500); run(); }),
      slider("최빈", 26000, 44000, 500, c, (v) => F.n(v / 1000) + "천", (v) => { c = Math.max(a + 500, Math.min(v, b - 500)); run(); }),
      slider("최대", 41000, 50000, 500, b, (v) => F.n(v / 1000) + "천", (v) => { b = Math.max(v, c + 500); run(); }),
    ),
    cv, tileRow(tM, tS),
    legendRow([[TK().s1, "생성된 판매량"], [TK().s2, "이론 밀도"]]),
    note("자료가 없어 최소·최빈·최대 세 값만 아는 상황의 분포입니다. 통합문서의 역함수 수식(IF+SQRT)을 그대로 옮겨 생성하며, 주황 곡선이 이론 밀도입니다. 기본값 25,000 / 40,000 / 45,000."),
  );
  run();
};

/* ---- S08 고객만족 점유율 ---- */
ENGINES.S08 = (host) => {
  const cv = mkCanvas(host, 250);
  const tA = tile("A 최종 고객"), tB = tile("B 최종"), tC = tile("C 최종");
  let pA = 0.05, pB = 0.15, pC = 0.15, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    let A = 100, B = 100, C = 100;
    const hist = [[A, B, C]];
    stopA = animate(host, () => {
      for (let s = 0; s < 2 && hist.length <= 52; s++) {
        const binom = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; };
        const dA = binom(A, pA), dB = binom(B, pB), dC = binom(C, pC);
        const ab = binom(dA, 0.5), ba = binom(dB, 0.5), ca = binom(dC, 0.5);
        A += ba + ca - dA; B += ab + (dC - ca) - dB; C += (dA - ab) + (dB - ba) - dC;
        hist.push([A, B, C]);
      }
      const f = frame(cv, { x0: 0, x1: 52, y0: 0, y1: 220, xfmt: (v) => F.n(v) + "주", xlab: "주차" });
      line(f, hist.map((h, i) => [i, h[0]]), f.t.s1, 2);
      line(f, hist.map((h, i) => [i, h[1]]), f.t.s2, 2);
      line(f, hist.map((h, i) => [i, h[2]]), f.t.s3, 2);
      const last = hist[hist.length - 1];
      tA.set(F.n(last[0])); tB.set(F.n(last[1])); tC.set(F.n(last[2]));
      if (hist.length > 52) return false;
    });
  }
  host.append(
    ctlRow(
      slider("A 불만족 확률", 0.01, 0.3, 0.01, pA, (v) => F.pct(v, 0), (v) => { pA = v; run(); }),
      slider("B 불만족", 0.01, 0.3, 0.01, pB, (v) => F.pct(v, 0), (v) => { pB = v; run(); }),
      slider("C 불만족", 0.01, 0.3, 0.01, pC, (v) => F.pct(v, 0), (v) => { pC = v; run(); }),
      btn("1년 다시 재생", run),
    ),
    cv,
    legendRow([[TK().s1, "브랜드 A"], [TK().s2, "브랜드 B"], [TK().s3, "브랜드 C"]]),
    tileRow(tA, tB, tC),
    note("각 300명이 매주 주스를 사고, 불만족한 고객은 다른 두 브랜드로 반반 갈아탑니다. 불만족 확률 5% 대 15%의 작은 차이가 52주 뒤 두 배 가까운 점유율 격차로 벌어집니다."),
  );
  run();
};

/* ---- S09 경쟁업체 진입 ---- */
ENGINES.S09 = (host) => {
  const init = 1000000, price = 2200;
  const cv = mkCanvas(host, 250);
  const tN = tile("평균 8년 누적매출"), tE = tile("평균 진입 수");
  let pEnter = 0.4, drop = 0.2, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const paths = [];
    let sumRev = 0, sumEnt = 0, runs = 0;
    stopA = animate(host, () => {
      for (let k = 0; k < 3 && paths.length < 60; k++) {
        let cust = init, share = triInv(0.20, 0.40, 0.70, rng()), entrants = 0;
        const p = [];
        let rev = 0;
        for (let y = 1; y <= 8; y++) {
          cust *= 1 + 0.05 + 0.01 * normInv(rng());
          if (entrants < 3 && rng() < pEnter) { entrants++; share *= (1 - drop); }
          const r = cust * share * price;
          rev += r; p.push([y, r / 1e8]);
        }
        paths.push(p); sumRev += rev; sumEnt += entrants; runs++;
      }
      const f = frame(cv, { x0: 1, x1: 8, y0: 0, y1: 18, xfmt: (v) => v + "년", yfmt: (v) => F.n(v) + "억", xlab: "연차" });
      paths.forEach((p, i) => {
        f.ctx.globalAlpha = 0.25;
        line(f, p, f.t.s1, 1.5);
        f.ctx.globalAlpha = 1;
      });
      if (runs) { tN.set(F.n(sumRev / runs / 1e8, 1) + "억"); tE.set((sumEnt / runs).toFixed(2) + "곳"); }
      if (paths.length >= 60) return false;
    });
  }
  host.append(
    ctlRow(
      slider("연간 진입 확률", 0.1, 0.8, 0.05, pEnter, (v) => F.pct(v, 0), (v) => { pEnter = v; run(); }),
      slider("진입당 점유율 하락", 0.05, 0.4, 0.05, drop, (v) => F.pct(v, 0), (v) => { drop = v; run(); }),
      btn("경로 60개 재생", run),
    ),
    cv, tileRow(tN, tE),
    note("시장 100만 명 · 성장 N(5%, 1%) · 초기 점유율 삼각(20, 40, 70%) · 최대 3곳 진입. 언제 몇 곳이 들어오느냐에 따라 매출 경로가 계단식으로 꺾입니다 — 부채꼴로 퍼지는 60개 경로가 그 불확실성입니다."),
  );
  run();
};

/* ---- 공용 GBM 경로 엔진 (S10·S11) ---- */
function gbmPaths(host, cfg) {
  const cv = mkCanvas(host, 260);
  const tT = tile("기말 평균"), tV = tile(cfg.varLabel || "5% VaR (기말)");
  let mu = cfg.mu, sig = cfg.sig, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const N = cfg.days, S0 = cfg.S0;
    const paths = [], finals = [];
    stopA = animate(host, () => {
      for (let k = 0; k < 4 && paths.length < cfg.nPaths; k++) {
        const p = [[0, S0]];
        let s = S0;
        for (let t2 = 1; t2 <= N; t2++) {
          s *= Math.exp((mu - sig * sig / 2) / 252 + sig * Math.sqrt(1 / 252) * normInv(rng()));
          p.push([t2, s]);
        }
        paths.push(p); finals.push(s);
      }
      const ymax = S0 * Math.exp(mu * N / 252 + 2.6 * sig * Math.sqrt(N / 252));
      const ymin = S0 * Math.exp(mu * N / 252 - 2.8 * sig * Math.sqrt(N / 252));
      const f = frame(cv, { x0: 0, x1: N, y0: ymin, y1: ymax, xfmt: (v) => F.n(v) + "일", yfmt: cfg.yfmt || ((v) => F.n(v)), xlab: "거래일" });
      /* 해석적 5·50·95% 밴드 */
      const band = (q2) => {
        const z = normInv(q2), pts = [];
        for (let t2 = 0; t2 <= N; t2 += Math.max(1, N / 60)) pts.push([t2, S0 * Math.exp((mu - sig * sig / 2) * t2 / 252 + z * sig * Math.sqrt(t2 / 252))]);
        return pts;
      };
      line(f, band(0.05), f.t.s2, 1.5, [5, 4]);
      line(f, band(0.5), f.t.s2, 1.5);
      line(f, band(0.95), f.t.s2, 1.5, [5, 4]);
      paths.forEach((p) => { f.ctx.globalAlpha = 0.3; line(f, p, f.t.s1, 1.2); f.ctx.globalAlpha = 1; });
      if (finals.length > 3) {
        const sorted = finals.slice().sort((a, b) => a - b);
        tT.set((cfg.yfmt || F.n)(mean(finals)));
        tV.set((cfg.yfmt || F.n)(S0 - quantile(sorted, 0.05)));
      }
      if (paths.length >= cfg.nPaths) return false;
    });
  }
  host.append(
    ctlRow(
      slider("연 수익률 μ", -0.1, 0.3, 0.01, mu, (v) => F.pct(v, 0), (v) => { mu = v; run(); }),
      slider("연 변동성 σ", 0.05, 0.6, 0.01, sig, (v) => F.pct(v, 0), (v) => { sig = v; run(); }),
      btn("경로 재생", run),
    ),
    cv,
    legendRow([[TK().s1, "표본 경로"], [TK().s2, "5·50·95% 이론 밴드"]]),
    tileRow(tT, tV),
    note(cfg.note),
  );
  run();
}
ENGINES.S10 = (host) => gbmPaths(host, {
  S0: 2000, mu: 0.10, sig: 0.2059, days: 100, nPaths: 60,
  note: "기준주가 2,000 · μ 10% · σ 20.59% — 통합문서 모수 그대로의 기하브라운운동입니다. 표본 경로는 흔들리지만 이론 분위 밴드(주황) 안에 5~95%가 담깁니다. VaR 타일은 100일 후 하위 5% 기말주가 기준 손실입니다.",
});
ENGINES.S11 = (host) => gbmPaths(host, {
  S0: 2000, mu: 0.10, sig: 0.2059, days: 252, nPaths: 60, varLabel: "5% VaR (1년)",
  note: "같은 모형을 1년(252일)로 늘린 예측판입니다. 과거 자료로 μ·σ를 추정한 뒤, 예측 분포가 과거 관측과 맞물리는지 검증하는 것이 통합문서의 절차였습니다 — 슬라이더로 모수 추정이 달라졌을 때의 영향을 볼 수 있습니다.",
});

/* ---- S12 상관관계 VaR ---- */
ENGINES.S12 = (host) => {
  const w = [0.3, 0.3, 0.4], mu = [0.15, 0.10, 0.25], sig = [0.20, 0.12, 0.40];
  const corr = [[1, 0.8, 0.7], [0.8, 1, 0.75], [0.7, 0.75, 1]];
  /* 촐레스키 */
  const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) {
    let s = corr[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
  }
  const cv = mkCanvas(host, 230);
  const tV = tile("5% VaR"), tS = tile("포트폴리오 σ"), tC = tile("상관");
  let useCorr = true, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 3000, 200, 400, () => {
      const z = [normInv(rng()), normInv(rng()), normInv(rng())];
      const e = useCorr ? [
        L[0][0] * z[0],
        L[1][0] * z[0] + L[1][1] * z[1],
        L[2][0] * z[0] + L[2][1] * z[1] + L[2][2] * z[2],
      ] : z;
      let v = 0;
      for (let i = 0; i < 3; i++) v += w[i] * Math.exp((mu[i] - sig[i] * sig[i] / 2) + sig[i] * e[i]);
      acc.push(v); return v;
    }, () => {
      const sorted = acc.slice().sort((a, b) => a - b);
      const q5 = quantile(sorted, 0.05);
      histo(cv, acc, {
        bins: 36, xfmt: (v) => v.toFixed(2),
        colorFn: (x) => x < q5 ? TK().red : TK().s1,
        marks: [{ x: q5, label: "5% 분위", color: TK().crit }, { x: 1, label: "원금 1", color: TK().ink }],
      });
      tV.set((1 - q5 > 0 ? "" : "+") + F.pct(Math.abs(1 - q5), 2));
      tS.set(F.pct(stdev(acc), 2));
      tC.set(useCorr ? "고려 (촐레스키)" : "무시 (독립)");
    });
  }
  host.append(
    ctlRow(seg(["상관 고려", "상관 무시"], 0, (i) => { useCorr = i === 0; run(); }), btn("다시 돌리기", run)),
    cv, tileRow(tV, tS, tC),
    note("상관 0.7~0.8의 세 종목(비중 30/30/40%)입니다. 상관을 무시하면 분산효과가 과대평가되어 VaR이 작아 보입니다 — 토글해서 꼬리(붉은 구간)가 얼마나 두꺼워지는지 비교해 보세요. 난수 생성 단계에 촐레스키 분해를 심는 통합문서 구조 그대로입니다."),
  );
  run();
};

/* ---- 공용 블랙숄즈 패널 (S13·S22) ---- */
function bsPanel(host, cfg) {
  const cv = mkCanvas(host, 240);
  const tC = tile("콜 가격"), tP = tile("풋 가격"), tD = tile("d1 / N(d1)");
  let S = cfg.S, sig = cfg.sig;
  function draw() {
    const r0 = bs(S, cfg.K, cfg.r, sig, cfg.T);
    const x0 = cfg.K * 0.5, x1 = cfg.K * 1.6;
    const f = frame(cv, { x0, x1, y0: -cfg.K * 0.06, y1: cfg.K * 0.65, xfmt: cfg.fmt, yfmt: cfg.fmt, xlab: "기초자산 가격" });
    const now = [], pay = [];
    for (let s2 = x0; s2 <= x1; s2 += (x1 - x0) / 90) {
      now.push([s2, bs(s2, cfg.K, cfg.r, sig, cfg.T).call]);
      pay.push([s2, Math.max(s2 - cfg.K, 0)]);
    }
    line(f, pay, f.t.mut, 1.5, [5, 4]);
    line(f, now, f.t.s1, 2);
    vline(f, cfg.K, f.t.ink, "행사가 " + cfg.fmt(cfg.K));
    dots(f, [[S, r0.call]], f.t.s2, 6);
    tC.set(cfg.fmt(r0.call)); tP.set(cfg.fmt(r0.put));
    tD.set(r0.d1.toFixed(4) + " / " + r0.Nd1.toFixed(4));
  }
  host.append(
    ctlRow(
      slider("기초자산 가격", cfg.K * 0.6, cfg.K * 1.5, cfg.K / 200, S, cfg.fmt, (v) => { S = v; draw(); }),
      slider("변동성 σ", 0.05, 0.9, 0.005, sig, (v) => F.pct(v, 1), (v) => { sig = v; draw(); }),
    ),
    cv,
    legendRow([[TK().s1, "만기 전 콜 가치"], [TK().mut, "만기 손익 (내재가치)"]]),
    tileRow(tC, tP, tD),
    note(cfg.note),
  );
  draw(); REDRAW.add(draw);
}
ENGINES.S13 = (host) => bsPanel(host, {
  S: 94.12, K: 80, r: 0.055, T: 0.5, sig: 0.4831, fmt: (v) => v.toFixed(2),
  note: "통합문서 모수(S 94.12 · K 80 · r 5.5% · T 0.5) 그대로입니다. 시장 풋가격 5.25에서 내재변동성 48.31%를 역산한 것이 원 과제 — σ 슬라이더를 움직여 풋 가격이 5.25가 되는 지점을 직접 찾아보면 그 역산을 체험할 수 있습니다.",
});
ENGINES.S22 = (host) => bsPanel(host, {
  S: 53700, K: 55000, r: 0.028, T: 0.25, sig: 0.32, fmt: (v) => F.n(v),
  note: "같은 블랙숄즈 판을 삼성전자 실자료(S 53,700 · K 55,000 · T 0.25년 · σ 32%)로 다시 돌린 판입니다. 이론가 콜 3,014 · 풋 3,931 — 공식 경로와 시뮬레이션 경로가 일치하는지 확인하는 것이 과제의 목적이었습니다.",
});

/* ---- S14 옵션의 헤지 효과 ---- */
ENGINES.S14 = (host) => {
  const S0 = 56, mu = 0.12, sig = 0.30, r = 0.08, T = 1;
  const cv = mkCanvas(host, 230);
  const tM = tile("평균 수익률"), tS = tile("표준편차"), tW = tile("최악 5%");
  let K = 50, mode = 0, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const putP = bs(S0, K, r, sig, T).put;
    const acc = [];
    stopA = runMC(host, 3000, 200, 400, () => {
      const ST = S0 * Math.exp((mu - sig * sig / 2) * T + sig * normInv(rng()));
      let ret;
      if (mode === 0) ret = ST / S0 - 1;
      else ret = (ST + Math.max(K - ST, 0)) / (S0 + putP) - 1;
      acc.push(ret); return ret;
    }, () => {
      const sorted = acc.slice().sort((a, b) => a - b);
      histo(cv, acc, {
        bins: 36, lo: -0.7, hi: 1.2, xfmt: (v) => F.pct(v, 0),
        colorFn: (x) => x < 0 ? TK().red : TK().s1,
      });
      tM.set(F.pct(mean(acc), 2)); tS.set(F.pct(stdev(acc), 2));
      tW.set(F.pct(quantile(sorted, 0.05), 2));
    });
  }
  host.append(
    ctlRow(
      seg(["주식만 보유", "주식 + 방어 풋"], 0, (i) => { mode = i; run(); }),
      slider("풋 행사가", 40, 60, 1, K, F.n, (v) => { K = v; run(); }),
    ),
    cv, tileRow(tM, tS, tW),
    note("1년 뒤 수익률 분포입니다. 풋을 얹으면 왼쪽 꼬리가 행사가에서 잘려나가는 대신 프리미엄만큼 평균이 내려갑니다 — 통합문서에서 콜·풋 포트폴리오를 나란히 만들어 비교한 구조의 재현입니다(모수는 같은 교재 계열의 S 56 · σ 30%)."),
  );
  run();
};

/* ---- S15 나비형 스프레드 ---- */
ENGINES.S15 = (host) => {
  const S0 = 56, mu = 0.12, sig = 0.30, r = 0.08, T = 1;
  const K = [40, 50, 60];
  const prem = K.map((k) => bs(S0, k, r, sig, T).call);
  const cv = mkCanvas(host, 240);
  const tP = tile("현재 순비용"), tE = tile("MC 평균 손익");
  let buy = true;
  function payoff(ST) {
    const v = Math.max(ST - K[0], 0) - 2 * Math.max(ST - K[1], 0) + Math.max(ST - K[2], 0);
    const cost = prem[0] - 2 * prem[1] + prem[2];
    const pl = v - cost * Math.exp(r * T);
    return buy ? pl : -pl;
  }
  function draw() {
    const f = frame(cv, { x0: 20, x1: 95, y0: -14, y1: 14, xfmt: (v) => F.n(v), xlab: "만기 주가" });
    line(f, [[20, 0], [95, 0]], f.t.base, 1);
    const pts = [];
    for (let s2 = 20; s2 <= 95; s2 += 0.5) pts.push([s2, payoff(s2)]);
    line(f, pts, f.t.s1, 2);
    K.forEach((k) => vline(f, k, f.t.mut, String(k)));
    /* MC 기말가 3,000회 */
    const rng = mulberry32(7);
    let s = 0;
    for (let i = 0; i < 3000; i++) s += payoff(S0 * Math.exp((mu - sig * sig / 2) * T + sig * normInv(rng())));
    const cost = prem[0] - 2 * prem[1] + prem[2];
    tP.set((buy ? cost : -cost).toFixed(2));
    tE.set((s / 3000).toFixed(2));
    cv.onmousemove = (ev) => {
      const rc = cv.getBoundingClientRect();
      const x = 20 + (ev.clientX - rc.left - f.padL) / f.W * 75;
      if (x < 20 || x > 95) { hideTip(); return; }
      showTip(ev.clientX, ev.clientY, `만기 주가 ${x.toFixed(0)}<br>손익 <b>${payoff(x).toFixed(2)}</b>`);
    };
    cv.onmouseleave = hideTip;
  }
  host.append(
    ctlRow(seg(["나비형 매입", "나비형 발행"], 0, (i) => { buy = i === 0; draw(); }), tP, tE),
    cv,
    note("행사가 40/50/60 콜을 1·-2·1로 조합한 포지션입니다. 매입은 주가가 50 부근 좁은 구간에 머물 때 이익, 발행은 그 반대 — 토글로 손익 산이 뒤집힙니다. 프리미엄은 블랙숄즈 이론가로 계산했습니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- S16 이색옵션 ---- */
ENGINES.S16 = (host) => {
  const S0 = 14, K = 20, sig = 0.20, r = 0.08, T = 0.5, B = 17;
  const cv = mkCanvas(host, 250);
  const tV = tile("옵션가치 (MC)"), tK = tile("배리어 접촉 비율");
  let mode = 0, stopA = null; /* 0 녹아웃, 1 녹인, 2 아시안 */
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const N = 26, paths = [];
    let sumPay = 0, hitCnt = 0, runs = 0;
    stopA = animate(host, () => {
      for (let k = 0; k < 4 && paths.length < 50; k++) {
        const p = [[0, S0]];
        let s = S0, hit = false, sum = S0;
        for (let t2 = 1; t2 <= N; t2++) {
          s *= Math.exp((r - sig * sig / 2) * T / N + sig * Math.sqrt(T / N) * normInv(rng()));
          if (s >= B) hit = true;
          sum += s; p.push([t2, s]);
        }
        let pay;
        if (mode === 0) pay = hit ? 0 : Math.max(s - K, 0);
        else if (mode === 1) pay = hit ? Math.max(s - K, 0) : 0;
        else pay = Math.max(sum / (N + 1) - K, 0);
        sumPay += pay * Math.exp(-r * T); if (hit) hitCnt++; runs++;
        p.hit = hit;
        paths.push(p);
      }
      const f = frame(cv, { x0: 0, x1: 26, y0: 8, y1: 24, xfmt: (v) => F.n(v) + "주", xlab: "주차" });
      line(f, [[0, B], [26, B]], f.t.crit, 1.5, [6, 4]);
      f.ctx.fillStyle = f.t.crit; f.ctx.font = "10.5px system-ui,sans-serif"; f.ctx.textAlign = "left"; f.ctx.textBaseline = "bottom";
      f.ctx.fillText("배리어 17", f.padL + 4, f.py(B) - 3);
      line(f, [[0, K], [26, K]], f.t.ink, 1, [2, 3]);
      f.ctx.fillStyle = f.t.mut; f.ctx.fillText("행사가 20", f.padL + 4, f.py(K) - 3);
      paths.forEach((p) => {
        f.ctx.globalAlpha = p.hit ? (mode === 1 ? 0.55 : 0.18) : (mode === 1 ? 0.18 : 0.55);
        line(f, p, p.hit ? f.t.s2 : f.t.s1, 1.3);
        f.ctx.globalAlpha = 1;
      });
      tV.set((sumPay / runs).toFixed(3)); tK.set(F.pct(hitCnt / runs, 1));
      if (paths.length >= 50) return false;
    });
  }
  host.append(
    ctlRow(seg(["녹아웃 (배리어 닿으면 소멸)", "녹인 (닿아야 발효)", "아시안 (경로 평균)"], 0, (i) => { mode = i; run(); }), btn("경로 재생", run)),
    cv,
    legendRow([[TK().s2, "배리어에 닿은 경로"], [TK().s1, "닿지 않은 경로"]]),
    tileRow(tV, tK),
    note("만기 하루가 아니라 경로 전체가 값을 정하는 옵션입니다. 녹아웃에서는 주황(배리어 접촉) 경로가 전부 무효가 되고, 녹인에서는 그 경로만 살아납니다. 모수는 통합문서의 종목 1(S 14 · K 20 · 배리어 17 · σ 20%)입니다."),
  );
  run();
};

/* ---- S17 환율선물 ---- */
ENGINES.S17 = (host) => {
  const cv = mkCanvas(host, 230);
  const tF = tile("선도가격"), tEx1 = tile("예제 1 (상품)"), tEx2 = tile("예제 2 (통화)");
  let S = 1000, rd = 0.06, rf = 0.08;
  tEx1.set("110.52"); tEx2.set("923.12");
  function draw() {
    const f = frame(cv, { x0: 0, x1: 5, y0: 700, y1: 1300, xfmt: (v) => v + "년", xlab: "만기 T" });
    const pts = [];
    for (let T = 0; T <= 5; T += 0.1) pts.push([T, S * Math.exp((rd - rf) * T)]);
    line(f, [[0, S], [5, S]], f.t.mut, 1.5, [4, 4]);
    line(f, pts, f.t.s1, 2);
    const F4 = S * Math.exp((rd - rf) * 4);
    dots(f, [[4, F4]], f.t.s2, 6);
    tF.set(F.n(F4, 1) + " (T=4)");
    cv.onmousemove = (ev) => {
      const r = cv.getBoundingClientRect();
      const T = (ev.clientX - r.left - f.padL) / f.W * 5;
      if (T < 0 || T > 5) { hideTip(); return; }
      showTip(ev.clientX, ev.clientY, `T = ${T.toFixed(1)}년<br>선도가격 <b>${F.n(S * Math.exp((rd - rf) * T), 1)}</b>`);
    };
    cv.onmouseleave = hideTip;
  }
  host.append(
    ctlRow(
      slider("국내금리", 0, 0.12, 0.005, rd, (v) => F.pct(v, 1), (v) => { rd = v; draw(); }),
      slider("해외금리", 0, 0.12, 0.005, rf, (v) => F.pct(v, 1), (v) => { rf = v; draw(); }),
    ),
    cv, tileRow(tF, tEx1, tEx2),
    note("통화 선도가격 F = S·e^(국내금리-해외금리)T. 해외금리가 국내보다 높으면 곡선이 현물(점선) 아래로 내려갑니다 — 예제 2(₩1,000/$, 4년)의 923.12가 그 경우입니다. 금리 차익거래가 이 선을 강제합니다."),
  );
  draw(); REDRAW.add(draw);
};

/* ---- S18 상품선물 헤지 ---- */
ENGINES.S18 = (host) => {
  const S0 = 0.42, mu = 0.08, sig = 0.30, T = 0.5, F0 = 0.4377, qty = 500000;
  const cv = mkCanvas(host, 230);
  const tU = tile("평균 총비용"), tS = tile("비용 표준편차");
  let hr = 1, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 3000, 200, 400, () => {
      const ST = S0 * Math.exp((mu - sig * sig / 2) * T + sig * Math.sqrt(T) * normInv(rng()));
      const cost = qty * ST - hr * qty * (ST - F0); /* 만기 선물가 = 현물가로 수렴 */
      acc.push(cost / 1000); return cost;
    }, () => {
      /* 헤지 100%면 분포가 한 점에 수렴해 축 범위가 좁아진다 —
         범위에 맞춰 소수 자릿수를 올려 눈금이 같은 값으로 보이지 않게 */
      let lo = acc[0], hi2 = acc[0];
      acc.forEach(v => { if (v < lo) lo = v; if (v > hi2) hi2 = v; });
      const dd = hi2 - lo < 0.5 ? 2 : hi2 - lo < 5 ? 1 : 0;
      histo(cv, acc, {
        bins: 36, xfmt: (v) => F.n(v, dd) + "천$",
        color: TK().s1,
        marks: [{ x: qty * F0 / 1000, label: "선물가 고정 시", color: TK().ink }],
      });
      tU.set(F.n(mean(acc), 1) + "천$"); tS.set(F.n(acc.length > 1 ? stdev(acc) : 0, 1) + "천$");
    });
  }
  host.append(
    ctlRow(slider("헤지 비율", 0, 1, 0.05, hr, (v) => F.pct(v, 0), (v) => { hr = v; run(); }), btn("다시 돌리기", run)),
    cv, tileRow(tU, tS),
    note("6개월 뒤 석유 50만 갤런을 사야 하는 기업입니다. 헤지 0%면 비용 분포가 넓게 퍼지고, 100%면 선물가격 0.4377에 사실상 고정됩니다 — 슬라이더로 분포가 한 점으로 수렴하는 과정을 보세요."),
  );
  run();
};

/* ---- 공용 통화옵션 헤지 (S19·S23) ---- */
function fxHedge(host, cfg) {
  const cv = mkCanvas(host, 230);
  const g = bs(cfg.S, cfg.K, cfg.rd, cfg.sig, cfg.T, cfg.rf);
  const tC = tile("콜 가격"), tP = tile("풋 가격"), tW = tile("최악 5% 수취액");
  tC.set(cfg.fmt(g.call)); tP.set(cfg.fmt(g.put));
  let hedge = true, stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const acc = [];
    stopA = runMC(host, 3000, 200, 400, () => {
      const ST = cfg.S * Math.exp((cfg.rd - cfg.rf - cfg.sig * cfg.sig / 2) * cfg.T + cfg.sig * Math.sqrt(cfg.T) * normInv(rng()));
      let recv = cfg.pay * ST;
      if (hedge) recv += cfg.pay * (Math.max(cfg.K - ST, 0) - g.put * Math.exp(cfg.rd * cfg.T));
      acc.push(recv / cfg.unit); return recv;
    }, () => {
      const sorted = acc.slice().sort((a, b) => a - b);
      histo(cv, acc, {
        bins: 36, xfmt: (v) => F.n(v, 1) + cfg.unitLab,
        colorFn: (x) => x < cfg.pay * cfg.K / cfg.unit ? TK().red : TK().s1,
        marks: [{ x: cfg.pay * cfg.K / cfg.unit, label: "행사가 하한", color: TK().ink }],
      });
      tW.set(F.n(quantile(sorted, 0.05), 1) + cfg.unitLab);
    });
  }
  host.append(
    ctlRow(seg(["풋 헤지", "무헤지"], 0, (i) => { hedge = i === 0; run(); }), btn("다시 돌리기", run)),
    cv, tileRow(tC, tP, tW),
    note(cfg.note),
  );
  run();
}
ENGINES.S19 = (host) => fxHedge(host, {
  S: 0.5445, K: 0.53, rd: 0.051, rf: 0.026, sig: 0.0986, T: 0.1425, pay: 500000,
  unit: 1000, unitLab: "천$", fmt: (v) => (v * 100).toFixed(2) + "¢",
  note: "외화 50만 단위를 받을 예정인 기업이 행사가 0.53의 풋을 같은 수량 사서 하한을 만듭니다. 행사가를 현물보다 2.7% 아래로 잡아 프리미엄(0.23¢)을 아꼈고, 그 구간의 손실은 스스로 떠안습니다 — 무헤지와 토글해 왼쪽 꼬리를 비교해 보세요.",
});
ENGINES.S23 = (host) => fxHedge(host, {
  S: 0.000694, K: 0.000676, rd: 0.03625, rf: 0.025, sig: 0.10, T: 0.24932, pay: 1000000000,
  unit: 1000, unitLab: "천$", fmt: (v) => (v * 1e6).toFixed(3) + "μ$",
  note: "같은 구조를 원화 기준으로 다시 구성한 판입니다. ₩10억 수취 예정, 현물 $0.000694/₩(약 ₩1,441/$), 국내 금리 환경(달러금리 3.625% · 원화금리 2.5%)을 반영한 가먼-콜하겐 가격입니다.",
});

/* ---- 공용 델타헤지 (S20·S21) ---- */
function deltaHedge(host, cfg) {
  const cv = mkCanvas(host, 220);
  const cv2 = mkCanvas(host, 170);
  const tD = tile("현재 델타"), tC = tile("누적 헤지비용"), tPL = tile("총 손익");
  let stopA = null;
  function run() {
    if (stopA) stopA();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const N = 20;
    let s = cfg.S, cum = 0, shares = 0, week = 0;
    const sPath = [[0, s]], dPath = [], cPath = [[0, 0]];
    const delta = (ss, wk) => {
      const tt = (N - wk) / 52;
      if (tt <= 0) return ss > cfg.K ? 1 : 0;
      return nCDF((Math.log(ss / cfg.K) + (cfg.r + 0.5 * cfg.sig ** 2) * tt) / (cfg.sig * Math.sqrt(tt)));
    };
    stopA = animate(host, () => {
      if (week > N) return false;
      const d = delta(s, week);
      const buy = (d - (shares / cfg.n)) * cfg.n;
      cum += week ? cum * cfg.r / 52 : 0; /* 직전 누적비용에 주당 이자 */
      cum += buy * s;
      shares = d * cfg.n;
      dPath.push([week, d]); cPath.push([week, cum]);
      const f = frame(cv, { x0: 0, x1: N, y0: cfg.S * 0.7, y1: cfg.S * 1.3, xfmt: (v) => v + "주", yfmt: (v) => F.n(v), xlab: "주차" });
      line(f, [[0, cfg.K], [N, cfg.K]], f.t.mut, 1.5, [5, 4]);
      f.ctx.fillStyle = f.t.mut; f.ctx.font = "10.5px system-ui,sans-serif"; f.ctx.textAlign = "left"; f.ctx.textBaseline = "bottom";
      f.ctx.fillText("행사가 " + F.n(cfg.K), f.padL + 4, f.py(cfg.K) - 2);
      line(f, sPath, f.t.s1, 2);
      const f2 = frame(cv2, { x0: 0, x1: N, y0: 0, y1: 1, xfmt: (v) => v + "주", yfmt: (v) => F.pct(v, 0) });
      line(f2, dPath, f2.t.s2, 2);
      tD.set(F.pct(d, 1)); tC.set(F.n(cum));
      if (week === N) {
        const exercised = s > cfg.K;
        const final = cfg.prem + (exercised ? cfg.K * cfg.n : 0) - cum + (exercised ? 0 : shares * s);
        tPL.set(F.n(final), final < 0 ? "warn" : "");
        return false;
      }
      week++;
      s *= Math.exp((cfg.mu - cfg.sig ** 2 / 2) / 52 + cfg.sig * Math.sqrt(1 / 52) * normInv(rng()));
      sPath.push([week, s]);
    });
  }
  host.append(
    ctlRow(btn("20주 헤지 재생", run), tD, tC, tPL),
    cv,
    legendRow([[TK().s1, "주가 경로"], [TK().s2, "델타 (아래 차트)"]]),
    cv2,
    note(cfg.note),
  );
  run();
}
ENGINES.S20 = (host) => deltaHedge(host, {
  n: 100000, S: 49, K: 50, r: 0.035, sig: 0.20, mu: 0.13, prem: 300000,
  note: "콜 10만 계약을 판 쪽의 20주 델타헤지입니다. 주가가 행사가 50에 다가서면 델타가 치솟아 주식을 사들이고, 멀어지면 되팝니다 — 재생할 때마다 다른 경로에서 헤지비용이 어떻게 달라지는지 보세요. 모수는 통합문서 그대로(S 49 · σ 20% · r 3.5%)입니다.",
});
ENGINES.S21 = (host) => deltaHedge(host, {
  n: 100000, S: 333000, K: 340000, r: 0.0374, sig: 0.40, mu: 0.15, prem: 3191586468,
  note: "같은 헤지를 삼성전자 실제 변동성(σ 40%)으로 다시 돌린 판입니다. 교과 조건(σ 20%)보다 델타가 훨씬 크게 출렁여 리밸런싱 비용이 커집니다 — 변동성이 헤지 비용의 가격표임을 보여주는 과제였습니다.",
});

/* ============ 헤더 배경 애니메이션 ============ */
function initHero(canvas) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rng = mulberry32(20260811);
  const paths = Array.from({ length: 7 }, (_, i) => ({ v: 0.5, hist: [], seed: mulberry32(i * 977 + 13) }));
  function step() {
    if (!canvas.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) { requestAnimationFrame(step); return; }
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const t = TK();
    paths.forEach((p, i) => {
      p.v += (p.seed() - 0.5) * 0.06;
      p.v = Math.max(0.05, Math.min(0.95, p.v));
      p.hist.push(p.v);
      if (p.hist.length > 160) p.hist.shift();
      c.strokeStyle = i % 2 ? t.s2 : t.s1;
      c.globalAlpha = 0.13;
      c.lineWidth = 1.5;
      c.beginPath();
      p.hist.forEach((v, j) => {
        const x = w - (p.hist.length - j) * (w / 160), y = h * (1 - v);
        j ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.stroke();
      c.globalAlpha = 1;
    });
    setTimeout(() => requestAnimationFrame(step), 90);
  }
  requestAnimationFrame(step);
}
