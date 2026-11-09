const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const target=String(url);
 if(target==='https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'){
  console.log('MOCK_TTS_CALL');await new Promise(r=>setTimeout(r,400));
  return Response.json({output:{audio:{url:'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/example.wav?Signature=hidden-test-signature',expires_at:Math.floor(Date.now()/1000)+3600}}});
 }
 if(target.startsWith('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/'))return new Response(new Uint8Array([82,73,70,70]),{headers:{'content-type':'audio/wav'}});
 return original(url,options);
};
