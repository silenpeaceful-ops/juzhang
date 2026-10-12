/**
 * CSV state machine, Chinese header aliases, notification extraction and merchant
 * classification adapted from https://github.com/zyz674/moneybook (MIT).
 * Copyright (c) 2026 zyz674
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Changes here intentionally avoid inferring an expense from a balance, use
 * decimal arithmetic, and retain uncertain cross-channel matches for review.
 */

export type Channel = "wechat" | "alipay" | "bank" | "other";
export type Direction = "expense" | "income" | "transfer";
export type EntryType = "manual" | "notification" | "statement";
export type Transaction = {
  id: string;
  occurredAt: string;
  day: string;
  amountCents: number;
  direction: Direction;
  channel: Channel;
  merchant: string;
  category: string;
  paymentMethod: string;
  rawText: string;
  externalId: string;
  entryType: EntryType;
  status: "confirmed" | "review" | "deleted";
  reviewReason?: string;
  duplicateOf?: string;
};
export type Settings = {
  dailyTime: string;
  pushEnabled: boolean;
  provider: "serverchan" | "pushplus" | "wecom";
  providerConfigured: boolean;
  monthlyBudgetCents: number;
};
export const defaultSettings: Settings = {
  dailyTime: "21:00", pushEnabled: false, provider: "serverchan",
  providerConfigured: false, monthlyBudgetCents: 0,
};
export const channelLabels: Record<Channel, string> = {
  wechat: "微信", alipay: "支付宝", bank: "银行卡", other: "其他",
};

/** Strict yuan-to-cents conversion; no float multiplication or truncation. */
export function parseMoneyCents(value: string | number): number | null {
  const text = String(value).normalize("NFKC").trim()
    .replace(/人民币|RMB|CNY/gi, "").replace(/[¥￥元,\s]/g, "").replace(/[−—]/g, "-");
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return match[1] === "-" ? -cents : cents;
}
export function formatMoneyCents(cents: number): string {
  const amount = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? "-" : ""}${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

function norm(text: string): string {
  return text.normalize("NFKC").replace(/[\s\u200b\uFEFF]/g, "").toLowerCase();
}
function stableHash(text: string): string {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}
function chinaISO(date: Date): string {
  return `${new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19)}+08:00`;
}
function normalizeDate(value: string): string | null {
  const text = value.normalize("NFKC").trim().replace(/年|月/g, "-").replace(/日/g, " ")
    .replace(/\//g, "-").replace(/\s+/g, " ").trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : chinaISO(date);
  }
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map((x) => Number(x || 0));
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d ||
    utc.getUTCHours() !== h || utc.getUTCMinutes() !== mi || utc.getUTCSeconds() !== s) return null;
  return `${utc.toISOString().slice(0, 19)}+08:00`;
}

