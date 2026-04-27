import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { api } from '../api/client';

// Top-level forgery groups. `backendCategory` matches the "category" field
// returned by GET /api/categories, used to filter the leaf method list.
// `equipment` controls how the group is bucketed on the selection screen:
//   'phone'   → analyzable from a normal phone photo
//   'special' → requires UV/IR lighting, microscope, or backlit watermark inspection
const GROUPS = [
  { id: 'digital',         code: 'DIG', icon: '💻', color: '#8b5cf6', title: 'Digital Forgery',  description: 'Computer-generated or manipulated documents',  methods: 3, backendCategory: 'Digital',         equipment: 'phone' },
  { id: 'alteration',      code: 'ALT', icon: '✏️', color: '#dc2626', title: 'Alteration',       description: 'Modified or changed document content',         methods: 4, backendCategory: 'Alteration',      equipment: 'phone' },
  { id: 'traced',          code: 'TRC', icon: '📋', color: '#3b82f6', title: 'Traced Forgery',   description: 'Documents with traced signatures or content',  methods: 3, backendCategory: 'Traced',          equipment: 'phone' },
  { id: 'obliteration',    code: 'OBL', icon: '◼',  color: '#f97316', title: 'Obliteration',     description: 'Concealed or covered content',                 methods: 3, backendCategory: 'Obliteration',    equipment: 'phone' },
  { id: 'sympathetic_ink', code: 'SYM', icon: '🔬', color: '#22c55e', title: 'Sympathetic Ink',  description: 'Invisible or special ink — UV/IR required',    methods: 2, backendCategory: 'Sympathetic Ink', equipment: 'special' },
  { id: 'currency',        code: 'CUR', icon: '💵', color: '#eab308', title: 'Currency Forgery', description: 'Counterfeit money — security feature inspection', methods: 1, backendCategory: 'Currency',     equipment: 'special' },
];

