const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'assets/auth-client.js'),'utf8').replace(/import\(/g,'__import(');
async function setup({popupError=null,session=false}={}){
 const nodes={},calls=[];const node=id=>nodes[id]||(nodes[id]={hidden:false,disabled:false,textContent:'',value:'',reportValidity:()=>true,handlers:{},querySelector:()=>null,addEventListener(event,fn){this.handlers[event]=fn;}});
 const user={uid:'test',role:'student',onboardingComplete:true};const auth={};
 const authModule={getAuth:()=>auth,browserSessionPersistence:{},setPersistence:async()=>{},getRedirectResult:async()=>null,GoogleAuthProvider:class{setCustomParameters(p){calls.push(p);}},signInWithPopup:async()=>{calls.push('popup');if(popupError)throw {code:popupError};return {user:{getIdToken:async()=> 'fixture-token'}};},signInWithEmailAndPassword:async(auth,email,password)=>{calls.push(['email-login',email,password]);return {user:{getIdToken:async()=> 'fixture-token'}};},createUserWithEmailAndPassword:async(auth,email,password)=>{calls.push(['email-signup',email,password]);return {user:{getIdToken:async()=> 'fixture-token'}};},sendPasswordResetEmail:async(auth,email)=>calls.push(['email-reset',email]),signOut:async()=>calls.push('signOut')};
 const location={hostname:'example.test',search:'',href:'',replace(){}};
 const fetch=async(url,opts)=>{calls.push(url);if(url==='/api/auth/me')return {ok:session,status:session?200:401,json:async()=>({user})};if(url==='/api/auth/session'){assert.equal(JSON.parse(opts.body).idToken,'fixture-token');return {ok:true,json:async()=>({user})};}return {ok:true,json:async()=>url.endsWith('providers')?{providers:{naver:true,kakao:true}}:{firebase:{projectId:'test'}}};};
 vm.runInNewContext(source,{document:{getElementById:node},location,localStorage:{setItem(){},removeItem(){}},fetch,URLSearchParams,console,__import:async url=>{calls.push('import');return url.includes('firebase-app')?{initializeApp:()=>({}),getApps:()=>[]}:authModule;}});
 for(let i=0;i<10;i++)await new Promise(setImmediate);node('email-address');node('email-password');return {nodes,calls,location};
}
test('Google popup exchanges a fresh token for the server session and opens student hub',async()=>{const a=await setup();await a.nodes['google-sso-btn'].handlers.click();assert.ok(a.calls.includes('popup'));assert.ok(a.calls.includes('/api/auth/session'));assert.match(a.location.href,/13_learning_hub/);assert.equal(a.nodes['google-sso-btn'].disabled,false);});
test('blocked or closed Google popup explains recovery and permits retry',async()=>{for(const code of ['auth/popup-blocked','auth/popup-closed-by-user']){const a=await setup({popupError:code});await a.nodes['google-sso-btn'].handlers.click();assert.equal(a.nodes['google-sso-btn'].disabled,false);assert.match(a.nodes['auth-status'].textContent,/다시/);assert.ok(!a.calls.includes('/api/auth/session'));}});
test('existing app session does not depend on loading the Firebase browser SDK',async()=>{const a=await setup({session:true});assert.match(a.location.href,/13_learning_hub/);assert.ok(!a.calls.includes('import'));});
test('personal email login and signup use Firebase passwords and exchange the same authenticated session',async()=>{
 for(const signup of [false,true]){const a=await setup();a.nodes['email-address'].value='student@example.test';a.nodes['email-password'].value='test-password';
  if(signup)a.nodes['email-signup'].handlers.click();else a.nodes['email-form'].handlers.submit({preventDefault(){}});
  for(let i=0;i<10;i++)await new Promise(setImmediate);
  assert.ok(a.calls.some(c=>Array.isArray(c)&&c[0]===(signup?'email-signup':'email-login')&&c[1]==='student@example.test'));assert.ok(a.calls.includes('/api/auth/session'));assert.equal(a.nodes['email-password'].value,'');assert.match(a.location.href,/13_learning_hub/);
 }
});
test('password reset requests the email without creating another profile',async()=>{const a=await setup();a.nodes['email-address'].value='student@example.test';await a.nodes['email-reset'].handlers.click();assert.ok(a.calls.some(c=>Array.isArray(c)&&c[0]==='email-reset'));assert.ok(!a.calls.includes('/api/auth/session'));});
