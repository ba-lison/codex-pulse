// Rollout telemetry is a local, read-only fallback, not an app-server subscription.
// Never select a conversation using recency, cwd, the MCP process environment or a UI guess.
export const validThreadId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function hostThreadId(meta) {
  let turn = meta?.['x-codex-turn-metadata'];
  if (typeof turn === 'string') { try { turn=JSON.parse(turn); } catch { turn=null; } }
  const values = ['openai/threadId','openai/thread_id','codexThreadId','codex_thread_id','threadId','thread_id']
    .map(key => meta?.[key]).concat(turn?.thread_id,meta?.thread?.id).filter(validThreadId);
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}

export function contextData(used, limit) {
  const usedTokens = finite(used), limitTokens = finite(limit) > 0 ? limit : null;
  const usedPercent = usedTokens === null || limitTokens === null ? null : Math.min(100, usedTokens / limitTokens * 100);
  // Compare the unrounded reading, not the displayed percentage.
  const warningLevel = usedPercent === null || usedPercent < 25 ? null : usedPercent > 51 ? 'constant' : usedPercent >= 50 ? 'suggest' : 'early';
  return { usedTokens, limitTokens, usedPercent, warningLevel };
}

export function unavailableConversation(reason = 'O host não forneceu o ID desta conversa.') {
  return { available:false, threadId:null, model:null, context:contextData(null,null), activity:{state:'unavailable',detail:reason}, agents:[], reason, source:null };
}

export function newRolloutState(id) {
  return { id, verified:false, meta:null, turns:new Map(), currentTurn:null, sample:null,
    consumedTokens:null, activity:'unavailable', activityAt:null, startedAt:null, endedAt:null,
    calls:new Map(), tasks:null, resultReturned:false };
}