export default function Scan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryGroupId = searchParams.get('category');
  const initialGroup = GROUPS.find(g => g.id === queryGroupId) || null;
  const initialStep = queryGroupId === 'auto' ? 'upload' : (initialGroup ? 'upload' : 'select');

  const [step, setStep] = useState(initialStep);
  const [group, setGroup] = useState(initialGroup);
  const [methodsByCategory, setMethodsByCategory] = useState({});
  const [datasetTotals, setDatasetTotals] = useState({});
  const [method, setMethod] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const canvasRef = useRef();

  useEffect(() => {
    api.getCategories().then(data => {
      setMethodsByCategory(data.categories || {});
      setDatasetTotals(data.category_dataset_totals || {});
    }).catch(() => {});
  }, []);

  function pickGroup(g) {
    setGroup(g);
    setMethod('');
    setStep('upload');
    setSearchParams({ category: g.id }, { replace: true });
  }

  function pickAutoDetect() {
    setGroup(null);
    setMethod('');
    setStep('upload');
    setSearchParams({ category: 'auto' }, { replace: true });
  }

  function backToSelect() {
    setStep('select');
    setGroup(null);
    setMethod('');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setSearchParams({}, { replace: true });
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  }

  async function handleTakePhoto() {
    setError('');
    setResult(null);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const f = new File([blob], `scan-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type });
      setFile(f);
      setPreview(photo.webPath);
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) setError(err.message);
    }
  }

  async function handlePickFromGallery() {
    setError('');
    setResult(null);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const f = new File([blob], `photo-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type });
      setFile(f);
      setPreview(photo.webPath);
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) setError(err.message);
    }
  }

  function drawAnnotations(annotations, imgW, imgH) {
    const canvas = canvasRef.current;
    if (!canvas || !preview) return;
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(canvas.parentElement.offsetWidth - 32, 800);
      const scale = maxW / imgW;
      canvas.width = imgW * scale;
      canvas.height = imgH * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      annotations.forEach((ann, idx) => {
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
        ctx.fillRect(x, y - 18, tw, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 4, y - 5);
      });
    };
    img.src = preview;
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.analyze(file, method || null);
      setResult(data);
      if (data.annotations?.length > 0) {
        setTimeout(() => drawAnnotations(data.annotations, data.original_image_dimensions.width, data.original_image_dimensions.height), 100);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'select') return <SelectForgeryType onPick={pickGroup} onAutoDetect={pickAutoDetect} datasetTotals={datasetTotals} />;

  // ───── upload step ─────
  const groupMethods = group ? (methodsByCategory[group.backendCategory] || []) : [];
  const verdictColors = { forged: '#dc2626', suspicious: '#f97316', genuine: '#22c55e' };

  return (
    <div>
      <button
        onClick={backToSelect}
        style={{
          background: 'transparent', border: 'none', color: '#a3a3a3', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: 0, fontSize: 14,
        }}
      >
        ← Back to forgery types
      </button>

      <div style={{
        background: '#151515',
        borderLeft: `4px solid ${group?.color || '#f5c518'}`,
        padding: 20, marginBottom: 24, borderRadius: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <p className="mono" style={{ fontSize: 10, letterSpacing: 2, color: group?.color || '#f5c518', margin: 0 }}>
            {group ? group.code : 'AUTO'}
          </p>
          <h2 className="oswald" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, margin: '4px 0 0' }}>
            {group ? group.title : 'Auto-Detect Forgery'}
          </h2>
        </div>
        {group && (
          <Link
            to={`/samples/${group.id}`}
            style={{
              fontSize: 12, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
              letterSpacing: 1.5, color: group.color, textDecoration: 'none',
              border: `1px solid ${group.color}`, padding: '6px 12px', borderRadius: 4,
            }}
          >
            See examples →
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 800 }}>
        {group && (
          <div className="card">
            <h3 className="oswald" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, color: '#a3a3a3' }}>
              Method (optional — leave blank to scan all in this category)
            </h3>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)} style={{ background: '#1a1a1a' }}>
              <option value="">All {group.title.toLowerCase()} methods</option>
              {groupMethods.map(item => (
                <option key={item.api_key} value={item.api_key}>
                  {item.title} {item.is_trained ? '' : '(limited data)'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="card">
          <h3 className="oswald" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, color: '#a3a3a3' }}>
            Capture Document
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <button type="button" className="btn btn-primary" onClick={handleTakePhoto} style={{ padding: '14px 16px' }}>
              📷 Take Photo
            </button>
            <button type="button" className="btn btn-secondary" onClick={handlePickFromGallery} style={{ padding: '14px 16px' }}>
              🖼️ Gallery
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current.click()} style={{ padding: '14px 16px' }}>
              📁 File
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: '2px dashed #404040', borderRadius: 8, padding: preview ? 16 : 40, textAlign: 'center',
              cursor: 'pointer', transition: 'border-color 0.2s',
            }}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4 }} />
            ) : (
              <div>
                <div style={{ fontSize: 36, marginBottom: 8 }}>+</div>
                <p style={{ color: '#a3a3a3' }}>No image selected</p>
                <p style={{ color: '#525252', fontSize: 13, marginTop: 4 }}>Use a button above to capture or choose</p>
              </div>
            )}
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleAnalyze} disabled={!file || loading} style={{ fontSize: 16, padding: '18px 0' }}>
          {loading ? 'Analyzing...' : 'Analyze Document'}
        </button>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626', padding: 14, borderRadius: 4, fontSize: 13, color: '#f87171' }}>
            {error}
          </div>
        )}

        {result && (
          <div className="card" style={{ borderColor: verdictColors[result.verdict] || '#262626' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="oswald" style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: 2 }}>
                Analysis Result
              </h3>
              <span className="mono" style={{ fontSize: 12, color: '#525252' }}>{result.scan_id}</span>
            </div>

            <div style={{
              textAlign: 'center', padding: 24, background: '#0a0a0a', borderRadius: 6, marginBottom: 20,
              border: `1px solid ${verdictColors[result.verdict]}`,
            }}>
              <div className="oswald" style={{
                fontSize: 32, fontWeight: 700, color: verdictColors[result.verdict],
                textTransform: 'uppercase', letterSpacing: 4,
              }}>
                {result.verdict}
              </div>
              <div className="mono" style={{ color: '#a3a3a3', marginTop: 8 }}>
                Confidence: {(result.confidence_score * 100).toFixed(1)}%
              </div>
            </div>

            {result.training_warning && (
              <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid #f97316', padding: 12, borderRadius: 4, marginBottom: 16, fontSize: 13, color: '#fb923c' }}>
                {result.training_warning}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <h4 className="oswald" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: '#a3a3a3', marginBottom: 8 }}>
                Forensic Analysis
              </h4>
              {result.llm_explanation ? (
                <p style={{ lineHeight: 1.7, fontSize: 14, color: '#d4d4d4' }}>{result.llm_explanation}</p>
              ) : result.llm_locked ? (
                <LlmUpgradePrompt requiredPlan={result.llm_required_plan} />
              ) : null}
            </div>

            {result.annotations?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 className="oswald" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: '#a3a3a3', marginBottom: 8 }}>
                  Detected Regions
                </h4>
                <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: 4, border: '1px solid #262626' }} />
              </div>
            )}

            {result.annotations?.length > 0 && (
              <div>
                {result.annotations.map((ann, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: ann.color, color: '#fff', fontSize: 11, fontWeight: 700,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 14 }}>{ann.title}</span>
                    <span className="mono" style={{ fontSize: 12, color: '#a3a3a3' }}>
                      {(ann.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectForgeryType({ onPick, onAutoDetect, datasetTotals = {} }) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <p className="mono" style={{ fontSize: 11, color: '#f5c518', letterSpacing: 4, marginBottom: 12 }}>
          ◆ CASE FILE ANALYSIS ◆
        </p>
        <h2 className="oswald" style={{ fontSize: 'clamp(24px, 5vw, 38px)', fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>
          SELECT FORGERY TYPE
        </h2>
        <p style={{ color: '#a3a3a3', maxWidth: 500, margin: '0 auto', lineHeight: 1.6, fontSize: 14 }}>
          Choose the category of document examination to begin forensic analysis
        </p>
      </div>

      <EquipmentBucket
        label="Phone-Scannable"
        sublabel="Works with a normal phone photo or scanned image"
        icon="📱"
        accent="#22c55e"
        groups={GROUPS.filter(g => g.equipment === 'phone')}
        startIndex={1}
        datasetTotals={datasetTotals}
        onPick={onPick}
      />

      <EquipmentBucket
        label="Specialized Equipment"
        sublabel="Requires UV/IR lighting, magnification, or physical security feature inspection"
        icon="🔬"
        accent="#eab308"
        groups={GROUPS.filter(g => g.equipment === 'special')}
        startIndex={GROUPS.filter(g => g.equipment === 'phone').length + 1}
        datasetTotals={datasetTotals}
        onPick={onPick}
      />

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <p className="mono" style={{ fontSize: 10, color: '#525252', letterSpacing: 2, marginBottom: 12 }}>
          OR PERFORM AUTOMATIC DETECTION
        </p>
        <button className="btn btn-secondary" onClick={onAutoDetect}>
          🔍 AUTO-DETECT FORGERY
        </button>
      </div>
    </div>
  );
}

function EquipmentBucket({ label, sublabel, icon, accent, groups, startIndex, datasetTotals, onPick }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
        paddingBottom: 8, borderBottom: `1px solid ${accent}33`,
      }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <h3 className="oswald" style={{
            fontSize: 16, fontWeight: 700, letterSpacing: 2, margin: 0,
            color: accent, textTransform: 'uppercase',
          }}>
            {label}
          </h3>
          <p style={{ fontSize: 12, color: '#a3a3a3', margin: '2px 0 0', lineHeight: 1.4 }}>
            {sublabel}
          </p>
        </div>
        <span className="mono" style={{
          fontSize: 10, color: accent, padding: '2px 8px',
          border: `1px solid ${accent}66`, borderRadius: 3, letterSpacing: 1.5,
        }}>
          {groups.length} {groups.length === 1 ? 'TYPE' : 'TYPES'}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {groups.map((g, i) => (
          <CategoryCard
            key={g.id} cat={g} index={startIndex + i}
            datasetCount={datasetTotals[g.backendCategory] || 0}
            onClick={() => onPick(g)}
          />
        ))}
      </div>
    </section>
  );
}

function LlmUpgradePrompt({ requiredPlan = 'premium' }) {
  return (
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
          Upgrade to <strong style={{ color: '#a78bfa', textTransform: 'capitalize' }}>{requiredPlan}</strong> to
          get a plain-language breakdown of every detection — what was flagged, where, and why it matters.
        </p>
        <Link to="/account" style={{
          display: 'inline-block', padding: '6px 14px', borderRadius: 4,
          background: '#8b5cf6', color: '#fff', textDecoration: 'none',
          fontSize: 12, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
        }}>
          See plans →
        </Link>
      </div>
    </div>
  );
}

function CategoryCard({ cat, index, onClick, datasetCount = 0 }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        background: '#151515',
        border: '1px solid #262626',
        borderLeft: `4px solid ${cat.color}`,
        padding: 0, textAlign: 'left', cursor: 'pointer',
        transition: 'transform 0.2s', position: 'relative', overflow: 'hidden',
        borderRadius: 4, color: 'inherit', font: 'inherit', width: '100%',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <div className="oswald" style={{
        position: 'absolute', top: 12, right: 12, width: 26, height: 26,
        color: '#000', fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: cat.color,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }}>{index}</div>

      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{cat.icon}</span>
          <div>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 2, margin: 0, color: cat.color }}>{cat.code}</p>
            <h3 className="oswald" style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: 1 }}>{cat.title}</h3>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#a3a3a3', margin: 0, lineHeight: 1.5 }}>{cat.description}</p>
      </div>

      <div style={{
        borderTop: '1px solid #262626', padding: '10px 16px', background: '#1a1a1a',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="mono" style={{ fontSize: 10, color: '#525252' }}>
            {cat.methods} {cat.methods === 1 ? 'METHOD' : 'METHODS'}
          </span>
          <span className="mono" style={{ fontSize: 10, color: datasetCount > 0 ? cat.color : '#525252' }}>
            {datasetCount.toLocaleString()} TRAINING IMAGES
          </span>
        </div>
        <Link
          to={`/samples/${cat.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: 10, color: cat.color, textDecoration: 'none',
            fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
            padding: '2px 6px', border: `1px solid ${cat.color}33`, borderRadius: 3,
          }}
        >
          Examples
        </Link>
      </div>
    </div>
  );
}
