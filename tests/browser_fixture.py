"""Local-only synthetic Auth fixture. Never deployed or included in runtime image."""
import json
from pathlib import Path
from cryptography.fernet import Fernet
from app.main import create_app
from app.settings import Settings
from tests.test_security import FakeStore
class BrowserStore(FakeStore):
    def __init__(self):
        super().__init__();data=json.loads((Path(__file__).resolve().parents[1]/'veterinary/data/snapshot.json').read_text())
        self.snapshot_data={'contacts':[{'id':r['id'],'record':r,'version':1,'review_relationship':'not_assessed','review_valuable':False,'do_not_contact':False,'review_note':'','bhoc_active_contact':'unknown','bhoc_last_contact_on':None}for r in data.pop('entities')], 'resources':data}
    async def snapshot(self,token):return self.snapshot_data
settings=Settings('https://example.supabase.co','test-public','test-secret',Fernet.generate_key().decode(),'http://127.0.0.1:8787',True)
app=create_app(settings,BrowserStore())
