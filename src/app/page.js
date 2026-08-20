"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Copy,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  Upload,
  Zap,
  Lock,
  Unlock,
  Layers3,
} from "lucide-react";
import "./globals.css";

const QUALITY_PRESETS = [
  { label: "Web", value: 60, note: "Small" },
  { label: "Balanced", value: 75, note: "Recommended" },
  { label: "Print", value: 92, note: "High quality" },
];

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extFor(format) {
  return format === "jpeg" ? "jpg" : format;
}

function stripExt(name) {
  const idx = name.lastIndexOf(".");
  return idx > -1 ? name.slice(0, idx) : name;
}

export default function Darkroom() {
  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [dimensionsCopied, setDimensionsCopied] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const fileInputRef = useRef(null);
  const compareWrapRef = useRef(null);
  const isComparing = useRef(false);

  const activeImage = images.find((image) => image.id === activeId) || null;

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    const handlePaste = (event) => {
      const files = event.clipboardData?.files;
      if (files?.length) addFiles(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (!activeImage) return;

      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
      }

      if (mod && event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetImage();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeImage]);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter((file) =>
      file.type.startsWith("image/")
    );

    files.forEach((file, index) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}`;
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const defaultFormat =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpeg";

        const image = {
          id,
          name: file.name,
          originalURL: url,
          originalSize: file.size,
          img,
          format: defaultFormat,
          defaultFormat,
          quality: 75,
          resizeEnabled: false,
          targetWidth: img.naturalWidth,
          targetHeight: img.naturalHeight,
          lockAspect: true,
          grayscale: false,
          rotation: 0,
          flipX: false,
          flipY: false,
          brightness: 100,
          contrast: 100,
          saturation: 100,
          compressedBlob: null,
          compressedURL: null,
          compressedSize: 0,
        };

        setImages((prev) => {
          const next = [...prev, image];
          if (next.length === 1) setActiveId(id);
          return next;
        });

        forceRecompress(image);
      };

      img.src = url;
    });
  };

  const compressImage = (obj) =>
    new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      let width = obj.img.naturalWidth;
      let height = obj.img.naturalHeight;

      if (obj.resizeEnabled && obj.targetWidth > 0 && obj.targetHeight > 0) {
        width = obj.targetWidth;
        height = obj.targetHeight;
      }

      const rotation = obj.rotation % 360;
      const vertical = rotation === 90 || rotation === 270;

      canvas.width = vertical ? height : width;
      canvas.height = vertical ? width : height;

      const ctx = canvas.getContext("2d", { alpha: true });

      if (!ctx) {
        resolve(obj);
        return;
      }

      const filters = [
        `brightness(${obj.brightness}%)`,
        `contrast(${obj.contrast}%)`,
        `saturate(${obj.saturation}%)`,
        obj.grayscale ? "grayscale(100%)" : "",
      ].filter(Boolean);

      ctx.filter = filters.join(" ");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
      ctx.drawImage(obj.img, -width / 2, -height / 2, width, height);

      const mime = obj.format === "jpeg" ? "image/jpeg" : `image/${obj.format}`;
      const quality = obj.format === "png" ? undefined : obj.quality / 100;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(obj);
            return;
          }

          if (obj.compressedURL) {
            URL.revokeObjectURL(obj.compressedURL);
          }

          resolve({
            ...obj,
            compressedBlob: blob,
            compressedURL: URL.createObjectURL(blob),
            compressedSize: blob.size,
          });
        },
        mime,
        quality
      );
    });

  const forceRecompress = async (obj) => {
    if (!obj) return;
    const fresh = await compressImage(obj);

    setImages((prev) =>
      prev.map((image) => (image.id === obj.id ? fresh : image))
    );
  };

  useEffect(() => {
    if (!activeImage) return;

    const timer = setTimeout(() => forceRecompress(activeImage), 110);
    return () => clearTimeout(timer);
  }, [
    activeImage?.quality,
    activeImage?.format,
    activeImage?.resizeEnabled,
    activeImage?.targetWidth,
    activeImage?.targetHeight,
    activeImage?.grayscale,
    activeImage?.rotation,
    activeImage?.flipX,
    activeImage?.flipY,
    activeImage?.brightness,
    activeImage?.contrast,
    activeImage?.saturation,
  ]);

  const updateActiveImage = (updates) => {
    setImages((prev) =>
      prev.map((image) =>
        image.id === activeId ? { ...image, ...updates } : image
      )
    );
  };

  const resetImage = () => {
    if (!activeImage) return;

    updateActiveImage({
      format: activeImage.defaultFormat,
      quality: 75,
      resizeEnabled: false,
      targetWidth: activeImage.img.naturalWidth,
      targetHeight: activeImage.img.naturalHeight,
      lockAspect: true,
      grayscale: false,
      rotation: 0,
      flipX: false,
      flipY: false,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });
  };

  const autoOptimize = () => {
    if (!activeImage) return;

    const maxDimension = 2400;
    const largest = Math.max(
      activeImage.img.naturalWidth,
      activeImage.img.naturalHeight
    );

    const shouldResize = largest > maxDimension;

    let targetWidth = activeImage.img.naturalWidth;
    let targetHeight = activeImage.img.naturalHeight;

    if (shouldResize) {
      const ratio = maxDimension / largest;
      targetWidth = Math.max(
        10,
        Math.round(activeImage.img.naturalWidth * ratio)
      );
      targetHeight = Math.max(
        10,
        Math.round(activeImage.img.naturalHeight * ratio)
      );
    }

    updateActiveImage({
      format: "webp",
      quality: 82,
      resizeEnabled: shouldResize,
      targetWidth,
      targetHeight,
    });
  };

  const removeImage = (id, event) => {
    event.stopPropagation();

    const target = images.find((image) => image.id === id);
    if (!target) return;

    URL.revokeObjectURL(target.originalURL);

    if (target.compressedURL) {
      URL.revokeObjectURL(target.compressedURL);
    }

    const next = images.filter((image) => image.id !== id);
    setImages(next);

    if (activeId === id) {
      setActiveId(next.length ? next[0].id : null);
    }
  };

  const clearAll = () => {
    images.forEach((image) => {
      URL.revokeObjectURL(image.originalURL);

      if (image.compressedURL) {
        URL.revokeObjectURL(image.compressedURL);
      }
    });

    setImages([]);
    setActiveId(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const download = (obj) => {
    if (!obj?.compressedBlob) return;

    const anchor = document.createElement("a");
    anchor.href = obj.compressedURL;
    anchor.download = `${stripExt(obj.name)}-compressed.${extFor(obj.format)}`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const applyAll = async () => {
    if (!activeImage) return;

    const next = [...images];

    for (let i = 0; i < next.length; i += 1) {
      if (next[i].id === activeId) continue;

      next[i] = await compressImage({
        ...next[i],
        format: activeImage.format,
        quality: activeImage.quality,
        resizeEnabled: activeImage.resizeEnabled,
        targetWidth: activeImage.targetWidth,
        targetHeight: activeImage.targetHeight,
        lockAspect: activeImage.lockAspect,
        grayscale: activeImage.grayscale,
        rotation: activeImage.rotation,
        flipX: activeImage.flipX,
        flipY: activeImage.flipY,
        brightness: activeImage.brightness,
        contrast: activeImage.contrast,
        saturation: activeImage.saturation,
      });
    }

    setImages(next);
  };

  const downloadAll = async () => {
    if (!images.length || zipBusy) return;

    setZipBusy(true);

    try {
      const zip = new JSZip();

      images.forEach((image) => {
        if (image.compressedBlob) {
          zip.file(
            `${stripExt(image.name)}-compressed.${extFor(image.format)}`,
            image.compressedBlob
          );
        }
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = "darkroom-compressed.zip";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } finally {
      setZipBusy(false);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl || window.location.href);
      setCopied(true);

      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const copyOutputDimensions = async () => {
    if (!activeImage) return;

    try {
      await navigator.clipboard.writeText(`${outputWidth} × ${outputHeight}`);
      setDimensionsCopied(true);

      setTimeout(() => setDimensionsCopied(false), 1500);
    } catch {
      setDimensionsCopied(false);
    }
  };

  const handleWidthChange = (event) => {
    if (!activeImage) return;

    const width = Math.max(
      10,
      parseInt(event.target.value, 10) || activeImage.img.naturalWidth
    );

    if (activeImage.lockAspect) {
      const aspect =
        activeImage.img.naturalHeight / activeImage.img.naturalWidth;

      updateActiveImage({
        targetWidth: width,
        targetHeight: Math.round(width * aspect),
      });
    } else {
      updateActiveImage({ targetWidth: width });
    }
  };

  const handleHeightChange = (event) => {
    if (!activeImage) return;

    const height = Math.max(
      10,
      parseInt(event.target.value, 10) || activeImage.img.naturalHeight
    );

    if (activeImage.lockAspect) {
      const aspect =
        activeImage.img.naturalWidth / activeImage.img.naturalHeight;

      updateActiveImage({
        targetHeight: height,
        targetWidth: Math.round(height * aspect),
      });
    } else {
      updateActiveImage({ targetHeight: height });
    }
  };

  const setComparePos = (clientX) => {
    if (!compareWrapRef.current) return;

    const rect = compareWrapRef.current.getBoundingClientRect();
    const percentage = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100)
    );

    compareWrapRef.current.style.setProperty("--pos", `${percentage}%`);
  };

  const handleComparePointerDown = (event) => {
    isComparing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setComparePos(event.clientX);
  };

  const handleComparePointerMove = (event) => {
    if (isComparing.current) {
      setComparePos(event.clientX);
    }
  };

  const handleComparePointerUp = (event) => {
    isComparing.current = false;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { }
  };

  const originalSize = activeImage?.originalSize || 0;
  const compressedSize = activeImage?.compressedSize || 0;

  const savingsPct =
    originalSize && compressedSize
      ? ((originalSize - compressedSize) / originalSize) * 100
      : 0;

  const sizeRatio =
    originalSize && compressedSize
      ? Math.min(100, (compressedSize / originalSize) * 100)
      : 0;

  const totalOriginal = images.reduce(
    (sum, image) => sum + image.originalSize,
    0
  );

  const totalCompressed = images.reduce(
    (sum, image) => sum + (image.compressedSize || image.originalSize),
    0
  );

  const totalSavings = totalOriginal
    ? ((totalOriginal - totalCompressed) / totalOriginal) * 100
    : 0;

  const outputWidth = activeImage?.resizeEnabled
    ? activeImage.targetWidth
    : activeImage?.img.naturalWidth || 0;

  const outputHeight = activeImage?.resizeEnabled
    ? activeImage.targetHeight
    : activeImage?.img.naturalHeight || 0;

  return (
    <main className="darkroom-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar page-width">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Layers3 size={20} strokeWidth={2.1} />
          </div>

          <div>
            <div className="brand-name">Darkroom</div>
            <div className="brand-sub">Private image optimizer</div>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="privacy-pill">
            <ShieldCheck size={15} strokeWidth={2} />
            Local processing
          </span>


        </div>
      </header>

      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Fast. Private. Precise.
          </div>

          <h1>
            Make every image{" "}
            <span>lighter & better.</span>
          </h1>

          <p>
            Compress, resize, and polish your photos directly in your browser.
            Fast, private, and beautifully optimized — your files never leave this device.
          </p>

          <div className="hero-meta">
            <span><strong>{images.length}</strong> uploads</span>
            <span>JPEG · PNG · WebP</span>
            <span>
              Paste with <kbd>Ctrl</kbd> + <kbd>V</kbd>
            </span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => addFiles(event.target.files)}
        />
      </section>

      {images.length === 0 ? (
        <section className="empty-workspace page-width">
          <div
            className="dropzone"
            tabIndex={0}
            role="button"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add("dragover");
            }}
            onDragLeave={(event) =>
              event.currentTarget.classList.remove("dragover")
            }
            onDrop={(event) => {
              event.preventDefault();
              event.currentTarget.classList.remove("dragover");
              addFiles(event.dataTransfer.files);
            }}
          >
            <div className="drop-icon">
              <Upload size={25} strokeWidth={2} />
            </div>

            <h2>Drop your photos here</h2>
            <p>or click anywhere to browse your device</p>

            <div className="drop-badges">
              <span>Batch upload</span>
              <span>Paste from clipboard</span>
              <span>No cloud upload</span>
            </div>
          </div>

          <div className="feature-row">
            <div>
              <span className="feature-icon">
                <WandSparkles size={17} strokeWidth={2} />
              </span>
              <span>
                <strong>Smart compression</strong>
                <small>Fine control without losing the look.</small>
              </span>
            </div>

            <div>
              <span className="feature-icon">
                <Sparkles size={17} strokeWidth={2} />
              </span>
              <span>
                <strong>Quick polish</strong>
                <small>Brightness, contrast and saturation.</small>
              </span>
            </div>

            <div>
              <span className="feature-icon">
                <ShieldCheck size={17} strokeWidth={2} />
              </span>
              <span>
                <strong>100% private</strong>
                <small>Canvas processing stays local.</small>
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="workspace page-width">
          <div className="workspace-toolbar">
            <div>
              <div className="section-kicker">Your workspace</div>
              {/* <h2>
                {images.length} {images.length === 1 ? "image" : "images"} ready to optimize
              </h2> */}
            </div>

            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={16} strokeWidth={2} />
                Add more
              </button>

              <button
                type="button"
                className="btn btn-dark"
                onClick={downloadAll}
                disabled={zipBusy}
              >
                {zipBusy ? (
                  <>
                    <RotateCw className="spin-icon" size={15} strokeWidth={2} />
                    Preparing ZIP…
                  </>
                ) : (
                  <>
                    <Download size={16} strokeWidth={2} />
                    Download all
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="filmstrip-card">
            <div className="filmstrip-head">
              <span>Library</span>
              <span>
                {formatBytes(totalOriginal)} source · {totalSavings >= 0
                  ? `${totalSavings.toFixed(0)}% smaller`
                  : `${Math.abs(totalSavings).toFixed(0)}% larger`}
              </span>
            </div>

            <div className="filmstrip">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  className={`thumb ${image.id === activeId ? "active" : ""}`}
                  onClick={() => setActiveId(image.id)}
                >
                  <img
                    src={image.originalURL}
                    alt={image.name}
                    style={{
                      transform: `rotate(${image.rotation}deg) scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`,
                      filter: image.grayscale ? "grayscale(100%)" : "none",
                    }}
                  />

                  <span className="thumb-name">{image.name}</span>

                  <span
                    className="thumb-remove"
                    onClick={(event) => removeImage(image.id, event)}
                    aria-label={`Remove ${image.name}`}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </span>
                </button>
              ))}

              <button
                type="button"
                className="thumb-add"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={19} strokeWidth={2} />
                <span>Add</span>
              </button>
            </div>
          </div>

          {activeImage && (
            <>
              <div className="editor-grid">
                <section className="preview-card">
                  <div className="card-topline">
                    <div>
                      <strong>{activeImage.name}</strong>
                    </div>

                    <div className="preview-actions">
                      <span className="soft-badge">
                        {activeImage.format.toUpperCase()}
                      </span>

                      <span className="soft-badge">
                        {outputWidth} × {outputHeight}
                      </span>
                    </div>
                  </div>

                  <div
                    className="compare-wrap"
                    ref={compareWrapRef}
                    onPointerDown={handleComparePointerDown}
                    onPointerMove={handleComparePointerMove}
                    onPointerUp={handleComparePointerUp}
                    onPointerCancel={handleComparePointerUp}
                    style={{ "--pos": "50%" }}
                  >
                    <img
                      className="img-before"
                      src={activeImage.originalURL}
                      alt="Original preview"
                    />

                    <img
                      className="img-after"
                      src={activeImage.compressedURL || activeImage.originalURL}
                      alt="Optimized preview"
                      style={{
                        filter: activeImage.grayscale ? "grayscale(100%)" : undefined,
                      }}
                    />

                    <div className="compare-handle">
                      <span>↔</span>
                    </div>

                    <span className="preview-tag before">Original</span>
                    <span className="preview-tag after">Optimized</span>
                  </div>

                  <div className="preview-footer">
                    <span>
                      {activeImage.img.naturalWidth} × {activeImage.img.naturalHeight} source
                    </span>

                    <span className="preview-tip">
                      Drag the divider to compare
                    </span>

                    <button
                      type="button"
                      className="output-dimensions"
                      onClick={copyOutputDimensions}
                      title="Copy output dimensions"
                    >
                      <span>
                        {dimensionsCopied
                          ? "Copied"
                          : `${outputWidth} × ${outputHeight} output`}
                      </span>
                    </button>
                  </div>
                </section>

                <aside className="controls-card">
                  <div className="controls-header">
                    <div className="settings-icon">
                      <Settings size={18} strokeWidth={2} />
                    </div>

                    <button
                      type="button"
                      className="icon-text-btn"
                      onClick={resetImage}
                    >
                      <RotateCcw size={15} strokeWidth={2} />
                      Reset
                    </button>
                  </div>

                  <div className="auto-optimize">
                    <div className="auto-optimize-copy">
                      <span className="auto-icon">
                        <Sparkles size={16} strokeWidth={2} />
                      </span>

                      <span>
                        <strong>Auto optimize</strong>
                        <small>Smart WebP + sensible dimensions.</small>
                      </span>
                    </div>

                    <button type="button" onClick={autoOptimize}>
                      <Zap size={13} strokeWidth={2.2} />
                      Optimize
                    </button>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Format</span>
                      <span className="control-help">Choose your output</span>
                    </div>

                    <div className="segmented">
                      {["jpeg", "webp", "png"].map((format) => (
                        <button
                          key={format}
                          type="button"
                          className={activeImage.format === format ? "selected" : ""}
                          onClick={() => updateActiveImage({ format })}
                        >
                          {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-section quality-section">
                    <div className="control-title-row">
                      <span>Quality</span>
                      <strong>
                        {activeImage.format === "png"
                          ? "Lossless"
                          : `${activeImage.quality}%`}
                      </strong>
                    </div>

                    <div className="quality-meter">
                      <div className="quality-meter-top">
                        <div>
                          <span className="quality-meter-label">
                            Compression quality
                          </span>

                          <strong className="quality-meter-value">
                            {activeImage.format === "png"
                              ? "Lossless"
                              : `${activeImage.quality}%`}
                          </strong>
                        </div>

                        <span className="quality-status">
                          {activeImage.format === "png"
                            ? "No quality loss"
                            : activeImage.quality >= 95
                              ? "Near original"
                              : activeImage.quality >= 80
                                ? "High quality"
                                : activeImage.quality >= 50
                                  ? "Balanced"
                                  : "Smaller file"}
                        </span>
                      </div>

                      <div
                        className={`quality-slider-wrap ${activeImage.format === "png" ? "disabled" : ""}`}
                      >
                        <div className="quality-slider-track">
                          <div
                            className="quality-slider-fill"
                            style={{
                              width: `${activeImage.format === "png" ? 100 : activeImage.quality}%`,
                            }}
                          />

                          <div
                            className="quality-slider-glow"
                            style={{
                              left: `${activeImage.format === "png" ? 100 : activeImage.quality}%`,
                            }}
                          />
                        </div>

                        <input
                          className="quality-range"
                          type="range"
                          min="1"
                          max="100"
                          value={activeImage.quality}
                          disabled={activeImage.format === "png"}
                          onChange={(event) =>
                            updateActiveImage({
                              quality: Number(event.target.value),
                            })
                          }
                          aria-label="Image quality"
                        />
                      </div>

                      <div className="quality-scale">
                        <span>Small</span>
                        <span>Balanced</span>
                        <span>Maximum</span>
                      </div>

                      <div className="quality-hint">
                        <span className="quality-hint-dot" />
                        <span>
                          {activeImage.format === "png"
                            ? "PNG keeps the original image quality."
                            : activeImage.quality >= 95
                              ? "Best visual quality with a larger output."
                              : activeImage.quality >= 80
                                ? "Great balance between quality and file size."
                                : activeImage.quality >= 50
                                  ? "Recommended for everyday web use."
                                  : "Prioritizing a smaller file size."}
                        </span>
                      </div>
                    </div>

                    <div className="preset-grid">
                      {QUALITY_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className={
                            activeImage.quality === preset.value ? "selected" : ""
                          }
                          onClick={() =>
                            updateActiveImage({ quality: preset.value })
                          }
                          disabled={activeImage.format === "png"}
                        >
                          <strong>{preset.label}</strong>
                          <small>{preset.note}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Quick edits</span>
                      <span className="control-help">Non-destructive</span>
                    </div>

                    <div className="quick-edit-grid">
                      <button
                        type="button"
                        className={activeImage.grayscale ? "selected" : ""}
                        onClick={() =>
                          updateActiveImage({
                            grayscale: !activeImage.grayscale,
                          })
                        }
                      >
                        B&W
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateActiveImage({
                            rotation: (activeImage.rotation + 90) % 360,
                          })
                        }
                      >
                        <RotateCw size={15} strokeWidth={2} />
                        Rotate
                      </button>

                      <button
                        type="button"
                        className={activeImage.flipX ? "selected" : ""}
                        onClick={() =>
                          updateActiveImage({
                            flipX: !activeImage.flipX,
                          })
                        }
                      >
                        <FlipHorizontal2 size={15} strokeWidth={2} />
                        Flip X
                      </button>

                      <button
                        type="button"
                        className={activeImage.flipY ? "selected" : ""}
                        onClick={() =>
                          updateActiveImage({
                            flipY: !activeImage.flipY,
                          })
                        }
                      >
                        <FlipVertical2 size={15} strokeWidth={2} />
                        Flip Y
                      </button>
                    </div>
                  </div>
                </aside>
              </div>

              <section className="below-editor">
                <div className="below-editor-card tuning-card">
                  <div className="panel-heading">
                    <div>
                      <h3>Fine tuning</h3>
                    </div>
                    <span className="panel-meta">Non-destructive</span>
                  </div>

                  <div className="tuning-grid">
                    {[
                      ["Brightness", "brightness", 50, 150],
                      ["Contrast", "contrast", 50, 150],
                      ["Saturation", "saturation", 0, 180],
                    ].map(([label, key, min, max]) => {
                      const value = activeImage[key];
                      const progress = ((value - min) / (max - min)) * 100;

                      return (
                        <label key={key} className="range-field tuning-field">
                          <span>
                            <strong>{label}</strong>
                            <output>{value}%</output>
                          </span>

                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={value}
                            style={{
                              "--range-progress": `${progress}%`,
                            }}
                            onChange={(event) =>
                              updateActiveImage({
                                [key]: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="below-editor-row">
                  <section className="below-editor-card resize-card">
                    <div className="panel-heading">
                      <div>
                        <h3>Dimensions</h3>
                      </div>

                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={activeImage.resizeEnabled}
                          onChange={(event) =>
                            updateActiveImage({
                              resizeEnabled: event.target.checked,
                            })
                          }
                        />
                        <span />
                      </label>
                    </div>

                    <div className="resize-subtitle">
                      Keep proportions locked while changing the output size.
                    </div>

                    {activeImage.resizeEnabled ? (
                      <>
                        <div className="resize-grid resize-grid-large">
                          <label>
                            <span>Width</span>

                            <input
                              type="number"
                              min="10"
                              step="10"
                              value={activeImage.targetWidth}
                              onChange={handleWidthChange}
                            />
                          </label>

                          <button
                            type="button"
                            className={`lock-btn ${activeImage.lockAspect ? "locked" : ""
                              }`}
                            onClick={() =>
                              updateActiveImage({
                                lockAspect: !activeImage.lockAspect,
                              })
                            }
                            aria-label={
                              activeImage.lockAspect
                                ? "Unlock aspect ratio"
                                : "Lock aspect ratio"
                            }
                          >
                            {activeImage.lockAspect ? (
                              <Lock size={15} strokeWidth={2} />
                            ) : (
                              <Unlock size={15} strokeWidth={2} />
                            )}
                          </button>

                          <label>
                            <span>Height</span>

                            <input
                              type="number"
                              min="10"
                              step="10"
                              value={activeImage.targetHeight}
                              onChange={handleHeightChange}
                            />
                          </label>
                        </div>

                        {/* Small unique dimension info */}
                        <div className="dimension-info">
                          <div className="dimension-info-item">
                            <span>Aspect ratio</span>
                            <strong>
                              {activeImage.targetWidth && activeImage.targetHeight
                                ? (
                                  activeImage.targetWidth /
                                  activeImage.targetHeight
                                ).toFixed(2)
                                : "—"}
                            </strong>
                          </div>

                          <div className="dimension-info-item">
                            <span>Resize mode</span>
                            <strong>
                              {activeImage.lockAspect
                                ? "Locked"
                                : "Free"}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="resize-disabled-state">
                        <span>Original dimensions</span>

                        <strong>
                          {activeImage.img.naturalWidth} ×{" "}
                          {activeImage.img.naturalHeight}px
                        </strong>
                      </div>
                    )}
                  </section>

                  <section className="below-editor-card metrics-card">
                    <div className="panel-heading">
                      <div>
                        <h3>File metrics</h3>
                      </div>

                      <span
                        className={`metric-pill ${savingsPct >= 0 ? "good-bg" : "bad-bg"
                          }`}
                      >
                        {compressedSize
                          ? savingsPct >= 0
                            ? `${savingsPct.toFixed(0)}% smaller`
                            : `${Math.abs(savingsPct).toFixed(0)}% larger`
                          : "Processing"}
                      </span>
                    </div>

                    <div className="metrics-grid metrics-grid-large">
                      <div>
                        <span className="metric-label">
                          <FolderOpen size={11} />
                          Original
                        </span>
                        <strong>{formatBytes(originalSize)}</strong>
                      </div>

                      <div>
                        <span className="metric-label">
                          <Download size={11} />
                          Optimized
                        </span>
                        <strong>
                          {compressedSize ? formatBytes(compressedSize) : "—"}
                        </strong>
                      </div>

                      <div>
                        <span className="metric-label">
                          <Zap size={11} />
                          Change
                        </span>
                        <strong
                          className={savingsPct >= 0 ? "good" : "bad"}
                        >
                          {compressedSize
                            ? `${savingsPct >= 0 ? "−" : "+"}${Math.abs(
                              savingsPct
                            ).toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    <div className="size-bar size-bar-large">
                      <div style={{ width: `${sizeRatio}%` }} />
                    </div>

                    <div className="compression-summary">
                      <div className="summary-icon">
                        {compressedSize ? <Check size={14} /> : <Zap size={14} />}
                      </div>

                      <div className="summary-copy">
                        <strong>
                          {compressedSize
                            ? savingsPct >= 0
                              ? "Compression successful"
                              : "Output is larger"
                            : "Optimizing image"}
                        </strong>

                        <span>
                          {compressedSize
                            ? savingsPct >= 0
                              ? `Saved ${formatBytes(
                                Math.max(0, originalSize - compressedSize)
                              )} of storage`
                              : `Added ${formatBytes(
                                Math.max(0, compressedSize - originalSize)
                              )} to the output`
                            : "Calculating the optimized file size..."}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="below-editor-card actions-card">
                    <div className="panel-heading">
                      <div>
                        <h3>Actions</h3>
                      </div>

                      <span className="panel-meta">
                        {compressedSize ? "Ready to export" : "Processing"}
                      </span>
                    </div>

                    <div className="actions-card-content">

                      <div className="export-status">
                        <div className="export-status-icon">
                          {compressedSize ? (
                            <Check size={15} strokeWidth={2.2} />
                          ) : (
                            <Zap size={15} strokeWidth={2} />
                          )}
                        </div>

                        <div className="export-status-copy">
                          <strong>
                            {compressedSize
                              ? "Export ready"
                              : "Preparing output"}
                          </strong>

                          <span>
                            {compressedSize
                              ? images.length > 1
                                ? `${images.length} images available in your workspace`
                                : "Your optimized image is ready to save"
                              : "Finalizing your optimized image..."}
                          </span>
                        </div>


                      </div>

                      <button
                        type="button"
                        className="btn btn-dark wide"
                        onClick={() => download(activeImage)}
                        disabled={!compressedSize}
                      >
                        <Download size={17} strokeWidth={2} />
                        Download image
                      </button>

                      <button
                        type="button"
                        className="btn btn-soft wide"
                        onClick={applyAll}
                        disabled={images.length < 2}
                      >
                        <Check size={16} strokeWidth={2} />
                        Apply to all
                      </button>

                      <div className="action-note">
                        {images.length > 1
                          ? "Apply the current settings to every image in your library."
                          : "Add another image to enable batch settings."}
                      </div>

                    </div>
                  </section>
                </div>

              </section>
            </>
          )}

          <div className="batch-bar">
            <div className="batch-stat">
              <span>Batch result</span>
              <strong>
                {formatBytes(totalOriginal)} → {formatBytes(totalCompressed)}
              </strong>
              <em className={totalSavings >= 0 ? "good" : "bad"}>
                {totalSavings >= 0
                  ? `${totalSavings.toFixed(0)}% saved`
                  : `${Math.abs(totalSavings).toFixed(0)}% larger`}
              </em>
            </div>

            <div className="batch-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={copyShareLink}
              >
                <Copy size={15} strokeWidth={2} />
                {copied ? "Copied" : "Copy tool link"}
              </button>

              <button
                type="button"
                className="btn btn-danger"
                onClick={clearAll}
              >
                <Trash2 size={15} strokeWidth={2} />
                Clear workspace
              </button>
            </div>
          </div>
        </section>
      )}

      <footer className="footer page-width">
        <div className="footer-card">
          <div className="footer-main">
            <div className="footer-brand">
              <div className="brand-mark small">
                <Layers3 size={20} strokeWidth={2.1} />
              </div>

              <div>
                <strong>Darkroom</strong>
                <span>Built for fast, private image optimization.</span>
              </div>
            </div>

            <div className="footer-note">
              <ShieldCheck size={16} strokeWidth={2} />
              <span>
                <strong>Your files never leave your browser.</strong> All editing
                uses the Canvas API on your device.
              </span>
            </div>
          </div>

          <div className="footer-bottom">
            <span>JPEG · PNG · WebP · Batch ZIP</span>
            <span>Ctrl + O import · Ctrl + R reset</span>
            <span>
              Crafted with ♥ by{" "}
              <a
                href="https://github.com/TEJASS-PATELL"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tejas Patel
              </a>
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}