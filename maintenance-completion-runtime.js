/* Existing WOKPIs renderer mechanically adapted to ES5; SVG parity tested. */
var MaintenanceRuntime = (function () {
/* Shared deterministic data contract. Upload this file as SheetToJson.gs in Apps Script.
 * ES5; no I/O, credentials, Sheet identifiers, raw work orders or KPI formula engine. */
var MaintenanceData = (function () {
  'use strict';
  var sites = ['All', 'Grandview', 'Prosser'];
  var types = ['Non-PM', 'PM'];
  var fields = ['month','site','type','created','completed','on_time','open','overdue','completion_pct','extended_open','latest_deadline','reporting_status'];
  var counts = ['created','completed','on_time','open','overdue','extended_open'];
  function fail(message) { throw new Error(message); }
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function integer(n) { return finite(n) && n >= 0 && Math.floor(n) === n && n <= 9007199254740991; }
  function dateOnly(value, timezone, formatDate) {
    if (timezone !== 'America/Los_Angeles') { fail('Unexpected workbook timezone'); }
    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (!formatDate || !isFinite(value.getTime())) { fail('Date requires workbook timezone formatter'); }
      value = formatDate(value, timezone, 'yyyy-MM-dd');
    } else if (typeof value === 'number') {
      if (!integer(value) || value > 2958465) { fail('Invalid date serial'); }
      value = new Date(Date.UTC(1899,11,30) + value * 86400000).toISOString().slice(0,10);
    }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { fail('Invalid date'); }
    var date = new Date(value + 'T00:00:00Z');
    if (!isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) { fail('Invalid calendar date'); }
    return value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) { fail('Invalid publication timestamp'); }
    var date = new Date(value);
    if (!isFinite(date.getTime()) || date.toISOString() !== value.replace(/Z$/, value.indexOf('.') < 0 ? '.000Z' : 'Z')) { fail('Invalid publication timestamp'); }
    return value;
  }
  function monthsFor(asof) {
    var date = new Date(dateOnly(asof,'America/Los_Angeles') + 'T00:00:00Z'), result = [], i;
    for (i=0;i<12;i+=1) { result.push(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-11+i,1)).toISOString().slice(0,7)); }
    return result;
  }
  function validateRows(data) {
    var months=monthsFor(data.as_of_date), rows=data.months, i,j,row,key,expected,all,a,b,f,deadline;
    if (data.schema_version !== 2 || !Array.isArray(rows) || rows.length !== 72) { fail('Expected schema 2 and 72 rows'); }
    for (i=0;i<72;i+=1) {
      row=rows[i]; expected=[months[Math.floor(i/6)],sites[Math.floor(i%6/2)],types[i%2]];
      if (!row || row.month!==expected[0] || row.site!==expected[1] || row.type!==expected[2]) { fail('Invalid row keys/order'); }
      for (j=0;j<counts.length;j+=1) { if (!integer(row[counts[j]])) { fail('Invalid count'); } }
      if (row.on_time>row.completed || row.completed+row.open!==row.created || row.overdue+row.extended_open>row.open) { fail('Inconsistent counts'); }
      if (row.created===0 ? row.completion_pct!==null : !finite(row.completion_pct) || Math.abs(row.completion_pct-row.on_time/row.created)>1e-12) { fail('Percentage/count mismatch'); }
      if (row.latest_deadline!==null) { dateOnly(row.latest_deadline,'America/Los_Angeles'); }
      if (row.reporting_status!=='Still in progress' && row.reporting_status!=='Reporting window ended') { fail('Invalid reporting status'); }
      key=Object.keys(row).sort().join('|');
      if (key!==fields.slice().sort().join('|')) { fail('Unexpected row fields'); }
    }
    for (i=0;i<72;i+=6) { for (j=0;j<2;j+=1) {
      all=rows[i+j];a=rows[i+2+j];b=rows[i+4+j];
      for (f=0;f<counts.length;f+=1) { if (all[counts[f]]!==a[counts[f]]+b[counts[f]]) { fail('All-site sum mismatch'); } }
      deadline=a.latest_deadline;
      if (b.latest_deadline!==null && (deadline===null || b.latest_deadline>deadline)) { deadline=b.latest_deadline; }
      if (all.latest_deadline!==deadline) { fail('All-site deadline mismatch'); }
    } }
    return data;
  }
  function normalize(values, asof, timezone, formatter) {
    if (!Array.isArray(values) || values.length!==72) { fail('Expected 72 Sheet rows'); }
    var result={schema_version:2,as_of_date:dateOnly(asof,timezone,formatter),months:[]}, i,v,month;
    for (i=0;i<72;i+=1) {
      v=values[i];
      if (!Array.isArray(v) || v.length!==12) { fail('Expected exactly 12 Sheet columns'); }
      month=dateOnly(v[0],timezone,formatter);
      if (month.slice(8)!=='01') { fail('Month key must be first day'); }
      result.months.push({month:month.slice(0,7),site:v[1],type:v[2],created:v[3],completed:v[4],on_time:v[5],open:v[6],overdue:v[7],completion_pct:v[8]==='' || v[8]===null ? null:v[8],extended_open:v[9],latest_deadline:v[10]==='' || v[10]===null ? null:dateOnly(v[10],timezone,formatter),reporting_status:v[11]});
    }
    return validateRows(result);
  }
  function canonical(data) {
    validateRows(data);
    var rows=[],i,j,row;
    for (i=0;i<data.months.length;i+=1) {
      row={};for (j=0;j<fields.length;j+=1) { row[fields[j]]=data.months[i][fields[j]]; }
      rows.push(row);
    }
    return JSON.stringify({schema_version:2,as_of_date:data.as_of_date,months:rows});
  }
  function control(record) {
    if (!Array.isArray(record) || record.length!==3 || record[0]!==2 || typeof record[1]!=='string' || !/^[0-9a-f]{64}$/.test(record[1])) { fail('Invalid publication record'); }
    timestamp(record[2]);
    return record.slice();
  }
  function published(readControl, readTable, sha256) {
    var before=control(readControl()), table=readTable();
    var data=normalize(table.values,table.asof,table.timeZone,table.formatDate);
    var after=control(readControl());
    if (JSON.stringify(before)!==JSON.stringify(after) || sha256(canonical(data))!==before[1]) { fail('Dataset has not been verified for publication'); }
    return {schema_version:2,updated_at:before[2],as_of_date:data.as_of_date,months:data.months};
  }
  function validatePayload(data) {
    if (!data || Object.keys(data).sort().join('|')!=='as_of_date|months|schema_version|updated_at') { fail('Unexpected payload fields'); }
    timestamp(data.updated_at);return validateRows(data);
  }
  return {normalize:normalize,canonical:canonical,published:published,control:control,validatePayload:validatePayload,dateOnly:dateOnly,monthsFor:monthsFor};
}());
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var INK = '#201e1d', MUTED = '#5c5856', RED = '#ec3013';
var esc = function(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); };
var num = function(value) { return Number(value.toFixed(2)); };
function label(x,y,value,size,color,anchor,extra) {
  size=size===undefined?22:size;color=color===undefined?INK:color;anchor=anchor===undefined?'start':anchor;extra=extra===undefined?'':extra;
  return ("<text x=\""+(x)+"\" y=\""+(y)+"\" font-size=\""+(size)+"\" fill=\""+(color)+"\" text-anchor=\""+(anchor)+"\" "+(extra)+">"+(esc(value))+"</text>");
}
function validate(data,site) {
  if (['All','Grandview','Prosser'].indexOf(site)<0) { throw new Error('Unknown site'); }
  MaintenanceData.validatePayload(data);
  return MaintenanceData.monthsFor(data.as_of_date);
}

