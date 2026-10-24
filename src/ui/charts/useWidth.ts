import { useCallback, useEffect, useState } from "react";

/** Measures an element's width. Returns a callback ref, so it keeps working when the measured
    element is swapped (empty state → chart) instead of observing a detached node. */
export function useWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => setNode(el), []);
  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [node]);
  return [ref, width] as const;
}
