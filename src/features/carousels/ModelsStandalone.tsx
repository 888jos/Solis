import { ModelsView } from "./components/ModelsView";
import "./carousels.css";

/** Dev only (/modeles on the Mac): the models gallery without sign-in. It reads Carousel Factory's files through the
 *  Vite dev server and touches no Convex data, so it needs no access check. */
export function ModelsStandalone() {
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div className="stack f-carousels">
        <h1 style={{ margin: 0, fontSize: 22 }}>Modèles de carrousels</h1>
        <ModelsView />
      </div>
    </div>
  );
}
