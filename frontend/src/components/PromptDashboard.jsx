import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

/**
 * Live Prompt Analysis dashboard.
 * Pulls /api/prompt-analysis on mount — every refresh reflects the
 * current state of gemini_vision.py.
 */
export default function PromptDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.getPromptAnalysis()
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load prompt analysis.'));
  }, []);

  if (error) return <Box color="#ff6688">{error}</Box>;
  if (!data) return <Box color="#86efac">Loading prompt analysis…</Box>;

  const tabs = [
    { id: 'overview',   label: 'Overview' },
    { id: 'detail',     label: 'Detail Levels' },
    { id: 'overlaps',   label: 'Overlaps' },
    { id: 'aux',        label: 'Auxiliary Prompts' },
    { id: 'rules',      label: 'Rules' },
    { id: 'variables',  label: 'User Variables' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: '1px solid #112418', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              borderBottom: tab === t.id ? '2px solid #00ff66' : '2px solid transparent',
              color: tab === t.id ? '#00ff66' : '#6dba85',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          {tab === 'overview' && <Overview data={data} onSelect={setSelected} />}
          {tab === 'detail' && <DetailBars data={data} onSelect={setSelected} selected={selected} />}
          {tab === 'overlaps' && <Overlaps data={data} onSelect={setSelected} />}
          {tab === 'aux' && <AuxPrompts data={data} />}
          {tab === 'rules' && <Rules data={data} />}
          {tab === 'variables' && <Variables data={data} />}
        </div>
        <Inspector data={data} selected={selected} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PANELS
// ─────────────────────────────────────────────────────────────────

function Overview({ data, onSelect }) {
  const top = data.categories.slice(0, 5);
  const bottom = [...data.categories].reverse().slice(0, 5);
  const totalChars = data.aux_prompts.reduce((s, p) => s + p.char_count, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Categories" value={data.categories.length} />
        <Stat label="System Prompt Words" value={data.system_prompt.total_words} />
        <Stat label="Total Chars (all prompts)" value={totalChars.toLocaleString()} />
        <Stat label="Documented Overlaps" value={data.overlaps.length} />
        <Stat label="Critical Rules" value={data.rules.length} />
      </div>

      <Sub title="▸ Most-detailed categories (dominant when ambiguous)">
        {top.map(c => <BarRow key={c.id} cat={c} maxWords={top[0].word_count} onSelect={onSelect} />)}
      </Sub>

      <Sub title="▸ Least-detailed categories (model has minimal cues)">
        {bottom.map(c => <BarRow key={c.id} cat={c} maxWords={top[0].word_count} onSelect={onSelect} />)}
      </Sub>

      <div style={{
        background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.4)',
        padding: 12, borderRadius: 3, fontSize: 12, color: '#ffd996', lineHeight: 1.7,
      }}>
        <strong style={{ color: '#ffaa00' }}>Why this matters:</strong> When evidence is ambiguous,
        the model gravitates toward categories with the richest descriptions ("prompt mass bias").
        A category with 5 words of detail has almost no anchor; one with 500 words pulls the verdict.
      </div>
    </div>
  );
}

function DetailBars({ data, onSelect, selected }) {
  const max = data.categories[0]?.word_count || 1;
  return (
    <div>
      <p style={{ fontSize: 12, color: '#6dba85', marginBottom: 12 }}>
        Each bar shows how many words the system prompt spends describing that category. Click to inspect.
      </p>
      {data.categories.map(c => (
        <BarRow key={c.id} cat={c} maxWords={max} onSelect={onSelect} active={selected === c.id} />
      ))}
    </div>
  );
}

function Overlaps({ data, onSelect }) {
  const sorted = [...data.overlaps].sort((a, b) => {
    if (a.from_prompt !== b.from_prompt) return a.from_prompt ? -1 : 1;
    return 0;
  });
  return (
    <div>
      <p style={{ fontSize: 12, color: '#6dba85', marginBottom: 12 }}>
        Pairs where two categories share ambiguous indicators. <span style={{ color: '#00ff66' }}>Green</span> overlaps
        are explicitly distinguished in the prompt; <span style={{ color: '#ffaa00' }}>amber</span> are semantic
        overlaps not addressed in the prompt (potential bug source).
      </p>
      {sorted.map((o, i) => {
        const src = data.categories.find(c => c.id === o.source);
        const tgt = data.categories.find(c => c.id === o.target);
        if (!src || !tgt) return null;
        const dominant = src.word_count >= tgt.word_count ? src : tgt;
        const weaker = src.word_count >= tgt.word_count ? tgt : src;
        const ratio = (dominant.word_count / Math.max(weaker.word_count, 1)).toFixed(1);
        const color = o.from_prompt ? '#00ff66' : '#ffaa00';
        return (
          <div key={i} style={{
            background: '#0a120c',
            border: `1px solid ${color}33`,
            borderLeft: `3px solid ${color}`,
            padding: 10,
            borderRadius: 3,
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 13, color: '#d8ffe6' }}>
              <span style={{ color, fontWeight: 600, cursor: 'pointer' }} onClick={() => onSelect(dominant.id)}>
                {dominant.label}
              </span>
              <span style={{ color: '#6dba85' }}> dominates </span>
              <span style={{ cursor: 'pointer' }} onClick={() => onSelect(weaker.id)}>
                {weaker.label}
              </span>
              <span style={{ color: '#6dba85', fontSize: 11, marginLeft: 8 }}>
                {dominant.word_count}:{weaker.word_count} words ({ratio}× more)
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#86efac', marginTop: 4, lineHeight: 1.5 }}>
              {o.reason}
            </div>
            <div style={{ fontSize: 9, color: '#6dba85', marginTop: 4, letterSpacing: 1 }}>
              {o.from_prompt ? 'EXPLICIT IN PROMPT' : 'SEMANTIC OVERLAP — NOT IN PROMPT'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuxPrompts({ data }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: '#6dba85', marginBottom: 12 }}>
        All Gemini prompts now live in <code style={{ color: '#00ff66' }}>backend/app/forgery/gemini_vision.py</code> (single source of truth).
      </p>
      {data.aux_prompts.map(p => (
        <div key={p.name} style={{
          background: '#0a120c',
          border: '1px solid #112418',
          borderLeft: '3px solid #00ff66',
          padding: 12,
          borderRadius: 3,
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <code style={{ fontSize: 13, color: '#00ff66', fontFamily: "'JetBrains Mono', monospace" }}>{p.name}</code>
            <span style={{ fontSize: 11, color: '#86efac', fontFamily: "'JetBrains Mono', monospace" }}>
              {p.word_count} words · {p.char_count.toLocaleString()} chars
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#d8ffe6', marginTop: 4, lineHeight: 1.5 }}>
            {p.purpose}
          </div>
        </div>
      ))}
    </div>
  );
}

function Rules({ data }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: '#6dba85', marginBottom: 12 }}>
        Critical rules and branching logic extracted from the live SYSTEM_PROMPT.
      </p>
      {data.rules.map((r, i) => (
        <div key={i} style={{
          background: '#0a120c',
          border: '1px solid #112418',
          borderLeft: '3px solid #ffaa00',
          padding: 10,
          borderRadius: 3,
          marginBottom: 8,
          fontSize: 12,
          color: '#d8ffe6',
          lineHeight: 1.6,
        }}>
          {r}
        </div>
      ))}
    </div>
  );
}

function Variables({ data }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: '#6dba85', marginBottom: 12 }}>
        Variables from <code style={{ color: '#00ff66' }}>_build_user_context_block</code> that get injected into the prompt as user-provided context. Each one biases the classification.
      </p>
      {data.variables.map(v => (
        <div key={v.name} style={{
          background: '#0a120c',
          border: '1px solid #112418',
          borderLeft: '3px solid #5b8def',
          padding: 12,
          borderRadius: 3,
          marginBottom: 8,
        }}>
          <code style={{ fontSize: 13, color: '#5b8def', fontFamily: "'JetBrains Mono', monospace" }}>{v.name}</code>
          <div style={{ fontSize: 12, color: '#d8ffe6', marginTop: 4, lineHeight: 1.5 }}>
            {v.description}
          </div>
          <div style={{ fontSize: 11, color: '#ffaa00', marginTop: 6, lineHeight: 1.5 }}>
            <strong>Influence:</strong> {v.influence}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RIGHT-SIDE INSPECTOR
// ─────────────────────────────────────────────────────────────────

function Inspector({ data, selected }) {
  const cat = useMemo(
    () => selected ? data.categories.find(c => c.id === selected) : null,
    [selected, data.categories],
  );
  const myOverlaps = useMemo(
    () => selected ? data.overlaps.filter(o => o.source === selected || o.target === selected) : [],
    [selected, data.overlaps],
  );

  if (!cat) {
    return (
      <div style={{
        background: '#0a120c', border: '1px solid #112418', borderRadius: 3,
        padding: 16, color: '#525252', fontSize: 12, textAlign: 'center', fontStyle: 'italic',
        position: 'sticky', top: 16, alignSelf: 'flex-start',
      }}>
        Click a category, bar, or overlap to inspect.
      </div>
    );
  }

  const groupColor = data.groups[cat.group] || '#666';
  return (
    <div style={{
      background: '#0a120c', border: '1px solid #112418', borderRadius: 3,
      padding: 14, position: 'sticky', top: 16, alignSelf: 'flex-start', maxHeight: '70vh', overflowY: 'auto',
    }}>
      <div style={{
        background: '#091108', border: `1px solid ${groupColor}55`, borderLeft: `3px solid ${groupColor}`,
        padding: 10, borderRadius: 3, marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{cat.label}</div>
        <div style={{ fontSize: 10, color: '#6dba85', marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
          {cat.id} · {cat.group} · <span style={{ color: groupColor }}>{cat.detail_level}</span> · {cat.word_count} words
        </div>
        <p style={{ fontSize: 11, color: '#d8ffe6', marginTop: 8, lineHeight: 1.5 }}>
          {cat.first_line}
        </p>
      </div>

      <SubSmall title="Indicators in prompt">
        {cat.indicators.length === 0
          ? <Empty text="No structured indicators detected." />
          : <ul style={{ margin: 0, paddingLeft: 16 }}>
              {cat.indicators.map((i, k) => (
                <li key={k} style={{ fontSize: 11, color: '#86efac', lineHeight: 1.6 }}>{i}</li>
              ))}
            </ul>
        }
      </SubSmall>

      <SubSmall title="Explicit distinctions in prompt">
        {cat.distinctions.length === 0
          ? <Empty text="No DISTINCTION blocks." />
          : cat.distinctions.map((d, k) => (
              <div key={k} style={{
                background: '#091108', borderLeft: '2px solid #00ff66',
                padding: 8, borderRadius: 2, marginBottom: 6, fontSize: 11, color: '#d8ffe6', lineHeight: 1.5,
              }}>
                <code style={{ color: '#00ff66', fontSize: 10 }}>vs {d.target}</code>
                <div>{d.reason}</div>
              </div>
            ))
        }
      </SubSmall>

      <SubSmall title={`Overlaps (${myOverlaps.length})`}>
        {myOverlaps.length === 0
          ? <Empty text="No documented overlaps." />
          : myOverlaps.map((o, k) => {
              const other = o.source === cat.id ? o.target : o.source;
              const otherCat = data.categories.find(c => c.id === other);
              return (
                <div key={k} style={{
                  background: '#091108',
                  borderLeft: `2px solid ${o.from_prompt ? '#00ff66' : '#ffaa00'}`,
                  padding: 8, borderRadius: 2, marginBottom: 6, fontSize: 11, color: '#d8ffe6', lineHeight: 1.5,
                }}>
                  <div style={{ color: o.from_prompt ? '#00ff66' : '#ffaa00' }}>
                    ↔ {otherCat?.label || other}
                  </div>
                  <div>{o.reason}</div>
                </div>
              );
            })
        }
      </SubSmall>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SHARED PIECES
// ─────────────────────────────────────────────────────────────────

function BarRow({ cat, maxWords, onSelect, active }) {
  const groupColors = {
    traced: '#e74c3c', alteration: '#f39c12', digital: '#5b8def',
    obliteration: '#9b59b6', sympathetic: '#1abc9c', currency: '#95a5a6', fallback: '#525252',
  };
  const color = groupColors[cat.group] || '#525252';
  return (
    <div
      onClick={() => onSelect(cat.id)}
      style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 100px',
        gap: 10, alignItems: 'center', padding: '5px 8px',
        borderRadius: 2, cursor: 'pointer',
        background: active ? '#112418' : 'transparent',
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: 12, color: '#d8ffe6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
      <div style={{ height: 14, background: '#0a120c', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(cat.word_count / maxWords) * 100}%`,
          background: color, boxShadow: `0 0 6px ${color}40`,
        }} />
      </div>
      <span style={{ fontSize: 10, color: '#86efac', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
        {cat.word_count}w · {cat.detail_level}
      </span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: '#0a120c', border: '1px solid #112418', borderRadius: 3,
      padding: 10, textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#00ff66', textShadow: '0 0 6px #00ff6640', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#3f6e4a', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Sub({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4 style={{
        fontSize: 11, letterSpacing: 2, color: '#6dba85',
        textTransform: 'uppercase', margin: '0 0 8px 0',
      }}>{title}</h4>
      {children}
    </div>
  );
}

function SubSmall({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h5 style={{
        fontSize: 9, letterSpacing: 1.5, color: '#3f6e4a',
        textTransform: 'uppercase', margin: '8px 0 6px 0',
      }}>{title}</h5>
      {children}
    </div>
  );
}

function Box({ color, children }) {
  return <div style={{ padding: 16, color, fontSize: 13 }}>{children}</div>;
}

function Empty({ text }) {
  return <div style={{ fontSize: 11, color: '#525252', fontStyle: 'italic' }}>{text}</div>;
}
