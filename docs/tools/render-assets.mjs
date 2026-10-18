// Documentation only: illustrative fixtures never enter the installed MCP runtime.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
import sharp from 'sharp';
import gifenc from 'gifenc';
const {GIFEncoder,quantize,applyPalette}=gifenc;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'docs/assets');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'plugins/usage-panel/ui/main.html'),'utf8');
const runtime=fs.readFileSync(path.join(root,'plugins/usage-panel/ui/panel-runtime.js'),'utf8');
const prefix=html.match(/<script>([\s\S]*?)\/\/ Inlined into main.html/)[1];
const sandbox={};vm.runInNewContext(prefix+'globalThis.catalog={states,props};})();',sandbox);
const {states,props}=sandbox.catalog;
const anchors=vm.runInNewContext('('+runtime.match(/const headAnchors=(\{[\s\S]*?\n  \});/)[1]+')');
const crown=html.match(/<svg id="principal-crown"[^>]*>([\s\S]*?)<\/svg>/)[1];
const sprite='data:image/png;base64,'+(await sharp(path.join(root,'plugins/usage-panel/ui/codex.webp')).png().toBuffer()).toString('base64');
const C={bg:'#101113',panel:'#18181b',line:'#303136',text:'#ededf2',muted:'#999ba6',faint:'#727582',blue:'#90b7f5',gold:'#d7bd83',green:'#a8d8bb',warning:'#dfb474',red:'#ee9393'};
const esc=v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const rect=(x,y,w,h,fill,rx=0,stroke='none')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const txt=(x,y,value,size=16,color=C.text,weight=400,extra='')=>`<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(value)}</text>`;
const line=(x,y,w)=>`<path d="M${x} ${y}h${w}" stroke="${C.line}"/>`;
const group=(x,y,content,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})">${content}</g>`;
const tokens=n=>n===null?'—':n>=1000?(Math.round(n/100)/10).toLocaleString('pt-BR')+'k':String(n);
const pct=n=>Number(n.toFixed(1)).toLocaleString('pt-BR')+'%';
function svg(w,h,body){return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rect(0,0,w,h,C.bg)}${body}</svg>`;}
function render(w,h,body){return new Resvg(svg(w,h,body),{font:{loadSystemFonts:true,defaultFontFamily:'Segoe UI'}}).render();}
function save(name,w,h,body){const rendered=render(w,h,body);fs.writeFileSync(path.join(out,name+'.png'),rendered.asPng());console.log(`${name}.png ${w}x${h}`);}
function footer(w,y){return line(36,y-18,w-72)+txt(36,y+7,'ILUSTRAÇÃO DO COMPONENTE · V0.4.1 · DADOS DE EXEMPLO',12,C.faint,500);}
function iconMarkup(key){
  const color=key==='done'?C.green:key==='interrupted'?C.red:key==='error'?C.warning:'#b7cef3';
  if(key==='idle'||key==='unavailable')return '';
  if(key==='terminal')return `<g color="#b7d8c8">${rect(0,0,75,49,'#202024',9,'#44444c')}<path d="m12 22 4 4-4 4m8 0h22" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 36h34m-34 5h23" stroke="#727d78"/><circle cx="10" cy="10" r="1.5" fill="#7d8e85"/><circle cx="16" cy="10" r="1.5" fill="#7d8e85"/></g>`;
  if(key==='waiting')return `<g>${rect(6,9,68,31,'#343024',5,'#be9c64')}${rect(21,40,4,26,'#96794c')}${txt(40,29,'Sua vez',11,'#efd29e',500,'text-anchor="middle"')}</g>`;
  const raw=props[key]||'';
  const match=raw.match(/<svg([^>]*)>([\s\S]*?)<\/svg>/);
  if(!match)return '';
  let content='';
  if(key!=='thinking')content=rect(0,0,75,49,'#202024',9,'#44444c')+'<path d="m13 49 3.5 3.5 3.5-3.5" fill="#202024" stroke="#44444c"/>';
  const h=key==='reading'?32:key==='compacting'?34:key==='thinking'?54:44;
  content+=`<svg x="5.5" y="${key==='reading'||key==='compacting'?3:2.5}" width="64" height="${h}" viewBox="0 0 64 44" overflow="visible" fill="none" color="${color}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${match[2]}</svg>`;
  if(key==='thinking')content+='<g fill="#b7cef3"><circle cx="29" cy="25" r="2"/><circle cx="38" cy="25" r="2"/><circle cx="47" cy="25" r="2"/></g>';
  if(key==='reading'||key==='compacting')content+=txt(37.5,45,key==='reading'?'lendo arquivos':'resumindo',9,'#aaaab4',400,'text-anchor="middle"');
  return `<g color="${color}">${content}</g>`;
}
let clipId=0;
function mascot(key,x,y,{frame=0,principal=true,scale=1}={}){
  const state=states[key]||states.idle, col=frame%state.count+(state.start||0), id='sprite-'+(++clipId);
  let art=`<defs><clipPath id="${id}">${rect(0,0,72,78,'white')}</clipPath></defs><g clip-path="url(#${id})"><image href="${sprite}" x="${-col*72}" y="${-state.row*78}" width="576" height="858"/></g>`;
  if(principal){const [cx,cy]=anchors[state.row]?.[col]??anchors[0][0];art+=`<svg x="${cx-11}" y="${cy-12}" width="22" height="15" viewBox="0 0 30 20" overflow="visible" fill="none" color="${C.gold}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">${crown}</svg>`;}
  return group(x,y,art,scale);
}
function companion(key,x,y,frame=0){return group(x,y,`<ellipse cx="40" cy="123" rx="25.5" ry="2.5" fill="#09090b" opacity=".45"/>${group(55,0,iconMarkup(key),.62)}${mascot(key,5,44,{frame})}`);}
function meter(title,used,kind='account',limit=475000){
  const unavailable=used===null, value=kind==='account'?used:unavailable||limit===null?null:used/limit*100;
  const color=value>=90?C.red:value>=75?C.warning:C.blue;
  let body=line(0,0,310)+txt(0,31,title,12,'#d3d3d9',500);
  body+=txt(0,76,value===null?'—':pct(value),29,C.text,600)+txt(value===null?34:93,76,kind==='account'?'usado':'ocupado',11,C.muted);
  body+=txt(310,76,value===null?'Não informado':pct(100-value)+(kind==='account'?' disponível':' livre'),11,C.muted,400,'text-anchor="end"');
  body+=rect(0,95,310,5,'#2c2d32',2.5)+rect(0,95,value===null?0:310*Math.min(100,value)/100,5,color,2.5);
  if(kind==='account')body+=txt(0,128,'Renova às 14:08',11,C.muted)+txt(310,128,'em 1 h 47 min',11,'#d1d1d7',400,'text-anchor="end"');
  else body+=txt(310,132,tokens(used)+' / '+tokens(limit),15,'#b9b9c3',500,'text-anchor="end"');
  return body;
}
function agent(name,{used=29700,consumed=52000,state='thinking',tasks=null,time='1:32'}={}){
  let body=mascot(state,0,0,{principal:false,scale:42/72});
  body+=txt(52,17,name,12,'#dedee5',500)+txt(52,35,'gpt-6.1-sol',10,'#858591');
  body+=txt(0,67,states[state]?.title??'Atividade indisponível',11,'#b7b7c1');
  body+=txt(0,86,'Atividade observada nos registros locais.',10,'#7f7f8b');
  body+=txt(0,115,'Tarefa',10,'#858591')+txt(310,115,tasks===null?'—':tasks+'%',10,'#b8b8c4',400,'text-anchor="end"');
  body+=rect(0,124,310,3,'#292a2f',1.5)+rect(0,124,tasks===null?0:310*tasks/100,3,C.blue,1.5);
  body+=txt(0,149,'Contexto',10,'#858591')+txt(310,149,tokens(used)+' / 475k · '+pct(used/475000*100),10,'#b8b8c4',400,'text-anchor="end"');
  body+=rect(0,158,310,2,'#292a2f',1)+rect(0,158,310*used/475000,2,'#899bb8',1);
  body+=txt(0,184,'Consumo '+tokens(consumed)+' tokens',10,'#858591')+txt(310,184,time,10,'#93939f',400,'text-anchor="end"');
  return body;
}
function panel({state='thinking',used=100000,limit=475000,account=32,agents=false,collapsed=false,unknown=false,accountError=false}={}){
  const height=accountError?610:agents&&!collapsed?970:unknown?510:560;
  let b=rect(0,0,350,height,C.panel,12,C.line)+rect(12,12,172,30,'#27272a',7,'#37383f')+txt(27,32,'Uso restante',12,'#dedee5',500)+txt(168,32,'×',17,C.muted);
  b+=group(20,54,companion(unknown?'unavailable':state,0,0));
  b+=txt(145,118,unknown?'Atividade indisponível':states[state].title,13,C.text,500);
  b+=txt(145,139,unknown?'Sem evento confirmado.':'Atividade observada nos',10,C.muted)+txt(145,155,unknown?'':'registros locais.',10,C.muted);
  b+=group(20,199,meter('Janela de 5 horas',account));
  b+=group(20,353,meter('Contexto',unknown?null:used,'context',unknown?null:limit));
  if(!unknown&&limit&&used/limit>=.25){const high=used/limit>.51;b+=`<path d="M20 507v30" stroke="#77705e"/>`+txt(30,519,high?'Contexto alto. Recomendado continuar':'O contexto está crescendo.',10,high?'#c0ad8e':'#9898a3')+txt(30,535,high?'em uma nova sessão.':'Considere preparar uma nova sessão.',10,high?'#c0ad8e':'#9898a3');}
  if(accountError)b+=txt(20,566,'Não foi possível atualizar o uso da conta.',10,'#ceae82')+txt(20,584,'Os valores foram ocultados.',10,'#ceae82');
  if(agents){b+=line(20,562,310)+txt(20,590,'Subagentes',12,'#d3d3d9',500)+rect(93,576,21,18,'#292a30',4)+txt(103.5,589,'2',10,'#b8b8c3',400,'text-anchor="middle"')+txt(330,590,collapsed?'› Mostrar':'⌄ Ocultar',10,C.muted,400,'text-anchor="end"')+txt(20,612,'81,7k tokens consumidos',11,'#898994');
    if(!collapsed)b+=group(20,636,agent('Revisar interface',{state:'reading',used:18400,consumed:52000,tasks:63}))+line(20,834,310)+group(20,852,agent('Conferir testes',{state:'terminal',consumed:29700,time:'0:54'}));
  }
  return {body:b,height:agents?(collapsed?635:1060):height};
}

