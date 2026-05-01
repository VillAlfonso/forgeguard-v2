import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { CATEGORY_BY_ID, GUIDANCE } from '../categories';

export default function SampleGallery() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const cat = CATEGORY_BY_ID[categoryId];
  const [stats, setStats] = useState(null);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cat) return;
    api.getCategories().then(data => {
      const total = (data.category_dataset_totals || {})[cat.apiKey] || 0;
      const trained = data.categories
        ? Object.values(data.categories).flat().some(c => c.api_key === cat.apiKey && c.is_trained)
        : false;
      setStats({ total, trained, threshold: data.limited_data_threshold || 200 });
    }).catch(() => {});
  }, [categoryId]);

  useEffect(() => {
    if (!cat) return;
    setLoading(true);
    fetch(`/api/samples/${cat.apiKey}`)
      .then(r => r.json())
      .then(data => {
        setSamples(data.samples || []);
        setLoading(false);
      })
      .catch(() => {
        setSamples([]);
        setLoading(false);
      });
  }, [categoryId, cat]);

  if (!cat) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p className="mono" style={{ color: '#86efac', letterSpacing: 2, marginBottom: 14 }}>
          ▣ UNKNOWN CATEGORY
        </p>
        <Link to="/scan" style={{ color: '#00ff66' }}>← back to scan</Link>
      </div>
    );
  }

  const guidance = GUIDANCE[categoryId] || { shooting: [], detector: '' };
  const accent = cat.color;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none', border: 'none', color: '#6dba85', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: 0,
          fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}
      >
        ← back
      </button>

      <div style={{
        background: `linear-gradient(135deg, ${accent}10 0%, transparent 70%), #0a120c`,
        borderLeft: `3px solid ${accent}`,
        border: '1px solid #112418', borderLeftWidth: 3,
        padding: 22, marginBottom: 24, borderRadius: 3,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        boxShadow: `0 0 24px ${accent}20, inset 0 1px 0 ${accent}15`,
      }}>
        <span style={{
          fontSize: 40, color: accent,
          textShadow: `0 0 18px ${accent}99`,
          lineHeight: 1,
        }}>{cat.icon}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="mono" style={{
            fontSize: 10, letterSpacing: 3, color: accent, margin: 0,
            textShadow: `0 0 8px ${accent}80`,
          }}>
            ▸ {cat.code} · SAMPLE GALLERY · TIER {cat.tier}
          </p>
          <h1 className="oswald" style={{
            fontSize: 26, fontWeight: 700, letterSpacing: 2, margin: '4px 0 0',
            textTransform: 'uppercase', color: '#d8ffe6',
          }}>
            {cat.title}
          </h1>
          <p style={{ fontSize: 13, color: '#86efac', margin: '6px 0 0', maxWidth: 600, lineHeight: 1.5 }}>
            {cat.description}
          </p>
        </div>
        <Link
          to={`/scan?category=${categoryId}`}
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '12px 18px' }}
        >
          ▶ Start Scan
        </Link>
      </div>

      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24,
        }}>
          <DatasetStat
            label="Training Images"
            value={stats.total > 0 ? stats.total.toLocaleString() : 'No data yet'}
            color={stats.total >= stats.threshold ? '#00ff66' : (stats.total > 0 ? '#ffa040' : '#86efac')}
          />
          <DatasetStat
            label="Detector Status"
            value={stats.total >= stats.threshold ? 'Ready' : (stats.total > 0 ? 'Training' : 'Awaiting Data')}
            color={stats.total >= stats.threshold ? '#00ff66' : (stats.total > 0 ? '#ffa040' : '#86efac')}
          />
          <DatasetStat
            label="Min Threshold"
            value={stats.threshold.toLocaleString()}
            color="#86efac"
          />
          <Link to="/about" style={{
            background: '#0a120c', border: '1px solid #112418', borderRadius: 3,
            padding: '14px 12px', textAlign: 'center', textDecoration: 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1f5d39';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(0,255,102,0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#112418';
              e.currentTarget.style.boxShadow = 'none';
            }}>
            <div className="oswald" style={{ fontSize: 13, color: '#00ff66', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Full breakdown →
            </div>
            <div style={{ fontSize: 10, color: '#3f6e4a', marginTop: 4 }}>About page</div>
          </Link>
        </div>
      )}

      {stats && stats.total > 0 && stats.total < stats.threshold && (
        <div style={{
          background: 'rgba(255,160,64,0.08)', border: '1px solid rgba(255,160,64,0.4)',
          padding: 12, borderRadius: 3, marginBottom: 24, fontSize: 13, color: '#ffc888',
          display: 'flex', gap: 10, alignItems: 'flex-start',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span>⚠</span>
          <span>
            <strong>Limited data:</strong> only {stats.total.toLocaleString()} / {stats.threshold.toLocaleString()} training images collected.
            Detector accuracy may improve as more samples are gathered.
          </span>
        </div>
      )}

      {stats && stats.total === 0 && (
        <div style={{
          background: 'rgba(255,102,102,0.08)', border: '1px solid rgba(255,102,102,0.4)',
          padding: 12, borderRadius: 3, marginBottom: 24, fontSize: 13, color: '#ff9999',
          display: 'flex', gap: 10, alignItems: 'flex-start',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span>◐</span>
          <span>
            <strong>No training data:</strong> this category is awaiting dataset samples.
            Sample images will appear here once the dataset is populated.
          </span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="oswald" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 2.5, color: '#6dba85', marginBottom: 14 }}>
          ▸ Capture Protocol
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {guidance.shooting.map((tip, i) => (
            <li key={i} style={{
              padding: '10px 0', borderBottom: i < guidance.shooting.length - 1 ? '1px solid #112418' : 'none',
              fontSize: 14, color: '#d8ffe6', display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span className="mono" style={{
                color: accent, fontSize: 11, letterSpacing: 1, lineHeight: 1.5,
                textShadow: `0 0 6px ${accent}80`,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        {guidance.detector && (
          <div style={{
            marginTop: 18, padding: 14, background: '#000', borderRadius: 2,
            borderLeft: `2px solid ${accent}`,
          }}>
            <p className="oswald" style={{
              fontSize: 11, color: accent, textTransform: 'uppercase', letterSpacing: 2.5,
              margin: 0, marginBottom: 6,
              textShadow: `0 0 6px ${accent}80`,
            }}>
              ▸ What the detector looks for
            </p>
            <p style={{ fontSize: 13, color: '#d8ffe6', margin: 0, lineHeight: 1.6 }}>
              {guidance.detector}
            </p>
          </div>
        )}
      </div>

      <h2 className="oswald" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 2.5, color: '#6dba85', marginBottom: 14 }}>
        ▸ Dataset Examples
      </h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#86efac' }}>
          <p className="mono">Loading samples...</p>
        </div>
      )}

      {!loading && samples.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#86efac' }}>
          <p className="mono">No sample images available yet</p>
        </div>
      )}

      {!loading && samples.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {samples.map((sample, idx) => (
            <SampleImage
              key={`${sample.split}-${sample.filename}`}
              src={sample.url}
              label={`${sample.split.toUpperCase()}: ${sample.filename}`}
              catColor={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DatasetStat({ label, value, color }) {
  return (
    <div style={{
      background: '#0a120c', border: '1px solid #112418', borderRadius: 3,
      padding: 14, textAlign: 'center',
    }}>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, textShadow: `0 0 8px ${color}60` }}>
        {value}
      </div>
      <div className="oswald" style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#3f6e4a', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function SampleImage({ src, label, catColor }) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          aspectRatio: '4/3',
          background: '#000',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {!errored && (
          <img
            src={src}
            alt={label}
            onError={() => setErrored(true)}
            onLoad={() => setLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />
        )}
        {!loaded && !errored && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'repeating-linear-gradient(45deg, #000 0 12px, #0a120c 12px 24px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3f6e4a',
            }}
          >
            <span className="mono" style={{ fontSize: 11 }}>Loading...</span>
          </div>
        )}
        {errored && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: `repeating-linear-gradient(45deg, #000 0 12px, #0a120c 12px 24px)`,
              color: '#3f6e4a',
              gap: 6,
            }}
          >
            <span className="mono" style={{ fontSize: 10, color: catColor, letterSpacing: 2 }}>
              ERROR
            </span>
            <span style={{ fontSize: 11 }}>failed to load</span>
          </div>
        )}
        <span
          className="mono"
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 2,
            background: 'rgba(0,0,0,0.85)',
            color: catColor,
            letterSpacing: 1.5,
            border: `1px solid ${catColor}50`,
          }}
        >
          {label.split(':')[0]}
        </span>
      </div>
      <div style={{ padding: 10, borderTop: '1px solid #112418' }}>
        <p className="mono" style={{ fontSize: 10, color: '#86efac', margin: 0, wordBreak: 'break-all' }}>
          {label.split(':')[1]?.trim()}
        </p>
      </div>
    </div>
  );
}
