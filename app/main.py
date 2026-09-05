"""Private BFF: OTP handled by Supabase, opaque HttpOnly browser sessions, checked writes."""
from __future__ import annotations
import hashlib,hmac,json,re,secrets,time
from datetime import date,datetime,timedelta,timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from cryptography.fernet import Fernet,InvalidToken
from fastapi import FastAPI,HTTPException,Request
from fastapi.responses import FileResponse,JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field,ConfigDict,field_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .settings import Settings
from .store import Store

ROOT=Path(__file__).parent
ROLES={'owner','editor','viewer'}
# Browser retention is finite and renewable, even when the server grants no fixed expiry.
REMEMBER_COOKIE_SECONDS=400*86400
TEMPORARY_SESSION_SECONDS=12*3600
EDITABLE={'name','role_summary','country_tags','species_tags','sections','linkedin_url','contact_page',
 'public_professional_email','priority_score','priority_reason','known_gaps','next_action'}

def now(): return datetime.now(timezone.utc)
def stamp(t): return t.isoformat()
def parse(t): return datetime.fromisoformat(t.replace('Z','+00:00'))
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def normalize_email(value):
    value=value.strip().lower()
    if not re.fullmatch(r'[^\s@,;<>]{1,64}@[^\s@,;<>]+\.[^\s@,;<>]+',value) or len(value)>254:
        raise ValueError('Enter a valid email address')
    return value

def validate_patch(patch):
    if set(patch)-EDITABLE: raise HTTPException(422,'Unsupported editable field')
    if len(json.dumps(patch))>30000: raise HTTPException(422,'Contact changes are too large')
    for key in ['country_tags','species_tags','sections']:
        if key in patch and (not isinstance(patch[key],list) or len(patch[key])>50 or any(not isinstance(x,str) or len(x)>100 for x in patch[key])):
            raise HTTPException(422,'Invalid classification')
    if 'name' in patch and (not isinstance(patch['name'],str) or not patch['name'].strip() or len(patch['name'])>300):
        raise HTTPException(422,'Name is required')
    if 'priority_score' in patch and (type(patch['priority_score']) is not int or not 1<=patch['priority_score']<=10):
        raise HTTPException(422,'Priority must be 1-10')
    for key in ['linkedin_url','contact_page']:
        value=patch.get(key)
        if value is not None:
            if not isinstance(value,str) or len(value)>2000: raise HTTPException(422,'Invalid URL')
            if value and (urlparse(value).scheme not in ('http','https') or not urlparse(value).netloc or urlparse(value).username):
                raise HTTPException(422,'Use a valid HTTP(S) link')
    for key,value in patch.items():
        if key not in ('country_tags','species_tags','sections','priority_score') and value is not None and (not isinstance(value,str) or len(value)>4000):
            raise HTTPException(422,'Invalid text value')

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid')
class EmailInput(StrictModel):
    email: str=Field(max_length=254)
    @field_validator('email')
    @classmethod
    def email_valid(cls,v): return normalize_email(v)
class VerifyInput(EmailInput):
    code: str=Field(pattern=r'^\d{6}$')
    remember: bool=False
class ContactUpdate(StrictModel):
    version:int=Field(ge=1)
    patch:dict=Field(default_factory=dict)
    relationship:Literal['known','not_known','not_assessed']='not_assessed'
    valuable:bool=False
    restricted:bool=False
    note:str=Field(default='',max_length=4000)
    active:Literal['active','inactive','unknown']='unknown'
    last_contact:date|None=None
    release_confirmed:bool=False
    release_reason:str=Field(default='',max_length=1000)
class NewContact(StrictModel):
    id:str=Field(pattern=r'^[A-Za-z0-9_-]{1,80}$')
    record:dict
class MemberInput(EmailInput):
    role:Literal['editor','viewer']
    enabled:bool=True
    display_name:str=Field(default='',max_length=150)


