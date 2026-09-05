"""Local BFF tests with a mocked Supabase service. Not live Auth/RLS verification."""
import copy,json,time
from datetime import datetime,timedelta,timezone
from pathlib import Path
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import create_app,normalize_email,validate_patch,REMEMBER_COOKIE_SECONDS
from app.settings import Settings

class FakeStore:
    def __init__(self):
        self.members={
          'owner@example.test':{'email':'owner@example.test','user_id':'owner-id','display_name':'Archil','role':'owner','enabled':True},
          'carl.rausch@wteii.com':{'email':'carl.rausch@wteii.com','user_id':'carl-id','display_name':'Carl Rausch','role':'editor','enabled':True},
          'karen.lee@wteii.com':{'email':'karen.lee@wteii.com','user_id':'karen-id','display_name':'Karen Lee','role':'viewer','enabled':True}}
        self.sessions={};self.sent=[];self.calls=[];self.verify_used=set();self.limits={}
        self.row={'id':'P001','record':{'id':'P001','name':'Test Contact','priority_score':8,'country_tags':['GB'],'species_tags':['cat'],'sections':['veterinary-doctors-and-science']},'version':1,'review_relationship':'not_assessed','review_valuable':False,'review_note':'','do_not_contact':False,'bhoc_active_contact':'unknown','bhoc_last_contact_on':None}
    async def member_by_email(self,email):
        m=self.members.get(email);return copy.deepcopy(m) if m and m['enabled'] else None
    async def limit(self,key,window,maximum):
        self.limits[key]=self.limits.get(key,0)+1
        if self.limits[key]>maximum:raise HTTPException(429,'Too many attempts')
    async def session_put(self,row):self.sessions[row['token_hash']]=copy.deepcopy(row)
    async def session_get(self,key):return copy.deepcopy(self.sessions.get(key))
    async def session_touch(self,row):
        key=row['token_hash']
        if key not in self.sessions:return False
        for field in ('last_seen_at','encrypted_tokens'):
            self.sessions[key][field]=row[field]
        return True
    async def session_delete(self,key):self.sessions.pop(key,None)
    async def user(self,token):
        email=token.removeprefix('access:');m=self.members.get(email)
        if not m:raise HTTPException(401)
        return {'id':m['user_id'],'email':email,'email_confirmed_at':'2026-01-01T00:00:00Z'}
    async def role(self,token):
        m=await self.member_by_email(token.removeprefix('access:'));return m['role'] if m else None
    async def snapshot(self,token):return {'contacts':[copy.deepcopy(self.row)],'resources':{'sources':[],'taxonomy':{'sections':[]}}}
    async def all_rows(self,table,token):return list(self.members.values()) if table=='ic_members' else []
    async def call(self,method,path,body=None,params=None,token=None,service=False,prefer=None):
        self.calls.append((method,path,copy.deepcopy(body)))
        if path=='/auth/v1/otp':self.sent.append(body['email']);assert body['create_user'] is False;return {}
        if path=='/auth/v1/verify':
            if body['token']!='123456' or body['email'] in self.verify_used:raise HTTPException(400)
            self.verify_used.add(body['email']);return {'access_token':'access:'+body['email'],'refresh_token':'refresh:'+body['email'],'expires_in':3600}
        if path=='/auth/v1/token':
            email=body['refresh_token'].removeprefix('refresh:')
            return {'access_token':'access:'+email,'refresh_token':'refresh:'+email,'expires_in':3600}
        if path=='/auth/v1/logout':return None
        if path.endswith('ic_save_contact'):
            if body['p_version']!=self.row['version']:raise HTTPException(409,'Record changed')
            if self.row['do_not_contact'] and not body['p_restricted'] and (not body['p_release_confirmed'] or len(body['p_release_reason'].strip())<5):raise HTTPException(422,'Release explanation required')
            self.row['record'].update(body['p_patch']);self.row.update(version=self.row['version']+1,review_relationship=body['p_relationship'],review_valuable=body['p_valuable'],do_not_contact=body['p_restricted'],review_note=body['p_note'],bhoc_active_contact=body['p_active'])
            return copy.deepcopy(self.row)
        if path=='/auth/v1/admin/users':return {'users':[{'email':m['email'],'id':m['user_id']} for m in self.members.values()]}
        if path.endswith('ic_set_member'):return None
        if path.endswith('ic_delete_contact'):return None
        if path.endswith('ic_create_contact'):return body
        raise AssertionError(path)

