import type {
  OcrTextBlock,
  ParsedScreenshotFlow,
  ScreenshotOcrRule,
  ScreenshotParseContext,
} from "./types";

type PositionedBlock = OcrTextBlock & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  height: number;
  width: number;
};

type MonthAnchor = {
  y: number;
  year?: number;
  month: number;
};

type DateAnchor = {
  y: number;
  text: string;
  day: string;
  block: PositionedBlock;
};

type MoneyInfo = {
  amount: number;
  sign: number;
};

type AmountCandidate = {
  block: PositionedBlock;
  money: MoneyInfo;
  inlineTitle?: string;
};

const normalizeText = (text: string) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[￥]/g, "¥")
    .trim();

const compilePatterns = (patterns: string[]) =>
  patterns.map((pattern) => new RegExp(pattern, "i"));

const escapeHyphen = (value: string) =>
  value.replace(/[−–—]/g, "-").replace(/[＋]/g, "+");

const parseMoney = (text: string): MoneyInfo | null => {
  const normalized = escapeHyphen(normalizeText(text))
    .replace(/[¥￥,\s]/g, "")
    .trim();
  const match = normalized.match(/^([+-]?)(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;
  const sign = match[1] === "+" ? 1 : match[1] === "-" ? -1 : 0;
  return {
    amount: Number(match[2]),
    sign,
  };
};

const parseTrailingMoney = (text: string) => {
  const normalized = escapeHyphen(normalizeText(text));
  const match = normalized.match(/([+-]?)\s*[¥￥]?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*$/);
  if (!match || match.index === undefined) return null;
  const money = parseMoney(`${match[1] || ""}${match[2]}`);
  if (!money) return null;
  const title = normalized
    .slice(0, match.index)
    .replace(/[·.\s:：,，、-]+$/g, "")
    .trim();
  if (!title || title.length < 2) return null;
  return { money, title };
};

const toBlocks = (blocks: OcrTextBlock[]) =>
  blocks
    .map((block) => {
      const [x1, y1, x2, y2] = block.bbox;
      return {
        ...block,
        text: normalizeText(block.text),
        x1,
        y1,
        x2,
        y2,
        cx: (x1 + x2) / 2,
        cy: (y1 + y2) / 2,
        height: Math.max(1, y2 - y1),
        width: Math.max(1, x2 - x1),
      };
    })
    .filter((block) => block.text);

const median = (values: number[]) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 24;
  return sorted[Math.floor(sorted.length / 2)];
};

const unionBbox = (blocks: PositionedBlock[]): [number, number, number, number] => {
  return [
    Math.min(...blocks.map((b) => b.x1)),
    Math.min(...blocks.map((b) => b.y1)),
    Math.max(...blocks.map((b) => b.x2)),
    Math.max(...blocks.map((b) => b.y2)),
  ];
};

const buildDate = (
  year: number,
  month: number,
  day: number
): string | null => {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
};

const parseDateText = (
  text: string,
  rule: ScreenshotOcrRule,
  fallbackYear: number,
  monthAnchor?: MonthAnchor
) => {
  for (const pattern of compilePatterns(rule.datePatterns)) {
    const match = text.match(pattern);
    if (!match) continue;
    const first = match[1] ? Number(match[1]) : undefined;
    const second = Number(match[2]);
    const third = Number(match[3]);
    const fourth = Number(match[4]);

    let year = fallbackYear;
    let month = second;
    let day = third;

    if (first && first > 1900) {
      year = first;
    } else if (first && first <= 12 && !Number.isNaN(fourth)) {
      month = first;
      day = second;
    }

    if (monthAnchor?.year && !match[1]) {
      year = monthAnchor.year;
    }

    return buildDate(year, month, day);
  }
  return null;
};

const parseBlockDate = (
  block: PositionedBlock,
  rule: ScreenshotOcrRule,
  fallbackYear: number,
  monthAnchor?: MonthAnchor
) => parseDateText(block.text, rule, fallbackYear, monthAnchor);

const isMonthHeader = (text: string, rule: ScreenshotOcrRule) => {
  const patterns = [
    ...compilePatterns(rule.monthPatterns),
    ...compilePatterns(rule.simpleMonthPatterns),
  ];
  return patterns.some((pattern) => pattern.test(text));
};

const findMonthAnchors = (
  blocks: PositionedBlock[],
  rule: ScreenshotOcrRule,
  defaultYear: number
): MonthAnchor[] => {
  const anchors: MonthAnchor[] = [];
  for (const block of blocks) {
    for (const pattern of compilePatterns(rule.monthPatterns)) {
      const match = block.text.match(pattern);
      if (match) {
        anchors.push({
          y: block.cy,
          year: Number(match[1]) || defaultYear,
          month: Number(match[2]),
        });
      }
    }
    for (const pattern of compilePatterns(rule.simpleMonthPatterns)) {
      const match = block.text.match(pattern);
      if (match) {
        anchors.push({
          y: block.cy,
          year: defaultYear,
          month: Number(match[1]),
        });
      }
    }
  }
  return anchors
    .filter((anchor) => anchor.month >= 1 && anchor.month <= 12)
    .sort((a, b) => a.y - b.y);
};

const getNearestMonthAnchor = (anchors: MonthAnchor[], y: number) => {
  let matched: MonthAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.y <= y) matched = anchor;
    if (anchor.y > y) break;
  }
  return matched;
};

