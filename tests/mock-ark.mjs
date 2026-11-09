// Test-only stand-in for the Volcengine Ark chat endpoint. It never reaches the
// network and is imported only by tests/ark-http.mjs.
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
// Real Ark model IDs carry a date suffix; the dotted shorthand 404s upstream too.
const GOOD_MODELS = new Set(['doubao-seed-2-1-lite-260915', 'doubao-seed-2-1-pro-260915', 'ep-20261103-abcdef']);
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) !== ENDPOINT) return original(url, options);
  const auth = options?.headers?.Authorization || '';
  if (!/^Bearer ark-/.test(auth)) return new Response(JSON.stringify({error: {code: 'AuthenticationError'}}), {status: 401});
  let body = {};
  try { body = JSON.parse(options.body); } catch {}
  if (!GOOD_MODELS.has(body.model)) {
    return new Response(JSON.stringify({error: {code: 'InvalidEndpointOrModel.NotFound', message: `The model ${body.model} does not exist`}}), {status: 404});
  }
  return Response.json({choices: [{message: {content: '雾从钟楼漫下来，没人敢先开口。'}}]});
};
