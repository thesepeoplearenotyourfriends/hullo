const fs = require('fs');
const nodeCrypto = require('crypto');
global.window = global;
global.crypto = nodeCrypto.webcrypto;
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.BluephonePeerCore = {
  fromBase64(v) { return new Uint8Array(Buffer.from(v, 'base64')); },
  toBase64(v) { return Buffer.from(v).toString('base64'); }
};
eval(fs.readFileSync(require('path').join(__dirname, '..', 'episode-crypto.js'), 'utf8'));

const enc = new TextEncoder();
function join(a,b){const o=new Uint8Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;}
function aad(ep,t){return join(enc.encode('Bluephone/Hullo/v1\n'+ep+'\n'),new Uint8Array([t]));}
function url64(bytes){return Buffer.from(bytes).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

(async () => {
  const ep = 'lab-episode-abcdefghijklmnopqrstuvwxyz0123456789';
  const a = await HulloEpisodeCrypto.createLab(ep);
  const b = await HulloEpisodeCrypto.createLab(ep);
  await Promise.all([a.acceptHello(b.hello()), b.acceptHello(a.hello())]);
  const [ar, br] = await Promise.all([a.ready(), b.ready()]);
  if ((await b.decrypt(ar)).text !== 'ready') throw new Error('A ready failed');
  if ((await a.decrypt(br)).text !== 'ready') throw new Error('B ready failed');
  const msg = await a.encrypt('feed the cat');
  if ((await b.decrypt(msg)).text !== 'feed the cat') throw new Error('text failed');
  const ctl = await b.encryptControl({type:'call-offer',callId:'abcdefghijklmnop'});
  const ctlDec = JSON.parse((await a.decrypt(ctl)).text);
  if (ctlDec.type !== 'call-offer') throw new Error('control failed');
  const bin = new Uint8Array([1,2,3,4,5]);
  const binDec = await b.decrypt(await a.encryptBinary(bin));
  if (Buffer.compare(Buffer.from(bin), Buffer.from(binDec.bytes)) !== 0) throw new Error('binary failed');
  const ma = await a.deriveMedia('abcdefghijklmnop','audio');
  const mb = await b.deriveMedia('abcdefghijklmnop','audio');
  for (const [x,y,label] of [
    [ma.outbound.key, mb.inbound.key, 'A out/B in key'],
    [ma.inbound.key, mb.outbound.key, 'A in/B out key'],
    [ma.outbound.noncePrefix, mb.inbound.noncePrefix, 'A out/B in nonce'],
    [ma.inbound.noncePrefix, mb.outbound.noncePrefix, 'A in/B out nonce']
  ]) if (Buffer.compare(Buffer.from(x),Buffer.from(y)) !== 0) throw new Error(label+' mismatch');

  // Verify the production guest derivation remains the original v1 formula.
  const handsetPair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, true, ['deriveBits']);
  const handsetSpki = new Uint8Array(await crypto.subtle.exportKey('spki', handsetPair.publicKey));
  const guestEpisode = 'prod-episode-1';
  const guest = await HulloEpisodeCrypto.create(guestEpisode, url64(handsetSpki));
  const hello = guest.hello();
  const len = hello[1] << 8 | hello[2];
  const guestPub = await crypto.subtle.importKey('spki', hello.slice(3,3+len), {name:'ECDH',namedCurve:'P-256'}, false, []);
  const shared = await crypto.subtle.deriveBits({name:'ECDH',public:guestPub}, handsetPair.privateKey, 256);
  const base = await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveBits']);
  const context = enc.encode('Bluephone/Hullo/v1 episode keys');
  const salt = enc.encode('Bluephone/Hullo/v1 HKDF salt');
  const info = join(context, enc.encode('\n'+guestEpisode));
  const material = new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},base,512));
  const handsetInbound = await crypto.subtle.importKey('raw',material.slice(0,32),'AES-GCM',false,['decrypt']);
  const packet = await guest.encrypt('backward compatible');
  const clear = await crypto.subtle.decrypt({name:'AES-GCM',iv:packet.slice(1,13),additionalData:aad(guestEpisode,3),tagLength:128},handsetInbound,packet.slice(13));
  if (new TextDecoder().decode(clear) !== 'backward compatible') throw new Error('production v1 derivation changed');

  console.log('episode crypto: lab handshake, protected packets, media directions, and production v1 derivation OK');
})().catch(e => { console.error(e); process.exit(1); });
