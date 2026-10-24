/**
 * The progress ring from the new Home: a soft field of dots with an inner ring that fills
 * (dark dots) as the share grows, ending in one warm dot. Pure SVG, no JavaScript.
 */
export function DotRing({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  const size = 260, c = size / 2;
  const field: [number, number][] = [];
  const step = 10.5;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      const d = Math.hypot(x - c, y - c);
      if (d < c - 6 && d > 70) field.push([x, y]);
    }
  }
  const n = 28, r = 52;
  const done = Math.round(v * n);
  const ring = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  });
  return (
    <svg className="dot-ring" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {field.map(([x, y], i) => <circle key={i} className="faint" cx={x} cy={y} r={1.15} />)}
      {ring.map(([x, y], i) => (
        <circle key={`r${i}`} className={i < done ? "done" : "faint"} cx={x} cy={y} r={i < done ? 3.6 : 2.4} />
      ))}
      {done > 0 && done < n && <circle className="glow" cx={ring[done - 1][0]} cy={ring[done - 1][1]} r={5} />}
    </svg>
  );
}
