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
 let time=0,requests=[],intervals=[],handlers={},swaps=0,animations=0,finishes=0;
 let svg={getAttribute:k=>k==='data-site'?(options.site||'All'):null};
 const status={textContent:''};
 const doc={hidden:false,getElementById:id=>id==='maintenance-fallback-data'?{textContent:JSON.stringify(fixture)}:status,
 querySelector:()=>svg,addEventListener:(k,fn)=>{handlers[k]=fn;},
 createElement:()=>({set innerHTML(s){this.svg={markup:s,getAttribute:k=>k==='data-site'?(options.site||'All'):null};},querySelector(){return options.badSvg?null:this.svg;}})};
 const parent={replaceChild(next,old){assert.equal(old,svg);svg=next;svg.parentNode=parent;swaps++;}};svg.parentNode=parent;
 function XHR(){requests.push(this);this.open=(method,url,async)=>{this.method=method;this.url=url;};this.send=()=>{};this.getResponseHeader=()=>this.mime||'application/json; charset=utf-8';}
 const win={XMLHttpRequest:XHR,setInterval:(fn,ms)=>{intervals.push({fn,ms});},Date:Date};
 const controller=runtime().start(win,doc,{endpoint:options.disabled?'':'https://script.google.com/macros/s/TEST/exec',now:()=>time,animate:()=>{animations++;return()=>{finishes++;};}});
 function respond(index,payload=fixture,status=200,mime){const x=requests[index];x.status=status;x.readyState=4;x.mime=mime;x.responseText=typeof payload==='string'?payload:JSON.stringify(payload);x.onreadystatechange();}
 return {requests,intervals,handlers,doc,status,respond,controller,setTime:n=>{time=n;},stats:()=>({swaps,animations,finishes}),svg:()=>svg};
}
function changed(){const p=structuredClone(fixture);p.updated_at='2026-09-16T16:00:00Z';for(const site of ['All','Grandview']){const r=p.months.find(r=>r.site===site&&r.type==='PM'&&r.month==='2025-10');r.on_time++;r.completion_pct=r.on_time/r.created;}return p;}
test('one initial aggregate request and one 15-minute timer; no overlap; no-op skips replacement and reveal',()=>{const h=harness();assert.equal(h.requests.length,1);assert.equal(h.intervals.length,1);assert.equal(h.intervals[0].ms,900000);h.intervals[0].fn();assert.equal(h.requests.length,1);h.respond(0);assert.equal(h.stats().swaps,0);assert.equal(h.stats().animations,1);assert.equal(h.status.textContent,'');assert.equal(h.requests[0].withCredentials,false);assert.equal(h.requests[0].timeout,30000);});
for(const failure of ['HTTP','HTML','JSON','schema','timeout','network','error envelope'])test('retains fallback then recovers: '+failure,()=>{const h=harness();if(failure==='timeout')h.requests[0].ontimeout();else if(failure==='network')h.requests[0].onerror();else h.respond(0,failure==='HTTP'?fixture:failure==='HTML'?'<html>login</html>':failure==='JSON'?'{':failure==='schema'?{...fixture,months:[]}:failure==='error envelope'?{error:'DATA_UNAVAILABLE'}:fixture,failure==='HTTP'?503:200,failure==='HTML'?'text/html':undefined);assert.equal(h.stats().swaps,0);assert.match(h.status.textContent,/saved data/i);h.setTime(900000);h.intervals[0].fn();h.respond(1,changed());assert.equal(h.stats().swaps,1);assert.equal(h.stats().animations,2);assert.equal(h.status.textContent,'');});
test('late callbacks cannot overwrite recovery; old reporting dates and timestamps are rejected',()=>{const h=harness();h.requests[0].ontimeout();h.setTime(900000);h.intervals[0].fn();h.respond(1,changed());h.respond(0);assert.equal(h.stats().swaps,1);h.setTime(1800000);h.intervals[0].fn();h.respond(2);assert.equal(h.stats().swaps,1);assert.match(h.status.textContent,/last verified/i);});
test('same timestamp cannot conceal changed data; construction failure preserves old chart',()=>{const h=harness();const p=changed();p.updated_at=fixture.updated_at;h.respond(0,p);assert.equal(h.stats().swaps,0);const b=harness({badSvg:true});b.respond(0,changed());assert.equal(b.stats().swaps,0);});
test('visibility resume checks only after interval, disabled endpoint keeps dated fallback',()=>{const h=harness();h.respond(0);h.setTime(899999);h.handlers.visibilitychange();assert.equal(h.requests.length,1);h.setTime(900000);h.handlers.visibilitychange();assert.equal(h.requests.length,2);const d=harness({disabled:true});assert.equal(d.requests.length,0);assert.match(d.status.textContent,/saved data/i);});
for(const site of ['All','Grandview','Prosser'])test('replacement preserves site '+site,()=>{const h=harness({site});h.respond(0,changed());assert.match(h.svg().markup,new RegExp('data-site="'+site+'"'));});
test('newer publication cannot roll reporting date backward',()=>{const h=harness();const p=changed();p.as_of_date='2026-09-15';h.respond(0,p);assert.equal(h.stats().swaps,0);assert.match(h.status.textContent,/saved data/);});
test('animation without requestAnimationFrame restores final marks and paths',()=>{let now=0,pending=[];const attrs={d:'M520,10L1840,20'};const path={getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v};const markAttrs={'data-reveal-x':'1840'};const mark={getAttribute:k=>markAttrs[k],setAttribute:(k,v)=>markAttrs[k]=v,removeAttribute:k=>delete markAttrs[k]};const ctx={document:{querySelectorAll:s=>s==='.trend-line'?[path]:[mark]},window:{setTimeout:f=>pending.push(f)},Date:function(){return {getTime:()=>now}}};vm.runInNewContext('('+runtime().animate.toString()+')(document,window)',ctx);now=3100;for(const f of pending)f();assert.equal(attrs.d,'M520,10L1840,20');assert.equal(markAttrs.opacity,undefined);});
