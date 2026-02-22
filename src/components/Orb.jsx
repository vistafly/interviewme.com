import { Mesh, Program, Renderer, Triangle, Vec3 } from 'ogl';
import { useEffect, useRef } from 'react';
import './Orb.css';

/* ---------- shaders (static, never re-created) ---------- */
const vert = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform vec3  iResolution;
  uniform float hover;
  uniform float rot;
  uniform float hoverIntensity;
  uniform vec3  backgroundColor;
  uniform float bgLum;
  uniform vec3  color1;
  uniform vec3  color2;
  uniform vec3  color3;
  uniform float audioAmp;
  uniform float ctaDistort;
  varying vec2  vUv;

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
      p3.x + p3.y, p3.x + p3.z, p3.y + p3.z
    ) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e  = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
      dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  vec4 extractAlpha(vec3 c) {
    float a = max(max(c.r, c.g), c.b);
    return vec4(c / (a + 1e-5), a);
  }

  const float innerRadius = 0.6;
  const float noiseScale  = 0.65;

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }
  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 draw(vec2 uv) {
    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(0.76, 0.84, n0) + audioAmp * 0.09;
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);

    v0 *= smoothstep(r0 * 1.05, r0, len);
    float innerFade = smoothstep(r0 * 0.8, r0 * 0.95, len);
    v0 *= mix(innerFade, 1.0, bgLum * 0.7);
    float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

    float a  = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d  = distance(uv, pos);
    float v1 = light2(1.5, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius - audioAmp * 0.04, 0.8, len);

    vec3 colBase    = mix(color1, color2, cl) * (1.0 + audioAmp * 0.2);
    float fadeAmt   = mix(1.0, 0.1, bgLum);

    vec3 darkCol  = mix(color3, colBase, v0);
    darkCol       = clamp((darkCol + v1) * v2 * v3, 0.0, 1.0);

    vec3 lightCol = (colBase + v1) * mix(1.0, v2 * v3, fadeAmt);
    lightCol      = clamp(mix(backgroundColor, lightCol, v0), 0.0, 1.0);

    vec3 finalCol = mix(darkCol, lightCol, bgLum);

    /* emissive outer glow */
    float outerMask = smoothstep(r0 * 0.8, r0 * 1.1, len);
    float glowBase = light1(0.15, 8.0, d0) + light1(0.25, 3.5, d);
    float glow = (glowBase + audioAmp * 0.28) * outerMask;
    finalCol += colBase * glow;

    return extractAlpha(finalCol);
  }

  vec4 mainImage(vec2 fragCoord) {
    vec2  center = iResolution.xy * 0.5;
    float size   = min(iResolution.x, iResolution.y);
    vec2  uv     = (fragCoord - center) / size * 2.0;

    float s = sin(rot);
    float c = cos(rot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    /* Normal hover: high-frequency ripple */
    float normalHover = hover * (1.0 - ctaDistort);
    uv.x += normalHover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += normalHover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

    /* CTA hover: low-frequency organic blob */
    float ct = iTime * 0.6;
    float ang = atan(uv.y, uv.x);
    float r   = length(uv);
    float blob = ctaDistort * 0.12 * (
      sin(ang * 3.0 + ct) * 0.6 +
      sin(ang * 5.0 - ct * 1.4) * 0.3 +
      sin(ang * 2.0 + ct * 0.7) * 0.4
    );
    uv += normalize(uv + 0.001) * blob * smoothstep(0.0, 0.9, r);

    return draw(uv);
  }

  void main() {
    vec4 col = mainImage(vUv * iResolution.xy);
    gl_FragColor = vec4(col.rgb * col.a, col.a);
  }
`;

/* ---------- helpers (static) ---------- */
function hexToVec3(color) {
  if (color.startsWith('#')) {
    return new Vec3(
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    );
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return new Vec3(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  return new Vec3(0, 0, 0);
}

function computeLuminance(color) {
  const v = hexToVec3(color);
  return 0.299 * v.x + 0.587 * v.y + 0.114 * v.z;
}

const BASE1 = [0.611765, 0.262745, 0.996078];
const BASE2 = [0.298039, 0.760784, 0.913725];
const BASE3 = [0.062745, 0.078431, 0.600000];

function adjustHueCPU(rgb, hueDeg) {
  if (hueDeg === 0) return new Vec3(...rgb);
  const rad = (hueDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const i = 0.596 * rgb[0] - 0.274 * rgb[1] - 0.322 * rgb[2];
  const q = 0.211 * rgb[0] - 0.523 * rgb[1] + 0.312 * rgb[2];
  const ni = i * cosA - q * sinA;
  const nq = i * sinA + q * cosA;
  return new Vec3(
    y + 0.956 * ni + 0.621 * nq,
    y - 0.272 * ni - 0.647 * nq,
    y - 1.106 * ni + 1.703 * nq,
  );
}

/* ---------- component ---------- */
export default function Orb({
  hue = 0,
  hoverIntensity = 0.2,
  rotateOnHover = true,
  forceHoverState = false,
  ctaHover = false,
  backgroundColor = '#000000',
  amplitudeRef = null,
  quality = null,
}) {
  const ctnDom = useRef(null);

  // Bridge props that change at runtime into refs so the WebGL context
  // is never torn down and recreated (which causes visible lag/flash).
  const forceHoverRef = useRef(forceHoverState);
  const rotateOnHoverRef = useRef(rotateOnHover);
  const ctaHoverRef = useRef(ctaHover);
  forceHoverRef.current = forceHoverState;
  rotateOnHoverRef.current = rotateOnHover;
  ctaHoverRef.current = ctaHover;

  useEffect(() => {
    const container = ctnDom.current;
    if (!container) return;

    // Detect software renderer from a temporary context
    const tmpCanvas = document.createElement('canvas');
    const tmpGl = tmpCanvas.getContext('webgl');
    const rendererInfo = tmpGl ? (tmpGl.getParameter(tmpGl.RENDERER) || '') : '';
    const isSoftware = /swiftshader|llvmpipe|software|webkit webgl/i.test(rendererInfo);
    tmpCanvas.remove();

    const effectiveDpr = quality != null
      ? quality
      : (isSoftware ? 0.25 : (window.devicePixelRatio || 1));

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false, dpr: effectiveDpr });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);

    // Precompute hue-adjusted colors on CPU (instead of per-pixel in shader)
    const c1 = adjustHueCPU(BASE1, hue);
    const c2 = adjustHueCPU(BASE2, hue);
    const c3 = adjustHueCPU(BASE3, hue);

    const program = new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: {
        iTime:           { value: 0 },
        iResolution:     { value: new Vec3(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
        hover:           { value: 0 },
        rot:             { value: 0 },
        hoverIntensity:  { value: hoverIntensity },
        backgroundColor: { value: hexToVec3(backgroundColor) },
        bgLum:           { value: computeLuminance(backgroundColor) },
        color1:          { value: c1 },
        color2:          { value: c2 },
        color3:          { value: c3 },
        audioAmp:        { value: 0 },
        ctaDistort:      { value: 0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const targetInterval = isSoftware ? 33.3 : 0;

    let cachedRect = container.getBoundingClientRect();

    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
      cachedRect = container.getBoundingClientRect();
    }
    window.addEventListener('resize', resize);
    resize();

    let targetHover = 0;
    let lastTime = -1;
    let currentRot = 0;
    const rotationSpeed = 0.3;

    const handleMouseMove = (e) => {
      const w = cachedRect.width;
      const h = cachedRect.height;
      const size = Math.min(w, h);
      const uvX = ((e.clientX - cachedRect.left - w * 0.5) / size) * 2.0;
      const uvY = ((e.clientY - cachedRect.top - h * 0.5) / size) * 2.0;
      targetHover = (uvX * uvX + uvY * uvY) < 0.64 ? 1 : 0;
    };
    const handleMouseLeave = () => { targetHover = 0; };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    let rafId;
    const update = (t) => {
      rafId = requestAnimationFrame(update);

      // Skip when tab hidden
      if (document.hidden) { lastTime = -1; return; }

      if (lastTime < 0) { lastTime = t; return; }
      const frameMs = t - lastTime;
      if (frameMs < targetInterval) return;
      const dt = Math.min(frameMs * 0.001, 0.1);
      lastTime = t;

      program.uniforms.iTime.value = t * 0.001;

      const effectiveHover = forceHoverRef.current ? 1 : targetHover;
      const hoverRate = effectiveHover > program.uniforms.hover.value ? 0.14 : 0.08;
      program.uniforms.hover.value += (effectiveHover - program.uniforms.hover.value) * hoverRate;

      // CTA distortion — asymmetric lerp (snappy attack, smooth release)
      const targetCta = ctaHoverRef.current ? 1 : 0;
      const ctaRate = targetCta > program.uniforms.ctaDistort.value ? 0.10 : 0.05;
      program.uniforms.ctaDistort.value += (targetCta - program.uniforms.ctaDistort.value) * ctaRate;

      if (rotateOnHoverRef.current && effectiveHover > 0.5) {
        currentRot += dt * rotationSpeed;
      }
      program.uniforms.rot.value = currentRot;

      // Audio reactivity — asymmetric smoothing (fast attack, slower release)
      const targetAmp = amplitudeRef?.current ?? 0;
      const currentAmp = program.uniforms.audioAmp.value;
      const rising = targetAmp > currentAmp;
      const rate = rising ? 18 : 8;             // attack 3x faster than release
      const ampAlpha = 1 - Math.exp(-rate * dt);
      program.uniforms.audioAmp.value += (targetAmp - currentAmp) * ampAlpha;

      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, hoverIntensity, backgroundColor]);

  return <div ref={ctnDom} className="orb-container" />;
}
