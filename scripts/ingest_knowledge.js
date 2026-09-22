'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.join(__dirname,'..');
const result=spawnSync(process.env.PYTHON || 'python',['-X','utf8',path.join(__dirname,'ingest_curriculum.py'),'--root',root,'--output',path.join(root,'data','curriculum_corpus.json')],{stdio:'inherit',shell:false});
if(result.error) console.error('Python 실행 실패. PYTHON 환경 변수에 실행 파일 경로를 지정하세요.');
if(result.error || result.status!==0) console.error('의존성 설치: python -m pip install -r scripts/requirements-knowledge.txt. 실패 시 기존 corpus는 유지됩니다.');
else console.log('추출 완료. 검색 인덱스 갱신을 위해 서버를 재시작하세요.');
process.exitCode=result.status ?? 1;

