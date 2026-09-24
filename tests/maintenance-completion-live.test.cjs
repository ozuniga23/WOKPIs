const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../maintenance-completion-data.json')));
const baselineSvgHashes={"All":"f31030f61d9b7a9e45dce39f2dfbad34e6cffa89ff4812b4ff9ebfb6ba2bc3d0","Grandview":"e09df2194adc645b7546785150b96147d7aed0b589ed6c68b76ee87d223babdd","Prosser":"ecda0277785189f72e79e3c5866e62aed9d22e063df0f2cad5296e7b53aefab2"};
const runtime=()=>require('../maintenance-completion-runtime.js');
for(const site of ['All','Grandview','Prosser'])test('shared renderer exactly preserves existing SVG: '+site,()=>{
 assert.equal(require('node:crypto').createHash('sha256').update(runtime().renderSvg(fixture,site)).digest('hex'),baselineSvgHashes[site]);
});
test('browser runtime works without modern built-ins',()=>{
 const source=fs.readFileSync(require.resolve('../maintenance-completion-runtime.js'),'utf8');
 const ctx={};vm.createContext(ctx);vm.runInContext('Array.prototype.find=undefined;Array.from=undefined;Array.prototype.includes=undefined;Number.isFinite=undefined;Number.isSafeInteger=undefined;',ctx);vm.runInContext(source,ctx);assert.equal(ctx.MaintenanceRuntime.renderSvg(fixture,'All'),runtime().renderSvg(fixture,'All'));
 assert.doesNotMatch(source,/=>|`|\b(?:const|let)\s/);
});
function harness(options={}) {
 let time=0,requests=[],intervals=[],timers=[],handlers={},swaps=0,animations=0,finishes=0;
 let svg={getAttribute:k=>k==='data-site'?(options.site||'All'):k==='data-updated'?fixture.updated_at+'|pm-nonpm-v3':null};
 const status={textContent:''};
 const root={className:'maintenance-loading'};
 const doc={hidden:!!options.hidden,documentElement:root,getElementById:id=>id==='maintenance-fallback-data'?{textContent:JSON.stringify(fixture)}:status,
 querySelector:()=>svg,addEventListener:(k,fn)=>{handlers[k]=fn;},
 createElement:()=>({set innerHTML(s){this.svg={markup:s,getAttribute:k=>k==='data-site'?(options.site||'All'):null};},querySelector(){return options.badSvg?null:this.svg;}})};
 const parent={replaceChild(next,old){assert.equal(old,svg);svg=next;svg.parentNode=parent;swaps++;}};svg.parentNode=parent;
 function XHR(){requests.push(this);this.open=(method,url,async)=>{this.method=method;this.url=url;};this.send=()=>{};this.getResponseHeader=()=>this.mime||'application/json; charset=utf-8';}
 const values=options.store||{};
 const storage={getItem:k=>Object.prototype.hasOwnProperty.call(values,k)?values[k]:null,setItem:(k,v)=>{values[k]=v;},removeItem:k=>{delete values[k];}};
 const win={XMLHttpRequest:XHR,setInterval:(fn,ms)=>{intervals.push({fn,ms});},setTimeout:(fn,ms)=>{timers.push({fn,at:time+ms});},localStorage:storage,Date:Date};
 if(options.throwStorage)Object.defineProperty(win,'localStorage',{get(){throw new Error('storage disabled');}});
 const controller=runtime().start(win,doc,{endpoint:options.disabled?'':'https://script.google.com/macros/s/TEST/exec',now:()=>time,animate:()=>{animations++;return()=>{finishes++;};}});
 function respond(index,payload=fixture,status=200,mime){const x=requests[index];x.status=status;x.readyState=4;x.mime=mime;x.responseText=typeof payload==='string'?payload:JSON.stringify(payload);x.onreadystatechange();}
 function advance(ms){time+=ms;for(const timer of timers.filter(t=>t.at<=time)){timer.fn();timer.at=Infinity;}}
 return {requests,intervals,timers,handlers,doc,root,status,storage:values,respond,advance,controller,setTime:n=>{time=n;},stats:()=>({swaps,animations,finishes}),svg:()=>svg,ready:()=>/maintenance-ready/.test(root.className)};
}
function changed(){const p=structuredClone(fixture);p.updated_at='2026-09-16T16:00:00Z';for(const site of ['All','Grandview']){const r=p.months.find(r=>r.site===site&&r.type==='PM'&&r.month==='2025-10');r.on_time++;r.completion_pct=r.on_time/r.created;}return p;}
function latest(){const p=changed();p.updated_at='2026-09-24T13:56:48Z';p.as_of_date='2026-09-24';return p;}
const cacheKey='maintenance-completion-last-good-v1';
test('one initial aggregate request and one 15-minute timer; no overlap; no-op skips replacement and reveal',()=>{const h=harness();assert.equal(h.requests.length,1);assert.equal(h.intervals.length,1);assert.equal(h.intervals[0].ms,900000);h.intervals[0].fn();assert.equal(h.requests.length,1);h.respond(0);assert.equal(h.stats().swaps,0);assert.equal(h.stats().animations,1);assert.equal(h.status.textContent,'');assert.equal(h.requests[0].withCredentials,false);assert.equal(h.requests[0].timeout,30000);});
for(const failure of ['HTTP','HTML','JSON','schema','timeout','network','error envelope'])test('retains fallback then recovers: '+failure,()=>{const h=harness();if(failure==='timeout')h.requests[0].ontimeout();else if(failure==='network')h.requests[0].onerror();else h.respond(0,failure==='HTTP'?fixture:failure==='HTML'?'<html>login</html>':failure==='JSON'?'{':failure==='schema'?{...fixture,months:[]}:failure==='error envelope'?{error:'DATA_UNAVAILABLE'}:fixture,failure==='HTTP'?503:200,failure==='HTML'?'text/html':undefined);assert.equal(h.stats().swaps,0);h.advance(9000);assert.match(h.status.textContent,/saved data/i);h.setTime(900000);h.intervals[0].fn();h.respond(1,changed());assert.equal(h.stats().swaps,1);assert.equal(h.stats().animations,2);assert.equal(h.status.textContent,'');});
test('late callbacks cannot overwrite recovery; old reporting dates and timestamps are rejected',()=>{const h=harness();h.requests[0].ontimeout();h.setTime(900000);h.intervals[0].fn();h.respond(1,changed());h.respond(0);assert.equal(h.stats().swaps,1);h.setTime(1800000);h.intervals[0].fn();h.respond(2);assert.equal(h.stats().swaps,1);assert.match(h.status.textContent,/last verified/i);});
test('same timestamp cannot conceal changed data; construction failure preserves old chart',()=>{const h=harness();const p=changed();p.updated_at=fixture.updated_at;h.respond(0,p);assert.equal(h.stats().swaps,0);const b=harness({badSvg:true});b.respond(0,changed());assert.equal(b.stats().swaps,0);assert.equal(JSON.parse(b.storage[cacheKey]).updated_at,changed().updated_at);});
test('visibility resume checks only after interval, disabled endpoint keeps dated fallback',()=>{const h=harness();h.respond(0);h.setTime(899999);h.handlers.visibilitychange();assert.equal(h.requests.length,1);h.setTime(900000);h.handlers.visibilitychange();assert.equal(h.requests.length,2);const d=harness({disabled:true});assert.equal(d.requests.length,0);assert.match(d.status.textContent,/saved data/i);});
test('disabled endpoint clears a newer cache and shows the committed fallback immediately',()=>{
 const h=harness({disabled:true,store:{[cacheKey]:JSON.stringify(latest())}});
 assert.equal(h.requests.length,0);
 assert.equal(h.stats().swaps,0);
 assert.equal(h.stats().animations,1);
 assert.equal(h.ready(),true);
 assert.equal(h.timers.length,0);
 assert.equal(h.svg().getAttribute('data-updated'),fixture.updated_at+'|pm-nonpm-v3');
 assert.equal(h.storage[cacheKey],undefined);
 assert.match(h.status.textContent,/saved data/i);
 assert.doesNotMatch(h.status.textContent,/last verified/i);
});
for(const site of ['All','Grandview','Prosser'])test('replacement preserves site '+site,()=>{const h=harness({site});h.respond(0,changed());assert.match(h.svg().markup,new RegExp('data-site="'+site+'"'));});
test('newer publication cannot roll reporting date backward',()=>{const h=harness();const p=changed();p.as_of_date='2026-09-15';h.respond(0,p);assert.equal(h.stats().swaps,0);h.advance(9000);assert.match(h.status.textContent,/saved data/);});
test('animation without requestAnimationFrame restores final marks and paths',()=>{let now=0,pending=[];const attrs={d:'M520,10L1840,20'};const path={getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v};const markAttrs={'data-reveal-x':'1840'};const mark={getAttribute:k=>markAttrs[k],setAttribute:(k,v)=>markAttrs[k]=v,removeAttribute:k=>delete markAttrs[k]};const ctx={document:{querySelectorAll:s=>s==='.trend-line'?[path]:[mark]},window:{setTimeout:f=>pending.push(f)},Date:function(){return {getTime:()=>now}}};vm.runInNewContext('('+runtime().animate.toString()+')(document,window)',ctx);now=3100;for(const f of pending)f();assert.equal(attrs.d,'M520,10L1840,20');assert.equal(markAttrs.opacity,undefined);});

test('cold load holds the dated chart, then reveals live data once',()=>{
 const h=harness();
 assert.equal(h.ready(),false);
 assert.equal(h.stats().animations,0);
 assert.doesNotMatch(h.status.textContent,/Showing saved data/);
 h.advance(2000);h.respond(0,latest());
 assert.equal(h.ready(),true);
 assert.equal(h.stats().swaps,1);
 assert.equal(h.stats().animations,1);
 assert.match(h.svg().markup,/Last updated Thursday, September 24/);
 assert.equal(h.status.textContent,'');
 h.advance(10000);assert.equal(h.stats().animations,1);
});
test('cold load shows saved fallback after a nine-second hold when live fails',()=>{
 const h=harness();h.requests[0].ontimeout();
 assert.equal(h.ready(),false);
 h.advance(8999);assert.equal(h.ready(),false);
 h.advance(1);assert.equal(h.ready(),true);
 assert.equal(h.stats().animations,1);
 assert.match(h.status.textContent,/Showing saved data/);
});
test('a newer cache is the first reveal and identical live data does not swap',()=>{
 const value=latest(),h=harness({store:{[cacheKey]:JSON.stringify(value)}});
 assert.equal(h.ready(),true);
 assert.equal(h.stats().swaps,1);
 assert.equal(h.stats().animations,1);
 assert.match(h.svg().markup,/Last updated Thursday, September 24/);
 assert.doesNotMatch(h.status.textContent,/Showing saved data/);
 h.respond(0,value);
 assert.deepEqual(h.stats(),{swaps:1,animations:1,finishes:0});
 assert.equal(h.status.textContent,'');
});
test('newer live data replaces a cached chart once and updates shared cache',()=>{
 const older=changed(),newer=latest(),h=harness({store:{[cacheKey]:JSON.stringify(older)}});
 assert.equal(h.stats().animations,1);
 h.respond(0,newer);
 assert.deepEqual(h.stats(),{swaps:2,animations:2,finishes:1});
 assert.equal(JSON.parse(h.storage[cacheKey]).updated_at,newer.updated_at);
});
for(const bad of ['older','corrupt','oversized','same timestamp changed'])test('invalid cache is removed: '+bad,()=>{
 const value=bad==='older'?JSON.stringify({...fixture,updated_at:'2026-09-15T13:42:47Z'}):bad==='corrupt'?'{':bad==='oversized'?'x'.repeat(200001):JSON.stringify({...changed(),updated_at:fixture.updated_at});
 const h=harness({store:{[cacheKey]:value}});
 assert.equal(h.storage[cacheKey],undefined);
 assert.equal(h.ready(),false);
 assert.equal(h.stats().animations,0);
});
test('throwing localStorage does not prevent live loading or reveal',()=>{
 const h=harness({throwStorage:true});
 assert.equal(h.requests.length,1);
 h.respond(0,latest());
 assert.equal(h.ready(),true);
 assert.equal(h.stats().animations,1);
});
test('a valid cache survives a browser SVG construction failure',()=>{
 const raw=JSON.stringify(latest()),h=harness({store:{[cacheKey]:raw},badSvg:true});
 assert.equal(h.storage[cacheKey]&&h.storage[cacheKey].length,raw.length);
 assert.equal(h.ready(),false);
 h.advance(9000);assert.equal(h.ready(),true);
});
test('hidden startup requests live immediately; later polls remain visibility gated',()=>{
 const h=harness({hidden:true});
 assert.equal(h.requests.length,1);
 h.respond(0,latest());
 h.setTime(900000);h.intervals[0].fn();assert.equal(h.requests.length,1);
 h.doc.hidden=false;h.handlers.visibilitychange();assert.equal(h.requests.length,2);
});
for(const site of ['All','Grandview','Prosser'])test('page has early hide and CSS failsafe while keeping embedded fallback: '+site,()=>{
 const filename=site==='All'?'maintenance-completion-kpis.html':'maintenance-completion-'+site.toLowerCase()+'.html';
 const html=fs.readFileSync(require('node:path').join(__dirname,'..',filename),'utf8');
 assert.match(html,/<script>document\.documentElement\.className\+=' maintenance-loading';/);
 assert.match(html,/setTimeout\(function\(\).*10000\);<\/script>/);
 assert.match(html,/maintenance-failsafe 10s/);
 assert.match(html,/html\.maintenance-ready svg\[data-updated\]/);
 assert.match(html,/id="maintenance-fallback-data"/);
});
