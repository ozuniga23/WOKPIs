'use strict';
// Code/schema maintenance only. Routine refreshes never invoke this build wrapper.
const fs=require('node:fs');
const runtime=require('../maintenance-completion-runtime.js');
function renderDashboard(data,site='All') {
  const svg=runtime.renderSvg(data,site);
  const fallback=JSON.stringify(data).replace(/</g,'\\u003c');
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance Completion KPIs</title><meta name="description" content="Daily maintenance completion, monthly totals and overdue work."><style>html,body{width:100%;height:100%;margin:0;padding:0;background:#f3f2f2;overflow:hidden}svg{display:block;position:absolute;top:0;left:0;width:100%;height:100%}a{cursor:pointer}</style></head><body>\n'+svg+'\n<div id="maintenance-live-status" role="status" style="position:fixed;right:12px;top:6px;font:12px Helvetica,Arial,sans-serif;color:#5c5856;background:#f3f2f2">Showing saved data</div>\n<script id="maintenance-fallback-data" type="application/json">'+fallback+'</script>\n<script src="maintenance-completion-runtime.js"></script>\n</body></html>\n';
}
module.exports={renderDashboard};
if(require.main===module){const [input,output,site='All']=process.argv.slice(2);if(!input||!output){console.error('Usage: node scripts/render-maintenance.cjs INPUT_JSON OUTPUT_HTML [SITE]');process.exit(1);}fs.writeFileSync(output,renderDashboard(JSON.parse(fs.readFileSync(input,'utf8')),site));}
