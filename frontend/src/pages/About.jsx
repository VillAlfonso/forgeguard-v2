import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const CATEGORY_META = {
  Traced:            { id: 'traced',          code: 'TRC', icon: '📋', color: '#3b82f6' },
  Alteration:        { id: 'alteration',      code: 'ALT', icon: '✏️', color: '#dc2626' },
  Digital:           { id: 'digital',         code: 'DIG', icon: '💻', color: '#8b5cf6' },
  Obliteration:      { id: 'obliteration',    code: 'OBL', icon: '◼',  color: '#f97316' },
  'Sympathetic Ink': { id: 'sympathetic_ink', code: 'SYM', icon: '🔬', color: '#22c55e' },
  Currency:          { id: 'currency',        code: 'CUR', icon: '💵', color: '#eab308' },
};

export default function About() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAbout()
      .then(setInfo)
      .catch(err => setError(err.message || 'Failed to load info.'));
  }, []);

  if (error) return <div style={{ padding: 32, color: '#f87171' }}>{error}</div>;
  if (!info) return <div style={{ padding: 32, color: '#a3a3a3' }}>Loading…</div>;

  const totals = info.totals;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p className="mono" style={{ fontSize: 11, color: '#f5c518', letterSpacing: 4, marginBottom: 8 }}>
          ◆ HOW IT WORKS · LIMITATIONS · DATASET ◆
        </p>
        <h1 className="oswald" style={{ fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          About Revelator
        </h1>
        <p style={{ color: '#a3a3a3', maxWidth: 700, lineHeight: 1.6, fontSize: 14 }}>
          A transparent look at what the system does, what it doesn't, and exactly how much
          training data each detector has seen.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Stat label="Classes" value={totals.classes} />
        <Stat label="Trained" value={`${totals.trained_classes} / ${totals.classes}`} color="#22c55e" />
        <Stat label="Dataset Images" value={totals.total_dataset_images.toLocaleString()} color="#f5c518" />
        <Stat label="Min Acceptable" value={totals.limited_data_threshold.toLocaleString()} color="#a3a3a3" />
      </div>

      <Section title="How a scan works">
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {info.pipeline.map(p => (
            <li key={p.step} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #1a1a1a' }}>
              <span className="oswald" style={{
                flex: '0 0 auto', width: 36, height: 36, borderRadius: 4,
                background: '#f5c518', color: '#000', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontWeight: 700,
              }}>{p.step}</span>
              <div>
                <div className="oswald" style={{ fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 13, color: '#a3a3a3', lineHeight: 1.6 }}>{p.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="What the verdicts mean">
        <VerdictRow level="forged"               color="#dc2626" text={info.verdict_meaning.forged} />
        <VerdictRow level="suspicious"           color="#f97316" text={info.verdict_meaning.suspicious} />
        <VerdictRow level="no forgery detected"  color="#22c55e" text={info.verdict_meaning.no_forgery_detected} />
        <VerdictRow level="not a document"       color="#737373" text={info.verdict_meaning.not_a_document} />
      </Section>

      <Section title="Limitations">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {info.limitations.map((l, i) => (
            <li key={i} style={{
              display: 'flex', gap: 12, padding: '10px 0',
              borderBottom: i < info.limitations.length - 1 ? '1px solid #1a1a1a' : 'none',
              fontSize: 14, color: '#d4d4d4', lineHeight: 1.6,
            }}>
              <span style={{ color: '#f97316', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: '0 0 auto' }}>
                ⚠
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Training data — full disclosure">
        <p style={{ color: '#a3a3a3', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          Each forgery <em>class</em> has its own model trained on its own dataset. Counts below
          are the number of labeled training images per class. Anything under
          {' '}<strong style={{ color: '#f97316' }}>{totals.limited_data_threshold.toLocaleString()}</strong>{' '}
          is flagged as <em>limited data</em> — these classes will produce less reliable verdicts
          and are surfaced as a warning on every scan.
        </p>

        {Object.entries(info.categories).map(([catName, catInfo]) => {
          const meta = CATEGORY_META[catName] || { id: '', code: '?', icon: '·', color: '#a3a3a3' };
          return (
            <div key={catName} style={{
              background: '#0a0a0a', borderRadius: 6, padding: 16, marginBottom: 16,
              borderLeft: `4px solid ${meta.color}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{meta.icon}</span>
                  <div>
                    <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: meta.color, margin: 0 }}>{meta.code}</p>
                    <h3 className="oswald" style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, margin: 0, textTransform: 'uppercase' }}>
                      {catName}
                    </h3>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                  <span className="mono" style={{ color: '#a3a3a3' }}>
                    <span style={{ color: '#f5c518' }}>{catInfo.total_images.toLocaleString()}</span> images
                  </span>
                  <span className="mono" style={{ color: '#a3a3a3' }}>
                    <span style={{ color: '#22c55e' }}>{catInfo.trained_classes}/{catInfo.classes.length}</span> trained
                  </span>
                  {meta.id && (
                    <Link to={`/samples/${meta.id}`} style={{
                      color: meta.color, textDecoration: 'none', fontSize: 11,
                      fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
                    }}>Examples →</Link>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {catInfo.classes.map(cls => (
                  <ClassRow key={cls.api_key} cls={cls} threshold={totals.limited_data_threshold} />
                ))}
              </div>
            </div>
          );
        })}
      </Section>

      <div style={{
        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.4)',
        padding: 16, borderRadius: 6, marginTop: 24,
      }}>
        <h4 className="oswald" style={{ fontSize: 13, letterSpacing: 2, color: '#f87171', textTransform: 'uppercase', marginBottom: 6 }}>
          Disclaimer
        </h4>
        <p style={{ fontSize: 13, color: '#d4d4d4', lineHeight: 1.6, margin: 0 }}>
          Revelator is a screening and triage tool intended to support — not replace — qualified
          document examination. Findings here are not by themselves admissible as forensic evidence.
          For legal proceedings, consult a certified document examiner.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: '#a3a3a3', marginBottom: 14 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value, color = '#f5f5f5' }) {
  return (
    <div style={{ background: '#151515', border: '1px solid #262626', borderRadius: 6, padding: 14, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
      <div className="oswald" style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#525252', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function VerdictRow({ level, color, text }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span className={`badge badge-${level}`} style={{ flex: '0 0 auto', alignSelf: 'flex-start' }}>{level}</span>
      <span style={{ fontSize: 13, color: '#d4d4d4', lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

function ClassRow({ cls, threshold }) {
  const pct = Math.min((cls.dataset_count / threshold) * 100, 100);
  const barColor = cls.dataset_count >= threshold ? '#22c55e' : (cls.dataset_count > 0 ? '#f97316' : '#dc2626');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
      alignItems: 'center', padding: '6px 0',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cls.title}
        </div>
        <div style={{ position: 'relative', height: 4, background: '#1a1a1a', borderRadius: 2, marginTop: 4 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${pct}%`, background: barColor, borderRadius: 2,
          }} />
        </div>
      </div>
      <span className="mono" style={{ fontSize: 12, color: '#a3a3a3', textAlign: 'right' }}>
        {cls.dataset_count.toLocaleString()}
      </span>
      <span className="mono" style={{
        fontSize: 9, padding: '2px 6px', borderRadius: 3, letterSpacing: 1,
        textTransform: 'uppercase',
        background: cls.is_trained ? 'rgba(34,197,94,0.15)' : 'rgba(82,82,82,0.3)',
        color: cls.is_trained ? '#22c55e' : '#525252',
        whiteSpace: 'nowrap',
      }}>
        {cls.is_trained ? 'TRAINED' : 'PENDING'}
      </span>
    </div>
  );
}
