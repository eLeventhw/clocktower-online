// Test-only stand-in for the Volcengine speech endpoint; never reaches the network.
const ENDPOINT='https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!==ENDPOINT)return original(url,options);
 if(options?.headers?.['X-Api-Key']!=='ark-test-speech-key-0123456789')return new Response('{"code":45000001,"message":"invalid api key"}',{status:401});
 const body=JSON.parse(options.body);
 const audio=Buffer.from(`MP3:${body.req_params.speaker}:${body.req_params.text}`);
 const payload=`${JSON.stringify({code:0,data:audio.subarray(0,8).toString('base64')})}\n${JSON.stringify({code:0,data:audio.subarray(8).toString('base64')})}\n${JSON.stringify({code:20000000})}\n`;
 console.log('MOCK_VOLC_CALL');
 return new Response(payload,{headers:{'content-type':'application/json'}});
};
