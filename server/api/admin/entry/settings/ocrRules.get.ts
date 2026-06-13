import {
  defaultScreenshotOcrRules,
  getScreenshotOcrRules,
  getScreenshotOcrRulesFile,
} from "~~/server/utils/screenshotOcr/rules";

/**
 * @swagger
 * /api/admin/entry/settings/ocrRules:
 *   get:
 *     summary: 获取截图 OCR 识别规则
 *     tags: ["Admin Settings"]
 */
export default defineEventHandler(async () => {
  const rules = await getScreenshotOcrRules();
  return success({
    rules,
    defaultRules: defaultScreenshotOcrRules,
    file: getScreenshotOcrRulesFile(),
  });
});
