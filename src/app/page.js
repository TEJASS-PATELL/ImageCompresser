"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Copy,
  Crop,
  Download,
  Droplet,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Gauge,
  Layers3,
  Lock,
  Moon,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Unlock,
  Upload,
  WandSparkles,
  Zap,
} from "lucide-react";
import "./globals.css";

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

/* iOS Safari fails silently above ~16.7 MP per canvas, so we stay under */
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_OUTPUT_SIDE = 12000;

const PRESETS = [
  {
    id: "web",
    label: "Web page",
    hint: "WebP · 1920px · q80",
    format: "webp",
    quality: 80,
    maxDimension: 1920,
  },
  {
    id: "social",
    label: "Social post",
    hint: "JPEG · 1080px · q85",
    format: "jpeg",
    quality: 85,
    maxDimension: 1080,
  },
  {
    id: "email",
    label: "Email",
    hint: "JPEG · 1280px · q70",
    format: "jpeg",
    quality: 70,
    maxDimension: 1280,
  },
  {
    id: "thumb",
    label: "Thumbnail",
    hint: "WebP · 480px · q75",
    format: "webp",
    quality: 75,
    maxDimension: 480,
  },
];

const ASPECT_RATIOS = ["original", "1:1", "4:3", "16:9", "3:2", "9:16"];

/* ------------------------------------------------------------------ */
/* pure helpers                                                        */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

function pixelsToCm(pixels, dpi) {
  if (!pixels || !dpi || dpi <= 0) return 0;
  return (pixels / dpi) * 2.54;
}

