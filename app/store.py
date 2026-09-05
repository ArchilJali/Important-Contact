"""Supabase REST adapter. Contact reads/writes use the user's token, not a service key."""
from __future__ import annotations
import httpx
from fastapi import HTTPException

class Store:
    def __init__(self, settings):
        self.s=settings

    async def call(self, method, path, *, body=None, params=None, token=None, service=False, prefer=None):
        key=self.s.secret_key if service else self.s.publishable_key
        headers={'apikey':key}
        # New sb_secret/sb_publishable keys are API keys, not JWTs.
        if token: headers['Authorization']='Bearer '+token
        elif service and key.startswith('eyJ'): headers['Authorization']='Bearer '+key
        if prefer: headers['Prefer']=prefer
        async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
            try:
                r=await client.request(method,self.s.supabase_url+path,json=body,params=params,headers=headers)
            except httpx.HTTPError:
                raise HTTPException(503,'Authentication or storage service is unavailable') from None
        if r.status_code>=400:
            try: data=r.json()
            except ValueError: data={}
            code=data.get('code','')
            if code=='40001': raise HTTPException(409,'This record changed. Reload before saving.')
            if code in ('23514','22023','22P02'): raise HTTPException(422,data.get('message','Invalid value'))
            if r.status_code in (401,403) or code=='42501': raise HTTPException(403,'Access is not permitted')
            if r.status_code==429: raise HTTPException(429,'Too many attempts. Try again later.')
            if r.status_code==404: raise HTTPException(404,'Record not found')
            # Do not leak provider bodies, tokens, SQL or details about other accounts.
            raise HTTPException(400 if r.status_code<500 else 503,'The request could not be completed')
        return r.json() if r.content else None

    async def member_by_email(self,email):
        rows=await self.call('GET','/rest/v1/ic_members',params={'email':'eq.'+email,'enabled':'eq.true','select':'*'},service=True)
        return rows[0] if rows else None

    async def limit(self,key,window,maximum):
        ok=await self.call('POST','/rest/v1/rpc/ic_consume_limit',body={'p_key':key,'p_window':window,'p_limit':maximum},service=True)
        if not ok: raise HTTPException(429,'Too many attempts. Try again later.')

    async def session_get(self,token_hash):
        rows=await self.call('GET','/rest/v1/ic_web_sessions',params={'token_hash':'eq.'+token_hash,'select':'*'},service=True)
        return rows[0] if rows else None

    async def session_put(self,row):
        await self.call('POST','/rest/v1/ic_web_sessions',body=row,service=True,prefer='resolution=merge-duplicates')

    async def session_touch(self,row):
        # PATCH cannot resurrect a session deleted by revocation or logout. Never
        # rewrite identity, CSRF, remembered consent or expiry from a stale read.
        rows=await self.call('PATCH','/rest/v1/ic_web_sessions',
            params={'token_hash':'eq.'+row['token_hash'],'select':'token_hash'},
            body={'last_seen_at':row['last_seen_at'],'encrypted_tokens':row['encrypted_tokens']},
            service=True,prefer='return=representation')
        return bool(rows)

    async def session_delete(self,token_hash):
        await self.call('DELETE','/rest/v1/ic_web_sessions',params={'token_hash':'eq.'+token_hash},service=True)

    async def user(self,token):
        return await self.call('GET','/auth/v1/user',token=token)

    async def role(self,token):
        return await self.call('POST','/rest/v1/rpc/ic_role',body={},token=token)

    async def all_rows(self,table,token):
        # Do not silently stop at Supabase's default maximum row count.
        rows=[]; offset=0
        order={'ic_contacts':'id','ic_resources':'collection,id','ic_audit':'id','ic_members':'email'}[table]
        while True:
            page=await self.call('GET','/rest/v1/'+table,params={'select':'*','order':order,'offset':offset,'limit':500},token=token)
            rows.extend(page)
            if len(page)<500: return rows
            offset+=500

    async def snapshot(self,token):
        contacts=await self.all_rows('ic_contacts',token)
        refs=await self.all_rows('ic_resources',token)
        resources={}
        for row in refs:
            if row['id']=='__singleton__': resources[row['collection']]=row['payload']
            else: resources.setdefault(row['collection'],[]).append(row['payload'])
        return {'contacts':contacts,'resources':resources}
