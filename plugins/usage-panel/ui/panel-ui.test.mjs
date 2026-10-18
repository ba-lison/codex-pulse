import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('./main.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness({direct=true,result,unresolved=false,reducedMotion=false}={}){
  let now=Date.parse('2026-10-18T14:00:00Z'),calls=0,nextTimer=0;
  const timers=new Map(),elements=new Map(),listeners=new Map(),messages=[];
  const makeElement=()=>({textContent:'',innerHTML:'',hidden:false,dataset:{},style:{setProperty(){}},attributes:{},firstElementChild:{style:{}},setAttribute(key,value){this.attributes[key]=String(value);},removeAttribute(key){delete this.attributes[key];},addEventListener(){},querySelectorAll(){return[];}});
  for(const id of html.matchAll(/id="([^"]+)"/g))elements.set(id[1],makeElement());
  const document={hidden:false,activeElement:null,documentElement:makeElement(),getElementById:id=>elements.get(id),addEventListener:(key,fn)=>listeners.set('document:'+key,fn),removeEventListener:key=>listeners.delete('document:'+key)};
  const parent={postMessage:(message,origin)=>messages.push({message,origin})};
  const window={parent,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  if(direct)window.openai={theme:'dark',callTool:()=>{calls++;return unresolved?new Promise(()=>{}):Promise.resolve(result??fixture());}};
  class FakeDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context=vm.createContext({window,document,Date:FakeDate,Intl,Math,console,matchMedia:query=>({matches:query.includes('reduced-motion')&&reducedMotion,addEventListener(){},removeEventListener(){}}),setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(script.replace(/\}\)\(\);\s*$/,'globalThis.api={accept,render,renderCrew,progressOf,noticeLevel,percentOf,syncHostContext,update,showError,dispose,hostSignals,pose};})();'),context);
  return{api:context.api,elements,document,listeners,timers,messages,parent,get calls(){return calls;},advance:ms=>{now+=ms;}};
}
function fixture(context={},agents=[]){return{structuredContent:{version:'0.4.0',windows:[{id:'primary',usedPercent:14,resetsAt:'2026-10-18T17:00:00Z'}],conversation:{threadId:'thread-a',context,activity:{state:'unavailable'},agents,available:false,reason:'Eventos indisponíveis'}}};}
const payload=(context={},agents=[])=>fixture(context,agents).structuredContent;

test('produto contém só painel, com ausência honesta de telemetria',async()=>{
  const h=harness();await flush();
  assert.equal(h.elements.get('five-value').textContent,'14%');
  assert.equal(h.elements.get('context-value').textContent,'—');
  assert.equal(h.elements.get('activity-title').textContent,'Atividade indisponível');
  assert.equal(h.elements.get('crew').hidden,true);
  assert.equal(h.elements.get('context-warning').hidden,true);
  assert.equal(h.elements.get('context-progress').attributes['aria-valuenow'],undefined);
  assert.equal(h.calls,1);
  for(const unwanted of ['activity-select','crew-scenario','usage-range','Conta Plus','Atualização automática','Semanal','<h1>'])assert.ok(!html.includes(unwanted),unwanted);
  assert.ok(html.includes(fs.readFileSync(new URL('./panel-runtime.js',import.meta.url),'utf8')),'runtime autocontido atualizado');
});
test('avisos usam percentuais não arredondados, recuam após compactação e não inventam limite',async()=>{
  const h=harness();await flush();
  for(const [used,level]of [[24999,'none'],[25000,'early'],[49999,'early'],[50000,'suggest'],[51000,'suggest'],[51001,'constant'],[20000,'none']]){
    h.api.accept(payload({usedTokens:used,limitTokens:100000}));assert.equal(h.elements.get('context-warning').dataset.level,level);
  }
  h.api.accept(payload({usedTokens:100000,limitTokens:null,usedPercent:90}));
  assert.equal(h.elements.get('tokens-used').textContent,'100k');assert.equal(h.elements.get('tokens-limit').textContent,'—');assert.equal(h.elements.get('context-value').textContent,'—');assert.equal(h.elements.get('context-warning').hidden,true);
});
test('cada leitura substitui contexto e limite juntos; consumo acumulado não entra na barra',async()=>{
  const h=harness();await flush();
  h.api.accept(payload({usedTokens:20000,limitTokens:100000,totalTokens:900000}));assert.equal(h.elements.get('context-value').textContent,'20%');
  h.api.accept(payload({usedTokens:30000,limitTokens:450000}));assert.equal(h.elements.get('context-value').textContent,'6,7%');
  h.api.accept(payload({usedTokens:null,limitTokens:450000}));assert.equal(h.elements.get('context-value').textContent,'—');
});
test('subagentes distinguem tarefa/contexto/consumo e não habilitam parada sem capability',async()=>{
  const h=harness();await flush();
  const agent={id:'agent-a',name:'Revisar <arquivo>',model:'Modelo real',state:'reading',target:'Arquivo real',tasks:['completed','in_progress','pending'],context:{usedTokens:20000,limitTokens:100000},consumedTokens:90000,startedAt:'2026-10-18T13:59:00Z',endedAt:null,canStop:true};
  h.api.accept(payload({usedTokens:10000,limitTokens:100000},[agent]));
  const markup=h.elements.get('crew-list').innerHTML;
  assert.match(markup,/50%/);assert.match(markup,/20k \/ 100k · 20%/);assert.match(markup,/Consumo 90k tokens/);assert.match(markup,/Revisar &lt;arquivo&gt;/);assert.doesNotMatch(markup,/data-stop-agent/);
  assert.equal(h.elements.get('context-value').textContent,'10%');
  assert.equal(h.api.progressOf({...agent,tasks:null}),null);assert.equal(h.api.progressOf({...agent,tasks:['completed']}),99);assert.equal(h.api.progressOf({...agent,state:'done',tasks:null}),100);
  const enabled=payload({},[agent]);enabled.capabilities={stopAgent:true};h.api.accept(enabled);assert.match(h.elements.get('crew-list').innerHTML,/data-stop-agent="agent-a"/);
});
test('resultado congela duração, some em seis segundos e não reaparece na consulta seguinte',async()=>{
  const h=harness();await flush();
  const agent={id:'done-a',name:'Concluído',state:'done',startedAt:'2026-10-18T13:59:00Z',endedAt:null};
  h.api.accept(payload({},[agent]));assert.equal(h.elements.get('crew').hidden,false);assert.match(h.elements.get('crew-list').innerHTML,/<time[^>]*>—<\/time>/);
  h.advance(5999);h.api.renderCrew();assert.equal(h.elements.get('crew').hidden,false);
  h.advance(1);h.api.renderCrew();assert.equal(h.elements.get('crew').hidden,true);
  h.api.accept(payload({},[agent]));assert.equal(h.elements.get('crew').hidden,true);
});
test('erro da conta mantém telemetria válida e desaparece após recuperação',async()=>{
  const h=harness();await flush();
  const next=payload({usedTokens:30000,limitTokens:100000});next.windows=[];next.accountError='Falha real no app-server.';next.conversation.activity={state:'reading',detail:'Lendo arquivo informado pelo host'};
  assert.equal(h.api.accept(next),true);assert.equal(h.elements.get('five-value').textContent,'—');assert.equal(h.elements.get('context-value').textContent,'30%');assert.equal(h.elements.get('activity-title').textContent,'Lendo arquivos');assert.equal(h.elements.get('read-error').hidden,false);assert.match(h.elements.get('read-error').textContent,/Falha real no app-server/);
  h.api.accept(payload({usedTokens:31000,limitTokens:100000}));assert.equal(h.elements.get('five-value').textContent,'14%');assert.equal(h.elements.get('read-error').hidden,true);assert.equal(h.elements.get('read-error').textContent,'');
});
test('chegada de agente rearma relógio de 15 para 1 segundo e expira resultado no prazo',async()=>{
  const h=harness();await flush();assert.ok([...h.timers.values()].some(timer=>timer.ms===15000));assert.ok(![...h.timers.values()].some(timer=>timer.ms===1000));
  h.api.accept(payload({},[{id:'new-agent',name:'Resultado',state:'done',startedAt:'2026-10-18T13:59:00Z',endedAt:'2026-10-18T14:00:00Z'}]));
  const [clockId,clockTimer]=[...h.timers].find(([,timer])=>timer.ms===1000);assert.equal(h.elements.get('crew').hidden,false);
  h.advance(6000);h.timers.delete(clockId);clockTimer.fn();assert.equal(h.elements.get('crew').hidden,true);assert.ok(![...h.timers.values()].some(timer=>timer.ms===1000));
});
test('troca da conversa apaga leituras e rejeita resposta com vínculo incompatível',async()=>{
  const h=harness();await flush();h.api.syncHostContext({threadId:'thread-b',theme:'light'});
  assert.equal(h.elements.get('five-value').textContent,'—');assert.equal(h.elements.get('crew').hidden,true);assert.equal(h.api.accept(payload({usedTokens:50000,limitTokens:100000})),false);
  assert.equal(h.api.hostSignals().threadId,'thread-b');assert.equal(h.document.documentElement.dataset.theme,'light');
});
test('timeout informa falha sem iniciar consulta sobreposta; fechar limpa timers e listeners',async()=>{
  const h=harness({unresolved:true});await flush();
  const watchdog=[...h.timers.values()].find(timer=>timer.ms===20000);watchdog.fn();await h.api.update();assert.equal(h.calls,1);assert.equal(h.elements.get('read-error').hidden,false);
  h.api.dispose();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
});
test('aba oculta pausa timers; falha conserva conta antiga com aviso e limpa telemetria',async()=>{
  const h=harness();await flush();
  h.api.accept(payload({usedTokens:50000,limitTokens:100000}));h.api.showError('Conexão indisponível.');
  assert.equal(h.elements.get('five-value').textContent,'14%');assert.equal(h.elements.get('context-value').textContent,'—');assert.match(h.elements.get('read-error').textContent,/última leitura/);
  h.document.hidden=true;h.listeners.get('document:visibilitychange')();assert.equal(h.timers.size,0);
  await h.api.update();assert.equal(h.calls,1);
  h.document.hidden=false;h.listeners.get('document:visibilitychange')();await flush();assert.equal(h.calls,2);assert.ok(h.timers.size>0);h.api.dispose();
});
test('fallback faz handshake MCP Apps e só aceita resposta do parent e origem vinculada',async()=>{
  const h=harness({direct:false});await flush();const init=h.messages[0].message;assert.equal(init.method,'ui/initialize');assert.equal(init.params.protocolVersion,'2026-01-26');
  const receive=h.listeners.get('message');receive({source:{},origin:'https://host.test',data:{jsonrpc:'2.0',id:init.id,result:{hostContext:{theme:'light'}}}});await flush();assert.equal(h.messages.length,1);
  receive({source:h.parent,origin:'https://host.test',data:{jsonrpc:'2.0',id:init.id,result:{hostContext:{theme:'light'}}}});await flush();
  assert.ok(h.messages.some(item=>item.message.method==='ui/notifications/initialized'));
  const request=h.messages.find(item=>item.message.method==='tools/call').message;
  receive({source:h.parent,origin:'https://wrong.test',data:{jsonrpc:'2.0',id:request.id,result:fixture()}});await flush();assert.equal(h.elements.get('five-value').textContent,'—');
  receive({source:h.parent,origin:'https://host.test',data:{jsonrpc:'2.0',id:request.id,result:fixture()}});await flush();assert.equal(h.elements.get('five-value').textContent,'14%');h.api.dispose();
});

test('coroa acompanha o salto do mesmo quadro e respeita movimento reduzido',async()=>{
  const h=harness();await flush();
  const mascot=h.elements.get('mascot'),crown=h.elements.get('principal-crown');
  const position=()=>[...crown.style.transform.matchAll(/(-?\d+\.\d+)px/g)].map(match=>Number(match[1]));
  h.api.pose(mascot,'done',0);const resting=position();
  h.api.pose(mascot,'done',2);const jumping=position();
  assert.ok(jumping[1]<resting[1]-7,'A coroa deve subir junto com a cabeça no salto.');
  h.api.pose(mascot,'terminal',0);const computer=position();
  assert.ok(computer[0]<resting[0]-4,'A coroa deve acompanhar a cabeça deslocada na pose do computador.');
  h.api.dispose();
  const reduced=harness({reducedMotion:true});await flush();
  reduced.api.pose(reduced.elements.get('mascot'),'done',0);
  const initial=reduced.elements.get('principal-crown').style.transform;
  reduced.api.pose(reduced.elements.get('mascot'),'done',2);
  assert.equal(reduced.elements.get('principal-crown').style.transform,initial);
  reduced.api.dispose();
});
