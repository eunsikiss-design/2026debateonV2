'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fingerprint=card=>crypto.createHash('sha256').update(JSON.stringify([card.cardId,card.sourceHash,card.detail])).digest('hex');
class EvidenceReviewStore {
 constructor(root){this.file=path.join(root,'data','evidence_reviews.json');this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,reviews:{},history:[]};if(this.data.version!==1)throw Error('Invalid review store');}
 state(card){const r=this.data.reviews[card.cardId];return r&&r.fingerprint===fingerprint(card)?r:{status:'pending',revision:0};}
 decorate(card,role){const r=this.state(card),corrected=typeof r.correctedDetail==='string'&&r.correctedDetail.trim()?r.correctedDetail:card.detail;const decorated={...card,detail:r.status==='approved'?corrected:card.detail,reviewStatus:r.status,reviewRevision:r.revision,verificationStatus:r.status==='approved'?'verified':'source_extracted',...(role==='teacher'?{extractedDetail:card.detail,correctedDetail:corrected,reviewNote:r.note||'',reviewedAt:r.reviewedAt||null}: {})};Object.defineProperty(decorated,'sourceFingerprint',{value:fingerprint(card),enumerable:false});return decorated;}
 save(card,input,user){
  if(user?.role!=='teacher'||!user.uid)throw Object.assign(Error('교사 계정이 필요합니다.'),{status:403});
  if(!['approved','rejected','pending'].includes(input.status)||typeof input.note!=='string'||input.note.length>2000)throw Object.assign(Error('검수 상태와 2,000자 이내 메모를 입력하세요.'),{status:400});
  if(input.status==='approved'&&input.originalChecked!==true)throw Object.assign(Error('원문 대조 확인이 필요합니다.'),{status:400});
  if(input.status==='rejected'&&!input.note.trim())throw Object.assign(Error('보류 사유를 입력하세요.'),{status:400});
  const prior=this.state(card);
  if(input.revision!==prior.revision)throw Object.assign(Error('다른 검수 내용이 저장됐습니다. 목록을 새로 불러오세요.'),{status:409});
  const correctedDetail=String(input.correctedDetail??prior.correctedDetail??card.detail).trim();
  if(!correctedDetail||correctedDetail.length<12||correctedDetail.length>12000)throw Object.assign(Error('교정 발췌문은 12~12,000자로 입력하세요.'),{status:400});
  const record={cardId:card.cardId,fingerprint:fingerprint(card),status:input.status,correctedDetail,note:input.note.trim(),reviewerUid:user.uid,reviewedAt:new Date().toISOString(),revision:prior.revision+1,originalChecked:input.originalChecked===true};
  const data={...this.data,reviews:{...this.data.reviews,[card.cardId]:record},history:[...this.data.history,record]};
  fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(data,null,2));fs.renameSync(temporary,this.file);this.data=data;return this.decorate(card,'teacher');
 }
}
module.exports={EvidenceReviewStore,fingerprint};