function detectChannel(text: string): Channel {
  // A bank SMS can mention WeChat/Alipay as its payment rail. Its source remains bank.
  // Likewise a wallet receipt can mention a bank card without changing its source.
  const start = text.replace(/^[\s【\[]+/, "");
  if (/^微信(?:支付)?/.test(start)) return "wechat";
  if (/^支付宝/.test(start)) return "alipay";
  if (/银行|信用卡|储蓄卡|借记卡|尾号|招商|工商|建设|农业|邮储|中信|浦发|民生|光大|兴业|广发/.test(text)) return "bank";
  if (/支付宝|花呗/.test(text)) return "alipay";
  if (/微信|零钱/.test(text)) return "wechat";
  return "other";
}
const categoryRules: [string, RegExp][] = [
  ["餐饮", /餐饮|餐厅|外卖|早餐|午餐|晚餐|咖啡|奶茶|肯德基|麦当劳|瑞幸|星巴克|喜茶|蜜雪|饿了么|美团|拉面|饭店|食堂/],
  ["交通", /滴滴|高德打车|出租车|地铁|公交|12306|铁路|火车|航空|机票|停车|加油|中石化|中石油|出行/],
  ["购物", /淘宝|天猫|京东|拼多多|超市|便利店|盒马|山姆|服装|购物|数码|商城/],
  ["生活", /房租|物业|水费|电费|燃气|话费|宽带|通信|通讯|日用/],
  ["娱乐", /电影|影院|游戏|会员|爱奇艺|腾讯视频|哔哩哔哩|音乐|娱乐/],
  ["医疗", /医院|诊所|药店|药房|医疗|体检/],
  ["教育", /书店|课程|学费|培训|教育|学校/],
  ["旅行", /酒店|宾馆|民宿|旅游|景区|携程|飞猪/],
];
export function classifyTransaction(text: string, direction: Direction): string {
  if (direction === "transfer") return "账户转移";
  if (direction === "income") return /退款|退回|退还/.test(text) ? "退款" : /工资|薪资|奖金/.test(text) ? "工资" : "其他收入";
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || "其他";
}
const failedPattern = /支付失败|交易失败|交易关闭|已关闭|已取消|已撤销|已作废|扣款失败|付款失败/;
const transferPattern = /信用卡还款|花呗还款|借呗还款|还花呗|向本人|向自己|本人账户|自己账户|本人转账|账户间转账|转入零钱|零钱充值|充值到零钱|余额充值|支付宝充值|微信零钱充值|(?:^|[:： ，])充值(?:成功)?|提现|零钱提现|转到银行卡/;
const refundPattern = /退款(?:成功|到账)|已退款|已退回|已退还|全额退款|退款收入/;
function inferDirection(text: string): { direction?: Direction; reviewReason?: string } {
  if (/退款申请|退款中|等待退款|退款处理中/.test(text) && !refundPattern.test(text)) return { direction: "expense", reviewReason: "退款尚未到账，请核对交易状态" };
  if (refundPattern.test(text)) return { direction: "income" };
  if (transferPattern.test(text)) return { direction: "transfer" };
  if (/退款申请|退款中|部分退款/.test(text)) return { direction: "expense", reviewReason: "退款金额或状态需要核对" };
  if (/转账/.test(text)) return { direction: "expense", reviewReason: "转账用途需要确认，可能是消费或账户转移" };
  // Strip app names so the word 支付 in 微信支付 does not imply a transaction.
  const core = text.replace(/微信支付|支付宝|云闪付/g, "");
  if (/收入|收款(?:成功|到账)|已收款|收到.*(?:元|¥|￥)|工资|薪资|奖金|退款|转入.*(?:元|¥|￥)|入账/.test(core)) return { direction: "income" };
  if (/消费|支出|已支付|已付款|支付成功|付款成功|扣款|扣费|代扣|缴费成功|向.+(?:付款|支付)|支付了/.test(core)) return { direction: "expense" };
  return {};
}
function extractAmount(text: string): number | null {
  // Balances/credit limits are never evidence of a transaction amount.
  const core = text.replace(/(?:可用)?(?:余额|额度)\s*[:：]?\s*(?:人民币|RMB|CNY)?\s*[¥￥]?\s*[\d,]+(?:\.\d+)?\s*元?/gi, "");
  const patterns = [
    /(?:消费|支出|扣款|扣费|代扣|入账|到账|已支付|已付款|付款成功|支付成功|收款|退款|提现|充值|转账|转入|金额)\s*(?:人民币|RMB|CNY)?\s*[:：]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)(?![\d.])\s*(?:元|人民币)?/i,
    /[¥￥]\s*([\d,]+(?:\.\d{1,2})?)(?![\d.])/,
    /([\d,]+(?:\.\d{1,2})?)(?![\d.])\s*元/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(core);
    if (match) {
      const cents = parseMoneyCents(match[1]);
      if (cents !== null && cents > 0) return cents;
    }
  }
  return null;
}
function extractMerchant(text: string): string {
  const patterns = [
    /(?:商户|商家|收款方|付款方|交易对方)\s*[:：]\s*([^\n,，。;；]{1,40})/,
    /(?:向|给)\s*([^\s,，。;；:：]{1,32}?)\s*(?:支付|付款|转账)/,
    /在\s*([^\s,，。;；:：]{1,32}?)\s*(?:消费|支付|购买|付款)/,
    /微信支付\s*[-—·]\s*([^\n,，。;；]{1,32})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1].replace(/\s*(?:金额|支付金额|¥|￥).*$/, "").trim();
  }
  return "待补充商户";
}
function paymentMethod(text: string): string {
  return /(零钱通|零钱|余额宝|花呗|信用卡|储蓄卡|银行卡|微信支付|支付宝|云闪付)/.exec(text)?.[1] || "";
}
function makeTransaction(input: Omit<Transaction, "id" | "day" | "category" | "status"> & {
  category?: string; reviewReason?: string;
}): Transaction {
  // A payment order can have multiple refunds. An order ID identifies the
  // purchase, not necessarily a unique refund event. Keep amount and refund
  // occurrence in the key so INSERT OR IGNORE cannot silently drop a refund.
  const refundEvent = input.direction === "income" && /退款|退回|退还/.test(input.rawText);
  const identity = input.externalId ? `${input.channel}|order|${input.externalId}|${input.direction}|${input.amountCents}${refundEvent ? `|refund|${input.occurredAt}` : ""}`
    : `${input.channel}|${input.entryType}|${input.occurredAt}|${input.amountCents}|${input.direction}|${norm(input.rawText)}`;
  return { ...input, id: `tx_${stableHash(identity)}`, day: input.occurredAt.slice(0, 10),
    category: input.category || classifyTransaction(`${input.merchant} ${input.rawText}`, input.direction),
    status: input.reviewReason ? "review" : "confirmed" };
}

