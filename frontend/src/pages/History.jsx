import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function History() {
  const [scans, setScans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState(null);
  const limit = 20;

  useEffect(() => { loadScans(); }, [page]);

  function loadScans() {
    api.getHistory(limit, page * limit).then(data => {
      setScans(data.scans);
      setTotal(data.total);
    }).catch(() => {});
  }

  function viewDetail(scanId) {
    api.getScanDetail(scanId).then(setDetail).catch(() => {});
  }

  if (detail) return <ScanDetailView detail={detail} onBack={() => setDetail(null)} />;

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="oswald" style={{ fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 24 }}>
        Scan History
      </h1>

      {scans.length === 0 ? (
        <div className="card">
          <p style={{ color: '#525252', textAlign: 'center', padding: 32 }}>No scans yet.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {scans.map(scan => (
              <HistoryCard key={scan.scan_id} scan={scan} onClick={() => viewDetail(scan.scan_id)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '8px 16px', fontSize: 12 }}>&larr; Prev</button>
              <span className="mono" style={{ padding: '8px 16px', color: '#a3a3a3', fontSize: 13 }}>
                {page + 1} / {totalPages}
              </span>
              <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                style={{ padding: '8px 16px', fontSize: 12 }}>Next &rarr;</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const verdictColors = {
  forged: '#dc2626',
  suspicious: '#f97316',
  no_forgery_detected: '#22c55e',
  not_a_document: '#737373',
};
const verdictLabels = {
  forged: 'Forged',
  suspicious: 'Suspicious',
  no_forgery_detected: 'No Forgery Detected',
  not_a_document: 'Not a Document',
};

function HistoryCard({ scan, onClick }) {
  const borderColor = verdictColors[scan.verdict] || '#262626';
  return (
    <button
      onClick={onClick}
      style={{
        background: '#151515',
        border: `1px solid #262626`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 6,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        color: 'inherit',
        font: 'inherit',
        width: '100%',
      }}
    >
      <div style={{
        aspectRatio: '4/3',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {scan.has_image ? (
          <img
            src={api.getScanImageUrl(scan.scan_id)}
            alt={scan.filename}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span style={{ color: '#404040', fontSize: 12, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
            NO IMAGE
          </span>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className={`badge badge-${scan.verdict}`}>{verdictLabels[scan.verdict] || scan.verdict}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {scan.has_llm_explanation && (
              <span
                title="AI forensic explanation available"
                className="oswald"
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#c4b5fd',
                  background: 'rgba(139,92,246,0.12)',
                  border: '1px solid rgba(139,92,246,0.4)',
                  borderRadius: 3,
                  padding: '1px 5px',
                }}
              >
                AI
              </span>
            )}
            <span className="mono" style={{ fontSize: 11, color: '#a3a3a3' }}>
              {(scan.confidence_score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#d4d4d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {scan.filename}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: '#525252' }}>{scan.scan_id}</span>
          <span className="mono" style={{ fontSize: 10, color: '#525252' }}>
            {new Date(scan.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </button>
  );
}

function ScanDetailView({ detail, onBack }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!detail.has_image || !detail.annotations?.length) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = Math.min(canvas.parentElement.offsetWidth - 32, 900);
      const scale = maxW / img.naturalWidth;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      detail.annotations.forEach((ann, idx) => {
        const c = ann.coordinates;
        const x = c.x_min * scale;
        const y = c.y_min * scale;
        const w = (c.x_max - c.x_min) * scale;
        const h = (c.y_max - c.y_min) * scale;
        ctx.strokeStyle = ann.color || '#dc2626';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = ann.color || '#dc2626';
        ctx.font = 'bold 12px JetBrains Mono';
        const label = `${idx + 1}. ${ann.title} (${(ann.confidence * 100).toFixed(0)}%)`;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 4, Math.max(12, y - 5));
      });
    };
    img.src = api.getScanImageUrl(detail.scan_id);
  }, [detail]);

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#f5c518', cursor: 'pointer',
        fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
        fontSize: 13, marginBottom: 20, padding: 0,
      }}>
        &larr; Back to History
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16, gap: 8 }}>
          <h2 className="oswald" style={{ fontSize: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
            Scan Detail
          </h2>
          <span className="mono" style={{ color: '#525252', fontSize: 13 }}>{detail.scan_id}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatBox label="Verdict" value={verdictLabels[detail.verdict] || detail.verdict} color={verdictColors[detail.verdict]} oswald />
          <StatBox label="Confidence" value={`${(detail.confidence_score * 100).toFixed(1)}%`} color="#f5c518" mono />
          <StatBox label="File" value={detail.filename} color="#a3a3a3" mono small />
          <StatBox label="Date" value={new Date(detail.created_at).toLocaleString()} color="#a3a3a3" mono small />
        </div>

        {detail.has_image && (
          <div style={{ marginBottom: 20 }}>
            <h4 className="oswald" style={{ fontSize: 13, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
              {detail.annotations?.length > 0 ? 'Annotated Image' : 'Uploaded Image'}
            </h4>
            {detail.annotations?.length > 0 ? (
              <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: 4, border: '1px solid #262626' }} />
            ) : (
              <img
                src={api.getScanImageUrl(detail.scan_id)}
                alt={detail.filename}
                style={{ maxWidth: '100%', borderRadius: 4, border: '1px solid #262626' }}
              />
            )}
          </div>
        )}

        {detail.llm_explanation ? (
          <div style={{ marginBottom: 16 }}>
            <h4 className="oswald" style={{ fontSize: 13, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
              Analysis
            </h4>
            <p style={{ lineHeight: 1.7, fontSize: 14, color: '#d4d4d4' }}>{detail.llm_explanation}</p>
          </div>
        ) : detail.llm_locked ? (
          <div style={{ marginBottom: 16 }}>
            <h4 className="oswald" style={{ fontSize: 13, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
              Analysis
            </h4>
            <div style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.02) 100%)',
              border: '1px solid rgba(139,92,246,0.4)', borderRadius: 6, padding: 14,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>✨</span>
              <div style={{ flex: 1 }}>
                <div className="oswald" style={{ fontSize: 13, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                  AI Forensic Explanation
                </div>
                <p style={{ fontSize: 13, color: '#a3a3a3', lineHeight: 1.6, margin: 0, marginBottom: 10 }}>
                  Upgrade to <strong style={{ color: '#a78bfa', textTransform: 'capitalize' }}>{detail.llm_required_plan || 'premium'}</strong> for
                  a plain-language breakdown on every scan.
                </p>
                <Link to="/account" style={{
                  display: 'inline-block', padding: '6px 14px', borderRadius: 4,
                  background: '#8b5cf6', color: '#fff', textDecoration: 'none',
                  fontSize: 12, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
                }}>See plans →</Link>
              </div>
            </div>
          </div>
        ) : null}

        {detail.training_warning && (
          <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid #f97316', padding: 12, borderRadius: 4, fontSize: 13, color: '#fb923c', marginBottom: 16 }}>
            {detail.training_warning}
          </div>
        )}

        {detail.annotations?.length > 0 && (
          <div>
            <h4 className="oswald" style={{ fontSize: 13, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
              Detections
            </h4>
            {detail.annotations.map((ann, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: ann.color, color: '#fff', fontSize: 10, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{ann.title}</span>
                <span className="mono" style={{ fontSize: 12, color: '#a3a3a3' }}>{(ann.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color, oswald, mono, small }) {
  const className = oswald ? 'oswald' : mono ? 'mono' : '';
  return (
    <div style={{ background: '#0a0a0a', padding: 14, borderRadius: 6, textAlign: 'center' }}>
      <div className={className} style={{ color, fontSize: small ? 12 : 18, textTransform: oswald ? 'uppercase' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>{label}</div>
    </div>
  );
}
