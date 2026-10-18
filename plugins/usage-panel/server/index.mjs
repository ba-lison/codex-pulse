import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';
import { toPanelData } from './panel-data.mjs';
import { hostThreadId } from './conversation-data.mjs';
import { RolloutReader } from './rollout-reader.mjs';
import { createUsageService } from './usage-service.mjs';

const version='0.4.1', resourceUri='ui://usage-panel/main.html';
const usage=createUsageService(), rollouts=new RolloutReader();
const diagnosticsDir=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'usage-panel');
function diagnostic(value){try{mkdirSync(diagnosticsDir,{recursive:true});appendFileSync(join(diagnosticsDir,'diagnostics.jsonl'),JSON.stringify({at:new Date().toISOString(),version,pid:process.pid,...value})+'\n');}catch{}}
diagnostic({event:'start'});
function readPanelHtml(){
  const template=readFileSync(new URL('../ui/main.html',import.meta.url),'utf8');
  const sprite=readFileSync(new URL('../ui/codex.webp',import.meta.url)).toString('base64');
  return template.replace('__CODEX_SPRITE__','data:image/webp;base64,'+sprite);
}
function send(message){if(!process.stdout.destroyed)process.stdout.write(JSON.stringify(message)+'\n');}
function respond(id,result){send({jsonrpc:'2.0',id,result});}
function fail(id,code,message){send({jsonrpc:'2.0',id,error:{code,message}});}
async function getUsage(params){
  // Host metadata only. Tool arguments and the process environment never select a thread.
  const threadId=hostThreadId(params._meta);
  const signals=params.arguments?.hostSignals;
  const [accountResult,conversationResult]=await Promise.allSettled([usage.read().then(toPanelData),rollouts.conversation(threadId)]);
  const account=accountResult.status==='fulfilled'?accountResult.value:null;
  const conversation=conversationResult.status==='fulfilled'?conversationResult.value:null;
  diagnostic({event:'read',metaKeys:Object.keys(params._meta||{}),threadId,conversationAvailable:conversation?.available??false,
    hostSignals:signals?{bridge:typeof signals.bridge==='string'?signals.bridge.slice(0,30):null,
      hostContextKeys:Array.isArray(signals.hostContextKeys)?signals.hostContextKeys.filter(x=>typeof x==='string').slice(0,50):[],
      globalKeys:Array.isArray(signals.globalKeys)?signals.globalKeys.filter(x=>typeof x==='string').slice(0,50):[],
      hasThreadId:typeof signals.threadId==='string'}:null,accountAvailable:account!==null});
  const data={...(account??{source:'codex-app-server',plan:null,windows:[],updatedAt:null}),version,conversation,
    capabilities:{stopAgent:false},accountError:account?null:'Não foi possível atualizar o uso da conta. Os valores foram ocultados.'};
  return {content:[{type:'text',text:account?'Janela de 5 horas: '+(account.windows[0]?.remainingPercent??'—')+'% disponível.':'Uso da conta indisponível.'}],structuredContent:data};
}
async function handle(message){
  if(!message||typeof message!=='object')return;
  const {id,method,params={}}=message;
  if(typeof method==='string'&&method.startsWith('notifications/'))return;
  if(method==='initialize')return respond(id,{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false},resources:{listChanged:false}},serverInfo:{name:'usage-panel',version}});
  if(method==='ping'||method==='logging/setLevel')return respond(id,{});
  if(method==='tools/list')return respond(id,{tools:[{
    name:'get_usage',title:'Uso restante',description:'Reads the five-hour Codex account limit and, when host thread metadata is present, read-only local telemetry for that exact conversation and its direct subagents. No control or interrupt capability.',
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:{type:'object',properties:{hostSignals:{type:'object',properties:{bridge:{type:'string',maxLength:30},hostContextKeys:{type:'array',items:{type:'string'},maxItems:80},globalKeys:{type:'array',items:{type:'string'},maxItems:80},threadId:{type:'string'},sessionId:{type:'string'}},additionalProperties:false}},additionalProperties:false},
    outputSchema:{type:'object',properties:{source:{type:'string'},plan:{type:['string','null']},windows:{type:'array'},updatedAt:{type:['string','null']},version:{type:'string'},conversation:{type:['object','null']}},required:['source','plan','windows','updatedAt','version','conversation']},
    _meta:{ui:{resourceUri},'openai/ui':{entrypoints:[{type:'thread'}]}},
  }]});
  if(method==='tools/call'){
    if(params.name!=='get_usage')return fail(id,-32602,'Unknown tool');
    return respond(id,await getUsage(params));
  }
  if(method==='resources/list')return respond(id,{resources:[{uri:resourceUri,name:'Usage remaining panel',mimeType:'text/html;profile=mcp-app'}]});
  if(method==='resources/read'){
    if(params.uri!==resourceUri)return fail(id,-32602,'Unknown resource');
    diagnostic({event:'resource-read'});
    return respond(id,{contents:[{uri:resourceUri,mimeType:'text/html;profile=mcp-app',text:readPanelHtml()}]});
  }
  if(id!==undefined)fail(id,-32601,'Method not found');
}
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{try{const message=JSON.parse(line);handle(message).catch(()=>{if(message.id!==undefined)fail(message.id,-32603,'Falha ao ler os dados do painel.');});}catch{process.stderr.write('Mensagem MCP inválida.\n');}});
function close(){usage.close();diagnostic({event:'stop'});}
input.on('close',close);
process.on('SIGTERM',()=>{close();process.exit(0);});
process.on('SIGINT',()=>{close();process.exit(0);});