// Cover: editorial layout around the real component's proportions.
const hero=panel({used:154000,account:32,state:'editing'});
save('cover',1400,820,
  rect(0,0,7,820,C.blue)+txt(64,90,'PLUGIN LOCAL / CODEX DESKTOP',15,C.blue,600,'letter-spacing="2"')+
  txt(60,220,'Codex',91,C.text,600)+txt(60,315,'Pulse',91,C.blue,600)+
  txt(64,397,'Acompanhe a conversa.',28,C.text,400)+txt(64,438,'Entenda o contexto.',28,C.text,400)+txt(64,479,'Veja cada agente.',28,C.text,400)+
  line(64,535,575)+txt(64,584,'05H',28,C.text,500)+txt(64,612,'CONSUMO',12,C.muted,500,'letter-spacing="1.5"')+
  txt(257,584,'TOKENS',28,C.text,500)+txt(257,612,'CONTEXTO REAL',12,C.muted,500,'letter-spacing="1.5"')+
  txt(492,584,'AGENTES',28,C.text,500)+txt(492,612,'MÉTRICAS PRÓPRIAS',12,C.muted,500,'letter-spacing="1"')+
  group(840,63,hero.body,1.18)+txt(64,723,'0.4.1  ·  PT-BR  ·  SOMENTE LEITURA',13,C.faint,500)+footer(1400,788));