@pytest.fixture
def env():
    settings=Settings('https://project.supabase.co','public-test-key','secret-test-key',Fernet.generate_key().decode(),'https://private.example.test')
    store=FakeStore();client=TestClient(create_app(settings,store),base_url=settings.origin)
    yield client,store,settings

def login(env,email='carl.rausch@wteii.com',remember=True):
    c,store,s=env
    r=c.post('/auth/verify-code',json={'email':email,'code':'123456','remember':remember},headers={'origin':s.origin})
    assert r.status_code==200,r.text
    me=c.get('/api/me');assert me.status_code==200,me.text
    return {'Origin':s.origin,'X-CSRF-Token':me.json()['csrf']},r

def payload(**kw):return {'version':1,'patch':{'name':'Revised'},'active':'unknown',**kw}

@pytest.mark.parametrize('path',['/api/me','/api/snapshot','/api/admin/members','/api/admin/audit'])
def test_unauthenticated_denied(env,path):assert env[0].get(path).status_code==401

def test_landing_page_has_no_data_or_allowlist(env):
    r=env[0].get('/');assert r.status_code==200
    assert 'carl.rausch@wteii.com' not in r.text and 'Karen Humm' not in r.text
    assert 'SESSION_ENCRYPTION_KEY' not in r.text and 'Source checked' not in r.text

def test_private_seed_not_served(env):
    for p in ['/private_seed/snapshot.json','/assets/../private_seed/snapshot.json','/veterinary/data/snapshot.json','/veterinary/data/snapshot.json','/assets/../veterinary/data/snapshot.json','/.env']:
        assert env[0].get(p).status_code==404

def test_unknown_email_not_sent_and_generic_response(env):
    c,store,s=env
    r=c.post('/auth/request-code',json={'email':'outsider@example.test'},headers={'origin':s.origin})
    assert r.status_code==200 and store.sent==[]
    known=c.post('/auth/request-code',json={'email':'carl.rausch@wteii.com'},headers={'origin':s.origin})
    assert known.json()==r.json() and store.sent==['carl.rausch@wteii.com']

def test_domain_not_whitelisted(env):
    c,store,s=env;r=c.post('/auth/verify-code',json={'email':'someone@wteii.com','code':'123456'},headers={'origin':s.origin})
    assert r.status_code==401

def test_cookie_flags_and_encrypted_server_tokens(env):
    h,r=login(env);cookie=r.headers['set-cookie']
    assert '__Host-ic_session=' in cookie and 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=strict' in cookie
    assert f'Max-Age={REMEMBER_COOKIE_SECONDS}' in cookie and 'access:' not in cookie and 'refresh:' not in cookie
    row=next(iter(env[1].sessions.values()));assert 'access:' not in row['encrypted_tokens']

def test_nonremembered_session_cookie(env):
    _,r=login(env,remember=False);assert 'Max-Age=' not in r.headers['set-cookie']

def test_viewer_can_read_links_and_database(env):
    login(env,'karen.lee@wteii.com');r=env[0].get('/api/snapshot');assert r.status_code==200 and len(r.json()['contacts'])==1

@pytest.mark.parametrize('method,path,data',[
 ('put','/api/contacts/P001',payload()),('post','/api/contacts',{'id':'NEW','record':{'name':'New','priority_score':1}}),
 ('delete','/api/contacts/P001?version=1',{}),('put','/api/admin/members',{'email':'other@example.test','role':'editor'}),
 ('post','/api/admin/export',{})])
