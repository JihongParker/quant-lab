/* 한눈에 보기 — 카드를 열면 목적 → 핵심 발상 → 결과가 자동 순환하는 캐러셀.
   배경은 WebGL 프래그먼트 셰이더가 실시간으로 그리는 이리데선트 유체 그라디언트
   (정적 에셋 없음, 도메인 워프로 계속 모핑), 그 위에 모형 계열별 통계 도형을
   흰 발광 잉크로 얹는다. engines.js의 mulberry32, normInv를 재사용하므로
   반드시 engines.js 뒤에 로드한다. */

(() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const SLIDE_MS = 4800, HOLD_MS = 8500, ENTER_MS = 950, FADE_MS = 700;

  /* ---------- 소도구 ---------- */
  const E = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  function rgba(hex, a) {
    hex = (hex || "#fff").trim();
    if (hex[0] !== "#") return hex;
    let r, g, b;
    if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
    else { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
    return `rgba(${r},${g},${b},${a})`;
  }
  function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pline(ctx, pts, color, w = 2, dash) {
    if (pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  function dot(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function glow(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  /* ---------- 유체 그라디언트 렌더러 (오프스크린 WebGL 1개 공유) ---------- */
  const FX = (() => {
    const W = 720, H = 300;
    let cv, gl, prog, U = {}, ok = null;
    const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
    const FS = `precision mediump float;
uniform vec2 uR;uniform float uT,uSeed,uHue,uAmp,uDim;
vec3 grad(float t){
  t=abs(fract(t)*2.-1.);
  vec3 c0=vec3(1.00,.47,.16);
  vec3 c1=vec3(.98,.26,.62);
  vec3 c2=vec3(.56,.31,.96);
  vec3 c3=vec3(.18,.52,.98);
  vec3 c4=vec3(.36,.90,.96);
  float u=t*4.;
  vec3 c=mix(c0,c1,clamp(u,0.,1.));
  c=mix(c,c2,clamp(u-1.,0.,1.));
  c=mix(c,c3,clamp(u-2.,0.,1.));
  c=mix(c,c4,clamp(u-3.,0.,1.));
  return c;
}
void main(){
  vec2 uv=gl_FragCoord.xy/uR;
  vec2 p=vec2(uv.x*uR.x/uR.y,uv.y)*1.5+uSeed*17.;
  float t=uT*.11;
  vec2 q=vec2(sin(p.x*1.25+t)+sin(p.y*1.7-t*1.35),
              cos(p.x*1.05-t*.8)+cos(p.y*1.45+t));
  vec2 r=vec2(sin((p.x+q.x*.8)*1.15-t*1.1)+cos((p.y+q.y*.7)*1.55+t*.7),
              sin((p.y+q.x*.7)*1.35+t)+cos((p.x-q.y*.8)*1.05-t*.6));
  float n=sin(p.x*1.15+r.x*uAmp)+sin(p.y*1.45+r.y*uAmp);
  n=n*.25+.5;
  vec3 col=grad(n*.85+uv.x*.12-uv.y*.08+uHue);
  float sh=pow(clamp(1.-abs(fract(n*3.)-.5)*2.,0.,1.),9.);
  col+=sh*(.30-.18*uDim);
  col*=(.80+.32*n);
  col=mix(col,col*vec3(.30,.24,.42),uDim);
  float vg=smoothstep(1.45,.35,distance(uv,vec2(.55,.5)));
  col*=.78+.22*vg;
  gl_FragColor=vec4(col,1.);
}`;
    function boot() {
      cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      gl = cv.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
      if (!gl) return false;
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
        return s;
      };
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
      } catch (e) { return false; }
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      ["uR", "uT", "uSeed", "uHue", "uAmp", "uDim"].forEach(k => U[k] = gl.getUniformLocation(prog, k));
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U.uR, W, H);
      return true;
    }
    function render(o) {
      if (ok === null) ok = boot();
      if (!ok) return null;
      gl.uniform1f(U.uT, o.t);
      gl.uniform1f(U.uSeed, o.seed);
      gl.uniform1f(U.uHue, o.hue);
      gl.uniform1f(U.uAmp, o.amp);
      gl.uniform1f(U.uDim, o.dim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return cv;
    }
    /* WebGL 불가 시 2D 폴백: 어두운 바탕 + 떠다니는 광원 블롭 */
    const STOPS = ["#ff7729", "#fa429e", "#8f4ff5", "#2e85fa", "#5ce6f5"];
    function fallback(ctx, w, h, o) {
      ctx.fillStyle = "#1b1033"; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const x = w * (.5 + .42 * Math.sin(o.t * .18 + i * 2.1 + o.seed * 9));
        const y = h * (.5 + .38 * Math.cos(o.t * .14 + i * 1.7 + o.seed * 5));
        const r = Math.max(w, h) * (.34 + .1 * Math.sin(o.t * .2 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(STOPS[(i + Math.floor(o.hue * 5)) % 5], o.dim ? .34 : .6));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      if (o.dim) { ctx.fillStyle = "rgba(10,7,22,.4)"; ctx.fillRect(0, 0, w, h); }
    }
    return { render, fallback };
  })();

  /* 배경 위 도형용 잉크 — 흰 실선 + 골드·아이스 강조, 그림자색 꼬리 */
  const INK = {
    s1: "#ffffff", s2: "#ffe27a", s3: "#a5f6ff", red: "#1c0b2e",
    good: "#ffffff", crit: "#1c0b2e", ink: "#ffffff", mut: "#ffffff",
    grid: "#ffffff", base: "#ffffff", surf: "#000000",
  };

  /* ---------- 계열 판별 ---------- */
  function pickArch(groups, tags, id) {
    const g = groups.join(" ") + " " + tags.join(" ");
    if (/회귀|학습곡선/.test(g)) return "regress";
    if (/포트폴리오/.test(g)) return "frontier";
    if (/선형계획|수송|할당|정수계획/.test(g)) return "lp";
    if (/위험|VaR/.test(g)) return "tail";
    if (/분포/.test(g)) return "dist";
    if (/파생|옵션|주가/.test(g)) return "paths";
    if (/비선형|진화|유전|담금질/.test(g)) return "descent";
    return id[0] === "S" ? "paths" : "wave";
  }

  /* ---------- 계열별 정적 데이터 (마운트 시 1회 생성) ---------- */
  function makeData(arch, rng) {
    if (arch === "regress") {
      const pts = []; let outIdx = 0, worst = 0;
      for (let i = 0; i < 26; i++) {
        const e = clamp(normInv(rng()), -2.6, 2.6);
        pts.push({ x: .06 + .88 * rng(), e, ex: rng(), ey: rng() });
        if (Math.abs(e) > worst) { worst = Math.abs(e); outIdx = i; }
      }
      return { pts, outIdx };
    }
    if (arch === "paths") {
      const np = 9, ns = 64, Z = [];
      for (let p = 0; p < np; p++) { const z = [0]; for (let k = 1; k <= ns; k++) z.push(z[k - 1] + normInv(rng())); Z.push(z); }
      return { Z, np, ns, hiP: Math.floor(rng() * np) };
    }
    if (arch === "descent") {
      return { inits: [-3.4, 2.9, -1.3, 3.6], i: 0, bx: -3.4, age: 99, trail: [] };
    }
    if (arch === "frontier") {
      const assets = []; for (let i = 0; i < 5; i++) assets.push({ s: .45 + .45 * rng(), m: .15 + .55 * rng() });
      return { assets };
    }
    if (arch === "wave") {
      const rib = []; for (let i = 0; i < 3; i++) {
        rib.push({ base: .3 + .22 * i, a: [.05 + .05 * rng(), .03 + .03 * rng()], f: [3 + 3 * rng(), 7 + 4 * rng()], p: [rng() * 6.28, rng() * 6.28], s: [.35 + .3 * rng(), .6 + .4 * rng()] });
      }
      const par = []; for (let i = 0; i < 12; i++) par.push({ off: rng(), rib: i % 3 });
      return { rib, par };
    }
    return {};
  }

  /* ---------- 계열별 페인터 ----------
     P = {ctx,w,h,r,tk,t,en,A,hi,dt,d}
     r: 그리기 사각형, en: 등장 진행(0~1), A: 투명도 배율, hi: 강조 맥동 */
  function grid3(P) {
    const { ctx, r, tk } = P;
    ctx.strokeStyle = rgba(tk.grid, .2 * P.A); ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = r.y + r.h * i / 4;
      ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
    }
  }
  const PAINT = {
    regress(P) {
      const { ctx, r, tk, t, en, d, A, hi } = P;
      const X = (u) => r.x + u * r.w, Y = (v) => r.y + (1 - v) * r.h;
      const m = .5 + .5 * Math.sin(t * .55);
      const ns = lerp(.05, .13, m);          /* 산점이 조였다 풀렸다 — 모핑 */
      grid3(P);
      const yOf = (x) => .22 + .55 * x;
      const band = 2 * ns;
      ctx.fillStyle = rgba(tk.s1, .1 * A);
      ctx.beginPath();
      ctx.moveTo(X(0), Y(clamp(yOf(0) + band, 0, 1)));
      ctx.lineTo(X(1), Y(clamp(yOf(1) + band, 0, 1)));
      ctx.lineTo(X(1), Y(clamp(yOf(1) - band, 0, 1)));
      ctx.lineTo(X(0), Y(clamp(yOf(0) - band, 0, 1)));
      ctx.fill();
      /* 적합선 — 등장 시 스스로 그려진다 */
      const le = eOut(clamp(en * 1.3 - .2, 0, 1));
      pline(ctx, [[X(0), Y(yOf(0))], [X(le), Y(yOf(le))]], rgba(tk.s2, .95 * A), 2.5);
      glow(ctx, X(le), Y(yOf(le)), 12, tk.s2, .45 * A * (le < 1 ? 1 : 0));
      /* 산점 — 흩어진 위치에서 날아와 자리를 잡는다 */
      d.pts.forEach((p, i) => {
        const k = eOut(clamp(en * 1.5 - i * .018, 0, 1));
        const tx = p.x, ty = clamp(yOf(p.x) + p.e * ns, .03, .97);
        const x = X(lerp(p.ex, tx, k)), y = Y(lerp(p.ey, ty, k));
        if (i === d.outIdx && en > .8) {
          glow(ctx, x, y, 14 + 5 * hi, tk.s3, .5 * A);
          dot(ctx, x, y, 3.5, rgba(tk.s3, .95 * A));
        } else dot(ctx, x, y, 3, rgba(tk.s1, (0.35 + 0.5 * k) * A));
      });
    },

    lp(P) {
      const { ctx, r, tk, t, en, A, hi } = P;
      const X = (u) => r.x + u * r.w, Y = (v) => r.y + (1 - v) * r.h;
      const m = .5 + .5 * Math.sin(t * .5);
      const V0 = [[0, 0], [.85, 0], [.7, .45], [.35, .7], [0, .8]];
      const V1 = [[0, 0], [.92, 0], [.6, .55], [.44, .64], [0, .7]];
      const V = V0.map((v, i) => [lerp(v[0], V1[i][0], m), lerp(v[1], V1[i][1], m)]);
      grid3(P);
      pline(ctx, [[X(0), Y(0)], [X(1), Y(0)]], rgba(tk.s1, .5 * A), 1.5);
      pline(ctx, [[X(0), Y(0)], [X(0), Y(1)]], rgba(tk.s1, .5 * A), 1.5);
      /* 가해영역 — 중심에서 펼쳐지며 등장 */
      const cx = V.reduce((s, v) => s + v[0], 0) / V.length, cy = V.reduce((s, v) => s + v[1], 0) / V.length;
      const sc = eOut(en);
      const VV = V.map(v => [lerp(cx, v[0], sc), lerp(cy, v[1], sc)]);
      ctx.fillStyle = rgba(tk.s1, .14 * A);
      ctx.beginPath(); VV.forEach((v, i) => i ? ctx.lineTo(X(v[0]), Y(v[1])) : ctx.moveTo(X(v[0]), Y(v[1]))); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(tk.s1, .9 * A); ctx.lineWidth = 2; ctx.stroke();
      /* 목적함수 등고선이 최적 꼭짓점으로 쓸려 들어온다 */
      const dx = .6, dy = .8;
      let best = 0, bv = -1;
      V.forEach((v, i) => { const s = v[0] * dx + v[1] * dy; if (s > bv) { bv = s; best = i; } });
      const c = bv + .32 * (.5 + .5 * Math.cos(t * .8));
      const px = dx * c, py = dy * c, L = 1.4;
      pline(ctx, [[X(px - dy * L), Y(py + dx * L)], [X(px + dy * L), Y(py - dx * L)]], rgba(tk.s3, .8 * A), 1.8, [6, 6]);
      const ox = X(V[best][0]), oy = Y(V[best][1]);
      glow(ctx, ox, oy, 18 + 7 * hi, tk.s2, .55 * A);
      dot(ctx, ox, oy, 4.5, rgba(tk.s2, .98 * A));
    },

    descent(P) {
      const { ctx, r, tk, t, en, d, A, hi, dt } = P;
      const X = (u) => r.x + ((u + 4) / 8) * r.w;
      const m = .5 + .5 * Math.sin(t * .4);
      const f = (x) => lerp(.05 * x ** 4 - 1.2 * x ** 2 + .3 * x, .05 * x ** 4 - x ** 2 - .6 * x, m);
      const df = (x) => (f(x + .01) - f(x - .01)) / .02;
      let lo = 1e9, hiV = -1e9; const cur = [];
      for (let i = 0; i <= 110; i++) { const x = -4 + 8 * i / 110, y = f(x); cur.push([x, y]); if (y < lo) lo = y; if (y > hiV) hiV = y; }
      const Y = (y) => r.y + 10 + (1 - (y - lo) / (hiV - lo + 1e-9)) * (r.h - 20);
      grid3(P);
      const le = Math.floor(eOut(en) * cur.length);
      pline(ctx, cur.slice(0, Math.max(2, le)).map(p => [X(p[0]), Y(p[1])]), rgba(tk.s1, .92 * A), 2.5);
      let mn = cur[0]; cur.forEach(p => { if (p[1] < mn[1]) mn = p; });
      glow(ctx, X(mn[0]), Y(mn[1]), 16 + 6 * hi, tk.s3, .5 * A);
      dot(ctx, X(mn[0]), Y(mn[1]), 3.5, rgba(tk.s3, .95 * A));
      /* 공이 기울기를 타고 내려간다 — 초기값을 바꿔가며 반복 */
      if (en > .55) {
        d.age += dt;
        if (d.age > 6.5) { d.age = 0; d.i++; d.bx = d.inits[d.i % d.inits.length]; d.trail = []; }
        d.bx = clamp(d.bx - .9 * dt * df(d.bx), -3.9, 3.9);
        const bx = X(d.bx), by = Y(f(d.bx));
        d.trail.push({ x: bx, y: by, a: 1 });
        if (d.trail.length > 26) d.trail.shift();
        d.trail.forEach(p => { p.a *= .93; dot(ctx, p.x, p.y, 2.2, rgba(tk.s2, .6 * p.a * A)); });
        glow(ctx, bx, by, 14, tk.s2, .6 * A);
        dot(ctx, bx, by, 4.5, rgba(tk.s2, .98 * A));
      }
    },

    frontier(P) {
      const { ctx, r, tk, t, en, d, A, hi } = P;
      const X = (u) => r.x + u * r.w, Y = (v) => r.y + (1 - v) * r.h;
      const sOf = (mu) => Math.sqrt(.03 + 1.1 * (mu - .42) ** 2);
      grid3(P);
      d.assets.forEach((a, i) => {
        const k = eOut(clamp(en * 1.6 - i * .12, 0, 1));
        dot(ctx, X(a.s), Y(a.m), 3 * k, rgba(tk.s1, .55 * A));
      });
      const pts = []; for (let i = 0; i <= 80; i++) { const mu = .06 + .84 * i / 80; pts.push([X(sOf(mu)), Y(mu)]); }
      const le = Math.max(2, Math.floor(eOut(en) * pts.length));
      pline(ctx, pts.slice(0, le), rgba(tk.s1, .92 * A), 2.5);
      /* 접점이 프론티어 위를 미끄러진다 + 자본시장선 */
      if (en > .5) {
        const mu = .45 + .27 * Math.sin(t * .5);
        const px = X(sOf(mu)), py = Y(mu);
        const rf = { x: X(.02), y: Y(.14) };
        const ex = rf.x + (px - rf.x) * 1.6, ey = rf.y + (py - rf.y) * 1.6;
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        pline(ctx, [[rf.x, rf.y], [ex, ey]], rgba(tk.s3, .8 * A), 1.8, [6, 6]);
        ctx.restore();
        dot(ctx, rf.x, rf.y, 3, rgba(tk.s3, .9 * A));
        glow(ctx, px, py, 17 + 6 * hi, tk.s2, .55 * A);
        dot(ctx, px, py, 4.5, rgba(tk.s2, .98 * A));
      }
    },

    tail(P) { PAINT._dist(P, true); },
    dist(P) { PAINT._dist(P, false); },
    _dist(P, tail) {
      const { ctx, r, tk, t, en, A, hi } = P;
      const X = (u) => r.x + u * r.w;
      const m = .5 + .5 * Math.sin(t * .45);
      const pdfA = (x) => Math.exp(-(((x - .5) / .13) ** 2) / 2);
      const pdfB = (x) => { const z = clamp((x - .16) / .8, .001, 1); return Math.pow(z, .6) * Math.exp(-3.2 * z) * 4.2; };
      let mx = 0; const cur = [];
      for (let i = 0; i <= 120; i++) { const x = i / 120, y = lerp(pdfA(x), pdfB(x), tail ? .55 + .45 * Math.sin(t * .45) : m); cur.push([x, y]); if (y > mx) mx = y; }
      const Y = (y) => r.y + 12 + (1 - y / mx) * (r.h - 24);
      grid3(P);
      const sc = eOut(en); /* 곡선이 바닥에서 일어선다 */
      const YY = (y) => lerp(Y(0), Y(y), sc);
      ctx.fillStyle = rgba(tk.s1, .13 * A);
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      cur.forEach(p => ctx.lineTo(X(p[0]), YY(p[1]))); ctx.lineTo(X(1), Y(0)); ctx.fill();
      pline(ctx, cur.map(p => [X(p[0]), YY(p[1])]), rgba(tk.s1, .92 * A), 2.5);
      if (tail && en > .5) {
        /* 하위 5% 꼬리 — 위험이 사는 곳. 그림자처럼 어둡게 판다 */
        let tot = 0; cur.forEach(p => tot += p[1]);
        let acc = 0, qi = 0;
        for (let i = 0; i < cur.length; i++) { acc += cur[i][1]; if (acc / tot >= .05) { qi = i; break; } }
        ctx.fillStyle = rgba(tk.red, (.4 + .18 * hi) * A);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0));
        for (let i = 0; i <= qi; i++) ctx.lineTo(X(cur[i][0]), YY(cur[i][1]));
        ctx.lineTo(X(cur[qi][0]), Y(0)); ctx.fill();
        pline(ctx, [[X(cur[qi][0]), Y(0)], [X(cur[qi][0]), YY(mx * .8)]], rgba(tk.s2, .9 * A), 1.8, [5, 5]);
        glow(ctx, X(cur[qi][0]), YY(cur[qi][1]), 15 + 5 * hi, tk.s2, .5 * A);
      } else if (!tail && en > .5) {
        /* 평균 위치가 함께 흐른다 */
        let sm = 0, tot = 0; cur.forEach(p => { sm += p[0] * p[1]; tot += p[1]; });
        const mu = sm / tot;
        pline(ctx, [[X(mu), Y(0)], [X(mu), YY(mx * .92)]], rgba(tk.s3, .85 * A), 1.8, [5, 5]);
        glow(ctx, X(mu), YY(lerp(pdfA(mu), pdfB(mu), m)), 14 + 4 * hi, tk.s3, .5 * A);
      }
    },

    paths(P) {
      const { ctx, r, tk, t, en, d, A, hi } = P;
      const m = .5 + .5 * Math.sin(t * .35);
      const v = lerp(.13, .3, m), mu = .06, dtm = 1 / d.ns, sd = v * Math.sqrt(dtm);
      const X = (k) => r.x + (k / d.ns) * (r.w - 26);
      grid3(P);
      const val = (p, k) => Math.exp((mu - v * v / 2) * k * dtm + sd * d.Z[p][k]);
      let lo = 1e9, hiV = -1e9;
      for (let p = 0; p < d.np; p++) { const a = val(p, d.ns), b = val(p, Math.floor(d.ns / 2)); lo = Math.min(lo, a, b, .6); hiV = Math.max(hiV, a, b, 1.5); }
      const Y = (s) => r.y + 8 + (1 - (s - lo) / (hiV - lo)) * (r.h - 16);
      const ph = RM.matches ? 1 : (t % 8) / 8;
      const head = Math.max(2, Math.floor(Math.min(1, ph * 1.25) * d.ns * eOut(en)));
      for (let p = 0; p < d.np; p++) {
        const pts = []; for (let k = 0; k <= head; k++) pts.push([X(k), Y(val(p, k))]);
        const hiPath = p === d.hiP;
        pline(ctx, pts, rgba(hiPath ? tk.s2 : tk.s1, (hiPath ? .95 : .38) * A), hiPath ? 2.5 : 1.4);
        if (head < d.ns && hiPath) glow(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], 12, tk.s2, .6 * A);
      }
      /* 만기 분포가 오른쪽 벽에 쌓인다 */
      const ba = clamp((ph - .72) * 4, 0, 1) * eOut(en);
      if (ba > 0) {
        const bins = new Array(8).fill(0);
        for (let p = 0; p < d.np * 4; p++) {
          const s = val(p % d.np, d.ns) * (1 + .04 * Math.sin(p * 2.7));
          const bi = clamp(Math.floor((s - lo) / (hiV - lo) * 8), 0, 7); bins[bi]++;
        }
        const bm = Math.max(...bins);
        bins.forEach((b, i) => {
          const y0 = r.y + 8 + (1 - (i + 1) / 8) * (r.h - 16), bh = (r.h - 16) / 8;
          ctx.fillStyle = rgba(tk.s3, .6 * ba * A);
          ctx.fillRect(r.x + r.w - 24, y0 + 1.5, (b / bm) * 22 * ba, bh - 3);
        });
      }
      glow(ctx, X(0), Y(1), 9 + 3 * hi, tk.s1, .3 * A);
    },

    wave(P) {
      const { ctx, r, tk, t, en, d, A, hi } = P;
      const X = (u) => r.x + u * r.w, Y = (v) => r.y + (1 - v) * r.h;
      const cols = [tk.s1, tk.s2, tk.s3];
      const m = .6 + .4 * Math.sin(t * .3);
      const yOf = (rb, u) => rb.base + rb.a[0] * m * Math.sin(rb.f[0] * u + rb.p[0] + t * rb.s[0]) + rb.a[1] * Math.sin(rb.f[1] * u + rb.p[1] + t * rb.s[1]);
      d.rib.forEach((rb, i) => {
        const pts = []; const le = eOut(clamp(en * 1.4 - i * .15, 0, 1));
        for (let k = 0; k <= 90; k++) { const u = k / 90 * le; pts.push([X(u), Y(yOf(rb, u))]); }
        ctx.fillStyle = rgba(cols[i], .07 * A);
        ctx.beginPath(); ctx.moveTo(pts[0][0], Y(0));
        pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], Y(0)); ctx.fill();
        pline(ctx, pts, rgba(cols[i], (.8 - .2 * i) * A), 2.2 - .3 * i);
      });
      d.par.forEach(p => {
        const u = (p.off + t * .045) % 1;
        dot(ctx, X(u), Y(yOf(d.rib[p.rib], u)), 2, rgba(cols[p.rib], .7 * A));
      });
      const u0 = .62;
      glow(ctx, X(u0), Y(yOf(d.rib[0], u0)), 16 + 5 * hi, tk.s2, .5 * A);
    },
  };

  /* ---------- 수치 파싱·포맷 (카운팅용) ---------- */
  function parseVal(s) {
    const m = s.match(/-?[\d,]+(?:\.\d+)?/);
    if (!m) return null;
    const raw = m[0], num = parseFloat(raw.replace(/,/g, ""));
    if (!isFinite(num)) return null;
    const dec = (raw.split(".")[1] || "").length;
    return { num, dec, pre: s.slice(0, m.index), post: s.slice(m.index + raw.length), full: s };
  }
  const fmtVal = (p, v) => p.pre + v.toLocaleString("ko-KR", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) + p.post;
  const firstSentence = (s) => { const i = s.indexOf("다. "); return i > 0 ? s.slice(0, i + 2) : s; };

  /* ---------- 전역 rAF 펌프 ---------- */
  const RUN = new Set(); let RAF = 0;
  function pump(ts) {
    RAF = 0;
    RUN.forEach(inst => { try { inst.tick(ts); } catch (e) { RUN.delete(inst); } });
    if (RUN.size) RAF = requestAnimationFrame(pump);
  }
  function ensurePump() { if (!RAF && RUN.size) RAF = requestAnimationFrame(pump); }
  const IO = new IntersectionObserver(es => es.forEach(e => {
    const inst = e.target._inst; if (!inst) return;
    inst.visible = e.isIntersecting;
    if (inst.visible) { inst.nextAt = performance.now() + SLIDE_MS; inst.lastTs = 0; }
  }), { rootMargin: "80px" });

  /* ---------- 인스턴스 ---------- */
  function insightMount(item, id) {
    const [title, desc, groups, tags, dd] = item;
    const arch = pickArch(groups, tags, id);
    const seed32 = hashSeed(id);
    const rng = mulberry32(seed32);
    const data = makeData(arch, rng);
    const seed = (seed32 % 1000) / 1000;

    const root = E("div", "ins");
    const head = E("div", "ins-head");
    const prev = E("button", "caro-btn", "‹"), next = E("button", "caro-btn", "›");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "이전 요약"); next.setAttribute("aria-label", "다음 요약");
    const ttl = E("div", "ins-title", "한눈에 보기");
    const segs = E("div", "ins-segs");
    head.append(prev, ttl, segs, next);
    const stage = E("div", "ins-stage");
    root.append(head, stage);

    /* 결과 타일 재료 */
    const outs = dd.out.slice(0, 3).map(([k, v]) => ({ k, v, p: parseVal(v) }));

    const defs = [
      { eyebrow: "왜 필요한가", mode: 0 },
      { eyebrow: "핵심 발상", mode: 1 },
      { eyebrow: "결과 읽기", mode: 2 },
    ];
    const slides = defs.map((s, i) => {
      const sl = E("div", "ins-slide");
      const cv = document.createElement("canvas"); cv.className = "ins-cv";
      const fg = E("div", "ins-fg");
      fg.appendChild(E("div", "ins-eyebrow", s.eyebrow));
      if (i === 0) {
        fg.appendChild(E("p", "ins-big", desc));
        fg.appendChild(E("p", "ins-sub", `입력 ${dd.in.length}항 · 결과 ${dd.out.length}항 · ${dd.steps.length}단계 풀이 — 원본 통합문서 수치 그대로`));
      } else if (i === 1) {
        const k = E("p", null); k.appendChild(E("span", "ins-key", tags[0])); fg.appendChild(k);
        fg.appendChild(E("p", "ins-sub", dd.steps[0]));
      } else {
        const tr = E("div", "ins-tiles");
        outs.forEach(o => {
          const tl = E("div", "ins-tile");
          tl.append(E("span", null, o.k), E("b", null, o.p ? fmtVal(o.p, 0) : o.v));
          o.el = tl.lastChild; o.tile = tl;
          tr.appendChild(tl);
        });
        fg.appendChild(tr);
        fg.appendChild(E("p", "ins-sub", firstSentence(dd.read)));
      }
      sl.append(cv, fg); stage.appendChild(sl);
      const seg = E("button", null); seg.type = "button";
      seg.setAttribute("aria-label", s.eyebrow);
      seg.appendChild(E("i"));
      segs.appendChild(seg);
      return { sl, cv, seg, mode: s.mode, cw: 0, chh: 0 };
    });

    const inst = {
      root, awake: false, visible: false, idx: -1, prevIdx: -1,
      t: seed * 40, lastTs: 0, nextAt: 0, curDur: SLIDE_MS, switchTs: 0, actStart: 0,
      countStart: 0, _dt: 0,

      fit(s) {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const cw = stage.clientWidth, chh = stage.clientHeight;
        if ((cw === s.cw && chh === s.chh) || !cw) return;
        s.cw = cw; s.chh = chh;
        s.cv.width = cw * dpr; s.cv.height = chh * dpr;
        s.cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      },
      region(mode, w, h) {
        if (mode === 0) return { x: 16, y: 16, w: w - 32, h: h - 32 };            /* 잔잔한 전면 배경 */
        if (w < 560) return { x: 16, y: 14, w: w - 32, h: h * .5 };               /* 좁은 화면: 위쪽 절반 */
        return { x: w * .43, y: 18, w: w * .53, h: h - 38 };                       /* 본문 오른쪽 */
      },
      paintSlide(i, ts) {
        const s = slides[i]; if (!s) return;
        this.fit(s);
        if (!s.cw) return;
        const ctx = s.cv.getContext("2d");
        const w = s.cw, h = s.chh;
        const t = RM.matches ? seed * 40 + 3 : this.t + s.mode * 2.3;
        /* 1. 유체 그라디언트 배경 */
        const fxo = { t, seed, hue: seed * .8 + s.mode * .13 + (RM.matches ? 0 : this.t * .004), amp: s.mode === 1 ? 1.35 : .95, dim: s.mode === 2 ? .55 : (s.mode === 0 ? .12 : 0) };
        const bg = FX.render(fxo);
        if (bg) { ctx.clearRect(0, 0, w, h); ctx.drawImage(bg, 0, 0, w, h); }
        else FX.fallback(ctx, w, h, fxo);
        /* 2. 통계 도형 */
        const en = RM.matches ? 1 : eOut(clamp((ts - this.actStart) / ENTER_MS, 0, 1));
        const A = [.5, 1, .42][s.mode];
        const r = this.region(s.mode, w, h);
        ctx.save(); ctx.beginPath(); ctx.rect(r.x - 10, r.y - 10, r.w + 20, r.h + 20); ctx.clip();
        ctx.shadowColor = "rgba(20,8,40,.35)"; ctx.shadowBlur = 6;
        PAINT[arch]({
          ctx, w, h, r, tk: INK, d: data, A,
          t, en: i === this.idx ? en : 1,
          hi: RM.matches ? .5 : .5 + .5 * Math.sin(this.t * 2.2),
          dt: this._dt,
        });
        ctx.restore();
      },
      go(i, ts, auto) {
        i = (i + slides.length) % slides.length;
        if (i === this.idx) { if (!auto) { this.nextAt = ts + HOLD_MS; this.curDur = HOLD_MS; } return; }
        this.prevIdx = this.idx; this.idx = i;
        this.switchTs = ts; this.actStart = ts;
        this.curDur = auto ? SLIDE_MS : HOLD_MS;
        this.nextAt = ts + this.curDur;
        slides.forEach((s, j) => s.sl.classList.toggle("on", j === i));
        [...segs.children].forEach((b, j) => b.classList.toggle("cur", j === i));
        if (i === 2) {
          this.countStart = ts;
          if (RM.matches) outs.forEach(o => { if (o.p) o.el.textContent = o.p.full; });
        }
        if (RM.matches) this.paintSlide(i, ts);
      },
      tick(ts) {
        if (!this.awake || !this.visible || RM.matches) return;
        if (!this.lastTs) this.lastTs = ts;
        this._dt = Math.min(ts - this.lastTs, 80) / 1000;
        this.lastTs = ts;
        this.t += this._dt;
        if (ts >= this.nextAt) this.go(this.idx + 1, ts, true);
        /* 진행 바 */
        const fill = clamp(1 - (this.nextAt - ts) / this.curDur, 0, 1);
        [...segs.children].forEach((b, j) => {
          b.firstChild.style.width = j === this.idx ? (fill * 100) + "%" : (j < this.idx ? "100%" : "0%");
        });
        /* 결과 카운팅 + 타일 강조 순환 */
        if (this.idx === 2) {
          const p = clamp((ts - this.countStart) / 1000, 0, 1);
          outs.forEach(o => { if (o.p) o.el.textContent = p >= 1 ? o.p.full : fmtVal(o.p, o.p.num * eOut(p)); });
          const hiIdx = p >= 1 ? Math.floor((ts - this.countStart - 1000) / 1500) % Math.max(outs.length, 1) : -1;
          outs.forEach((o, j) => o.tile && o.tile.classList.toggle("hi", j === hiIdx));
        }
        this.paintSlide(this.idx, ts);
        if (ts - this.switchTs < FADE_MS && this.prevIdx >= 0) this.paintSlide(this.prevIdx, ts);
      },
    };

    prev.addEventListener("click", () => inst.go(inst.idx - 1, performance.now(), false));
    next.addEventListener("click", () => inst.go(inst.idx + 1, performance.now(), false));
    segs.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      inst.go([...segs.children].indexOf(b), performance.now(), false);
    });

    root._inst = inst; stage._inst = inst;
    IO.observe(stage);

    root._wake = () => {
      if (inst.awake) return;
      inst.awake = true; inst.lastTs = 0;
      const ts = performance.now();
      if (inst.idx < 0) inst.go(0, ts, true); else { inst.nextAt = ts + SLIDE_MS; inst.curDur = SLIDE_MS; }
      if (RM.matches) { inst.paintSlide(inst.idx, ts); return; }
      RUN.add(inst); ensurePump();
    };
    root._sleep = () => { inst.awake = false; RUN.delete(inst); };

    root._wake();
    return root;
  }

  window.insightMount = insightMount;
})();
