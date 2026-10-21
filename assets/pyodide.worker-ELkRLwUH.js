const w="0.27.7",A=["numpy","pyyaml"],l="/nift",u="/nift/maps/lanelet2_odr2024.osm",U="py/nift_bundle.zip";const k=`
import json, sys, traceback
if '${l}/nift_playground/py' not in sys.path:
    sys.path.insert(0, '${l}/nift_playground/py')
from playground import paths as _paths
_paths.setup('${l}')
from playground.session import Session as _Session

_session = None

def _err(e, fatal):
    return json.dumps([{'type': 'error', 'message': f'{type(e).__name__}: {e}',
                        'traceback': traceback.format_exc(), 'fatal': fatal}])

def worker_open(init_json):
    global _session
    try:
        _session = _Session(repo_root='${l}')
        return _session.handle(init_json)
    except Exception as e:
        return _err(e, True)

def worker_handle(msg_json):
    try:
        return _session.handle(msg_json)
    except Exception as e:
        return _err(e, False)

def worker_state(_=None):
    # the state at the current tick, after what is queued (no ticks run, not logged)
    try:
        return json.dumps(_session.collect() + [_session.state()])
    except Exception as e:
        return _err(e, False)

def worker_advance(n):
    try:
        return _session.advance(int(n))
    except Exception as e:
        return _err(e, False)
`;class P{factor=1;paused=!1;dt=.05;owed=0;costMs=.5;lastTurn=null;window=[];setFactor(t){if(t==="max")this.factor="max";else{const e=Number(t);if(!Number.isFinite(e)||e<=0)throw new Error(`speed factor must be a positive number or 'max', got ${String(t)}`);this.factor=Math.min(100,Math.max(.1,e))}return this.factor}rebase(t){this.lastTurn=t,this.owed=0}ticksFor(t){if(this.paused)return 0;const e=this.lastTurn??t,r=Math.min(Math.max(0,t-e),250);this.lastTurn=t;const s=Math.max(1,Math.floor(12/Math.max(this.costMs,.001)));if(this.factor==="max")return s;this.owed+=r*this.factor/1e3/this.dt;let h=Math.floor(this.owed);return h>s&&(h=s),this.owed-=h,this.owed>s&&(this.owed=s),h}delayMs(){return this.paused?1/0:this.factor==="max"||this.owed>=1?0:(1-this.owed)*this.dt*1e3/this.factor}record(t,e,r){if(e>0){const s=r/e;this.costMs=this.costMs*.8+s*.2}for(this.window.push([t,e]);this.window.length>2&&t-this.window[0][0]>1e3;)this.window.shift()}rtf(t){if(this.paused||this.window.length<2)return 0;const e=t-this.window[0][0];if(e<=0)return 0;let r=0;for(let s=1;s<this.window.length;s++)r+=this.window[s][1];return r*this.dt/(e/1e3)}clearWindow(){this.window=[]}}class x{pacer=new P;stats={bootMs:{},ticks:0,advanceMs:0,bundleBytes:0,mapBytes:0};py=null;env;ready=!1;booting=!1;stateHz=10;queue=[];loopArmed=!1;loopToken=0;heldState=null;lastStatePost=-1/0;fnOpen=null;fnHandle=null;fnAdvance=null;fnState=null;constructor(t){this.env=t}get isReady(){return this.ready}onMessage(t){try{this.dispatch(t)}catch(e){this.postError(e,!1,t)}}dispatch(t){switch(t.type){case"init":if(this.ready||this.booting)return this.reply(t,!1,"already initialised");this.booting=!0,this.boot(t).catch(e=>{this.booting=!1,this.postError(e,!0,t)});return;case"pause":return this.setPaused(!0),this.stateNow(),this.flushState(!0),this.reply(t,!0,"paused");case"resume_sim":return this.setPaused(!1),this.reply(t,!0,"running");case"speed":{const e=this.pacer.setFactor(t.factor);return this.pacer.rebase(this.env.now()),this.pacer.clearWindow(),this.patchAndPostHeld(),this.reply(t,!0,`speed ${e}`)}}if(!this.ready){this.queue.push(t);return}if(t.type==="step"){const e=t.n===void 0?1:Math.floor(Number(t.n));return!Number.isFinite(e)||e<1?this.reply(t,!1,`step n must be >= 1, got ${String(t.n)}`):(this.setPaused(!0),this.advance(e),this.stateNow(),this.flushState(!0),this.reply(t,!0,`stepped ${e}`))}this.handle(t)}async boot(t){const e=this.env,r=(o,y)=>e.post({type:"progress",stage:o,pct:y}),s=(o,y)=>this.stats.bootMs[o]=e.now()-y,h=String(t.baseUrl??"");typeof t.stateHz=="number"&&t.stateHz>0&&(this.stateHz=t.stateHz);let i=e.now();r("pyodide",0);const a=await e.loadPyodide();a.version!==w&&e.log?.(`warning: Pyodide ${a.version}, expected ${w}`),a.setStdout?.({batched:o=>e.log?.(o)}),a.setStderr?.({batched:o=>e.log?.(o)}),this.py=a,s("pyodide",i),i=e.now(),r("packages",25),await a.loadPackage(A),s("packages",i),i=e.now(),r("bundle",50);const v=typeof t.bundleUrl=="string"&&t.bundleUrl?t.bundleUrl:T(h,U),_=await e.fetchBytes(v);this.stats.bundleBytes=_.byteLength,a.unpackArchive(_,"zip",{extractDir:l}),s("bundle",i),i=e.now(),r("map",65);const m=await e.fetchBytes(String(t.mapUrl));this.stats.mapBytes=m.byteLength,a.FS.mkdirTree(u.slice(0,u.lastIndexOf("/"))),a.FS.writeFile(u,m),s("map",i),i=e.now(),r("nodes",75),a.runPython(k),this.fnOpen=a.globals.get("worker_open"),this.fnHandle=a.globals.get("worker_handle"),this.fnAdvance=a.globals.get("worker_advance"),this.fnState=a.globals.get("worker_state")??null;const c={...t,mapPath:u};delete c.baseUrl,delete c.mapUrl,delete c.bundleUrl;const d=this.call(this.fnOpen,JSON.stringify(c)),p=d.find(o=>o.type==="ready");p&&typeof p.dt=="number"&&p.dt>0&&(this.pacer.dt=p.dt),s("nodes",i);const M=d.find(o=>o.type==="error"&&o.fatal);if(this.booting=!1,M){this.postAll(d);return}this.ready=!0,this.postAll(d.map(o=>o.type==="ready"?{...o,pyodide:a.version,bootMs:this.stats.bootMs}:o));for(const o of this.queue.splice(0))this.onMessage(o);this.pacer.rebase(e.now()),this.arm(0)}call(t,e){if(!t)throw new Error("session not ready");const r=t(e),s=JSON.parse(String(r));return Array.isArray(s)?s:[s]}handle(t){const e=this.call(this.fnHandle,JSON.stringify(t));(t.type==="reset"||t.type==="scenario_load")&&(this.pacer.rebase(this.env.now()),this.pacer.clearWindow(),this.heldState=null),this.postAll(e),this.flushState(!0),e.some(s=>s.type==="error")&&this.setPaused(!0)}stateNow(){this.ready&&this.fnState&&this.postAll(this.call(this.fnState,void 0))}advance(t){const e=this.env.now(),r=this.call(this.fnAdvance,t),s=this.env.now()-e;return this.stats.ticks+=t,this.stats.advanceMs+=s,this.pacer.record(this.env.now(),t,s),this.postAll(r),r.some(h=>h.type==="error")&&this.setPaused(!0),s}setPaused(t){this.pacer.paused!==t&&(this.pacer.paused=t,this.pacer.rebase(this.env.now()),this.pacer.clearWindow(),t||this.arm(0))}arm(t){if(!this.ready||this.pacer.paused||this.loopArmed)return;this.loopArmed=!0;const e=++this.loopToken,r=()=>{e===this.loopToken&&(this.loopArmed=!1,this.turn())};t<=0?this.env.soon(r):this.env.later(r,t)}turn(){if(!this.ready||this.pacer.paused)return;try{const e=this.pacer.ticksFor(this.env.now());e>0&&this.advance(e),this.flushState(!1)}catch(e){this.setPaused(!0),this.postError(e,!1);return}const t=this.pacer.delayMs();Number.isFinite(t)&&this.arm(t)}postAll(t){for(const e of t)e.type==="state"?this.heldState=e:this.env.post(e)}flushState(t){if(!this.heldState)return;const e=this.env.now();!t&&e-this.lastStatePost<1e3/this.stateHz||this.patchAndPostHeld()}patchAndPostHeld(){if(!this.heldState)return;const t=this.env.now();this.env.post({...this.heldState,paused:this.pacer.paused,factor:this.pacer.factor,rtf:E(this.pacer.rtf(t))}),this.heldState=null,this.lastStatePost=t}reply(t,e,r){typeof t.id=="string"&&this.env.post({type:"reply",id:t.id,ok:e,message:r})}postError(t,e,r){const s=t instanceof Error?t:new Error(String(t));this.env.post({type:"error",message:s.message.split(`
`).filter(Boolean).pop()??s.message,traceback:s.stack??s.message,fatal:e}),r&&this.reply(r,!1,s.message)}}function E(n){return Math.round(n*1e3)/1e3}function T(n,t){return n?n.endsWith("/")?n+t:`${n}/${t}`:t}const b=`https://cdn.jsdelivr.net/pyodide/v${w}/full/`,g=new MessageChannel,S=[];g.port1.onmessage=()=>S.shift()?.();let f=self.location.href;const N={async loadPyodide(){return await(await import(`${b}pyodide.mjs`)).loadPyodide({indexURL:b})},async fetchBytes(n){const t=await fetch(new URL(n,f));if(!t.ok)throw new Error(`fetch ${n}: HTTP ${t.status}`);return new Uint8Array(await t.arrayBuffer())},post:n=>self.postMessage(n),now:()=>performance.now(),later:(n,t)=>void setTimeout(n,t),soon:n=>{S.push(n),g.port2.postMessage(null)},log:n=>console.log(`[py] ${n}`)},F=new x(N);self.onmessage=n=>{const t=n.data;if(t&&t.type==="init"){const e=new URL(String(t.mapUrl),self.location.href);f=new URL(String(t.baseUrl??"./"),new URL("../",e)).href,t.baseUrl=f,t.mapUrl=e.href,typeof t.bundleUrl=="string"&&(t.bundleUrl=new URL(t.bundleUrl,f).href)}F.onMessage(t)};
