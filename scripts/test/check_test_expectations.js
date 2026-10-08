// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

import {parseExpectations, serializeExpectations} from '../../test/conductor/test_expectations_parser.js';
import {devtoolsRootPath} from '../devtools_paths.js';

const yargsObject = yargs(hideBin(process.argv))
                        .option('fix', {
                          type: 'boolean',
                          desc: 'Set to true to fix formatting and sort results.',
                          default: false,
                        })
                        .option('expectations-file', {
                          type: 'string',
                          desc: 'Path to the expectations file to check.',
                          default: path.join(devtoolsRootPath(), 'test', 'TestExpectations'),
                        })
                        .parseSync();

const expectationsPath = path.resolve(yargsObject['expectations-file']);
const originalContent = fs.readFileSync(expectationsPath, 'utf-8');

try {
  const parsed = parseExpectations(originalContent);
  const serialized = serializeExpectations(parsed);

  if (originalContent !== serialized) {
    if (yargsObject.fix) {
      fs.writeFileSync(expectationsPath, serialized, 'utf-8');
      console.log(`Successfully updated ${expectationsPath}.`);
      process.exit(0);
    } else {
      console.error(
          `${expectationsPath} is not formatted or serialized correctly.\n` +
              'Expectations (such as results [ Pass Failure ]) must be sorted alphabetically.\n' +
              `Run "node scripts/test/check_test_expectations.js --fix --expectations-file ${
                  expectationsPath}" to fix automatically.\n`,
      );

      const origLines = originalContent.split('\n');
      const serialLines = serialized.split('\n');
      const diffs = [];
      for (let i = 0; i < Math.max(origLines.length, serialLines.length); i++) {
        if (origLines[i] !== serialLines[i]) {
          const origLine = origLines[i] !== undefined ? origLines[i] : '<EOF>';
          const serialLine = serialLines[i] !== undefined ? serialLines[i] : '<EOF>';
          diffs.push(`Line ${i + 1}:\n- ${origLine}\n+ ${serialLine}`);
        }
      }
      if (diffs.length > 0) {
        console.error('Differences found:');
        console.error(diffs.join('\n\n'));
      }
      process.exit(1);
    }
  }
} catch (err) {
  console.error(`Failed to parse ${expectationsPath}: ${err.message}`);
  process.exit(1);
}
