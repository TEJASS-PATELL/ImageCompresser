// @ts-nocheck
/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Copy,
  Crop,
  Download,
  Droplet,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Frame,
  Gauge,
  Layers3,
  Lock,
  Moon,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  WandSparkles,
  Zap,
} from "lucide-react";
import "./globals.css";

/* ------------------------------------------------------------------ */
/* constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_OUTPUT_SIDE = 12000;
const MAX_HISTORY = 25;

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
    id: "story",
    label: "Story / Reel",
    hint: "WebP · 1080×1920 · q82",
    format: "webp",
    quality: 82,
    maxDimension: 1920,
    aspectRatio: "9:16",
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
  {
    id: "print",
    label: "Print Ready",
    hint: "PNG · Lossless · Full",
    format: "png",
    quality: 100,
    maxDimension: 12000,
  },
];

const COLOR_LOOKS = [
  {
    id: "none",
    label: "Original",
    brightness: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    vignette: 0,
    grayscale: false,
    sepia: false,
  },
  {
    id: "vivid",
    label: "Vivid",
    brightness: 103,
    contrast: 112,
    saturation: 128,
    warmth: 8,
    vignette: 0,
    grayscale: false,
    sepia: false,
  },
  {
    id: "cinema",
    label: "Cinema",
    brightness: 98,
    contrast: 118,
    saturation: 88,
    warmth: -10,
    vignette: 28,
    grayscale: false,
    sepia: false,
  },
  {
    id: "warm",
    label: "Golden",
    brightness: 104,
    contrast: 106,
    saturation: 112,
    warmth: 26,
    vignette: 12,
    grayscale: false,
    sepia: false,
  },
  {
    id: "matte",
    label: "Matte",
    brightness: 106,
    contrast: 88,
    saturation: 90,
    warmth: 6,
    vignette: 15,
    grayscale: false,
    sepia: false,
  },
  {
    id: "noir",
    label: "Noir B&W",
    brightness: 98,
    contrast: 126,
    saturation: 0,
    warmth: 0,
    vignette: 32,
    grayscale: true,
    sepia: false,
  },
];

const TONE_SLIDERS = [
  ["Brightness", "brightness", 50, 150, "%"],
  ["Contrast", "contrast", 50, 150, "%"],
  ["Saturation", "saturation", 0, 180, "%"],
  ["Warmth", "warmth", -50, 50, ""],
  ["Sharpen", "sharpen", 0, 100, "%"],
  ["Vignette", "vignette", 0, 100, "%"],
  ["Soften / Blur", "blur", 0, 12, "px"],
];

const ASPECT_RATIOS = ["original", "1:1", "4:5", "4:3", "16:9", "3:2", "9:16"];

const SCALE_CHIPS = [
  { label: "25%", factor: 0.25 },
  { label: "50%", factor: 0.5 },
  { label: "75%", factor: 0.75 },
  { label: "100%", factor: 1 },
];

const BG_SWATCHES = [
  { id: "#ffffff", label: "White" },
  { id: "#000000", label: "Black" },
  { id: "#f5f5f4", label: "Warm Paper" },
  { id: "#18181b", label: "Charcoal" },
  { id: "transparent", label: "Transparent" },
];

const WATERMARK_POSITIONS = [
  { id: "br", label: "Bottom Right" },
  { id: "bl", label: "Bottom Left" },
  { id: "tr", label: "Top Right" },
  { id: "tl", label: "Top Left" },
  { id: "center", label: "Center" },
];

const HISTORY_KEYS = [
  "format",
  "quality",
  "targetSizeEnabled",
  "targetSizeKB",
  "resizeEnabled",
  "targetWidth",
  "targetHeight",
  "lockAspect",
  "grayscale",
  "sepia",
  "rotation",
  "flipX",
  "flipY",
  "brightness",
  "contrast",
  "saturation",
  "warmth",
  "blur",
  "sharpen",
  "vignette",
  "paddingPct",
  "bgColor",
  "watermarkText",
  "watermarkOpacity",
  "watermarkPos",
  "watermarkColor",
  "aspectRatio",
  "crop",
  "lookId",
];

/* ------------------------------------------------------------------ */
/* pure helpers                                                       */
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
  if (format === "jpeg") return "jpg";
  return format;
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
    /* fallback below */
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
    obj.warmth,
    obj.blur,
    obj.sharpen,
    obj.vignette,
    obj.paddingPct,
    obj.bgColor,
    obj.watermarkText,
    obj.watermarkOpacity,
    obj.watermarkPos,
    obj.watermarkColor,
    obj.aspectRatio,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
  ].join("|");
}

function extractSnapshot(obj) {
  const snap = {};
  HISTORY_KEYS.forEach((key) => {
    snap[key] = key === "crop" && obj.crop ? { ...obj.crop } : obj[key];
  });
  return snap;
}

function buildExportFilename(obj, suffixPattern = "-compressed") {
  const ext = extFor(obj.outputFormat || obj.format);
  const base = stripExt(obj.name);
  const info = getOutputSize(obj);
  const cleanSuffix = (suffixPattern || "-compressed")
    .replace("{w}", String(info.outWidth))
    .replace("{h}", String(info.outHeight))
    .replace("{q}", String(obj.appliedQuality || obj.quality));

  return `${base}${cleanSuffix}.${ext}`;
}

function applySharpenPass(ctx, width, height, amount) {
  if (!amount || amount <= 0) return;

  let srcData;
  try {
    srcData = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }

  const outData = ctx.createImageData(width, height);
  const src = srcData.data;
  const dst = outData.data;
  const mix = clamp(amount / 100, 0, 1) * 0.85;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }

      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      const right = (y * width + (x + 1)) * 4;

      for (let c = 0; c < 3; c += 1) {
        const edge =
          5 * src[idx + c] -
          src[up + c] -
          src[down + c] -
          src[left + c] -
          src[right + c];
        const val = src[idx + c] * (1 - mix) + edge * mix;
        dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
      dst[idx + 3] = src[idx + 3];
    }
  }

  ctx.putImageData(outData, 0, 0);
}

