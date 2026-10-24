import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** One page-level URL parameter (tab, onboarding flow, explorer event…), other params kept as they are. */
export function useUrlParam(name: string, fallback: string): [string, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const set = useCallback(
    (next: string | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next == null || next === fallback) p.delete(name);
          else p.set(name, next);
          return p;
        },
        { replace: false },
      ),
    [name, fallback, setParams],
  );
  return [value, set];
}