const findDateAnchors = (
  blocks: PositionedBlock[],
  rule: ScreenshotOcrRule,
  monthAnchors: MonthAnchor[],
  defaultYear: number
): DateAnchor[] => {
  const anchors: DateAnchor[] = [];
  for (const block of blocks) {
    const monthAnchor = getNearestMonthAnchor(monthAnchors, block.cy);
    const day = parseBlockDate(block, rule, monthAnchor?.year || defaultYear, monthAnchor);
    if (!day) continue;
    anchors.push({
      y: block.cy,
      text: block.text,
      day,
      block,
    });
  }
  return anchors.sort((a, b) => a.y - b.y);
};

const getNearestDateAnchor = (anchors: DateAnchor[], y: number) => {
  let matched: DateAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.y <= y) matched = anchor;
    if (anchor.y > y) break;
  }
  return matched;
};

const containsKeyword = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const inferFlowType = (
  text: string,
  sign: number,
  rule: ScreenshotOcrRule
) => {
  if (sign > 0) return "收入";
  if (sign < 0) return "支出";
  if (containsKeyword(text, rule.neutralKeywords)) return "不计收支";
  if (containsKeyword(text, rule.incomeKeywords)) return "收入";
  if (containsKeyword(text, rule.expenseKeywords)) return "支出";
  return rule.source === "alipay" ? "收入" : "支出";
};

const groupLineTexts = (blocks: PositionedBlock[], lineTolerance: number) => {
  const sorted = [...blocks].sort((a, b) => a.cy - b.cy || a.x1 - b.x1);
  const lines: PositionedBlock[][] = [];
  for (const block of sorted) {
    const line = lines.find(
      (items) => Math.abs(median(items.map((item) => item.cy)) - block.cy) <= lineTolerance
    );
    if (line) {
      line.push(block);
    } else {
      lines.push([block]);
    }
  }
  return lines.map((line) => {
    const deduped: PositionedBlock[] = [];
    for (const block of [...line].sort((a, b) => a.x1 - b.x1)) {
      const overlappedIndex = deduped.findIndex((item) => {
        const overlap = Math.max(
          0,
          Math.min(item.x2, block.x2) - Math.max(item.x1, block.x1)
        );
        return overlap / Math.min(item.width, block.width) > 0.65;
      });
      if (overlappedIndex >= 0) {
        if ((block.score || 0) > (deduped[overlappedIndex].score || 0)) {
          deduped[overlappedIndex] = block;
        }
      } else {
        deduped.push(block);
      }
    }
    return deduped
      .sort((a, b) => a.x1 - b.x1)
      .map((block) => block.text)
      .join("")
      .trim();
  });
};

const collectAmountCandidates = (
  blocks: PositionedBlock[],
  rule: ScreenshotOcrRule,
  imageWidth: number,
  imageHeight: number,
  lineHeight: number
): AmountCandidate[] => {
  const amountPatterns = compilePatterns(rule.amountPatterns);
  const topIgnoreY = Math.min(imageHeight * rule.topIgnoreRatio, 520);
  const candidates = blocks
    .map((block) => {
      const fullMoney = parseMoney(block.text);
      const centerRatio = block.cx / imageWidth;
      if (
        fullMoney &&
        amountPatterns.some((pattern) => pattern.test(block.text)) &&
        centerRatio >= rule.amountArea[0] &&
        centerRatio <= rule.amountArea[1]
      ) {
        return { block, money: fullMoney };
      }

      const trailing = parseTrailingMoney(block.text);
      const rightRatio = block.x2 / imageWidth;
      const leftRatio = block.x1 / imageWidth;
      if (
        trailing &&
        rightRatio >= rule.amountArea[0] &&
        leftRatio <= rule.titleArea[1]
      ) {
        return {
          block,
          money: trailing.money,
          inlineTitle: trailing.title,
        };
      }

      return null;
    })
    .filter((item): item is AmountCandidate => Boolean(item))
    .filter((item) => item.block.cy > topIgnoreY)
    .sort((a, b) => a.block.cy - b.block.cy);

  const deduped: AmountCandidate[] = [];
  for (const candidate of candidates) {
    const duplicated = deduped.some(
      (item) =>
        Math.abs(item.block.cy - candidate.block.cy) <= lineHeight * 0.9 &&
        Math.abs(item.money.amount - candidate.money.amount) < 0.001 &&
        item.money.sign === candidate.money.sign &&
        (item.inlineTitle || item.block.text) ===
          (candidate.inlineTitle || candidate.block.text)
    );
    if (!duplicated) deduped.push(candidate);
  }
  return deduped;
};