def test_viewer_all_writes_blocked(env,method,path,data):
    h,_=login(env,'karen.lee@wteii.com');r=getattr(env[0],method)(path,json=data,headers=h) if method!='delete' else env[0].request('DELETE',path,json=data,headers=h)
    assert r.status_code==403,r.text

def test_editor_cannot_manage_access_or_delete(env):
    h,_=login(env);c=env[0]
    assert c.get('/api/admin/members').status_code==403
    assert c.get('/api/admin/audit').status_code==403
    assert c.request('DELETE','/api/contacts/P001?version=1',json={},headers=h).status_code==403

def test_editor_can_edit_and_bhoc_is_separate(env):
    h,_=login(env);r=env[0].put('/api/contacts/P001',json=payload(relationship='known'),headers=h)
    assert r.status_code==200 and r.json()['review_relationship']=='known' and r.json()['bhoc_active_contact']=='unknown'

def test_csrf_required(env):
    h,_=login(env);h.pop('X-CSRF-Token')
    assert env[0].put('/api/contacts/P001',json=payload(),headers=h).status_code==403

def test_foreign_origin_denied(env):
    h,_=login(env);h['Origin']='https://evil.example';assert env[0].put('/api/contacts/P001',json=payload(),headers=h).status_code==403

def test_body_author_cannot_be_forged(env):
    h,_=login(env);assert env[0].put('/api/contacts/P001',json=payload(entered_by='Archil'),headers=h).status_code==422

def test_patch_cannot_change_roles_or_audit(env):
    h,_=login(env);assert env[0].put('/api/contacts/P001',json=payload(patch={'role':'owner'}),headers=h).status_code==422

def test_stale_edit_rejected(env):
    h,_=login(env);env[1].row['version']=2
    assert env[0].put('/api/contacts/P001',json=payload(),headers=h).status_code==409

def test_red_requires_explicit_release(env):
    h,_=login(env);env[1].row['do_not_contact']=True
    assert env[0].put('/api/contacts/P001',json=payload(relationship='known'),headers=h).status_code==422
    assert env[0].put('/api/contacts/P001',json=payload(relationship='known',release_confirmed=True,release_reason='Reviewed and cleared'),headers=h).status_code==200

def test_revocation_terminates_next_request(env):
    login(env);env[1].members['carl.rausch@wteii.com']['enabled']=False
    assert env[0].get('/api/snapshot').status_code==403 and not env[1].sessions

def test_session_expiry(env):
    login(env);row=next(iter(env[1].sessions.values()));row['expires_at']=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
    assert env[0].get('/api/snapshot').status_code==401

def test_logout_invalidates_cookie_server_side(env):
    h,_=login(env);assert env[0].post('/auth/logout',json={},headers=h).status_code==200
    assert env[0].get('/api/snapshot').status_code==401 and not env[1].sessions

def test_code_cannot_be_reused_in_provider_mock(env):
    h,_=login(env);c,store,s=env
    assert c.post('/auth/verify-code',json={'email':'carl.rausch@wteii.com','code':'123456'},headers={'origin':s.origin}).status_code==401

def test_owner_is_not_inferred_from_name(env):
    c,store,s=env;assert c.post('/auth/verify-code',json={'email':'archil@example.test','code':'123456'},headers={'origin':s.origin}).status_code==401

def test_owner_read_admin_and_export(env):
    h,_=login(env,'owner@example.test');c=env[0]
    assert c.get('/api/admin/members').status_code==200
    assert c.post('/api/admin/export',json={},headers=h).status_code==200

def test_admin_needs_recent_verification(env):
    h,_=login(env,'owner@example.test');row=next(iter(env[1].sessions.values()));row['created_at']=(datetime.now(timezone.utc)-timedelta(minutes=20)).isoformat()
    assert env[0].post('/api/admin/export',json={},headers=h).status_code==428

