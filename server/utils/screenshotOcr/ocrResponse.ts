import type { OcrTextBlock } from "./types";

type NormalizedOcrResult = {
  width?: number;
  height?: number;
  durationMs?: number;
  sliceCount?: number;
  blocks: OcrTextBlock[];
};

const isPointArray = (value: unknown): value is number[][] =>
  Array.isArray(value) &&
  value.length > 0 &&
  Array.isArray(value[0]) &&
  typeof value[0][0] === "number";

const bboxFromPoints = (points: number[][]): [number, number, number, number] => {
  const xs = points.map((p) => Number(p[0]));
  const ys = points.map((p) => Number(p[1]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const toNumberBbox = (value: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length < 4) return null;
  const nums = value.slice(0, 4).map((v) => Number(v));
  if (nums.some((v) => Number.isNaN(v))) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
};

const normalizeBlock = (raw: any): OcrTextBlock | null => {
  if (!raw) return null;

  if (Array.isArray(raw) && isPointArray(raw[0]) && Array.isArray(raw[1])) {
    const text = String(raw[1][0] ?? "").trim();
    const score = Number(raw[1][1] ?? 0);
    if (!text) return null;
    return {
      text,
      score: Number.isNaN(score) ? undefined : score,
      bbox: bboxFromPoints(raw[0]),
      points: raw[0],
    };
  }

  const text = String(raw.text ?? raw.content ?? raw.rec_text ?? "").trim();
  if (!text) return null;

  let bbox = toNumberBbox(raw.bbox || raw.box);
  let points: number[][] | undefined;
  if (!bbox && isPointArray(raw.points || raw.poly || raw.dt_polys)) {
    points = raw.points || raw.poly || raw.dt_polys;
    bbox = bboxFromPoints(points);
  }
  if (!bbox) return null;

  const score = Number(raw.score ?? raw.confidence ?? raw.rec_score ?? 0);
  return {
    text,
    score: Number.isNaN(score) ? undefined : score,
    bbox,
    points,
  };
};

const flattenBlocks = (value: any): any[] => {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];
  if (value.every((item) => normalizeBlock(item))) return value;
  return value.flatMap((item) => flattenBlocks(item));
};

export const normalizeOcrResponse = (payload: any): NormalizedOcrResult => {
  const root = payload?.data || payload;
  const blockSource =
    root?.blocks ||
    root?.results ||
    root?.result ||
    root?.ocrResults ||
    root?.ocr ||
    [];
  const blocks = flattenBlocks(blockSource)
    .map((item) => normalizeBlock(item))
    .filter(Boolean) as OcrTextBlock[];

  return {
    width: Number(root?.width || root?.imageWidth || root?.image_width) || undefined,
    height:
      Number(root?.height || root?.imageHeight || root?.image_height) ||
      undefined,
    durationMs: Number(root?.durationMs || root?.duration_ms) || undefined,
    sliceCount: Number(root?.sliceCount || root?.slice_count) || undefined,
    blocks,
  };
};
