import { env } from 'cloudflare:workers';
import { defaultSettings, detectDuplicate, type Transaction, type Settings } from './ledger-domain';

export function db(): D1Database {
  if (!env.DB) throw new Error('账本数据库尚未连接');
  return env.DB;
}

export async function ownerKey(userId?: string | null): Promise<string> {
  if (userId) await db().prepare('INSERT OR IGNORE INTO ledger_metadata (key,value) VALUES (?,?)').bind('owner',userId).run();
  const row = await db().prepare('SELECT value FROM ledger_metadata WHERE key=?').bind('owner').first<{value:string}>();
  if (!row) throw new Error('请先在网页中登录并打开账本');
  if (userId && row.value !== userId) throw new Error('该账本只允许所有者访问');
  return row.value;
}

export async function listTransactions(ownerId: string): Promise<Transaction[]> {
  const result = await db().prepare('SELECT payload FROM ledger_transactions WHERE owner_id=? ORDER BY occurred_at DESC').bind(ownerId).all<{payload:string}>();
  return result.results.map(row=>JSON.parse(row.payload) as Transaction);
}

export async function saveTransaction(ownerId:string, incoming:Transaction, eventId?:string): Promise<{transaction:Transaction,duplicate:boolean,review:boolean,reason?:string}> {
  if (eventId) {
    const old = await db().prepare('SELECT payload FROM ledger_transactions WHERE owner_id=? AND event_key=?').bind(ownerId,eventId).first<{payload:string}>();
    if (old) return {transaction:JSON.parse(old.payload),duplicate:true,review:false,reason:'同一通知已入账'};
  }
  const existing = await listTransactions(ownerId);
  const match = detectDuplicate(incoming,existing);
  if (match.duplicate) return {transaction:existing.find(tx=>tx.id===match.duplicateOf)||incoming,duplicate:true,review:false,reason:match.reason};
  const transaction:Transaction = {
    ...incoming,
    id: eventId ? `${ownerId}_${await digest(eventId)}` : `${ownerId}_${incoming.id}`,
    ...(match.review ? {status:'review',reviewReason:match.reason,duplicateOf:match.duplicateOf} : {}),
  };
  const result = await db().prepare('INSERT OR IGNORE INTO ledger_transactions (id,owner_id,day,occurred_at,status,payload,event_key,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(transaction.id,ownerId,transaction.day,transaction.occurredAt,transaction.status,JSON.stringify(transaction),eventId||null,new Date().toISOString()).run();
  return {transaction,duplicate:!result.meta.changes,review:transaction.status==='review',reason:transaction.reviewReason};
}

export async function updateTransaction(ownerId:string,id:string,changes:Partial<Transaction>):Promise<Transaction> {
  const row=await db().prepare('SELECT payload FROM ledger_transactions WHERE owner_id=? AND id=?').bind(ownerId,id).first<{payload:string}>();
  if(!row) throw new Error('找不到这笔账单');
  const old=JSON.parse(row.payload) as Transaction;
  const updated={...old,...changes,id:old.id};
  await db().prepare('UPDATE ledger_transactions SET payload=?,status=?,day=?,occurred_at=? WHERE owner_id=? AND id=?').bind(JSON.stringify(updated),updated.status,updated.day,updated.occurredAt,ownerId,id).run();
  return updated;
}

export async function getSettings(ownerId:string):Promise<Settings> {
  const row=await db().prepare('SELECT settings,encrypted_credential FROM ledger_configuration WHERE owner_id=?').bind(ownerId).first<{settings:string,encrypted_credential:string|null}>();
  return {...defaultSettings,...(row?JSON.parse(row.settings):{}),providerConfigured:!!row?.encrypted_credential};
}

export async function setSettings(ownerId:string,changes:Partial<Settings>,credential?:string):Promise<Settings> {
  const previous=await getSettings(ownerId);
  const row=await db().prepare('SELECT encrypted_credential FROM ledger_configuration WHERE owner_id=?').bind(ownerId).first<{encrypted_credential:string|null}>();
  let encrypted=row?.encrypted_credential||null;
  if(changes.provider && changes.provider!==previous.provider) encrypted=null;
  if(credential!==undefined) encrypted=credential?await encryptSecret(credential):null;
  const settings={...previous,...changes,providerConfigured:!!encrypted};
  if(settings.pushEnabled&&!encrypted) throw new Error('请先填写微信接收渠道的密钥');
  await db().prepare('INSERT INTO ledger_configuration (owner_id,settings,encrypted_credential,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET settings=excluded.settings,encrypted_credential=excluded.encrypted_credential,updated_at=excluded.updated_at')
    .bind(ownerId,JSON.stringify(settings),encrypted,new Date().toISOString()).run();
  return settings;
}

export async function getCredential(ownerId:string):Promise<string> {
  const row=await db().prepare('SELECT encrypted_credential FROM ledger_configuration WHERE owner_id=?').bind(ownerId).first<{encrypted_credential:string|null}>();
  return row?.encrypted_credential?decryptSecret(row.encrypted_credential):'';
}

function bytesBase64(bytes:Uint8Array):string { return btoa(String.fromCharCode(...bytes)); }
function base64Bytes(value:string):Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
async function boxKey():Promise<CryptoKey> {
  const secret=env.CONFIG_ENCRYPTION_SECRET;
  if(!secret) throw new Error('服务器尚未配置密钥加密，暂不能保存推送密钥');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);
}
async function encryptSecret(value:string):Promise<string> {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await boxKey(),new TextEncoder().encode(value));
  return `${bytesBase64(iv)}.${bytesBase64(new Uint8Array(data))}`;
}
async function decryptSecret(value:string):Promise<string> {
  const [iv,data]=value.split('.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64Bytes(iv)},await boxKey(),base64Bytes(data));
  return new TextDecoder().decode(plain);
}
export async function digest(value:string):Promise<string> {
  const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data)).map(v=>v.toString(16).padStart(2,'0')).join('');
}
