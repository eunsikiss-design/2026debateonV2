const path=require('node:path'),fs=require('node:fs');
const local=fs.existsSync(path.join(__dirname,'localEmbedding.js'))?'./':'../services/';
require(local+'localEmbedding').extractor(process.argv[2]||path.join(__dirname,'..','data','embedding-model'),true).then(()=>console.log('Public model downloaded; runtime searches use local files only.')).catch(e=>{console.error(e.message);process.exitCode=1;});

