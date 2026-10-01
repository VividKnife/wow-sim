import {appendFileSync} from 'node:fs';
const role=process.argv[2];
const record=text=>appendFileSync(process.env.RUNTIME_TEST_LOG,text+'\n');
record(`${role}:start`);
const heartbeat=setInterval(()=>{},1000);
if(process.env.RUNTIME_TEST_MODE==='fail'&&role==='simulation'||process.env.RUNTIME_TEST_MODE==='fail-api'&&role==='api')process.exit(2);
if(process.env.RUNTIME_TEST_MODE!=='timeout')process.send({type:'ready',service:role});
if(process.env.RUNTIME_TEST_MODE==='crash'&&role==='api')setTimeout(()=>process.exit(3),30);
process.on('SIGTERM',()=>{record(`${role}:stop`);if(process.env.RUNTIME_TEST_MODE==='stubborn')return;clearInterval(heartbeat);process.disconnect();});
