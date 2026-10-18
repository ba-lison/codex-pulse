import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=process.argv.includes('--github')?'ba-lison/codex-pulse':root;
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'codex-pulse-smoke-'));
const environment={...process.env,CODEX_HOME:temporary};
let child;
function cli(args){const result=spawnSync('codex',args,{cwd:root,env:environment,encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stderr||result.error?.message||'CLI failed');return JSON.parse(result.stdout);}
try {
  const marketplace=cli(['plugin','marketplace','add',source,'--json']);
  const installed=cli(['plugin','add','usage-panel@codex-pulse','--json']);
  const listed=cli(['plugin','list','--json']).installed.find(plugin=>plugin.pluginId==='usage-panel@codex-pulse');
  assert.equal(marketplace.marketplaceName,'codex-pulse');assert.equal(installed.version,'0.4.1');assert.equal(listed.enabled,true);
  child=spawn(process.execPath,[path.join(installed.installedPath,'server/index.mjs')],{env:environment,stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map();let sequence=0;
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{const response=JSON.parse(line);const request=pending.get(response.id);if(request){clearTimeout(request.timer);pending.delete(response.id);response.error?request.reject(new Error(response.error.message)):request.resolve(response.result);}});
  function request(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('MCP timeout')),5000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
  const initialized=await request('initialize',{protocolVersion:'2025-03-26',clientInfo:{name:'package-smoke-test',version:'1'},capabilities:{}});
  const catalog=await request('tools/list');
  const resource=await request('resources/read',{uri:'ui://usage-panel/main.html'});
  assert.equal(initialized.serverInfo.version,'0.4.1');
  assert.deepEqual(catalog.tools[0]._meta['openai/ui'].entrypoints,[{type:'thread'}]);
  assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.ok(resource.contents[0].text.includes("const VERSION='0.4.1'"));
  assert.ok(resource.contents[0].text.includes('data:image/webp;base64,'));
  console.log(JSON.stringify({source:process.argv.includes('--github')?'github':'local',marketplace:marketplace.marketplaceName,version:listed.version,enabled:listed.enabled,threadEntrypoint:true,resource:true,isolatedConfiguration:true},null,2));
  child.stdin.end();lines.close();
} finally {
  child?.kill();
  const resolved=path.resolve(temporary),expected=path.resolve(os.tmpdir())+path.sep+'codex-pulse-smoke-';
  if(!resolved.startsWith(expected))throw new Error('Refusing cleanup outside the test directory.');
  // Windows may briefly keep handles open after the process exits.
  await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
