const test=require('node:test'),assert=require('node:assert/strict');
const {requireVerifiedEmail}=require('./services/firebaseAuth');
const token=(provider,verified)=>({firebase:{sign_in_provider:provider},email_verified:verified});
test('password students need verified email even if a roster profile already exists',()=>{
 for(const profile of [{role:'student',onboardingComplete:false},{role:'student',onboardingComplete:true}]){
  assert.throws(()=>requireVerifiedEmail(token('password',false),profile),e=>e.code==='EMAIL_VERIFICATION_REQUIRED'&&e.status===403);
  assert.doesNotThrow(()=>requireVerifiedEmail(token('password',true),profile));
 }
});
test('teacher and social identity flows retain their own approval path',()=>{
 assert.doesNotThrow(()=>requireVerifiedEmail(token('password',false),{role:'teacher'}));
 for(const provider of ['google.com','custom'])assert.doesNotThrow(()=>requireVerifiedEmail(token(provider,false),{role:'student'}));
});
