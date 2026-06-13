import { saveScreenshotOcrRules } from "~~/server/utils/screenshotOcr/rules";

/**
 * @swagger
 * /api/admin/entry/settings/ocrRules:
 *   post:
 *     summary: 保存截图 OCR 识别规则
 *     tags: ["Admin Settings"]
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    await saveScreenshotOcrRules(body);
    return success();
  } catch (err: any) {
    return error(err?.message || "OCR规则保存失败");
  }
});
