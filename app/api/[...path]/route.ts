import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { ownerKey, listTransactions, saveTransaction, updateTransaction, getSettings, setSettings, getCredential, db, digest } from '../../../lib/ledger-store';
import { buildDailyReport, parseNotification, parseStatementCSV, classifyTransaction, channelLabels, formatMoneyCents, type Channel, type Direction, type Transaction, type Settings } from '../../../lib/ledger-domain';
import { sendWeChatReport } from '../../../lib/push-adapters';

export const dynamic='force-dynamic';
const channels=['wechat','alipay','bank','other'];
const directions=['expense','income','transfer'];
const providers=['serverchan','pushplus','wecom'];
const securityHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function json(data:unknown,status=200):Response { return Response.json(data,{status,headers:securityHeaders}); }
function chinaDate(offset=0):string { return new Date(Date.now()+8*3600000+offset*86400000).toISOString().slice(0,10); }
function chinaTime():string { return new Date(Date.now()+8*3600000).toISOString().slice(11,16); }
function channel(value:unknown):Channel|undefined { if(value===undefined||value==='')return undefined;if(!channels.includes(String(value)))throw new Error('未知支付渠道');return value as Channel; }
function safeText(value:unknown,max=200):string { if(value===undefined||value===null)return '';if(typeof value!=='string')throw new Error('文本格式不正确');return value.slice(0,max); }
function dateTime(value:unknown):{occurredAt:string,day:string} {
  const raw=typeof value==='string'?value:new Date().toISOString();
  const date=new Date(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2})?$/.test(raw)?raw+'+08:00':raw);
  if(!Number.isFinite(date.getTime()))throw new Error('交易时间无效');
  const shifted=new Date(date.getTime()+8*3600000).toISOString().slice(0,19);
  return {occurredAt:shifted+'+08:00',day:shifted.slice(0,10)};
}
function manualTransaction(input:Record<string,unknown>,old?:Transaction):Transaction {
  const amount=Number(input.amountCents??old?.amountCents);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000_000)throw new Error('金额必须为正数，且精确到分');
  const direction=input.direction??old?.direction??'expense';
  if(!directions.includes(String(direction)))throw new Error('收支类型无效');
  const merchant=safeText(input.merchant??old?.merchant,100)||'未填写商户';
  return {id:old?.id||crypto.randomUUID(),...dateTime(input.occurredAt??old?.occurredAt),amountCents:amount,direction:direction as Direction,channel:channel(input.channel??old?.channel)||'other',merchant,category:safeText(input.category??old?.category,40)||classifyTransaction(merchant,direction as Direction),paymentMethod:safeText(input.paymentMethod??old?.paymentMethod,100),rawText:old?.rawText||'',externalId:old?.externalId||'',entryType:old?.entryType||'manual',status:old?.status||'confirmed'};
}
async function body(request:Request):Promise<Record<string,unknown>> {
  if(Number(request.headers.get('content-length')||0)>3_000_000)throw new Error('内容过大，请分批导入');
  const text=await request.text();if(text.length>3_000_000)throw new Error('内容过大，请分批导入');
  if((request.headers.get('content-type')||'').includes('text/plain'))return {text};
  if(!text)return {};const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('请求格式不正确');return data;
}
async function ingestKey(owner:string):Promise<string> { return digest(`${env.CONFIG_ENCRYPTION_SECRET||''}:ingest:${owner}`); }

