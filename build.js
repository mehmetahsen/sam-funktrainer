// node build.js  ->  sam-funktrainer.html: the page with sam.js inlined, so it opens straight from disk
// (browsers refuse to load a separate module file from a file:// page).
import { readFileSync, writeFileSync } from 'node:fs';

const core = readFileSync('sam.js', 'utf8').replace(/^export /gm, '');
const page = readFileSync('index.html', 'utf8');
const importLine = /^import .* from '\.\/sam\.js';$/m;
if (!importLine.test(page)) throw new Error('index.html: import of ./sam.js not found');
writeFileSync('sam-funktrainer.html', page.replace(importLine, () => core));
console.log('wrote sam-funktrainer.html');
