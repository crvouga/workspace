from pathlib import Path
import json,tempfile,shutil,threading,subprocess,os
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
os.chdir(Path(__file__).resolve().parents[4])
state={'initialized':False,'sealed':True,'shares':set(),'writes':[]}
keys=['fake-share-'+str(i) for i in range(3)]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def reply(self,d):
  b=json.dumps(d).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def status(self):return {'type':'shamir','initialized':state['initialized'],'sealed':state['sealed'],'t':2,'n':3,'progress':len(state['shares']),'nonce':'','version':'2.7.0','commit_date':'2026-08-18T15:48:19Z','cluster_name':'test','cluster_id':'test'}
 def do_GET(self):
  self.reply({'initialized':state['initialized']} if self.path=='/v1/sys/init' else self.status())
 def do_PUT(self):
  d=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/v1/sys/init':
   state['initialized']=True;self.reply({'keys':keys,'keys_base64':keys,'root_token':'fake-root-token'});return
  state['shares'].add(d['key']);state['writes'].append(d['key'])
  if len(state['shares'])>=2:state['sealed']=False
  self.reply(self.status())
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='workspace-tofu-test-') as d:
 root=Path(d);shutil.copytree('packages/infra/tofu/modules/inventory',root/'modules/inventory',ignore=shutil.ignore_patterns('.terraform'))
 bootstrap=root/'bootstrap';bootstrap.mkdir()
 for name in ['main.tf','versions.tf','variables.tf.json','.terraform.lock.hcl']:
  text=Path('packages/infra/tofu/bootstrap',name).read_text()
  if name=='versions.tf':text=text.replace('  backend "s3" {}\n','')
  if name=='main.tf':text=text.replace('"https://${module.inventory.config.vault.hostname}"','"http://127.0.0.1:'+str(server.server_port)+'"')
  (bootstrap/name).write_text(text)
 env={**os.environ,'TF_VAR_state_passphrase':'fake-test-passphrase-not-for-real-infrastructure'}
 def run(*args,expected=0):
  r=subprocess.run([shutil.which('tofu'),'-chdir='+str(bootstrap),*args],env=env,capture_output=True,text=True)
  if r.returncode!=expected:print(r.stdout[-2500:]+r.stderr[-2500:]);raise RuntimeError('Unexpected exit '+str(r.returncode)+' from '+args[0])
 run('init','-input=false','-lockfile=readonly')
 run('apply','-auto-approve','-input=false','-parallelism=1')
 assert state['sealed']==False and state['writes']==keys[:3],state
 run('plan','-detailed-exitcode','-input=false','-parallelism=1')
 state['sealed']=True;state['shares']=set();state['writes']=[]
 run('plan','-detailed-exitcode','-input=false','-parallelism=1',expected=2)
 run('apply','-auto-approve','-input=false','-parallelism=1')
 assert state['sealed']==False and state['writes']==keys[:3],state
 run('plan','-detailed-exitcode','-input=false','-parallelism=1')
 print('PASS: initialize, submit shares serially, stable plan, detect reseal, unseal again, stable plan')
server.shutdown()
