import { useEffect, useRef } from "react";
import LAND from "./land-points.json";
import { COUNTRY_CENTROIDS } from "./countryCentroids";

export type GlobePoint = { code: string; value: number };

const RAD = Math.PI / 180;
const land: [number, number][] = [];
for (let i = 0; i < (LAND as number[]).length; i += 2) land.push([(LAND as number[])[i], (LAND as number[])[i + 1]]);

/** Dotted globe that slowly turns, with a glowing green point per country (size follows the value).
 *  Decorative companion to a ranking: the numbers live in the list next to it. Canvas, no dependency. */
export function Globe({ points, className }: { points: GlobePoint[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Start with the biggest market a little left of center, so the globe turns it into view.
    const top = [...pointsRef.current].sort((a, b) => b.value - a.value).find((p) => COUNTRY_CENTROIDS[p.code]);
    let rot = top ? -COUNTRY_CENTROIDS[top.code][0] - 30 : 20;
    const tilt = 22;
    let frame = 0;
    let size = { w: 0, h: 0, dpr: 1 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (t: number) => {
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (w > 0) {
        const R = Math.min(w, h) * 0.44;
        const cx = w / 2;
        const cy = h / 2;
        const lam0 = -rot * RAD;
        const phi0 = tilt * RAD;
        const sinP0 = Math.sin(phi0);
        const cosP0 = Math.cos(phi0);
        // Orthographic projection; returns null on the far side. z = cos of the angular distance to the center.
        const project = (lon: number, lat: number): [number, number, number] | null => {
          const lam = lon * RAD - lam0;
          const phi = lat * RAD;
          const cosPhi = Math.cos(phi);
          const z = sinP0 * Math.sin(phi) + cosP0 * cosPhi * Math.cos(lam);
          if (z < 0) return null;
          return [cx + R * cosPhi * Math.sin(lam), cy - R * (cosP0 * Math.sin(phi) - sinP0 * cosPhi * Math.cos(lam)), z];
        };

        const halo = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.14);
        halo.addColorStop(0, "rgba(124, 92, 255, 0.32)");
        halo.addColorStop(1, "rgba(124, 92, 255, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
        ctx.fill();
        const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
        body.addColorStop(0, "#15151a");
        body.addColorStop(1, "#040405");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(150, 130, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        for (const [lon, lat] of land) {
          const p = project(lon, lat);
          if (!p) continue;
          ctx.fillStyle = `rgba(225, 228, 240, ${(0.1 + p[2] * 0.65).toFixed(3)})`;
          ctx.fillRect(p[0] - 0.75, p[1] - 0.75, 1.5, 1.5);
        }

        const pts = pointsRef.current;
        const max = Math.max(0, ...pts.map((p) => p.value));
        pts.forEach((pt, i) => {
          const c = COUNTRY_CENTROIDS[pt.code];
          if (!c || max <= 0) return;
          const p = project(c[0], c[1]);
          if (!p) return;
          const [x, y, z] = p;
          const k = Math.sqrt(pt.value / max);
          const pulse = reduce ? 0.5 : Math.sin(t / 650 + i) * 0.5 + 0.5;
          const ang = Math.atan2(y - cy, x - cx);
          const len = (14 + 30 * k) * z;
          const beam = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
          beam.addColorStop(0, "rgba(62, 224, 122, 0.85)");
          beam.addColorStop(1, "rgba(62, 224, 122, 0)");
          ctx.strokeStyle = beam;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
          ctx.stroke();
          const gr = 8 + 9 * k + 4 * pulse;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, gr);
          glow.addColorStop(0, "rgba(62, 224, 122, 0.5)");
          glow.addColorStop(1, "rgba(62, 224, 122, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, gr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#86ffb2";
          ctx.beginPath();
          ctx.arc(x, y, 1.6 + 2.2 * k, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (!reduce) {
        rot += 0.05;
        frame = requestAnimationFrame(draw);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={`globe${className ? ` ${className}` : ""}`} aria-hidden />;
}
