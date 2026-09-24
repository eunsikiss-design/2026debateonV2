'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const transient=new Set([500,502,503,504]);

// One shared deadline prevents retries from extending the student's wait indefinitely.
async function generate({apiKey,modelName,fallbackModel,body},{fetchImpl=global.fetch,sleep=delay,random=Math.random,timeoutMs=45000,attemptTimeoutMs=15000}={}){
  const signal=AbortSignal.timeout(timeoutMs);
  const models=[modelName,modelName,fallbackModel||modelName];
  for(let attempt=0;attempt<models.length;attempt++){
    signal.throwIfAborted();
    const model=models[attempt];
    const attemptSignal=fallbackModel?AbortSignal.any([signal,AbortSignal.timeout(attemptTimeoutMs)]):signal;
    let response;
    try{
      response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:attemptSignal,body:JSON.stringify(body)
      });
      if(response.ok){
        const data=await response.json();
        console.info(`Gemini generation succeeded: model=${model} attempt=${attempt+1}`);
        return {data,model};
      }
    }catch(error){
      if(!fallbackModel||signal.aborted||!attemptSignal.aborted||attempt===models.length-1)throw error;
      console.warn(`Gemini generation timed out: model=${model} attempt=${attempt+1}`);
      await sleep(1000*2**attempt+Math.floor(random()*250),undefined,{signal});
      continue;
    }
    await response.body?.cancel();
    console.warn(`Gemini generation unavailable: model=${model} HTTP=${response.status} attempt=${attempt+1}`);
    if(!transient.has(response.status)||attempt===models.length-1){
      const error=new Error(`Gemini API request failed (HTTP ${response.status})`);error.status=response.status;throw error;
    }
    await sleep(1000*2**attempt+Math.floor(random()*250),undefined,{signal});
  }
}
module.exports={generate};
