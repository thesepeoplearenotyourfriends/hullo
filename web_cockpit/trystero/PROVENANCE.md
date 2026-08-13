# Bluephone vendored Trystero provenance

- `@trystero-p2p/nostr`: `0.25.3`
- `@trystero-p2p/core`: `0.25.3`
- `@noble/secp256k1`: `3.1.0`
- Acquisition: exact-version npm package archives downloaded manually in a browser.
- Build tools used here: none.
- Runtime remote JS imports: none.

## Input archive SHA-256

- `core-0.25.3.tgz`: `119534b002447f97dbf4d2de020aac3934a12ce7bac344bc0fe0bcb28107db4f`
- `nostr-0.25.3.tgz`: `9b2e277ca830e61901cbb906c3e82e564d181b346d3caa197772e70bcd5782ee`
- `secp256k1-3.1.0.tgz`: `f5d5f57083b71143291b3bc9aa9ea48a03313337c93d41a31d70b90224b57f74`

## Local modifications

Published package files are preserved except for package-style imports in
`nostr/`, rewritten to local relative paths:

- `@trystero-p2p/core` -> `../core/index.mjs`
- `@noble/secp256k1` -> `../noble-secp256k1/index.js`

Files changed by that rewrite: `1`

The dependency check examines executable static ESM statements only.
JSDoc/example imports embedded in comments are intentionally ignored.

## Output SHA-256

