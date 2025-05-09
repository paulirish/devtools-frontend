// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Rule to ban usage of assert.equal
 * @author Jack Franklin
 */
'use strict';

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'problem',

    docs: {
      description: 'Usage of assert.equal',
      category: 'Possible Errors',
    },
    fixable: 'code',
    schema: [], // no options
  },
  create: function (context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'assert' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'equal'
        ) {
          return;
        }

        const calleeProperty = node.callee.property;

        context.report({
          node,
          message:
            'assert.equal is non-strict. Use assert.strictEqual or assert.deepEqual to compare objects',
          fix(fixer) {
            /**
             * Get the type of the second argument and try to match it to a assert type
             */
            const compareToType = node.arguments.at(1)?.type;
            if (
              // Match number or string
              compareToType === 'Literal' ||
              // Match `` string
              // @ts-expect-error
              compareToType === 'TemplateElement'
            ) {
              return fixer.replaceText(calleeProperty, 'strictEqual');
            }
            if (
              // Match any object `{...}`
              compareToType === 'ObjectExpression' ||
              // Match any array `[...]`
              compareToType === 'ArrayExpression'
            ) {
              return fixer.replaceText(calleeProperty, 'deepEqual');
            }

            return null;
          },
        });
      },
    };
  },
};
