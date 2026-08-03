"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import "./globals.css"; // Ensure your CSS is imported

// --- Math & Helper Functions for the Dial ---
const START_ANGLE = 135;
const SWEEP = 270;
const CX = 100, CY = 100, R = 80;

function polarToXY(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function describeArc(startAngle, endAngle) {
  const start = polarToXY(startAngle);
  const end = polarToXY(endAngle);
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(v) {
  return START_ANGLE + SWEEP * (v / 100);
}

function angleToValue(angle) {
  let phi = angle - START_ANGLE;
  if (phi < 0) phi += 360;
  let value;
  if (phi <= SWEEP) {
    value = (phi / SWEEP) * 100;
  } else if (phi <= SWEEP + (360 - SWEEP) / 2) {
    value = 100;
  } else {
    value = 1;
  }
  return Math.round(Math.max(1, Math.min(100, value)));
}

export default function Darkroom() {
  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // Refs for DOM elements that need direct interaction
  const fileInputRef = useRef(null);
  const dialSvgRef = useRef(null);
  const compareWrapRef = useRef(null);
  const isDraggingDial = useRef(false);
  const isComparing = useRef(false);

  const activeImage = images.find((i) => i.id === activeId) || null;

  // --- Format Helpers ---
  const fmtKB = (bytes) => (bytes / 1024).toFixed(1) + " KB";
  const extFor = (format) => (format === "jpeg" ? "jpg" : format);
  const stripExt = (name) => {
    const idx = name.lastIndexOf(".");
    return idx > -1 ? name.slice(0, idx) : name;
  };

  // --- File Upload & Initialization ---
  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    files.forEach((file) => {
      const id = Date.now() + Math.random();
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const defaultFormat = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpeg";
        const newObj = {
          id,
          name: file.name,
          originalURL: url,
          originalSize: file.size,
          img,
          format: defaultFormat,
          quality: 75,
          resizeEnabled: false,
          targetWidth: img.naturalWidth,
          compressedBlob: null,
          compressedURL: null,
          compressedSize: 0,
        };

        setImages((prev) => {
          const updated = [...prev, newObj];
          if (updated.length === 1) setActiveId(id);
          return updated;
        });

        // Trigger initial compression
        forceRecompress(newObj);
      };
      img.src = url;
    });
  };

  // --- Image Compression Logic (Canvas) ---
  const compressImage = (obj) => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      let w = obj.img.naturalWidth;
      let h = obj.img.naturalHeight;

      if (obj.resizeEnabled && obj.targetWidth > 0) {
        const aspect = h / w;
        w = obj.targetWidth;
        h = Math.round(w * aspect);
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(obj.img, 0, 0, w, h);

      const mime = "image/" + obj.format;
      const qualityParam = obj.format === "png" ? undefined : obj.quality / 100;

      canvas.toBlob((blob) => {
        if (!blob) { resolve(obj); return; }
        if (obj.compressedURL) URL.revokeObjectURL(obj.compressedURL);
        resolve({
          ...obj,
          compressedBlob: blob,
          compressedURL: URL.createObjectURL(blob),
          compressedSize: blob.size,
        });
      }, mime, qualityParam);
    });
  };

  const forceRecompress = async (obj) => {
    if (!obj) return;
    const updatedObj = await compressImage(obj);
    setImages((prev) => prev.map((img) => (img.id === obj.id ? updatedObj : img)));
  };

  // Debounced Recompression using useEffect
  useEffect(() => {
    if (!activeImage) return;
    const timer = setTimeout(() => forceRecompress(activeImage), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage?.quality, activeImage?.format, activeImage?.resizeEnabled, activeImage?.targetWidth]);

  // --- Handlers ---
  const updateActiveImage = (updates) => {
    setImages((prev) => prev.map((img) => (img.id === activeId ? { ...img, ...updates } : img)));
  };

  const removeImage = (id, e) => {
    e.stopPropagation();
    const idx = images.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const obj = images[idx];
    URL.revokeObjectURL(obj.originalURL);
    if (obj.compressedURL) URL.revokeObjectURL(obj.compressedURL);

    const newImages = images.filter((i) => i.id !== id);
    setImages(newImages);
    if (activeId === id) {
      setActiveId(newImages.length ? newImages[0].id : null);
    }
  };

  const clearAll = () => {
    images.forEach((o) => {
      URL.revokeObjectURL(o.originalURL);
      if (o.compressedURL) URL.revokeObjectURL(o.compressedURL);
    });
    setImages([]);
    setActiveId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const download = (obj) => {
    if (!obj || !obj.compressedBlob) return;
    const a = document.createElement("a");
    a.href = obj.compressedURL;
    a.download = stripExt(obj.name) + "-compressed." + extFor(obj.format);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const applyAll = async () => {
    if (!activeImage) return;
    const newImages = [...images];
    for (let i = 0; i < newImages.length; i++) {
      if (newImages[i].id !== activeId) {
        newImages[i] = await compressImage({
          ...newImages[i],
          format: activeImage.format,
          quality: activeImage.quality,
          resizeEnabled: activeImage.resizeEnabled,
          targetWidth: activeImage.targetWidth,
        });
      }
    }
    setImages(newImages);
  };

  const downloadAll = async (e) => {
    if (!images.length) return;
    const btn = e.target;
    const originalText = btn.textContent;
    btn.textContent = "Zipping…";
    btn.disabled = true;

    const zip = new JSZip();
    // Ensure all are compressed (they usually are by state, but just in case)
    images.forEach((o) => {
      if (o.compressedBlob) {
        zip.file(stripExt(o.name) + "-compressed." + extFor(o.format), o.compressedBlob);
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "darkroom-compressed.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    btn.textContent = originalText;
    btn.disabled = false;
  };

  // --- Custom Dial Pointer Logic ---
  const angleFromPointer = (clientX, clientY) => {
    if (!dialSvgRef.current) return 0;
    const rect = dialSvgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
  };

  const handleDialPointerDown = (e) => {
    isDraggingDial.current = true;
    e.target.setPointerCapture(e.pointerId);
    updateActiveImage({ quality: angleToValue(angleFromPointer(e.clientX, e.clientY)) });
  };
  const handleDialPointerMove = (e) => {
    if (!isDraggingDial.current) return;
    updateActiveImage({ quality: angleToValue(angleFromPointer(e.clientX, e.clientY)) });
  };
  const handleDialPointerUp = (e) => {
    isDraggingDial.current = false;
    e.target.releasePointerCapture(e.pointerId);
  };
  const handleDialKeyDown = (e) => {
    if (!activeImage) return;
    let v = activeImage.quality;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v += 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= 1;
    else if (e.key === "PageUp") v += 10;
    else if (e.key === "PageDown") v -= 10;
    else if (e.key === "Home") v = 1;
    else if (e.key === "End") v = 100;
    else return;
    e.preventDefault();
    updateActiveImage({ quality: Math.max(1, Math.min(100, v)) });
  };

  // --- Compare Slider Logic ---
  const setComparePos = (clientX) => {
    if (!compareWrapRef.current) return;
    const rect = compareWrapRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    compareWrapRef.current.style.setProperty("--pos", pct + "%");
  };

  const handleComparePointerDown = (e) => {
    isComparing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setComparePos(e.clientX);
  };
  const handleComparePointerMove = (e) => {
    if (!isComparing.current) return;
    setComparePos(e.clientX);
  };
  const handleComparePointerUp = (e) => {
    isComparing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // --- Render Helpers ---
  const savingsPct = activeImage && activeImage.compressedSize
    ? ((activeImage.originalSize - activeImage.compressedSize) / activeImage.originalSize) * 100
    : 0;
  const isGoodSavings = savingsPct >= 0;

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">Local · Private · Instant</p>
        <h1>Darkroom</h1>
        <p>Develop leaner photos without leaving your browser. Drop in JPEGs, PNGs, or WebPs and dial in the exposure — nothing ever leaves your machine.</p>
      </div>

      <div
        className="dropzone"
        tabIndex="0"
        role="button"
        onClick={() => fileInputRef.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('dragover');
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V6a2 2 0 0 1 2-2h1l1.5-2h7L17 4h1a2 2 0 0 1 2 2v2" /><path d="M2 8h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" /><circle cx="12" cy="14" r="4" />
        </svg>
        <p className="dropzone-title">Drag photos here, or click to load</p>
        <p className="dropzone-sub">Batch-friendly · <strong>JPEG · PNG · WebP</strong></p>
        <input type="file" ref={fileInputRef} accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {images.length > 0 && (
        <>
          <div className="filmstrip-section">
            <div className="filmstrip-wrap">
              <div className="filmstrip">
                {images.map((obj) => (
                  <div key={obj.id} className={`thumb ${obj.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(obj.id)}>
                    <img src={obj.originalURL} alt={obj.name} />
                    <button className="thumb-remove" onClick={(e) => removeImage(obj.id, e)}>×</button>
                  </div>
                ))}
                <button className="thumb-add" onClick={() => fileInputRef.current.click()}>+</button>
              </div>
            </div>
          </div>

          {activeImage && (
            <div className="workbench">
              <div className="compare-panel">
                <div
                  className="compare-wrap"
                  ref={compareWrapRef}
                  onPointerDown={handleComparePointerDown}
                  onPointerMove={handleComparePointerMove}
                  onPointerUp={handleComparePointerUp}
                  onPointerCancel={handleComparePointerUp}
                >
                  <img className="img-before" src={activeImage.originalURL} alt="Original" />
                  <img className="img-after" src={activeImage.compressedURL || activeImage.originalURL} alt="Compressed" />
                  <div className="compare-handle"></div>
                  <span className="tag tag-before">Before</span>
                  <span className="tag tag-after">After</span>
                </div>
                <p className="dims-readout">
                  {activeImage.img.naturalWidth}×{activeImage.img.naturalHeight} original → {activeImage.resizeEnabled ? activeImage.targetWidth : activeImage.img.naturalWidth}×
                  {activeImage.resizeEnabled ? Math.round(activeImage.targetWidth * (activeImage.img.naturalHeight / activeImage.img.naturalWidth)) : activeImage.img.naturalHeight} output · {activeImage.format.toUpperCase()}
                </p>
              </div>

              <div className="controls-panel">
                <div className="control-block">
                  <span className="control-label">Output format</span>
                  <div className="format-chips">
                    {['jpeg', 'webp', 'png'].map((fmt) => (
                      <button
                        key={fmt}
                        className={`chip ${activeImage.format === fmt ? 'active' : ''}`}
                        onClick={() => updateActiveImage({ format: fmt })}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`control-block qualityblock ${activeImage.format === 'png' ? 'is-disabled' : ''}`}>
                  <span className="control-label">Exposure (quality)</span>
                  <div className="dial-wrap">
                    <svg
                      ref={dialSvgRef}
                      className="dial-svg"
                      viewBox="0 0 200 200"
                      role="slider"
                      tabIndex={activeImage.format === 'png' ? -1 : 0}
                      aria-valuemin="1"
                      aria-valuemax="100"
                      aria-valuenow={activeImage.quality}
                      onPointerDown={handleDialPointerDown}
                      onPointerMove={handleDialPointerMove}
                      onPointerUp={handleDialPointerUp}
                      onPointerCancel={handleDialPointerUp}
                      onKeyDown={handleDialKeyDown}
                    >
                      <path className="dial-track" d={describeArc(START_ANGLE, START_ANGLE + SWEEP)} />
                      <path className="dial-progress" d={describeArc(START_ANGLE, valueToAngle(activeImage.quality))} />
                      <circle className="dial-knob" cx={polarToXY(valueToAngle(activeImage.quality)).x} cy={polarToXY(valueToAngle(activeImage.quality)).y} r="8" />
                    </svg>
                    <div className="dial-readout"><strong>{activeImage.quality}</strong><span>%</span></div>
                  </div>
                  <p className="hint">PNG is lossless — file size only changes with resizing.</p>
                </div>

                <div className="control-block">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={activeImage.resizeEnabled}
                      onChange={(e) => updateActiveImage({ resizeEnabled: e.target.checked })}
                    />
                    <span>Resize before compressing</span>
                  </label>

                  <div className={`resize-inputs ${activeImage.resizeEnabled ? 'open' : ''}`}>
                    <div className="resize-inputs-inner">
                      <label className="resize-label">Max width (px)</label>
                      <div className="input-with-dims">
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={activeImage.targetWidth}
                          onChange={(e) => updateActiveImage({ targetWidth: Math.max(10, parseInt(e.target.value) || activeImage.img.naturalWidth) })}
                        />
                        <span className="resize-linked">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m18 8 4 4-4 4" />
                            <path d="M22 12H2" />
                            <path d="m6 8-4 4 4 4" />
                          </svg>
                          {activeImage.targetWidth} × {Math.round(activeImage.targetWidth * (activeImage.img.naturalHeight / activeImage.img.naturalWidth))}px
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="stats-block" aria-live="polite">
                  <div className="stat"><span>Original</span><strong>{fmtKB(activeImage.originalSize)}</strong></div>
                  <div className="stat"><span>Compressed</span><strong>{activeImage.compressedSize ? fmtKB(activeImage.compressedSize) : '—'}</strong></div>
                  <div className="stat stat-savings">
                    <span>Change</span>
                    <strong className={isGoodSavings ? 'good' : 'warn'}>
                      {activeImage.compressedSize ? (isGoodSavings ? '−' : '+') + Math.abs(savingsPct).toFixed(0) + '%' : '—'}
                    </strong>
                  </div>
                  <div className="bar-compare">
                    <div
                      className={`bar-compressed ${!isGoodSavings ? 'warn' : ''}`}
                      style={{ width: activeImage.compressedSize ? Math.min(100, (activeImage.compressedSize / activeImage.originalSize) * 100) + '%' : '0%' }}
                    ></div>
                  </div>
                </div>

                <div className="action-row">
                  <button className="btn btn-primary" onClick={() => download(activeImage)}>Download</button>
                  <button className="btn btn-ghost" onClick={applyAll}>Apply to all</button>
                </div>
              </div>
            </div>
          )}

          <div className="global-actions">
            <button className="btn btn-primary" onClick={downloadAll}>Download all (.zip)</button>
            <button className="btn btn-danger" onClick={clearAll}>Clear all</button>
          </div>
        </>
      )}

      <p className="footer">All processing happens on-device via the Canvas API. No file is ever uploaded.</p>
    </div>
  );
}