const { Issuer, generators } = require('openid-client');
let clientPromise;
async function getClient(){ if(!clientPromise){ clientPromise=(async()=>{ const issuer=await Issuer.discover('https://apis.roblox.com/oauth/.well-known/openid-configuration'); return new issuer.Client({ client_id:process.env.ROBLOX_CLIENT_ID, client_secret:process.env.ROBLOX_CLIENT_SECRET, redirect_uris:[process.env.ROBLOX_REDIRECT_URI], response_types:['code'], id_token_signed_response_alg:'ES256' }); })(); } return clientPromise; }
async function authUrl(req){ const client=await getClient(); const state=generators.state(); const nonce=generators.nonce(); req.session.oauth={state,nonce}; return client.authorizationUrl({scope:'openid profile',state,nonce}); }
async function callback(req){ const client=await getClient(); const params=client.callbackParams(req); const tokenSet=await client.callback(process.env.ROBLOX_REDIRECT_URI, params, req.session.oauth || {}); return client.userinfo(tokenSet.access_token); }
module.exports={authUrl,callback};
