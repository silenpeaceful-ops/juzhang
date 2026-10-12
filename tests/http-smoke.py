"""Exercise the local preview with synthetic data; never sends a real push."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173'
assert base.startswith(('http://127.0.0.1:', 'http://localhost:')), 'Run against local preview only'
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
client.open(base + '/signin-with-chatgpt?return_to=/', timeout=20).read()

def call(path, method='GET', data=None, expected=200):
    request = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
        method=method, headers={'Content-Type': 'application/json'})
    try:
        response = client.open(request, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    assert response.status == expected, (path, response.status, response.read().decode()[:200])
    raw = response.read().decode('utf-8-sig')
    return json.loads(raw) if raw.startswith(('{', '[')) else raw

before = call('/api/state')['transactions']
existing = {tx['id'] for tx in before}
marker = uuid.uuid4().hex[:10]
date = '2026-10-12'
try:
    notification = {'text': '微信支付：向肯德基付款成功￥29.90，支付方式零钱', 'channel': 'wechat',
        'occurredAt': date + 'T12:30:00+08:00', 'eventId': 'smoke-' + marker}
    first = call('/api/ingest', 'POST', notification)
    assert first['transaction']['amountCents'] == 2990
    assert call('/api/ingest', 'POST', notification)['duplicate'] is True
    assert call('/api/ingest', 'POST', {'text': '银行账户余额人民币5000.00元'})['ignored'] is True
    bank = call('/api/ingest', 'POST', {'text': '招商银行：尾号1234支出人民币29.90元，消费微信支付-肯德基',
        'occurredAt': date + 'T12:30:30+08:00'})
    assert bank['review'] is True
    manual = call('/api/transactions', 'POST', {'amountCents': 1234, 'merchant': '本地测试_' + marker,
        'channel': 'alipay', 'occurredAt': date + 'T13:00:00+08:00'})['transaction']
    edited = call('/api/transactions', 'PATCH', {'id': manual['id'], 'amountCents': 1250})['transaction']
    assert edited['amountCents'] == 1250
    csv = f'交易时间,渠道,收支,金额(元),商户,分类,支付方式,状态,交易单号\n{date}T14:00:00+08:00,银行卡,收入,100.00,本地测试工资_{marker},工资,银行卡,已确认,smoke-{marker}-salary'
    assert call('/api/import', 'POST', {'text': csv})['inserted'] == 1
    assert call('/api/import', 'POST', {'text': csv})['duplicates'] == 1
    report = call('/api/report?date=' + date)
    assert '本地测试工资_' + marker in report['content']
    assert report['transactions'] and isinstance(report['content'], str)
    exported = call('/api/export')
    assert '待核对' in exported and '微信' in exported and '支付宝' in exported
    call('/api/push', 'POST', {'date': date}, expected=409)
    call('/api/transactions', 'DELETE', None, expected=400)
    call('/api/transactions?id=' + urllib.parse.quote(manual['id']), 'DELETE')
    restored = call('/api/transactions', 'PATCH', {'id': manual['id'], 'status': 'confirmed'})['transaction']
    assert restored['status'] == 'confirmed'
    print('HTTP smoke passed: persistent CRUD, notification ingest, idempotency, cross-channel review, CSV, report, export and unconfigured push')
finally:
    current = call('/api/state')['transactions']
    for tx in current:
        if tx['id'] not in existing and tx['status'] != 'deleted':
            call('/api/transactions?id=' + urllib.parse.quote(tx['id']), 'DELETE')
