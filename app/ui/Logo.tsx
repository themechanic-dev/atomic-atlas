// The mark as a component: still for the top bar, moving for the "working" indicator.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { prefersReducedMotion } from '../state/settings';
import { logoMarkup, logoPose, variantForSize, type LogoVariant } from './logo';

let counter = 0;

interface LogoProps {
  size: number;
  animated?: boolean;
  variant?: LogoVariant;
  background?: boolean;
  label?: string;
}

export function Logo({ size, animated = false, variant, background = false, label }: LogoProps) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useMemo(() => `l${++counter}`, []);
  const v = variant ?? variantForSize(size);
  const markup = useMemo(() => logoMarkup({ variant: v, uid, background }), [v, uid, background]);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !animated) return;
    const ring = svg.querySelector<SVGGElement>('[data-part="ring"]');
    const count = logoPose(0, v).electrons.length;
    const back = Array.from({ length: count }, (_, i) => svg.querySelector<SVGCircleElement>(`[data-part="e${i}back"]`));
    const front = Array.from({ length: count }, (_, i) => svg.querySelector<SVGCircleElement>(`[data-part="e${i}front"]`));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const pose = logoPose((now - start) / 1000, v, prefersReducedMotion());
      ring?.setAttribute('transform', `rotate(${pose.ringDeg.toFixed(2)})`);
      pose.electrons.forEach((e, i) => {
        for (const [dot, visible, opacity] of [
          [back[i], !e.front, '0.55'],
          [front[i], e.front, '1'],
        ] as const) {
          if (!dot) continue;
          dot.setAttribute('cx', e.x.toFixed(2));
          dot.setAttribute('cy', e.y.toFixed(2));
          dot.setAttribute('opacity', visible ? opacity : '0');
        }
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, v, markup]);

  return (
    <svg
      ref={ref}
      class="logo"
      width={size}
      height={size}
      viewBox="-100 -100 200 200"
      role="img"
      aria-label={label ?? 'Atomic Atlas'}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