- `core/action-wire.mjs`: `74f77f89df5d593b14f4320f84eb5ab23953dfac3934cd21b9fe409dcafd16b4`
- `core/action-wire.mjs.map`: `baaed6073c76662242050bf2ce31da52baab4479fb249d04a0d6774f7ad7c6a9`
- `core/actions.mjs`: `1f3decfa42c72fc5fd6dd7d33cb04983f060ac42d87767bdf7144b6efcd06a40`
- `core/actions.mjs.map`: `b199f7e7b47d041b7bebbec1bf32b1db1224383482ad0c83d8f4d90636166215`
- `core/crypto.d.mts`: `4a36d6c37f88926b888ccc04b24f56846aa751a511b633bd7d3d67c12c054b3c`
- `core/crypto.d.mts.map`: `02744f43d22e78a1e0900b2bca4e24930cf1db972fed5558906899ffe4397fee`
- `core/crypto.mjs`: `c58322ee8867e1680ebf47f5ce173c4ad0ebca38c3322201ef39cd17b69a503d`
- `core/crypto.mjs.map`: `24d625e35b6ca75058ddfcf9a6311ec80eead2690ed3f4075848ea3e68d8981f`
- `core/handshake.mjs`: `1358a8511e3f6c69d8ec3571b5313a18df5c2a7afe2d2d908145f749a62c5d43`
- `core/handshake.mjs.map`: `9d50a4270a18ea3f214d0c8a40d6ff0ed948e6326251cbd7419da115342a0299`
- `core/index.d.mts`: `c23b12116ef7092b2809270eb3bb4b7565b026612dbed0a5a6344858cc31e19c`
- `core/index.mjs`: `48c0bf986ff3dd8d7d77292fbcbd81be6aa850209efffbb2dc36f93c70b4431d`
- `core/media.mjs`: `92c1fec7cbf88768147e394d30f420ab6dfb1d23c395eb26310c697c94a541ec`
- `core/media.mjs.map`: `776269e86a74ae43e6fc5545ed745018a73128d8c3ff10ae42b9c7d1ce755344`
- `core/offer-pool.mjs`: `901a9194c2c7c39ba7a32bdb68aae4af47e1667dac4c34962bae3804ba8de3e5`
- `core/offer-pool.mjs.map`: `c818623cec4eab6f192df7f3bcbdcbb3c00c45b71adbba6126daf478ef31f571`
- `core/peer.mjs`: `beab4ecec7fd934541f4590ccc0828d32bd812c2314cb857a4a01887c43b249a`
- `core/peer.mjs.map`: `7fe9b5fd942236b00dea5e5b865d3b174db5d3384e4ff3705979b87d195e8bd8`
- `core/room.mjs`: `61306f5e0683165b2da19550df3c313f7233825e1f1bd64a05e11972a4179f05`
- `core/room.mjs.map`: `0f6c33fd76b0143e18489be3685ffcbd629b2d42da5bc5dda4e2e1384f75654b`
- `core/shared-peer.mjs`: `a73b399b70e0bc158687a874636945afa430794eadd98d84d87b8f499a342d99`
- `core/shared-peer.mjs.map`: `bc051d78a05218b5b2b77b7acc68427cc704000d62a36ec744cfa7e409445b25`
- `core/signal-handler.mjs`: `033167de34987a434d90c99ffb7f8183fd4d85a6562adbc7501855d5ce78d6d5`
- `core/signal-handler.mjs.map`: `db1ba920635674f18d663fcb767f63bec1cbe91939dd955c9d9e95dbb5acd5d9`
- `core/strategy.d.mts`: `642dcac3d28ebbc4cd04f63a87c8f04926d525c580ad4eaa69f9a42f11c55a36`
- `core/strategy.d.mts.map`: `f3b1532234901ee6ab9da01a1068f1284de7289b5baea1a52bf621e0518640d5`
- `core/strategy.mjs`: `2951d79e61b3325d8afc29d69a614335070e16f7077b90f541ad668a2efccb79`
- `core/strategy.mjs.map`: `bc5678a89647a5b0b20bd40d1f0e99c051f152d91205aa87a291ec9fcdb985fc`
- `core/topic-strategy.d.mts`: `2969ac29998b73a6106122a74fb42f75c478796e05ed433a4ea73ae9f3296b78`
- `core/topic-strategy.d.mts.map`: `310aa5d9fc6896eb36ef37a04f320e07f60a4971c147bdde1bde1a37fa29a641`
- `core/topic-strategy.mjs`: `ea5bba95600faf7900653705f376497594e41ac45b8550c373343f907dbc2b0c`
- `core/topic-strategy.mjs.map`: `41ce0ed4df8d96daed8eab6238d744e578d22056f540f21d734ec4e3c1568ad9`
- `core/types.d.mts`: `0025814555e7ddfd8b4511276460c1498a4101554645b5d3c5f2d5b121c39aab`
- `core/types.d.mts.map`: `695e95dc6ace522f87c58b2247df1b36ca6df70cb7d1cf120d95e5d969415456`
- `core/utils.d.mts`: `8a8951d947a1795ac6e2c6e73790feae39da1e7d1324b7a32abaf2e13803f139`
- `core/utils.d.mts.map`: `5edbf13af07932d0a64951ee00947bc5baa6fb5fc338a454e822ad5e92bf4c48`
- `core/utils.mjs`: `c5432bfbae0028144a40532396c4acb99b29e2840f24aa686c14390970380c63`
- `core/utils.mjs.map`: `e4d1c97c2fe6ea4dfb2d44d3c09dc3d838f63eb8a9048cb62a198af533c875ac`
- `licenses/NOBLE-SECP256K1-MIT.txt`: `394c2e6e5552e5dba202bee6390b9d6aa2754d657f5b9869e83b3d265a315501`
- `licenses/TRYSTERO-MIT.txt`: `bbf91fd979faac0def9551c570e2e9f92b4e02d22f38ca5d98860b6284e1ea25`
- `noble-secp256k1/index.js`: `e0d1bad238ceef8d5451713daf6d5b256ce871d3200fe7ee79dbc01179ec806a`
- `nostr/index.d.mts`: `3ad842c060eede2896a3c6b92f3341403965154a8ee4d5d52263181981e86e6e`
- `nostr/index.d.mts.map`: `d01ccbd9385b4716995d5381d77b9018b68ee160a5dd5531668efdb65da7c792`
- `nostr/index.mjs`: `e0bb078a46d4a2431a20889b5670fe48e3e301e4ed7102927e643cff5bb9f813`
- `nostr/index.mjs.map`: `c79734228509236e9f085964475b3edbb0af65f93772ef6c32a705a4c234f559`
