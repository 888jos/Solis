import type { To } from "react-router-dom";
import { useSearchParams } from "react-router-dom";

/** Link builder to the chart explorer on a metric, keeping the global period and app filters. */
export function useExplorerLink() {
  const [params] = useSearchParams();
  return (metric: string, opts: { seg?: string; app?: string } = {}): To => {
    const q = new URLSearchParams({ m: metric });
    const p = params.get("p");
    if (p) q.set("p", p);
    const app = opts.app ?? params.get("app");
    if (app) q.set("app", app);
    if (opts.seg) q.set("seg", opts.seg);
    return { pathname: "/graphiques", search: `?${q}` };
  };
}