const normal=panel({used:100000,state:'thinking'}),missing=panel({unknown:true,account:32});
save('panel-modes',1120,810,
  txt(44,51,'Um painel. Leituras com significado.',32,C.text,500)+
  txt(70,100,'01 / CONTEXTO DISPONÍVEL',13,C.blue,500)+group(70,123,normal.body,1.1)+
  txt(635,100,'02 / TELEMETRIA AUSENTE',13,C.muted,500)+group(635,123,missing.body,1.1)+
  footer(1120,778));

let dataStates=txt(40,52,'Limite ausente, atenção e falha de leitura.',32,C.text,500);
for(const [i,sample]of [
  {label:'01 / LIMITE NÃO INFORMADO',options:{limit:null}},
  {label:'02 / CONTEXTO ALTO',options:{used:310000,account:95}},
  {label:'03 / CONTA INDISPONÍVEL',options:{account:null,accountError:true}},
].entries()){
  const x=40+i*470;dataStates+=txt(x,104,sample.label,13,C.blue,500)+group(x,126,panel(sample.options).body,1.12);
}
save('data-states',1440,877,dataStates+footer(1440,845));

const openPanel=panel({used:154000,state:'agents',agents:true}),folded=panel({used:154000,state:'agents',agents:true,collapsed:true});
// Extend the component surface behind the agents, keeping the panel content unaltered.
openPanel.body=rect(0,0,350,1060,C.panel,12,C.line)+openPanel.body.replace(rect(0,0,350,970,C.panel,12,C.line),'');
folded.body=rect(0,0,350,635,C.panel,12,C.line)+folded.body.replace(rect(0,0,350,560,C.panel,12,C.line),'');
save('subagents',1120,1320,
  txt(44,52,'O grupo visível. Cada medida no seu lugar.',30,C.text,500)+
  txt(65,102,'01 / DETALHES ABERTOS',13,C.blue,500)+group(65,126,openPanel.body,1.05)+
  txt(638,102,'02 / LISTA RECOLHIDA',13,C.blue,500)+group(638,126,folded.body,1.05)+
  txt(638,862,'Ocultar mantém o resumo.',23,C.text,500)+txt(638,899,'A execução continua.',17,C.muted)+line(638,932,370)+
  txt(638,977,'TAREFA',12,C.blue,600,'letter-spacing="1"')+txt(638,1007,'Etapas declaradas; sem plano, —.',16,C.muted)+
  txt(638,1060,'CONTEXTO',12,C.blue,600,'letter-spacing="1"')+txt(638,1090,'Ocupação e limite do próprio agente.',16,C.muted)+
  txt(638,1143,'CONSUMO',12,C.blue,600,'letter-spacing="1"')+txt(638,1173,'Tokens acumulados, separados.',16,C.muted)+footer(1120,1287));