function chart(data,site,type,months,top) {
  var rows = months.map(function(month) { return data.months.filter(function(r) { return r.site === site && r.type === type && r.month === month; })[0]; });
  var latest = rows[rows.length-1], target = type === 'PM' ? 0.9 : 0.8;
  var isPM = type === 'PM';
  var left = 520, right = 1840, step = (right-left)/11;
  var graphTop = top+40, base = top+187, height = base-graphTop;
  var percent = function(row) { return row.completion_pct === null ? '—' : (row.completion_pct *100).toFixed(1)+'%'; };
  var currentMonth = MONTHS[Number(latest.month.slice(5))-1];
  var overdue = rows.reduce(function(sum,r) { return sum+r.overdue; },0);
  var out = ("<g id=\""+(isPM ? 'preventive':'non-pm')+"\">");
  out += label(48,top+10,isPM ? 'Preventive (PM)' : 'Non-PM Work',32,INK,'start','font-weight="600"');
  out += label(48,top+44,'On-time completion · Target '+target*100+'%',21,MUTED);
  out += label(44,top+143,percent(latest),88,latest.completion_pct !== null && latest.completion_pct < target ? RED : INK,'start','font-weight="700" letter-spacing="-3"');
  out += label(48,top+179,currentMonth+' · So far',23,MUTED);
  if (latest.created === 0) out += label(48,top+211,'No work created',21,MUTED);
  else out += label(48,top+211,latest.on_time+' on time',23);
  out += label(48,top+243,latest.open+' still open this month',23);
  out += label(48,top+300,overdue+' overdue',31,overdue ? RED : INK,'start','font-weight="700"');
  out += label(48,top+329,'In the 12 months shown',20,MUTED);

  rows.forEach(function(row,i) {
    if (row.reporting_status === 'Still in progress') out += ("<rect data-provisional-month=\""+(row.month)+"\" x=\""+(num(left+i*step-step/2))+"\" y=\""+(graphTop-35)+"\" width=\""+(step)+"\" height=\""+(height+51)+"\" fill=\"#eee1c3\"><title>"+(esc(MONTHS[Number(row.month.slice(5))-1]+' · Still in progress — numbers can change'))+"</title></rect>");
  });
  for (var pi=0;pi<3;pi+=1) { var pct=[0,0.5,1][pi];
    var y = base-pct*height;
    out += ("<line x1=\""+(left-step/2)+"\" y1=\""+(y)+"\" x2=\""+(right+step/2)+"\" y2=\""+(y)+"\" stroke=\""+(pct === 0 ? INK:'#d0cbc7')+"\" stroke-width=\""+(pct === 0 ? 2:1)+"\"/>");
    out += label(left-step/2-14,y+7,pct*100+'%',18,MUTED,'end');
  }
  out += ("<line x1=\""+(left-step/2)+"\" y1=\""+(base-target*height)+"\" x2=\""+(right+step/2)+"\" y2=\""+(base-target*height)+"\" stroke=\"#8a8582\" stroke-width=\"2\" stroke-dasharray=\"8 8\"/>");
  // Split segments at the target so red denotes only the portion below target.
  var paths = {};paths[INK]='';paths[RED]='';
  function segment(ax,ay,bx,by,color) { if (bx > ax) paths[color] += ("M"+(num(ax))+","+(num(ay))+"L"+(num(bx))+","+(num(by))+" "); }
  for (var i=1;i<rows.length;i++) {
    var a=rows[i-1].completion_pct,b=rows[i].completion_pct;
    if (a === null || b === null) continue;
    var ax=left+(i-1)*step,bx=left+i*step,ay=base-a*height,by=base-b*height;
    if ((a < target) !== (b < target)) {
      var cx=ax+(target-a)/(b-a)*step, cy=base-target*height;
      segment(ax,ay,cx,cy,a < target ? RED:INK); segment(cx,cy,bx,by,b < target ? RED:INK);
    } else segment(ax,ay,bx,by,a < target ? RED:INK);
  }
  for (var ci=0;ci<2;ci+=1) { var color=[INK,RED][ci]; if (paths[color]) out += ("<path class=\"trend-line\" d=\""+(paths[color].trim())+"\" fill=\"none\" stroke=\""+(color)+"\" stroke-width=\"5\" stroke-linecap=\"round\"/>"); }
  rows.forEach(function(row,i) {
    var x=left+i*step, color=row.completion_pct !== null && row.completion_pct < target ? RED:INK;
    var m=Number(row.month.slice(5))-1;
    if (row.completion_pct !== null) {
      var y=base-row.completion_pct*height;
      out += ("<rect x=\""+(x-7)+"\" y=\""+(num(y-7))+"\" width=\"14\" height=\"14\" fill=\""+(color)+"\" data-reveal-x=\""+(x)+"\"><title>"+(esc(MONTHS[m]+': '+percent(row)))+"</title></rect>");
      out += label(x,num(y-19),percent(row),22,color,'middle',("font-weight=\"600\" data-reveal-x=\""+(x)+"\""));
    } else out += label(x,base-15,'—',22,MUTED,'middle');
    out += label(x,top+363,MONTHS[m].slice(0,3),23,INK,'middle');
  });
  out += createdTrend(rows,type,top,left,right,step,data.as_of_date.slice(0,7));
  return out+'</g>';
}