export function parseNotification(text: string, opts: {
  channel?: Channel; occurredAt?: string; entryType?: EntryType;
} = {}): { transaction?: Transaction; ignored?: boolean; reason?: string } {
  const rawText = String(text || "").normalize("NFKC").trim();
  if (!rawText) return { reason: "请输入支付通知或银行短信" };
  if (/验证码|登录验证|动态密码/.test(rawText) || failedPattern.test(rawText)) return { ignored: true, reason: "已忽略验证码或失败交易" };
  const inferred = inferDirection(rawText);
  if (!inferred.direction) return { ignored: true, reason: "没有明确的收支事件，余额不会计为消费" };
  if (/优惠券|抽奖|邀请|促销|限时|立减|最高返|额度提升/.test(rawText) &&
      !/已支付|支付成功|付款成功|消费|支出|扣款|到账|入账|退款成功/.test(rawText)) return { ignored: true, reason: "已忽略推广信息" };
  const amountCents = extractAmount(rawText);
  if (!amountCents) return { reason: "未找到明确的交易金额，请手动补录" };
  const embeddedTime = /\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?/.exec(rawText)?.[0];
  const occurredAt = normalizeDate(opts.occurredAt || embeddedTime || chinaISO(new Date()));
  if (!occurredAt) return { reason: "交易时间格式无效" };
  const channel = opts.channel || detectChannel(rawText);
  const externalId = /(?:退款订单号|退款单号|退款流水号)\s*[:：]?\s*([A-Za-z0-9_-]{4,})/.exec(rawText)?.[1]
    || /(?:交易订单号|交易单号|交易号|订单号|流水号)\s*[:：]?\s*([A-Za-z0-9_-]{4,})/.exec(rawText)?.[1] || "";
  return { transaction: makeTransaction({ occurredAt, amountCents, direction: inferred.direction,
    channel, merchant: extractMerchant(rawText), paymentMethod: paymentMethod(rawText), rawText,
    externalId, entryType: opts.entryType || "notification", reviewReason: inferred.reviewReason }) };
}