def test_no_caching_and_no_frame(env):
    r=env[0].get('/');assert 'no-store' in r.headers['cache-control'] and r.headers['x-frame-options']=='DENY'
    assert "frame-ancestors 'none'" in r.headers['content-security-policy']

def test_exact_email_normalisation():assert normalize_email(' Carl.Rausch@wteii.com ')=='carl.rausch@wteii.com'

def test_bad_links_rejected():
    for url in ['javascript:alert(1)','file:///etc/passwd','data:text/html,secret','https://name:pass@example.test/']:
        with pytest.raises(HTTPException):validate_patch({'linkedin_url':url})

def test_no_client_local_storage_or_embedded_seed():
    p=Path(__file__).resolve().parents[1]/'app/static'
    assets=''.join(f.read_text() for f in p.iterdir())
    assert 'localStorage' not in assets and 'Karen Humm' not in assets and 'Last Carl validation' not in assets
    assert 'BHOC Active Contact' in assets and 'carl.rausch@wteii.com' not in assets

def test_rate_limit(env):
    c,store,s=env
    results=[c.post('/auth/request-code',json={'email':'nobody@example.test'},headers={'origin':s.origin}).status_code for _ in range(6)]
    assert results[-1]==429


def test_remember_has_no_server_deadline(env):
    login(env)
    row=next(iter(env[1].sessions.values()))
    assert row['remembered'] is True and row['expires_at'] is None

@pytest.mark.parametrize('age_days,idle_days',[(31,8),(365,120),(3650,1000)])
def test_remember_no_age_or_inactivity_expiry(env,age_days,idle_days):
    login(env)
    row=next(iter(env[1].sessions.values()))
    row['created_at']=(datetime.now(timezone.utc)-timedelta(days=age_days)).isoformat()
    row['last_seen_at']=(datetime.now(timezone.utc)-timedelta(days=idle_days)).isoformat()
    assert env[0].get('/api/snapshot').status_code==200
    assert row['expires_at'] is None

def test_remember_cookie_renews_on_success(env):
    login(env)
    r=env[0].get('/api/me')
    assert f'Max-Age={REMEMBER_COOKIE_SECONDS}' in r.headers['set-cookie']
    assert 'HttpOnly' in r.headers['set-cookie'] and 'Secure' in r.headers['set-cookie']

def test_denied_request_does_not_renew_cookie(env):
    login(env,'karen.lee@wteii.com')
    r=env[0].get('/api/admin/members')
    assert r.status_code==403 and 'set-cookie' not in r.headers

def test_nonremembered_session_never_renews_cookie(env):
    login(env,remember=False)
    r=env[0].get('/api/me')
    assert r.status_code==200 and 'set-cookie' not in r.headers
    row=next(iter(env[1].sessions.values()))
    assert row['remembered'] is False
    assert datetime.fromisoformat(row['expires_at'])-datetime.fromisoformat(row['created_at'])==timedelta(hours=12)

def test_nonremembered_session_cannot_become_infinite(env):
    login(env,remember=False)
    row=next(iter(env[1].sessions.values()))
    row['expires_at']=None
    assert env[0].get('/api/snapshot').status_code==401

def test_legacy_session_not_silently_promoted(env):
    login(env)
    row=next(iter(env[1].sessions.values()))
    row.pop('remembered')
    row['created_at']=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat()
    row['expires_at']=(datetime.now(timezone.utc)+timedelta(days=28)).isoformat()
    assert env[0].get('/api/snapshot').status_code==401

def test_logout_does_not_reissue_remember_cookie(env):
    h,_=login(env)
    r=env[0].post('/auth/logout',json={},headers=h)
    assert 'Max-Age=0' in r.headers['set-cookie']
    assert f'Max-Age={REMEMBER_COOKIE_SECONDS}' not in r.headers['set-cookie']

def second_browser(env,email='carl.rausch@wteii.com'):
    _,store,s=env
    other=TestClient(create_app(s,store),base_url=s.origin)
    # Simulate a DIFFERENT valid email code issued for this second verification.
    # Live provider code generation, expiry and delivery are not tested here.
    store.verify_used.discard(email)
    h,_=login((other,store,s),email)
    return other,h

