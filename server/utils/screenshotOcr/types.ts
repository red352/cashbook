export type ScreenshotBillSource = "alipay" | "wechat" | "meituan";

export interface OcrTextBlock {
  text: string;
  score?: number;
  bbox: [number, number, number, number];
  points?: number[][];
}

export interface ScreenshotOcrRule {
  source: ScreenshotBillSource;
  name: string;
  payType: string;
  defaultIndustryType: string;
  baseWidth: number;
  amountArea: [number, number];
  titleArea: [number, number];
  topIgnoreRatio: number;
  amountPatterns: string[];
  datePatterns: string[];
  monthPatterns: string[];
  simpleMonthPatterns: string[];
  incomeKeywords: string[];
  expenseKeywords: string[];
  neutralKeywords: string[];
  minConfidence: number;
}

export interface ParsedScreenshotFlow {
  day: string;
  flowType: string;
  industryType: string;
  payType: string;
  money: number;
  name: string;
  description: string;
  origin: string;
  confidence: number;
  bbox: [number, number, number, number];
  rawTexts: string[];
  source: ScreenshotBillSource;
}

export interface ScreenshotParseContext {
  source: ScreenshotBillSource;
  year?: number;
  imageWidth?: number;
  imageHeight?: number;
}