function activityFor(item) {
  const name = String(item.name || item.type || '').toLowerCase();
  if (name === 'exec' && typeof item.input === 'string') {
    const methods=[...item.input.matchAll(/\btools\.([a-zA-Z0-9_]+)\s*\(/g)].map(match=>match[1]);
    const kinds=new Set(methods.map(method=>/web__run/.test(method)?'web':/apply_patch/.test(method)?'editing':/exec_command|write_stdin/.test(method)?'terminal':null).filter(Boolean));
    return kinds.size===1 ? [...kinds][0] : 'unavailable';
  }
  if (/compact/.test(name)) return 'compacting';
  if (/websearch|web_search/.test(name) || item.namespace === 'web') return 'web';
  if (/filechange|apply_patch/.test(name)) return 'editing';
  if (/commandexecution|exec|terminal/.test(name)) return 'terminal';
  if (/read_file|readfile|file_read/.test(name)) return 'reading';
  if (item.namespace === 'collaboration' || /collabtoolcall|spawn_agent|wait_agent/.test(name)) return 'agents';
  if (/requestuserinput|request_user_input/.test(name)) return 'waiting';
  return 'unavailable';
}

export function applyRolloutEvent(state, entry) {
  const p = entry?.payload;
  if (!p || typeof p !== 'object') return;
  const time = Date.parse(entry.timestamp);
  const at = Number.isFinite(time) ? time : null;
  if (entry.type === 'session_meta') {
    // Forks can contain inherited session_meta records; those must not replace identity.
    if(state.meta===null && p.id!==state.id) {state.identityRejected=true;return;}
    if(state.identityRejected)return;
    if (state.meta === null && p.id === state.id) {
      state.meta = { id:p.id, timestamp:p.timestamp, parentId:p.parent_thread_id??p.source?.subagent?.thread_spawn?.parent_thread_id??null,
        sessionId:p.session_id??null, name:p.source?.subagent?.thread_spawn?.agent_path??null };
      state.verified = true;
    }
    return;
  }
  if (!state.verified) return;
  if (entry.type === 'turn_context') {
    if (typeof p.turn_id === 'string') {
      const previous = state.turns.get(p.turn_id) || {};
      const model = typeof p.model === 'string' ? p.model : null;
      state.turns.set(p.turn_id, { ...previous, model, limit:previous.model && previous.model!==model ? null : previous.limit??null });
      if (state.currentTurn && (p.turn_id !== state.currentTurn || model !== state.sample?.model)) {
        state.sample=null; state.currentTurn=null; state.activity='unavailable'; state.calls.clear();
      }
    }
    return;
  }
  if (entry.type === 'token_usage_record') {
    // Explicit attribution is essential: forked rollouts include the parent's usage.
    if (p.thread_id !== state.id || typeof p.turn_id !== 'string') return;
    const turn = state.turns.get(p.turn_id);
    if (!turn) return;
    state.currentTurn = p.turn_id;
    if(state.sample?.turnId!==p.turn_id)state.tasks=null;
    state.startedAt ??= turn.startedAt??at;
    state.endedAt=null; state.resultReturned=false;
    if (state.activity === 'unavailable') { state.activity='thinking'; state.activityAt=at; }
    state.sample = { used:finite(p.usage?.total_tokens), limit:turn.limit, model:turn.model, turnId:p.turn_id, at };
    state.consumedTokens = finite(p.thread_token_usage?.total_tokens);
    return;
  }
  if (entry.type === 'event_msg' && p.type === 'token_count') {
    // Only pair this with a preceding explicitly attributed response in the same turn.
    // Old legacy-only logs intentionally remain unavailable.
    if (state.sample && state.sample.turnId === state.currentTurn && p.info) {
      const last = finite(p.info.last_token_usage?.total_tokens);
      if (last !== null && last === state.sample.used) {
        state.sample.limit = finite(p.info.model_context_window);
      }
    }
    return;
  }
  if (entry.type === 'compacted' || (entry.type==='event_msg' && p.type==='context_compacted')) { state.sample = null; return; }
  if(entry.type==='event_msg' && p.type==='model_reroute' && state.currentTurn && (!p.thread_id || p.thread_id===state.id)) {
    const turn=state.turns.get(state.currentTurn);
    if(turn){turn.model=typeof p.to_model==='string'?p.to_model:null;turn.limit=null;}
    state.sample=null;return;
  }
  if (entry.type === 'event_msg' && p.type === 'task_started') {
    // Keep limits indexed by turn; ownership is established later by token_usage_record.
    const turn = state.turns.get(p.turn_id) || { model:null, limit:null };
    turn.limit = finite(p.model_context_window);
    turn.startedAt=at;
    state.turns.set(p.turn_id, turn);
    state.calls.clear();
    return;
  }
  // Events with an explicit thread field can be assigned without reading message content.
  if (p.thread_id && p.thread_id !== state.id) return;
  const ownTurn = p.turn_id === state.currentTurn;
  if (entry.type === 'event_msg' && ownTurn) {
    if (p.type === 'task_complete') { state.activity='done'; state.endedAt=at; state.resultReturned=true; }
    if (p.type === 'turn_aborted') { state.activity='interrupted'; state.endedAt=at; }
    if (p.type === 'turn_plan' && Array.isArray(p.plan)) state.tasks=p.plan.map(step=>step.status);
    // A transient error may be followed by a retry; only a terminal event freezes time.
    if (p.type === 'error') { state.activity='unavailable'; state.activityAt=at; }
    if (['task_complete','turn_aborted'].includes(p.type)) { state.calls.clear(); state.activityAt=at; }
  }
  if (entry.type !== 'response_item' || state.currentTurn === null) return;
  if (['function_call','custom_tool_call'].includes(p.type)) {
    const activity = activityFor(p);
    state.calls.set(p.call_id, activity); state.activity=activity; state.activityAt=at; state.endedAt=null;
  } else if (['function_call_output','custom_tool_call_output'].includes(p.type)) {
    state.calls.delete(p.call_id);
    state.activity=[...state.calls.values()].at(-1)||'thinking'; state.activityAt=at;
  } else if (p.type === 'reasoning') { state.activity='thinking'; state.activityAt=at; }
}

export function rolloutView(state, now = Date.now()) {
  if (!state.verified) return unavailableConversation('O registro não confirmou o ID da conversa.');
  const sample = state.sample;
  const stateName = state.activityAt !== null && now-state.activityAt > 60000 && state.endedAt === null ? 'unavailable' : state.activity;
  return {
    available: true, threadId:state.id, model:sample?.model??null, source:'local-rollout',
    context:contextData(sample?.used,sample?.limit),
    activity:{state:stateName,detail:stateName==='unavailable'?'Atividade atual não confirmada nos registros locais.':'Atividade observada nos registros locais.'},
    consumedTokens:state.consumedTokens, tasks:state.tasks,
    startedAt:state.startedAt, endedAt:state.endedAt, resultReturned:state.resultReturned,
    agents:[], reason:null,
  };
}
