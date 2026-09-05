"""Offline publisher tests. The fake API does not call or modify GitHub."""
import base64
import copy
import importlib.util
import json
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location('ic_publisher', Path(__file__).parents[1]/'scripts/publish_github.py')
p = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(p)


def item(content, mode='100644'):
    raw = content.encode() if isinstance(content,str) else content
    return {'data':raw,'sha':p.git_blob_sha(raw),'mode':mode}


def payload():
    files={p.MARKER:item(json.dumps({'project_id':p.PROJECT_ID})),
           'README.md':item('# Important Contact'),
           'veterinary/data/snapshot.json':item('{"entities":[]}'),
           'docs/preview.png':item(b'\x89PNG\x00\xff'),
           'Publish-to-GitHub.command':item('#!/bin/bash\n', '100755')}
    manifest={'files':[{'path':k,'git_blob_sha':v['sha']} for k,v in files.items()]}
    files[p.MANIFEST]=item(json.dumps(manifest))
    return files


class FakeGitHub:
    def __init__(self, exists=False, private=True, login='ArchilJali'):
        self.login=login
        self.exists=exists
        self.meta={'full_name':p.REPOSITORY,'private':private,'archived':False,'has_pages':False,'default_branch':'main'}
        self.calls=[]
        self.blobs={}
        self.trees={}
        self.commits={}
        self.head=None
        self.advance_on_check=False
        self.checks=0
        if exists:self.initialize()

    def add_blob(self,raw):
        sha=p.git_blob_sha(raw)
        self.blobs[sha]=raw
        return sha

    def make_tree(self, files):
        tree={name:{'path':name,'type':'blob','sha':self.add_blob(v['data']),'mode':v['mode']} for name,v in files.items()}
        return self.save_tree(tree)

    def save_tree(self,tree):
        sha='tree'+str(len(self.trees))
        self.trees[sha]=copy.deepcopy(tree)
        return sha

    def initialize(self,files=None):
        tree=self.make_tree(files or {'README.md':item('# Important-Contact')})
        sha='commit'+str(len(self.commits))
        self.commits[sha]={'sha':sha,'tree':{'sha':tree},'parents':[]}
        self.head=sha

    def call(self,method,endpoint,body=None):
        self.calls.append((method,endpoint,body))
        prefix='/repos/'+p.REPOSITORY
        if endpoint=='/user':return {'login':self.login}
        if endpoint=='/user/repos' and method=='POST':
            assert body['private'] is True
            self.exists=True;self.meta['private']=body['private'];self.initialize()
            return copy.deepcopy(self.meta)
        if endpoint==prefix:
            if not self.exists:raise p.ApiError(404,method,endpoint)
            return copy.deepcopy(self.meta)
        if endpoint==prefix+'/git/ref/heads/main':
            if not self.head:raise p.ApiError(409,method,endpoint)
            self.checks+=1
            if self.advance_on_check and self.checks==2:
                self.head='concurrent'
            return {'object':{'sha':self.head}}
        if endpoint.startswith(prefix+'/git/commits/') and method=='GET':
            return copy.deepcopy(self.commits[endpoint.rsplit('/',1)[1]])
        if endpoint.startswith(prefix+'/git/trees/') and method=='GET':
            sha=endpoint.rsplit('/',1)[1].split('?')[0]
            return {'tree':list(copy.deepcopy(self.trees[sha]).values()),'truncated':False}
        if endpoint.startswith(prefix+'/git/blobs/') and method=='GET':
            raw=self.blobs[endpoint.rsplit('/',1)[1]]
            return {'encoding':'base64','content':base64.b64encode(raw).decode()}
        if endpoint==prefix+'/git/blobs' and method=='POST':
            return {'sha':self.add_blob(base64.b64decode(body['content']))}
        if endpoint==prefix+'/git/trees' and method=='POST':
            tree=copy.deepcopy(self.trees[body['base_tree']])
            for row in body['tree']:
                entry={k:row[k] for k in ['path','type','mode']}
                entry['sha']=row.get('sha') or self.add_blob(row['content'].encode())
                tree[row['path']]=entry
            return {'sha':self.save_tree(tree)}
        if endpoint==prefix+'/git/commits' and method=='POST':
            sha='commit'+str(len(self.commits))
            self.commits[sha]={'sha':sha,'tree':{'sha':body['tree']},'parents':body['parents']}
            return copy.deepcopy(self.commits[sha])
        if endpoint==prefix+'/git/refs/heads/main' and method=='PATCH':
            assert body['force'] is False
            self.head=body['sha'];return {'object':{'sha':self.head}}
        if endpoint==prefix+'/contents/'+p.MARKER and method=='PUT':
            self.initialize({p.MARKER:item(base64.b64decode(body['content']))})
            return {'commit':{'sha':self.head}}
        raise AssertionError((method,endpoint))


