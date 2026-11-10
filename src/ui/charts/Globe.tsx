import { useEffect, useRef } from "react";
import LAND from "./land-points.json";
import { COUNTRY_CENTROIDS } from "./countryCentroids";

/** One country on the globe. label/valueLabel feed the hover tooltip. */
export type GlobePoint = { code: string; value: number; label?: string; valueLabel?: string };

const RAD = Math.PI / 180;
const AUTO_SPEED = 0.05; // degrees per frame when idle
const IDLE_MS = 2500; // auto-rotation resumes this long after the last interaction
const land: [number, number][] = [];
for (let i = 0; i < (LAND as number[]).length; i += 2) land.push([(LAND as number[])[i], (LAND as number[])[i + 1]]);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Shortest signed angle from a to b, in degrees. */
const angleDelta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** Dotted globe with a glowing green point per country (size follows the value).
 *  Turns on its own; drag to spin it (with inertia), hover a point for its value, click a point to bring it to the front.
 *  Canvas, no dependency. Horizontal drags only on touch screens, so the page still scrolls. */
export function Globe({ points, className }: { points: GlobePoint[]; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    const canvas = ref.current;
    const tip = tipRef.current;
    if (!canvas || !tip) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // View state. rot: the longitude at the center is -rot. tilt: latitude at the center.
    const top = [...pointsRef.current].sort((a, b) => b.value - a.value).find((p) => COUNTRY_CENTROIDS[p.code]);
    const view = { rot: top ? -COUNTRY_CENTROIDS[top.code][0] - 30 : 20, tilt: 22, vRot: 0, vTilt: 0 };
    let target: { rot: number; tilt: number } | null = null; // click-to-focus animation
    let drag: { id: number; x: number; y: number; t: number; moved: number } | null = null;
    let lastInteraction = -Infinity;
    let hovered: string | null = null;
    let screen: { code: string; x: number; y: number; r: number }[] = [];
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

    const radius = () => Math.min(size.w, size.h) * 0.44;

    const draw = (t: number) => {
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      screen = [];
      if (w > 0) {
        const R = radius();
        const cx = w / 2;
        const cy = h / 2;
        const lam0 = -view.rot * RAD;
        const phi0 = view.tilt * RAD;
        const sinP0 = Math.sin(phi0);
        const cosP0 = Math.cos(phi0);
        // Orthographic projection; null on the far side. z = cos of the angular distance to the center.
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
          const isHover = hovered === pt.code;
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
          const gr = 8 + 9 * k + 4 * pulse + (isHover ? 6 : 0);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, gr);
          glow.addColorStop(0, `rgba(62, 224, 122, ${isHover ? 0.75 : 0.5})`);
          glow.addColorStop(1, "rgba(62, 224, 122, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, gr, 0, Math.PI * 2);
          ctx.fill();
          const dot = 1.6 + 2.2 * k + (isHover ? 1.5 : 0);
          ctx.fillStyle = isHover ? "#ffffff" : "#86ffb2";
          ctx.beginPath();
          ctx.arc(x, y, dot, 0, Math.PI * 2);
          ctx.fill();
          if (isHover) {
            ctx.strokeStyle = "rgba(134, 255, 178, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, dot + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          screen.push({ code: pt.code, x, y, r: Math.max(10, dot + 6) });
        });
      }

      // Motion: focus animation > drag (handled in events) > inertia > auto-rotation.
      if (target) {
        const dr = angleDelta(view.rot, target.rot);
        const dt = target.tilt - view.tilt;
        view.rot += dr * 0.08;
        view.tilt += dt * 0.08;
        if (Math.abs(dr) < 0.1 && Math.abs(dt) < 0.1) target = null;
      } else if (!drag) {
        if (Math.abs(view.vRot) > 0.01 || Math.abs(view.vTilt) > 0.01) {
          view.rot += view.vRot;
          view.tilt = clamp(view.tilt + view.vTilt, -60, 60);
          view.vRot *= 0.94;
          view.vTilt *= 0.9;
        } else if (!reduce && hovered == null && performance.now() - lastInteraction > IDLE_MS) {
          view.rot += AUTO_SPEED;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) => {
      let best: (typeof screen)[number] | null = null;
      let bestD = Infinity;
      for (const s of screen) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= s.r && d < bestD) (best = s), (bestD = d);
      }
      return best;
    };
    const showTip = (code: string | null, x = 0, y = 0) => {
      hovered = code;
      const pt = code ? pointsRef.current.find((p) => p.code === code) : null;
      if (!pt) {
        tip.hidden = true;
        canvas.style.cursor = drag ? "grabbing" : "grab";
        return;
      }
      tip.hidden = false;
      tip.replaceChildren(Object.assign(document.createElement("strong"), { textContent: pt.label ?? pt.code }), Object.assign(document.createElement("span"), { textContent: pt.valueLabel ?? String(pt.value) }));
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, calc(-100% - 14px))`;
      canvas.style.cursor = "pointer";
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      target = null;
      view.vRot = view.vTilt = 0;
      lastInteraction = performance.now();
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const now = performance.now();
        const degPerPx = 180 / (Math.PI * Math.max(60, radius())); // ~ the surface follows the pointer
        view.rot += dx * degPerPx;
        view.tilt = clamp(view.tilt + dy * degPerPx, -60, 60);
        const dt = Math.max(8, now - drag.t);
        view.vRot = ((dx * degPerPx) / dt) * 16;
        view.vTilt = ((dy * degPerPx) / dt) * 16;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.t = now;
        lastInteraction = now;
        showTip(null);
        return;
      }
      const s = hit(x, y);
      if (s) lastInteraction = performance.now();
      showTip(s?.code ?? null, s?.x, s?.y);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasClick = drag.moved < 5;
      // A pause before release cancels the throw.
      if (performance.now() - drag.t > 80) view.vRot = view.vTilt = 0;
      drag = null;
      lastInteraction = performance.now();
      canvas.style.cursor = "grab";
      if (wasClick) {
        const { x, y } = local(e);
        const s = hit(x, y);
        const c = s && COUNTRY_CENTROIDS[s.code];
        if (c) {
          // Bring the clicked country to the front and keep its tooltip up.
          target = { rot: -c[0], tilt: clamp(c[1], -60, 60) };
          view.vRot = view.vTilt = 0;
          if (e.pointerType !== "mouse") showTip(s.code, s.x, s.y);
        } else if (e.pointerType !== "mouse") showTip(null);
      }
    };
    const onLeave = () => {
      if (!drag) showTip(null);
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`globe${className ? ` ${className}` : ""}`}>
      <canvas ref={ref} aria-label="Globe des ventes par pays : glisser pour le faire tourner, survoler un point pour son montant" role="img" />
      <div ref={tipRef} className="globe__tip" hidden />
    </div>
  );
}
