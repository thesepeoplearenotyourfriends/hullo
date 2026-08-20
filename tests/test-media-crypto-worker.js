const fs = require('fs');
const nodeCrypto = require('crypto');
global.crypto = nodeCrypto.webcrypto;
global.self = global;
const errors=[];
self.postMessage = m => errors.push(m);
eval(fs.readFileSync(require('path').join(__dirname, '..', 'media-crypto-worker.js'),'utf8'));

function runTransform(options, inputData) {
  return new Promise((resolve, reject) => {
    const frame = {data: inputData.buffer.slice(inputData.byteOffset, inputData.byteOffset + inputData.byteLength)};
    const readable = new ReadableStream({start(c){c.enqueue(frame);c.close();}});
    const output=[];
    const writable = new WritableStream({write(f){output.push(new Uint8Array(f.data));}, close(){resolve(output);}, abort:reject});
    self.onrtctransform({transformer:{options, readable, writable}});
  });
}

(async()=>{
  const key = nodeCrypto.randomBytes(32);
  const prefix = nodeCrypto.randomBytes(4);
  const aad = new TextEncoder().encode('Bluephone/Hullo/v1 media\nepisode\nabcdefghijklmnop\naudio');
  const clear = new TextEncoder().encode('encoded-opus-ish-bytes');
  const encrypted = await runTransform({operation:'encrypt',callId:'abcdefghijklmnop',kind:'audio',key,noncePrefix:prefix,aad}, clear);
  if (encrypted.length !== 1) throw new Error('encrypt output count');
  if (encrypted[0].length !== clear.length + 24) throw new Error('unexpected media overhead');
  const decrypted = await runTransform({operation:'decrypt',callId:'abcdefghijklmnop',kind:'audio',key,noncePrefix:prefix,aad}, encrypted[0]);
  if (decrypted.length !== 1 || Buffer.compare(Buffer.from(decrypted[0]),Buffer.from(clear)) !== 0) throw new Error('decrypt mismatch');
  const tampered = encrypted[0].slice(); tampered[tampered.length-1] ^= 1;
  const dropped = await runTransform({operation:'decrypt',callId:'abcdefghijklmnop',kind:'audio',key,noncePrefix:prefix,aad}, tampered);
  if (dropped.length !== 0) throw new Error('tampered frame not dropped');
  if (!errors.some(e=>e.type==='media-error')) throw new Error('tamper did not report media error');
  console.log('media transform: encrypt/decrypt +24 B/frame and authenticated drop OK');
})().catch(e=>{console.error(e);process.exit(1);});
