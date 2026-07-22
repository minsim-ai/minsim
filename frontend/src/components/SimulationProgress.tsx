import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { gsap } from 'gsap';
import type { RunSnapshot } from '../types/api';
import { useMinsimTheme } from '../hooks/useMinsimTheme';
import { GitHubStarCta } from './GitHubStarCta';
import { ThinkingIndicator } from './ThinkingIndicator';

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  snapshot?: RunSnapshot | null;
  stageTitle?: string;
  stageBody?: string;
  runLabel?: string;
  completeLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  resultAvailable?: boolean;
}

/*
 * 정규화 좌표: nx=(lon-125.7)/4.0  ny=(38.7-lat)/5.7
 *   nx=0 → 125.7°E(서해)   nx=1 → 129.7°E(동해)
 *   ny=0 → 38.7°N(DMZ 상단) ny=1 → 33.0°N(제주 남단)
 *
 * 검증 포인트
 *   부산(129.1°E,35.2°N) → nx=.85 ny=.61   해남(126.6°E,34.3°N) → nx=.23 ny=.77
 *   제주심(126.5°E,33.4°N) → nx=.20 ny=.93   태안(126.0°E,36.7°N) → nx=.08 ny=.35
 */
const PENINSULA: [number, number][] = [
  // DMZ 서→동 (강화~고성, 38°N 선이 SW→NE로 기울어짐)
  [.10,.14],[.20,.07],[.40,.04],[.58,.02],[.75,.02],
  // 동해안 북→남 (직선에 가까운 해안)
  [.73,.09],[.78,.16],[.88,.21],[.93,.30],[.93,.47],[.95,.54],
  // 남해안 동→서 (부산→여수→해남)
  [.88,.63],[.83,.65],[.70,.68],[.55,.68],[.50,.70],[.40,.72],[.23,.77],
  // 서해안 남→북 (목포→군산→태안→인천)
  [.18,.68],[.20,.61],[.23,.53],[.25,.47],[.20,.42],
  // 태안반도 돌출 (서해 최서단)
  [.13,.39],[.08,.35],[.18,.32],
  // 아산만→인천→강화
  [.28,.30],[.23,.23],[.15,.16],[.10,.14],
];
const JEJU_C: [number, number] = [.20, .93];
const JEJU_RX = .10, JEJU_RY = .025;

