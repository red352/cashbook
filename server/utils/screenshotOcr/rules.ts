import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ScreenshotBillSource,
  ScreenshotOcrRule,
} from "./types";

export const screenshotSourceOptions: ScreenshotBillSource[] = [
  "alipay",
  "wechat",
  "meituan",
];

export const defaultScreenshotOcrRules: Record<
  ScreenshotBillSource,
  ScreenshotOcrRule
> = {
  alipay: {
    source: "alipay",
    name: "支付宝",
    payType: "支付宝",
    defaultIndustryType: "其他",
    baseWidth: 1200,
    amountArea: [0.7, 0.97],
    titleArea: [0.13, 0.78],
    topIgnoreRatio: 0.08,
    amountPatterns: ["^[+＋\\-−–—]?\\s*[¥￥]?\\s*[0-9,]+(?:\\.[0-9]{1,2})$"],
    datePatterns: [
      "(?:(\\d{4})[-/年])?(\\d{1,2})[-/月](\\d{1,2})日?\\s*(\\d{1,2}:\\d{2})",
      "(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})日\\s*(\\d{1,2}:\\d{2})",
    ],
    monthPatterns: ["(\\d{4})年\\s*(\\d{1,2})月"],
    simpleMonthPatterns: ["^(\\d{1,2})月$"],
    incomeKeywords: ["收益", "收入", "收款", "转入", "退款", "退回", "到账"],
    expenseKeywords: ["付款", "消费", "扣款", "缴费", "支付", "支出"],
    neutralKeywords: ["转账", "提现", "还款"],
    minConfidence: 0.72,
  },
  wechat: {
    source: "wechat",
    name: "微信",
    payType: "微信",
    defaultIndustryType: "微信交易",
    baseWidth: 1200,
    amountArea: [0.72, 0.97],
    titleArea: [0.18, 0.74],
    topIgnoreRatio: 0.09,
    amountPatterns: ["^[+＋\\-−–—]?\\s*[¥￥]?\\s*[0-9,]+(?:\\.[0-9]{1,2})$"],
    datePatterns: [
      "(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})日\\s*(\\d{1,2}:\\d{2})",
      "(?:(\\d{4})[-/年])?(\\d{1,2})[-/月](\\d{1,2})日?\\s*(\\d{1,2}:\\d{2})",
    ],
    monthPatterns: ["(\\d{4})年\\s*(\\d{1,2})月"],
    simpleMonthPatterns: ["^(\\d{1,2})月$"],
    incomeKeywords: ["收款", "转账-来自", "退款", "到账", "收入"],
    expenseKeywords: ["付款", "消费", "缴费", "支出", "扣款"],
    neutralKeywords: ["提现", "转入零钱通", "转出零钱通", "还信用卡", "充值"],
    minConfidence: 0.74,
  },
  meituan: {
    source: "meituan",
    name: "美团月付",
    payType: "美团月付",
    defaultIndustryType: "生活服务",
    baseWidth: 1200,
    amountArea: [0.72, 0.97],
    titleArea: [0.14, 0.78],
    topIgnoreRatio: 0.06,
    amountPatterns: ["^[+＋\\-−–—]?\\s*[¥￥]?\\s*[0-9,]+(?:\\.[0-9]{1,2})$"],
    datePatterns: [
      "(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})日\\s*(\\d{1,2}:\\d{2})?",
      "(?:(\\d{4})[-/年])?(\\d{1,2})[-/月](\\d{1,2})日?\\s*(\\d{1,2}:\\d{2})?",
    ],
    monthPatterns: ["(\\d{4})年\\s*(\\d{1,2})月"],
    simpleMonthPatterns: ["^(\\d{1,2})月$"],
    incomeKeywords: ["退款", "退回", "减免", "还款成功"],
    expenseKeywords: ["消费", "支付", "月付", "账单", "订单"],
    neutralKeywords: ["还款", "分期"],
    minConfidence: 0.7,
  },
};

const RULES_FILE_NAME = "ocr-rules.json";

const cloneRules = (
  rules: Record<ScreenshotBillSource, ScreenshotOcrRule>
): Record<ScreenshotBillSource, ScreenshotOcrRule> =>
  JSON.parse(JSON.stringify(rules));

const getRulesPath = () => {
  const runtimeConfig = useRuntimeConfig();
  const dataPath = String(runtimeConfig.dataPath || process.cwd());
  return path.join(dataPath, RULES_FILE_NAME);
};

const mergeRule = (
  base: ScreenshotOcrRule,
  override: Partial<ScreenshotOcrRule> | undefined
): ScreenshotOcrRule => {
  if (!override) return base;
  return {
    ...base,
    ...override,
    source: base.source,
  };
};

export const getScreenshotOcrRules = async () => {
  const rules = cloneRules(defaultScreenshotOcrRules);
  try {
    const content = await fs.readFile(getRulesPath(), "utf-8");
    const customRules = JSON.parse(content) as Partial<
      Record<ScreenshotBillSource, Partial<ScreenshotOcrRule>>
    >;
    for (const source of screenshotSourceOptions) {
      rules[source] = mergeRule(rules[source], customRules[source]);
    }
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn("[ocr-rules] failed to load custom OCR rules", err);
    }
  }
  return rules;
};

export const getScreenshotOcrRulesFile = () => getRulesPath();

export const saveScreenshotOcrRules = async (rules: unknown) => {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new Error("OCR rules must be a JSON object.");
  }
  const content = JSON.stringify(rules, null, 2);
  const filePath = getRulesPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
};
