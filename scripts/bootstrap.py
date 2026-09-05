#!/usr/bin/env python3
"""Provision exact Auth identities and import the seed once. Sends no email."""
import argparse,asyncio,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.settings import Settings
from app.store import Store
from app.main import normalize_email

async def run(owner_email,seed):
    owner_email=normalize_email(owner_email)
    if owner_email in ('carl.rausch@wteii.com','karen.lee@wteii.com'):
        raise ValueError('The owner must be Archil\'s own verified email, not an editor or viewer address.')
    backend=Store(Settings.from_env())
    owners=await backend.call('GET','/rest/v1/ic_members',params={'role':'eq.owner','select':'*'},service=True)
    if owners and owners[0]['email']!=owner_email:
        raise ValueError('A different owner already exists. No changes were made.')
    users=[];page=1
    while True:
        result=await backend.call('GET','/auth/v1/admin/users',params={'page':page,'per_page':100},service=True)
        batch=result.get('users',[]);users.extend(batch)
        if len(batch)<100:break
        page+=1
    roster=[(owner_email,'Archil Jaliashvili','owner'),('carl.rausch@wteii.com','Carl Rausch','editor'),('karen.lee@wteii.com','Karen Lee','viewer')]
    for email,name,role in roster:
        user=next((u for u in users if str(u.get('email','')).lower()==email),None)
        if not user:
            user=await backend.call('POST','/auth/v1/admin/users',body={'email':email,'email_confirm':False},service=True)
            user=user.get('user',user)
        current=await backend.call('GET','/rest/v1/ic_members',params={'email':'eq.'+email,'select':'*'},service=True)
        if current:
            # Preserve deliberate revocations or role changes when re-running bootstrap.
            if current[0]['user_id'] not in (None,user['id']):raise ValueError('An account binding has changed. Manual review required.')
            await backend.call('PATCH','/rest/v1/ic_members',params={'email':'eq.'+email},body={'user_id':user['id']},service=True)
        else:
            await backend.call('POST','/rest/v1/ic_members',body={'email':email,'user_id':user['id'],'role':role,'enabled':True,'display_name':name},service=True)
    if seed:
        existing=await backend.call('GET','/rest/v1/ic_contacts',params={'select':'id','limit':1},service=True)
        if existing:raise ValueError('Contacts already exist. Refusing to overwrite live records with the old seed.')
        source=Path(__file__).resolve().parents[1]/'veterinary/data/snapshot.json'
        data=json.loads(source.read_text())
        if data.get('carl_reviews'):
            raise ValueError('Offline human reviews exist. Migrate them explicitly without claiming authenticated authorship.')
        await backend.call('POST','/rest/v1/ic_contacts',body=[{'id':e['id'],'record':e} for e in data['entities']],service=True)
        resources=[]
        for key,value in data.items():
            if key in ('entities','carl_reviews'):continue
            if isinstance(value,list):
                resources.extend({'collection':key,'id':str(v.get('id',i)) if isinstance(v,dict) else str(i),'payload':v} for i,v in enumerate(value))
            else:resources.append({'collection':key,'id':'__singleton__','payload':value})
        for i in range(0,len(resources),100):
            await backend.call('POST','/rest/v1/ic_resources',body=resources[i:i+100],service=True,prefer='resolution=merge-duplicates')
        print('Imported original seed:',len(data['entities']),'contacts and',len(data['sources']),'sources. No external facts were re-verified.')
    print('Exact accounts are provisioned. No invitation or OTP email was sent. Email verification is still required.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--owner-email',required=True);p.add_argument('--seed',action='store_true');args=p.parse_args()
    try:asyncio.run(run(args.owner_email,args.seed))
    except Exception as e:
        print('Bootstrap stopped:',str(e),file=sys.stderr);sys.exit(1)
