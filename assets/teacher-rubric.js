(() => {
 const form=document.getElementById('rubric-form'),list=document.getElementById('rubric-elements');
 if(!form||!list)return;
 const status=document.getElementById('rubric-status'),total=document.getElementById('rubric-total'),save=document.getElementById('rubric-save');
 const drafts=new Map();let classValue='',revision=0,dirty=false,busy=false,requestId=0;
 const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
 function field(label,type,value,options={}){
  const wrapper=make('label'),caption=make('span',null,label),input=make(options.multiline?'textarea':'input');
  if(!options.multiline)input.type=type;input.value=value??'';input.required=true;
  if(options.maxLength)input.maxLength=options.maxLength;
  if(type==='number'){input.min=String(options.min??0);input.max=String(options.max??100);input.step='1';}
  if(options.multiline)input.rows=2;
  wrapper.append(caption,input);return wrapper;
 }
 function markDirty(){dirty=true;status.textContent='수정 중 · 저장 버튼을 눌러야 다른 교사 계정에도 반영됩니다.';updateTotal();}
 function updateTotal(){
  const points=[...list.querySelectorAll('.rubric-element')].map(card=>Number(card.querySelector('.rubric-max input').value)||0);
  total.textContent=`총배점 ${points.reduce((a,b)=>a+b,0)}점 · 평가 요소 ${points.length}개`;
  if(!points.length)list.textContent='등록된 평가 요소가 없습니다. 평가 요소 추가를 눌러 시작하세요.';
 }
 function addLevel(holder,data={}){
  const row=make('div','rubric-level');
  const name=field('수행 수준','text',data.name,{maxLength:60});name.className='rubric-level-name';
  const description=field('수준별 판단 기준','text',data.description,{multiline:true,maxLength:1000});description.className='rubric-level-description';
  const points=field('해당 점수','number',data.points??0,{min:0,max:100});points.className='rubric-level-points';
  const remove=make('button','rubric-remove','수준 삭제');remove.type='button';remove.addEventListener('click',()=>{row.remove();markDirty();});
  row.append(name,description,points,remove);holder.append(row);
 }
 function addElement(data={}){
  if(list.querySelectorAll('.rubric-element').length>=30){status.textContent='평가 요소는 최대 30개까지 입력할 수 있습니다.';return;}
  if(!list.querySelector('.rubric-element'))list.replaceChildren();
  const card=make('fieldset','rubric-element');if(data.id)card.dataset.id=data.id;
  const legend=make('legend',null,'평가 요소');card.append(legend);
  const top=make('div','rubric-element-top');
  const name=field('평가 요소','text',data.name,{maxLength:100});name.className='rubric-name';
  const max=field('배점','number',data.maxPoints??10,{min:1,max:100});max.className='rubric-max';
  const remove=make('button','rubric-remove','요소 삭제');remove.type='button';remove.addEventListener('click',()=>{card.remove();markDirty();});
  top.append(name,max,remove);card.append(top);
  const levels=make('div','rubric-levels');card.append(levels);
  for(const level of data.levels||[{name:'우수',description:'기준을 충실히 충족함',points:data.maxPoints??10},{name:'보완 필요',description:'기준을 아직 충족하지 못함',points:0}])addLevel(levels,level);
  const add=make('button','rubric-add-level','수행 수준 추가');add.type='button';add.addEventListener('click',()=>{if(levels.children.length>=10){status.textContent='수행 수준은 요소당 최대 10개입니다.';return;}addLevel(levels);markDirty();});card.append(add);
  list.append(card);updateTotal();
 }
 function snapshot(){return [...list.querySelectorAll('.rubric-element')].map(card=>({
  ...(card.dataset.id?{id:card.dataset.id}:{}),name:card.querySelector('.rubric-name input').value.trim(),maxPoints:Number(card.querySelector('.rubric-max input').value),
  levels:[...card.querySelectorAll('.rubric-level')].map(row=>({name:row.querySelector('.rubric-level-name input').value.trim(),description:row.querySelector('.rubric-level-description textarea').value.trim(),points:Number(row.querySelector('.rubric-level-points input').value)}))
 }));}
 function render(rubric){revision=rubric.revision;list.replaceChildren();for(const element of rubric.elements)addElement(element);updateTotal();dirty=false;}
 async function load(value,discard=false){
  if(!value)return;const ticket=++requestId;classValue=value;busy=true;save.disabled=true;status.textContent='저장된 수행평가 기준을 불러오고 있습니다.';
  try{
   const response=await fetch('/api/teacher/rubric?class='+encodeURIComponent(value),{cache:'no-store'}),data=await response.json();
   if(!response.ok)throw Error(data.message||'루브릭을 불러오지 못했습니다.');if(ticket!==requestId)return;
   const draft=!discard&&drafts.get(value);render(draft||data.rubric);
   dirty=Boolean(draft);status.textContent=draft?'이 학급의 저장하지 않은 수정 내용을 다시 표시했습니다.':'저장된 루브릭을 불러왔습니다.';
  }catch(error){if(ticket===requestId)status.textContent=error.message;}
  finally{if(ticket===requestId){busy=false;save.disabled=false;}}
 }
 list.addEventListener('input',markDirty);
 document.getElementById('rubric-add-element').addEventListener('click',()=>{addElement();markDirty();});
 document.getElementById('rubric-reload').addEventListener('click',()=>{
  if(dirty&&!window.confirm('저장하지 않은 수정을 버리고 저장된 기준을 다시 불러올까요?'))return;
  drafts.delete(classValue);load(classValue,true);
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!classValue)return;
  const elements=snapshot();if(!elements.length){status.textContent='평가 요소를 한 개 이상 입력하세요.';return;}
  busy=true;save.disabled=true;status.textContent='루브릭을 저장하고 있습니다.';
  try{
   const response=await fetch('/api/teacher/rubric',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({class:classValue,revision,elements})}),data=await response.json();
   if(!response.ok)throw Object.assign(Error(data.message||'저장하지 못했습니다.'),{status:response.status});
   render(data.rubric);drafts.delete(classValue);status.textContent='루브릭을 저장했습니다. 다른 교사 계정에서도 이 학급 기준을 볼 수 있습니다.';
  }catch(error){status.textContent=error.status===409?error.message+' 작성한 내용은 화면에 남아 있습니다.':'저장하지 못했습니다. '+error.message;}
  finally{busy=false;save.disabled=false;}
 });
 document.addEventListener('teacher-students-loaded',event=>{
  const next=event.detail.classValue;if(next===classValue)return;
  if(classValue&&dirty)drafts.set(classValue,{revision,elements:snapshot()});
  load(next);
 });
})();