def test_creates_private_repository_and_verifies_every_blob():
    api=FakeGitHub()
    result=p.publish(api,payload())
    assert result['private'] is True
    assert result['status']=='verified'
    assert result['files_verified']==len(payload())
    assert result['web_application_deployed'] is False
    assert result['scheduler_activated'] is False
    assert '/veterinary' in result['veterinary_url']


def test_repeat_is_idempotent():
    api=FakeGitHub()
    first=p.publish(api,payload());start=len(api.calls)
    second=p.publish(api,payload())
    assert first['commit']==second['commit']
    assert all(method=='GET' for method,_,_ in api.calls[start:])


def test_rejects_wrong_account_before_mutation():
    api=FakeGitHub(login='SomeoneElse')
    with pytest.raises(p.PublishError,match='Wrong GitHub account'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls)


def test_rejects_public_repository_before_upload():
    api=FakeGitHub(exists=True,private=False)
    with pytest.raises(p.PublishError,match='PRIVATE'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls)


def test_rejects_pages_before_upload():
    api=FakeGitHub(exists=True);api.meta['has_pages']=True
    with pytest.raises(p.PublishError,match='Pages'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls)


def test_rejects_unrelated_repository_before_upload():
    api=FakeGitHub(exists=True);api.initialize({'other-project.py':item('other')})
    with pytest.raises(p.PublishError,match='unrecognised'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls)


def test_rejects_existing_workflows_before_upload():
    api=FakeGitHub(exists=True);api.initialize({'.github/workflows/unsafe.yml':item('name: other')})
    with pytest.raises(p.PublishError,match='workflow'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls)


def test_preserves_remote_edits():
    api=FakeGitHub();p.publish(api,payload())
    tree=api.trees[api.commits[api.head]['tree']['sha']]
    tree['README.md']['sha']=api.add_blob(b'user edited this')
    start=len(api.calls)
    with pytest.raises(p.PublishError,match='Refusing to overwrite'):p.publish(api,payload())
    assert all(method=='GET' for method,_,_ in api.calls[start:])


def test_concurrent_commit_is_not_overwritten():
    api=FakeGitHub(exists=True);api.advance_on_check=True
    with pytest.raises(p.PublishError,match='Another commit'):p.publish(api,payload())
    assert not any(method=='PATCH' for method,_,_ in api.calls)
    assert api.head=='concurrent'


def test_existing_empty_repo_can_be_initialized_privately():
    api=FakeGitHub(exists=True);api.head=None
    result=p.publish(api,payload())
    assert result['status']=='verified'
    assert result['created_repository'] is False


@pytest.mark.parametrize('path',['../secret','/etc/passwd','.env','.local/session','keys/private.pem','a\\b'])
def test_rejects_local_only_and_unsafe_paths(path):
    with pytest.raises(p.PublishError):p.safe_relative(path)


def test_example_env_path_allowed():
    assert str(p.safe_relative('.env.example'))=='.env.example'


def test_non404_errors_are_not_misread_as_missing_repo():
    class Error:
        def call(self,*args):raise p.ApiError(403,'GET','/repos/x/y')
    with pytest.raises(p.ApiError) as error:p.optional(Error(),'/repos/x/y')
    assert error.value.status==403
