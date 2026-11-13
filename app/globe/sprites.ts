// Small images for particles and billboards on the globe, drawn once on a canvas.

function sprite(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  return canvas;
}

let glowImage: HTMLCanvasElement | null = null;
let puffImage: HTMLCanvasElement | null = null;

/** A soft round glow, white in the middle. */
export function glow(): HTMLCanvasElement {
  glowImage ??= sprite((ctx, n) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  });
  return glowImage;
}

/** A lumpy puff of smoke: a few overlapping soft blobs, lighter on top. */
export function puff(): HTMLCanvasElement {
  puffImage ??= sprite((ctx, n) => {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 9; i++) {
      const r = n * (0.16 + random() * 0.14);
      const x = n / 2 + (random() - 0.5) * n * 0.36;
      const y = n / 2 + (random() - 0.5) * n * 0.36;
      const shade = Math.round(205 + 50 * (1 - y / n));
      const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, `rgba(${shade},${shade},${shade},0.95)`);
      g.addColorStop(0.7, `rgba(${shade - 30},${shade - 30},${shade - 30},0.55)`);
      g.addColorStop(1, 'rgba(160,160,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 128);
  return puffImage;
}

