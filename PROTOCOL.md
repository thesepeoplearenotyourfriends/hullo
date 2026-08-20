# Hullo protected episode protocol v1

This file records the browser-side wire contract that Bluephone peers must reproduce. It describes current behavior, not a generic cryptographic framework.

## Episode handshake and application packets

Production Hullo keeps the existing Bluephone/Handset episode handshake unchanged:

1. Hullo generates an ephemeral P-256 ECDH keypair.
2. The Handset P-256 SPKI carried by the invitation is imported.
3. ECDH derives a 256-bit shared secret.
4. HKDF-SHA-256 uses salt `Bluephone/Hullo/v1 HKDF salt` and info `Bluephone/Hullo/v1 episode keys\n<episode>` to derive 64 bytes.
5. Hullo uses bytes 0..31 for outbound AES-256-GCM and bytes 32..63 for inbound AES-256-GCM. The Handset uses the complementary directions.

Packet types are:

- `1`: ECDH hello: `type || uint16_be(spki_len) || spki`
- `2`: encrypted UTF-8 `ready`
- `3`: encrypted UTF-8 chat text
- `4`: encrypted UTF-8 JSON control object
- `5`: encrypted binary application payload

Types 2 through 5 use a fresh random 96-bit nonce per packet. Their envelope is `type || nonce[12] || AES-GCM(ciphertext || tag)`. AES-GCM additional data is the UTF-8 bytes of `Bluephone/Hullo/v1\n<episode>\n` followed by the one-byte packet type. Received episode nonces are rejected on reuse.

## Protected browser test fixture

`#lab=1` is a lab-only Hullo-to-Hullo fixture. It does not create a production Hullo identity or invitation authority.

Both browsers generate ephemeral P-256 keypairs and exchange the same type-1 hello used by production Hullo. They derive the shared secret from each other. Lexicographic ordering of the complete SPKI byte strings assigns direction: the peer with the lower SPKI uses the first 32-byte application key outbound; the other peer uses it inbound. Both then exchange normal encrypted type-2 `ready` packets.

The invitation entropy is used as the lab episode identifier. `loopback=1` remains an independent ICE test fixture.

## Voice call control

Voice call control travels as protected type-4 JSON. Version 1 messages use a random 128-bit URL-safe `callId` and one of:

- `{v:1,type:"call-offer",callId,media:["audio"]}`
- `{v:1,type:"call-accept",callId,media:["audio"]}`
- `{v:1,type:"call-decline",callId,reason?}`
- `{v:1,type:"call-cancel",callId,reason?}`
- `{v:1,type:"call-hangup",callId}`
- `{v:1,type:"call-error",callId,reason?}`

Only one call is active per episode. Crossed outgoing calls are resolved deterministically by retaining the lexicographically lower `callId`.

Microphone access is requested only after an incoming call is answered or an outgoing call is accepted.

## Call-media keys

Call media does not rely on DTLS-SRTP as its only confidentiality layer. Hullo applies an encoded-media transform before WebRTC packetization and reverses it after WebRTC depacketization.

For each `callId` and media kind, HKDF-SHA-256 reuses the episode ECDH base secret with the existing salt and info:

`Bluephone/Hullo/v1 media keys\n<episode>\n<callId>\n<kind>`

It derives 72 bytes. Bytes 0..35 and 36..71 are the two directional records. Direction follows the same orientation as the episode application keys. Each record contains:

- 32-byte AES-256-GCM key
- 4-byte nonce prefix

The transform AAD is UTF-8:

`Bluephone/Hullo/v1 media\n<episode>\n<callId>\n<kind>`

Each sender transform owns one 64-bit counter beginning at 1. The encrypted encoded-frame envelope is:

`uint64_be(counter) || AES-GCM(encoded_frame || tag)`

The 96-bit GCM IV is `nonce_prefix[4] || uint64_be(counter)`. Therefore the Bluephone layer adds 24 bytes per encoded frame: 8 counter bytes plus the 16-byte GCM tag. Receivers keep a 64-counter replay window.

A sender transform must not be recreated with the same call/media/direction key, because that would restart its counter under the same nonce prefix. Current Hullo creates one audio sender transform per call and every new call uses a fresh random `callId`.

WebRTC still applies its normal DTLS-SRTP outside this layer and continues to own codec, jitter, congestion and realtime transport behavior.

## File transfer

A file begins with a protected type-4 offer:

`{v:1,type:"file-offer",id,name,mime,size,chunks,sha256}`

- `id` is 16 random bytes encoded URL-safe base64 without padding.
- `sha256` is the URL-safe base64 SHA-256 digest of the complete file.
- The current Hullo UI accepts files up to 16 MiB and at most four concurrent incoming transfers.

Each protected type-5 plaintext is:

`file_id[16] || uint32_be(chunk_index) || chunk_bytes`

The browser currently emits chunks of at most 48 KiB before type-5 encryption; Trystero may further fragment those protected packets for the data channel. The receiver bounds the assembled byte count by the authenticated offer, accepts each chunk index once, verifies final size and SHA-256, and only then exposes the completed Blob to the UI.

Raster image MIME types PNG, JPEG, WebP, GIF and AVIF may be previewed inline. Other files remain explicit downloadable attachments.
