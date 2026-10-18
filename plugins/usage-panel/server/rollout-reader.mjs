import { open, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { validThreadId, newRolloutState, applyRolloutEvent, rolloutView, unavailableConversation } from './conversation-data.mjs';

export class RolloutReader {
  constructor(root = join(process.env.CODEX_HOME || join(homedir(),'.codex'),'sessions')) {
    this.root=root; this.files=[]; this.indexAt=0; this.states=new Map(); this.headers=new Map();
  }
  async index() {
    if (Date.now()-this.indexAt<15000) return this.files;
    const files=[];
    const walk=async dir=>{ for (const e of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,e.name);
      if(e.isDirectory()) await walk(path);
      else if(e.isFile()&&e.name.endsWith('.jsonl')) files.push(path);
    }};
    await walk(this.root); this.files=files; this.indexAt=Date.now(); return files;
  }
  idOf(path) { return basename(path).match(/([0-9a-f-]{36})\.jsonl$/i)?.[1]??null; }
  async header(path) {
    if (this.headers.has(path)) return this.headers.get(path);
    const file=await open(path,'r');
    try {
      let buffer=Buffer.alloc(0), position=0, newline=-1;
      while(newline<0&&position<1048576){const chunk=Buffer.alloc(8192);const {bytesRead}=await file.read(chunk,0,chunk.length,position);if(!bytesRead)break;position+=bytesRead;buffer=Buffer.concat([buffer,chunk.subarray(0,bytesRead)]);newline=buffer.indexOf(10);}
      if(newline<0) return null;
      const e=JSON.parse(buffer.subarray(0,newline).toString('utf8'));
      if(e.type!=='session_meta'||e.payload?.id!==this.idOf(path)) return null;
      const p=e.payload, spawn=p.source?.subagent?.thread_spawn;
      const h={id:p.id,parentId:p.parent_thread_id??spawn?.parent_thread_id??null,sessionId:p.session_id??null,name:spawn?.agent_path??null,timestamp:p.timestamp};
      this.headers.set(path,h);return h;
    } finally { await file.close(); }
  }
  async read(path,id) {
    let record=this.states.get(id);
    const info=await stat(path);
    if(!record||info.size<record.position){record={state:newRolloutState(id),position:0,tail:Buffer.alloc(0),pending:null};this.states.set(id,record);}
    if(record.pending) return record.pending;
    record.pending=(async()=>{
      const file=await open(path,'r');
      try {
        // Read only the snapshot present at stat(); do not chase a live writer.
        while(record.position<info.size){
          const chunk=Buffer.alloc(Math.min(65536,info.size-record.position));
          const {bytesRead}=await file.read(chunk,0,chunk.length,record.position);if(!bytesRead)break;
          record.position+=bytesRead;record.tail=Buffer.concat([record.tail,chunk.subarray(0,bytesRead)]);
          let newline;
          while((newline=record.tail.indexOf(10))>=0){
            const line=record.tail.subarray(0,newline).toString('utf8'); record.tail=record.tail.subarray(newline+1);
            if(line.trim()) applyRolloutEvent(record.state,JSON.parse(line));
          }
          if(record.tail.length>16*1024*1024) throw new Error('Registro local excedeu o tamanho aceito.');
        }
        return record.state;
      } catch(error){ this.states.delete(id); throw error; }
      finally { await file.close(); record.pending=null; }
    })();
    return record.pending;
  }
  async conversation(id) {
    if(!validThreadId(id)) return unavailableConversation();
    try {
      const files=await this.index(), path=files.find(path=>this.idOf(path)===id);
      if(!path) return {...unavailableConversation('Não foi encontrado um registro local para esta conversa.'),threadId:id};
      const root=await this.header(path);
      if(!root)return {...unavailableConversation('O registro não confirmou o ID da conversa.'),threadId:id};
      const state=await this.read(path,id), view=rolloutView(state);
      if(!view.available) return view;
      const candidates=[];
      for(const candidate of files){
        if(candidate===path||basename(candidate)<basename(path))continue;
        let header;try{header=await this.header(candidate);}catch{continue;}
        // Direct children only; equal session alone does not imply parenthood.
        if(header?.parentId===id&&header.sessionId===root.sessionId) candidates.push({path:candidate,header});
      }
      const agents=[];
      for(const child of candidates){
        const childState=await this.read(child.path,child.header.id), agent=rolloutView(childState);
        if(!agent.available)continue;
        if(agent.endedAt!==null&&Date.now()-agent.endedAt>=6000)continue;
        agents.push({id:agent.threadId,name:child.header.name?.split('/').at(-1)||'Subagente',model:agent.model,state:agent.activity.state,
          target:agent.activity.detail,tasks:agent.tasks,context:agent.context,consumedTokens:agent.consumedTokens,
          startedAt:agent.startedAt,endedAt:agent.endedAt,resultReturned:agent.resultReturned,canStop:false,stopError:null});
      }
      view.agents=agents;
      // Cached data is never a fallback after a read failure.
      if(this.states.size>128)for(const key of this.states.keys()){if(key!==id&&!agents.some(a=>a.id===key))this.states.delete(key);if(this.states.size<=64)break;}
      return view;
    } catch { return {...unavailableConversation('Não foi possível ler os registros desta conversa.'),threadId:id}; }
  }
}