const headerAliases: Record<string, string[]> = {
  time: ["交易时间", "付款时间", "交易创建时间", "创建时间", "交易日期", "记账日期", "时间", "日期", "occurredAt", "datetime", "date"],
  merchant: ["交易对方", "商户名称", "对方名称", "收款方", "付款方", "对方", "商户", "merchant"],
  item: ["商品说明", "商品名称", "交易说明", "摘要", "用途", "商品", "说明"],
  direction: ["收/支", "收支", "资金方向", "借贷标志", "收付标志", "direction"],
  amount: ["金额(元)", "交易金额", "发生金额", "发生额", "金额", "amount"],
  debit: ["支出金额", "借方发生额", "借方金额", "支出"],
  credit: ["收入金额", "贷方发生额", "贷方金额", "收入"],
  method: ["收/付款方式", "收付款方式", "付款方式", "支付方式", "交易方式", "paymentMethod"],
  status: ["交易状态", "当前状态", "交易结果", "状态", "status"],
  externalId: ["交易订单号", "交易单号", "交易号", "订单号", "流水号", "externalId"],
  category: ["交易分类", "交易类型", "交易场景", "分类", "category"],
  channel: ["渠道", "支付渠道", "channel"],
};
function headerNorm(text: string): string { return norm(text).replace(/[()（）/]/g, ""); }
function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field.trim()); field = ""; }
    else if (c === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请重新导出账单");
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}
function fieldValue(row: string[], map: Record<string, number>, field: string): string {
  const value = row[map[field]]?.replace(/^[\uFEFF\s'`]+|[\u200b\s]+$/g, "") || "";
  return /^(?:-|\/|--|null|None)$/i.test(value) ? "" : value;
}
function statementDirection(value: string): Direction | undefined {
  const text = norm(value);
  if (/不计收支|转账|transfer|neutral/.test(text)) return "transfer";
  if (/^(?:支出|支|借|借方|debit|expense|out|d)$/.test(text)) return "expense";
  if (/^(?:收入|收|贷|贷方|credit|income|in|c)$/.test(text)) return "income";
  return undefined;
}
export function parseStatementCSV(text: string, channel?: Channel): {
  transactions: Transaction[]; skipped: number; errors: string[];
} {
  const transactions: Transaction[] = [], errors: string[] = []; let skipped = 0;
  if (!text.trim()) return { transactions, skipped, errors: ["账单文件为空"] };
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sample = clean.split("\n").slice(0, 40).join("\n");
  const delimiter = sample.split("\t").length > sample.split(",").length ? "\t" : ",";
  let rows: string[][];
  try { rows = parseCSV(clean, delimiter); }
  catch (error) { return { transactions, skipped, errors: [(error as Error).message] }; }
  let header = -1, mapping: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const next: Record<string, number> = {}, cells = rows[i].map(headerNorm);
    for (const [field, aliases] of Object.entries(headerAliases)) {
      const index = cells.findIndex((cell) => aliases.some((alias) => cell === headerNorm(alias)));
      if (index >= 0) next[field] = index;
    }
    if (next.time !== undefined && (next.amount !== undefined || next.debit !== undefined || next.credit !== undefined)) {
      header = i; mapping = next; break;
    }
  }
  if (header < 0) return { transactions, skipped, errors: ["未识别到日期和金额表头；请使用微信、支付宝或银行导出的 CSV"] };
  const source = channel || (/微信支付账单|微信昵称/.test(clean.slice(0, 2000)) ||
      (rows[header].includes("交易单号") && rows[header].includes("当前状态")) ? "wechat"
    : /支付宝/.test(clean.slice(0, 2000)) || rows[header].includes("交易订单号") ? "alipay" : "bank");
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.filter(Boolean).length <= 1 || /^[-=—\s]+$/.test(row.join(""))) continue;
    const rawText = row.join(" | ");
    const status = fieldValue(row, mapping, "status");
    if (failedPattern.test(status)) { skipped++; continue; }
    const occurredAt = normalizeDate(fieldValue(row, mapping, "time"));
    let cents = parseMoneyCents(fieldValue(row, mapping, "amount"));
    let direction = statementDirection(fieldValue(row, mapping, "direction"));
    if (cents === null) {
      const debit = parseMoneyCents(fieldValue(row, mapping, "debit"));
      const credit = parseMoneyCents(fieldValue(row, mapping, "credit"));
      if (debit !== null && debit !== 0 && credit !== null && credit !== 0) {
        skipped++; errors.push(`第 ${i + 1} 行同时存在收入和支出，请核对`); continue;
      }
      if (debit) { cents = Math.abs(debit); direction = "expense"; }
      else if (credit) { cents = Math.abs(credit); direction = "income"; }
    }
    if (!occurredAt || cents === null || cents === 0) {
      skipped++; errors.push(`第 ${i + 1} 行的${!occurredAt ? "日期" : "金额"}无效，未计入`); continue;
    }
    const description = `${fieldValue(row, mapping, "category")} ${fieldValue(row, mapping, "item")} ${status}`;
    let reviewReason: string | undefined = /待核对|待确认|^review$/.test(status) ? "导入的记录尚未确认，请核对" : undefined;
    if (refundPattern.test(description)) direction = "income";
    else if (transferPattern.test(description) || /^(?:充值|提现|还款)$/.test(fieldValue(row, mapping, "category"))) direction = "transfer";
    else if (/部分退款/.test(status)) reviewReason = "部分退款金额需要核对";
    if (!direction && cents < 0) direction = "expense";
    if (!direction) { direction = "expense"; reviewReason = "没有明确的收支方向，请核对"; }
    if (/转账/.test(description) && direction !== "transfer") reviewReason = "转账用途需要确认";
    const merchant = fieldValue(row, mapping, "merchant") || fieldValue(row, mapping, "item") || "待补充商户";
    const channelText = fieldValue(row, mapping, "channel");
    const rowChannel: Channel = /^(?:微信|微信支付|wechat)$/.test(channelText) ? "wechat" :
      /^(?:支付宝|alipay)$/.test(channelText) ? "alipay" : /^(?:银行|银行卡|bank)$/.test(channelText) ? "bank" :
      /^(?:其他|other)$/.test(channelText) ? "other" : source;
    const categoryHeader = mapping.category === undefined ? "" : headerNorm(rows[header][mapping.category]);
    const explicitCategory = categoryHeader === "分类" || categoryHeader === "category"
      ? fieldValue(row, mapping, "category") : undefined;
    transactions.push(makeTransaction({ occurredAt, amountCents: Math.abs(cents), direction, channel: rowChannel,
      merchant, category: explicitCategory, paymentMethod: fieldValue(row, mapping, "method"), rawText,
      externalId: fieldValue(row, mapping, "externalId"), entryType: "statement", reviewReason }));
  }
  return { transactions, skipped, errors };
}