let atlas=txt(40,55,'O mascote acompanha o trabalho.',34,C.text,500)+txt(40,86,'Doze poses desenhadas. A coleta de cada evento depende do host.',16,C.muted);
const order=['idle','thinking','reading','editing','terminal','web','agents','waiting','compacting','done','interrupted','error'];
const labels={idle:'Em repouso',thinking:'Pensando',reading:'Lendo arquivos',editing:'Editando arquivos',terminal:'Terminal',web:'Web',agents:'Coordenando agentes',waiting:'Esperando você',compacting:'Compactando',done:'Concluído',interrupted:'Interrompido',error:'Erro de leitura'};
order.forEach((key,i)=>{const x=40+(i%4)*338,y=118+Math.floor(i/4)*242;atlas+=group(x+54,y,companion(key,0,0,key==='done'?2:0),1.23)+txt(x+12,y+181,labels[key],19,C.text,500)+txt(x+12,y+207,key==='interrupted'?'Olhos em X do sprite original':key==='idle'?'Acordado, sem pose de dormir':key==='done'?'Coroa ligada ao quadro da cabeça':'Acessório local em HTML/SVG',13,C.muted)+line(x+12,y+226,290);});
save('mascot-states',1400,923,atlas+footer(1400,891));

let bands=txt(36,50,'Avisos discretos, por faixa de ocupação.',29,C.text,500);
const examples=[{n:24,label:'ABAIXO DE 25%',lines:['Sem aviso.']},{n:34,label:'25% A MENOS DE 50%',lines:['O contexto está crescendo.','Considere preparar uma','nova sessão.']},{n:50.5,label:'50% A 51%',lines:['Metade do contexto ocupada.','Vale continuar em uma','nova sessão.']},{n:65,label:'ACIMA DE 51%',lines:['Contexto alto. Recomendado','continuar em uma nova sessão.']}];
examples.forEach((entry,i)=>{const x=36+i*273;bands+=rect(x,82,248,235,C.panel,10,C.line)+txt(x+17,112,entry.label,10,i<2?C.muted:C.gold,600)+txt(x+17,160,pct(entry.n),32,C.text,600)+rect(x+17,180,214,4,'#2c2d32',2)+rect(x+17,180,214*entry.n/100,4,C.blue,2);entry.lines.forEach((s,j)=>bands+=txt(x+17,221+j*20,s,12,i<2?C.muted:'#c0ad8e'));});
save('context-bands',1120,408,bands+txt(36,351,'Faixas pessoais do painel. Não representam limites técnicos dos modelos.',14,C.muted)+footer(1120,376));

// An animation of fixed documentation states, never a claim of captured live activity.
const gif=GIFEncoder();
for(let frame=0;frame<20;frame++){
  let body=txt(26,35,'A coroa segue o mesmo quadro da cabeça.',21,C.text,500);
  for(const [i,key]of ['thinking','done','terminal'].entries())body+=group(45+i*252,57,companion(key,0,0,frame),1.12)+txt(44+i*252,219,labels[key],15,C.muted);
  body+=txt(26,260,'ANIMAÇÃO ILUSTRATIVA · SPRITE ORIGINAL · 0.4.1',10,C.faint,500);
  const rendered=render(790,281,body),rgba=rendered.pixels;
  const palette=quantize(rgba,256),indexed=applyPalette(rgba,palette);
  gif.writeFrame(indexed,790,281,{palette,delay:180,repeat:0});
}
gif.finish();fs.writeFileSync(path.join(out,'mascot-motion.gif'),gif.bytes());console.log('mascot-motion.gif 790x281 / 20 frames');
