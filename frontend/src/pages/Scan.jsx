import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { api } from '../api/client';
import { useAuth } from '../App';
import { MagnifierIcon } from '../components/ForensicMotifs';
import { CATEGORY_BY_KEY } from '../categories';

export default function Scan() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentTypes, setDocumentTypes] = useState([]);
  const [modelTier, setModelTier] = useState('analyst');
  const [tiers, setTiers] = useState([]);
  const [showExtras, setShowExtras] = useState(false);
  const [suspicionReason, setSuspicionReason] = useState('');
  const [areaOfConcern, setAreaOfConcern] = useState('');
  const [imageSource, setImageSource] = useState('');
  const [isForgedBelief, setIsForgedBelief] = useState('');
  const [shotType, setShotType] = useState('');
  const [lighting, setLighting] = useState('');
  const [physicalClues, setPhysicalClues] = useState('');
  const fileRef = useRef();
  const canvasRef = useRef();

  // Load document types and model tiers on mount
  React.useEffect(() => {
    api.getDocumentTypes()
      .then(data => setDocumentTypes(data.document_types))
      .catch(err => console.error('Failed to load document types:', err));

    api.getModelTiers()
      .then(data => setTiers(data.tiers || []))
      .catch(err => console.error('Failed to load model tiers:', err));
  }, []);

  function resetScan() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
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
        quality: 90, allowEditing: false,
        resultType: CameraResultType.Uri, source: CameraSource.Camera,
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
        ctx.shadowColor = ann.color || '#00ff66';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = ann.color || '#00ff66';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = ann.color || '#00ff66';
        ctx.font = 'bold 12px JetBrains Mono';
        const label = `${idx + 1}. ${ann.title} (${(ann.confidence * 100).toFixed(0)}%)`;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillRect(x, y - 18, tw, 18);
        ctx.fillStyle = '#000';
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
      const data = await api.analyze(
        file,
        null,
        documentType !== 'other' ? documentType : null,
        modelTier,
        {
          suspicionReason: suspicionReason.trim() || null,
          areaOfConcern: areaOfConcern || null,
          imageSource: imageSource || null,
          isForgedBelief: isForgedBelief || null,
          shotType: shotType || null,
          lighting: lighting || null,
          physicalClues: physicalClues || null,
        }
      );
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

  const verdictColors = {
    forged: '#ff3344',
    suspicious: '#ffa040',
    no_forgery_detected: '#00ff66',
    not_a_document: '#737373',
  };


  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p className="classification-bar" style={{ marginBottom: 6 }}>FORENSIC · SCAN · PIPELINE</p>
        <h2 className="oswald glow" style={{ fontSize: 26, color: '#00ff66', letterSpacing: 4, textTransform: 'uppercase', margin: 0 }}>
          Scan Forgery
        </h2>
        <p style={{ color: '#6dba85', fontSize: 13, marginTop: 6 }}>
          Upload a document image — all 16 forgery detectors will run automatically.
        </p>
      </div>

      {/* Compact tier selector — sits below header, above the form cards */}
      {tiers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 2, whiteSpace: 'nowrap' }}>MODEL</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {tiers.map(t => {
              const isActive = modelTier === t.key;
              const isUnlocked = t.unlocked !== false;
              const isComingSoon = !t.available;
              return (
                <button
                  key={t.key}
                  type="button"
                  title={`${t.tagline}${isComingSoon ? ' — Coming soon' : !isUnlocked ? ' — Upgrade required' : ''}`}
                  onClick={() => !isComingSoon && isUnlocked && setModelTier(t.key)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    border: `1px solid ${isActive ? '#00ff66' : '#1d3825'}`,
                    borderRadius: 2,
                    background: isActive ? 'rgba(0,255,102,0.1)' : 'transparent',
                    color: isActive ? '#00ff66' : (isUnlocked && !isComingSoon) ? '#6dba85' : '#3f6e4a',
                    cursor: (!isComingSoon && isUnlocked) ? 'pointer' : 'not-allowed',
                    opacity: (isUnlocked && !isComingSoon) ? 1 : 0.45,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {isComingSoon ? '' : !isUnlocked ? '🔒 ' : ''}{t.name}
                  {isComingSoon && <span style={{ fontSize: 8, color: '#ffaa00', letterSpacing: 1 }}>COMING SOON</span>}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 11, color: '#3f6e4a', fontStyle: 'italic' }}>— choose model</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 800 }}>
        <div className="card">
          <h3 className="oswald" style={{
            fontSize: 13, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 16,
            color: '#6dba85',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <MagnifierIcon size={16} color="#6dba85" />
            Capture Document
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <button type="button" className="btn btn-primary" onClick={handleTakePhoto} style={{ padding: '14px 16px' }}>
              ⌖ Take Photo
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current.click()} style={{ padding: '14px 16px' }}>
              ⎙ Upload
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `1px dashed ${preview ? '#1d3825' : '#1f5d39'}`,
              borderRadius: 3, padding: preview ? 16 : 48, textAlign: 'center',
              cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
              background: preview ? 'transparent' : 'rgba(0,255,102,0.02)',
            }}
            onMouseEnter={e => { if (!preview) { e.currentTarget.style.borderColor = '#00ff66'; e.currentTarget.style.background = 'rgba(0,255,102,0.04)'; } }}
            onMouseLeave={e => { if (!preview) { e.currentTarget.style.borderColor = '#1f5d39'; e.currentTarget.style.background = 'rgba(0,255,102,0.02)'; } }}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 3, border: '1px solid #1d3825' }} />
            ) : (
              <div>
                <div className="mono glow" style={{ fontSize: 32, marginBottom: 12, color: '#00ff66' }}>+</div>
                <p className="mono" style={{ color: '#86efac', fontSize: 13, letterSpacing: 1.5 }}>NO IMAGE LOADED</p>
                <p style={{ color: '#3f6e4a', fontSize: 12, marginTop: 6 }}>Click to select a file, or use a button above</p>
              </div>
            )}
          </div>
        </div>

        {/* Optional context — collapsed by default */}
        <div style={{ border: '1px solid #112418', borderRadius: 3, background: 'rgba(0,255,102,0.02)' }}>
          <button
            type="button"
            onClick={() => setShowExtras(!showExtras)}
            style={{
              width: '100%', padding: '12px 16px', background: 'transparent', border: 'none',
              cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              color: '#6dba85', fontFamily: "'Oswald', sans-serif", letterSpacing: 2,
              textTransform: 'uppercase', fontSize: 12,
            }}
          >
            <span>
              ＋ Additional Context
              <span style={{ fontSize: 10, color: '#ffa040', marginLeft: 8, letterSpacing: 1 }}>RECOMMENDED</span>
            </span>
            <span style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 1 }}>
              {showExtras ? '▲ HIDE' : '▼ EXPAND'}
            </span>
          </button>
          {showExtras && (
            <div style={{ padding: '0 16px 16px', display: 'grid', gap: 14 }}>
              <p style={{ fontSize: 12, color: '#86efac', margin: 0 }}>
                Filling in context significantly improves accuracy — especially document type, suspected forgery, and any physical clues you noticed. All fields are optional but the more you provide, the fewer alternative hypotheses the model will need to hedge on.
              </p>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  DOCUMENT TYPE
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Not sure / general document (default) —</option>
                  {documentTypes.map(dt => (
                    <option key={dt.key} value={dt.key} style={{ background: '#0a1605', color: '#d8ffe6' }}>
                      {dt.title}
                    </option>
                  ))}
                </select>
                {documentType && documentType !== 'other' && (
                  <p style={{ fontSize: 11, color: '#3f6e4a', marginTop: 5, fontStyle: 'italic' }}>
                    {documentTypes.find(dt => dt.key === documentType)?.description}
                  </p>
                )}
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  WHAT MAKES YOU SUSPICIOUS?
                </label>
                <textarea
                  value={suspicionReason}
                  onChange={(e) => setSuspicionReason(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="e.g. The signature looks shaky, or the date seems edited..."
                  style={{
                    width: '100%', padding: 10, background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    resize: 'vertical',
                  }}
                />
                <p style={{ fontSize: 10, color: '#3f6e4a', margin: '4px 0 0', textAlign: 'right' }}>
                  {suspicionReason.length}/300
                </p>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  AREA TO FOCUS ON
                </label>
                <select
                  value={areaOfConcern}
                  onChange={(e) => setAreaOfConcern(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Anywhere (default) —</option>
                  <option value="signature">Signature</option>
                  <option value="photo">Photo / face</option>
                  <option value="dates">Dates</option>
                  <option value="seals_stamps">Seals or stamps</option>
                  <option value="watermarks">Watermarks / security features</option>
                  <option value="text_content">Text content</option>
                  <option value="numbers">Numbers / amounts</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  HOW WAS THIS CAPTURED?
                </label>
                <select
                  value={imageSource}
                  onChange={(e) => setImageSource(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Not sure (default) —</option>
                  <option value="phone_photo">Phone photo</option>
                  <option value="scanner">Scanner</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="downloaded_pdf">Downloaded PDF</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  ARE YOU SURE THIS IS FORGED?
                </label>
                <select
                  value={isForgedBelief}
                  onChange={(e) => setIsForgedBelief(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Not sure (default) —</option>
                  <option value="yes_confident">Yes, I'm confident</option>
                  <option value="probably">Probably</option>
                  <option value="just_checking">Just checking — could go either way</option>
                  <option value="no_just_curious">No, just curious / authenticating</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  IS THIS ZOOMED IN OR MACRO?
                </label>
                <select
                  value={shotType}
                  onChange={(e) => setShotType(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Not sure (default) —</option>
                  <option value="macro_extreme_close">Macro / extreme close-up</option>
                  <option value="zoomed_close_up">Zoomed close-up of one region</option>
                  <option value="normal_full_doc">Normal — whole document</option>
                  <option value="wide_with_context">Wide shot with surroundings</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  DID YOU USE SPECIAL LIGHTING?
                </label>
                <select
                  value={lighting}
                  onChange={(e) => setLighting(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Not sure / normal light (default) —</option>
                  <option value="ultraviolet">Ultraviolet (UV) light</option>
                  <option value="raking_light">Raking / oblique light (for indentations)</option>
                  <option value="backlit">Backlit (light behind paper)</option>
                  <option value="infrared">Infrared</option>
                  <option value="normal_daylight">Normal daylight only</option>
                </select>
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: 2, color: '#6dba85', display: 'block', marginBottom: 6 }}>
                  PHYSICAL CLUE YOU NOTICED
                </label>
                <select
                  value={physicalClues}
                  onChange={(e) => setPhysicalClues(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0a1605',
                    border: '1px solid #1d3825', borderRadius: 3,
                    color: '#d8ffe6', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— None / not sure (default) —</option>
                  <option value="indentation_grooves">Indentation grooves / canal marks behind writing</option>
                  <option value="carbon_streaks">Faint carbon residue along strokes</option>
                  <option value="uniform_traced_lines">Uniform line weight (looks traced)</option>
                  <option value="ink_halo">Halo or discoloration around erased area</option>
                  <option value="paper_thinning">Thinned or abraded paper surface</option>
                  <option value="characters_inserted">Extra characters squeezed inside words/numbers</option>
                  <option value="text_between_lines">Writing squeezed between existing lines</option>
                  <option value="cut_paste_edges">Visible cut/paste edges or texture mismatch</option>
                  <option value="whiteout_correction">Correction fluid covering text</option>
                  <option value="ink_scribbles">Ink scribbled over original text</option>
                  <option value="opaque_pigment_cover">Marker / paint covering text</option>
                  <option value="counterfeit_currency">Suspect counterfeit banknote</option>
                  <option value="computer_generated">Looks computer-generated / desktop-published</option>
                  <option value="scan_tampering_artifacts">Scanned document with visible digital edits on top</option>
                  <option value="sympathetic_hidden_writing">Hidden writing only visible under special lighting (UV, raking, backlight)</option>
                  <option value="uv_reactive_ink_glow">Ink glows or reacts under UV light</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={handleAnalyze} disabled={!file || loading} style={{ fontSize: 16, padding: '18px 0' }}>
          {loading ? '◌ Running detection…' : '▶ Scan Forgery'}
        </button>

        {error && (
          <div style={{
            background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 14, borderRadius: 2,
            fontSize: 13, color: '#ff8a99', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
          }}>
            ⚠ {error}
          </div>
        )}

        {result && (
          <ForensicResultCard
            result={result}
            canvasRef={canvasRef}
            verdictColors={verdictColors}

            documentTypeLabel={documentTypes.find(dt => dt.key === documentType)?.title}
          />
        )}

        {result && (
          <button className="btn" onClick={resetScan} style={{ fontSize: 13 }}>
            ← New Scan
          </button>
        )}
      </div>
    </div>
  );
}

function LlmUpgradePrompt({ requiredPlan = 'premium' }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.02) 100%)',
      border: '1px solid rgba(139,92,246,0.4)', borderRadius: 3, padding: 14,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>✨</span>
      <div style={{ flex: 1 }}>
        <div className="oswald" style={{ fontSize: 13, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
          AI Forensic Explanation
        </div>
        <p style={{ fontSize: 13, color: '#86efac', lineHeight: 1.6, margin: 0, marginBottom: 10 }}>
          Upgrade to <strong style={{ color: '#a78bfa', textTransform: 'capitalize' }}>{requiredPlan}</strong> to
          get a plain-language breakdown of every detection — what was flagged, where, and why it matters.
        </p>
        <Link to="/account" style={{
          display: 'inline-block', padding: '6px 14px', borderRadius: 2,
          background: '#8b5cf6', color: '#fff', textDecoration: 'none',
          fontSize: 12, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1.5,
        }}>
          See plans →
        </Link>
      </div>
    </div>
  );
}

function ForensicResultCard({ result, canvasRef, verdictColors, documentTypeLabel }) {
  const cat = result.detected_category;

  // Gemini succeeded only when confidence > 0 (0 = fallback/error/unavailable)
  const geminiOk = typeof result.category_confidence === 'number' && result.category_confidence > 0;
  const geminiForgery = geminiOk && cat !== 'no_forgery_detected' && cat !== 'not_a_document';

  const geminiAccent = !cat || !geminiOk ? '#737373'
    : cat === 'no_forgery_detected' ? '#00ff66'
    : cat === 'not_a_document' ? '#737373'
    : cat === 'other' ? '#ffa040'
    : (CATEGORY_BY_KEY[cat]?.color || '#a78bfa');

  const vc = geminiOk ? (CATEGORY_BY_KEY[cat]?.color || (cat === 'no_forgery_detected' ? '#00ff66' : cat === 'not_a_document' ? '#737373' : cat === 'other' ? '#ffa040' : '#a78bfa')) : (verdictColors[result.verdict] || '#1d3825');

  // Show YOLO only when Gemini confirms a forgery AND (if a specific category was
  // scanned) the Gemini category matches what YOLO was analyzing.
  const categoryMatch = !result.category_analyzed || result.detected_category === result.category_analyzed;
  const hasYolo = result.annotations?.length > 0 && geminiForgery && categoryMatch;

  return (
    <div className="card" style={{ borderColor: vc, boxShadow: `0 0 24px ${vc}30`, padding: 0, overflow: 'hidden' }}>
      {/* ── Verdict ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${vc}33` }}>
        <h3 className="oswald" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 2.5, color: '#d8ffe6', margin: 0 }}>◆ Forensic Report</h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {documentTypeLabel && documentTypeLabel !== 'Other Document' && (
            <span className="mono" style={{ fontSize: 10, color: '#6dba85', letterSpacing: 1.5 }}>
              📄 {documentTypeLabel.toUpperCase()}
            </span>
          )}
          <span className="mono" style={{ fontSize: 11, color: '#3f6e4a' }}>{result.scan_id}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '28px 20px 24px', background: '#000', borderBottom: `1px solid ${geminiAccent}33`, boxShadow: `inset 0 0 32px ${geminiAccent}18` }}>
        <div className="oswald" style={{ fontSize: 32, fontWeight: 700, color: geminiAccent, textTransform: 'uppercase', letterSpacing: 5, textShadow: `0 0 18px ${geminiAccent}99` }}>
          {geminiOk ? (result.detected_category_label || cat || '—') : '—'}
        </div>
        {geminiOk && (
          <div className="mono" style={{ color: '#6dba85', marginTop: 10, fontSize: 12, letterSpacing: 1.5 }}>
            {(result.category_confidence * 100).toFixed(1)}% CONF
            {result.certainty_level && (
              <span style={{ marginLeft: 10, color: result.certainty_level === 'HIGH' ? '#00ff66' : result.certainty_level === 'MEDIUM' ? '#ffa040' : '#ff5555' }}>
                · {result.certainty_level}
              </span>
            )}
          </div>
        )}
        {hasYolo && (
          <div className="mono" style={{ color: '#3f6e4a', marginTop: 6, fontSize: 10, letterSpacing: 1.5 }}>
            YOLO {(result.confidence_score * 100).toFixed(1)}%
          </div>
        )}
      </div>

      {result.training_warning && (
        <div style={{ background: 'rgba(255,160,64,0.08)', borderBottom: '1px solid #ffa040', padding: '10px 20px', fontSize: 12, color: '#ffc888', fontFamily: "'JetBrains Mono', monospace" }}>
          ⚠ {result.training_warning}
        </div>
      )}

      <div style={{ padding: '20px 20px 4px' }}>
        {/* ── Gemini Vision ── */}
        {geminiOk ? (
          <div style={{ marginBottom: 20 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: geminiAccent, margin: '0 0 8px', textShadow: `0 0 6px ${geminiAccent}99` }}>
              ▣ GEMINI VISION · CLASSIFICATION
            </p>
            <div style={{ background: `${geminiAccent}08`, border: `1px solid ${geminiAccent}44`, borderLeft: `3px solid ${geminiAccent}`, borderRadius: 3, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  <h4 className="oswald" style={{ fontSize: 17, color: '#d8ffe6', textTransform: 'uppercase', letterSpacing: 2, margin: 0 }}>
                    {result.detected_category_label || cat}
                  </h4>
                  {result.detected_subtype && (
                    <p style={{ fontSize: 12, color: geminiAccent, margin: '3px 0 0', fontStyle: 'italic' }}>Subtype: {result.detected_subtype}</p>
                  )}
                </div>
                <span className="mono" style={{ fontSize: 11, color: geminiAccent, letterSpacing: 1.5 }}>
                  {(result.category_confidence * 100).toFixed(0)}% CONF
                </span>
              </div>
              {result.category_explanation && (
                <p style={{ lineHeight: 1.7, fontSize: 14, color: '#d8ffe6', margin: '0 0 10px' }}>{result.category_explanation}</p>
              )}
              {result.category_evidence?.length > 0 && (
                <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#86efac', fontSize: 13, lineHeight: 1.6 }}>
                  {result.category_evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {result.anomaly_location && (
                <p style={{ fontSize: 12, color: '#ffc888', margin: '0 0 8px', borderTop: '1px solid #112418', paddingTop: 8 }}>
                  <span className="mono" style={{ color: '#ffa040', letterSpacing: 1.5, marginRight: 6 }}>LOCATION:</span>
                  {result.anomaly_location}
                </p>
              )}
              {result.tools_likely_used && (
                <p style={{ fontSize: 12, color: '#86efac', margin: 0, borderTop: '1px solid #112418', paddingTop: 8 }}>
                  <span className="mono" style={{ color: geminiAccent, letterSpacing: 1.5, marginRight: 6 }}>TOOLS USED:</span>
                  {result.tools_likely_used}
                </p>
              )}
              {result.reasoning_steps?.length > 0 && (
                <details style={{ marginTop: 10, borderTop: '1px solid #112418', paddingTop: 8 }}>
                  <summary className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 1.5, cursor: 'pointer' }}>
                    ▸ REASONING STEPS ({result.reasoning_steps.length})
                  </summary>
                  <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: '#86efac', lineHeight: 1.7 }}>
                    {result.reasoning_steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </details>
              )}

              {/* Alternative hypotheses */}
              {result.alternatives?.length > 0 && (
                <div style={{
                  marginTop: 12, borderTop: '1px solid #1d3825', paddingTop: 10,
                }}>
                  <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#ffa040', margin: '0 0 8px' }}>
                    ⚠ ALTERNATIVE {result.alternatives.length > 1 ? `HYPOTHESES (${result.alternatives.length})` : 'HYPOTHESIS'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.alternatives.map((alt, i) => (
                      <div key={i} style={{
                        background: 'rgba(255,160,64,0.04)', borderRadius: 2, padding: '8px 12px',
                        border: '1px solid rgba(255,160,64,0.2)',
                      }}>
                        <p style={{ fontSize: 13, color: '#ffc888', margin: 0, lineHeight: 1.6 }}>
                          <strong style={{ color: '#ffd680', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                            {alt.category_label}
                          </strong>
                          {alt.reasoning && (
                            <span style={{ color: '#c4a45a' }}> — {alt.reasoning}</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', padding: '4px 10px', border: '1px solid #1d3825', borderRadius: 2 }}>
              ▣ GEMINI VISION · TEMPORARILY UNAVAILABLE
            </span>
          </div>
        )}

        {/* ── LLM Explanation ── */}
        {result.llm_explanation && (
          <div style={{ marginBottom: 20 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: '#6dba85', margin: '0 0 8px' }}>▸ AI FORENSIC EXPLANATION</p>
            <p style={{ lineHeight: 1.7, fontSize: 14, color: '#d8ffe6', margin: 0 }}>{result.llm_explanation}</p>
          </div>
        )}
        {!result.llm_explanation && result.llm_locked && (
          <div style={{ marginBottom: 20 }}>
            <LlmUpgradePrompt requiredPlan={result.llm_required_plan} />
          </div>
        )}

        {/* ── YOLO Detections — only when bounding boxes exist ── */}
        {hasYolo && (
          <div style={{ marginBottom: 16 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: '#6dba85', margin: '0 0 8px' }}>▸ YOLO · DETECTED REGIONS</p>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: 2, border: '1px solid #1d3825', marginBottom: 12 }} />
            {result.annotations.map((ann, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #112418' }}>
                <span style={{ width: 26, height: 26, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ann.color, color: '#000', fontSize: 11, fontWeight: 800, boxShadow: `0 0 8px ${ann.color}80`, fontFamily: "'JetBrains Mono', monospace" }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: '#d8ffe6' }}>{ann.title}</span>
                <span className="mono" style={{ fontSize: 12, color: ann.color }}>{(ann.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