function applyPixelAdjustments(canvas, ctx, obj, nativeFilterSupported) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (!nativeFilterSupported && obj.blur > 0) {
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

  const needsFallbackColor =
    !nativeFilterSupported &&
    (obj.brightness !== 100 ||
      obj.contrast !== 100 ||
      obj.saturation !== 100 ||
      obj.sepia ||
      obj.grayscale);

  const hasWarmth = (obj.warmth || 0) !== 0;

  if (needsFallbackColor || hasWarmth) {
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      imageData = null;
    }

    if (imageData) {
      const data = imageData.data;
      const bright = needsFallbackColor ? obj.brightness / 100 : 1;
      const contrast = needsFallbackColor ? obj.contrast / 100 : 1;
      const sat = needsFallbackColor ? obj.saturation / 100 : 1;
      const warmthShift = (obj.warmth || 0) * 0.9;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (needsFallbackColor) {
          r *= bright;
          g *= bright;
          b *= bright;

          r = (r - 127.5) * contrast + 127.5;
          g = (g - 127.5) * contrast + 127.5;
          b = (b - 127.5) * contrast + 127.5;

          const sr =
            (0.213 + 0.787 * sat) * r +
            (0.715 - 0.715 * sat) * g +
            (0.072 - 0.072 * sat) * b;
          const sg =
            (0.213 - 0.213 * sat) * r +
            (0.715 + 0.285 * sat) * g +
            (0.072 - 0.072 * sat) * b;
          const sb =
            (0.213 - 0.213 * sat) * r +
            (0.715 - 0.715 * sat) * g +
            (0.072 + 0.928 * sat) * b;

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
        }

        if (hasWarmth) {
          r += warmthShift;
          g += warmthShift * 0.2;
          b -= warmthShift;
        }

        data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }

      ctx.putImageData(imageData, 0, 0);
    }
  }

  if (obj.sharpen > 0) {
    applySharpenPass(ctx, canvas.width, canvas.height, obj.sharpen);
  }
}

function drawVignetteAndWatermark(canvas, ctx, obj) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";

  const w = canvas.width;
  const h = canvas.height;

  if (obj.vignette > 0) {
    const cx = w / 2;
    const cy = h / 2;
    const outerRadius = Math.hypot(cx, cy);
    const innerRadius =
      outerRadius * (1 - clamp(obj.vignette / 135, 0.15, 0.75));
    const grad = ctx.createRadialGradient(
      cx,
      cy,
      innerRadius,
      cx,
      cy,
      outerRadius
    );
    const alpha = clamp(obj.vignette / 100, 0, 0.85);

    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${alpha})`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  const text = (obj.watermarkText || "").trim();
  if (text) {
    const minSide = Math.min(w, h);
    const fontSize = clamp(Math.round(minSide * 0.038), 12, 160);
    const margin = Math.max(12, Math.round(minSide * 0.035));

    ctx.save();
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = "middle";

    const alpha = clamp((obj.watermarkOpacity ?? 65) / 100, 0.1, 1);
    const isLight = (obj.watermarkColor || "light") === "light";

    ctx.fillStyle = isLight
      ? `rgba(255, 255, 255, ${alpha})`
      : `rgba(17, 17, 17, ${alpha})`;

    ctx.shadowColor = isLight
      ? `rgba(0, 0, 0, ${alpha * 0.55})`
      : `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.15));
    ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.05));

    let x = w - margin;
    let y = h - margin - fontSize / 2;
    ctx.textAlign = "right";

    if (obj.watermarkPos === "bl") {
      x = margin;
      y = h - margin - fontSize / 2;
      ctx.textAlign = "left";
    } else if (obj.watermarkPos === "tr") {
      x = w - margin;
      y = margin + fontSize / 2;
      ctx.textAlign = "right";
    } else if (obj.watermarkPos === "tl") {
      x = margin;
      y = margin + fontSize / 2;
      ctx.textAlign = "left";
    } else if (obj.watermarkPos === "center") {
      x = w / 2;
      y = h / 2;
      ctx.textAlign = "center";
    }

    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

function renderCanvas(obj) {
  const info = getOutputSize(obj);
  const { crop, vertical, rotation } = info;

  let width = info.width;
  let height = info.height;

  const pixels = width * height;

  if (pixels > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  const canvas = document.createElement("canvas");

  canvas.width = vertical ? height : width;
  canvas.height = vertical ? width : height;

  const isOpaqueFormat = obj.format === "jpeg";
  const effectiveBg =
    isOpaqueFormat && (!obj.bgColor || obj.bgColor === "transparent")
      ? "#ffffff"
      : obj.bgColor || "#ffffff";

  const ctx = canvas.getContext("2d", {
    alpha: !isOpaqueFormat && effectiveBg === "transparent",
  });

  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  if (effectiveBg !== "transparent") {
    ctx.fillStyle = effectiveBg;
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

  const padRatio = clamp((obj.paddingPct || 0) / 100, 0, 0.25);
  const drawW = Math.max(1, Math.round(width * (1 - padRatio * 2)));
  const drawH = Math.max(1, Math.round(height * (1 - padRatio * 2)));

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);

  ctx.drawImage(
    obj.img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -drawW / 2,
    -drawH / 2,
    drawW,
    drawH
  );
  ctx.restore();

  applyPixelAdjustments(canvas, ctx, obj, nativeFilter);
  drawVignetteAndWatermark(canvas, ctx, obj);

  return { canvas };
}

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

    const outputFormat =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : blob.type === "image/avif"
            ? "avif"
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
    canvas.width = 0;
    canvas.height = 0;
  }
}

/* ------------------------------------------------------------------ */
/* component                                                          */
/* ------------------------------------------------------------------ */