function createdTrend(rows,type,top,left,right,step,currentMonth) {
  var graphTop=top+264, base=top+330, height=base-graphTop;
  var maxCount=Math.max.apply(Math,rows.map(function(r) { return r.created; }));
  var unit=maxCount<=10 ? 5:maxCount<=100 ? 25:100;
  var ceiling=Math.max(unit,Math.ceil(maxCount/unit)*unit);
  var out='<g id="'+(type === 'PM' ? 'pm':'non-pm')+'-created-trend">';
  out+=label(left-step/2,top+224,type+' jobs created',22,INK,'start','font-weight="600"');
  out+=label(right+step/2,top+224,'Current month is still growing',20,MUTED,'end');
  rows.forEach(function(row,i) {
    if(row.month===currentMonth) out+=("<rect data-count-provisional-month=\""+(row.month)+"\" x=\""+(num(left+i*step-step/2))+"\" y=\""+(graphTop-35)+"\" width=\""+(step)+"\" height=\""+(height+47)+"\" fill=\"#eee1c3\"><title>Current month is not finished; more jobs can be created.</title></rect>");
  });
  for(var ki=0;ki<2;ki+=1) { var count=[0,ceiling][ki];
    var y=base-count/ceiling*height;
    out+=("<line x1=\""+(left-step/2)+"\" y1=\""+(y)+"\" x2=\""+(right+step/2)+"\" y2=\""+(y)+"\" stroke=\""+(count===0 ? INK:'#d0cbc7')+"\" stroke-width=\""+(count===0 ? 2:1)+"\"/>");
    out+=label(left-step/2-14,y+7,count,18,MUTED,'end');
  }
  var path='';
  for(var i=1;i<rows.length;i++) path+=("M"+(num(left+(i-1)*step))+","+(num(base-rows[i-1].created/ceiling*height))+"L"+(num(left+i*step))+","+(num(base-rows[i].created/ceiling*height))+" ");
  out+=("<path class=\"trend-line\" d=\""+(path.trim())+"\" fill=\"none\" stroke=\""+(INK)+"\" stroke-width=\"3\" stroke-linecap=\"round\"/>");
  rows.forEach(function(row,i) {
    var x=left+i*step,y=base-row.created/ceiling*height;
    out+=("<circle cx=\""+(num(x))+"\" cy=\""+(num(y))+"\" r=\"4\" fill=\""+(INK)+"\" data-reveal-x=\""+(num(x))+"\"><title>"+(esc(MONTHS[Number(row.month.slice(5))-1]+': '+row.created+' '+type+' jobs created'))+"</title></circle>");
    out+=label(num(x),num(y-12),row.created,21,INK,'middle',("font-weight=\"600\" data-reveal-x=\""+(num(x))+"\" data-created-month=\""+(row.month)+"\""));
  });
  return out+'</g>';
}

