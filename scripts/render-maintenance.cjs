'use strict';
const fs = require('node:fs');
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const INK = '#201e1d', MUTED = '#5c5856', RED = '#ec3013';
const esc = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const num = value => Number(value.toFixed(2));
function label(x,y,value,size=22,color=INK,anchor='start',extra='') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" ${extra}>${esc(value)}</text>`;
}
function validate(data, site) {
  if (!['All','Grandview','Prosser'].includes(site)) throw new Error('Unknown site');
  if (!data || data.schema_version !== 1 || !Array.isArray(data.months)) throw new Error('Expected schema_version 1 and monthly data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of_date) || !Number.isFinite(Date.parse(data.as_of_date)) || new Date(data.as_of_date).toISOString().slice(0,10) !== data.as_of_date) throw new Error('Invalid as_of_date');
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(data.updated_at) || !Number.isFinite(Date.parse(data.updated_at))) throw new Error('Invalid updated_at');
  const rows = data.months.filter(r => r.site === site);
  const [year, month] = data.as_of_date.split('-').map(Number);
  const expected = Array.from({length:12}, (_,i) => new Date(Date.UTC(year,month-12+i,1)).toISOString().slice(0,7));
  for (const type of ['Corrective','PM']) for (const date of expected) {
    const matches = rows.filter(r => r.type === type && r.month === date);
    if (matches.length !== 1) throw new Error('Expected exactly 12 monthly rows per type/site; missing or duplicate '+type+' '+date);
    const row = matches[0];
    for (const field of ['created','completed','on_time','open','overdue','extended_open']) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) throw new Error('Invalid monthly '+field);
    }
    if (row.on_time > row.completed || row.completed + row.open !== row.created || row.overdue > row.open || row.extended_open > row.open) throw new Error('Inconsistent monthly counts');
    if (row.created === 0 ? row.completion_pct !== null : !Number.isFinite(row.completion_pct) || Math.abs(row.completion_pct - row.on_time / row.created) > 0.000001) throw new Error('Completion percentage does not match counts');
    if (!['Still in progress','Reporting window ended'].includes(row.reporting_status)) throw new Error('Invalid reporting_status');
  }
  return expected;
}

