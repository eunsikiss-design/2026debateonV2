const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=__dirname;const client=fs.readFileSync(path.join(root,'assets','speech-live.js'),'utf8');const html=fs.readFileSync(path.join(root,'stitch_screens','08_speech_timer_training.html'),'utf8');
test('live speech uses Korean recognition and explicit microphone permission',()=>{assert.match(client,/SpeechRecognition/);assert.match(client,/getUserMedia\(\{ audio: true \}\)/);assert.match(client,/recognition\.lang = 'ko-KR'/);});
test('speech view exposes realtime transcript states without storing raw audio',()=>{for(const state of ['READY','LISTENING','PAUSED','ANALYZING','COMPLETE'])assert.match(client,new RegExp(state));assert.match(client,/원본 음성은 저장하지 않고/);assert.match(html,/speech-live\.js/);});
test('completed transcript is submitted through authenticated speech endpoint',()=>{assert.match(client,/\/api\/speech\/submit/);assert.match(client,/학생 계정 로그인이 필요합니다/);});

