"""Exercise the local preview with synthetic data; never sends a real push."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173'
target = urllib.parse.urlsplit(base)
assert target.scheme == 'http' and target.hostname in ('127.0.0.1', 'localhost') and not target.username and not target.password and not target.query and not target.fragment and target.path in ('', '/'), 'Run against local preview only'
base = base.rstrip('/')
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
created_ids = set()
marker = uuid.uuid4().hex[:10]
date = '2026-10-12'
try:
    notification = {'text': '微信支付：向肯德基本地测试_' + marker + '付款成功￥29.90，支付方式零钱', 'channel': 'wechat',
        'occurredAt': date + 'T12:30:00+08:00', 'eventId': 'smoke-' + marker}
    first = call('/api/ingest', 'POST', notification)
    if first['transaction']['id'] not in existing:
        created_ids.add(first['transaction']['id'])
    assert first['transaction']['amountCents'] == 2990
    assert call('/api/ingest', 'POST', notification)['duplicate'] is True
    assert call('/api/ingest', 'POST', {'text': '银行账户余额人民币5000.00元'})['ignored'] is True
    bank = call('/api/ingest', 'POST', {'text': '招商银行：尾号1234支出人民币29.90元，消费微信支付-肯德基本地测试_' + marker,
        'occurredAt': date + 'T12:30:30+08:00', 'eventId': 'smoke-bank-' + marker})
    if bank['transaction']['id'] not in existing:
        created_ids.add(bank['transaction']['id'])
    assert bank['review'] is True
    manual = call('/api/transactions', 'POST', {'amountCents': 1234, 'merchant': '手动删除验证_' + marker,
        'channel': 'alipay', 'occurredAt': date + 'T13:00:00+08:00'})['transaction']
    created_ids.add(manual['id'])
    edited = call('/api/transactions', 'PATCH', {'id': manual['id'], 'amountCents': 1250})['transaction']
    assert edited['amountCents'] == 1250
    csv = f'交易时间,渠道,收支,金额(元),商户,分类,支付方式,状态,交易单号\n{date}T14:00:00+08:00,银行卡,收入,100.00,本地测试工资_{marker},工资,银行卡,已确认,smoke-{marker}-salary'
    assert call('/api/import', 'POST', {'text': csv})['inserted'] == 1
    created_ids.update(tx['id'] for tx in call('/api/state')['transactions'] if tx['externalId'] == 'smoke-' + marker + '-salary' and tx['id'] not in existing)
    assert call('/api/import', 'POST', {'text': csv})['duplicates'] == 1
    report = call('/api/report?date=' + date)
    assert '本地测试工资_' + marker in report['content']
    assert report['transactions'] and isinstance(report['content'], str)
    exported = call('/api/export')
    assert '待核对' in exported and '微信' in exported and '支付宝' in exported
    # A persistent preview may already have a real provider credential. Do not
    # exercise a sending endpoint in that case, even if an assertion expects 409.
    if not call('/api/state')['settings'].get('providerConfigured'):
        call('/api/push', 'POST', {'date': date}, expected=409)
    call('/api/transactions', 'DELETE', None, expected=400)
    before_delete = call('/api/report?date=' + date)
    assert any(tx['id'] == manual['id'] for tx in before_delete['transactions'])
    removed = call('/api/transactions?id=' + urllib.parse.quote(manual['id']), 'DELETE')['transaction']
    assert removed['status'] == 'deleted' and removed['amountCents'] == edited['amountCents']
    after_delete = call('/api/report?date=' + date)
    assert after_delete['totals']['expenseCents'] == before_delete['totals']['expenseCents'] - edited['amountCents']
    assert after_delete['totals']['incomeCents'] == before_delete['totals']['incomeCents']
    assert after_delete['totals']['count'] == before_delete['totals']['count'] - 1
    assert not any(tx['id'] == manual['id'] for tx in after_delete['transactions'])
    assert manual['merchant'] not in after_delete['content']
    assert manual['merchant'] not in call('/api/export')
    # A repeated delete must not subtract the same purchase a second time.
    call('/api/transactions?id=' + urllib.parse.quote(manual['id']), 'DELETE')
    assert call('/api/report?date=' + date)['totals'] == after_delete['totals']
    restored = call('/api/transactions', 'PATCH', {'id': manual['id'], 'status': 'confirmed'})['transaction']
    assert restored['status'] == 'confirmed'
    assert restored['amountCents'] == edited['amountCents'] and restored['merchant'] == edited['merchant']
    after_restore = call('/api/report?date=' + date)
    assert after_restore['totals'] == before_delete['totals']
    assert sum(tx['id'] == manual['id'] for tx in after_restore['transactions']) == 1
    assert manual['merchant'] in after_restore['content']
    assert manual['merchant'] in call('/api/export')
    # Undo a deletion of an uncertain bank match without accidentally confirming
    # it or discarding the explanation linking it to the possible original.
    review_before = bank['transaction']
    assert review_before['status'] == 'review'
    assert review_before.get('reviewReason') and review_before.get('duplicateOf')
    before_review_delete = call('/api/report?date=' + date)
    call('/api/transactions?id=' + urllib.parse.quote(review_before['id']), 'DELETE')
    after_review_delete = call('/api/report?date=' + date)
    assert after_review_delete['totals'] == before_review_delete['totals']
    restored_review = call('/api/transactions', 'PATCH', {'id': review_before['id'], 'status': 'review'})['transaction']
    assert restored_review['status'] == 'review'
    assert restored_review['amountCents'] == review_before['amountCents']
    assert restored_review['reviewReason'] == review_before['reviewReason']
    assert restored_review['duplicateOf'] == review_before['duplicateOf']
    after_review_restore = call('/api/report?date=' + date)
    assert after_review_restore['totals'] == before_review_delete['totals']
    assert not any(tx['id'] == restored_review['id'] for tx in after_review_restore['transactions'])
    persisted_review = next(tx for tx in call('/api/state')['transactions'] if tx['id'] == restored_review['id'])
    assert persisted_review['status'] == 'review'
    assert persisted_review['reviewReason'] == review_before['reviewReason']
    assert persisted_review['duplicateOf'] == review_before['duplicateOf']
    print('HTTP smoke passed: persistent CRUD, notification ingest, idempotency, cross-channel review, CSV, report, export, deletion exclusion and undo restoration')
finally:
    current = call('/api/state')['transactions']
    for tx in current:
        if tx['id'] in created_ids and tx['status'] != 'deleted':
            call('/api/transactions?id=' + urllib.parse.quote(tx['id']), 'DELETE')
