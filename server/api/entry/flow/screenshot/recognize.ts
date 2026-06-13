import {
  getScreenshotOcrRules,
  screenshotSourceOptions,
} from "~~/server/utils/screenshotOcr/rules";
import { normalizeOcrResponse } from "~~/server/utils/screenshotOcr/ocrResponse";
import { parseScreenshotFlows } from "~~/server/utils/screenshotOcr/parse";
import type {
  OcrTextBlock,
  ScreenshotBillSource,
} from "~~/server/utils/screenshotOcr/types";

const isScreenshotSource = (value: string): value is ScreenshotBillSource =>
  screenshotSourceOptions.includes(value as ScreenshotBillSource);

const getOcrServiceUrl = () => {
  const runtimeConfig = useRuntimeConfig();
  return String(runtimeConfig.ocrServiceUrl || process.env.OCR_SERVICE_URL || "");
};

const getRequestTimeout = () => {
  const runtimeConfig = useRuntimeConfig();
  const value = Number(runtimeConfig.ocrRequestTimeoutMs || 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
};

const callOcrService = async (file: File) => {
  const serviceUrl = getOcrServiceUrl();
  if (!serviceUrl) {
    throw new Error("未配置 OCR 服务地址，请设置 NUXT_OCR_SERVICE_URL");
  }

  const body = new FormData();
  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || "image/jpeg",
  });
  body.append("image", blob, file.name);

  const response = await fetch(serviceUrl, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(getRequestTimeout()),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OCR服务请求失败：${response.status} ${message}`);
  }

  const payload = await response.json();
  return normalizeOcrResponse(payload);
};

/**
 * @swagger
 * /api/entry/flow/screenshot/recognize:
 *   post:
 *     summary: 根据账单截图识别流水候选记录
 *     tags: ["Flow"]
 *     security:
 *       - Authorization: []
 */
export default defineEventHandler(async (event) => {
  const formdata = await readFormData(event);
  const source = String(formdata.get("source") || "");
  const year = Number(formdata.get("year") || new Date().getFullYear());

  if (!isScreenshotSource(source)) {
    return error("请选择正确的账单来源");
  }

  const files = formdata
    .getAll("images")
    .filter((file): file is File => file instanceof File);

  if (files.length === 0) {
    return error("请上传账单截图");
  }

  const rules = await getScreenshotOcrRules();
  const rule = rules[source];
  const warnings: string[] = [];
  const flows: any[] = [];
  const images: any[] = [];

  for (const file of files) {
    try {
      const ocrResult = await callOcrService(file);
      const blocks: OcrTextBlock[] = ocrResult.blocks;
      const parsedFlows = parseScreenshotFlows(blocks, rule, {
        source,
        year,
        imageWidth: ocrResult.width,
        imageHeight: ocrResult.height,
      });

      flows.push(...parsedFlows);
      images.push({
        name: file.name,
        size: file.size,
        width: ocrResult.width,
        height: ocrResult.height,
        ocrDurationMs: ocrResult.durationMs,
        sliceCount: ocrResult.sliceCount,
        blockCount: blocks.length,
        flowCount: parsedFlows.length,
      });
    } catch (err: any) {
      warnings.push(`${file.name}: ${err?.message || "识别失败"}`);
    }
  }

  if (flows.length === 0 && warnings.length > 0) {
    return error(warnings.join("；"));
  }

  return success({
    source,
    sourceName: rule.name,
    minConfidence: rule.minConfidence,
    flows,
    images,
    warnings,
  });
});
