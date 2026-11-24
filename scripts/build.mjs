import { cp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
await rm(out, {recursive:true, force:true});
await mkdir(out, {recursive:true});
await cp(path.join(root,'public'), out, {recursive:true});
for (const entry of await readdir(out)) {
  if (entry.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', path.join(out,entry)], {stdio:'inherit'});
    if (result.status !== 0) process.exit(1);
  }
}
await readFile(path.join(out,'index.html'));
console.log('Build complete: dist/');
