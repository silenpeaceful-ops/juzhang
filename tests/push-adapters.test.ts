import assert from "node:assert/strict";
// @ts-ignore Node strip-types requires a source extension.
import { sendWeChatReport } from "../lib/push-adapters.ts";

const report = { title: "2026-10-12 消费清单", content: "12:00 肯德基 · 支出 ¥29.90 · 微信" };
const sctKey = "SCT12345678901234567890";
const pushKey = "1234567890abcdef1234567890abcdef";
const wecomKey = "12345678-abcd-1234-abcd-123456789012";
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
function mock(handler: (url: string, init: RequestInit) => Promise<Response> | Response): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => handler(String(url), init || {})) as typeof fetch;
}

let calls = 0;
const businessFailure = await sendWeChatReport("pushplus", pushKey, report, mock(() => {
  calls++; return json({ code: 903, msg: "invalid token" });
}));
assert.equal(businessFailure.ok, false);
assert.equal(calls, 1, "invalid credentials must not be retried");
assert.ok(businessFailure.error?.includes("903"));
assert.equal((await sendWeChatReport("wecom", wecomKey, report, mock(() => json({ errcode: 40058 })))).ok, false);
assert.equal((await sendWeChatReport("serverchan", sctKey, report, mock(() => json({ code: 101 })))).ok, false);
assert.equal((await sendWeChatReport("serverchan", sctKey, report, mock(() => json({ unrelated: true })))).ok, false);

calls = 0;
const recovered = await sendWeChatReport("serverchan", sctKey, report, mock((url, init) => {
  calls++; assert.equal(url, `https://sctapi.ftqq.com/${sctKey}.send`);
  assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
  if (calls < 3) throw new Error(`network error leaking ${sctKey}`);
  return json({ code: 0 });
}));
assert.equal(recovered.ok, true); assert.equal(calls, 3);
calls = 0;
const exhausted = await sendWeChatReport("serverchan", sctKey, report, mock(() => {
  calls++; throw new Error(`never return ${sctKey}`);
}));
assert.equal(exhausted.ok, false); assert.equal(calls, 3);
assert.ok(!exhausted.error?.includes(sctKey));
calls = 0;
assert.equal((await sendWeChatReport("pushplus", pushKey, report, mock(() => {
  calls++; return json({}, 503);
}))).ok, false);
assert.equal(calls, 3);

let checkedSC3 = false;
assert.equal((await sendWeChatReport("serverchan", "sctp123tABCDEF012345", report, mock((url) => {
  checkedSC3 = true; assert.equal(url, "https://123.push.ft07.com/send/sctp123tABCDEF012345.send");
  return json({ code: 0 });
}))).ok, true);
assert.equal(checkedSC3, true);
assert.equal((await sendWeChatReport("pushplus", pushKey, report, mock((url, init) => {
  assert.equal(url, "https://www.pushplus.plus/send");
  const body = JSON.parse(String(init.body)); assert.equal(body.channel, "wechat");
  assert.equal(body.token, pushKey); return json({ code: 200, data: "accepted-message-id" });
}))).ok, true);

for (const badUrl of ["https://evil.example/send?key=1234567890", "http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1234567890",
  "https://qyapi.weixin.qq.com.evil.example/cgi-bin/webhook/send?key=1234567890",
  "https://user:pass@qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1234567890",
  "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1234567890&redirect=https://evil.example",
  "https://127.0.0.1/cgi-bin/webhook/send?key=1234567890"]) {
  let sent = false;
  const result = await sendWeChatReport("wecom", badUrl, report, mock(() => { sent = true; return json({ errcode: 0 }); }));
  assert.equal(result.ok, false); assert.equal(sent, false);
}
assert.equal((await sendWeChatReport("wecom", `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${wecomKey}`, report,
  mock(() => json({ errcode: 0 })))).ok, true);

const long = { title: "完整逐笔清单", content: Array.from({ length: 100 }, (_, i) => `${i} 🍜 商户${i} · 支出 ¥12.34 · 微信\n`).join("") };
const bodies: string[] = [];
const multipart = await sendWeChatReport("wecom", wecomKey, long, mock((_url, init) => {
  const body = JSON.parse(String(init.body));
  assert.equal(body.msgtype, "text");
  assert.ok(new TextEncoder().encode(body.text.content).length <= 2048);
  bodies.push(body.text.content); return json({ errcode: 0 });
}));
assert.equal(multipart.ok, true); assert.ok(bodies.length > 1);
assert.ok(bodies[0].startsWith(`第 1/${bodies.length} 段\n`));
const reconstructed = bodies.map((body) => body.replace(/^第 \d+\/\d+ 段\n/, "")).join("");
assert.equal(reconstructed, `${long.title}\n\n${long.content}`, "every transaction and code point is preserved");
calls = 0;
const partial = await sendWeChatReport("wecom", wecomKey, long, mock(() => {
  calls++; return json({ errcode: calls === 1 ? 0 : 40058 });
}));
assert.equal(partial.ok, false); assert.equal(calls, 2); assert.ok(partial.error?.includes("此前 1 段已受理"));
console.log("push-adapters: provider codes, retries, credential safety, SCT/SC3 endpoints and lossless multipart checks passed");
