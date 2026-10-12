import assert from "node:assert/strict";
// @ts-ignore Node's strip-types runner requires the source extension.
import { parseMoneyCents, parseNotification, parseStatementCSV, detectDuplicate, buildDailyReport } from "../lib/ledger-domain.ts";
import type { Transaction } from "../lib/ledger-domain";

const occurredAt = "2026-10-12T12:30:00+08:00";
function transaction(text: string, time = occurredAt): Transaction {
  const result = parseNotification(text, { occurredAt: time });
  assert.ok(result.transaction, result.reason || text);
  return result.transaction;
}

assert.equal(parseMoneyCents("¥1,234.56"), 123456);
assert.equal(parseMoneyCents("0.29"), 29);
assert.equal(parseMoneyCents("-0.01"), -1);
assert.equal(parseMoneyCents("1.234"), null);
assert.equal(parseMoneyCents("约 20 元"), null);

assert.equal(parseNotification("招商银行尾号1234账户余额人民币1234.56元").transaction, undefined);
assert.equal(parseNotification("微信支付：账户余额￥50.00").transaction, undefined);
assert.equal(parseNotification("微信支付：支付失败￥80.00").ignored, true);
assert.equal(parseNotification("支付宝验证码123456，付款金额100.00元").ignored, true);
assert.equal(parseNotification("支付宝：限时领优惠券，支付满100元立减20元").transaction, undefined);
const meal = transaction("微信支付：向肯德基付款成功￥29.90，支付方式零钱，交易单号420000123456");
assert.equal(meal.amountCents, 2990);
assert.equal(meal.direction, "expense");
assert.equal(meal.merchant, "肯德基");
assert.equal(meal.category, "餐饮");
assert.equal(meal.externalId, "420000123456");
assert.equal(meal.day, "2026-10-12");
const bank = transaction("招商银行：尾号1234支出人民币29.90元，消费微信支付-肯德基，余额人民币9950.10元");
assert.equal(bank.amountCents, 2990);
assert.equal(bank.channel, "bank");
assert.equal(transaction("微信支付：向肯德基付款成功￥29.90，支付方式招商银行卡").channel, "wechat");
assert.equal(transaction("支付宝：退款成功，金额￥29.90").direction, "income");
assert.equal(transaction("支付宝：退款处理中，金额￥29.90").status, "review");
assert.equal(transaction("支付宝：充值成功，金额￥100.00").direction, "transfer");
assert.equal(transaction("微信支付：零钱充值成功，金额￥100.00").direction, "transfer");
assert.equal(transaction("招商银行：信用卡还款成功，金额100.00元").direction, "transfer");
assert.equal(transaction("支付宝：向本人转账100.00元").direction, "transfer");
assert.equal(transaction("微信支付：向张三转账20.00元").status, "review");
assert.equal(parseNotification("微信支付：消费成功，余额人民币100.00元").transaction, undefined);

const retry = transaction(meal.rawText);
assert.equal(detectDuplicate(retry, [meal]).duplicate, true);
const otherTimeSameOrder = transaction(meal.rawText, "2026-10-12T13:30:00+08:00");
assert.equal(detectDuplicate(otherTimeSameOrder, [meal]).duplicate, true);
const purchase1 = transaction("微信支付：向瑞幸咖啡付款成功￥9.90");
const purchase2 = transaction(purchase1.rawText, "2026-10-12T12:31:00+08:00");
assert.equal(detectDuplicate(purchase2, [purchase1]).duplicate, false, "两次同额购买不能被吞掉");
assert.equal(detectDuplicate(bank, [meal]).review, true);
assert.equal(detectDuplicate(bank, [meal]).duplicate, false);
const refund10 = transaction("支付宝：退款成功，金额￥10.00，订单号20261012000001", "2026-10-12T10:00:00+08:00");
const refund20 = transaction("支付宝：退款成功，金额￥20.00，订单号20261012000001", "2026-10-12T12:00:00+08:00");
const sameAmountLaterRefund = transaction(refund10.rawText, "2026-10-12T13:00:00+08:00");
const storedRefund = { ...refund10, id: `owner_${refund10.id}` };
assert.notEqual(refund10.id, refund20.id, "不同金额退款必须有不同存储身份");
assert.notEqual(refund10.id, sameAmountLaterRefund.id, "原订单号不是独立退款事件号");
assert.equal(detectDuplicate(refund20, [storedRefund]).duplicate, false);
assert.equal(detectDuplicate(refund20, [storedRefund]).review, true);
assert.equal(detectDuplicate(sameAmountLaterRefund, [storedRefund]).duplicate, false);
assert.equal(detectDuplicate(sameAmountLaterRefund, [storedRefund]).review, true);
assert.equal(detectDuplicate(transaction(refund10.rawText, refund10.occurredAt), [storedRefund]).duplicate, true);
const originalExpense = transaction("支付宝：支出￥100.00，订单号20261012000001", "2026-10-12T09:00:00+08:00");
assert.notEqual(originalExpense.id, refund10.id);
assert.equal(detectDuplicate(refund10, [{ ...originalExpense, id: `owner_${originalExpense.id}` }]).duplicate, false);
const reliableRefund = transaction("支付宝：退款成功，金额￥10.00，退款流水号REFUND123456", "2026-10-12T10:00:00+08:00");
assert.equal(detectDuplicate(transaction(reliableRefund.rawText, "2026-10-12T11:00:00+08:00"), [reliableRefund]).duplicate, true);

