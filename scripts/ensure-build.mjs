// Build artifacts must exist at runtime: the deploy sandbox may exclude build
// output from the upload or install only production dependencies. Build on
// demand instead of assuming `web-build/` and `server-dist/` arrived.
//
// Existence alone is not enough: an uploaded index.html can point at asset files
// that were never shipped, which serves a stale or broken UI without any error.
import {access, readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const required = ['web-build/index.html', 'server-dist/game.js', 'server-dist/voiceEvents.js'];
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function problems() {
  const found = [];
  for (const path of required) if (!(await exists(path))) found.push(`missing ${path}`);
  if (found.length) return found;
  // Every asset referenced by the served HTML must exist next to it.
  const html = await readFile('web-build/index.html', 'utf8');
  const refs = [...new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((m) => m[0]))];
  if (!refs.length) found.push('web-build/index.html references no assets');
  for (const ref of refs) if (!(await exists(`web-build${ref}`))) found.push(`missing web-build${ref}`);
  return found;
}

const found = await problems();
if (!found.length) {
  console.log('build artifacts present');
} else {
  for (const problem of found) console.log(problem);
  console.log('building…');
  try {
    execFileSync('npm', ['run', 'build'], {stdio: 'inherit'});
  } catch (error) {
    // Never take the site down because a rebuild is impossible; report it clearly.
    console.log(`build failed, starting with the artifacts that exist: ${error?.message || error}`);
  }
  const remaining = await problems();
  if (remaining.length) console.log(`still incomplete: ${remaining.join(', ')}`);
  else console.log('build complete');
}
