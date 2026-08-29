/**
 * Read-only escalation briefing — the page a teammate opens from a token URL.
 * Host fetches the brief; this brick renders it. No login, no host chrome.
 */
import type { EscalationBriefData } from '../src/dashboard';
import { tierMeta } from '../src/dashboard';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtConfidence(c: number): string {
  return `${Math.round(c <= 1 ? c * 100 : c)} %`;
}

function RefLine({ line }: { line: string }) {
  const url = line.match(/https?:\/\/\S+/)?.[0];
  if (!url) return <div>{line}</div>;
  const label = line.replace(url, '').replace(/\s*[·:]\s*$/, '').trim();
  return (
    <div>
      {label ? <span style={{ color: 'var(--sub-mute)' }}>{label} · </span> : null}
      <a href={url} target="_blank" rel="noreferrer">
        {url.replace(/^https?:\/\//, '')}
      </a>
    </div>
  );
}

export function EscalationBriefView({ brief }: { brief: EscalationBriefData }) {
  const lang = brief.lang ?? 'en';
  const meta = tierMeta(brief.pyramid.tier, lang);
  const problem = brief.problem;
  const refs = brief.refs ?? [];

  return (
    <article className="sub-root">
      <p className="sub-kicker">{lang === 'fr' ? 'Escalade · lecture seule' : 'Escalation · read only'}</p>
      <h1 className="sub-title">{brief.subject.name}</h1>
      <div className="sub-meta">
        {brief.subject.domain ? <span>{brief.subject.domain}</span> : null}
        {brief.subject.blocker ? <span className="sub-mono sub-warn">{brief.subject.blocker}</span> : null}
        <span className="sub-mono sub-accent">{meta.label}</span>
      </div>

      <section className="sub-why">
        <p>{brief.pyramid.why}</p>
        {brief.pyramid.reasons.length > 0 ? (
          <p className="sub-reasons">{brief.pyramid.reasons.join(' · ')}</p>
        ) : null}
      </section>

      <section className="sub-section">
        <h2>{lang === 'fr' ? 'La demande' : 'The ask'}</h2>
        <blockquote className="sub-ask">{brief.ask.body}</blockquote>
      </section>

      {problem?.explanation || problem?.recommendation ? (
        <section className="sub-section">
          <h2>{lang === 'fr' ? 'Le problème' : 'The problem'}</h2>
          {problem.explanation ? <p className="sub-prose">{problem.explanation}</p> : null}
          {problem.recommendation ? <p className="sub-prose">{problem.recommendation}</p> : null}
          {problem.confidence != null ? (
            <p className="sub-empty" style={{ marginTop: '0.5rem' }}>
              {lang === 'fr' ? 'confiance' : 'confidence'} {fmtConfidence(problem.confidence)}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="sub-section">
        <h2>Timeline</h2>
        {brief.timeline.length === 0 ? (
          <p className="sub-empty">{lang === 'fr' ? "Pas encore d'historique." : 'No history recorded yet.'}</p>
        ) : (
          <ol className="sub-tl">
            {brief.timeline.map((item, i) => (
              <li key={`${item.at}-${i}`}>
                <time dateTime={item.at}>
                  {fmtWhen(item.at)} · {item.kind}
                </time>
                <p className="sub-prose">{item.summary}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {refs.length > 0 ? (
        <section className="sub-section">
          <h2>{lang === 'fr' ? 'Références' : 'References'}</h2>
          <div className="sub-refs">
            {refs.map((line) => (
              <RefLine key={line} line={line} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="sub-foot">
        {lang === 'fr'
          ? 'Le lien suffit — pas de compte. Page en lecture seule.'
          : 'The link is the access — no account. Read only.'}
      </p>
    </article>
  );
}