const pickRowDateBlock = (
  rowBlocks: PositionedBlock[],
  rule: ScreenshotOcrRule,
  amountBlock: PositionedBlock,
  lineHeight: number
) => {
  const dateBlocks = rowBlocks.filter((block) =>
    rule.datePatterns.some((pattern) => new RegExp(pattern, "i").test(block.text))
  );
  if (dateBlocks.length === 0) return undefined;

  if (rule.source !== "meituan") {
    return dateBlocks[0];
  }

  return dateBlocks
    .filter(
      (block) =>
        block.cy <= amountBlock.cy + lineHeight * 0.5 &&
        amountBlock.cy - block.cy <= lineHeight * 8
    )
    .sort((a, b) => b.cy - a.cy)[0];
};

export const parseScreenshotFlows = (
  ocrBlocks: OcrTextBlock[],
  rule: ScreenshotOcrRule,
  context: ScreenshotParseContext
): ParsedScreenshotFlow[] => {
  const blocks = toBlocks(ocrBlocks);
  const imageWidth =
    context.imageWidth ||
    Math.max(...blocks.map((block) => block.x2), rule.baseWidth);
  const imageHeight =
    context.imageHeight || Math.max(...blocks.map((block) => block.y2), 1);
  const defaultYear =
    context.year && context.year > 1900 ? context.year : new Date().getFullYear();
  const lineHeight = median(blocks.map((block) => block.height));
  const monthAnchors = findMonthAnchors(blocks, rule, defaultYear);
  const dateAnchors = findDateAnchors(blocks, rule, monthAnchors, defaultYear);
  const amountCandidates = collectAmountCandidates(
    blocks,
    rule,
    imageWidth,
    imageHeight,
    lineHeight
  );

  const flows: ParsedScreenshotFlow[] = [];

  for (let i = 0; i < amountCandidates.length; i++) {
    const amountItem = amountCandidates[i];
    const prev = amountCandidates[i - 1]?.block;
    const next = amountCandidates[i + 1]?.block;
    const top = prev
      ? (prev.cy + amountItem.block.cy) / 2
      : amountItem.block.cy - lineHeight * 5;
    const bottom = next
      ? (next.cy + amountItem.block.cy) / 2
      : amountItem.block.cy + lineHeight * 5;
    const rowBlocks = blocks.filter(
      (block) =>
        block.cy >= top &&
        block.cy < bottom &&
        !isMonthHeader(block.text, rule)
    );

    const monthAnchor = getNearestMonthAnchor(monthAnchors, amountItem.block.cy);
    const dateBlock = pickRowDateBlock(
      rowBlocks,
      rule,
      amountItem.block,
      lineHeight
    );
    const dateAnchor = dateBlock
      ? undefined
      : getNearestDateAnchor(dateAnchors, amountItem.block.cy);
    if (!dateBlock && !dateAnchor) continue;

    const day = parseDateText(
      dateBlock?.text || dateAnchor!.text,
      rule,
      monthAnchor?.year || defaultYear,
      monthAnchor
    );
    if (!day) continue;

    const titleBlocks = rowBlocks.filter((block) => {
      const xRatio = block.cx / imageWidth;
      return (
        block !== amountItem.block &&
        block !== dateBlock &&
        block !== dateAnchor?.block &&
        xRatio >= rule.titleArea[0] &&
        xRatio <= rule.titleArea[1] &&
        !parseMoney(block.text)
      );
    });

    const lineTexts = [
      ...(amountItem.inlineTitle ? [amountItem.inlineTitle] : []),
      ...groupLineTexts(titleBlocks, Math.max(10, lineHeight * 0.7)),
    ];
    const dateTexts = [dateBlock?.text, dateAnchor?.text].filter(Boolean) as string[];
    const title =
      lineTexts.find(
        (line) =>
          line &&
          dateTexts.every((dateText) => !line.includes(dateText))
      ) || "";
    if (!title || title.length < 2) continue;

    const rawText = rowBlocks
      .sort((a, b) => a.cy - b.cy || a.x1 - b.x1)
      .map((block) => block.text)
      .join(" ");
    const money = amountItem.money!;
    const flowType = inferFlowType(rawText, money.sign, rule);
    const confidence =
      Math.round(
        Math.min(
          0.99,
          (amountItem.block.score || 0.8) * 0.35 +
            ((dateBlock || dateAnchor?.block)?.score || 0.8) * 0.25 +
            0.25 +
            (money.sign !== 0 ? 0.1 : 0.04)
        ) * 100
      ) / 100;

    const descriptionParts = [
      dateBlock?.text || dateAnchor!.text,
      ...lineTexts.filter((line) => line && line !== title).slice(0, 2),
      `${rule.name}截图识别`,
    ];

    flows.push({
      day,
      flowType,
      industryType: rule.defaultIndustryType,
      payType: rule.payType,
      money: Math.abs(money.amount),
      name: title,
      description: descriptionParts.join(" | "),
      origin: `${rule.name}截图导入`,
      confidence,
      bbox: unionBbox(rowBlocks.length > 0 ? rowBlocks : [amountItem.block]),
      rawTexts: rowBlocks.map((block) => block.text),
      source: rule.source,
    });
  }

  return flows;
};