async function handle(request:Request):Promise<Response> {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,'').replace(/\/$/,''),method=request.method;
  try {
    const user=await getChatGPTUser();
    const service=!user&&env.OWNER_PRIVATE_SERVICE_ACCESS==='true';
    if(!user&&!service)return json({error:'请先登录账本'},401);
    // Service access is supplied by the private Sites gate. Only narrowly scoped
    // ingestion and reporting operations may use that identity-less access.
    if(service&&!['ingest','run-daily','report','health'].includes(path))return json({error:'该接口需要网页登录'},403);
    if(service&&path==='run-daily') {
      const initialized=await db().prepare('SELECT value FROM ledger_metadata WHERE key=?').bind('owner').first();
      if(!initialized)return json({ok:true,skipped:true,reason:'请先登录并打开账本，再启用微信清单'});
    }
    const owner=await ownerKey(user?.userId);
    if(method==='GET'&&path==='health')return json({ok:true,day:chinaDate()});
    if(method==='GET'&&path==='state')return json({transactions:await listTransactions(owner),settings:await getSettings(owner)});
    if(method==='GET'&&path==='integration') {
      const token=env.SITES_SERVICE_ACCESS_TOKEN;
      return json({url:new URL('/api/ingest',url.origin).href,headers:token?{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-Juzhang-Key':await ingestKey(owner)}:{'Content-Type':'application/json'},bodyExample:{text:'微信支付：向肯德基付款成功￥29.90，支付方式零钱',channel:'wechat'},serviceAccessConfigured:!!token});
    }
    if(method==='GET'&&path==='report')return json(buildDailyReport(await listTransactions(owner),url.searchParams.get('date')||chinaDate()));
    if(method==='GET'&&path==='export') {
      const rows=(await listTransactions(owner)).filter(tx=>tx.status!=='deleted');
      const escape=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;
      const csv='\uFEFF'+[['交易时间','渠道','收支','金额(元)','商户','分类','支付方式','状态','交易单号'],...rows.map(tx=>[tx.occurredAt,channelLabels[tx.channel],tx.direction==='expense'?'支出':tx.direction==='income'?'收入':'不计收支',formatMoneyCents(tx.amountCents),tx.merchant,tx.category,tx.paymentMethod,tx.status==='review'?'待核对':'已确认',tx.externalId])].map(row=>row.map(escape).join(',')).join('\r\n');
      return new Response(csv,{headers:{...securityHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="juzhang-transactions.csv"'}});
    }
    if(method==='DELETE'&&path==='transactions')return json({transaction:await updateTransaction(owner,url.searchParams.get('id')||'',{status:'deleted'})});
    const input=await body(request);
    if(method==='POST'&&path==='transactions')return json(await saveTransaction(owner,manualTransaction(input)));
    if(method==='PATCH'&&path==='transactions') {
      const id=safeText(input.id,250),old=(await listTransactions(owner)).find(tx=>tx.id===id);
      if(!old)return json({error:'找不到这笔账单'},404);
      const updated=manualTransaction(input,old);
      if(input.status!==undefined){if(!['confirmed','review','deleted'].includes(String(input.status)))throw new Error('状态无效');updated.status=input.status as Transaction['status'];}
      if(updated.status==='confirmed'){delete updated.reviewReason;delete updated.duplicateOf;}
      return json({transaction:await updateTransaction(owner,id,updated)});
    }
    if(method==='POST'&&path==='ingest') {
      if(service&&request.headers.get('x-juzhang-key')!==await ingestKey(owner))return json({error:'接入密钥不正确'},403);
      const text=safeText(input.text,15000);
      const timestamp=input.occurredAt?dateTime(input.occurredAt).occurredAt:undefined;
      const parsed=parseNotification(text,{channel:channel(input.channel),occurredAt:timestamp,entryType:'notification'});
      if(!parsed.transaction)return json({...parsed,ignored:true});
      const eventId=safeText(input.eventId,250);
      return json(await saveTransaction(owner,parsed.transaction,eventId||undefined));
    }
    if(method==='POST'&&path==='import') {
      const parsed=parseStatementCSV(safeText(input.text,3_000_000),channel(input.channel));
      if(parsed.transactions.length>2000)throw new Error('每次最多导入 2000 笔，请分批导入');
      let inserted=0,duplicates=0,review=0;
      for(const tx of parsed.transactions){const result=await saveTransaction(owner,tx);if(result.duplicate)duplicates++;else{inserted++;if(result.review)review++;}}
      return json({ok:true,inserted,duplicates,review,skipped:parsed.skipped,errors:parsed.errors});
    }
    if(method==='PATCH'&&path==='settings') {
      const changes:Partial<Settings>={};
      if(input.dailyTime!==undefined){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.dailyTime)))throw new Error('日报时间无效');changes.dailyTime=input.dailyTime as string;}
      if(input.pushEnabled!==undefined){if(typeof input.pushEnabled!=='boolean')throw new Error('推送开关无效');changes.pushEnabled=input.pushEnabled;}
      if(input.provider!==undefined){if(!providers.includes(String(input.provider)))throw new Error('推送渠道无效');changes.provider=input.provider as Settings['provider'];}
      if(input.monthlyBudgetCents!==undefined){const value=Number(input.monthlyBudgetCents);if(!Number.isSafeInteger(value)||value<0)throw new Error('预算金额无效');changes.monthlyBudgetCents=value;}
      const credential=input.credential!==undefined?safeText(input.credential,1000).trim():undefined;
      return json({settings:await setSettings(owner,changes,credential)});
    }
    if(method==='POST'&&path==='push')return pushReport(owner,safeText(input.date,10)||chinaDate(),false);
    if(method==='POST'&&path==='run-daily') {
      const settings=await getSettings(owner);
      if(!settings.pushEnabled)return json({ok:true,skipped:true,reason:'每日微信推送尚未启用'});
      if(chinaTime()<settings.dailyTime)return json({ok:true,skipped:true,reason:'尚未到设定推送时间'});
      // Send the previous complete calendar day, so late-night purchases are
      // never silently omitted by a report sent before the day has ended.
      return pushReport(owner,chinaDate(-1),true);
    }
    return json({error:'接口不存在'},404);
  } catch(error) {
    const message=error instanceof Error?error.message:'操作失败，请重试';
    return json({error:message.slice(0,300)},400);
  }
}

async function pushReport(owner:string,date:string,scheduled:boolean):Promise<Response> {
  const settings=await getSettings(owner),credential=await getCredential(owner);
  if(!credential)return json({ok:false,error:'请先在设置中配置微信接收渠道'},409);
  const report=buildDailyReport(await listTransactions(owner),date);
  const id=scheduled?`${owner}:${date}:${settings.provider}`:crypto.randomUUID();
  if(scheduled) {
    const old=await db().prepare('SELECT status,sent_at FROM ledger_deliveries WHERE id=?').bind(id).first<{status:string,sent_at:string|null}>();
    if(old?.status==='sent')return json({ok:true,skipped:true,reason:'该日日报已发送'});
    if(old?.status==='sending'&&old.sent_at&&Date.now()-Date.parse(old.sent_at)<900000)return json({ok:true,skipped:true,reason:'该日日报正在发送'});
  }
  const now=new Date().toISOString(),claimToken=crypto.randomUUID();
  const inserted=await db().prepare('INSERT OR IGNORE INTO ledger_deliveries(id,owner_id,report_day,provider,status,attempts,sent_at,claim_token) VALUES (?,?,?,?,?,1,?,?)')
    .bind(id,owner,date,settings.provider,'sending',now,claimToken).run();
  if(!inserted.meta.changes) {
    const claimed=await db().prepare("UPDATE ledger_deliveries SET status='sending',attempts=attempts+1,sent_at=?,claim_token=? WHERE id=? AND (status='failed' OR (status='sending' AND sent_at<?))")
      .bind(now,claimToken,id,new Date(Date.now()-900000).toISOString()).run();
    if(!claimed.meta.changes)return json({ok:true,skipped:true,reason:'该日日报已提交或正在发送'});
  }
  let result:{ok:boolean,error?:string};
  try { result=await sendWeChatReport(settings.provider,credential,report); }
  catch { result={ok:false,error:'推送失败，请稍后重试'}; }
  await db().prepare('UPDATE ledger_deliveries SET status=?,error=?,sent_at=? WHERE id=? AND claim_token=?').bind(result.ok?'sent':'failed',result.error||null,result.ok?new Date().toISOString():null,id,claimToken).run();
  return json({...result,date,report},result.ok?200:502);
}

export const GET=handle;
export const POST=handle;
export const PATCH=handle;
export const DELETE=handle;