def create_app(settings:Settings|None=None,store=None):
    s=settings or Settings.from_env(); backend=store or Store(s)
    cipher=Fernet(s.session_key.encode())
    app=FastAPI(title='Important Contact',docs_url=None,redoc_url=None,openapi_url=None)
    app.state.store=backend
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=[urlparse(s.origin).hostname])

    def set_remember_cookie(response,token):
        response.set_cookie(s.cookie_name,token,max_age=REMEMBER_COOKIE_SECONDS,
                            secure=not s.development,httponly=True,samesite='strict',path='/')

    @app.middleware('http')
    async def safety(request,call_next):
        if request.method in ('POST','PUT','PATCH','DELETE'):
            if request.headers.get('origin')!=s.origin:
                return JSONResponse({'detail':'Origin not allowed'},403,headers={'Cache-Control':'no-store'})
            if request.headers.get('content-type','').split(';')[0]!='application/json':
                return JSONResponse({'detail':'JSON is required'},415)
            # Read and bound the whole body as well as Content-Length, preventing chunked bypasses.
            try:
                if int(request.headers.get('content-length','0'))>65536: return JSONResponse({'detail':'Request too large'},413)
            except ValueError: return JSONResponse({'detail':'Invalid Content-Length'},400)
            total=0;parts=[]
            async for chunk in request.stream():
                total+=len(chunk)
                if total>65536: return JSONResponse({'detail':'Request too large'},413)
                parts.append(chunk)
            request._body=b''.join(parts)
        response=await call_next(request)
        # Renew only after a successful authenticated response, never after logout or denial.
        remembered_token=getattr(request.state,'remembered_token',None)
        if remembered_token and 200<=response.status_code<300 and request.url.path!='/auth/logout':
            set_remember_cookie(response,remembered_token)
        response.headers.update({
            'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache',
            'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
            'X-Robots-Tag':'noindex, nofollow, noarchive',
            'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        if not s.development: response.headers['Strict-Transport-Security']='max-age=31536000'
        return response

    async def rate(request,email,stage):
        # Use the actual peer address, not an attacker-controlled X-Forwarded-For header.
        # Configure the hosting proxy/uvicorn trusted proxy list explicitly before launch.
        ip=request.client.host if request.client else 'unknown'
        for value,maximum in [('email:'+email,5),('ip:'+ip,30)]:
            key=hmac.new(s.session_key.encode(),(stage+':'+value).encode(),hashlib.sha256).hexdigest()
            await backend.limit(key,900,maximum)

    async def identity(request,allowed=None,write=False,fresh=False):
        token=request.cookies.get(s.cookie_name,'')
        if not re.fullmatch(r'[A-Za-z0-9_-]{40,80}',token): raise HTTPException(401,'Please sign in')
        key=digest(token);row=await backend.session_get(key)
        if not row:
            raise HTTPException(401,'Please sign in again')
        # Remembered sessions have no application age/inactivity timeout. A non-null
        # expiry is still honoured as an explicit restriction; legacy/temporary
        # records never inherit indefinite trust without a new code verification.
        expired=bool(row.get('expires_at') and parse(row['expires_at'])<=now())
        if not row.get('remembered',False):
            expired=expired or not row.get('expires_at') or parse(row['created_at'])<=now()-timedelta(seconds=TEMPORARY_SESSION_SECONDS)
        if expired:
            await backend.session_delete(key)
            raise HTTPException(401,'Your session has expired. Please sign in again.')
        try: auth=json.loads(cipher.decrypt(row['encrypted_tokens'].encode()))
        except (InvalidToken,ValueError):
            await backend.session_delete(key);raise HTTPException(401,'Please sign in again') from None
        if auth['expires_at']<time.time()+45:
            try:
                refreshed=await backend.call('POST','/auth/v1/token',params={'grant_type':'refresh_token'},body={'refresh_token':auth['refresh_token']})
                auth={'access_token':refreshed['access_token'],'refresh_token':refreshed['refresh_token'],
                      'expires_at':time.time()+refreshed['expires_in']}
            except HTTPException as error:
                # A temporary service outage must deny data, not destroy device trust.
                if error.status_code in (429,503): raise
                await backend.session_delete(key);raise HTTPException(401,'Please sign in again') from None
        try: user=await backend.user(auth['access_token'])
        except HTTPException as error:
            if error.status_code==503: raise
            await backend.session_delete(key);raise HTTPException(401,'Please sign in again') from None
        member=await backend.member_by_email(row['email'])
        if (not member or member.get('user_id')!=user.get('id') or row['user_id']!=user.get('id')
          or not user.get('email_confirmed_at') or str(user.get('email','')).lower()!=row['email']):
            await backend.session_delete(key);raise HTTPException(403,'Access has been revoked')
        role=await backend.role(auth['access_token'])
        if role not in ROLES or role!=member['role']: raise HTTPException(403,'Access is not permitted')
        if allowed and role not in allowed: raise HTTPException(403,'Your account does not have permission for this action')
        if write and not hmac.compare_digest(request.headers.get('x-csrf-token',''),row['csrf_token']):
            raise HTTPException(403,'Security token mismatch. Reload the page.')
        if fresh and parse(row['created_at'])<now()-timedelta(minutes=15):
            raise HTTPException(428,'Please sign out and verify a new email code before changing access or exporting the full database.')
        row['last_seen_at']=stamp(now());row['encrypted_tokens']=cipher.encrypt(json.dumps(auth).encode()).decode()
        # Update-only: an in-flight request must never recreate a revoked session.
        if not await backend.session_touch(row):
            raise HTTPException(401,'Your session was revoked. Please sign in again.')
        if row.get('remembered',False): request.state.remembered_token=token
        return {'auth':auth,'row':row,'member':member,'role':role,'hash':key}

    @app.get('/')
    async def page(): return FileResponse(ROOT/'static/index.html')
    @app.get('/healthz')
    async def health(): return {'status':'ok'}
    @app.get('/robots.txt')
    async def robots():
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse('User-agent: *\nDisallow: /\n')
    app.mount('/assets',StaticFiles(directory=ROOT/'static'),name='assets')

    @app.post('/auth/request-code')
    async def request_code(data:EmailInput,request:Request):
        await rate(request,data.email,'request')
        member=await backend.member_by_email(data.email)
        if member and member.get('user_id'):
            try:
                await backend.call('POST','/auth/v1/otp',body={'email':data.email,'create_user':False})
            except HTTPException as e:
                # A generic response avoids revealing whether the email is on the allowlist.
                if e.status_code>=500: raise
        return {'message':'If this address has access, a six-digit sign-in code will arrive by email.'}

    @app.post('/auth/verify-code')
    async def verify_code(data:VerifyInput,request:Request):
        await rate(request,data.email,'verify')
        member=await backend.member_by_email(data.email)
        if not member or not member.get('user_id'): raise HTTPException(401,'Invalid or expired code')
        try:
            auth=await backend.call('POST','/auth/v1/verify',body={'email':data.email,'token':data.code,'type':'email'})
            user=await backend.user(auth['access_token'])
        except HTTPException as e:
            if e.status_code>=500: raise
            raise HTTPException(401,'Invalid or expired code') from None
        if (user['id']!=member['user_id'] or str(user.get('email','')).lower()!=data.email or not user.get('email_confirmed_at')
            or await backend.role(auth['access_token'])!=member['role']):
            raise HTTPException(403,'Access is not permitted')
        # Invalidate the old browser session before issuing a fresh unpredictable one.
        old=request.cookies.get(s.cookie_name)
        if old: await backend.session_delete(digest(old))
        token=secrets.token_urlsafe(32);created=now()
        row={'token_hash':digest(token),'user_id':user['id'],'email':data.email,
             'csrf_token':secrets.token_urlsafe(32),'created_at':stamp(created),
             'remembered':data.remember,
             'expires_at':None if data.remember else stamp(created+timedelta(seconds=TEMPORARY_SESSION_SECONDS)),
             'last_seen_at':stamp(created),
             'encrypted_tokens':cipher.encrypt(json.dumps({'access_token':auth['access_token'],'refresh_token':auth['refresh_token'],
                 'expires_at':time.time()+auth['expires_in']}).encode()).decode()}
        await backend.session_put(row)
        response=JSONResponse({'signed_in':True})
        if data.remember:
            set_remember_cookie(response,token)
        else:
            response.set_cookie(s.cookie_name,token,secure=not s.development,httponly=True,samesite='strict',path='/')
        return response

    @app.get('/api/me')
    async def me(request:Request):
        ctx=await identity(request)
        return {'email':ctx['member']['email'],'name':ctx['member']['display_name'],'role':ctx['role'],'csrf':ctx['row']['csrf_token']}

    @app.post('/auth/logout')
    async def logout(request:Request):
        ctx=await identity(request,write=True)
        await backend.session_delete(ctx['hash'])
        try: await backend.call('POST','/auth/v1/logout',params={'scope':'local'},token=ctx['auth']['access_token'])
        except HTTPException: pass  # The application session is already invalidated.
        response=JSONResponse({'signed_out':True})
        response.delete_cookie(s.cookie_name,path='/',secure=not s.development,httponly=True,samesite='strict')
        return response

    @app.get('/api/snapshot')
    async def snapshot(request:Request):
        ctx=await identity(request)
        return await backend.snapshot(ctx['auth']['access_token'])

    @app.put('/api/contacts/{contact_id}')
    async def update(contact_id:str,data:ContactUpdate,request:Request):
        ctx=await identity(request,{'owner','editor'},write=True);validate_patch(data.patch)
        if data.last_contact and data.last_contact>date.today(): raise HTTPException(422,'Last contact cannot be in the future')
        body={'p_id':contact_id,'p_version':data.version,'p_patch':data.patch,'p_relationship':data.relationship,
              'p_valuable':data.valuable,'p_restricted':data.restricted,'p_note':data.note,'p_active':data.active,
              'p_last_contact':data.last_contact.isoformat() if data.last_contact else None,
              'p_release_confirmed':data.release_confirmed,'p_release_reason':data.release_reason}
        return await backend.call('POST','/rest/v1/rpc/ic_save_contact',body=body,token=ctx['auth']['access_token'])

    @app.post('/api/contacts')
    async def create(data:NewContact,request:Request):
        ctx=await identity(request,{'owner'},write=True);validate_patch(data.record)
        record={'country_tags':[],'species_tags':[],'sections':[],'source_ids':[],'entity_type':'person',
                'priority_score':1,'role_summary':'','history_coverage':'not_researched',**data.record}
        return await backend.call('POST','/rest/v1/rpc/ic_create_contact',body={'p_id':data.id,'p_record':record},token=ctx['auth']['access_token'])

    @app.delete('/api/contacts/{contact_id}')
    async def delete(contact_id:str,request:Request,version:int):
        ctx=await identity(request,{'owner'},write=True)
        await backend.call('POST','/rest/v1/rpc/ic_delete_contact',body={'p_id':contact_id,'p_version':version},token=ctx['auth']['access_token'])
        return {'deleted':True}

    @app.get('/api/admin/members')
    async def members(request:Request):
        ctx=await identity(request,{'owner'})
        return await backend.all_rows('ic_members',ctx['auth']['access_token'])

    @app.put('/api/admin/members')
    async def change_member(data:MemberInput,request:Request):
        ctx=await identity(request,{'owner'},write=True,fresh=True)
        if data.email==ctx['member']['email']: raise HTTPException(422,'The owner cannot be changed here')
        # Look up Auth accounts through the server-only admin API; never expose admin credentials.
        existing=None;page=1
        while True:
            result=await backend.call('GET','/auth/v1/admin/users',params={'page':page,'per_page':100},service=True)
            users=result.get('users',[])
            existing=next((u for u in users if str(u.get('email','')).lower()==data.email),None)
            if existing or len(users)<100: break
            page+=1
        if not existing:
            if not data.enabled: raise HTTPException(404,'Account not found')
            # Creation alone sends NO invitation and does not confirm an email.
            await backend.call('POST','/auth/v1/admin/users',body={'email':data.email,'email_confirm':False},service=True)
        await backend.call('POST','/rest/v1/rpc/ic_set_member',body={'p_email':data.email,'p_role':data.role,
              'p_enabled':data.enabled,'p_display_name':data.display_name},token=ctx['auth']['access_token'])
        return {'saved':True,'email_sent':False}

    @app.get('/api/admin/audit')
    async def audit(request:Request):
        ctx=await identity(request,{'owner'})
        return await backend.all_rows('ic_audit',ctx['auth']['access_token'])

    @app.post('/api/admin/export')
    async def export(request:Request):
        ctx=await identity(request,{'owner'},write=True,fresh=True)
        data=await backend.snapshot(ctx['auth']['access_token'])
        data['audit']=await backend.all_rows('ic_audit',ctx['auth']['access_token'])
        data['exported_at']=stamp(now())
        return JSONResponse(data,headers={'Content-Disposition':'attachment; filename="Important-Contact-private.json"'})

    return app
