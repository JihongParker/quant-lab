/* 홈 히어로 — WebGL 프래그먼트 셰이더가 실시간으로 그리는 이리데선트 유체
   그라디언트(정적 에셋 없음). 도메인 워프로 계속 모핑하고, 위에 빛 입자가
   떠다닌다. 카드 내부 캐러셀은 index.html이 담당하며 이 파일과 무관하다.
   WebGL 불가 환경은 2D 광원 블롭 폴백, prefers-reduced-motion은 정지 화면. */

(() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)");

  function rgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---------- 셰이더 렌더러 (오프스크린 1개) ---------- */
  const FX = (() => {
    const W = 960, H = 400;
    let cv, gl, prog, U = {}, ok = null;
    const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
    const FS = `precision mediump float;
uniform vec2 uR;uniform float uT,uSeed,uHue,uAmp;
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
  vec2 p=vec2(uv.x*uR.x/uR.y,uv.y)*1.35+uSeed*17.;
  float t=uT*.11;
  vec2 q=vec2(sin(p.x*1.25+t)+sin(p.y*1.7-t*1.35),
              cos(p.x*1.05-t*.8)+cos(p.y*1.45+t));
  vec2 r=vec2(sin((p.x+q.x*.8)*1.15-t*1.1)+cos((p.y+q.y*.7)*1.55+t*.7),
              sin((p.y+q.x*.7)*1.35+t)+cos((p.x-q.y*.8)*1.05-t*.6));
  float n=sin(p.x*1.15+r.x*uAmp)+sin(p.y*1.45+r.y*uAmp);
  n=n*.25+.5;
  vec3 col=grad(n*.85+uv.x*.12-uv.y*.08+uHue);
  float sh=pow(clamp(1.-abs(fract(n*3.)-.5)*2.,0.,1.),9.);
  col+=sh*.3;
  col*=(.8+.32*n);
  float vg=smoothstep(1.5,.35,distance(uv,vec2(.55,.5)));
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
      ["uR", "uT", "uSeed", "uHue", "uAmp"].forEach(k => U[k] = gl.getUniformLocation(prog, k));
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return cv;
    }
    const STOPS = ["#ff7729", "#fa429e", "#8f4ff5", "#2e85fa", "#5ce6f5"];
    function fallback(ctx, w, h, o) {
      ctx.fillStyle = "#1b1033"; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const x = w * (.5 + .42 * Math.sin(o.t * .18 + i * 2.1));
        const y = h * (.5 + .38 * Math.cos(o.t * .14 + i * 1.7));
        const r = Math.max(w, h) * (.34 + .1 * Math.sin(o.t * .2 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(STOPS[i], .6));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }
    return { render, fallback };
  })();

  /* ---------- 히어로 마운트 ---------- */
  function heroFX(canvas) {
    if (!canvas) return;
    const seed = .37;
    /* 빛 입자 */
    let s = 20260824;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const par = Array.from({ length: 30 }, () => ({
      x: rnd(), y: rnd(), v: .006 + .016 * rnd(), sw: .5 + rnd() * 2,
      r: .8 + rnd() * 1.8, a: .12 + .3 * rnd(), ph: rnd() * 6.28,
    }));
    let t = 0, lastTs = 0, cw = 0, chh = 0, visible = true;

    function fit() {
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || (w === cw && h === chh)) return !!w;
      cw = w; chh = h;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    function draw() {
      const ctx = canvas.getContext("2d");
      const fxo = { t: t * 1.35, seed, hue: .04 + t * .006, amp: 1.25 };
      const bg = FX.render(fxo);
      if (bg) { ctx.clearRect(0, 0, cw, chh); ctx.drawImage(bg, 0, 0, cw, chh); }
      else FX.fallback(ctx, cw, chh, fxo);
      if (RM.matches) return;
      ctx.save();
      par.forEach(p => {
        const y = (p.y - t * p.v % 1 + 1) % 1;
        const x = (p.x + Math.sin(t * .3 + p.ph) * .012 * p.sw + 1) % 1;
        const tw = .6 + .4 * Math.sin(t * 1.7 + p.ph);
        ctx.fillStyle = `rgba(255,255,255,${p.a * tw})`;
        ctx.beginPath(); ctx.arc(x * cw, y * chh, p.r, 0, 7); ctx.fill();
      });
      ctx.restore();
    }
    function loop(ts) {
      if (!canvas.isConnected) return;
      if (visible && !document.hidden && fit()) {
        if (!lastTs) lastTs = ts;
        t += Math.min(ts - lastTs, 80) / 1000;
        lastTs = ts;
        draw();
      } else lastTs = 0;
      requestAnimationFrame(loop);
    }
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
    if (RM.matches) {
      /* 정지 화면 한 장 */
      const once = () => { if (fit()) { t = 6; draw(); } else requestAnimationFrame(once); };
      requestAnimationFrame(once);
      addEventListener("resize", () => { cw = 0; once(); });
      return;
    }
    requestAnimationFrame(loop);
  }

  window.heroFX = heroFX;
})();