export default function Darkroom() {
  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeTab, setActiveTab] = useState("export"); // "export" | "crop" | "tune" | "studio"
  const [viewMode, setViewMode] = useState("split"); // "split" | "after" | "before"
  const [peekingOriginal, setPeekingOriginal] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [dimensionsCopied, setDimensionsCopied] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [physicalDpi, setPhysicalDpi] = useState(96);
  const [exportSuffix, setExportSuffix] = useState("-compressed");
  const [cropDraft, setCropDraft] = useState(null);
  const [theme, setTheme] = useState("light");
  const [themeReady, setThemeReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [busyIds, setBusyIds] = useState([]);
  const [sizeDraft, setSizeDraft] = useState({ w: null, h: null });
  const [historyTick, setHistoryTick] = useState(0);

  const fileInputRef = useRef(null);
  const compareWrapRef = useRef(null);
  const compareFrameRef = useRef(null);
  const compareRafRef = useRef(null);
  const cropEditorRef = useRef(null);
  const cropDragRef = useRef(null);
  const cropPendingRef = useRef(null);
  const cropRafRef = useRef(null);
  const dragDepth = useRef(0);
  const isComparing = useRef(false);

  const imagesRef = useRef([]);
  const historyRef = useRef({});
  const tokenRef = useRef({});
  const reqSigRef = useRef({});
  const urlRef = useRef({});
  const warnedFormatRef = useRef({});
  const addFilesRef = useRef(() => {});

  imagesRef.current = images;

  const activeImage = images.find((image) => image.id === activeId) || null;
  const activeSig = activeImage ? makeSig(activeImage) : "";

  /* ---------------------------------------------------------------- */
  /* toasts                                                           */
  /* ---------------------------------------------------------------- */

  const pushToast = useCallback((message, tone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  }, []);

  /* ---------------------------------------------------------------- */
  /* history (undo / redo per image)                                  */
  /* ---------------------------------------------------------------- */

  const recordHistory = useCallback((imageObj, nextUpdates) => {
    if (!imageObj) return;
    const id = imageObj.id;
    const entry = historyRef.current[id] || { past: [], future: [] };
    const currentSnap = extractSnapshot(imageObj);
    const mergedObj = { ...imageObj, ...nextUpdates };
    const nextSnap = extractSnapshot(mergedObj);

    if (JSON.stringify(currentSnap) === JSON.stringify(nextSnap)) return;

    entry.past = [...entry.past.slice(-(MAX_HISTORY - 1)), currentSnap];
    entry.future = [];
    historyRef.current[id] = entry;
    setHistoryTick((t) => t + 1);
  }, []);

  const canUndo =
    Boolean(activeId) &&
    historyTick >= 0 &&
    (historyRef.current[activeId]?.past?.length || 0) > 0;

  const canRedo =
    Boolean(activeId) &&
    historyTick >= 0 &&
    (historyRef.current[activeId]?.future?.length || 0) > 0;

  const handleUndo = useCallback(() => {
    if (!activeImage) return;
    const id = activeImage.id;
    const entry = historyRef.current[id];
    if (!entry?.past?.length) return;

    const previousSnap = entry.past[entry.past.length - 1];
    const currentSnap = extractSnapshot(activeImage);

    entry.past = entry.past.slice(0, -1);
    entry.future = [currentSnap, ...(entry.future || [])].slice(0, MAX_HISTORY);
    setHistoryTick((t) => t + 1);

    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...previousSnap } : img))
    );
  }, [activeImage]);

  const handleRedo = useCallback(() => {
    if (!activeImage) return;
    const id = activeImage.id;
    const entry = historyRef.current[id];
    if (!entry?.future?.length) return;

    const nextSnap = entry.future[0];
    const currentSnap = extractSnapshot(activeImage);

    entry.future = entry.future.slice(1);
    entry.past = [...(entry.past || []), currentSnap].slice(-MAX_HISTORY);
    setHistoryTick((t) => t + 1);

    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...nextSnap } : img))
    );
  }, [activeImage]);

  /* ---------------------------------------------------------------- */
  /* theme & lifecycle                                                */
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
      /* ignore storage errors */
    }
  }, [theme, themeReady]);

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.originalURL);
      });

      Object.values(urlRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });

      if (cropRafRef.current) cancelAnimationFrame(cropRafRef.current);
      if (compareRafRef.current) cancelAnimationFrame(compareRafRef.current);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* clipboard + drag and drop anywhere                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handlePaste = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

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
  /* crop draft sync                                                  */
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
    activeImage,
    activeImage?.aspectRatio,
    activeImage?.crop?.x,
    activeImage?.crop?.y,
    activeImage?.crop?.width,
    activeImage?.crop?.height,
  ]);

  useEffect(() => {
    setSizeDraft({ w: null, h: null });
  }, [activeId]);

  /* ---------------------------------------------------------------- */
  /* rendering + compression                                          */
  /* ---------------------------------------------------------------- */

  const commitResult = useCallback((id, sig, result, extra = {}) => {
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

    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1500);
  }, []);

  const forceRecompress = useCallback(
    async (obj) => {
      if (!obj) return;

      const id = obj.id;
      const token = (tokenRef.current[id] || 0) + 1;
      const sig = makeSig(obj);

      tokenRef.current[id] = token;
      reqSigRef.current[id] = sig;

      setBusyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

      try {
        const result = await compressImage(obj);

        if (tokenRef.current[id] !== token) {
          if (result) URL.revokeObjectURL(result.url);
          return;
        }

        if (!result) {
          pushToast(
            "This image is too large to process on this device",
            "bad"
          );
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
    },
    [commitResult, pushToast]
  );

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
      activeImage.renderedSig ? 120 : 0
    );

    return () => clearTimeout(timer);
  }, [activeId, activeImage, activeSig, forceRecompress]);

  /* ---------------------------------------------------------------- */
  /* file intake                                                      */
  /* ---------------------------------------------------------------- */

  const addFiles = useCallback(
    (fileList) => {
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
                : file.type === "image/avif"
                  ? "avif"
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

            quality: 78,
            appliedQuality: 78,

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
            warmth: 0,
            blur: 0,
            sharpen: 0,
            vignette: 0,
            lookId: "none",

            paddingPct: 0,
            bgColor: defaultFormat === "jpeg" ? "#ffffff" : "transparent",

            watermarkText: "",
            watermarkOpacity: 65,
            watermarkPos: "br",
            watermarkColor: "light",

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

          historyRef.current[id] = { past: [], future: [] };
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
    },
    [forceRecompress, pushToast]
  );

  addFilesRef.current = addFiles;

  /* ---------------------------------------------------------------- */
  /* state helpers                                                    */
  /* ---------------------------------------------------------------- */

  const updateActiveImage = useCallback(
    (updates, trackHistory = true) => {
      if (!activeImage) return;
      if (trackHistory) recordHistory(activeImage, updates);

      setImages((prev) =>
        prev.map((image) =>
          image.id === activeId ? { ...image, ...updates } : image
        )
      );
    },
    [activeId, activeImage, recordHistory]
  );

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

  const applyScaleFactor = (factor) => {
    if (!activeImage) return;
    const crop = normalizeCrop(activeImage);
    const nextW = clamp(Math.round(crop.width * factor), 10, MAX_OUTPUT_SIDE);
    const nextH = clamp(Math.round(crop.height * factor), 10, MAX_OUTPUT_SIDE);

    setSizeDraft({ w: null, h: null });
    updateActiveImage({
      resizeEnabled: factor !== 1,
      targetWidth: nextW,
      targetHeight: nextH,
      lockAspect: true,
    });

    pushToast(`Scaled to ${Math.round(factor * 100)}%`);
  };

  const applyColorLook = (look) => {
    if (!activeImage) return;

    updateActiveImage({
      lookId: look.id,
      brightness: look.brightness,
      contrast: look.contrast,
      saturation: look.saturation,
      warmth: look.warmth,
      vignette: look.vignette,
      grayscale: look.grayscale,
      sepia: look.sepia,
    });
  };

  const resetImage = useCallback(() => {
    if (!activeImage) return;

    updateActiveImage({
      format: activeImage.defaultFormat,
      quality: 78,
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
      warmth: 0,
      blur: 0,
      sharpen: 0,
      vignette: 0,
      lookId: "none",
      paddingPct: 0,
      bgColor:
        activeImage.defaultFormat === "jpeg" ? "#ffffff" : "transparent",
      watermarkText: "",
      watermarkOpacity: 65,
      watermarkPos: "br",
      watermarkColor: "light",
      aspectRatio: "original",
      crop: {
        x: 0,
        y: 0,
        width: activeImage.img.naturalWidth,
        height: activeImage.img.naturalHeight,
      },
    });

    pushToast("Settings reset");
  }, [activeImage, pushToast, updateActiveImage]);

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

    const nextRatio = preset.aspectRatio || activeImage.aspectRatio;
    const crop = preset.aspectRatio
      ? getAspectCrop(
          activeImage.img.naturalWidth,
          activeImage.img.naturalHeight,
          preset.aspectRatio
        )
      : normalizeCrop(activeImage);

    const largest = Math.max(crop.width, crop.height);
    const shouldResize = largest > preset.maxDimension;
    const ratio = shouldResize ? preset.maxDimension / largest : 1;

    updateActiveImage({
      format: preset.format,
      quality: preset.quality,
      aspectRatio: nextRatio,
      crop,
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

    delete tokenRef.current[id];
    delete reqSigRef.current[id];
    delete historyRef.current[id];

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
    historyRef.current = {};

    setImages([]);
    setActiveId(null);
    setBusyIds([]);

    if (fileInputRef.current) fileInputRef.current.value = "";

    pushToast("Workspace cleared");
  };

  const download = useCallback(
    (obj) => {
      if (!obj?.compressedBlob) return;

      const anchor = document.createElement("a");
      anchor.href = obj.compressedURL;
      anchor.download = buildExportFilename(obj, exportSuffix);

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      pushToast("Image saved", "good");
    },
    [exportSuffix, pushToast]
  );

  const shareOrSaveMobile = async (obj) => {
    if (!obj?.compressedBlob) return;

    const filename = buildExportFilename(obj, exportSuffix);
    const file = new File([obj.compressedBlob], filename, {
      type: obj.compressedBlob.type || "image/jpeg",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: filename,
        });
        pushToast("Shared successfully", "good");
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    download(obj);
  };

  const copyImageToClipboard = async () => {
    if (!activeImage?.compressedBlob) return;

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        let blobToCopy = activeImage.compressedBlob;

        if (blobToCopy.type !== "image/png") {
          const rendered = renderCanvas(activeImage);
          if (rendered?.canvas) {
            blobToCopy = await canvasToBlob(
              rendered.canvas,
              "image/png",
              undefined
            );
            rendered.canvas.width = 0;
            rendered.canvas.height = 0;
          }
        }

        if (blobToCopy) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blobToCopy }),
          ]);
          setImageCopied(true);
          setTimeout(() => setImageCopied(false), 1600);
          pushToast("Optimized image copied to clipboard", "good");
          return;
        }
      }
    } catch {
      /* fallback below */
    }

    pushToast("Image copy not supported on this browser", "bad");
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
              x: Math.round(
                (source.crop.x / source.img.naturalWidth) * sourceWidth
              ),
              y: Math.round(
                (source.crop.y / source.img.naturalHeight) * sourceHeight
              ),
              width: Math.max(
                1,
                Math.round(
                  (source.crop.width / source.img.naturalWidth) * sourceWidth
                )
              ),
              height: Math.max(
                1,
                Math.round(
                  (source.crop.height / source.img.naturalHeight) * sourceHeight
                )
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
        warmth: source.warmth,
        blur: source.blur,
        sharpen: source.sharpen,
        vignette: source.vignette,
        lookId: source.lookId,
        paddingPct: source.paddingPct,
        bgColor: source.bgColor,
        watermarkText: source.watermarkText,
        watermarkOpacity: source.watermarkOpacity,
        watermarkPos: source.watermarkPos,
        watermarkColor: source.watermarkColor,
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
        /* skip failed item */
      } finally {
        if (tokenRef.current[id] === token) {
          setBusyIds((prev) => prev.filter((value) => value !== id));
        }
      }
    }

    pushToast(`Settings applied to ${images.length} images`, "good");
  };

  const downloadAll = useCallback(async () => {
    if (!images.length || zipBusy) return;

    setZipBusy(true);

    try {
      const zip = new JSZip();
      const used = new Set();

      images.forEach((image) => {
        if (!image.compressedBlob) return;

        const ext = extFor(image.outputFormat || image.format);
        const full = buildExportFilename(image, exportSuffix);
        const base = stripExt(full);

        let name = `${base}.${ext}`;
        let count = 1;

        while (used.has(name)) {
          count += 1;
          name = `${base}-${count}.${ext}`;
        }

        used.add(name);
        zip.file(name, image.compressedBlob);
      });

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

      setTimeout(() => URL.revokeObjectURL(url), 5000);

      pushToast("ZIP downloaded", "good");
    } catch {
      pushToast("Could not create the ZIP file", "bad");
    } finally {
      setZipBusy(false);
    }
  }, [exportSuffix, images, pushToast, zipBusy]);

  const copyShareLink = async () => {
    const ok = await copyText(pageUrl || window.location.href);

    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      pushToast("Tool link copied", "good");
    } else {
      setCopied(false);
      pushToast("Clipboard is blocked in this browser", "bad");
    }
  };

  /* ---------------------------------------------------------------- */
  /* keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handleKey = (event) => {
      const tag = document.activeElement?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      if (!inInput && images.length > 1 && activeId) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const idx = images.findIndex((img) => img.id === activeId);
          if (idx > -1) {
            event.preventDefault();
            const nextIdx =
              event.key === "ArrowRight"
                ? (idx + 1) % images.length
                : (idx - 1 + images.length) % images.length;
            setActiveId(images[nextIdx].id);
          }
          return;
        }
      }

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      if (key === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }

      if (!activeImage) return;

      if (key === "z" && !inInput) {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (key === "y" && !inInput) {
        event.preventDefault();
        handleRedo();
        return;
      }

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
  }, [
    activeImage,
    activeId,
    images,
    zipBusy,
    handleUndo,
    handleRedo,
    resetImage,
    downloadAll,
    download,
  ]);

  /* ---------------------------------------------------------------- */
  /* resize inputs                                                    */
  /* ---------------------------------------------------------------- */

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
        targetHeight: Math.max(
          1,
          Math.round((width * crop.height) / crop.width)
        ),
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
        targetWidth: Math.max(
          1,
          Math.round((height * crop.width) / crop.height)
        ),
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
  /* crop interaction                                                 */
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
        ((event.clientX - rect.left) / rect.width) *
          activeImage.img.naturalWidth,
        0,
        activeImage.img.naturalWidth
      ),
      y: clamp(
        ((event.clientY - rect.top) / rect.height) *
          activeImage.img.naturalHeight,
        0,
        activeImage.img.naturalHeight
      ),
    };
  };

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

    const handleRole = event.target?.dataset?.handle;

    if (handleRole) {
      cropDragRef.current = {
        mode: handleRole,
        startX: point.x,
        startY: point.y,
        startCrop: { ...currentCrop },
      };
    } else {
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
        startCrop: { ...currentCrop },
      };

      if (!inside) {
        cropPendingRef.current = null;
        setCropDraft({ x: point.x, y: point.y, width: 1, height: 1 });
      }
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const updateCropDrag = (event) => {
    const drag = cropDragRef.current;
    if (!drag || !activeImage) return;

    const point = getCropSourcePoint(event);
    if (!point) return;

    const sourceWidth = activeImage.img.naturalWidth;
    const sourceHeight = activeImage.img.naturalHeight;
    const ratio = getCropRatioValue();

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

    if (["tl", "tr", "bl", "br"].includes(drag.mode)) {
      const sc = drag.startCrop;
      const anchorX =
        drag.mode === "tl" || drag.mode === "bl" ? sc.x + sc.width : sc.x;
      const anchorY =
        drag.mode === "tl" || drag.mode === "tr" ? sc.y + sc.height : sc.y;

      let width = Math.max(20, Math.abs(point.x - anchorX));
      let height = Math.max(20, Math.abs(point.y - anchorY));

      if (ratio) {
        if (width / height > ratio) height = width / ratio;
        else width = height * ratio;
      }

      width = Math.min(width, sourceWidth);
      height = Math.min(height, sourceHeight);

      if (ratio) {
        height = Math.min(sourceHeight, width / ratio);
        width = Math.min(sourceWidth, height * ratio);
      }

      const x = clamp(
        drag.mode === "tl" || drag.mode === "bl" ? anchorX - width : anchorX,
        0,
        sourceWidth - width
      );
      const y = clamp(
        drag.mode === "tl" || drag.mode === "tr" ? anchorY - height : anchorY,
        0,
        sourceHeight - height
      );

      queueCropDraft({ x, y, width, height });
      return;
    }

    const left = Math.min(drag.startX, point.x);
    const top = Math.min(drag.startY, point.y);
    const rawWidth = Math.abs(point.x - drag.startX);
    const rawHeight = Math.abs(point.y - drag.startY);

    if (rawWidth < 4 || rawHeight < 4) return;

    let width = rawWidth;
    let height = rawHeight;

    if (ratio) {
      if (width / Math.max(height, 1) > ratio) height = width / ratio;
      else width = height * ratio;
    }

    width = Math.max(16, Math.min(width, sourceWidth));
    height = Math.max(16, Math.min(height, sourceHeight));

    if (ratio) {
      height = Math.max(16, Math.min(sourceHeight, width / ratio));
      width = Math.max(16, Math.min(sourceWidth, height * ratio));
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
      /* ignore */
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

    updateActiveImage({
      crop: nextCrop,
      aspectRatio:
        activeImage.aspectRatio === "original"
          ? "custom"
          : activeImage.aspectRatio,
      ...sizeForCrop(activeImage, nextCrop),
    });

    pushToast("Crop applied", "good");
  };

  /* ---------------------------------------------------------------- */
  /* compare slider                                                   */
  /* ---------------------------------------------------------------- */

  const setComparePos = (clientX) => {
    const frame = compareFrameRef.current;
    if (!frame) return;

    if (compareRafRef.current) cancelAnimationFrame(compareRafRef.current);

    compareRafRef.current = requestAnimationFrame(() => {
      compareRafRef.current = null;
      const rect = frame.getBoundingClientRect();
      if (!rect.width) return;

      const percentage = clamp(
        ((clientX - rect.left) / rect.width) * 100,
        0,
        100
      );
      frame.style.setProperty("--pos", `${percentage}%`);
    });
  };

  const handleComparePointerDown = (event) => {
    if (viewMode !== "split") return;
    isComparing.current = true;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    setComparePos(event.clientX);
  };

  const handleComparePointerMove = (event) => {
    if (isComparing.current && viewMode === "split") {
      setComparePos(event.clientX);
    }
  };

  const handleComparePointerUp = (event) => {
    isComparing.current = false;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  /* ---------------------------------------------------------------- */
  /* derived values                                                   */
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

  const effectiveComparePos =
    peekingOriginal || viewMode === "before"
      ? "100%"
      : viewMode === "after"
        ? "0%"
        : "50%";

  /* ---------------------------------------------------------------- */
  /* render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <main className="darkroom-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {/* TOPBAR */}
      <header className="topbar page-width">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Layers3 size={20} strokeWidth={2.1} />
          </div>

          <div>
            <div className="brand-name">Darkroom</div>
            <div className="brand-sub">Private studio &amp; optimizer</div>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="privacy-pill">
            <ShieldCheck size={15} strokeWidth={2} />
            100% On-device
          </span>

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            <span className="theme-toggle-knob">
              {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
            </span>
          </button>
        </div>
      </header>

      {/* HERO (Compact when workspace has images) */}
      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Fast, private, studio-grade
          </div>

          <h1>
            Make every image lighter <span>and better.</span>
          </h1>

          <p>
            Compress, crop, color-grade, frame and watermark your photos right
            inside the browser. Zero cloud uploads, zero tracking, and EXIF
            metadata is stripped automatically.
          </p>

          <div className="hero-meta">
            <span>
              <strong>{images.length}</strong> in workspace
            </span>

            <span>JPEG, WebP, PNG &amp; AVIF</span>

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
            event.target.value = "";
          }}
        />
      </section>

      {/* EMPTY STATE OR STUDIO WORKSPACE */}
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
            <p>or tap anywhere in this panel to browse your device</p>

            <div className="drop-badges">
              <span>Batch upload</span>
              <span>Paste from clipboard</span>
              <span>Works offline</span>
              <span>No cloud upload</span>
            </div>
          </div>

          <div className="feature-row">
            <div className="feature-card">
              <span className="feature-icon">
                <WandSparkles size={17} strokeWidth={2} />
              </span>
              <div>
                <strong>Exact KB targeting</strong>
                <small>
                  Set a max file size; binary search finds peak quality.
                </small>
              </div>
            </div>

            <div className="feature-card">
              <span className="feature-icon">
                <Sparkles size={17} strokeWidth={2} />
              </span>
              <div>
                <strong>Studio grade looks</strong>
                <small>
                  Color presets, sharpen, warmth, frames &amp; watermarks.
                </small>
              </div>
            </div>

            <div className="feature-card">
              <span className="feature-icon">
                <ShieldCheck size={17} strokeWidth={2} />
              </span>
              <div>
                <strong>Stays on device</strong>
                <small>
                  Hardware-accelerated Canvas API; files never leave.
                </small>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="workspace page-width">
          {/* UNIFIED FILMSTRIP & BATCH HEADER */}
          <div className="filmstrip-card">
            <div className="filmstrip-head">
              <div className="filmstrip-summary">
                <strong>Library ({images.length})</strong>
                <span className="filmstrip-stats">
                  {formatBytes(totalOriginal)} → {formatBytes(totalCompressed)}
                </span>
                <span
                  className={`metric-pill ${
                    totalSavings >= 0 ? "good-bg" : "bad-bg"
                  }`}
                >
                  {totalSavings >= 0
                    ? `${totalSavings.toFixed(0)}% saved`
                    : `${Math.abs(totalSavings).toFixed(0)}% larger`}
                </span>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus size={15} strokeWidth={2} />
                  Add photos
                </button>

                {images.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-dark btn-sm"
                    onClick={downloadAll}
                    disabled={zipBusy}
                  >
                    {zipBusy ? (
                      <>
                        <RotateCw
                          className="spin-icon"
                          size={14}
                          strokeWidth={2}
                        />
                        Packing ZIP…
                      </>
                    ) : (
                      <>
                        <Download size={14} strokeWidth={2} />
                        Download ZIP ({images.length})
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={clearAll}
                  title="Clear all images"
                >
                  <Trash2 size={14} strokeWidth={2} />
                  Clear
                </button>
              </div>
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
                    src={image.compressedURL || image.originalURL}
                    alt={image.name}
                    className="thumb-img"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />

                  <span className="thumb-name">{image.name}</span>

                  <span
                    className="thumb-remove"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => removeImage(image.id, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        removeImage(image.id, event);
                      }
                    }}
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

          {/* 2-COLUMN BALANCED STUDIO GRID */}
          {activeImage && (
            <div className="editor-grid">
              {/* LEFT COLUMN: PREVIEW + INTEGRATED METRICS */}
              <section className="preview-card">
                <div className="card-topline">
                  <strong className="file-title" title={activeImage.name}>
                    {activeImage.name}
                  </strong>

                  <div className="preview-actions">
                    <div className="view-mode-pills">
                      {[
                        ["split", "Split"],
                        ["after", "After"],
                        ["before", "Before"],
                      ].map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={`view-pill ${
                            viewMode === mode ? "active" : ""
                          }`}
                          onClick={() => setViewMode(mode)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <span className="soft-badge">
                      {(
                        activeImage.outputFormat || activeImage.format
                      ).toUpperCase()}
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

                {/* INTERACTIVE CANVAS STAGE */}
                <div
                  className={`compare-wrap mode-${viewMode}`}
                  ref={compareWrapRef}
                  style={{
                    touchAction:
                      viewMode === "split" ? "pan-y" : "manipulation",
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
                    ref={compareFrameRef}
                    className="compare-ratio-frame"
                    style={{
                      "--frame-ratio":
                        outputWidth && outputHeight
                          ? `${outputWidth} / ${outputHeight}`
                          : "1 / 1",
                      "--pos": effectiveComparePos,
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
                        activeImage.compressedURL || activeImage.originalURL
                      }
                      alt="Optimized"
                      draggable={false}
                      decoding="async"
                    />

                    {viewMode === "split" && !peekingOriginal && (
                      <div className="compare-handle">
                        <div className="moving-icon" />
                      </div>
                    )}
                  </div>

                  <span className="preview-tag before">
                    Original · {formatBytes(originalSize)}
                  </span>
                  <span className="preview-tag after">
                    Optimized ·{" "}
                    {compressedSize ? formatBytes(compressedSize) : "…"}
                  </span>
                </div>

                {/* PREVIEW SUB-BAR */}
                <div className="preview-footer">
                  <span>
                    {activeImage.img.naturalWidth} ×{" "}
                    {activeImage.img.naturalHeight} source
                  </span>

                  <button
                    type="button"
                    className={`peek-btn ${peekingOriginal ? "active" : ""}`}
                    onPointerDown={() => setPeekingOriginal(true)}
                    onPointerUp={() => setPeekingOriginal(false)}
                    onPointerLeave={() => setPeekingOriginal(false)}
                    onPointerCancel={() => setPeekingOriginal(false)}
                    title="Hold to view original image"
                  >
                    <Eye size={13} strokeWidth={2} />
                    <span>Hold to peek original</span>
                  </button>

                  <button
                    type="button"
                    className="output-dimensions"
                    onClick={copyOutputDimensions}
                    title="Copy output dimensions"
                  >
                    <Copy size={12} strokeWidth={2} />
                    <span>
                      {dimensionsCopied
                        ? "Copied!"
                        : `${outputWidth} × ${outputHeight} px (${megapixels.toFixed(
                            1
                          )} MP)`}
                    </span>
                  </button>
                </div>

                {/* INTEGRATED LIVE FILE METRICS BAR */}
                <div
                  className="integrated-metrics"
                  style={{ "--size-ratio": `${sizeRatio.toFixed(0)}%` }}
                >
                  <div className="metrics-grid">
                    <div className="metric-box">
                      <span className="metric-label">
                        <FolderOpen size={12} />
                        Original Size
                      </span>
                      <strong>{formatBytes(originalSize)}</strong>
                    </div>

                    <div className="metric-box">
                      <span className="metric-label">
                        <Download size={12} />
                        Optimized ({sizeRatio.toFixed(0)}% of original)
                      </span>
                      <strong>
                        {compressedSize ? formatBytes(compressedSize) : "—"}
                      </strong>
                    </div>

                    <div className="metric-box">
                      <span className="metric-label">
                        <Gauge size={12} />
                        Savings
                      </span>
                      <strong className={savingsPct >= 0 ? "good" : "bad"}>
                        {compressedSize
                          ? `${savingsPct >= 0 ? "−" : "+"}${Math.abs(
                              savingsPct
                            ).toFixed(0)}% (${formatBytes(
                              Math.abs(originalSize - compressedSize)
                            )})`
                          : "Calculating…"}
                      </strong>
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT COLUMN: TABBED INSPECTOR + STICKY EXPORT FOOTER */}
              <aside className="controls-card">
                {/* HEADER: AUTO OPTIMIZE + UNDO/REDO/RESET */}
                <div className="controls-header">
                  <button
                    type="button"
                    className="auto-optimize-btn"
                    onClick={autoOptimize}
                    title="Apply smart WebP compression & sizing"
                  >
                    <Sparkles size={15} strokeWidth={2} />
                    <span>Auto Optimize</span>
                  </button>

                  <div className="history-actions">
                    <button
                      type="button"
                      className="icon-text-btn"
                      onClick={handleUndo}
                      disabled={!canUndo}
                      title="Undo (Ctrl+Z)"
                      aria-label="Undo"
                    >
                      <Undo2 size={15} strokeWidth={2} />
                    </button>

                    <button
                      type="button"
                      className="icon-text-btn"
                      onClick={handleRedo}
                      disabled={!canRedo}
                      title="Redo (Ctrl+Y)"
                      aria-label="Redo"
                    >
                      <Redo2 size={15} strokeWidth={2} />
                    </button>

                    <button
                      type="button"
                      className="icon-text-btn"
                      onClick={resetImage}
                      title="Reset all adjustments (Ctrl+R)"
                    >
                      <RotateCcw size={14} strokeWidth={2} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* 4 CLEAN STUDIO TABS */}
                <div className="studio-tabs" role="tablist">
                  {[
                    { id: "export", label: "Format", icon: Gauge },
                    { id: "crop", label: "Crop & Size", icon: Crop },
                    { id: "tune", label: "Adjust", icon: SlidersHorizontal },
                    { id: "studio", label: "Frame & Text", icon: Frame },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      className={`studio-tab ${
                        activeTab === id ? "active" : ""
                      }`}
                      onClick={() => setActiveTab(id)}
                    >
                      <Icon size={14} strokeWidth={2} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* SCROLLABLE TAB BODY */}
                <div className="controls-body">
                  {/* TAB 1: FORMAT, QUALITY & PRESETS */}
                  {activeTab === "export" && (
                    <>
                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Quick Presets</span>
                          <span className="control-help">One-tap setup</span>
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
                          <span>Output Format</span>
                          <span className="control-help">Encoder</span>
                        </div>

                        <div className="segmented">
                          {["jpeg", "webp", "png", "avif"].map((format) => (
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

                      <div className="control-section">
                        <div className="quality-meter">
                          <div className="quality-meter-top">
                            <div>
                              <span className="quality-meter-label">
                                Compression Quality
                              </span>
                              <strong className="quality-meter-value">
                                {qualityLabel}
                              </strong>
                            </div>

                            <span className="quality-status">
                              {activeImage.format === "png"
                                ? "Lossless PNG"
                                : activeImage.quality >= 90
                                  ? "Maximum"
                                  : activeImage.quality >= 75
                                    ? "Balanced"
                                    : "Compact"}
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
                            <span>Smaller file</span>
                            <span>Balanced</span>
                            <span>Best quality</span>
                          </div>
                        </div>
                      </div>

                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Target File Size Budget</span>

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

                          <span className="target-unit">KB max</span>

                          <span className="target-result">
                            {activeImage.targetSizeEnabled && compressedSize
                              ? `→ ${formatBytes(compressedSize)}`
                              : "Auto q"}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* TAB 2: CROP, ROTATE & DIMENSIONS */}
                  {activeTab === "crop" && (
                    <>
                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Orientation</span>
                          <span className="control-help">Rotate &amp; flip</span>
                        </div>

                        <div className="quick-edit-grid">
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveImage({
                                rotation: (activeImage.rotation + 270) % 360,
                              })
                            }
                          >
                            <RotateCcw size={15} strokeWidth={2} />
                            -90°
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
                            +90°
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
                          <span>Aspect Ratio</span>
                          <span className="control-help">Frame preset</span>
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

                        <div
                          ref={cropEditorRef}
                          className="crop-stage"
                          style={{
                            "--stage-ratio": `${activeImage.img.naturalWidth} / ${activeImage.img.naturalHeight}`,
                            touchAction: "none",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                          }}
                          onPointerDown={beginCropDrag}
                          onPointerMove={updateCropDrag}
                          onPointerUp={finishCropDrag}
                          onPointerCancel={finishCropDrag}
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
                                {Math.round(cropDraft.height)}
                              </span>

                              <span
                                className="crop-corner tl"
                                data-handle="tl"
                              />
                              <span
                                className="crop-corner tr"
                                data-handle="tr"
                              />
                              <span
                                className="crop-corner bl"
                                data-handle="bl"
                              />
                              <span
                                className="crop-corner br"
                                data-handle="br"
                              />
                            </div>
                          )}
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

                      {/* MERGED RESIZE & SCALE DIMENSIONS */}
                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Resize Dimensions</span>
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

                        <div className="scale-chip-row">
                          {SCALE_CHIPS.map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              className="scale-chip"
                              onClick={() => applyScaleFactor(chip.factor)}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>

                        <div className="resize-grid">
                          <label>
                            <span>Width (px)</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="10"
                              step="10"
                              disabled={!activeImage.resizeEnabled}
                              value={
                                activeImage.resizeEnabled
                                  ? (sizeDraft.w ?? activeImage.targetWidth)
                                  : outputWidth
                              }
                              onChange={handleWidthChange}
                              onBlur={() => setSizeDraft({ w: null, h: null })}
                            />
                          </label>

                          <button
                            type="button"
                            className={`lock-btn ${
                              activeImage.lockAspect ? "locked" : ""
                            }`}
                            disabled={!activeImage.resizeEnabled}
                            onClick={toggleLockAspect}
                            aria-label="Toggle aspect ratio lock"
                          >
                            {activeImage.lockAspect ? (
                              <Lock size={15} strokeWidth={2} />
                            ) : (
                              <Unlock size={15} strokeWidth={2} />
                            )}
                          </button>

                          <label>
                            <span>Height (px)</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="10"
                              step="10"
                              disabled={!activeImage.resizeEnabled}
                              value={
                                activeImage.resizeEnabled
                                  ? (sizeDraft.h ?? activeImage.targetHeight)
                                  : outputHeight
                              }
                              onChange={handleHeightChange}
                              onBlur={() => setSizeDraft({ w: null, h: null })}
                            />
                          </label>
                        </div>

                        <div className="physical-bar">
                          <span>
                            Print: <strong>{formatCm(outputWidthCm)}</strong> ×{" "}
                            <strong>{formatCm(outputHeightCm)}</strong>
                          </span>
                          <label className="dpi-inline">
                            <span>@</span>
                            <input
                              type="number"
                              min="30"
                              max="1200"
                              value={physicalDpi}
                              onChange={(e) => setPhysicalDpi(e.target.value)}
                              onBlur={() =>
                                setPhysicalDpi(
                                  clamp(Number(physicalDpi) || 96, 30, 1200)
                                )
                              }
                            />
                            <span>DPI</span>
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {/* TAB 3: COLOR LOOKS & TONE SLIDERS */}
                  {activeTab === "tune" && (
                    <>
                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Color Looks</span>
                          <span className="control-help">Instant grade</span>
                        </div>

                        <div className="looks-grid">
                          {COLOR_LOOKS.map((look) => (
                            <button
                              key={look.id}
                              type="button"
                              className={`look-chip ${
                                activeImage.lookId === look.id ? "selected" : ""
                              }`}
                              onClick={() => applyColorLook(look)}
                            >
                              {look.label}
                            </button>
                          ))}
                        </div>

                        <div className="quick-edit-grid mono-row">
                          <button
                            type="button"
                            className={activeImage.grayscale ? "selected" : ""}
                            onClick={() =>
                              updateActiveImage({
                                grayscale: !activeImage.grayscale,
                                sepia: false,
                                lookId: "custom",
                              })
                            }
                          >
                            <Droplet size={14} strokeWidth={2} />
                            B&amp;W Mono
                          </button>

                          <button
                            type="button"
                            className={activeImage.sepia ? "selected" : ""}
                            onClick={() =>
                              updateActiveImage({
                                sepia: !activeImage.sepia,
                                grayscale: false,
                                lookId: "custom",
                              })
                            }
                          >
                            <Sparkles size={14} strokeWidth={2} />
                            Sepia Warm
                          </button>
                        </div>
                      </div>

                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Tone &amp; Detail</span>
                          <span className="control-help">Fine sliders</span>
                        </div>

                        <div className="sidebar-sliders">
                          {TONE_SLIDERS.map(([label, key, min, max, unit]) => {
                            const value = activeImage[key] ?? 0;
                            const progress =
                              ((value - min) / (max - min)) * 100;

                            return (
                              <label
                                key={key}
                                className="range-field tuning-field"
                              >
                                <span>
                                  <strong>{label}</strong>
                                  <output>
                                    {value > 0 && key === "warmth"
                                      ? `+${value}`
                                      : value}
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
                                      lookId: "custom",
                                    })
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* TAB 4: STUDIO FRAME, BACKGROUND & WATERMARK */}
                  {activeTab === "studio" && (
                    <>
                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Border Frame &amp; Matte</span>
                          <span className="control-help">
                            {activeImage.paddingPct || 0}% inset
                          </span>
                        </div>

                        <label className="range-field tuning-field">
                          <span>
                            <strong>Frame Thickness</strong>
                            <output>{activeImage.paddingPct || 0}%</output>
                          </span>

                          <input
                            type="range"
                            min="0"
                            max="20"
                            step="1"
                            value={activeImage.paddingPct || 0}
                            style={{
                              "--range-progress": `${
                                ((activeImage.paddingPct || 0) / 20) * 100
                              }%`,
                            }}
                            onChange={(event) =>
                              updateActiveImage({
                                paddingPct: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <div className="swatch-row">
                          <span className="swatch-label">
                            <Palette size={13} />
                            Matte Color
                          </span>

                          <div className="swatch-list">
                            {BG_SWATCHES.map((swatch) => {
                              const disabled =
                                swatch.id === "transparent" &&
                                activeImage.format === "jpeg";
                              return (
                                <button
                                  key={swatch.id}
                                  type="button"
                                  disabled={disabled}
                                  title={
                                    disabled
                                      ? "Switch to PNG or WebP for transparency"
                                      : swatch.label
                                  }
                                  className={`color-swatch ${
                                    activeImage.bgColor === swatch.id
                                      ? "selected"
                                      : ""
                                  } ${
                                    swatch.id === "transparent"
                                      ? "swatch-Checkered"
                                      : ""
                                  }`}
                                  style={
                                    swatch.id !== "transparent"
                                      ? { "--swatch-color": swatch.id }
                                      : undefined
                                  }
                                  onClick={() =>
                                    updateActiveImage({ bgColor: swatch.id })
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="control-section">
                        <div className="control-title-row">
                          <span>Watermark Stamp</span>
                          <span className="control-help">Creator branding</span>
                        </div>

                        <div className="watermark-box">
                          <div className="watermark-input-wrap">
                            <Type size={14} />
                            <input
                              type="text"
                              placeholder="© Your Name or Brand"
                              maxLength={48}
                              value={activeImage.watermarkText || ""}
                              onChange={(event) =>
                                updateActiveImage({
                                  watermarkText: event.target.value,
                                })
                              }
                            />
                          </div>

                          {activeImage.watermarkText?.trim() && (
                            <>
                              <div className="watermark-pos-grid">
                                {WATERMARK_POSITIONS.map((pos) => (
                                  <button
                                    key={pos.id}
                                    type="button"
                                    className={
                                      activeImage.watermarkPos === pos.id
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      updateActiveImage({
                                        watermarkPos: pos.id,
                                      })
                                    }
                                  >
                                    {pos.label}
                                  </button>
                                ))}
                              </div>

                              <div className="segmented">
                                {[
                                  ["light", "Light Ink"],
                                  ["dark", "Dark Ink"],
                                ].map(([tone, label]) => (
                                  <button
                                    key={tone}
                                    type="button"
                                    className={
                                      (activeImage.watermarkColor || "light") ===
                                      tone
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      updateActiveImage({
                                        watermarkColor: tone,
                                      })
                                    }
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>

                              <label className="range-field tuning-field">
                                <span>
                                  <strong>Opacity</strong>
                                  <output>
                                    {activeImage.watermarkOpacity ?? 65}%
                                  </output>
                                </span>

                                <input
                                  type="range"
                                  min="15"
                                  max="100"
                                  value={activeImage.watermarkOpacity ?? 65}
                                  style={{
                                    "--range-progress": `${
                                      (((activeImage.watermarkOpacity ?? 65) -
                                        15) /
                                        85) *
                                      100
                                    }%`,
                                  }}
                                  onChange={(event) =>
                                    updateActiveImage({
                                      watermarkOpacity: Number(
                                        event.target.value
                                      ),
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* PINNED SIDEBAR EXPORT FOOTER */}
                <div className="controls-footer">
                  <div className="export-naming-row">
                    <span className="naming-label">Suffix</span>
                    <input
                      type="text"
                      className="naming-input"
                      value={exportSuffix}
                      placeholder="-compressed"
                      onChange={(e) => setExportSuffix(e.target.value)}
                      title="Supports {w}, {h}, {q} placeholders"
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-dark wide"
                    onClick={() => download(activeImage)}
                    disabled={!compressedSize}
                  >
                    <Download size={16} strokeWidth={2} />
                    Download Image (
                    {compressedSize ? formatBytes(compressedSize) : "…"})
                  </button>

                  <div className="quick-export-split">
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() => shareOrSaveMobile(activeImage)}
                      disabled={!compressedSize}
                    >
                      <Share2 size={14} strokeWidth={2} />
                      Share
                    </button>

                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={copyImageToClipboard}
                      disabled={!compressedSize}
                    >
                      <Copy size={14} strokeWidth={2} />
                      {imageCopied ? "Copied!" : "Copy"}
                    </button>

                    {images.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={applyAll}
                        title="Sync current settings to all photos"
                      >
                        <Check size={14} strokeWidth={2} />
                        Sync ({images.length})
                      </button>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* STICKY MOBILE DOCK */}
          {activeImage && (
            <div className="mobile-action-dock">
              <div className="mobile-dock-meta">
                <strong>
                  {compressedSize ? formatBytes(compressedSize) : "Working…"}
                </strong>
                <span className={savingsPct >= 0 ? "good" : "bad"}>
                  {compressedSize
                    ? `${savingsPct >= 0 ? "−" : "+"}${Math.abs(
                        savingsPct
                      ).toFixed(0)}%`
                    : "Rendering"}
                </span>
              </div>

              <div className="mobile-dock-buttons">
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => shareOrSaveMobile(activeImage)}
                  disabled={!compressedSize}
                  aria-label="Share image"
                >
                  <Share2 size={16} strokeWidth={2} />
                </button>

                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={() => download(activeImage)}
                  disabled={!compressedSize}
                >
                  <Download size={16} strokeWidth={2} />
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* FOOTER */}
      <footer className="footer page-width">
        <div className="footer-card">
          <div className="footer-main">
            <div className="footer-brand">
              <div className="brand-mark small">
                <Layers3 size={18} strokeWidth={2.1} />
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
            <span>JPEG, PNG, WebP, AVIF and batch ZIP</span>
            <span>Ctrl+O import · Ctrl+Z undo · Ctrl+S save</span>
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

      {/* DRAG OVERLAY */}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-card">
            <Upload size={26} strokeWidth={2} />
            <strong>Release to add your images</strong>
            <span>They stay on this device</span>
          </div>
        </div>
      )}

      {/* TOAST STACK */}
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