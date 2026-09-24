'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const transient=new Set([500,502,503,504]);

// One shared deadline prevents retries from extending the student's wait indefinitely.
async function generate({apiKey,modelName,fallbackModel,body},{fetchImpl=global.fetch,sleep=delay,random=Math.random,timeoutMs=45000}={}){
  const signal=AbortSignal.timeout(timeoutMs);
  const models=[modelName,modelName,fallbackModel||modelName];
  for(let attempt=0;attempt<models.length;attempt++){
    signal.throwIfAborted();
    const model=models[attempt];
    const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal,body:JSON.stringify(body)
    });
    if(response.ok)return {data:await response.json(),model};
    await response.body?.cancel();
    if(!transient.has(response.status)||attempt===models.length-1){
      const error=new Error(`Gemini API request failed (HTTP ${response.status})`);error.status=response.status;throw error;
    }
    await sleep(1000*2**attempt+Math.floor(random()*250),undefined,{signal});
  }
}
module.exports={generate};