function chart(data,site,type,months,top) {
  const rows = months.map(month => data.months.find(r => r.site === site && r.type === type && r.month === month));
  const latest = rows[rows.length-1], target = type === 'PM' ? 0.9 : 0.8;
  const left = 520, right = 1840, step = (right-left)/11, graphTop = top+58, base = top+278, height = base-graphTop;
  const percent = row => row.completion_pct === null ? '—' : (row.completion_pct *100).toFixed(1)+'%';
  const currentMonth = MONTHS[Number(latest.month.slice(5))-1]+' '+latest.month.slice(0,4);
  const overdue = rows.reduce((sum,r) => sum+r.overdue,0);
  let out = `<g id="${type === 'PM' ? 'preventive':'corrective'}">`;
  out += label(48,top+10,type === 'PM' ? 'Preventive (PM)' : 'Corrective',32,INK,'start','font-weight="600"');
  out += label(48,top+44,'On-time completion · Target '+target*100+'%',21,MUTED);
  out += label(44,top+143,percent(latest),88,latest.completion_pct !== null && latest.completion_pct < target ? RED : INK,'start','font-weight="700" letter-spacing="-3"');
  out += label(48,top+179,currentMonth+' · So far',23,MUTED);
  if (latest.created === 0) out += label(48,top+211,'No work created',21,MUTED);
  else out += label(48,top+211,latest.created+' created · '+latest.on_time+' on time',23);
  out += label(48,top+243,latest.open+' still open this month',23);
  out += label(48,top+300,overdue+' overdue',31,overdue ? RED : INK,'start','font-weight="700"');
  out += label(48,top+329,'In the 12 months shown',20,MUTED);

  rows.forEach((row,i) => {
    if (row.reporting_status === 'Still in progress') out += `<rect data-provisional-month="${row.month}" x="${num(left+i*step-step/2)}" y="${graphTop-35}" width="${step}" height="${height+51}" fill="#eee1c3"><title>${esc(row.month+' · Still in progress — numbers can change')}</title></rect>`;
  });
  for (const pct of [0,0.5,1]) {
    const y = base-pct*height;
    out += `<line x1="${left-step/2}" y1="${y}" x2="${right+step/2}" y2="${y}" stroke="${pct === 0 ? INK:'#d0cbc7'}" stroke-width="${pct === 0 ? 2:1}"/>`;
    out += label(left-step/2-14,y+7,pct*100+'%',18,MUTED,'end');
  }
  out += `<line x1="${left-step/2}" y1="${base-target*height}" x2="${right+step/2}" y2="${base-target*height}" stroke="#8a8582" stroke-width="2" stroke-dasharray="8 8"/>`;
  // Split segments at the target so red denotes only the portion below target.
  const paths = {[INK]:'', [RED]:''};
  function segment(ax,ay,bx,by,color) { if (bx > ax) paths[color] += `M${num(ax)},${num(ay)}L${num(bx)},${num(by)} `; }
  for (let i=1;i<rows.length;i++) {
    const a=rows[i-1].completion_pct,b=rows[i].completion_pct;
    if (a === null || b === null) continue;
    const ax=left+(i-1)*step,bx=left+i*step,ay=base-a*height,by=base-b*height;
    if ((a < target) !== (b < target)) {
      const cx=ax+(target-a)/(b-a)*step, cy=base-target*height;
      segment(ax,ay,cx,cy,a < target ? RED:INK); segment(cx,cy,bx,by,b < target ? RED:INK);
    } else segment(ax,ay,bx,by,a < target ? RED:INK);
  }
  for (const color of [INK,RED]) if (paths[color]) out += `<path class="trend-line" d="${paths[color].trim()}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
  rows.forEach((row,i) => {
    const x=left+i*step, color=row.completion_pct !== null && row.completion_pct < target ? RED:INK;
    const m=Number(row.month.slice(5))-1;
    if (row.completion_pct !== null) {
      const y=base-row.completion_pct*height;
      out += `<rect x="${x-7}" y="${num(y-7)}" width="14" height="14" fill="${color}" data-reveal-x="${x}"><title>${esc(row.month+': '+percent(row)+'; '+row.on_time+' on time out of '+row.created+' created')}</title></rect>`;
      out += label(x,num(y-19),percent(row),22,color,'middle',`font-weight="600" data-reveal-x="${x}"`);
    } else out += label(x,base-15,'—',22,MUTED,'middle');
    out += label(x,top+315,MONTHS[m].slice(0,3),23,INK,'middle');
    out += label(x,top+338,row.month.slice(0,4),17,MUTED,'middle');
    out += label(x,top+370,row.created,22,INK,'middle',`data-created-month="${row.month}"`);
  });
  out += label(450,top+370,'Created',19,MUTED,'end');
  return out+'</g>';
}

// This function is serialized into the page. Keep its syntax ES5 for older TV engines.
function browserEnhancement() {
  if (!document.querySelectorAll) { return; }
  function animate() {
    var paths=document.querySelectorAll('.trend-line'), marks=document.querySelectorAll('[data-reveal-x]');
    var originals=[],coordinates=[],started=new Date().getTime(),duration=3000,stopped=false;
    var requestFrame=window.requestAnimationFrame || window.webkitRequestAnimationFrame;
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
        if (requestFrame) { requestFrame.call(window,frame); } else { window.setTimeout(frame,1000/60); }
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
      window.setTimeout(finish,duration+100);
    } catch (error) { finish(); }
  }
  animate();
  // Check for a newer successful data update. An error leaves the last good screen intact.
  function refresh() {
    if (!window.XMLHttpRequest || window.location.protocol === 'file:') { return; }
    try {
      var xhr=new XMLHttpRequest();
      xhr.open('GET',window.location.pathname+'?refresh='+new Date().getTime(),true);
      xhr.timeout=30000;
      xhr.onreadystatechange=function () {
        if (xhr.readyState !== 4 || xhr.status !== 200) { return; }
        try {
          var holder=document.createElement('div');
          holder.innerHTML=xhr.responseText;
          var next=holder.querySelector('svg[data-updated]'),old=document.querySelector('svg[data-updated]');
          if (!next || !old) { return; }
          var token=next.getAttribute('data-updated'),current=old.getAttribute('data-updated');
          if (token && token !== current && next.getAttribute('data-site') === old.getAttribute('data-site')) {
            old.parentNode.replaceChild(next,old);
            animate();
          }
        } catch (error) { /* Keep the last successful update. */ }
      };
      xhr.send(null);
    } catch (error) { /* Keep the last successful update. */ }
  }
  window.setInterval(refresh,900000);
}

function renderDashboard(data,site='All') {
  const months=validate(data,site),date=new Date(data.as_of_date+'T12:00:00Z');
  const dateLabel='Last updated '+DAYS[date.getUTCDay()]+', '+MONTHS[date.getUTCMonth()]+' '+date.getUTCDate();
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="dashboard-title dashboard-description" data-updated="${esc(data.updated_at)}" data-site="${esc(site)}">\n<title id="dashboard-title">Maintenance Completion KPIs — ${esc(site === 'All' ? 'Both sites':site)}</title><desc id="dashboard-description">${esc(dateLabel)}. Selected maintenance crew. Twelve months of on-time completion, created counts and overdue work. Shaded months are still in progress. Charts use a zero to 100 percent scale.</desc><rect width="1920" height="1080" fill="#f3f2f2"/><g font-family="Helvetica, Arial, sans-serif">`;
  svg+=label(48,76,'Maintenance Completion',44,INK,'start','font-weight="600"');
  svg+=label(1872,76,dateLabel,27,MUTED,'end');
  svg+='<line x1="48" y1="107" x2="1872" y2="107" stroke="#201e1d" stroke-width="2"/>';
  const sites=[['All','Both sites','maintenance-completion-kpis.html'],['Grandview','Grandview','maintenance-completion-grandview.html'],['Prosser','Prosser','maintenance-completion-prosser.html']];
  sites.forEach(([value,text,url],i) => { svg+=`<a xlink:href="${url}" aria-label="Show ${text}">`+label(48+i*175,145,text,23,value === site ? INK:MUTED,'start',value === site ? 'font-weight="700" text-decoration="underline"':'')+'</a>'; });
  svg+=label(900,145,'Selected maintenance crew · Rolling 12 months',21,MUTED,'middle');
  svg+='<rect x="1490" y="125" width="24" height="24" fill="#eee1c3"/>';
  svg+=label(1526,145,'Still in progress',23);
  svg+=chart(data,site,'Corrective',months,188);
  svg+='<line x1="48" y1="581" x2="1872" y2="581" stroke="#201e1d" stroke-width="2"/>';
  svg+=chart(data,site,'PM',months,612);
  svg+='<line x1="48" y1="1001" x2="1872" y2="1001" stroke="#201e1d" stroke-width="2"/>';
  svg+=label(48,1031,'PMs get 30 days. Corrective jobs get 14 days, or the recorded due date if later. Jobs count in the month created.',20,MUTED);
  svg+=label(48,1060,'Shaded months can change. Closing a late job clears open work, but does not raise the on-time %. Rejected and cancelled jobs are left out.',20,MUTED);
  svg+=label(1872,1031,'Source: Fiix',20,MUTED,'end');
  svg+='</g></svg>';
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance Completion KPIs</title><meta name="description" content="Daily maintenance completion, monthly totals and overdue work."><style>html,body{width:100%;height:100%;margin:0;padding:0;background:#f3f2f2;overflow:hidden}svg{display:block;position:absolute;top:0;left:0;width:100%;height:100%}a{cursor:pointer}</style></head><body>\n'+svg+'\n<script>\n('+browserEnhancement.toString()+')();\n</script>\n</body></html>\n';
}
module.exports={renderDashboard};
if (require.main === module) {
  const [, , input, output, site='All'] = process.argv;
  if (!input || !output) { console.error('Usage: node scripts/render-maintenance.cjs INPUT_JSON OUTPUT_HTML [SITE]'); process.exit(1); }
  fs.writeFileSync(output,renderDashboard(JSON.parse(fs.readFileSync(input,'utf8')),site));
}