@pytest.mark.parametrize('email,role',[
    ('owner@example.test','owner'),('carl.rausch@wteii.com','editor'),('karen.lee@wteii.com','viewer')])
def test_new_device_needs_code_and_keeps_previous_device(env,email,role):
    login(env,email)
    _,store,s=env
    new=TestClient(create_app(s,store),base_url=s.origin)
    assert new.get('/api/snapshot').status_code==401
    other,_=second_browser(env,email)
    assert len(store.sessions)==2
    assert env[0].get('/api/me').json()['role']==role
    assert other.get('/api/me').json()['role']==role

def test_logout_only_affects_current_browser(env):
    login(env)
    other,h=second_browser(env)
    assert other.post('/auth/logout',json={},headers=h).status_code==200
    assert other.get('/api/snapshot').status_code==401
    assert env[0].get('/api/snapshot').status_code==200
    assert len(env[1].sessions)==1

def test_revoked_membership_denies_all_remembered_devices(env):
    login(env)
    other,_=second_browser(env)
    env[1].members['carl.rausch@wteii.com']['enabled']=False
    assert env[0].get('/api/snapshot').status_code==403
    assert other.get('/api/snapshot').status_code==403
    assert not env[1].sessions

def test_concurrent_revocation_cannot_resurrect_session(env):
    login(env)
    store=env[1]
    original=store.session_touch
    async def revoke_before_touch(row):
        store.sessions.pop(row['token_hash'],None)
        return await original(row)
    store.session_touch=revoke_before_touch
    r=env[0].get('/api/snapshot')
    assert r.status_code==401 and not store.sessions
    assert 'set-cookie' not in r.headers

def expire_upstream_token(env):
    store,s=env[1:]
    row=next(iter(store.sessions.values()))
    cipher=Fernet(s.session_key.encode())
    auth=json.loads(cipher.decrypt(row['encrypted_tokens'].encode()))
    auth['expires_at']=time.time()-5
    row['encrypted_tokens']=cipher.encrypt(json.dumps(auth).encode()).decode()

@pytest.mark.parametrize('status',[429,503])
def test_temporary_refresh_failure_denies_data_but_keeps_session(env,status):
    login(env)
    expire_upstream_token(env)
    original=env[1].call
    async def unavailable(method,path,**kw):
        if path=='/auth/v1/token':raise HTTPException(status,'Temporary provider error')
        return await original(method,path,**kw)
    env[1].call=unavailable
    r=env[0].get('/api/snapshot')
    assert r.status_code==status and len(env[1].sessions)==1
    assert 'set-cookie' not in r.headers
    env[1].call=original
    assert env[0].get('/api/snapshot').status_code==200

def test_invalid_provider_refresh_requires_new_code(env):
    login(env)
    expire_upstream_token(env)
    original=env[1].call
    async def invalid(method,path,**kw):
        if path=='/auth/v1/token':raise HTTPException(400,'Invalid refresh token')
        return await original(method,path,**kw)
    env[1].call=invalid
    assert env[0].get('/api/snapshot').status_code==401
    assert not env[1].sessions

def test_store_touch_is_update_only_and_does_not_change_consent():
    import asyncio
    from app.store import Store
    calls=[]
    store=Store(None)
    async def fake_call(method,path,**kw):
        calls.append((method,path,kw));return [{'token_hash':'hash'}]
    store.call=fake_call
    row={'token_hash':'hash','last_seen_at':'now','encrypted_tokens':'ciphertext',
         'remembered':True,'email':'not-sent@example.test','expires_at':None}
    assert asyncio.run(store.session_touch(row)) is True
    method,path,kw=calls[0]
    assert method=='PATCH' and path=='/rest/v1/ic_web_sessions'
    assert set(kw['body'])=={'last_seen_at','encrypted_tokens'}
    assert kw['params']['token_hash']=='eq.hash'
