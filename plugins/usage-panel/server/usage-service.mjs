import { spawn } from 'node:child_process';
import readline from 'node:readline';

export function createUsageService({spawnProcess=spawn, timeoutMs=15000, cacheMs=15000, now=Date.now}={}) {
  let pending=null, cached=null, child=null, closed=false;
  function read() {
    if(closed) return Promise.reject(new Error('O painel foi encerrado.'));
    if(pending) return pending;
    if(cached && now()-cached.at<cacheMs) return Promise.resolve(cached.value);
    pending=new Promise((resolve,reject)=>{
      let settled=false, timer, lines;
      const finish=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);lines?.close();
        child?.stdin.destroy();child?.kill();child=null;
        if(error){cached=null;reject(error);}else{cached={value,at:now()};resolve(value);}
      };
      try {
        child=spawnProcess('codex',['app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
        lines=readline.createInterface({input:child.stdout});
        child.on('error',error=>finish(error));child.stdin.on('error',error=>finish(error));
        child.stderr.on('data',()=>{});
        child.on('close',()=>finish(new Error('O app-server encerrou antes da leitura de uso.')));
        timer=setTimeout(()=>finish(new Error('Tempo esgotado ao consultar o uso da conta.')),timeoutMs);
        lines.on('line',line=>{
          let message;try{message=JSON.parse(line);}catch{return;}
          if(message.id===1){
            if(message.error)return finish(new Error('O app-server recusou a inicialização.'));
            child?.stdin.write(JSON.stringify({method:'initialized'})+'\n');
            child?.stdin.write(JSON.stringify({id:2,method:'account/rateLimits/read',params:{excludeResetCreditDetails:true}})+'\n');
          } else if(message.id===2){
            if(message.error)return finish(new Error('Não foi possível consultar o uso da conta.'));
            finish(null,message.result);
          }
        });
        child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'usage-panel',version:'0.4.1'},capabilities:{}}})+'\n');
      }catch(error){finish(error);}
    }).finally(()=>{pending=null;});
    return pending;
  }
  return {read,close(){closed=true;cached=null;child?.kill();}};
}

