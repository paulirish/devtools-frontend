

/**
 * gotta start `server --cors` in traces
 *
 * npm run auto-debug-unittest -- --expanded-reporting --log-level info --mocha-fgrep=Processor
 * npm run auto-unittest -- --expanded-reporting --log-level info --mocha-fgrep=Processor
*/


import * as fs from 'node:fs';

const traceHelpersStr = fs.readFileSync('./test/unittests/front_end/helpers/TraceHelpers.ts', 'utf8');

console.assert(traceHelpersStr.includes('export function traceFilenames'));

const newStr = traceHelpersStr.replace(/export function traceFilenames[\s\S]*/m, '');

const files = fs.readdirSync('/Users/paulirish/Downloads/traces').filter(f => !f.includes('.DS_Store') && !f.endsWith('.md'))
const fnStr = `
export function traceFilenames() {
  return ${JSON.stringify(files, null, 2)};
}
`;

fs.writeFileSync('./test/unittests/front_end/helpers/TraceHelpers.ts', newStr + fnStr, 'utf8')

console.log('file updated');