const REGIONS_DEF = [
  {name:'서울',  nx:.33, ny:.19, sc:.022, thr:20, delay:0},
  {name:'경기',  nx:.40, ny:.26, sc:.055, thr:28, delay:1.5},
  {name:'인천',  nx:.25, ny:.21, sc:.022, thr:17, delay:.8},
  {name:'강원',  nx:.63, ny:.21, sc:.065, thr:24, delay:3.0},
  {name:'충북',  nx:.50, ny:.35, sc:.038, thr:20, delay:4.0},
  {name:'충남',  nx:.28, ny:.39, sc:.040, thr:20, delay:5.0},
  {name:'대전',  nx:.43, ny:.40, sc:.020, thr:15, delay:4.5},
  {name:'경북',  nx:.75, ny:.40, sc:.065, thr:26, delay:6.0},
  {name:'대구',  nx:.73, ny:.49, sc:.020, thr:17, delay:7.0},
  {name:'경남',  nx:.63, ny:.58, sc:.050, thr:23, delay:8.5},
  {name:'부산',  nx:.85, ny:.61, sc:.020, thr:17, delay:9.0},
  {name:'울산',  nx:.90, ny:.56, sc:.020, thr:15, delay:8.8},
  {name:'전북',  nx:.38, ny:.51, sc:.048, thr:22, delay:5.5},
  {name:'전남',  nx:.30, ny:.67, sc:.052, thr:23, delay:7.5},
  {name:'광주',  nx:.30, ny:.61, sc:.020, thr:15, delay:6.5},
  {name:'제주',  nx:.20, ny:.93, sc:.040, thr:17, delay:11.0},
];

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uHide;
  uniform float uMorph;
  uniform vec2  uMouse;
  uniform float uMouseStrength;

  attribute vec3  a_position2;
  attribute vec3  a_hidePosition;
  attribute vec2  a_coordinates;
  attribute float a_select;
  attribute float a_speed;
  attribute float a_radius;
  attribute float a_offset;
  attribute float a_active1;
  attribute float a_active2;

  varying vec2  vCoordinates;
  varying vec3  vPos;
  varying float vActive1;
  varying float vActive2;

  void main() {
    vec3 pos = position;
    pos.x += cos(uTime * 0.5 * a_speed) * a_radius;
    pos.y += sin(uTime * 0.5 * a_speed) * a_radius;
    pos.z += sin(uTime * 0.3 * a_speed + a_offset) * 40.0;

    vec3 stable1 = position;
    stable1.x += cos(uTime * 0.35 + a_offset) * 4.0;
    stable1.y += sin(uTime * 0.45 + a_offset) * 4.0;
    stable1.z += sin(uTime * 0.6  + a_offset) * 5.0;

    vec3 stable2 = a_position2;
    stable2.x += cos(uTime * 0.35 + a_offset) * 4.0;
    stable2.y += sin(uTime * 0.45 + a_offset) * 4.0;
    stable2.z += sin(uTime * 0.6  + a_offset) * 5.0;

    vec3 stable = mix(stable1, stable2, uMorph);

    float dist = distance(stable.xy, uMouse);
    float area = 1.0 - smoothstep(0.0, 220.0, dist);
    stable.xy += vec2(
      cos(uTime * 5.0 + a_offset),
      sin(uTime * 5.0 + a_offset)
    ) * area * 28.0 * uMouseStrength;

    vec3 finalPos = mix(
      mix(pos, stable, a_select),
      a_hidePosition,
      uHide
    );

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    float sizeMult = mix(1.0, 1.45, uHide);
    gl_PointSize = (4500.0 / length(mvPosition.xyz)) * sizeMult;
    gl_Position = projectionMatrix * mvPosition;

    vCoordinates = a_coordinates;
    vPos = finalPos;
    vActive1 = a_active1;
    vActive2 = a_active2;
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse1;
  uniform sampler2D tDiffuse2;
  uniform vec2  uImageSize;
  uniform float uHide;
  uniform float uMorph;

  varying vec2  vCoordinates;
  varying vec3  vPos;
  varying float vActive1;
  varying float vActive2;

  void main() {
    vec2 uv = vCoordinates / uImageSize;

    vec4 d1 = texture2D(tDiffuse1, uv);
    vec4 d2 = texture2D(tDiffuse2, uv);

    float alpha1 = d1.a * vActive1;
    float alpha2 = d2.a * vActive2;
    vec4 diffuse = mix(
      vec4(d1.rgb, alpha1),
      vec4(d2.rgb, alpha2),
      uMorph
    );

    float depthAlpha = 1.0 - clamp(abs(vPos.z) / 950.0, 0.0, 1.0);
    vec3 dispersedColor = vec3(0.80, 0.88, 1.00);
    vec3 color = mix(diffuse.rgb, dispersedColor, uHide * 0.9);
    float alpha = depthAlpha * diffuse.a;

    if (alpha < 0.005) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

type Dot = {
  x: number; y: number; opacity: number; radius: number;
  phase: number; born: number; merging: boolean;
  tx: number; ty: number; mb: number;
};
type Region = typeof REGIONS_DEF[0] & {
  dots: Dot[];
  pillar: { born: number } | null;
  complete: boolean;
  spawning: boolean;
  merging: boolean;
  _next: number | null;
};

export function SimulationProgress({
  onComplete,
  onCancel,
  snapshot,
  stageTitle = '합성 패널이 응답 중입니다',
  stageBody = '한국 합성 페르소나가 선택 이유와 점수를 생성합니다.',
  runLabel = 'Synthetic panel',
  completeLabel = '결과 보기',
  pendingLabel = '결과 준비 중',
  cancelLabel = '취소',
  resultAvailable,
}: Props) {
  const theme = useMinsimTheme();
  const dark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const koreaCanvasRef = useRef<HTMLCanvasElement>(null);
  const personaNumRef = useRef<HTMLSpanElement>(null);
  const counterNumRef = useRef<HTMLSpanElement>(null);
  const badgeRegionRef = useRef<HTMLDivElement>(null);
  const thinkTextRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(normalizeProgress(snapshot));
  const progress = normalizeProgress(snapshot);
  const progressPct = snapshot?.progress_pct ?? (progress.total > 0 ? (progress.done / progress.total) * 100 : 0);
  const canViewResults = resultAvailable ?? (!snapshot || (snapshot.status === 'completed' && snapshot.result_available));

  useEffect(() => {
    progressRef.current = normalizeProgress(snapshot);
    if (counterNumRef.current && progress.hasSnapshot) {
      counterNumRef.current.textContent = progress.done.toLocaleString('ko-KR');
    }
    if (personaNumRef.current && progress.hasSnapshot) {
      personaNumRef.current.textContent = String(progress.done).padStart(3, '0');
    }
  }, [progress.done, progress.hasSnapshot, progress.total, snapshot]);

  useEffect(() => {
    const container = containerRef.current;
    const koreaCanvas = koreaCanvasRef.current;
    if (!container || !koreaCanvas) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let mapRafId = 0;
    let cancelled = false;
    let mainMat: THREE.ShaderMaterial | null = null;
    let gsapTl: gsap.core.Timeline | null = null;
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    const activeIntervals: ReturnType<typeof setInterval>[] = [];

    /* ── Three.js ── */
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(dark ? 0x0D0F12 : 0xFFFFFF, 0.0006);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.z = 700;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(renderer.domElement);
    } catch {
      // WebGL not supported — 3D particles skipped, map + UI still render
    }

    /* ── 별 배경 ── */
    const N = 150;
    const starPos = new Float32Array(N * 3);
    const starSpd = new Float32Array(N);
    const starSz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      starPos[i*3]   = (Math.random() - .5) * 2600;
      starPos[i*3+1] = (Math.random() - .5) * 2000;
      starPos[i*3+2] = (Math.random() - .5) * 1400;
      starSpd[i] = .15 + Math.random() * .7;
      starSz[i]  = 1.2 + Math.random() * 2.2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('a_speed',  new THREE.BufferAttribute(starSpd, 1));
    starGeo.setAttribute('a_size',   new THREE.BufferAttribute(starSz,  1));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(dark ? 0x75A7FF : 0x3385FF) } },
      vertexShader: `uniform float uTime;attribute float a_speed,a_size;varying float vA;
        void main(){vec3 p=position;p.z=mod(position.z+uTime*40.*a_speed+1200.,2400.)-1200.;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=a_size*(900./length(mv.xyz));
        gl_Position=projectionMatrix*mv;vA=.3+.7*smoothstep(0.,600.,abs(p.z));}`,
      fragmentShader: `uniform vec3 uColor;varying float vA;
        void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;
        gl_FragColor=vec4(uColor,(1.-d*2.)*vA*.85);}`,
      transparent: true, depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    /* ── 이미지 처리 ── */
    const CSIZE = 512;
    function prepareImage(img: HTMLImageElement) {
      const c = document.createElement('canvas');
      c.width = c.height = CSIZE;
      const ctx = c.getContext('2d')!;
      const s = Math.min(CSIZE / img.width, CSIZE / img.height);
      ctx.drawImage(img, (CSIZE - img.width * s) / 2, (CSIZE - img.height * s) / 2, img.width * s, img.height * s);
      const data = ctx.getImageData(0, 0, CSIZE, CSIZE).data;
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      return { data, texture: tex };
    }

    function scanDual(d1: Uint8ClampedArray, d2: Uint8ClampedArray, step = 2, thr = 10) {
      const pts: { x1: number; y1: number; x2: number; y2: number; u: number; v: number; a1: number; a2: number }[] = [];
      const half = CSIZE / 2;
      for (let y = 0; y < CSIZE; y += step) {
        for (let x = 0; x < CSIZE; x += step) {
          const i = (y * CSIZE + x) * 4;
          if (d1[i+3] > thr || d2[i+3] > thr) {
            pts.push({
              x1: x - half, y1: -(y - half), x2: x - half, y2: -(y - half),
              u: x, v: (CSIZE - 1) - y,
              a1: d1[i+3] > thr ? 1 : 0,
              a2: d2[i+3] > thr ? 1 : 0,
            });
          }
        }
      }
      return pts;
    }

    function buildParticles(data1: Uint8ClampedArray, data2: Uint8ClampedArray, tex1: THREE.Texture, tex2: THREE.Texture) {
      const pts = scanDual(data1, data2);
      const Np = pts.length;
      const posArr  = new Float32Array(Np * 3);
      const pos2Arr = new Float32Array(Np * 3);
      const hideArr = new Float32Array(Np * 3);
      const coArr   = new Float32Array(Np * 2);
      const selArr  = new Float32Array(Np);
      const spdArr  = new Float32Array(Np);
      const radArr  = new Float32Array(Np);
      const offArr  = new Float32Array(Np);
      const a1Arr   = new Float32Array(Np);
      const a2Arr   = new Float32Array(Np);
      const rnd = (a: number, b: number) => a + Math.random() * (b - a);
      for (let i = 0; i < Np; i++) {
        const p = pts[i];
        posArr[i*3]   = p.x1; posArr[i*3+1]   = p.y1; posArr[i*3+2]   = 0;
        pos2Arr[i*3]  = p.x2; pos2Arr[i*3+1]  = p.y2; pos2Arr[i*3+2]  = 0;
        hideArr[i*3]  = rnd(-1800, 1800);
        hideArr[i*3+1]= rnd(-1200, 1200);
        hideArr[i*3+2]= rnd(-900,   900);
        coArr[i*2] = p.u; coArr[i*2+1] = p.v;
        selArr[i] = 1.0; spdArr[i] = rnd(.3, 1.1);
        radArr[i] = rnd(2, 8); offArr[i] = rnd(0, Math.PI * 2);
        a1Arr[i] = p.a1; a2Arr[i] = p.a2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position',       new THREE.BufferAttribute(posArr,  3));
      geo.setAttribute('a_position2',    new THREE.BufferAttribute(pos2Arr, 3));
      geo.setAttribute('a_hidePosition', new THREE.BufferAttribute(hideArr, 3));
      geo.setAttribute('a_coordinates',  new THREE.BufferAttribute(coArr,   2));
      geo.setAttribute('a_select',       new THREE.BufferAttribute(selArr,  1));
      geo.setAttribute('a_speed',        new THREE.BufferAttribute(spdArr,  1));
      geo.setAttribute('a_radius',       new THREE.BufferAttribute(radArr,  1));
      geo.setAttribute('a_offset',       new THREE.BufferAttribute(offArr,  1));
      geo.setAttribute('a_active1',      new THREE.BufferAttribute(a1Arr,   1));
      geo.setAttribute('a_active2',      new THREE.BufferAttribute(a2Arr,   1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:          { value: 0 },
          uHide:          { value: 1 },
          uMorph:         { value: 0 },
          uMouse:         { value: new THREE.Vector2(99999, 99999) },
          uMouseStrength: { value: 0 },
          tDiffuse1:      { value: tex1 },
          tDiffuse2:      { value: tex2 },
          uImageSize:     { value: new THREE.Vector2(CSIZE, CSIZE) },
        },
        vertexShader:   VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true, depthTest: false, depthWrite: false,
      });
      scene.add(new THREE.Points(geo, mat));
      return mat;
    }

    /* ── 마우스 이벤트 ── */
    let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    let mouseEnterHandler: (() => void) | null = null;
    let mouseLeaveHandler: (() => void) | null = null;

    /* ── 페르소나 사이클 ── */
    let pCount = 0;
    function startCycle() {
      if (cancelled) return;
      if (!mainMat) {
        const t = setTimeout(startCycle, 200);
        pendingTimeouts.push(t);
        return;
      }
      if (reduceMotion) {
        mainMat.uniforms.uHide.value = 0;
        mainMat.uniforms.uMorph.value = 0;
        return;
      }
      const D_SHOW = 2.6, D_WAIT = 2.0, D_HIDE = 1.4;
      const tl = gsap.timeline({ repeat: -1 });
      gsapTl = tl;
      function bump() {
        if (progressRef.current.hasSnapshot) {
          if (personaNumRef.current) personaNumRef.current.textContent = String(progressRef.current.done).padStart(3, '0');
          return;
        }
        pCount++;
        if (personaNumRef.current) personaNumRef.current.textContent = String(pCount).padStart(3, '0');
      }
      tl.call(() => bump());
      tl.to(mainMat!.uniforms.uHide,  { value: 0, duration: D_SHOW, ease: 'power3.out' });
      tl.to({}, { duration: D_WAIT });
      tl.to(mainMat!.uniforms.uHide,  { value: 1, duration: D_HIDE, ease: 'power3.in' });
      tl.call(() => { bump(); mainMat!.uniforms.uMorph.value = 1; });
      tl.to(mainMat!.uniforms.uHide,  { value: 0, duration: D_SHOW, ease: 'power3.out' });
      tl.to({}, { duration: D_WAIT });
      tl.to(mainMat!.uniforms.uHide,  { value: 1, duration: D_HIDE, ease: 'power3.in' });
      tl.call(() => { bump(); mainMat!.uniforms.uMorph.value = 0; });
    }

    /* ── 이미지 로드 ── */
    let loaded = 0;
    const img1 = new Image(), img2 = new Image();
    img1.src = '/persona/image.png';
    img2.src = '/persona/image2.png';
    function onLoad() {
      if (++loaded < 2 || cancelled) return;
      const p1 = prepareImage(img1);
      const p2 = prepareImage(img2);
      mainMat = buildParticles(p1.data, p2.data, p1.texture, p2.texture);
      if (reduceMotion) {
        mainMat.uniforms.uHide.value = 0;
      }

      mouseMoveHandler = (e: MouseEvent) => {
        if (!mainMat) return;
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = -(e.clientY / window.innerHeight) * 2 + 1;
        const dist = camera.position.z;
        const fov  = camera.fov * Math.PI / 180;
        const h    = 2 * Math.tan(fov / 2) * dist;
        const w    = h * camera.aspect;
        mainMat.uniforms.uMouse.value.set(x * w / 2, y * h / 2);
      };
      mouseEnterHandler = () => {
        if (mainMat) gsap.to(mainMat.uniforms.uMouseStrength, { value: 1, duration: 0.4 });
      };
      mouseLeaveHandler = () => {
        if (mainMat) gsap.to(mainMat.uniforms.uMouseStrength, { value: 0, duration: 0.4 });
      };
      if (!reduceMotion) {
        window.addEventListener('mousemove', mouseMoveHandler);
        window.addEventListener('mouseenter', mouseEnterHandler);
        window.addEventListener('mouseleave', mouseLeaveHandler);
      }
    }
    img1.onload = img2.onload = onLoad;

    /* ── 한국 미니맵 ── */
    const mCtx = koreaCanvas.getContext('2d')!;
    const MW = 222, MH = 286, PAD = 13;
    const UW = MW - PAD * 2, UH = MH - PAD * 2;
    const txM = (nx: number) => PAD + nx * UW;
    const tyM = (ny: number) => PAD + ny * UH;

    const regions: Region[] = REGIONS_DEF.map(r => ({
      ...r, dots: [], pillar: null, complete: false, spawning: false, merging: false, _next: null,
    }));
    let interviewCount = 0;
    let mapStartTime = 0;

    function drawOutline() {
      mCtx.beginPath();
      PENINSULA.forEach(([nx, ny], i) => {
        if (i) mCtx.lineTo(txM(nx), tyM(ny));
        else   mCtx.moveTo(txM(nx), tyM(ny));
      });
      mCtx.closePath();
      mCtx.fillStyle = dark ? 'rgba(77,145,255,0.10)' : 'rgba(0,102,255,0.04)'; mCtx.fill();
      mCtx.strokeStyle = dark ? 'rgba(117,167,255,0.42)' : 'rgba(0,102,255,0.24)'; mCtx.lineWidth = 1; mCtx.stroke();
      mCtx.beginPath();
      mCtx.ellipse(txM(JEJU_C[0]), tyM(JEJU_C[1]), JEJU_RX * UW, JEJU_RY * UH, 0, 0, Math.PI * 2);
      mCtx.fillStyle = dark ? 'rgba(77,145,255,0.10)' : 'rgba(0,102,255,0.04)'; mCtx.fill();
      mCtx.strokeStyle = dark ? 'rgba(117,167,255,0.42)' : 'rgba(0,102,255,0.24)'; mCtx.lineWidth = 1; mCtx.stroke();
    }

    function spawnDot(r: Region) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * r.sc;
      r.dots.push({
        x: txM(r.nx + Math.cos(ang) * dist),
        y: tyM(r.ny + Math.sin(ang) * dist * (UH / UW)),
        opacity: 0, radius: 1.2 + Math.random() * .8,
        phase: Math.random() * Math.PI * 2, born: performance.now(),
        merging: false, tx: 0, ty: 0, mb: 0,
      });
    }

    function mergeRegion(r: Region) {
      if (r.merging || r.complete) return;
      r.merging = true;
      const cx = txM(r.nx), cy = tyM(r.ny), now = performance.now();
      r.dots.forEach(d => { d.merging = true; d.tx = cx; d.ty = cy; d.mb = now; });
      const t = setTimeout(() => { r.dots = []; r.complete = true; r.pillar = { born: performance.now() }; }, 1600);
      pendingTimeouts.push(t);
    }

    function drawDots(elapsed: number) {
      const now = performance.now();
      regions.forEach(r => {
        if (!r.spawning || r.complete) return;
        if (r._next === null) r._next = elapsed + .5 + Math.random();
        if (elapsed > r._next && r.dots.length < r.thr * 2) {
          spawnDot(r); interviewCount++;
          r._next = elapsed + .5 + Math.random() * 1.4;
        }
        if (r.dots.length >= r.thr && !r.merging) mergeRegion(r);
        r.dots.forEach(d => {
          const age = (now - d.born) / 1000;
          d.opacity = age < .4 ? age / .4 : 1;
          if (d.merging) { d.x += (d.tx - d.x) * .1; d.y += (d.ty - d.y) * .1; }
          const breath = .65 + .35 * Math.sin(elapsed * 1.8 + d.phase);
          const rv = d.radius * (.78 + .22 * breath);
          const a = d.opacity * breath;
          const g = mCtx.createRadialGradient(d.x, d.y, 0, d.x, d.y, rv * 4);
          g.addColorStop(0,  `rgba(0,102,255,${(a * .65).toFixed(3)})`);
          g.addColorStop(.5, `rgba(0,102,255,${(a * .18).toFixed(3)})`);
          g.addColorStop(1,  'rgba(0,102,255,0)');
          mCtx.beginPath(); mCtx.arc(d.x, d.y, rv * 4, 0, Math.PI * 2); mCtx.fillStyle = g; mCtx.fill();
          mCtx.beginPath(); mCtx.arc(d.x, d.y, rv, 0, Math.PI * 2);
          mCtx.fillStyle = `rgba(0,94,235,${(a * .92).toFixed(3)})`; mCtx.fill();
        });
      });
    }

    function drawPillars(elapsed: number) {
      const now = performance.now();
      regions.forEach(r => {
        if (!r.pillar) return;
        const age = (now - r.pillar.born) / 1000;
        const prog = Math.min(age / 2, 1);
        const cx = txM(r.nx), cy = tyM(r.ny);
        const h = prog * 58;
        const shim = .72 + .28 * Math.sin(elapsed * 2.8 + r.nx * 9);
        const beam = mCtx.createLinearGradient(cx, cy, cx, cy - h);
        beam.addColorStop(0,   `rgba(0,102,255,${(.92 * shim).toFixed(3)})`);
        beam.addColorStop(.35, `rgba(51,133,255,${(.55 * shim).toFixed(3)})`);
        beam.addColorStop(1,   'rgba(0,102,255,0)');
        mCtx.beginPath();
        mCtx.moveTo(cx - 1.5, cy); mCtx.lineTo(cx + 1.5, cy);
        mCtx.lineTo(cx + .4, cy - h); mCtx.lineTo(cx - .4, cy - h);
        mCtx.closePath(); mCtx.fillStyle = beam; mCtx.fill();
        const outer = mCtx.createLinearGradient(cx, cy, cx, cy - h * .9);
        outer.addColorStop(0, `rgba(0,102,255,${(.18 * shim).toFixed(3)})`);
        outer.addColorStop(1, 'rgba(0,102,255,0)');
        mCtx.beginPath();
        mCtx.moveTo(cx - 4, cy); mCtx.lineTo(cx + 4, cy);
        mCtx.lineTo(cx + .8, cy - h * .9); mCtx.lineTo(cx - .8, cy - h * .9);
        mCtx.closePath(); mCtx.fillStyle = outer; mCtx.fill();
        const halo = mCtx.createRadialGradient(cx, cy, 0, cx, cy, 11);
        halo.addColorStop(0,  `rgba(0,102,255,${(.9 * shim).toFixed(3)})`);
        halo.addColorStop(.5, `rgba(0,102,255,${(.35 * shim).toFixed(3)})`);
        halo.addColorStop(1,  'rgba(0,102,255,0)');
        mCtx.beginPath(); mCtx.arc(cx, cy, 11, 0, Math.PI * 2); mCtx.fillStyle = halo; mCtx.fill();
        mCtx.beginPath(); mCtx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        mCtx.fillStyle = `rgba(0,94,235,${shim.toFixed(3)})`; mCtx.fill();
      });
    }

    function mapLoop() {
      const elapsed = (performance.now() - mapStartTime) / 1000;
      mCtx.clearRect(0, 0, MW, MH);
      drawOutline();
      drawDots(elapsed);
      drawPillars(elapsed);
      const actualProgress = progressRef.current;
      const displayCount = actualProgress.hasSnapshot ? actualProgress.done : interviewCount;
      if (counterNumRef.current) counterNumRef.current.textContent = displayCount.toLocaleString('ko-KR');
      const active = regions.filter(r => r.spawning && !r.complete);
      if (badgeRegionRef.current && active.length) {
        badgeRegionRef.current.textContent = active.slice(0, 2).map(r => r.name).join(' · ');
      }
      if (!reduceMotion) mapRafId = requestAnimationFrame(mapLoop);
    }

    function startMap() {
      mapStartTime = performance.now();
      regions.forEach(r => {
        if (reduceMotion) {
          r.spawning = true;
          return;
        }
        const t = setTimeout(() => { r.spawning = true; }, r.delay * 1000);
        pendingTimeouts.push(t);
      });
      mapLoop();
    }

    /* ── 상태 텍스트 ── */
    const PHRASES = ['AI 여론 수집 중', '다양한 관점을 통합하는 중', '지역별 데이터 분석 중', '인터뷰 패턴 처리 중'];
    let pIdx = 0;
    function tickText() {
      pIdx = (pIdx + 1) % PHRASES.length;
      if (thinkTextRef.current) thinkTextRef.current.textContent = PHRASES[pIdx];
    }

    /* ── 시작 ── */
    const initT = setTimeout(() => {
      startCycle();
      startMap();
      if (!reduceMotion) activeIntervals.push(setInterval(tickText, 5200));
    }, 500);
    pendingTimeouts.push(initT);

    /* ── 렌더 루프 ── */
    const startTime = performance.now();
    if (renderer) {
      function loop() {
        const t = (performance.now() - startTime) / 1000;
        starMat.uniforms.uTime.value = t;
        if (mainMat) mainMat.uniforms.uTime.value = t;
        camera.position.x = Math.sin(t * .08) * 30;
        camera.position.y = Math.cos(t * .06) * 20;
        camera.lookAt(0, 0, 0);
        renderer!.render(scene, camera);
        if (!reduceMotion) rafId = requestAnimationFrame(loop);
      }
      loop();
    }

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer?.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(mapRafId);
      gsapTl?.kill();
      gsap.killTweensOf(mainMat?.uniforms.uMouseStrength ?? {});
      pendingTimeouts.forEach(clearTimeout);
      activeIntervals.forEach(clearInterval);
      window.removeEventListener('resize', handleResize);
      if (mouseMoveHandler)  window.removeEventListener('mousemove',   mouseMoveHandler);
      if (mouseEnterHandler) window.removeEventListener('mouseenter',  mouseEnterHandler);
      if (mouseLeaveHandler) window.removeEventListener('mouseleave',  mouseLeaveHandler);
      if (renderer) {
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      }
    };
  }, [dark]);

  const content = (
    <div className="ks-sim-progress" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg)', overflow: 'hidden',
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: 'var(--fg)' }}>
      {/* Three.js canvas */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* UI 오버레이 */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>

        {/* 좌상단: 페르소나 번호 */}
        <div className="ks-sim-processed" style={{ position: 'absolute', top: 30, left: 36 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>PROCESSED</div>
          <span ref={personaNumRef} style={{ display: 'block', fontSize: 32, fontWeight: 700, letterSpacing: -1,
            color: 'var(--fg)', lineHeight: 1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{progress.hasSnapshot ? String(progress.done).padStart(3, '0') : '000'}</span>
        </div>

        {/* 우상단: 배지 */}
        <div className="ks-sim-badges" style={{ position: 'absolute', top: 30, right: 36, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--c-brand)',
            padding: '5px 13px', border: '1px solid var(--lime-line)', borderRadius: 20, background: 'var(--lime-soft)' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--lime)', marginRight: 7, animation: 'simPulse 1.6s ease-in-out infinite' }} />
            인터뷰 진행 중
          </div>
          <div ref={badgeRegionRef} style={{ fontSize: 10, letterSpacing: 2, color: 'var(--fg-faint)',
            padding: '5px 13px', border: '1px solid var(--border)', borderRadius: 20 }}>서울</div>
        </div>

        {/* 중앙: 진행 상태 */}
        <div className="ks-sim-stage-copy" style={{ position: 'absolute', top: 86, left: '50%', transform: 'translateX(-50%)',
          width: 'min(720px, calc(100vw - 360px))', textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--c-brand)', textTransform: 'uppercase' }}>
            {runLabel}
          </div>
          <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 4vw, 54px)', lineHeight: 1.04,
            fontWeight: 700, color: 'var(--fg)', letterSpacing: 0 }}>
            {stageTitle}
          </h1>
          <p style={{ margin: '0 auto', maxWidth: 560, fontSize: 14, lineHeight: 1.7, color: 'var(--fg-faint)' }}>
            {stageBody}
          </p>
          <div style={{ height: 3, margin: '18px auto 0', maxWidth: 340, borderRadius: 999,
            background: 'var(--c-track)', overflow: 'hidden' }} aria-label="실행 진행률">
            <span style={{ display: 'block', width: `${Math.max(3, Math.min(100, progressPct))}%`, height: '100%',
              borderRadius: 999, background: 'linear-gradient(90deg, #3385FF, #0066FF)',
              boxShadow: '0 0 18px rgba(0,102,255,0.24)', transition: 'width .45s ease' }} />
          </div>
          <div className="ks-sim-github-slot" style={{ marginTop: 16, pointerEvents: 'auto' }}>
            <GitHubStarCta variant="immersive" />
          </div>
        </div>

        {/* 하단 중앙: 상태 텍스트 */}
        <div className="ks-sim-thinking" style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          fontSize: 12, letterSpacing: 3, color: 'var(--fg-faint)', whiteSpace: 'nowrap', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span ref={thinkTextRef}>AI 여론 수집 중</span>
          <ThinkingIndicator className="ks-sim-thinking-indicator" label={null} />
        </div>

        {/* 좌하단: 한국 지도 패널 */}
        <div className="ks-sim-map-panel" style={{ position: 'absolute', bottom: 26, left: 28, width: 250,
          background: 'var(--color-bg-glass)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 14, backdropFilter: 'blur(10px)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: 'var(--c-brand)',
            textTransform: 'uppercase', marginBottom: 10 }}>지역별 인터뷰 현황</div>
          <canvas ref={koreaCanvasRef} width={222} height={286} style={{ display: 'block', borderRadius: 5 }} />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span ref={counterNumRef} style={{ fontSize: 20, fontWeight: 700,
              color: 'var(--lime)', letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{progress.done.toLocaleString('ko-KR')}</span>
            <span style={{ fontSize: 10, color: 'var(--fg-faint)', letterSpacing: 1 }}>
              {progress.hasSnapshot ? `/ ${progress.total.toLocaleString('ko-KR')}명 중 실제 완료` : '/ (아직고정값) 인터뷰 완료'}
            </span>
          </div>
        </div>

        {/* 우하단: 실행 제어 */}
        <div className="ks-sim-actions" style={{ position: 'absolute', bottom: 36, right: 36, pointerEvents: 'auto' }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{ cursor: 'pointer', background: 'transparent',
                border: '1px solid var(--border-strong)', color: 'var(--fg-dim)',
                fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
                padding: '12px 22px', borderRadius: 50, fontFamily: 'inherit',
                transition: 'border-color .3s, color .3s', marginRight: 10 }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            disabled={!canViewResults}
            onClick={() => {
              if (canViewResults) onComplete();
            }}
            style={{ cursor: canViewResults ? 'pointer' : 'default', background: 'transparent',
              border: `1px solid ${canViewResults ? 'var(--lime)' : 'var(--border)'}`,
              color: canViewResults ? 'var(--c-brand)' : 'var(--fg-ghost)',
              fontSize: 12, letterSpacing: 5, textTransform: 'uppercase',
              padding: '12px 32px', borderRadius: 50, fontFamily: 'inherit',
              transition: 'border-color .3s, box-shadow .3s, color .3s' }}
            onMouseEnter={e => {
              if (!canViewResults) return;
              const el = e.currentTarget;
              el.style.borderColor = 'var(--c-brand)';
              el.style.boxShadow = '0 0 0 3px rgba(0,102,255,0.16)';
            }}
            onMouseLeave={e => {
              if (!canViewResults) return;
              const el = e.currentTarget;
              el.style.borderColor = 'var(--lime)';
              el.style.boxShadow = 'none';
            }}
          >
            {canViewResults ? completeLabel : pendingLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes simPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .3; transform: scale(.65); }
        }
        @media (max-width: 860px) {
          .ks-sim-stage-copy {
            top: 96px !important;
            left: 20px !important;
            right: 20px !important;
            width: auto !important;
            transform: none !important;
            text-align: left !important;
          }
          .ks-sim-stage-copy h1 {
            font-size: clamp(28px, 9vw, 42px) !important;
          }
          .ks-sim-stage-copy p {
            max-width: 420px !important;
          }
          .ks-sim-map-panel {
            left: 16px !important;
            bottom: 88px !important;
            width: min(250px, calc(100vw - 32px)) !important;
          }
          .ks-sim-actions {
            right: 16px !important;
            bottom: 24px !important;
          }
          .ks-sim-badges {
            right: 16px !important;
            top: 18px !important;
            align-items: flex-end !important;
            flex-direction: column !important;
          }
          .ks-sim-processed {
            left: 16px !important;
            top: 18px !important;
          }
          .ks-sim-thinking {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );

  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

function normalizeProgress(snapshot: RunSnapshot | null | undefined) {
  if (!snapshot) return { hasSnapshot: false, done: 0, total: 0 };
  const total = Math.max(0, snapshot.total_count || snapshot.sample_size || 0);
  return {
    hasSnapshot: total > 0,
    done: Math.max(0, Math.min(snapshot.done_count, total || snapshot.done_count)),
    total,
  };
}
