// Inlined into main.html: no remote assets or browser fetches are required.
  const VERSION='0.4.1';
  const $=id=>document.getElementById(id);
  const decimal=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const number=new Intl.NumberFormat('pt-BR');
  const clock=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  const dateLabel=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'});
  const dateKey=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const shortTokens=value=>!finite(value)?'—':value>=1000?decimal.format(value/1000)+'k':number.format(value);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const percentOf=context=>finite(context?.usedTokens)&&finite(context?.limitTokens)&&context.limitTokens>0?Math.min(100,context.usedTokens/context.limitTokens*100):null;
  const noticeLevel=percent=>percent===null||percent<25?'none':percent>51?'constant':percent>=50?'suggest':'early';
  const progressOf=agent=>agent.state==='done'?100:!Array.isArray(agent.tasks)||!agent.tasks.length?null:Math.min(99,Math.round(agent.tasks.reduce((sum,task)=>sum+((typeof task==='string'?task:task?.status)==='completed'?1:(typeof task==='string'?task:task?.status)==='in_progress'?.5:0),0)/agent.tasks.length*100));
  const ended=agent=>['done','interrupted','error'].includes(agent.state);
  const timestamp=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
  let data=null,failed=false,busy=false,disposed=false,crewFolded=false;
  let hostContext={},globalKeys=[],hostThreadId=null,bridge='pending',parentOrigin=null,initializePromise=null;
  let pollTimer=null,clockTimer=null,animationTimer=null,watchdog=null,currentState='unavailable',sequence=0,frame=0;
  const pending=new Map(),crewSeen=new Map(),outcomeTimes=new Map(),stopping=new Set(),stopErrors=new Map();
  const isHidden=()=>document.hidden;
  states.unavailable={title:'Atividade indisponível',row:0,count:1,speed:1000};
  states.error.detail='O host informou falha na atividade da conversa.';
  states.editing.detail='Alterando arquivos';
  states.reading.detail='Consultando arquivos';
  states.terminal.detail='Executando um comando';
  states.agents.detail='Acompanhando subagentes vinculados';
  // A missing event is unknown. It never implies idle, waiting or a read error.
  const updateDiagnostics=()=>{
    document.documentElement.dataset.usagePanel=JSON.stringify({version:VERSION,serverVersion:data?.version??null,bridge,hostContextKeys:Object.keys(hostContext).slice(0,80),globalKeys});
  };
  const applyTheme=()=>{
    const theme=hostContext.theme??window.openai?.theme;
    document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
    const variables=hostContext.styles?.variables;
    if(variables&&typeof variables==='object')for(const [key,value]of Object.entries(variables))if(/^--(?:color|font|border-radius)-[a-z0-9-]+$/i.test(key)&&typeof value==='string'&&value.length<200)document.documentElement.style.setProperty(key,value);
  };
  const explicitId=value=>typeof value==='string'&&value.length<=200&&/^[a-zA-Z0-9_.:-]+$/.test(value)?value:null;
  const hostSignals=()=>{
    const signals={bridge,hostContextKeys:Object.keys(hostContext).slice(0,80).map(key=>key.slice(0,100)),globalKeys};
    const thread=explicitId(hostContext.threadId)??explicitId(hostContext.conversationId);
    const session=explicitId(hostContext.sessionId);
    if(thread)signals.threadId=thread;if(session)signals.sessionId=session;
    return JSON.stringify(signals).length<8192?signals:{bridge};
  };
  const syncHostContext=next=>{
    if(!next||typeof next!=='object')return;
    hostContext={...hostContext,...next};
    const thread=explicitId(hostContext.threadId)??explicitId(hostContext.conversationId);
    if(thread!==hostThreadId){hostThreadId=thread;data=null;crewSeen.clear();outcomeTimes.clear();stopping.clear();stopErrors.clear();failed=false;render();}
    applyTheme();updateDiagnostics();
  };
  const notify=(method,params)=>{if(window.parent!==window)window.parent.postMessage({jsonrpc:'2.0',method,params},parentOrigin&&parentOrigin!=='null'?parentOrigin:'*');};
  const rpc=(method,params)=>new Promise((resolve,reject)=>{
    if(disposed)return reject(new Error('Painel encerrado.'));
    const id='usage-panel-'+VERSION+'-'+(++sequence)+'-'+Math.random().toString(36).slice(2);
    // Do not expire tool requests: allowing another request while one is unresolved
    // would create overlapping work. Teardown rejects all pending promises.
    const timeout=method==='ui/initialize'?setTimeout(()=>{pending.delete(id);reject(new Error('O host não respondeu à inicialização do painel.'));},12000):null;
    pending.set(id,{resolve,reject,timeout,method});
    window.parent.postMessage({jsonrpc:'2.0',id,method,params},parentOrigin&&parentOrigin!=='null'?parentOrigin:'*');
  });
  const initialize=()=>{
    if(initializePromise)return initializePromise;
    initializePromise=(async()=>{
      globalKeys=Object.keys(window.openai??{}).slice(0,80).map(key=>key.slice(0,100));
      if(typeof window.openai?.callTool==='function'){bridge='openai';updateDiagnostics();return;}
      if(window.parent===window)throw new Error('Abra a aba Uso restante pelo plugin no Codex.');
      bridge='mcp-apps';updateDiagnostics();
      const result=await rpc('ui/initialize',{appInfo:{name:'usage-panel',version:VERSION},appCapabilities:{},protocolVersion:'2026-01-26'});
      syncHostContext(result?.hostContext);notify('ui/notifications/initialized',{});
    })();
    return initializePromise;
  };
  const callTool=async(name,args)=>{await initialize();return bridge==='openai'?window.openai.callTool(name,args):rpc('tools/call',{name,arguments:args});};
  const setTrack=(id,value,label)=>{
    const track=$(id);if(value===null)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(value));
    track.setAttribute('aria-valuetext',value===null?label+' indisponível':decimal.format(value)+'%');
    track.dataset.unavailable=String(value===null);track.firstElementChild.style.transform='scaleX('+(value??0)/100+')';
  };
  // Head anchors measured from the unchanged 192x208 sprite cells, at the
  // principal's 72px render size. The crown shares the sprite frame clock.
  const headAnchors={
    0:[[36.75,12.38],[36.75,12.38],[36.94,12.38],[36.94,12.38],[36.75,12.38],[36.75,12.38]],
    3:[[36.75,12.38],[37.88,12.38],[37.69,12.38],[36.56,12.38]],
    4:[[36.75,12.38],[37.31,7.5],[37.69,4.12],[36.38,8.62],[36.38,12.38]],
    5:[[36,12.38],[36.94,12],[36.56,12.38],[36.75,12],[36,12.38],[36.94,12],[36.56,12.38],[36.75,12]],
    6:[[35.81,12.38],[35.81,12.38],[35.81,12.38],[35.81,12.38],[35.81,12.38],[35.81,12.38]],
    7:[[31.88,12.38],[31.88,12.38],[32.06,12.38],[32.06,12],[31.88,12.38],[31.88,12.38]],
    8:[[36.56,12.38],[36.19,9.38],[36.38,4.12],[36.56,7.88],[36.56,12.38],[36.19,9.38]],
  };
  const pose=(element,key,offset=0)=>{
    const state=states[key]??states.unavailable;
    const selected=reduced.matches?0:offset%state.count;
    const column=selected+(state.start||0);
    element.style.backgroundPosition=(column/7*100)+'% '+state.row/10*100+'%';
    if(element===$('mascot')){
      const [x,y]=headAnchors[state.row]?.[column]??headAnchors[0][0];
      $('principal-crown').style.transform='translate('+(x-11).toFixed(2)+'px,'+(y-12).toFixed(2)+'px)';
    }
  };
  const animate=()=>{
    clearTimeout(animationTimer);if(disposed||isHidden())return;
    const state=states[currentState];pose($('mascot'),currentState,Math.floor(Date.now()/state.speed));
    $('crew-list').querySelectorAll('.agent-mascot').forEach(element=>{const state=states[element.dataset.pose]??states.unavailable;pose(element,element.dataset.pose,Math.floor(Date.now()/state.speed));});
    if(!reduced.matches&&(state.count>1||[...crewSeen.values()].some(agent=>(states[agent.state]?.count??1)>1)))animationTimer=setTimeout(animate,180);
  };
  const setActivity=(activity,reason)=>{
    const key=states[activity?.state]?activity.state:'unavailable';
    if(currentState!==key){currentState=key;frame=0;$('mascot-stage').dataset.state=key;$('activity-prop').innerHTML=props[key]??'';}
    $('activity-title').textContent=states[key].title;
    $('activity-detail').textContent=activity?.detail||(key==='unavailable'?reason||'O host não forneceu eventos desta conversa.':states[key].detail||'');
    $('mascot').setAttribute('aria-label','Codex principal: '+states[key].title.toLowerCase());
    animate();
  };
  const renderTimes=()=>{
    const entry=data?.windows?.find(window=>window.id==='primary');
    const reset=typeof entry?.resetsAt==='string'?timestamp(entry.resetsAt):null;
    if(reset===null){$('reset-time').textContent='—';$('reset-countdown').textContent='Renovação não informada';return;}
    const target=new Date(reset),now=new Date(),minutes=Math.ceil((reset-Date.now())/60000);
    $('reset-time').textContent=(dateKey.format(target)===dateKey.format(now)?'':dateLabel.format(target)+' · ')+clock.format(target);
    $('reset-countdown').textContent=minutes<=0?'Aguardando renovação':'em '+(minutes>=60?Math.floor(minutes/60)+' h ':'')+(minutes%60)+' min';
  };
  const elapsed=agent=>{
    const start=timestamp(agent.startedAt),end=timestamp(agent.endedAt);
    if(start===null)return '—';if(ended(agent)&&end===null)return '—';
    const seconds=Math.max(0,Math.floor(((end??Date.now())-start)/1000));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  };
  const renderCrew=()=>{
    const now=Date.now();
    for(const [id,agent]of crewSeen)if(ended(agent)&&now-agent._finishedSeenAt>=6000)crewSeen.delete(id);
    const crew=[...crewSeen.values()];$('crew').hidden=crew.length===0;
    $('crew-count').textContent=String(crew.filter(agent=>!ended(agent)).length);
    $('crew-count').setAttribute('aria-label',$('crew-count').textContent+' subagentes ativos');
    const totalKnown=crew.every(agent=>finite(agent.consumedTokens));
    $('crew-summary').textContent=totalKnown?shortTokens(crew.reduce((sum,agent)=>sum+agent.consumedTokens,0))+' tokens consumidos':'Consumo do grupo não informado';
    $('crew-toggle').setAttribute('aria-expanded',String(!crewFolded));$('crew-toggle-label').textContent=crewFolded?'Mostrar':'Ocultar';$('crew-list').hidden=crewFolded;
    const focusedId=document.activeElement?.dataset?.stopAgent;
    $('crew-list').innerHTML=crew.map(agent=>{
      const state=states[agent.state]?agent.state:'unavailable',progress=progressOf(agent),context=percentOf(agent.context);
      const stateLabel=stopping.has(agent.id)?'Parando…':states[state].title;
      const canStop=data?.capabilities?.stopAgent===true&&agent.canStop===true&&!ended(agent);
      const control=canStop?'<button type="button" class="agent-stop" data-stop-agent="'+escapeHtml(agent.id)+'" aria-label="Parar '+escapeHtml(agent.name)+'" '+(stopping.has(agent.id)?'disabled':'')+'>'+(stopping.has(agent.id)?'Parando…':'Parar')+'</button>':'';
      const track=(value,label,kind)=>'<div class="agent-track '+kind+'" role="progressbar" aria-label="'+label+'" aria-valuemin="0" aria-valuemax="100" '+(value===null?'aria-valuetext="Não informado"':'aria-valuenow="'+value+'"')+'><div class="fill" style="transform:scaleX('+(value??0)/100+')"></div></div>';
      return '<article class="agent" data-state="'+state+'"><div class="agent-heading"><div class="mascot agent-mascot" data-pose="'+state+'" role="img" aria-label="Codex: '+stateLabel+'"></div><div class="agent-name-block"><h4 class="agent-name" title="'+escapeHtml(agent.name)+'">'+escapeHtml(agent.name||'Subagente')+'</h4><p class="agent-model">'+escapeHtml(agent.model||'Modelo não informado')+'</p></div>'+control+'</div><p class="agent-activity">'+stateLabel+'</p><p class="agent-target" title="'+escapeHtml(agent.target)+'">'+escapeHtml(agent.target||'Alvo não informado')+'</p><div class="agent-metric"><span>Tarefa</span><span class="metric-value">'+(progress===null?'—':progress+'%')+'</span></div>'+track(progress,'Progresso da tarefa','task-track')+'<div class="agent-metric"><span>Contexto</span><span class="metric-value">'+shortTokens(agent.context?.usedTokens)+' / '+shortTokens(agent.context?.limitTokens)+(context===null?'':' · '+decimal.format(context)+'%')+'</span></div>'+track(context,'Ocupação do contexto do subagente','context-track')+'<footer class="agent-footer"><span>Consumo '+shortTokens(agent.consumedTokens)+' tokens</span><time data-agent-time="'+escapeHtml(agent.id)+'">'+elapsed(agent)+'</time></footer>'+((agent.stopError||stopErrors.has(agent.id))?'<p class="error" role="status">'+escapeHtml(agent.stopError||stopErrors.get(agent.id))+'</p>':'')+'</article>';
    }).join('');
    if(focusedId)[...$('crew-list').querySelectorAll('[data-stop-agent]')].find(element=>element.dataset.stopAgent===focusedId)?.focus({preventScroll:true});
  };
  const render=()=>{
    const windowData=data?.windows?.find(window=>window.id==='primary');
    const usage=finite(windowData?.usedPercent)?Math.min(100,windowData.usedPercent):null;
    $('five-value').textContent=usage===null?'—':decimal.format(usage)+'%';$('five-rest').textContent=usage===null?'Sem leitura':decimal.format(Math.max(0,100-usage))+'% disponível';
    setTrack('five-progress',usage,'Consumo');$('five-fill').style.background=usage>=90?'#ee9393':usage>=75?'#dfb474':'#90b7f5';
    const conversation=data?.conversation,context=conversation?.context,occupied=percentOf(context);
    $('context-value').textContent=occupied===null?'—':decimal.format(occupied)+'%';$('context-rest-percent').textContent=occupied===null?'Não informado':decimal.format(100-occupied)+'% livre';
    $('tokens-used').textContent=shortTokens(context?.usedTokens);$('tokens-limit').textContent=shortTokens(context?.limitTokens);
    $('tokens-summary').setAttribute('aria-label',(finite(context?.usedTokens)?number.format(context.usedTokens):'Não informado')+' de '+(finite(context?.limitTokens)?number.format(context.limitTokens):'limite não informado')+' tokens em uso');
    setTrack('context-progress',occupied,'Contexto');$('context').dataset.severity=occupied>=90?'danger':occupied>=75?'warning':'normal';
    const level=noticeLevel(occupied);$('context-warning').hidden=level==='none';$('context-warning').dataset.level=level;
    $('context-warning').textContent=level==='constant'?'Contexto alto. Recomendado continuar em uma nova sessão.':level==='suggest'?'Metade do contexto ocupada. Vale continuar em uma nova sessão.':level==='early'?'O contexto está crescendo. Considere preparar uma nova sessão.':'';
    setActivity(conversation?.activity,conversation?.reason);renderTimes();renderCrew();updateDiagnostics();
  };
  const accept=next=>{
    if(!next||!Array.isArray(next.windows))return false;
    const nextThread=explicitId(next.conversation?.threadId);
    if(hostThreadId&&nextThread&&hostThreadId!==nextThread)return false;
    if(data?.conversation?.threadId!==next.conversation?.threadId){crewSeen.clear();outcomeTimes.clear();}
    const present=new Set();
    for(const agent of next.conversation?.agents??[]){
      if(typeof agent?.id!=='string'||!agent.id)continue;
      present.add(agent.id);const end=timestamp(agent.endedAt);
      if(!ended(agent))outcomeTimes.delete(agent.id);
      if(ended(agent)&&!outcomeTimes.has(agent.id))outcomeTimes.set(agent.id,end??Date.now());
      crewSeen.set(agent.id,{...agent,_finishedSeenAt:ended(agent)?outcomeTimes.get(agent.id):null});
      if(ended(agent))stopping.delete(agent.id);
    }
    for(const [id,agent]of crewSeen)if(!present.has(id)&&!ended(agent))crewSeen.delete(id);
    data=next;failed=false;
    const accountError=typeof next.accountError==='string'&&next.accountError.trim()?next.accountError:null;
    $('read-error').hidden=!accountError;
    $('read-error').textContent=accountError?'Não foi possível consultar o uso da conta. '+accountError:'';
    render();tickClock();return true;
  };
  const schedule=()=>{clearTimeout(pollTimer);if(!disposed&&!isHidden())pollTimer=setTimeout(update,15000);};
  const showError=message=>{
    failed=true;$('read-error').hidden=false;$('read-error').textContent=(data?'Não foi possível atualizar; os valores são da última leitura. ':'Não foi possível consultar o uso. ')+message;
    // An account-read failure cannot be interpreted as an agent activity failure.
    if(data?.conversation){data={...data,conversation:null};crewSeen.clear();}render();
  };
  const update=async()=>{
    if(disposed||busy||isHidden())return;busy=true;$('panel').setAttribute('aria-busy','true');
    watchdog=setTimeout(()=>{if(!disposed)showError('A consulta ainda não respondeu. Aguardando para evitar consultas simultâneas.');},20000);
    try{
      const boundThread=hostThreadId,result=await callTool('get_usage',{hostSignals:hostSignals()});
      if(disposed)return;if(boundThread!==hostThreadId)return;
      if(result?.isError)throw new Error(result.content?.find(item=>item.type==='text')?.text||'Falha de leitura.');
      if(!accept(result?.structuredContent))throw new Error('O plugin retornou dados incompatíveis com esta conversa.');
    }catch(error){if(!disposed)showError(error.message||'Falha de conexão.');}
    finally{clearTimeout(watchdog);busy=false;if(!disposed){$('panel').setAttribute('aria-busy','false');schedule();}}
  };
  const tickClock=()=>{
    clearTimeout(clockTimer);if(disposed||isHidden())return;renderTimes();
    const finished=[...crewSeen.values()].some(ended);if(finished)renderCrew();
    $('crew-list').querySelectorAll('[data-agent-time]').forEach(element=>{const agent=crewSeen.get(element.dataset.agentTime);if(agent)element.textContent=elapsed(agent);});
    clockTimer=setTimeout(tickClock,crewSeen.size?1000:15000);
  };
  const onMessage=event=>{
    if(event.source!==window.parent||disposed)return;
    const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
    if(parentOrigin!==null&&event.origin!==parentOrigin)return;
    if(message.id!==undefined&&pending.has(message.id)){
      const request=pending.get(message.id);if(parentOrigin===null&&request.method==='ui/initialize')parentOrigin=event.origin;
      pending.delete(message.id);clearTimeout(request.timeout);
      if(message.error)request.reject(new Error(message.error.message||'Falha na comunicação com o host.'));else request.resolve(message.result);return;
    }
    if(parentOrigin===null)return;
    if(message.method==='ui/notifications/host-context-changed'){syncHostContext(message.params);if(!busy)update();}
    if(message.method==='ui/notifications/tool-result')accept(message.params?.structuredContent);
    if(message.method==='ui/resource-teardown'){window.parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},parentOrigin==='null'?'*':parentOrigin);dispose();}
  };
  const onGlobals=event=>{
    const globals=event.detail?.globals;if(!globals||typeof globals!=='object')return;
    globalKeys=[...new Set([...globalKeys,...Object.keys(globals)])].slice(0,80);applyTheme();updateDiagnostics();
    if(globals.toolOutput)accept(globals.toolOutput);
  };
  const onVisibility=()=>{clearTimeout(pollTimer);clearTimeout(animationTimer);clearTimeout(clockTimer);$('panel').dataset.paused=String(isHidden());if(!isHidden()&&!disposed){animate();tickClock();update();}};
  const onReduced=()=>animate(),onScheme=()=>applyTheme();
  const scheme=matchMedia('(prefers-color-scheme: light)');
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const timer of [pollTimer,clockTimer,animationTimer,watchdog])clearTimeout(timer);
    for(const request of pending.values()){clearTimeout(request.timeout);request.reject(new Error('Painel encerrado.'));}pending.clear();
    window.removeEventListener('message',onMessage);window.removeEventListener('openai:set_globals',onGlobals);window.removeEventListener('pagehide',dispose);
    document.removeEventListener('visibilitychange',onVisibility);reduced.removeEventListener('change',onReduced);scheme.removeEventListener('change',onScheme);
  };
  $('crew-toggle').addEventListener('click',()=>{crewFolded=!crewFolded;renderCrew();});
  $('crew-list').addEventListener('click',async event=>{
    const button=event.target.closest('[data-stop-agent]');if(!button)return;const id=button.dataset.stopAgent,agent=crewSeen.get(id);
    if(data?.capabilities?.stopAgent!==true||agent?.canStop!==true||stopping.has(id)||ended(agent))return;
    stopping.add(id);stopErrors.delete(id);renderCrew();
    try{
      const result=await callTool('stop_agent',{agentId:id,threadId:data?.conversation?.threadId});
      if(result?.isError)throw new Error(result.content?.find(item=>item.type==='text')?.text||'O host recusou a parada.');
      if(result?.structuredContent?.conversation)accept(result.structuredContent);
      else{stopErrors.set(id,'Parada solicitada; aguardando confirmação do host.');}
    }catch(error){stopping.delete(id);stopErrors.set(id,error.message||'Não foi possível parar este agente.');}
    if(!disposed)renderCrew();
  });
  window.addEventListener('message',onMessage);window.addEventListener('openai:set_globals',onGlobals);window.addEventListener('pagehide',dispose);
  document.addEventListener('visibilitychange',onVisibility);reduced.addEventListener('change',onReduced);scheme.addEventListener('change',onScheme);
  applyTheme();render();accept(window.openai?.toolOutput);tickClock();update();