const csv = '\uFEFF微信支付账单\n交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号\n2026-10-12 08:10:00,商户消费,"咖啡,面包店",早餐,支出,10.29,零钱,支付成功,420001111111\n2026-10-12 09:10:00,退款,商户,退款,收入,2.00,零钱,退款成功,420001111112\n2026-10-12 10:10:00,零钱充值,本人,充值,不计收支,100.00,银行卡,支付成功,420001111113\n2026-10-12 11:10:00,商户消费,商户,商品,支出,30.00,零钱,支付失败,420001111114\n2026-02-30 10:10:00,商户消费,商户,商品,支出,1.00,零钱,支付成功,420001111115';
const parsed = parseStatementCSV(csv);
assert.equal(parsed.transactions.length, 3);
assert.equal(parsed.transactions[0].amountCents, 1029);
assert.equal(parsed.transactions[0].merchant, "咖啡,面包店");
assert.equal(parsed.transactions[0].occurredAt, "2026-10-12T08:10:00+08:00");
assert.equal(parsed.transactions[1].direction, "income");
assert.equal(parsed.transactions[2].direction, "transfer");
assert.equal(parsed.skipped, 2);
assert.ok(parsed.errors.some((message) => message.includes("日期")));
assert.equal(parseStatementCSV('交易时间,金额,商户\n2026-10-12,100,某商户').transactions[0].status, "review");
const debitCSV = parseStatementCSV('交易日期\t摘要\t支出金额\t收入金额\n2026-10-12\t早餐\t10.00\t\n2026-10-12\t工资\t\t3000.00', "bank");
assert.equal(debitCSV.transactions.length, 2);
assert.equal(debitCSV.transactions[0].direction, "expense");
assert.equal(debitCSV.transactions[1].direction, "income");
assert.ok(parseStatementCSV('交易时间,金额,商户\n"2026-10-12,100,商户').errors.length);
const roundtrip = parseStatementCSV('交易时间,渠道,收支,金额(元),商户,分类,支付方式,状态,交易单号\n2026-10-12T12:00:00+08:00,微信,支出,29.90,肯德基,餐饮,零钱,已确认,\n2026-10-12T12:00:30+08:00,支付宝,支出,29.90,肯德基,餐饮,花呗,待核对,');
assert.deepEqual(roundtrip.transactions.map(({ channel, status }) => ({ channel, status })),
  [{ channel: "wechat", status: "confirmed" }, { channel: "alipay", status: "review" }]);
assert.equal(parseStatementCSV('交易时间,金额,收支,商户,分类\n2026-10-12,50.00,支出,宠物店,宠物用品').transactions[0].category, "宠物用品");

const reportRecords = [...parsed.transactions, meal, { ...bank, status: "review" as const, reviewReason: "可能重复" },
  { ...purchase1, id: "deleted", status: "deleted" as const },
  ...Array.from({ length: 6 }, (_, i) => ({ ...purchase1, id: `extra_${i}`, merchant: `逐笔商户${i}` }))];
const report = buildDailyReport(reportRecords, "2026-10-12");
assert.equal(report.totals.expenseCents, 1029 + 2990 + 6 * 990);
assert.equal(report.totals.incomeCents, 200);
assert.equal(report.totals.count, 9);
assert.equal(report.transactions.length, 10, "保留已确认转移明细但不计消费");
assert.ok(report.content.includes("逐笔商户5"), "日报不得仅保留最大三笔");
assert.ok(report.content.includes("1 笔待确认"));
assert.ok(report.content.includes("账户转移（不计消费）"));
const shifted = transaction("微信支付：支出20.00元", "2026-10-11T17:00:00Z");
assert.equal(shifted.day, "2026-10-12");
assert.equal(shifted.occurredAt, "2026-10-12T01:00:00+08:00");
assert.throws(() => buildDailyReport([], "2026-02-30"));
console.log("ledger-domain: amount, notification safety, CSV, dedupe, China time, and full daily report checks passed");
