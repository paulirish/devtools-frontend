// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

/**
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'check arguments when recording enumerated histograms',
      category: 'Possible Errors',
    },
    fixable: 'code',
    schema: [], // no options
  },
  create: function (context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'InspectorFrontendHostInstance' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'recordEnumeratedHistogram'
        ) {
          const argumentNode = node.arguments[2];

          if (
            argumentNode.type !== 'MemberExpression' ||
            argumentNode.property.type !== 'Identifier' ||
            argumentNode.property.name !== 'MAX_VALUE'
          ) {
            context.report({
              node,
              message:
                'When calling \'recordEnumeratedHistogram\' the third argument should be of the form \'SomeEnum.MAX_VALUE\'.',
            });
          }
        }
      },
    };
  },
};
