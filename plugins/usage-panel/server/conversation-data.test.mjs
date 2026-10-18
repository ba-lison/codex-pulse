import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostThreadId,contextData,newRolloutState,applyRolloutEvent,rolloutView} from './conversation-data.mjs';
import {RolloutReader} from './rollout-reader.mjs';

const ROOT='11111111-1111-7111-8111-111111111111';
const CHILD='22222222-2222-7222-8222-222222222222';
const OTHER='33333333-3333-7333-8333-333333333333';
const NOW=Date.now();
const event=(type,payload,time=NOW)=>({timestamp:new Date(time).toISOString(),type,payload});
const meta=(id=ROOT,parent=null,session=ROOT)=>event('session_meta',{id,session_id:session,timestamp:new Date(NOW).toISOString(),source:parent?{subagent:{thread_spawn:{parent_thread_id:parent,agent_path:'/root/agente'}}}:'vscode'});
const started=(turn='t1',limit=1000,time=NOW)=>event('event_msg',{type:'task_started',turn_id:turn,model_context_window:limit},time);
const context=(turn='t1',model='sol')=>event('turn_context',{turn_id:turn,model});
const record=(id=ROOT,turn='t1',used=300,total=500)=>event('token_usage_record',{thread_id:id,turn_id:turn,usage:{total_tokens:used},thread_token_usage:{total_tokens:total}});
const count=(used=300,limit=1000)=>event('event_msg',{type:'token_count',info:{last_token_usage:{total_tokens:used},total_token_usage:{total_tokens:999999},model_context_window:limit}});
const apply=(state,...events)=>{for(const e of events)applyRolloutEvent(state,e);return state;};
const ready=(id=ROOT)=>apply(newRolloutState(id),meta(id,id===CHILD?ROOT:null),started(),context(),record(id),count());
const serialize=rows=>rows.map(r=>JSON.stringify(r)+'\n').join('');
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'usage-panel-reader-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const filename=(dir,id=ROOT)=>join(dir,`rollout-2026-10-18T10-00-00-${id}.jsonl`);

test('host identity requires one explicit valid id, including string turn metadata',()=>{
  assert.equal(hostThreadId({}),null);
  assert.equal(hostThreadId({'x-codex-turn-metadata':JSON.stringify({thread_id:ROOT})}),ROOT);
  assert.equal(hostThreadId({threadId:ROOT,'openai/threadId':CHILD}),null);
  assert.equal(hostThreadId({threadId:ROOT,'openai/threadId':ROOT}),ROOT);
  assert.equal(hostThreadId({threadId:'../sessions'}),null);
});

test('missing is null while zero usage is a real sample; warning boundaries use raw values',()=>{
  assert.deepEqual(contextData(undefined,1000),{usedTokens:null,limitTokens:1000,usedPercent:null,warningLevel:null});
  assert.equal(contextData(0,1000).usedPercent,0);
  assert.equal(contextData(100,0).limitTokens,null);
  assert.equal(contextData(249.999,1000).warningLevel,null);
  assert.equal(contextData(250,1000).warningLevel,'early');
  assert.equal(contextData(499.999,1000).warningLevel,'early');
  assert.equal(contextData(500,1000).warningLevel,'suggest');
  assert.equal(contextData(510,1000).warningLevel,'suggest');
  assert.equal(contextData(510.001,1000).warningLevel,'constant');
});

test('inherited metadata and parent token records do not replace child identity or usage',()=>{
  const s=apply(newRolloutState(CHILD),meta(CHILD,ROOT),meta(ROOT),started('parent',8000),context('parent','astra'),record(ROOT,'parent',7000,90000));
  assert.equal(s.meta.id,CHILD);assert.equal(s.meta.parentId,ROOT);assert.equal(s.sample,null);
  apply(s,started('own',1000),context('own','sol'),record(CHILD,'own',100,200),count(100,1000));
  const v=rolloutView(s,NOW);assert.equal(v.threadId,CHILD);assert.equal(v.model,'sol');assert.equal(v.context.usedTokens,100);assert.equal(v.consumedTokens,200);
});

