import { AppLabel, Badge, Card, Segmented } from "@/ui";
import { FIELD_LABELS } from "../asoRules";
import type { AppMetaVM, Counter, LocaleVM } from "../useAsoViewModel";

function Meter({ c }: { c: Counter }) {
  const tone = c.over ? "over" : c.limit - c.used >= (c.key === "keywords" ? 5 : 8) || c.used === 0 ? "low" : "full";
  return (
    <span className={`aso-meter aso-meter--${tone}`} title={`${FIELD_LABELS[c.key]} : ${c.used} / ${c.limit} caractères`}>
      <span className="aso-meter__track">
        <span className="aso-meter__fill" style={{ width: `${c.ratio * 100}%` }} />
      </span>
      <span className="aso-meter__value num">
        {c.used}
        <span className="muted">/{c.limit}</span>
      </span>
    </span>
  );
}

function LocaleDetail({ l }: { l: LocaleVM }) {
  const field = (key: "name" | "subtitle" | "promo", text: string) => {
    const c = l.counters.find((x) => x.key === key)!;
    return (
      <div className="aso-field">
        <div className="aso-field__head">
          <span>{FIELD_LABELS[key]}</span>
          <Meter c={c} />
        </div>
        <div className={text ? "aso-field__text" : "aso-field__text muted"}>{text || "vide"}</div>
      </div>
    );
  };
  const kw = l.counters.find((x) => x.key === "keywords")!;
  return (
    <div className="aso-detail">
      <div className="aso-detail__fields">
        {field("name", l.name)}
        {field("subtitle", l.subtitle)}
        <div className="aso-field">
          <div className="aso-field__head">
            <span>Mots-clés</span>
            <Meter c={kw} />
          </div>
          {l.keywordChips.length ? (
            <div className="aso-chips">
              {l.keywordChips.map((k, i) => (
                <span key={`${k.text}-${i}`} className={k.duplicate ? "aso-chip aso-chip--dup" : "aso-chip"} title={k.duplicate ? "Mot déjà indexé ailleurs (nom, sous-titre ou répété)" : undefined}>
                  {k.text}
                </span>
              ))}
            </div>
          ) : (
            <div className="aso-field__text muted">vide</div>
          )}
        </div>
        {field("promo", l.promotionalText)}
      </div>
      <div className="aso-detail__issues">
        <div className="aso-field__head">
          <span>À corriger</span>
          {l.descriptionLength != null && <span className="muted num">Description {l.descriptionLength}/4000</span>}
        </div>
        {l.issues.length ? (
          <ul className="aso-issues">
            {l.issues.map((i) => (
              <li key={i.label}>
                <Badge status={i.severity === "neutral" ? "neutral" : i.severity}>{i.severity === "critical" ? "Bloquant" : i.severity === "warning" ? "À revoir" : "Info"}</Badge>
                <span>{i.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Badge status="good">Rien à signaler</Badge>
        )}
      </div>
    </div>
  );
}

export function MetadataCard({ app }: { app: AppMetaVM }) {
  return (
    <Card
      title={
        <span className="row">
          <AppLabel slug={app.slug} /> <span className="muted">· la fiche exploite-t-elle chaque caractère ?</span>
        </span>
      }
      subtitle={`${app.versionLabel} · ${app.locales.length} langue${app.locales.length > 1 ? "s" : ""}`}
      action={app.channels.length > 1 ? <Segmented label="Version" value={app.channel} options={app.channels} onChange={app.setChannel} /> : undefined}
      flush
    >
      <div className="table-wrap">
        <table className="table aso-loc-table">
          <thead>
            <tr>
              <th>Langue</th>
              <th>Nom</th>
              <th>Sous-titre</th>
              <th>Mots-clés</th>
              <th>Promo</th>
              <th className="r">Alertes</th>
            </tr>
          </thead>
          <tbody>
            {app.locales.map((l) => (
              <tr key={l.locale} aria-selected={app.selected?.locale === l.locale} onClick={() => app.selectLocale(l.locale)}>
                <td>
                  <button type="button" className="aso-link" onClick={() => app.selectLocale(l.locale)}>
                    {l.label}
                  </button>
                  <span className="muted aso-code"> {l.locale}</span>
                </td>
                {l.counters.map((c) => (
                  <td key={c.key}>
                    <Meter c={c} />
                  </td>
                ))}
                <td className="r">{l.warningCount ? <Badge status={l.issues.some((i) => i.severity === "critical") ? "critical" : "warning"}>{l.warningCount}</Badge> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {app.selected && (
        <div className="aso-detail-wrap">
          <div className="aso-detail__title">{app.selected.label}</div>
          <LocaleDetail l={app.selected} />
        </div>
      )}
    </Card>
  );
}
