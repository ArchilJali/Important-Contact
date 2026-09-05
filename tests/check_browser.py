"""Visual/interaction smoke test against the explicit local fake-Auth fixture."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1050})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    import re
    seed=json.loads((ROOT/'veterinary/data/snapshot.json').read_text())
    contacts=[{'id':r['id'],'record':r,'version':1,'review_relationship':'not_assessed','review_valuable':False,'do_not_contact':False,'review_note':'','bhoc_active_contact':'unknown','bhoc_last_contact_on':None} for r in seed.pop('entities')]
    html=(ROOT/'app/static/index.html').read_text()
    html=re.sub(r'<link[^>]+>|<script[^>]*>.*?</script>','',html,flags=re.S)
    page.route('**/*',lambda route:route.abort())
    page.set_content(html)
    page.add_style_tag(content=(ROOT/'app/static/style.css').read_text())
    page.evaluate("""(snapshot)=>{
      let user=null;
      window.fetch=async(path,opts={})=>{
        const body=opts.body?JSON.parse(opts.body):{};
        let data={},status=200;
        if(path==='/auth/request-code') data={message:'Local test fixture: no email sent.'};
        else if(path==='/auth/verify-code') {user={email:body.email,name:body.email.startsWith('carl')?'Carl Rausch':'Karen Lee',role:body.email.startsWith('carl')?'editor':'viewer',csrf:'test-only'};data={signed_in:true};}
        else if(path==='/auth/logout'){user=null;data={signed_out:true};}
        else if(!user){status=401;data={detail:'Please sign in'};}
        else if(path==='/api/me')data=user;
        else if(path==='/api/snapshot')data=snapshot;
        else {status=403;data={detail:'Unsupported test operation'};}
        return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
      };
    }""",{'contacts':contacts,'resources':seed})
    page.add_script_tag(content=(ROOT/'app/static/app.js').read_text())
    page.locator('#login').wait_for(state='visible')
    page.screenshot(path=str(ROOT/'docs/login-desktop.png'),full_page=True)
    assert 'Karen Humm' not in page.content()
    results.append('Unauthenticated page contains no contacts')
    assert 'up to 30 days' not in page.content()
    results.append('Remember-until-revoked label replaces the old 30-day limit')
    page.locator('#email').fill('karen.lee@wteii.com');page.locator('#email-form button').click()
    assert 'until I sign out or access is revoked' in page.locator('#code-form').inner_text()
    assert not page.locator('#remember').is_checked()
    page.screenshot(path=str(ROOT/'docs/remember-device-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(ROOT/'docs/remember-device-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1050})
    page.locator('#code').fill('123456');page.locator('#code-form button.primary').click()
    page.locator('#workspace').wait_for(state='visible')
    assert page.locator('#contact-rows tr').count()==33
    assert page.locator('#create-contact').is_hidden()
    assert page.locator('#tabs').get_by_text('Access & History').count()==0
    assert page.get_by_text('Last Carl validation',exact=True).count()==0
    results.append('Viewer sees 33 contacts, BHOC Active Contact and no edit/admin UI')
    page.locator('#search').fill('Karen Humm')
    assert page.locator('#contact-rows tr').count()==1
    page.locator('.contact-name').click()
    assert page.locator('#contact-dialog a').count()>=1
    assert page.locator('#contact-dialog input').count()==0
    for a in page.locator('#contact-dialog a').all():
        assert a.get_attribute('href').startswith(('https://','http://','mailto:'))
        assert a.get_attribute('rel')=='noopener noreferrer'
    results.append('Viewer contact detail has working-format links and no editable inputs')
    page.locator('#close-dialog').click();page.locator('#reset').click()
    page.locator('#active-filter').select_option('active');assert page.locator('#contact-rows tr').count()==0
    page.locator('#active-filter').select_option('unknown');assert page.locator('#contact-rows tr').count()==33
    results.append('No active BHOC relationship is invented; all 33 are Not confirmed')
    page.locator('#reset').click()
    page.screenshot(path=str(ROOT/'docs/viewer-workspace-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ROOT/'docs/viewer-workspace-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    results.append('390px mobile page does not horizontally overflow; table scrolls internally')
    page.locator('#tabs').get_by_text('Sources',exact=True).click()
    assert page.locator('#resource-list .resource-card').count()==50
    results.append('Viewer can open all 50 source records')
    page.locator('#logout').click();page.locator('#login').wait_for(state='visible')
    page.locator('#email').fill('carl.rausch@wteii.com');page.locator('#email-form button').click()
    page.locator('#code').fill('123456');page.locator('#code-form button.primary').click()
    page.locator('#workspace').wait_for(state='visible')
    page.locator('#tabs').get_by_text('Contacts',exact=True).click();page.locator('.contact-name').first.click()
    assert page.locator('#edit-relation').is_visible() and page.locator('#edit-active').is_visible()
    assert page.get_by_text('Delete contact',exact=True).count()==0
    results.append('Editor can edit assessments and BHOC state but cannot delete')
    assert not errors,errors
    browser.close()
(ROOT/'docs/browser-test-results.json').write_text(json.dumps({'status':'passed','scope':'Browser-only mocked fetch, no network. Original private seed rendered for UI checks only; no real authentication, emails or deployed service tested','checks':results,'browser_errors':errors},indent=2))
print(json.dumps(results,indent=2))