test('context uses latest response and per-thread total stays separate',()=>{
  const s=ready();const v=rolloutView(s,NOW);
  assert.equal(v.context.usedTokens,300);assert.equal(v.consumedTokens,500);assert.equal(v.context.usedPercent,30);
  apply(s,count(999,5000));assert.equal(rolloutView(s,NOW).context.limitTokens,1000);
});

test('model switch hides old sample until a new explicitly attributed response',()=>{
  const s=ready();apply(s,started('t2',2000),context('t2','astra'));
  let v=rolloutView(s,NOW);assert.equal(v.context.usedTokens,null);assert.equal(v.context.limitTokens,null);assert.equal(v.model,null);
  apply(s,record(ROOT,'t2',400,900),count(400,2000));v=rolloutView(s,NOW);
  assert.equal(v.model,'astra');assert.equal(v.context.usedTokens,400);assert.equal(v.context.limitTokens,2000);
});

test('model switch within a turn cannot reuse the preceding models limit',()=>{
  const s=ready();apply(s,context('t1','astra'),record(ROOT,'t1',400,900));
  const view=rolloutView(s,NOW);assert.equal(view.model,'astra');assert.equal(view.context.usedTokens,400);assert.equal(view.context.limitTokens,null);assert.equal(view.context.usedPercent,null);
  apply(s,count(400,2000));assert.equal(rolloutView(s,NOW).context.limitTokens,2000);
});

test('an explicitly attributed zero response remains zero with unknown limit',()=>{
  const s=apply(newRolloutState(ROOT),meta(),started('t1',null),context(),record(ROOT,'t1',0,0),count(0,null));
  const view=rolloutView(s,NOW);assert.equal(view.context.usedTokens,0);assert.equal(view.context.limitTokens,null);assert.equal(view.context.usedPercent,null);assert.equal(view.consumedTokens,0);
});

test('top-level compaction invalidates old context and accepts a lower fresh sample',()=>{
  const s=ready();apply(s,event('compacted',{}));assert.equal(rolloutView(s,NOW).context.usedTokens,null);
  apply(s,record(ROOT,'t1',100,600),count(100,1000));assert.equal(rolloutView(s,NOW).context.usedTokens,100);
});

test('context_compacted event also invalidates old context',()=>{
  const s=ready();apply(s,event('event_msg',{type:'context_compacted'}));
  assert.equal(rolloutView(s,NOW).context.usedTokens,null);
});

test('completion and interruption are scoped to own turn',()=>{
  const s=ready();apply(s,event('event_msg',{type:'task_complete',turn_id:'parent'}));assert.notEqual(s.activity,'done');
  apply(s,event('event_msg',{type:'task_complete',turn_id:'t1'},NOW+1));assert.equal(s.activity,'done');assert.equal(s.endedAt,NOW+1);assert.equal(s.resultReturned,true);
  const interrupted=ready();apply(interrupted,event('event_msg',{type:'turn_aborted',turn_id:'t1',reason:'interrupted'},NOW+2));assert.equal(interrupted.activity,'interrupted');assert.equal(interrupted.endedAt,NOW+2);
});

test('a new own turn clears terminal flags and task progress from the prior turn',()=>{
  const s=ready();apply(s,event('event_msg',{type:'turn_plan',turn_id:'t1',plan:[{status:'completed'}]}),event('event_msg',{type:'task_complete',turn_id:'t1'},NOW-10000));
  apply(s,started('t2',1000),context('t2'),record(ROOT,'t2',200,700),count(200,1000));
  const v=rolloutView(s,NOW);assert.equal(v.endedAt,null);assert.equal(v.resultReturned,false);assert.equal(v.tasks,null);assert.equal(v.activity.state,'thinking');
});

test('a recoverable error event alone does not freeze elapsed time as a terminal result',()=>{
  const s=ready();apply(s,event('event_msg',{type:'error',turn_id:'t1',message:'provider retrying'}));
  assert.equal(s.endedAt,null);assert.equal(s.resultReturned,false);
});

test('reader requires first session_meta to confirm requested id',async t=>{
  const dir=await fixture(t);await writeFile(filename(dir),serialize([meta(OTHER),meta(ROOT),started(),context(),record(),count()]));
  const result=await new RolloutReader(dir).conversation(ROOT);assert.equal(result.available,false);
});

