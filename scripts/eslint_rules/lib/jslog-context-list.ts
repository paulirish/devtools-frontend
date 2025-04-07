// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createRule} from './tsUtils.ts';

// @ts-expect-error
const filename = fileURLToPath(import.meta.url);
const FILE = 'front_end/ui/visual_logging/KnownContextValues.ts';
const FRONT_END_PARENT_FOLDER = path.join(filename, '..', '..', '..', '..');
const ABSOLUTE_FILE_PATH = path.join(FRONT_END_PARENT_FOLDER, FILE);
const LICENSE_HEADER = `// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

`;

const formattedValues = new Set(
    fs.readFileSync(ABSOLUTE_FILE_PATH, 'utf-8').split('\n').filter(l => l.startsWith('  \'')),
);

export default createRule({
  name: 'jslog-context-list',
  meta: {
    type: 'problem',

    docs: {
      description: 'Puts jslog context values into KnownContextValues.ts file',
      category: 'Possible Errors',
    },
    messages: {
      unknownJslogContextValue: 'Found jslog context value \'{{ value }}\' that is not listed in ' + FILE,
    },
    fixable: 'code',
    schema: [],  // no options
  },
  defaultOptions: [],
  create: function(context) {
    const checkValue = (value, node) => {
      if (typeof value !== 'string') {
        return;
      }
      if (!value.length) {
        return;
      }
      const formattedValue = '  ' + JSON.stringify(value).replaceAll('"', '\'') + ',';
      if (formattedValues.has(formattedValue)) {
        return;
      }
      formattedValues.add(formattedValue);
      if (process.env.ESLINT_FAIL_ON_UNKNOWN_JSLOG_CONTEXT_VALUE) {
        context.report({
          node,
          messageId: 'unknownJslogContextValue',
          data: {value},
        });
      }
    };

    const checkPropertyValue = (propertyName, node) => {
      for (const property of node?.properties || []) {
        if (property.key?.name === propertyName || property.key?.value === propertyName) {
          checkValue(property.value?.value, node);
        }
      }
    };
    return {
      CallExpression(node) {
        const firstArg = node.arguments[0];
        if (!firstArg) {
          return;
        }

        if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' &&
            node.callee.object.name === 'VisualLogging') {
          if (firstArg.type === 'Literal') {
            checkValue(firstArg.value, node);
          }
        } else if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
          const propertyName = node.callee.property.name;
          if (propertyName === 'registerActionExtension') {
            checkPropertyValue('actionId', firstArg);
          } else if (propertyName === 'registerViewExtension') {
            checkPropertyValue('id', firstArg);
          } else if (propertyName === 'registerSettingExtension') {
            checkPropertyValue('settingName', firstArg);
          } else if (propertyName === 'createSetting') {
            if (firstArg.type === 'Literal') {
              checkValue(firstArg.value, node);
            }
          }
        }
      },
      ObjectExpression(node) {
        checkPropertyValue('jslogContext', node);
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.id.name === 'generatedProperties' &&
            node.init?.type === 'ArrayExpression') {
          for (const element of node.init.elements) {
            checkPropertyValue('name', element);
          }
        }
        if (node.id.type === 'Identifier' && node.id.name === 'generatedAliasesFor' &&
            node.init?.type === 'NewExpression') {
          const firstArg = node.init?.arguments?.[0];
          const elements = firstArg.type === 'ArrayExpression' ? firstArg.elements : [];

          for (const outerElement of elements) {
            const innerElements = outerElement?.type === 'ArrayExpression' ? outerElement.elements : [];
            for (const innerElement of innerElements) {
              if (innerElement && 'value' in innerElement) {
                checkValue(innerElement.value, innerElement);
              }
            }
          }
        }
      },
      'Program:exit'() {
        if (process.env.ESLINT_FAIL_ON_UNKNOWN_JSLOG_CONTEXT_VALUE) {
          return;
        }
        const finalContents = LICENSE_HEADER + 'export const knownContextValues = new Set([\n' +
            [...formattedValues].sort().join('\n') + '\n]);\n';
        fs.writeFileSync(ABSOLUTE_FILE_PATH, finalContents, 'utf-8');
      },
    };
  },
});