function renderSvg(data,site) {
  site=site || 'All';
  var months=validate(data,site),date=new Date(data.as_of_date+'T12:00:00Z');
  var dateLabel='Last updated '+DAYS[date.getUTCDay()]+', '+MONTHS[date.getUTCMonth()]+' '+date.getUTCDate();
  var svg=("<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" viewBox=\"0 0 1920 1080\" preserveAspectRatio=\"xMidYMid meet\" role=\"group\" aria-labelledby=\"dashboard-title dashboard-description\" data-updated=\""+(esc(data.updated_at))+"|pm-nonpm-v3\" data-site=\""+(esc(site))+"\">\n<title id=\"dashboard-title\">Maintenance Completion KPIs — "+(esc(site === 'All' ? 'Both sites':site))+"</title><desc id=\"dashboard-description\">"+(esc(dateLabel))+". Selected maintenance crew. Twelve months of on-time completion, open work and overdue work. Completion charts use a zero to 100 percent scale. PM and Non-PM jobs created each use a separate count scale beneath their percentage chart. Non-PM includes repairs, projects and other work with no scheduled PM attached, not just breakdowns. Shaded completion months can change; the shaded current-month count is unfinished.</desc><rect width=\"1920\" height=\"1080\" fill=\"#f3f2f2\"/><g font-family=\"Helvetica, Arial, sans-serif\">");
  svg+=label(48,76,'Maintenance Completion',44,INK,'start','font-weight="600"');
  svg+=label(1872,76,dateLabel,27,MUTED,'end');
  svg+='<line x1="48" y1="107" x2="1872" y2="107" stroke="#201e1d" stroke-width="2"/>';
  var sites=[['All','Both sites','maintenance-completion-kpis.html'],['Grandview','Grandview','maintenance-completion-grandview.html'],['Prosser','Prosser','maintenance-completion-prosser.html']];
  // Native dropdown stays with the SVG during the existing automatic refresh.
  svg+='<foreignObject x="48" y="118" width="260" height="48"><div xmlns="http://www.w3.org/1999/xhtml"><select aria-label="Site" onchange="window.location.href=this.value" style="box-sizing:border-box;width:250px;height:42px;font:600 23px Helvetica,Arial,sans-serif;color:#201e1d;background:#f3f2f2;border:1px solid #8a8582;border-radius:5px;padding:4px 12px;cursor:pointer">';
  sites.forEach(function(entry) { var value=entry[0],text=entry[1],url=entry[2]; svg+=("<option value=\""+(url)+"\""+(value === site ? ' selected="selected"':'')+">"+(text)+"</option>"); });
  svg+='</select></div></foreignObject>';
  svg+=label(900,145,'Selected maintenance crew · Rolling 12 months',21,MUTED,'middle');
  svg+='<rect x="1490" y="125" width="24" height="24" fill="#eee1c3"/>';
  svg+=label(1526,145,'Still in progress',23);
  svg+=chart(data,site,'Non-PM',months,188);
  svg+='<line x1="48" y1="581" x2="1872" y2="581" stroke="#201e1d" stroke-width="2"/>';
  svg+=chart(data,site,'PM',months,612);
  svg+='<line x1="48" y1="1001" x2="1872" y2="1001" stroke="#201e1d" stroke-width="2"/>';
  svg+=label(48,1031,'PM: keep the due date if 3+ days after creation; otherwise allow 30 days. Non-PM: allow 14 days, or the due date if later.',20,MUTED);
  svg+=label(48,1060,'Shaded months can change. Closing a late job clears open work, but does not raise the on-time %. Rejected and cancelled jobs are left out.',20,MUTED);
  svg+=label(1872,1031,'Source: Fiix',20,MUTED,'end');
  svg+='</g></svg>';
  return svg;
}
  function animate(doc,win) {
    var paths=doc.querySelectorAll('.trend-line'), marks=doc.querySelectorAll('[data-reveal-x]');
    var originals=[],coordinates=[],started=new Date().getTime(),duration=3000,stopped=false;
    var requestFrame=win.requestAnimationFrame || win.webkitRequestAnimationFrame;
    var i,j;
    function finish() {
      stopped=true;
      for (i=0;i<originals.length;i+=1) { paths[i].setAttribute('d',originals[i]); }
      for (i=0;i<marks.length;i+=1) { marks[i].removeAttribute('opacity'); }
    }
    function frame() {
      if (stopped) { return; }
      try {
        var elapsed=Math.max(0,new Date().getTime()-started);
        if (elapsed >= duration) { finish(); return; }
        var progress=elapsed/duration,edge=520+1320*progress;
        for (i=0;i<paths.length;i+=1) {
          var numbers=coordinates[i],drawing='';
          for (j=0;j<numbers.length;j+=4) {
            var ax=numbers[j],ay=numbers[j+1],bx=numbers[j+2],by=numbers[j+3];
            if (edge <= ax) { continue; }
            var endX=Math.min(edge,bx),endY=ay+(by-ay)*(endX-ax)/(bx-ax);
            drawing+='M'+ax+','+ay+'L'+endX.toFixed(2)+','+endY.toFixed(2)+' ';
          }
          paths[i].setAttribute('d',drawing);
        }
        for (i=0;i<marks.length;i+=1) { marks[i].setAttribute('opacity',Math.min(1,Math.max(0,(edge-Number(marks[i].getAttribute('data-reveal-x'))+20)/40))); }
        if (requestFrame) { requestFrame.call(win,frame); } else { win.setTimeout(frame,1000/60); }
      } catch (error) { finish(); }
    }
    try {
      for (i=0;i<paths.length;i+=1) {
        var original=paths[i].getAttribute('d'),matches=original.match(/-?\d+(?:\.\d+)?/g),values=[];
        originals.push(original);
        for (j=0;j<matches.length;j+=1) { values.push(Number(matches[j])); }
        coordinates.push(values);
      }
      frame();
      win.setTimeout(finish,duration+100);
    } catch (error) { finish(); }
    return finish;
  }
  // The only public endpoint setting. Empty string disables live loading for rollback.
  var ENDPOINT='https://script.google.com/macros/s/AKfycbxoIyxtpCZsIBArCdtaOhuHCA6_0ekOlan62bou_tPCkNfSFshIla8-8ieovbJlA452yw/exec';
  var CACHE_KEY='maintenance-completion-last-good-v1',MAX_PAYLOAD=200000,FIRST_HOLD_MS=9000;
  function start(win,doc,options) {
    options=options || {};
    if (!doc.querySelector || !doc.getElementById) { return; }
    var endpoint=options.endpoint===undefined?ENDPOINT:options.endpoint;
    var now=options.now || function(){return new Date().getTime();};
    var reveal=options.animate || function(){return animate(doc,win);};
    var old=doc.querySelector('svg[data-updated]'),status=doc.getElementById('maintenance-live-status');
    var current,canonical,live=false,inflight=false,lastAttempt=-900000,sequence=0,cancelAnimation,revealed=false,site;
    function notice(message){if(status){status.textContent=message;}}
    function failure(){notice(live?'Live update unavailable · Showing last verified data':'Live update unavailable · Showing saved data');}
    function show(){
      if(revealed){return;}
      revealed=true;
      if(doc.documentElement && doc.documentElement.className.indexOf('maintenance-ready')<0){
        doc.documentElement.className+=' maintenance-ready';
      }
      cancelAnimation=reveal();
    }
    function removeCache(){try{win.localStorage.removeItem(CACHE_KEY);}catch(error){}}
    function saveCache(data){
      try{
        var raw=JSON.stringify(data);
        if(raw.length<=MAX_PAYLOAD){win.localStorage.setItem(CACHE_KEY,raw);}
      }catch(error){}
    }
    function makeSvg(data){
      var holder=doc.createElement('div');
      holder.innerHTML=renderSvg(data,site);
      var svg=holder.querySelector('svg[data-updated]');
      if(!svg || svg.getAttribute('data-site')!==site){throw new Error('Invalid chart');}
      return svg;
    }
    function loadCache(){
      var raw;
      try{raw=win.localStorage.getItem(CACHE_KEY);}catch(error){return false;}
      if(raw===null){return false;}
      var cached,cachedCanonical;
      try{
        if(raw.length>MAX_PAYLOAD){throw new Error('Oversized cache');}
        cached=MaintenanceData.validatePayload(JSON.parse(raw));
        cachedCanonical=MaintenanceData.canonical(cached);
        if(cached.updated_at<current.updated_at || cached.as_of_date<current.as_of_date ||
           (cached.updated_at===current.updated_at && cachedCanonical!==canonical)){throw new Error('Stale cache');}
      }catch(error){removeCache();return false;}
      try{
        var svg=makeSvg(cached);
        old.parentNode.replaceChild(svg,old);old=svg;
        current=cached;canonical=cachedCanonical;live=true;
        return true;
      }catch(error){return false;}
    }
    try {
      current=JSON.parse(doc.getElementById('maintenance-fallback-data').textContent);
      MaintenanceData.validatePayload(current);canonical=MaintenanceData.canonical(current);
      if (!old || ['All','Grandview','Prosser'].indexOf(old.getAttribute('data-site'))<0) { return; }
      site=old.getAttribute('data-site');
    } catch(error) { failure();return; }
    if(!endpoint){removeCache();show();failure();}
    else if(loadCache()){show();notice('');}
    else{
      notice('Loading live data');
      win.setTimeout(function(){
        if(revealed){return;}
        show();
        if(inflight){notice('Loading live data · Showing saved data');}
        else{failure();}
      },FIRST_HOLD_MS);
    }
    function refresh(initial) {
      if (!endpoint || !win.XMLHttpRequest) {show();failure();return;}
      if (inflight || (!initial && doc.hidden) || now()-lastAttempt<900000) { return; }
      lastAttempt=now();inflight=true;sequence+=1;
      var token=sequence,xhr,settled=false;
      function fail(){if(settled || token!==sequence){return;}settled=true;inflight=false;if(revealed){failure();}}
      try {
        xhr=new win.XMLHttpRequest();
        xhr.open('GET',endpoint+'?v='+lastAttempt,true);xhr.withCredentials=false;xhr.timeout=30000;
        xhr.onerror=fail;xhr.ontimeout=fail;xhr.onabort=fail;
        xhr.onreadystatechange=function(){
          if (xhr.readyState!==4 || settled || token!==sequence) { return; }
          try {
            if (xhr.status!==200 || !/^application\/json(?:;|$)/i.test(xhr.getResponseHeader('Content-Type') || '') || xhr.responseText.length>MAX_PAYLOAD) { throw new Error('Unavailable'); }
            var next=MaintenanceData.validatePayload(JSON.parse(xhr.responseText));
            var nextCanonical=MaintenanceData.canonical(next);
            if (next.updated_at<current.updated_at || next.as_of_date<current.as_of_date || (next.updated_at===current.updated_at && nextCanonical!==canonical)) { throw new Error('Stale publication'); }
            saveCache(next);
            if (nextCanonical!==canonical) {
              var svg=makeSvg(next);
              if (cancelAnimation) { cancelAnimation(); }
              old.parentNode.replaceChild(svg,old);old=svg;
              if(revealed){cancelAnimation=reveal();}
            }
            current=next;canonical=nextCanonical;live=true;show();notice('');
            settled=true;inflight=false;
          } catch(error){fail();}
        };
        xhr.send(null);
      } catch(error){fail();}
    }
    refresh(true);win.setInterval(refresh,900000);
    if (doc.addEventListener) { doc.addEventListener('visibilitychange',function(){if(!doc.hidden){refresh();}},false); }
    return {refresh:refresh};
  }

  return {renderSvg:renderSvg,animate:animate,data:MaintenanceData,start:start};
}());
if(typeof module!=='undefined' && module.exports) { module.exports=MaintenanceRuntime; }

if(typeof window!=="undefined" && typeof document!=="undefined") { MaintenanceRuntime.start(window,document); }
