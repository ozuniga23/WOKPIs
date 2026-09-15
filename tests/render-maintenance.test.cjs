'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { renderDashboard } = require('../scripts/render-maintenance.cjs');

function fixture() {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const month = new Date(Date.UTC(2025, 9 + i, 1)).toISOString().slice(0, 7);
    for (const site of ['All', 'Grandview', 'Prosser']) for (const type of ['Corrective', 'PM']) {
      months.push({month, site, type, created: 10, completed: 8, on_time: 7, open: 2, overdue: 1,
        extended_open: 0, latest_deadline: null, completion_pct: 0.7,
        reporting_status: i >= 10 ? 'Still in progress' : 'Reporting window ended'});
    }
  }
  return {schema_version: 1, updated_at: '2026-09-15T02:00:00Z', as_of_date: '2026-09-14', months};
}

test('uses Pacific reporting date, not UTC update day, with no visible time', () => {
  const html = renderDashboard(fixture());
  assert.match(html, /Last updated Monday, September 14/);
  assert.doesNotMatch(html, /Last updated Tuesday|Last updated[^<]*02:00/);
});
test('zero denominator is no work, not zero performance, and does not bridge missing data', () => {
  const data = fixture();
  for (const row of data.months.filter(r => r.month === '2026-09')) {
    Object.assign(row, {created:0, completed:0, on_time:0, open:0, overdue:0, completion_pct:null});
  }
  const html = renderDashboard(data);
  assert.equal((html.match(/No work created/g) || []).length, 2);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test('shades only provisional rows and shows count per month plus scoped overdue totals', () => {
  const html = renderDashboard(fixture());
  assert.equal((html.match(/data-provisional-month=/g) || []).length, 4);
  assert.match(html, /data-provisional-month="2026-08"/);
  assert.doesNotMatch(html, /data-provisional-month="2026-07"/);
  assert.match(html, /12 overdue/);
  assert.match(html, /In the 12 months shown/);
  assert.equal((html.match(/data-created-month=/g) || []).length, 24);
});
test('site views use only the selected rows', () => {
  const data = fixture();
  data.months.find(r => r.site === 'Prosser' && r.type === 'PM' && r.month === '2026-09').overdue = 2;
  assert.match(renderDashboard(data, 'Prosser'), /13 overdue/);
  assert.doesNotMatch(renderDashboard(data, 'All'), /13 overdue/);
  assert.throws(() => renderDashboard(data, '<script>'), /site/i);
});
test('rejects incomplete period and injected or invalid metadata', () => {
  const data = fixture();
  assert.throws(() => renderDashboard({...data, as_of_date:'2026-09-14<script>'}), /date/i);
  assert.throws(() => renderDashboard({...data, months:data.months.slice(6)}), /12|month/i);
  assert.throws(() => renderDashboard({...data, updated_at:'" onload="alert(1)'}), /updated_at/i);
});
test('static SVG is valid XML with fully rendered lines and values', () => {
  const html = renderDashboard(fixture());
  const svg = html.match(/<svg[\s\S]*?<\/svg>/)[0];
  const result = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'], {input:svg, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(svg, /70\.0%/);
  assert.match(svg, /class="trend-line" d="M/);
  assert.doesNotMatch(svg, /opacity="0"/);
  assert.match(svg, />0%<|>0</);
});
test('browser enhancement has TV-safe syntax and skips animation for unchanged data', () => {
  const html = renderDashboard(fixture());
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /\b(?:let|const|class|fetch|Promise|Intl)\b|=>|`/);
  assert.match(script, /XMLHttpRequest/);
  assert.match(script, /3000/);
  assert.match(script, /900000/);
  assert.match(script, /token !== current/);
  new (require('node:vm').Script)(script);
});

test('animation stays finite at a target crossing and restores the full static chart after three seconds', () => {
  const data = fixture();
  const rows = data.months.filter(r => r.site === 'All' && r.type === 'Corrective');
  Object.assign(rows[0], {on_time:8, completion_pct:0.8});
  const html = renderDashboard(data);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  function element(attributes) {return {getAttribute:k=>attributes[k],setAttribute:(k,v)=>{attributes[k]=String(v);},removeAttribute:k=>{delete attributes[k];},attributes};}
  const paths = Array.from(html.matchAll(/class="trend-line" d="([^"]+)"/g), match=>element({d:match[1]}));
  const original = paths.map(p=>p.getAttribute('d'));
  const marks = Array.from(html.matchAll(/data-reveal-x="([^"]+)"/g), match=>element({'data-reveal-x':match[1]}));
  let now=0, pending;
  const context={document:{querySelectorAll:selector=>selector === '.trend-line' ? paths:marks},
    Date:function(){return {getTime:()=>now};},
    window:{requestAnimationFrame:cb=>{pending=cb;},setTimeout:()=>{},setInterval:()=>{}}};
  require('node:vm').runInNewContext(script,context);
  now=1500; pending();
  paths.forEach(p=>assert.doesNotMatch(p.getAttribute('d'), /NaN|Infinity/));
  assert.notDeepEqual(paths.map(p=>p.getAttribute('d')), original);
  now=3000; pending();
  assert.deepEqual(paths.map(p=>p.getAttribute('d')), original);
  marks.forEach(p=>assert.equal(p.getAttribute('opacity'), undefined));
});
