/**
 * Provider payloads adapted from moneybook/src/moneybook/notify.py:
 * https://github.com/zyz674/moneybook, Copyright (c) 2026 zyz674, MIT.
 * The full upstream permission notice is preserved in lib/ledger-domain.ts
 * and the project's third-party license notice. This adapter adds validated
 * destinations, business-code checks, timeouts, bounded retries and lossless
 * multipart reports. It uses no model or paid AI API.
 *
 * Verified provider contracts:
 * https://sct.ftqq.com/docs/getting-started/sendkey/
 * https://sct.ftqq.com/docs/integrations/python/
 * https://www.pushplus.plus/doc/guide/api.html
 * https://www.pushplus.plus/doc/help/limit.html
 * https://developer.work.weixin.qq.com/document/path/91770
 *
 * `ok` means every part was accepted by the provider, not that a person read
 * it. PushPlus in particular processes accepted messages asynchronously.
 * SC3 (sctp... keys) sends to the ServerChan app, not personal WeChat.
 */

export type PushProvider = "serverchan" | "pushplus" | "wecom";
export type PushResult = { ok: boolean; error?: string };
type Report = { title: string; content: string };
type RequestTarget = { url: string; key: string };

function destination(provider: PushProvider, credential: string): RequestTarget {
  const key = credential.trim();
  if (provider === "serverchan") {
    const sc3 = /^sctp([0-9]+)t[A-Za-z0-9_-]{6,}$/.exec(key);
    if (sc3) return { url: `https://${sc3[1]}.push.ft07.com/send/${key}.send`, key };
    if (!/^SCT[A-Za-z0-9_-]{8,}$/.test(key)) throw new Error("Server酱 SendKey 格式无效，请填写 SCT 或 sctp 开头的密钥");
    return { url: `https://sctapi.ftqq.com/${key}.send`, key };
  }
  if (provider === "pushplus") {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("PushPlus token 格式无效");
    return { url: "https://www.pushplus.plus/send", key };
  }
  if (provider !== "wecom") throw new Error("不支持的推送通道");
  if (!key.includes("://")) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("企业微信机器人 key 格式无效");
    return { url: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`, key };
  }
  let url: URL;
  try { url = new URL(key); } catch { throw new Error("企业微信机器人地址格式无效"); }
  const queryKeys = [...url.searchParams.keys()];
  const token = url.searchParams.get("key") || "";
  if (url.protocol !== "https:" || url.hostname !== "qyapi.weixin.qq.com" || url.port ||
      url.username || url.password || url.hash || url.pathname !== "/cgi-bin/webhook/send" ||
      queryKeys.length !== 1 || queryKeys[0] !== "key" || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    throw new Error("仅支持官方 HTTPS 企业微信机器人地址 qyapi.weixin.qq.com");
  }
  return { url: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${token}`, key: token };
}

