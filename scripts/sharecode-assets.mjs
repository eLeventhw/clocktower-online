// WorkBuddy shared apps can require ?sharecode=... even for static assets.
// Inject a tiny bootstrap that carries it to the built CSS and JS requests.
import {readFile,writeFile} from 'node:fs/promises';
const file='web-build/index.html';let html=await readFile(file,'utf8');
const script=html.match(/<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const style=html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if(!script||!style)throw new Error('Vite 输出格式变化：无法为静态资源保留 sharecode');
const bootstrap=`<script>(function(){var s=new URLSearchParams(location.search).get('sharecode');function url(p){var u=new URL(p,location.origin);if(s)u.searchParams.set('sharecode',s);return u.href}var l=document.createElement('link');l.rel='stylesheet';l.href=url(${JSON.stringify(style[1])});document.head.appendChild(l);var j=document.createElement('script');j.type='module';j.src=url(${JSON.stringify(script[1])});document.head.appendChild(j)})()</script>`;
html=html.replace(script[0],bootstrap).replace(style[0],'');
await writeFile(file,html);