export function detectDuplicate(incoming: Transaction, existing: Transaction[]): {
  duplicate: boolean; review: boolean; reason?: string; duplicateOf?: string;
} {
  const candidates = existing.filter((transaction) => transaction.status !== "deleted");
  let orderConflict: { reason: string; duplicateOf: string } | undefined;
  for (const previous of candidates) {
    if (incoming.channel === previous.channel && incoming.externalId &&
        incoming.externalId === previous.externalId && incoming.direction === previous.direction) {
      if (incoming.amountCents !== previous.amountCents) {
        orderConflict ||= { reason: "同一订单出现不同金额，保留记录等待核对消费或退款", duplicateOf: previous.id };
        continue;
      }
      const isRefund = incoming.direction === "income" && /退款|退回|退还/.test(`${incoming.rawText} ${previous.rawText}`);
      const reliableRefundId = (text: string) => /(?:退款订单号|退款单号|退款流水号)\s*[:：]?\s*([A-Za-z0-9_-]{4,})/.exec(text)?.[1];
      const incomingRefundId = reliableRefundId(incoming.rawText);
      const previousRefundId = reliableRefundId(previous.rawText);
      if (isRefund && incoming.occurredAt !== previous.occurredAt &&
          !(incomingRefundId && incomingRefundId === previousRefundId)) {
        orderConflict ||= { reason: "同一订单在不同时间发生退款，保留记录等待核对是否为多次退款", duplicateOf: previous.id };
        continue;
      }
      return { duplicate: true, review: false, reason: "同一来源、同一事件的订单或重复提交", duplicateOf: previous.id };
    }
    if (incoming.id === previous.id) {
      return { duplicate: true, review: false, reason: "相同记录的重复提交", duplicateOf: previous.id };
    }
    if (incoming.channel === previous.channel && incoming.entryType === previous.entryType &&
        incoming.entryType !== "manual" && incoming.occurredAt === previous.occurredAt &&
        incoming.amountCents === previous.amountCents && incoming.direction === previous.direction &&
        norm(incoming.rawText) && norm(incoming.rawText) === norm(previous.rawText)) {
      return { duplicate: true, review: false, reason: "相同事件时间与原文的重试", duplicateOf: previous.id };
    }
  }
  if (orderConflict) return { duplicate: false, review: true, ...orderConflict };
  for (const previous of candidates) {
    if (incoming.channel === previous.channel || incoming.amountCents !== previous.amountCents ||
        incoming.direction !== previous.direction || incoming.direction === "transfer") continue;
    const distance = Math.abs(Date.parse(incoming.occurredAt) - Date.parse(previous.occurredAt));
    if (!Number.isFinite(distance) || distance > 120000) continue;
    const sameMerchant = incoming.merchant !== "待补充商户" && norm(incoming.merchant) === norm(previous.merchant);
    const bankWalletPair = [incoming.channel, previous.channel].includes("bank") &&
      [incoming.channel, previous.channel].some((source) => source === "wechat" || source === "alipay");
    if (sameMerchant || bankWalletPair || (incoming.externalId && incoming.externalId === previous.externalId)) {
      return { duplicate: false, review: true, duplicateOf: previous.id,
        reason: "不同渠道在相近时间出现同额交易，保留记录等待确认是否为同一笔" };
    }
  }
  return { duplicate: false, review: false };
}

