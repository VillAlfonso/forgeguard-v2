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
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [documentTypes, setDocumentTypes] = useState([]);
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

  // Load document types on mount
  React.useEffect(() => {
    api.getDocumentTypes()
      .then(data => setDocumentTypes(data.document_types))
      .catch(err => console.error('Failed to load document types:', err));
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
    setQuotaExhausted(false);
    try {
      const data = await api.analyze(
        file,
        null,
        documentType !== 'other' ? documentType : null,
        null,
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
      if (err.message === 'quota_exhausted') {
        setQuotaExhausted(true);
      } else {
        setError(err.message);
      }
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, maxWidth: 800 }}>
        <div className="card">
          <h3 className="oswald" style={{
            fontSize: 13, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 16,
            color: '#6dba85',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <MagnifierIcon size={16} color="#6dba85" />
            Capture Document
          </h3>

          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

          {!preview ? (
            <>
              {/* Camera-first big primary action */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleTakePhoto}
                style={{
                  width: '100%',
                  padding: '22px 16px',
                  fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  marginBottom: 12,
                  minHeight: 64,
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>⌖</span>
                <span>Take Photo</span>
              </button>

              <div
                onClick={() => fileRef.current.click()}
                style={{
                  border: '1px dashed #1f5d39', borderRadius: 3,
                  padding: 36, textAlign: 'center',
                  background: 'rgba(0,255,102,0.02)',
                  cursor: 'pointer',
                }}
              >
                <div className="mono glow" style={{ fontSize: 28, marginBottom: 8, color: '#00ff66' }}>+</div>
                <p className="mono" style={{ color: '#86efac', fontSize: 12, letterSpacing: 1.5 }}>UPLOAD FROM GALLERY</p>
              </div>
            </>
          ) : (
            <>
              {/* Preview with retake control */}
              <div style={{
                border: '1px solid #1d3825', borderRadius: 3, padding: 12,
                background: '#000', textAlign: 'center', marginBottom: 12,
              }}>
                <img src={preview} alt="Preview" style={{
                  maxWidth: '100%', maxHeight: 360, borderRadius: 2,
                  display: 'block', margin: '0 auto',
                }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  style={{
                    padding: '12px', minHeight: 44,
                    background: 'transparent', border: '1px solid #1d3825',
                    color: '#86efac', cursor: 'pointer', borderRadius: 3,
                    fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1.5, fontSize: 12,
                  }}
                >
                  ↻ Retake
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current.click()}
                  style={{
                    padding: '12px', minHeight: 44,
                    background: 'transparent', border: '1px solid #1d3825',
                    color: '#86efac', cursor: 'pointer', borderRadius: 3,
                    fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1.5, fontSize: 12,
                  }}
                >
                  ⎙ Upload
                </button>
              </div>
            </>
          )}
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

        {quotaExhausted && (
          <div style={{
            background: 'rgba(255,160,64,0.08)', border: '1px solid #ffa040', padding: 16, borderRadius: 3,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <div style={{ fontSize: 14, color: '#ffa040', fontWeight: 700, marginBottom: 10 }}>
              ⚠ API Quota Exhausted
            </div>
            <p style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.7, margin: '0 0 10px 0' }}>
              Your current API key has used up its free daily quota (1,500 requests/day).
              It will <strong style={{ color: '#ffa040' }}>reset automatically in ~24 hours</strong>.
            </p>
            <p style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.7, margin: '0 0 14px 0' }}>
              <strong style={{ color: '#00ff66' }}>To keep scanning right now:</strong> Go to your Account page,
              tap "Open Google AI Studio" with a different Google account, copy the new API key,
              come back and add it as a backup key — then tap "Use This" to switch to it.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/account" style={{
                padding: '8px 16px', background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66',
                borderRadius: 3, color: '#00ff66', textDecoration: 'none', fontSize: 12,
                fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
              }}>→ Manage API Keys</a>
              <div style={{ fontSize: 11, color: '#3f6e4a', alignSelf: 'center' }}>
                or wait ~24h for your current key to reset
              </div>
            </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 'clamp(10px, 3vw, 14px) clamp(12px, 3.5vw, 20px)', borderBottom: `1px solid ${vc}33` }}>
        <h3 className="oswald" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, color: '#d8ffe6', margin: 0, whiteSpace: 'nowrap' }}>◆ Forensic Report</h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
          {documentTypeLabel && documentTypeLabel !== 'Other Document' && (
            <span className="mono" style={{ fontSize: 9, color: '#6dba85', letterSpacing: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              📄 {documentTypeLabel.toUpperCase()}
            </span>
          )}
          <span className="mono" style={{ fontSize: 10, color: '#3f6e4a' }}>{result.scan_id}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: 'clamp(20px, 5vw, 28px) clamp(14px, 4vw, 20px) clamp(18px, 4vw, 24px)', background: '#000', borderBottom: `1px solid ${geminiAccent}33`, boxShadow: `inset 0 0 32px ${geminiAccent}18` }}>
        <div className="oswald" style={{
          fontSize: 'clamp(18px, 5.5vw, 32px)',
          fontWeight: 700, color: geminiAccent,
          textTransform: 'uppercase',
          letterSpacing: 'clamp(2px, 0.6vw, 5px)',
          textShadow: `0 0 18px ${geminiAccent}99`,
          lineHeight: 1.15,
          wordBreak: 'break-word',
        }}>
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

      <div style={{ padding: 'clamp(14px, 4vw, 20px) clamp(12px, 3.5vw, 20px) 4px' }}>
        {/* ── Gemini Vision ── */}
        {geminiOk ? (
          <div style={{ marginBottom: 20 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: geminiAccent, margin: '0 0 8px', textShadow: `0 0 6px ${geminiAccent}99` }}>
              ▣ GEMINI VISION · CLASSIFICATION
            </p>
            <div style={{ background: `${geminiAccent}08`, border: `1px solid ${geminiAccent}44`, borderLeft: `3px solid ${geminiAccent}`, borderRadius: 3, padding: 'clamp(10px, 3vw, 14px)' }}>
              {(() => {
                const conf = result.category_confidence || 0;
                const altCount = result.alternatives?.length || 0;
                if (conf >= 0.90) return null;

                const isInconclusive = conf < 0.50;
                const isUncertain = conf < 0.85;
                const color = isInconclusive ? '#ff5555' : '#ffa040';
                const label = isInconclusive ? 'INCONCLUSIVE — NOT A DEFINITIVE ANSWER'
                              : isUncertain ? 'UNCERTAIN — TREAT AS A LEAD, NOT A VERDICT'
                              : 'BORDERLINE CONFIDENCE';
                const message = isInconclusive
                  ? `The model could not determine a definitive forgery type. It guessed "${result.detected_category_label}" but only at ${(conf * 100).toFixed(0)}% confidence. ${altCount > 0 ? `The result could realistically be one of ${altCount} other types listed below.` : 'Manual review by a forensic examiner is recommended.'}`
                  : isUncertain
                  ? `The model picked "${result.detected_category_label}" as its best guess at ${(conf * 100).toFixed(0)}% confidence — below the 85% threshold for a definitive call. ${altCount > 0 ? `It also seriously considered ${altCount} other forgery type${altCount > 1 ? 's' : ''} (see "Could Also Be" below). The image evidence is not strong enough to rule them out.` : 'Consider re-scanning with a higher-resolution image or adding context.'}`
                  : `Confidence is ${(conf * 100).toFixed(0)}% — close to definitive but not quite. Review the alternatives before acting on this result.`;

                return (
                  <div style={{
                    background: `${color}12`,
                    border: `1px solid ${color}55`,
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 2,
                    padding: '10px 12px',
                    marginBottom: 12,
                  }}>
                    <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color, margin: '0 0 6px', fontWeight: 700 }}>
                      ⚠ {label}
                    </p>
                    <p style={{ fontSize: 12, color: '#ffd680', margin: 0, lineHeight: 1.6 }}>
                      {message}
                    </p>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  {(() => {
                    const conf = result.category_confidence || 0;
                    if (conf >= 0.90) return null;
                    const prefix = conf < 0.50 ? 'STRONGEST GUESS' : 'MOST LIKELY';
                    const color = conf < 0.50 ? '#ff5555' : '#ffa040';
                    return (
                      <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color, margin: '0 0 4px' }}>
                        {prefix}:
                      </p>
                    );
                  })()}
                  <h4 className="oswald" style={{ fontSize: 'clamp(14px, 4vw, 17px)', color: '#d8ffe6', textTransform: 'uppercase', letterSpacing: 1.8, margin: 0, lineHeight: 1.25, wordBreak: 'break-word' }}>
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

              {/* Ambiguity + Confidence + Capture Tips */}
              {(() => {
                const conf = result.category_confidence || 0;
                const dims = result.original_image_dimensions;
                const w = dims?.width || result.image_width || 0;
                const h = dims?.height || result.image_height || 0;
                const minDim = Math.min(w, h);
                const alts = result.alternatives || [];

                // Build confidence reasons
                const confReasons = [];
                if (minDim > 0 && minDim < 600) {
                  confReasons.push(`Image resolution is very low (${w}×${h}px) — forensic artifacts like halos, fiber texture, and compression noise are difficult to distinguish below 600px on the shortest side.`);
                } else if (minDim > 0 && minDim < 1000) {
                  confReasons.push(`Image resolution is moderate (${w}×${h}px) — some fine forensic details may be lost. Recommended minimum: 1000px on shortest side.`);
                }
                if (alts.length > 0) {
                  const altNames = alts.slice(0, 2).map(a => a.category_label).join(' and ');
                  confReasons.push(`Visual indicators overlap with ${altNames} — these categories share similar surface characteristics that are hard to separate without higher image quality or context.`);
                }
                if (!result.anomaly_location) {
                  confReasons.push('No specific anomaly location was identified, which limits certainty.');
                }
                const hasContext = result.document_type && result.document_type !== 'other';
                if (!hasContext) {
                  confReasons.push('No document type was provided. Adding context (bank check, ID, certificate, etc.) helps the model focus on the right forgery patterns.');
                }

                // Capture tips
                const captureTips = [];
                if (minDim < 1000) {
                  captureTips.push('Shoot closer or use higher camera resolution. Target at least 1000×1000px — phone cameras at close range easily achieve this.');
                }
                captureTips.push('Use even, diffuse lighting. Avoid harsh shadows or glare — tilt the document slightly if a flash is washing out surface texture.');
                captureTips.push('Lay the document flat on a plain surface. Creases and perspective distortion make edge artifacts harder to detect.');
                captureTips.push('If examining a signature or stamp, zoom in on just that area for a second scan — localized detail is more useful than the whole page at low resolution.');
                if (!hasContext) {
                  captureTips.push('Fill in the Additional Context section before scanning — document type and your suspicion reason significantly narrow the analysis.');
                }

                const showSection = alts.length > 0 || confReasons.length > 0;
                if (!showSection) return null;

                return (
                  <div style={{ marginTop: 12, borderTop: '1px solid #1d3825', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Could it be something else? */}
                    {alts.length > 0 && (
                      <div>
                        <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#ffa040', margin: '0 0 8px' }}>
                          ⚠ COULD ALSO BE ({alts.length})
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {alts.map((alt, i) => (
                            <div key={i} style={{ background: 'rgba(255,160,64,0.04)', borderRadius: 2, padding: '8px 12px', border: '1px solid rgba(255,160,64,0.18)' }}>
                              <p style={{ fontSize: 12, color: '#ffd680', margin: '0 0 3px', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1 }}>
                                {alt.category_label}
                              </p>
                              {alt.reasoning && (
                                <p style={{ fontSize: 12, color: '#c4a45a', margin: 0, lineHeight: 1.6 }}>{alt.reasoning}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Why this confidence? */}
                    {confReasons.length > 0 && (
                      <details style={{ borderTop: '1px solid #1d3825', paddingTop: 10 }}>
                        <summary className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#6dba85', cursor: 'pointer', marginBottom: 0 }}>
                          ▸ WHY {(conf * 100).toFixed(0)}% CONFIDENCE?
                        </summary>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#86efac', lineHeight: 1.7 }}>
                          {confReasons.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </details>
                    )}

                    {/* How to improve */}
                    <details style={{ borderTop: '1px solid #1d3825', paddingTop: 10 }}>
                      <summary className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#6dba85', cursor: 'pointer' }}>
                        ▸ HOW TO GET A BETTER RESULT
                      </summary>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#86efac', lineHeight: 1.7 }}>
                        {captureTips.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </details>

                  </div>
                );
              })()}
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