test('reader buffers incomplete JSON and partial UTF-8 without corrupting metadata',async t=>{
  const dir=await fixture(t),file=filename(dir);const m=meta();m.payload.source={subagent:{thread_spawn:{parent_thread_id:OTHER,agent_path:'/root/ação'}}};
  const bytes=Buffer.from(serialize([m,started(),context(),record(),count()]));const split=bytes.indexOf(Buffer.from('ç'))+1;
  await writeFile(file,bytes.subarray(0,split));const reader=new RolloutReader(dir);let state=await reader.read(file,ROOT);assert.equal(state.verified,false);
  await appendFile(file,bytes.subarray(split));state=await reader.read(file,ROOT);assert.equal(state.meta.name,'/root/ação');assert.equal(rolloutView(state,NOW).context.usedTokens,300);
  await appendFile(file,JSON.stringify(record(ROOT,'t1',400,900)));state=await reader.read(file,ROOT);assert.equal(state.sample.used,300);
  await appendFile(file,'\n');state=await reader.read(file,ROOT);assert.equal(state.sample.used,400);
});

test('reader resets its parser after file truncation',async t=>{
  const dir=await fixture(t),file=filename(dir),reader=new RolloutReader(dir);
  await writeFile(file,serialize([meta(),started(),context(),record(ROOT,'t1',300,500),count()]));assert.equal((await reader.conversation(ROOT)).context.usedTokens,300);
  await writeFile(file,serialize([meta()]));const view=await reader.conversation(ROOT);assert.equal(view.context.usedTokens,null);assert.equal(view.consumedTokens,null);
});

test('only direct children from the same session are listed',async t=>{
  const dir=await fixture(t);await writeFile(filename(dir),serialize([meta(),started(),context(),record(),count()]));
  await writeFile(filename(dir,CHILD),serialize([meta(CHILD,ROOT),started(),context(),record(CHILD),count()]));
  await writeFile(filename(dir,OTHER),serialize([meta(OTHER,null,ROOT),started(),context(),record(OTHER),count()]));
  const view=await new RolloutReader(dir).conversation(ROOT);assert.equal(view.agents.length,1);assert.equal(view.agents[0].id,CHILD);assert.equal(view.agents[0].canStop,false);
});

test('a direct child with another session is excluded',async t=>{
  const dir=await fixture(t);await writeFile(filename(dir),serialize([meta(),started(),context(),record(),count()]));
  await writeFile(filename(dir,CHILD),serialize([meta(CHILD,ROOT,OTHER),started(),context(),record(CHILD),count()]));
  assert.deepEqual((await new RolloutReader(dir).conversation(ROOT)).agents,[]);
});

test('completed agents remain briefly then leave after six seconds',async t=>{
  const dir=await fixture(t);await writeFile(filename(dir),serialize([meta(),started(),context(),record(),count()]));
  await writeFile(filename(dir,CHILD),serialize([meta(CHILD,ROOT),started(),context(),record(CHILD),count(),event('event_msg',{type:'task_complete',turn_id:'t1'},NOW-1000)]));
  await writeFile(filename(dir,OTHER),serialize([meta(OTHER,ROOT),started(),context(),record(OTHER),count(),event('event_msg',{type:'task_complete',turn_id:'t1'},NOW-7000)]));
  const view=await new RolloutReader(dir).conversation(ROOT);assert.deepEqual(view.agents.map(a=>a.id),[CHILD]);assert.equal(view.agents[0].state,'done');assert.equal(view.agents[0].resultReturned,true);
});

test('an own read failure does not return cached context as a current successful reading',async t=>{
  const dir=await fixture(t),file=filename(dir),reader=new RolloutReader(dir);await writeFile(file,serialize([meta(),started(),context(),record(),count()]));
  assert.equal((await reader.conversation(ROOT)).context.usedTokens,300);
  await appendFile(file,'invalid-json\n');const view=await reader.conversation(ROOT);assert.equal(view.available,false);assert.equal(view.context.usedTokens,null);
});

test('a malformed unrelated rollout does not erase verified parent data',async t=>{
  const dir=await fixture(t);await writeFile(filename(dir),serialize([meta(),started(),context(),record(),count()]));
  await writeFile(filename(dir,OTHER),'broken-json\n');
  const view=await new RolloutReader(dir).conversation(ROOT);assert.equal(view.available,true);assert.equal(view.context.usedTokens,300);
});