export type ReportGroup = { key: string; label: string; amountCents: number; count: number };
export function buildDailyReport(transactions: Transaction[], date: string): {
  title: string; content: string; totals: { expenseCents: number; incomeCents: number; count: number };
  byChannel: ReportGroup[]; byCategory: ReportGroup[]; transactions: Transaction[];
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !normalizeDate(date)) throw new Error("日报日期无效");
  const confirmed = transactions.filter((tx) => tx.day === date && tx.status === "confirmed")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const expenses = confirmed.filter((tx) => tx.direction === "expense");
  const incomes = confirmed.filter((tx) => tx.direction === "income");
  const sum = (list: Transaction[]) => list.reduce((total, tx) => total + tx.amountCents, 0);
  const totals = { expenseCents: sum(expenses), incomeCents: sum(incomes), count: expenses.length + incomes.length };
  const aggregate = (key: "channel" | "category"): ReportGroup[] => {
    const groups = new Map<string, ReportGroup>();
    for (const tx of expenses) {
      const value = tx[key];
      const group = groups.get(value) || { key: value, label: key === "channel" ? channelLabels[value as Channel] : value, amountCents: 0, count: 0 };
      group.amountCents += tx.amountCents; group.count++; groups.set(value, group);
    }
    return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents || a.key.localeCompare(b.key));
  };
  const byChannel = aggregate("channel"), byCategory = aggregate("category");
  const lines = [`${date} 消费清单`, `支出 ¥${formatMoneyCents(totals.expenseCents)} · ${expenses.length} 笔`,
    `收入 ¥${formatMoneyCents(totals.incomeCents)} · ${incomes.length} 笔`, "", "逐笔明细"];
  for (const tx of confirmed) {
    const sign = tx.direction === "expense" ? "支出" : tx.direction === "income" ? "收入" : "账户转移（不计消费）";
    lines.push(`${tx.occurredAt.slice(11, 16)} ${tx.merchant} · ${sign} ¥${formatMoneyCents(tx.amountCents)} · ${channelLabels[tx.channel]} · ${tx.category}`);
  }
  if (!confirmed.length) lines.push("今天暂无已确认的消费记录");
  if (byChannel.length) lines.push("", "渠道汇总", ...byChannel.map((group) => `${group.label} ¥${formatMoneyCents(group.amountCents)} · ${group.count} 笔`));
  if (byCategory.length) lines.push("", "分类汇总", ...byCategory.map((group) => `${group.label} ¥${formatMoneyCents(group.amountCents)} · ${group.count} 笔`));
  const reviewCount = transactions.filter((tx) => tx.day === date && tx.status === "review").length;
  if (reviewCount) lines.push("", `另有 ${reviewCount} 笔待确认记录，暂未计入金额`);
  return { title: `${date} 消费清单 · ¥${formatMoneyCents(totals.expenseCents)}`,
    content: lines.join("\n"), totals, byChannel, byCategory, transactions: confirmed };
}
