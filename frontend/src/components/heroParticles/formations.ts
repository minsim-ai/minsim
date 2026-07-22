export type FormationKind = 'cloud' | 'crowd';

const SAMPLE_W = 1200;
const SAMPLE_H = 540;
const WORLD_W = 3.6;
const WORLD_H = 2.0;
// Center formations vertically inside the contained hero box.
const Y_OFFSET = 0;

export function generateFormation(kind: FormationKind, count: number): Float32Array {
  if (typeof window === 'undefined') {
    return new Float32Array(count * 3);
  }
  if (kind === 'cloud') return cloud(count);
  return sampleCanvas(drawCrowd(), count);
}

function cloud(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = 0.85 + Math.pow(Math.random(), 2.0) * 0.8;
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.05;
    out[i * 3 + 1] = r * Math.cos(phi) * 0.85 + Y_OFFSET;
    out[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) * 0.9;
  }
  return out;
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SAMPLE_W, SAMPLE_H);
  ctx.fillStyle = '#fff';
  return { canvas, ctx };
}

function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.beginPath();
  ctx.arc(cx, cy - 22 * scale, 18 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 32 * scale, cy + 40 * scale);
  ctx.quadraticCurveTo(cx - 30 * scale, cy - 4 * scale, cx, cy - 6 * scale);
  ctx.quadraticCurveTo(cx + 30 * scale, cy - 4 * scale, cx + 32 * scale, cy + 40 * scale);
  ctx.lineTo(cx - 32 * scale, cy + 40 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawCrowd(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas();
  const rows = [
    { y: 220, count: 13, scale: 1.4, offset: 0 },
    { y: 280, count: 15, scale: 1.3, offset: 36 },
    { y: 340, count: 17, scale: 1.2, offset: 0 },
    { y: 400, count: 19, scale: 1.1, offset: 32 },
    { y: 460, count: 21, scale: 1.0, offset: 0 },
  ];
  for (const row of rows) {
    const spacing = SAMPLE_W / (row.count + 1);
    for (let i = 0; i < row.count; i++) {
      const x = spacing * (i + 1) + row.offset;
      drawHead(ctx, x, row.y, row.scale);
    }
  }
  return canvas;
}

function sampleCanvas(canvas: HTMLCanvasElement, count: number): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  const candidates: number[] = [];
  for (let y = 0; y < SAMPLE_H; y += 1) {
    for (let x = 0; x < SAMPLE_W; x += 1) {
      const i = (y * SAMPLE_W + x) * 4;
      if (data[i] > 128) {
        candidates.push(x, y);
      }
    }
  }
  const out = new Float32Array(count * 3);
  if (candidates.length === 0) return cloud(count);
  const totalCandidates = candidates.length / 2;
  for (let i = 0; i < count; i++) {
    const idx = (Math.random() * totalCandidates) | 0;
    const cx = candidates[idx * 2];
    const cy = candidates[idx * 2 + 1];
    const jx = cx + Math.random();
    const jy = cy + Math.random();
    const wx = (jx / SAMPLE_W - 0.5) * WORLD_W;
    const wy = -(jy / SAMPLE_H - 0.5) * WORLD_H + Y_OFFSET;
    const wz = (Math.random() - 0.5) * 0.7;
    out[i * 3] = wx;
    out[i * 3 + 1] = wy;
    out[i * 3 + 2] = wz;
  }
  return out;
}
