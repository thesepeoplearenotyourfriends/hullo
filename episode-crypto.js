(function(root){"use strict";
 var enc=new TextEncoder(),dec=new TextDecoder("utf-8",{fatal:true}),context=enc.encode("Bluephone/Hullo/v1 episode keys"),salt=enc.encode("Bluephone/Hullo/v1 HKDF salt");
 function join(a,b){var out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
 function urlBytes(value){value=value.replace(/-/g,"+").replace(/_/g,"/");while(value.length%4)value+="=";return BluephonePeerCore.fromBase64(value);}
 function aad(episode,type){return join(enc.encode("Bluephone/Hullo/v1\n"+episode+"\n"),new Uint8Array([type]));}
 async function create(episode,handsetSpki){
  var pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]),handset=await crypto.subtle.importKey("spki",urlBytes(handsetSpki),{name:"ECDH",namedCurve:"P-256"},false,[]),shared=await crypto.subtle.deriveBits({name:"ECDH",public:handset},pair.privateKey,256);
  var base=await crypto.subtle.importKey("raw",shared,"HKDF",false,["deriveBits"]),info=join(context,enc.encode("\n"+episode)),material=new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt:salt,info:info},base,512));
  var inbound=await crypto.subtle.importKey("raw",material.slice(32),"AES-GCM",false,["decrypt"]),outbound=await crypto.subtle.importKey("raw",material.slice(0,32),"AES-GCM",false,["encrypt"]),publicKey=new Uint8Array(await crypto.subtle.exportKey("spki",pair.publicKey)),seen={};
  return {hello:function(){var out=new Uint8Array(3+publicKey.length);out[0]=1;out[1]=publicKey.length>>>8;out[2]=publicKey.length;out.set(publicKey,3);return out;},decrypt:async function(packet){if(packet.length<29||(packet[0]!==2&&packet[0]!==3))throw new Error("invalid protected episode packet");var nonce=packet.slice(1,13),id=BluephonePeerCore.toBase64(nonce);if(seen[id])throw new Error("replayed protected episode nonce");var clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce,additionalData:aad(episode,packet[0]),tagLength:128},inbound,packet.slice(13));seen[id]=true;return {type:packet[0],text:dec.decode(clear)};},encrypt:async function(text){var nonce=crypto.getRandomValues(new Uint8Array(12)),sealed=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:aad(episode,3),tagLength:128},outbound,enc.encode(text))),out=new Uint8Array(13+sealed.length);out[0]=3;out.set(nonce,1);out.set(sealed,13);return out;}};
 }
 root.HulloEpisodeCrypto={create:create};
}(window));
