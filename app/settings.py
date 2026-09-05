"""Fail-closed deployment configuration; never put these values in browser files."""
from dataclasses import dataclass
import os
from urllib.parse import urlparse
from cryptography.fernet import Fernet

@dataclass(frozen=True)
class Settings:
    supabase_url: str
    publishable_key: str
    secret_key: str
    session_key: str
    origin: str
    development: bool = False

    @property
    def cookie_name(self):
        return 'ic_dev_session' if self.development else '__Host-ic_session'

    @classmethod
    def from_env(cls):
        names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SESSION_ENCRYPTION_KEY','APP_ORIGIN']
        values=[os.getenv(n,'').strip() for n in names]
        if not all(values):
            raise RuntimeError('Missing required server settings: '+', '.join(n for n,v in zip(names,values) if not v))
        dev=os.getenv('IC_DEVELOPMENT')=='1'
        origin=values[4].rstrip('/')
        parsed=urlparse(origin)
        if parsed.path or parsed.query or parsed.fragment or not parsed.hostname:
            raise RuntimeError('APP_ORIGIN must be an origin without a path')
        if parsed.scheme!='https' and not (dev and parsed.hostname in ('localhost','127.0.0.1')):
            raise RuntimeError('HTTPS is mandatory outside local development')
        if not values[0].startswith('https://'):
            raise RuntimeError('Use a TLS Supabase endpoint')
        Fernet(values[3].encode())  # Validate before accepting traffic.
        return cls(values[0].rstrip('/'),values[1],values[2],values[3],origin,dev)