function formatCm(value) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 1 : 2)} cm`;
}

function isImageFile(file) {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || "")
  );
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function getAspectCrop(width, height, ratio) {
  if (!ratio || ratio === "original" || ratio === "custom") {
    return { x: 0, y: 0, width, height };
  }

  const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);

  if (!ratioWidth || !ratioHeight) {
    return { x: 0, y: 0, width, height };
  }

  const targetRatio = ratioWidth / ratioHeight;
  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    const cropWidth = Math.round(height * targetRatio);

    return {
      x: Math.round((width - cropWidth) / 2),
      y: 0,
      width: cropWidth,
      height,
    };
  }

  const cropHeight = Math.round(width / targetRatio);

  return {
    x: 0,
    y: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
}

function normalizeCrop(obj) {
  const sourceWidth = obj.img.naturalWidth;
  const sourceHeight = obj.img.naturalHeight;
  const crop = obj.crop;

  if (crop && crop.width > 0 && crop.height > 0) {
    const x = clamp(Math.round(crop.x), 0, sourceWidth - 1);
    const y = clamp(Math.round(crop.y), 0, sourceHeight - 1);

    return {
      x,
      y,
      width: clamp(Math.round(crop.width), 1, sourceWidth - x),
      height: clamp(Math.round(crop.height), 1, sourceHeight - y),
    };
  }

  return getAspectCrop(sourceWidth, sourceHeight, obj.aspectRatio);
}

/* single source of truth for output size (used by preview + export) */
function getOutputSize(obj) {
  const crop = normalizeCrop(obj);

  let width = crop.width;
  let height = crop.height;

  if (obj.resizeEnabled && obj.targetWidth > 0 && obj.targetHeight > 0) {
    width = obj.targetWidth;
    height = obj.lockAspect
      ? Math.max(1, Math.round((width * crop.height) / crop.width))
      : obj.targetHeight;
  }

  width = clamp(Math.round(width), 1, MAX_OUTPUT_SIDE);
  height = clamp(Math.round(height), 1, MAX_OUTPUT_SIDE);

  const rotation = ((obj.rotation % 360) + 360) % 360;
  const vertical = rotation === 90 || rotation === 270;

  return {
    crop,
    width,
    height,
    rotation,
    vertical,
    outWidth: vertical ? height : width,
    outHeight: vertical ? width : height,
  };
}

/* identifies every setting that changes the rendered output */
function makeSig(obj) {
  const crop = obj.crop || {};

  return [
    obj.format,
    obj.quality,
    obj.targetSizeEnabled ? obj.targetSizeKB : 0,
    obj.resizeEnabled ? `${obj.targetWidth}x${obj.targetHeight}` : 0,
    obj.lockAspect,
    obj.grayscale,
    obj.sepia,
    obj.rotation,
    obj.flipX,
    obj.flipY,
    obj.brightness,
    obj.contrast,
    obj.saturation,
    obj.blur,
    obj.aspectRatio,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
  ].join("|");
}

/* Safari (iOS) has no ctx.filter, so we replicate the filters by hand */
function applyFallbackFilters(canvas, ctx, obj) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (obj.blur > 0) {
    const factor = 1 + obj.blur;
    const smallW = Math.max(1, Math.round(canvas.width / factor));
    const smallH = Math.max(1, Math.round(canvas.height / factor));

    const tmp = document.createElement("canvas");
    tmp.width = smallW;
    tmp.height = smallH;

    const tctx = tmp.getContext("2d");

    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(canvas, 0, 0, smallW, smallH);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
    }

    tmp.width = 0;
    tmp.height = 0;
  }

  const needsColor =
    obj.brightness !== 100 ||
    obj.contrast !== 100 ||
    obj.saturation !== 100 ||
    obj.sepia ||
    obj.grayscale;

  if (!needsColor) return;

  let imageData;

  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return;
  }

  const data = imageData.data;
  const bright = obj.brightness / 100;
  const contrast = obj.contrast / 100;
  const sat = obj.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * bright;
    let g = data[i + 1] * bright;
    let b = data[i + 2] * bright;

    r = (r - 127.5) * contrast + 127.5;
    g = (g - 127.5) * contrast + 127.5;
    b = (b - 127.5) * contrast + 127.5;

    const sr = (0.213 + 0.787 * sat) * r + (0.715 - 0.715 * sat) * g + (0.072 - 0.072 * sat) * b;
    const sg = (0.213 - 0.213 * sat) * r + (0.715 + 0.285 * sat) * g + (0.072 - 0.072 * sat) * b;
    const sb = (0.213 - 0.213 * sat) * r + (0.715 - 0.715 * sat) * g + (0.072 + 0.928 * sat) * b;

    r = sr;
    g = sg;
    b = sb;

    if (obj.sepia) {
      const nr = 0.393 * r + 0.769 * g + 0.189 * b;
      const ng = 0.349 * r + 0.686 * g + 0.168 * b;
      const nb = 0.272 * r + 0.534 * g + 0.131 * b;

      r = nr;
      g = ng;
      b = nb;
    }

    if (obj.grayscale) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      r = lum;
      g = lum;
      b = lum;
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(imageData, 0, 0);
}

function renderCanvas(obj) {
  const info = getOutputSize(obj);
  const { crop, vertical, rotation } = info;

  let width = info.width;
  let height = info.height;

  /* keep canvas inside what phones can actually allocate */
  const pixels = width * height;

  if (pixels > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  const canvas = document.createElement("canvas");

  canvas.width = vertical ? height : width;
  canvas.height = vertical ? width : height;

  const ctx = canvas.getContext("2d", { alpha: obj.format !== "jpeg" });

  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  if (obj.format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const nativeFilter = typeof ctx.filter === "string";

  if (nativeFilter) {
    const filters = [
      `brightness(${obj.brightness}%)`,
      `contrast(${obj.contrast}%)`,
      `saturate(${obj.saturation}%)`,
      obj.blur > 0 ? `blur(${obj.blur}px)` : "",
      obj.sepia ? "sepia(100%)" : "",
      obj.grayscale ? "grayscale(100%)" : "",
    ].filter(Boolean);

    ctx.filter = filters.join(" ");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);

  ctx.drawImage(
    obj.img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -width / 2,
    -height / 2,
    width,
    height
  );

  if (!nativeFilter) applyFallbackFilters(canvas, ctx, obj);

  return { canvas };
}

/* returns { blob, url, size, appliedQuality, outputFormat } or null */
async function compressImage(obj) {
  const rendered = renderCanvas(obj);

  if (!rendered) return null;

  const { canvas } = rendered;

  try {
    const mime =
      obj.format === "jpeg" ? "image/jpeg" : `image/${obj.format}`;

    let blob = null;
    let appliedQuality = obj.quality;

    if (obj.format === "png") {
      blob = await canvasToBlob(canvas, mime, undefined);
      appliedQuality = 100;
    } else if (obj.targetSizeEnabled) {
      /* binary search the highest quality that fits the size budget */
      const limit = Math.max(5, obj.targetSizeKB || 0) * 1024;

      let low = 5;
      let high = 100;
      let best = null;
      let bestQuality = 5;

      for (let step = 0; step < 8 && low <= high; step += 1) {
        const mid = Math.round((low + high) / 2);
        const candidate = await canvasToBlob(canvas, mime, mid / 100);

        if (!candidate) break;

        if (candidate.size <= limit) {
          best = candidate;
          bestQuality = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (!best) {
        best = await canvasToBlob(canvas, mime, 0.05);
        bestQuality = 5;
      }

      blob = best;
      appliedQuality = bestQuality;
    } else {
      blob = await canvasToBlob(canvas, mime, obj.quality / 100);
    }

    if (!blob) return null;

    /* some browsers silently fall back to PNG when they cannot encode WebP */
    const outputFormat =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : blob.type === "image/jpeg"
            ? "jpeg"
            : obj.format;

    return {
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      appliedQuality,
      outputFormat,
    };
  } finally {
    /* free canvas memory right away (important on iOS) */
    canvas.width = 0;
    canvas.height = 0;
  }
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export default function Darkroom() {
  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [dimensionsCopied, setDimensionsCopied] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [physicalDpi, setPhysicalDpi] = useState(96);
  const [cropDraft, setCropDraft] = useState(null);
  const [theme, setTheme] = useState("light");
  const [themeReady, setThemeReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [busyIds, setBusyIds] = useState([]);
  const [sizeDraft, setSizeDraft] = useState({ w: null, h: null });

  const fileInputRef = useRef(null);
  const compareWrapRef = useRef(null);
  const cropEditorRef = useRef(null);
  const cropDragRef = useRef(null);
  const cropPendingRef = useRef(null);
  const cropRafRef = useRef(null);
  const dragDepth = useRef(0);
  const isComparing = useRef(false);

  const imagesRef = useRef([]);
  const tokenRef = useRef({});
  const reqSigRef = useRef({});
  const urlRef = useRef({});
  const warnedFormatRef = useRef({});
  const addFilesRef = useRef(() => {});

  imagesRef.current = images;

  const activeImage = images.find((image) => image.id === activeId) || null;
  const activeSig = activeImage ? makeSig(activeImage) : "";

  /* ---------------------------------------------------------------- */
  /* toasts                                                            */
  /* ---------------------------------------------------------------- */

  const pushToast = (message, tone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setToasts((prev) => [...prev, { id, message, tone }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  };

  /* ---------------------------------------------------------------- */
  /* theme                                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let saved = null;

    try {
      saved = window.localStorage.getItem("darkroom-theme");
    } catch {
      saved = null;
    }

    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else {
      const prefersDark = window.matchMedia?.(
        "(prefers-color-scheme: dark)"
      )?.matches;

      setTheme(prefersDark ? "dark" : "light");
    }

    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;

    document.documentElement.setAttribute("data-theme", theme);

    try {
      window.localStorage.setItem("darkroom-theme", theme);
    } catch {
      /* storage blocked, theme still applies for this session */
    }
  }, [theme, themeReady]);

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  /* free every blob url when the page goes away */
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.originalURL);
      });

      Object.values(urlRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });

      if (cropRafRef.current) cancelAnimationFrame(cropRafRef.current);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* clipboard + drag and drop anywhere                                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handlePaste = (event) => {
      const files = event.clipboardData?.files;
      if (files?.length) addFilesRef.current(files);
    };

    const hasFiles = (event) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const handleDragEnter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };

    const handleDragOver = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };

    const handleDragLeave = (event) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };

    const handleDrop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFilesRef.current(event.dataTransfer.files);
    };

    window.addEventListener("paste", handlePaste);
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* crop draft sync                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!activeImage) {
      setCropDraft(null);
      return;
    }

    setCropDraft(
      activeImage.crop || {
        x: 0,
        y: 0,
        width: activeImage.img.naturalWidth,
        height: activeImage.img.naturalHeight,
      }
    );
  }, [
    activeId,
    activeImage?.aspectRatio,
    activeImage?.crop?.x,
    activeImage?.crop?.y,
    activeImage?.crop?.width,
    activeImage?.crop?.height,
  ]);

  /* typed width/height drafts belong to one image only */
  useEffect(() => {
    setSizeDraft({ w: null, h: null });
  }, [activeId]);

  /* ---------------------------------------------------------------- */
  /* rendering + compression                                           */
  /* ---------------------------------------------------------------- */

  /* merges a finished render into the *latest* image state, so slider
     moves made while rendering are never overwritten */
  const commitResult = (id, sig, result, extra = {}) => {
    const oldUrl = urlRef.current[id];
    urlRef.current[id] = result.url;

    setImages((prev) =>
      prev.map((image) =>
        image.id === id
          ? {
              ...image,
              ...extra,
              appliedQuality: result.appliedQuality,
              outputFormat: result.outputFormat,
              compressedBlob: result.blob,
              compressedURL: result.url,
              compressedSize: result.size,
              renderedSig: sig,
            }
          : image
      )
    );

    /* small delay so the <img> never points at a revoked url */
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1500);
  };

  const forceRecompress = async (obj) => {
    if (!obj) return;

    const id = obj.id;
    const token = (tokenRef.current[id] || 0) + 1;
    const sig = makeSig(obj);

    tokenRef.current[id] = token;
    reqSigRef.current[id] = sig;

    setBusyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

    try {
      const result = await compressImage(obj);

      /* a newer render started, or the image was removed */
      if (tokenRef.current[id] !== token) {
        if (result) URL.revokeObjectURL(result.url);
        return;
      }

      if (!result) {
        pushToast("This image is too large to process on this device", "bad");
        return;
      }

      if (
        result.outputFormat !== obj.format &&
        !warnedFormatRef.current[obj.format]
      ) {
        warnedFormatRef.current[obj.format] = true;
        pushToast(
          `${obj.format.toUpperCase()} is not supported here, saved as ${result.outputFormat.toUpperCase()}`,
          "bad"
        );
      }

      commitResult(id, sig, result);
    } catch {
      if (tokenRef.current[id] === token) {
        pushToast("Something went wrong while optimizing", "bad");
      }
    } finally {
      if (tokenRef.current[id] === token) {
        setBusyIds((prev) => prev.filter((value) => value !== id));
      }
    }
  };

  /* re-render the active image whenever one of its settings changes */
  useEffect(() => {
    if (!activeImage) return;

    if (
      activeImage.renderedSig === activeSig ||
      reqSigRef.current[activeImage.id] === activeSig
    ) {
      return;
    }

    const timer = setTimeout(
      () => forceRecompress(activeImage),
      activeImage.renderedSig ? 150 : 0
    );

    return () => clearTimeout(timer);
  }, [activeId, activeSig]);

  /* ---------------------------------------------------------------- */
  /* file intake                                                       */
  /* ---------------------------------------------------------------- */

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(isImageFile);

    if (!files.length) return;

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
          name: file.name || `image-${index + 1}`,
          originalURL: url,
          originalSize: file.size,
          img,

          format: defaultFormat,
          outputFormat: defaultFormat,
          defaultFormat,

          quality: 75,
          appliedQuality: 75,

          targetSizeEnabled: false,
          targetSizeKB: Math.max(5, Math.round(file.size / 1024 / 2)),

          resizeEnabled: false,
          targetWidth: img.naturalWidth,
          targetHeight: img.naturalHeight,
          lockAspect: true,

          grayscale: false,
          sepia: false,
          rotation: 0,
          flipX: false,
          flipY: false,

          brightness: 100,
          contrast: 100,
          saturation: 100,
          blur: 0,

          aspectRatio: "original",

          crop: {
            x: 0,
            y: 0,
            width: img.naturalWidth,
            height: img.naturalHeight,
          },

          compressedBlob: null,
          compressedURL: null,
          compressedSize: 0,
          renderedSig: null,
        };

        setImages((prev) => [...prev, image]);
        setActiveId((prev) => prev ?? id);

        forceRecompress(image);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        pushToast(`${file.name || "Image"} could not be read`, "bad");
      };

      img.src = url;
    });

    pushToast(
      files.length === 1 ? "1 image added" : `${files.length} images added`,
      "good"
    );
  };

  addFilesRef.current = addFiles;

  /* ---------------------------------------------------------------- */
  /* state helpers                                                     */
  /* ---------------------------------------------------------------- */

  const updateActiveImage = (updates) => {
    setImages((prev) =>
      prev.map((image) =>
        image.id === activeId ? { ...image, ...updates } : image
      )
    );
  };

  /* keeps the typed width and the crop shape consistent */
  const sizeForCrop = (image, crop) => {
    const width = image.resizeEnabled ? image.targetWidth : crop.width;

    return {
      targetWidth: width,
      targetHeight: Math.max(1, Math.round((width * crop.height) / crop.width)),
    };
  };

  const applyAspectRatio = (ratio) => {
    if (!activeImage) return;

    const crop = getAspectCrop(
      activeImage.img.naturalWidth,
      activeImage.img.naturalHeight,
      ratio
    );

    updateActiveImage({
      aspectRatio: ratio,
      crop,
      ...sizeForCrop(activeImage, crop),
    });
  };

  const resetImage = () => {
    if (!activeImage) return;

    updateActiveImage({
      format: activeImage.defaultFormat,
      quality: 75,
      targetSizeEnabled: false,
      resizeEnabled: false,
      targetWidth: activeImage.img.naturalWidth,
      targetHeight: activeImage.img.naturalHeight,
      lockAspect: true,
      grayscale: false,
      sepia: false,
      rotation: 0,
      flipX: false,
      flipY: false,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      aspectRatio: "original",
      crop: {
        x: 0,
        y: 0,
        width: activeImage.img.naturalWidth,
        height: activeImage.img.naturalHeight,
      },
    });

    pushToast("Settings reset");
  };

  const autoOptimize = () => {
    if (!activeImage) return;

    const maxDimension = 2400;
    const crop = normalizeCrop(activeImage);
    const largest = Math.max(crop.width, crop.height);
    const shouldResize = largest > maxDimension;
    const ratio = shouldResize ? maxDimension / largest : 1;

    updateActiveImage({
      format: "webp",
      quality: 82,
      targetSizeEnabled: false,
      resizeEnabled: shouldResize,
      targetWidth: Math.max(10, Math.round(crop.width * ratio)),
      targetHeight: Math.max(10, Math.round(crop.height * ratio)),
    });

    pushToast("Auto settings applied", "good");
  };

  const applyPreset = (preset) => {
    if (!activeImage) return;

    const crop = normalizeCrop(activeImage);
    const largest = Math.max(crop.width, crop.height);
    const shouldResize = largest > preset.maxDimension;
    const ratio = shouldResize ? preset.maxDimension / largest : 1;

    updateActiveImage({
      format: preset.format,
      quality: preset.quality,
      targetSizeEnabled: false,
      resizeEnabled: shouldResize,
      targetWidth: Math.max(10, Math.round(crop.width * ratio)),
      targetHeight: Math.max(10, Math.round(crop.height * ratio)),
    });

    pushToast(`${preset.label} preset applied`, "good");
  };

  const removeImage = (id, event) => {
    event.stopPropagation();

    const target = images.find((image) => image.id === id);
    if (!target) return;

    /* invalidate any render still running for this image */
    delete tokenRef.current[id];
    delete reqSigRef.current[id];

    URL.revokeObjectURL(target.originalURL);

    if (urlRef.current[id]) {
      URL.revokeObjectURL(urlRef.current[id]);
      delete urlRef.current[id];
    }

    const next = images.filter((image) => image.id !== id);

    setImages(next);
    setBusyIds((prev) => prev.filter((value) => value !== id));

    if (activeId === id) setActiveId(next.length ? next[0].id : null);
  };

  const clearAll = () => {
    images.forEach((image) => URL.revokeObjectURL(image.originalURL));

    Object.values(urlRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });

    tokenRef.current = {};
    reqSigRef.current = {};
    urlRef.current = {};

    setImages([]);
    setActiveId(null);
    setBusyIds([]);

    if (fileInputRef.current) fileInputRef.current.value = "";

    pushToast("Workspace cleared");
  };

  const download = (obj) => {
    if (!obj?.compressedBlob) return;

    const anchor = document.createElement("a");

    anchor.href = obj.compressedURL;
    anchor.download = `${stripExt(obj.name)}-compressed.${extFor(
      obj.outputFormat || obj.format
    )}`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    pushToast("Image saved", "good");
  };

  const applyAll = async () => {
    if (!activeImage || images.length < 2) return;

    const source = activeImage;
    const targets = imagesRef.current.filter((image) => image.id !== source.id);

    setBusyIds((prev) => [
      ...new Set([...prev, ...targets.map((image) => image.id)]),
    ]);

    for (const target of targets) {
      const sourceWidth = target.img.naturalWidth;
      const sourceHeight = target.img.naturalHeight;

      const nextCrop =
        source.aspectRatio === "custom"
          ? {
              x: Math.round((source.crop.x / source.img.naturalWidth) * sourceWidth),
              y: Math.round((source.crop.y / source.img.naturalHeight) * sourceHeight),
              width: Math.max(
                1,
                Math.round((source.crop.width / source.img.naturalWidth) * sourceWidth)
              ),
              height: Math.max(
                1,
                Math.round((source.crop.height / source.img.naturalHeight) * sourceHeight)
              ),
            }
          : getAspectCrop(sourceWidth, sourceHeight, source.aspectRatio);

      const settings = {
        format: source.format,
        quality: source.quality,
        targetSizeEnabled: source.targetSizeEnabled,
        targetSizeKB: source.targetSizeKB,
        resizeEnabled: source.resizeEnabled,
        targetWidth: source.targetWidth,
        targetHeight: source.targetHeight,
        lockAspect: source.lockAspect,
        grayscale: source.grayscale,
        sepia: source.sepia,
        rotation: source.rotation,
        flipX: source.flipX,
        flipY: source.flipY,
        brightness: source.brightness,
        contrast: source.contrast,
        saturation: source.saturation,
        blur: source.blur,
        aspectRatio: source.aspectRatio,
        crop: nextCrop,
      };

      const merged = { ...target, ...settings };
      const sig = makeSig(merged);
      const id = target.id;
      const token = (tokenRef.current[id] || 0) + 1;

      tokenRef.current[id] = token;
      reqSigRef.current[id] = sig;

      try {
        const result = await compressImage(merged);

        if (tokenRef.current[id] !== token) {
          if (result) URL.revokeObjectURL(result.url);
          continue;
        }

        if (result) commitResult(id, sig, result, settings);
      } catch {
        /* skip this image, keep going with the rest */
      } finally {
        if (tokenRef.current[id] === token) {
          setBusyIds((prev) => prev.filter((value) => value !== id));
        }
      }
    }

    pushToast(`Settings applied to ${images.length} images`, "good");
  };

  const downloadAll = async () => {
    if (!images.length || zipBusy) return;

    setZipBusy(true);

    try {
      const zip = new JSZip();
      const used = new Set();

      images.forEach((image) => {
        if (!image.compressedBlob) return;

        const ext = extFor(image.outputFormat || image.format);
        const base = `${stripExt(image.name)}-compressed`;

        let name = `${base}.${ext}`;
        let count = 1;

        while (used.has(name)) {
          count += 1;
          name = `${base}-${count}.${ext}`;
        }

        used.add(name);
        zip.file(name, image.compressedBlob);
      });

      /* images are already compressed, so storing is faster on phones */
      const content = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });

      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = "darkroom-compressed.zip";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      /* mobile browsers need a moment before the url can be freed */
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      pushToast("ZIP downloaded", "good");
    } catch {
      pushToast("Could not create the ZIP file", "bad");
    } finally {
      setZipBusy(false);
    }
  };

  const copyShareLink = async () => {
    const ok = await copyText(pageUrl || window.location.href);

    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopied(false);
      pushToast("Clipboard is blocked in this browser", "bad");
    }
  };

  /* ---------------------------------------------------------------- */
  /* keyboard                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handleKey = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      if (key === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }

      if (!activeImage) return;

      if (key === "r") {
        event.preventDefault();
        resetImage();
      }

      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) downloadAll();
        else download(activeImage);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [activeImage, images, zipBusy]);

  /* ---------------------------------------------------------------- */
  /* resize inputs                                                     */
  /* ---------------------------------------------------------------- */

  /* inputs keep what the person types, and only commit valid sizes */
  const handleWidthChange = (event) => {
    if (!activeImage) return;

    const raw = event.target.value;
    setSizeDraft({ w: raw, h: null });

    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 10) return;

    const width = Math.min(MAX_OUTPUT_SIDE, parsed);

    if (activeImage.lockAspect) {
      const crop = normalizeCrop(activeImage);

      updateActiveImage({
        targetWidth: width,
        targetHeight: Math.max(1, Math.round((width * crop.height) / crop.width)),
      });
    } else {
      updateActiveImage({ targetWidth: width });
    }
  };

  const handleHeightChange = (event) => {
    if (!activeImage) return;

    const raw = event.target.value;
    setSizeDraft({ w: null, h: raw });

    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 10) return;

    const height = Math.min(MAX_OUTPUT_SIDE, parsed);

    if (activeImage.lockAspect) {
      const crop = normalizeCrop(activeImage);

      updateActiveImage({
        targetHeight: height,
        targetWidth: Math.max(1, Math.round((height * crop.width) / crop.height)),
      });
    } else {
      updateActiveImage({ targetHeight: height });
    }
  };

  const toggleLockAspect = () => {
    if (!activeImage) return;

    if (!activeImage.lockAspect) {
      const crop = normalizeCrop(activeImage);

      updateActiveImage({
        lockAspect: true,
        targetHeight: Math.max(
          1,
          Math.round((activeImage.targetWidth * crop.height) / crop.width)
        ),
      });
    } else {
      updateActiveImage({ lockAspect: false });
    }
  };

  /* ---------------------------------------------------------------- */
  /* crop interaction                                                  */
  /* ---------------------------------------------------------------- */

  const getCropRatioValue = () => {
    if (!activeImage) return null;

    const ratio = activeImage.aspectRatio;

    if (!ratio || ratio === "original" || ratio === "custom") return null;

    const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);

    if (!ratioWidth || !ratioHeight) return null;

    return ratioWidth / ratioHeight;
  };

  const getCropSourcePoint = (event) => {
    if (!cropEditorRef.current || !activeImage) return null;

    const rect = cropEditorRef.current.getBoundingClientRect();

    if (!rect.width || !rect.height) return null;

    return {
      x: clamp(
        ((event.clientX - rect.left) / rect.width) * activeImage.img.naturalWidth,
        0,
        activeImage.img.naturalWidth
      ),
      y: clamp(
        ((event.clientY - rect.top) / rect.height) * activeImage.img.naturalHeight,
        0,
        activeImage.img.naturalHeight
      ),
    };
  };

  /* one state update per frame keeps touch dragging smooth */
  const queueCropDraft = (next) => {
    cropPendingRef.current = next;

    if (cropRafRef.current) return;

    cropRafRef.current = requestAnimationFrame(() => {
      cropRafRef.current = null;

      if (cropPendingRef.current) {
        setCropDraft(cropPendingRef.current);
      }
    });
  };

  const beginCropDrag = (event) => {
    if (!activeImage) return;

    const point = getCropSourcePoint(event);
    if (!point) return;

    const currentCrop = cropDraft || {
      x: 0,
      y: 0,
      width: activeImage.img.naturalWidth,
      height: activeImage.img.naturalHeight,
    };

    const isFullCrop =
      currentCrop.width >= activeImage.img.naturalWidth - 1 &&
      currentCrop.height >= activeImage.img.naturalHeight - 1;

    const inside =
      !isFullCrop &&
      point.x >= currentCrop.x &&
      point.x <= currentCrop.x + currentCrop.width &&
      point.y >= currentCrop.y &&
      point.y <= currentCrop.y + currentCrop.height;

    cropDragRef.current = {
      mode: inside ? "move" : "draw",
      startX: point.x,
      startY: point.y,
      startCrop: currentCrop,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture not available */
    }

    if (!inside) {
      cropPendingRef.current = null;
      setCropDraft({ x: point.x, y: point.y, width: 1, height: 1 });
    }
  };

  const updateCropDrag = (event) => {
    const drag = cropDragRef.current;
    if (!drag || !activeImage) return;

    const point = getCropSourcePoint(event);
    if (!point) return;

    const sourceWidth = activeImage.img.naturalWidth;
    const sourceHeight = activeImage.img.naturalHeight;

    if (drag.mode === "move") {
      const maxX = sourceWidth - drag.startCrop.width;
      const maxY = sourceHeight - drag.startCrop.height;

      queueCropDraft({
        ...drag.startCrop,
        x: clamp(drag.startCrop.x + (point.x - drag.startX), 0, maxX),
        y: clamp(drag.startCrop.y + (point.y - drag.startY), 0, maxY),
      });

      return;
    }

    const left = Math.min(drag.startX, point.x);
    const top = Math.min(drag.startY, point.y);
    const rawWidth = Math.abs(point.x - drag.startX);
    const rawHeight = Math.abs(point.y - drag.startY);
    const ratio = getCropRatioValue();

    if (rawWidth < 4 || rawHeight < 4) return;

    let width = rawWidth;
    let height = rawHeight;

    if (ratio) {
      if (width / Math.max(height, 1) > ratio) height = width / ratio;
      else width = height * ratio;
    }

    width = Math.max(10, Math.min(width, sourceWidth));
    height = Math.max(10, Math.min(height, sourceHeight));

    if (ratio) {
      height = Math.max(10, Math.min(sourceHeight, width / ratio));
      width = Math.max(10, Math.min(sourceWidth, height * ratio));
    }

    let x = left;
    let y = top;

    if (x + width > sourceWidth) x = Math.max(0, sourceWidth - width);
    if (y + height > sourceHeight) y = Math.max(0, sourceHeight - height);

    queueCropDraft({ x, y, width, height });
  };

  const finishCropDrag = (event) => {
    cropDragRef.current = null;

    if (cropRafRef.current) {
      cancelAnimationFrame(cropRafRef.current);
      cropRafRef.current = null;
    }

    if (cropPendingRef.current) {
      setCropDraft(cropPendingRef.current);
      cropPendingRef.current = null;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* nothing captured */
    }
  };

  const resetCropOnly = () => {
    if (!activeImage) return;

    const fullCrop = {
      x: 0,
      y: 0,
      width: activeImage.img.naturalWidth,
      height: activeImage.img.naturalHeight,
    };

    setCropDraft(fullCrop);

    updateActiveImage({
      crop: fullCrop,
      aspectRatio: "original",
      ...sizeForCrop(activeImage, fullCrop),
    });
  };

  const applyCustomCrop = () => {
    if (!activeImage || !cropDraft) return;

    const nextCrop = {
      x: Math.max(0, Math.round(cropDraft.x)),
      y: Math.max(0, Math.round(cropDraft.y)),
      width: Math.max(1, Math.round(cropDraft.width)),
      height: Math.max(1, Math.round(cropDraft.height)),
    };

    setCropDraft(nextCrop);

    /* the render effect picks this change up on its own */
    updateActiveImage({
      crop: nextCrop,
      aspectRatio: "custom",
      ...sizeForCrop(activeImage, nextCrop),
    });

    pushToast("Crop applied", "good");
  };

  /* ---------------------------------------------------------------- */
  /* compare slider                                                    */
  /* ---------------------------------------------------------------- */

  const setComparePos = (clientX) => {
    if (!compareWrapRef.current) return;

    const frame = compareWrapRef.current.querySelector(
      ".compare-ratio-frame"
    );

    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    if (!rect.width) return;

    const percentage = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);

    frame.style.setProperty("--pos", `${percentage}%`);
  };

  const handleComparePointerDown = (event) => {
    isComparing.current = true;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture not available */
    }

    setComparePos(event.clientX);
  };

  const handleComparePointerMove = (event) => {
    if (isComparing.current) setComparePos(event.clientX);
  };

  const handleComparePointerUp = (event) => {
    isComparing.current = false;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* nothing captured */
    }
  };

  /* ---------------------------------------------------------------- */
  /* derived values                                                    */
  /* ---------------------------------------------------------------- */

  const originalSize = activeImage?.originalSize || 0;
  const compressedSize = activeImage?.compressedSize || 0;
  const isBusy = activeImage ? busyIds.includes(activeImage.id) : false;

  const savingsPct =
    originalSize && compressedSize
      ? ((originalSize - compressedSize) / originalSize) * 100
      : 0;

  const sizeRatio =
    originalSize && compressedSize
      ? Math.min(100, (compressedSize / originalSize) * 100)
      : 0;

  const totalOriginal = useMemo(
    () => images.reduce((sum, image) => sum + image.originalSize, 0),
    [images]
  );

  const totalCompressed = useMemo(
    () =>
      images.reduce(
        (sum, image) => sum + (image.compressedSize || image.originalSize),
        0
      ),
    [images]
  );

  const totalSavings = totalOriginal
    ? ((totalOriginal - totalCompressed) / totalOriginal) * 100
    : 0;

  const outInfo = activeImage ? getOutputSize(activeImage) : null;
  const outputWidth = outInfo?.outWidth || 0;
  const outputHeight = outInfo?.outHeight || 0;

  const safeDpi = Math.max(1, Number(physicalDpi) || 96);
  const outputWidthCm = pixelsToCm(outputWidth, safeDpi);
  const outputHeightCm = pixelsToCm(outputHeight, safeDpi);

  const megapixels =
    outputWidth && outputHeight ? (outputWidth * outputHeight) / 1_000_000 : 0;

  const copyOutputDimensions = async () => {
    if (!activeImage) return;

    const ok = await copyText(`${outputWidth} × ${outputHeight}`);

    if (ok) {
      setDimensionsCopied(true);
      setTimeout(() => setDimensionsCopied(false), 1500);
    } else {
      setDimensionsCopied(false);
      pushToast("Clipboard is blocked in this browser", "bad");
    }
  };

  const qualityLabel =
    activeImage?.format === "png"
      ? "Lossless"
      : activeImage?.targetSizeEnabled
        ? `q${activeImage.appliedQuality}`
        : `${activeImage?.quality}%`;

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <main className="darkroom-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

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

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            <span className="theme-toggle-knob">
              {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
            </span>
          </button>
        </div>
      </header>

      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Fast, private, precise
          </div>

          <h1>
            Make every image lighter <span>and better.</span>
          </h1>

          <p>
            Compress, resize and polish your photos right inside the
            browser. Nothing uploads, nothing is stored, and metadata is
            dropped on the way out.
          </p>

          <div className="hero-meta">
            <span>
              <strong>{images.length}</strong> in workspace
            </span>

            <span>JPEG, PNG and WebP</span>

            <span>
              Paste with <kbd>Ctrl</kbd> <kbd>V</kbd>
            </span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            /* lets the same file be picked again later */
            event.target.value = "";
          }}
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
          >
            <div className="drop-icon">
              <Upload size={25} strokeWidth={2} />
            </div>

            <h2>Drop your photos here</h2>
            <p>or click anywhere in this panel to browse your device</p>

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
                <strong>Size targeting</strong>
                <small>Name a file size, get the best quality under it.</small>
              </span>
            </div>

            <div>
              <span className="feature-icon">
                <Sparkles size={17} strokeWidth={2} />
              </span>

              <span>
                <strong>Quick polish</strong>
                <small>Crop, rotate, tone and colour in one pass.</small>
              </span>
            </div>

            <div>
              <span className="feature-icon">
                <ShieldCheck size={17} strokeWidth={2} />
              </span>

              <span>
                <strong>Stays on device</strong>
                <small>Canvas does the work, your files never travel.</small>
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="workspace page-width">
          <div className="workspace-toolbar">
            <div className="section-kicker">Your workspace</div>

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
                    <RotateCw
                      className="spin-icon"
                      size={15}
                      strokeWidth={2}
                    />
                    Packing ZIP
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
                {formatBytes(totalOriginal)} source ·{" "}
                {totalSavings >= 0
                  ? `${totalSavings.toFixed(0)}% smaller`
                  : `${Math.abs(totalSavings).toFixed(0)}% larger`}
              </span>
            </div>

            <div className="filmstrip">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={`thumb ${
                    image.id === activeId ? "active" : ""
                  } ${busyIds.includes(image.id) ? "working" : ""}`}
                  onClick={() => setActiveId(image.id)}
                >
                  <img
                    src={image.originalURL}
                    alt={image.name}
                    className="thumb-img"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{
                      "--thumb-rotate": `${image.rotation}deg`,
                      "--thumb-scale-x": image.flipX ? -1 : 1,
                      "--thumb-scale-y": image.flipY ? -1 : 1,
                      "--thumb-filter": image.grayscale
                        ? "grayscale(100%)"
                        : image.sepia
                          ? "sepia(100%)"
                          : "none",
                    }}
                  />

                  <span className="thumb-name">{image.name}</span>

                  <span
                    className="thumb-remove"
                    role="button"
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
                aria-label="Add more images"
              >
                <Plus size={19} strokeWidth={2} />
              </button>
            </div>
          </div>

          {activeImage && (
            <>
              <div className="editor-grid">
                <section className="preview-card">
                  <div className="card-topline">
                    <strong className="file-title">{activeImage.name}</strong>

                    <div className="preview-actions">
                      <span className="soft-badge">
                        {(activeImage.outputFormat || activeImage.format).toUpperCase()}
                      </span>

                      <span className="soft-badge">
                        {outputWidth} × {outputHeight}
                      </span>

                      <span
                        className={`soft-badge live-badge ${
                          isBusy ? "pulsing" : ""
                        }`}
                      >
                        {isBusy ? "Rendering" : "Live"}
                      </span>
                    </div>
                  </div>

                  <div
                    className="compare-wrap"
                    ref={compareWrapRef}
                    style={{
                      touchAction: "pan-y",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                    }}
                    onPointerDown={handleComparePointerDown}
                    onPointerMove={handleComparePointerMove}
                    onPointerUp={handleComparePointerUp}
                    onPointerCancel={handleComparePointerUp}
                  >
                    <div
                      className="compare-ratio-frame"
                      style={{
                        "--frame-ratio":
                          outputWidth && outputHeight
                            ? `${outputWidth} / ${outputHeight}`
                            : "1 / 1",
                        "--pos": "50%",
                      }}
                    >
                      <img
                        className="img-before"
                        src={activeImage.originalURL}
                        alt="Original"
                        draggable={false}
                        decoding="async"
                      />

                      <img
                        className="img-after"
                        src={
                          activeImage.compressedURL ||
                          activeImage.originalURL
                        }
                        alt="Optimized"
                        draggable={false}
                        decoding="async"
                      />

                      <div className="compare-handle">
                        <div className="moving-icon" />
                      </div>
                    </div>

                    <span className="preview-tag before">Original</span>
                    <span className="preview-tag after">Optimized</span>
                  </div>

                  <div className="preview-footer">
                    <span>
                      {activeImage.img.naturalWidth} ×{" "}
                      {activeImage.img.naturalHeight} source
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
                      <Copy size={12} strokeWidth={2} />
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
                        <small>WebP with sensible dimensions.</small>
                      </span>
                    </div>

                    <button type="button" onClick={autoOptimize}>
                      <Zap size={13} strokeWidth={2.2} />
                      Optimize
                    </button>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Presets</span>
                      <span className="control-help">One tap setup</span>
                    </div>

                    <div className="preset-grid">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="preset-chip"
                          onClick={() => applyPreset(preset)}
                        >
                          <strong>{preset.label}</strong>
                          <small>{preset.hint}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Format</span>
                      <span className="control-help">Output type</span>
                    </div>

                    <div className="segmented">
                      {["jpeg", "webp", "png"].map((format) => (
                        <button
                          key={format}
                          type="button"
                          className={
                            activeImage.format === format ? "selected" : ""
                          }
                          onClick={() => updateActiveImage({ format })}
                        >
                          {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-section quality-section">
                    <div className="quality-meter">
                      <div className="quality-meter-top">
                        <div>
                          <span className="quality-meter-label">
                            Compression quality
                          </span>

                          <strong className="quality-meter-value">
                            {qualityLabel}
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
                        className={`quality-slider-wrap ${
                          activeImage.format === "png" ||
                          activeImage.targetSizeEnabled
                            ? "disabled"
                            : ""
                        }`}
                        style={{
                          "--q": `${
                            activeImage.format === "png"
                              ? 100
                              : activeImage.targetSizeEnabled
                                ? activeImage.appliedQuality
                                : activeImage.quality
                          }%`,
                        }}
                      >
                        <div className="quality-slider-track">
                          <div className="quality-slider-fill" />
                          <div className="quality-slider-glow" />
                        </div>

                        <input
                          className="quality-range"
                          type="range"
                          min="1"
                          max="100"
                          value={activeImage.quality}
                          disabled={
                            activeImage.format === "png" ||
                            activeImage.targetSizeEnabled
                          }
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
                            : activeImage.targetSizeEnabled
                              ? `Quality is chosen automatically to fit ${activeImage.targetSizeKB} KB.`
                              : activeImage.quality >= 95
                                ? "Best visual quality with a larger output."
                                : activeImage.quality >= 80
                                  ? "Great balance between quality and file size."
                                  : activeImage.quality >= 50
                                    ? "Recommended for everyday web use."
                                    : "Prioritising a smaller file size."}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Target file size</span>

                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={activeImage.targetSizeEnabled}
                          disabled={activeImage.format === "png"}
                          onChange={(event) =>
                            updateActiveImage({
                              targetSizeEnabled: event.target.checked,
                            })
                          }
                        />
                        <span />
                      </label>
                    </div>

                    <div
                      className={`target-size ${
                        activeImage.targetSizeEnabled ? "on" : ""
                      }`}
                    >
                      <span className="target-icon">
                        <Target size={15} strokeWidth={2} />
                      </span>

                      <input
                        type="number"
                        inputMode="numeric"
                        min="5"
                        max="20000"
                        step="5"
                        value={activeImage.targetSizeKB || ""}
                        disabled={!activeImage.targetSizeEnabled}
                        onChange={(event) =>
                          updateActiveImage({
                            targetSizeKB: Math.min(
                              20000,
                              Math.max(0, Number(event.target.value) || 0)
                            ),
                          })
                        }
                        onBlur={() =>
                          updateActiveImage({
                            targetSizeKB: Math.max(
                              5,
                              activeImage.targetSizeKB || 100
                            ),
                          })
                        }
                        aria-label="Target file size in kilobytes"
                      />

                      <span className="target-unit">KB</span>

                      <span className="target-result">
                        {activeImage.targetSizeEnabled && compressedSize
                          ? `now ${formatBytes(compressedSize)}`
                          : "off"}
                      </span>
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
                            sepia: false,
                          })
                        }
                      >
                        <Droplet size={14} strokeWidth={2} />
                        B&amp;W
                      </button>

                      <button
                        type="button"
                        className={activeImage.sepia ? "selected" : ""}
                        onClick={() =>
                          updateActiveImage({
                            sepia: !activeImage.sepia,
                            grayscale: false,
                          })
                        }
                      >
                        <Sparkles size={14} strokeWidth={2} />
                        Warm
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
                          updateActiveImage({ flipX: !activeImage.flipX })
                        }
                      >
                        <FlipHorizontal2 size={15} strokeWidth={2} />
                        Flip X
                      </button>

                      <button
                        type="button"
                        className={activeImage.flipY ? "selected" : ""}
                        onClick={() =>
                          updateActiveImage({ flipY: !activeImage.flipY })
                        }
                      >
                        <FlipVertical2 size={15} strokeWidth={2} />
                        Flip Y
                      </button>
                    </div>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Aspect ratio</span>
                      <span className="control-help">Frame the shot</span>
                    </div>

                    <div className="aspect-ratio-grid">
                      {ASPECT_RATIOS.map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          className={
                            activeImage.aspectRatio === ratio
                              ? "selected"
                              : ""
                          }
                          onClick={() => applyAspectRatio(ratio)}
                        >
                          {ratio === "original" ? "Original" : ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-section">
                    <div className="control-title-row">
                      <span>Crop photo</span>
                      <span className="control-help">Drag to select</span>
                    </div>

                    <div
                      ref={cropEditorRef}
                      className="crop-stage"
                      style={{
                        "--stage-ratio": `${activeImage.img.naturalWidth} / ${activeImage.img.naturalHeight}`,
                        touchAction: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                      }}
                      onPointerDown={beginCropDrag}
                      onPointerMove={updateCropDrag}
                      onPointerUp={finishCropDrag}
                      onPointerCancel={finishCropDrag}
                      title="Drag inside the box to move it, drag outside to draw a new crop"
                    >
                      <img
                        src={activeImage.originalURL}
                        alt="Crop editor"
                        draggable={false}
                        decoding="async"
                        className="crop-stage-img"
                      />

                      {cropDraft && (
                        <div
                          className="crop-box"
                          style={{
                            "--cx": `${
                              (cropDraft.x /
                                activeImage.img.naturalWidth) *
                              100
                            }%`,
                            "--cy": `${
                              (cropDraft.y /
                                activeImage.img.naturalHeight) *
                              100
                            }%`,
                            "--cw": `${
                              (cropDraft.width /
                                activeImage.img.naturalWidth) *
                              100
                            }%`,
                            "--ch": `${
                              (cropDraft.height /
                                activeImage.img.naturalHeight) *
                              100
                            }%`,
                          }}
                        >
                          <span className="crop-size-tag">
                            {Math.round(cropDraft.width)} ×{" "}
                            {Math.round(cropDraft.height)} px
                          </span>

                          <span className="crop-corner tl" />
                          <span className="crop-corner tr" />
                          <span className="crop-corner bl" />
                          <span className="crop-corner br" />
                        </div>
                      )}
                    </div>

                    <div className="crop-meta">
                      <span>
                        {activeImage.aspectRatio === "custom"
                          ? "Free crop"
                          : activeImage.aspectRatio === "original"
                            ? "Original frame"
                            : `${activeImage.aspectRatio} locked`}
                      </span>

                      <span>Drag inside to move</span>
                    </div>

                    <div className="crop-actions">
                      <button type="button" onClick={resetCropOnly}>
                        Reset crop
                      </button>

                      <button
                        type="button"
                        className="selected"
                        onClick={applyCustomCrop}
                      >
                        <Crop size={14} strokeWidth={2} />
                        Apply crop
                      </button>
                    </div>
                  </div>
                </aside>
              </div>

              <section className="below-editor">
                <div className="below-editor-card tuning-card">
                  <div className="panel-heading">
                    <h3>Fine tuning</h3>
                    <span className="panel-meta">Non-destructive</span>
                  </div>

                  <div className="tuning-grid">
                    {[
                      ["Brightness", "brightness", 50, 150, "%"],
                      ["Contrast", "contrast", 50, 150, "%"],
                      ["Saturation", "saturation", 0, 180, "%"],
                      ["Soften", "blur", 0, 12, "px"],
                    ].map(([label, key, min, max, unit]) => {
                      const value = activeImage[key];
                      const progress = ((value - min) / (max - min)) * 100;

                      return (
                        <label key={key} className="range-field tuning-field">
                          <span>
                            <strong>{label}</strong>
                            <output>
                              {value}
                              {unit}
                            </output>
                          </span>

                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={value}
                            style={{ "--range-progress": `${progress}%` }}
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
                      <h3>Dimensions</h3>

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

                    <div className="physical-card">
                      <div className="physical-item">
                        <div className="physical-label">Print width</div>
                        <strong className="physical-value">
                          {formatCm(outputWidthCm)}
                        </strong>
                      </div>

                      <div className="physical-item">
                        <div className="physical-label">Print height</div>
                        <strong className="physical-value">
                          {formatCm(outputHeightCm)}
                        </strong>
                      </div>

                      <div className="physical-item">
                        <div className="physical-label">DPI basis</div>

                        <input
                          type="number"
                          inputMode="numeric"
                          min="30"
                          max="1200"
                          step="1"
                          className="dpi-input"
                          value={physicalDpi}
                          onChange={(event) =>
                            setPhysicalDpi(event.target.value)
                          }
                          onBlur={() =>
                            setPhysicalDpi(
                              clamp(Number(physicalDpi) || 96, 30, 1200)
                            )
                          }
                          aria-label="DPI basis for centimeter conversion"
                        />
                      </div>

                      <div className="physical-note">
                        Physical size comes from the pixel count at the DPI
                        you pick. {megapixels.toFixed(1)} MP output.
                      </div>
                    </div>

                    {activeImage.resizeEnabled ? (
                      <>
                        <div className="resize-grid resize-grid-large">
                          <label>
                            <span>Width</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="10"
                              step="10"
                              value={sizeDraft.w ?? activeImage.targetWidth}
                              onChange={handleWidthChange}
                              onBlur={() => setSizeDraft({ w: null, h: null })}
                            />
                          </label>

                          <button
                            type="button"
                            className={`lock-btn ${
                              activeImage.lockAspect ? "locked" : ""
                            }`}
                            onClick={toggleLockAspect}
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
                              inputMode="numeric"
                              min="10"
                              step="10"
                              value={sizeDraft.h ?? activeImage.targetHeight}
                              onChange={handleHeightChange}
                              onBlur={() => setSizeDraft({ w: null, h: null })}
                            />
                          </label>
                        </div>

                        <div className="dimension-info">
                          <div className="dimension-info-item">
                            <span>Aspect ratio</span>
                            <strong>
                              {activeImage.targetWidth &&
                              activeImage.targetHeight
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
                              {activeImage.lockAspect ? "Locked" : "Free"}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="resize-disabled-state">
                        <span>Original dimensions</span>
                        <strong>
                          {activeImage.img.naturalWidth} ×{" "}
                          {activeImage.img.naturalHeight} px
                        </strong>
                      </div>
                    )}
                  </section>

                  <section className="below-editor-card metrics-card">
                    <div className="panel-heading">
                      <h3>File metrics</h3>

                      <span
                        className={`metric-pill ${
                          savingsPct >= 0 ? "good-bg" : "bad-bg"
                        }`}
                      >
                        {compressedSize
                          ? savingsPct >= 0
                            ? `${savingsPct.toFixed(0)}% smaller`
                            : `${Math.abs(savingsPct).toFixed(0)}% larger`
                          : "Working"}
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
                          <Gauge size={11} />
                          Change
                        </span>
                        <strong className={savingsPct >= 0 ? "good" : "bad"}>
                          {compressedSize
                            ? `${savingsPct >= 0 ? "−" : "+"}${Math.abs(
                                savingsPct
                              ).toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    <div
                      className="size-bar size-bar-large"
                      style={{ "--bar": `${sizeRatio}%` }}
                    >
                      <div />
                    </div>

                    <div className="compression-summary">
                      <div className="summary-icon">
                        {compressedSize ? (
                          <Check size={14} />
                        ) : (
                          <Zap size={14} />
                        )}
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
                            : "Calculating the optimized file size"}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="below-editor-card actions-card">
                    <div className="panel-heading">
                      <h3>Actions</h3>

                      <span className="panel-meta">
                        {compressedSize ? "Ready to export" : "Working"}
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
                                ? `${images.length} images in your workspace`
                                : "Your optimized image is ready to save"
                              : "Finalising your optimized image"}
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
                          ? "Send the current settings to every image in the library."
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
                <strong>Your files never leave your browser.</strong> All
                editing runs on the Canvas API on this device.
              </span>
            </div>
          </div>

          <div className="footer-bottom">
            <span>JPEG, PNG, WebP and batch ZIP</span>
            <span>Ctrl O import · Ctrl R reset · Ctrl S save</span>

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

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-card">
            <Upload size={26} strokeWidth={2} />
            <strong>Release to add your images</strong>
            <span>They stay on this device</span>
          </div>
        </div>
      )}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.tone === "good" ? (
              <Check size={14} strokeWidth={2.4} />
            ) : (
              <Zap size={14} strokeWidth={2.2} />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}