/** Split on Unicode code points; no content is dropped, including line breaks. */
function splitUtf8(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const parts: string[] = []; let part = "", bytes = 0;
  for (const character of text) {
    const width = encoder.encode(character).length;
    if (bytes + width > maxBytes && part) { parts.push(part); part = ""; bytes = 0; }
    part += character; bytes += width;
  }
  if (part) parts.push(part);
  return parts;
}
function prepareParts(provider: PushProvider, report: Report): Report[] {
  // WeCom text is limited to 2048 UTF-8 bytes; leave room for part numbers.
  // PushPlus's ordinary account limit is 20,000 characters, so an 18k byte
  // budget is conservative for both ASCII and multibyte text. ServerChan
  // uses a conservative 8k byte budget instead of assuming an account tier.
  const budget = provider === "wecom" ? 1900 : provider === "pushplus" ? 18000 : 8000;
  const completeText = `${report.title}\n\n${report.content}`;
  const chunks = splitUtf8(completeText, budget);
  const maxParts = provider === "wecom" ? 18 : provider === "pushplus" ? 4 : 5;
  if (chunks.length > maxParts) throw new Error("完整清单过长，超过单次安全发送分段数；请减少日报范围或选择支持较长内容的通道，清单不会被截断");
  const cleanTitle = report.title.replace(/[\r\n]/g, " ").trim() || "每日消费清单";
  // Full original title is kept in the body even if the notification title
  // must be shorter. SCT's title limit is 32 characters.
  const titleBudget = provider === "serverchan" ? 22 : 70;
  const title = [...cleanTitle].slice(0, titleBudget).join("");
  return chunks.map((content, i) => ({
    title: chunks.length > 1 ? `${title} [${i + 1}/${chunks.length}]` : title,
    content: chunks.length > 1 ? `第 ${i + 1}/${chunks.length} 段\n${content}` : content,
  }));
}
function payload(provider: PushProvider, key: string, report: Report): object {
  if (provider === "serverchan") return { title: report.title, desp: report.content };
  if (provider === "pushplus") return { token: key, title: report.title, content: report.content, template: "txt", channel: "wechat" };
  return { msgtype: "text", text: { content: report.content } };
}
function businessResult(provider: PushProvider, body: unknown): { ok: boolean; retry: boolean; error?: string } {
  if (!body || typeof body !== "object") return { ok: false, retry: false, error: "推送服务返回无效响应" };
  const response = body as Record<string, unknown>;
  const rawCode = provider === "wecom" ? response.errcode : response.code;
  if (typeof rawCode !== "number" && typeof rawCode !== "string") return { ok: false, retry: false, error: "推送服务响应缺少业务状态码" };
  // Reject empty strings/false rather than coercing them to zero.
  if (typeof rawCode === "string" && !/^-?\d+$/.test(rawCode)) return { ok: false, retry: false, error: "推送服务业务状态码无效" };
  const code = Number(rawCode), expected = provider === "pushplus" ? 200 : 0;
  if (code === expected) return { ok: true, retry: false };
  const explanation = provider === "pushplus" && code === 905 ? "账户未实名认证" :
    provider === "pushplus" && code === 900 ? "账户推送额度或频率受限" :
    provider === "pushplus" && code === 903 ? "推送密钥无效" :
    provider === "wecom" && code === 45009 ? "机器人发送频率受限" : "推送服务拒绝了请求";
  return { ok: false, retry: code === 500 || code === -1,
    error: `${explanation}（业务码 ${code}）` };
}

async function sendPart(provider: PushProvider, target: RequestTarget, report: Report, fetcher: typeof fetch): Promise<PushResult> {
  let lastError = "推送失败";
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let retry = false;
    try {
      const response = await fetcher(target.url, {
        method: "POST", headers: { "Content-Type": "application/json;charset=utf-8" },
        body: JSON.stringify(payload(provider, target.key, report)),
        signal: controller.signal, redirect: "error",
      });
      if (!response.ok) {
        lastError = `推送服务 HTTP ${response.status}`;
        retry = response.status >= 500;
      } else {
        let body: unknown;
        try { body = await response.json(); }
        catch { return { ok: false, error: "推送服务返回的内容不是有效 JSON" }; }
        const result = businessResult(provider, body);
        if (result.ok) return { ok: true };
        lastError = result.error || lastError; retry = result.retry;
      }
    } catch {
      // Do not return thrown messages: they can include the credential URL.
      lastError = controller.signal.aborted ? "推送请求超过 10 秒，请稍后重试" : "网络请求失败，请稍后重试";
      retry = true;
    } finally { clearTimeout(timeout); }
    if (!retry || attempt === 2) return { ok: false, error: lastError };
    await new Promise<void>((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
  }
  return { ok: false, error: lastError };
}

/** Every part must be accepted. Partial failure never returns `ok: true`. */
export async function sendWeChatReport(provider: PushProvider, credential: string, report: Report,
  fetcher: typeof fetch = fetch): Promise<PushResult> {
  let target: RequestTarget, parts: Report[];
  try {
    if (!credential?.trim()) return { ok: false, error: "请先配置推送密钥" };
    if (!report?.title || !report.content?.trim()) return { ok: false, error: "日报标题或内容为空" };
    target = destination(provider, credential);
    parts = prepareParts(provider, report);
  } catch (error) { return { ok: false, error: (error as Error).message }; }
  for (let i = 0; i < parts.length; i++) {
    const result = await sendPart(provider, target, parts[i], fetcher);
    if (!result.ok) return { ok: false, error: parts.length > 1
      ? `第 ${i + 1}/${parts.length} 段未受理${i ? `（此前 ${i} 段已受理，重试可能重复）` : ""}：${result.error}` : result.error };
  }
  return { ok: true };
}
