// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Thing
 * @author Paul Irish
 */
'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce optional properties to be defined after required properties',
      category: 'Possible Errors',
    },
    fixable: 'code',
    schema: [],
  },

  create: function (context) {
    return {
      TSTypeAliasDeclaration(node) {
        const typeAnnotation = node.typeAnnotation;
        if (typeAnnotation.type === 'TSTypeLiteral') {
          let foundOptionalWithinAnnotation = null;
          for (const property of typeAnnotation.members) {
            if (property.optional) {
              foundOptionalWithinAnnotation = property;
            } else if (foundOptionalWithinAnnotation && !property.optional) {
              const requiredProp = property;
              // Required property found after an optional one
              context.report({
                node: foundOptionalWithinAnnotation,
                message: 'Optional property \'{{name}}\' should be defined after required properties.',
                data: {name: foundOptionalWithinAnnotation.key.name},
                fix(fixer) {
                  const node = foundOptionalWithinAnnotation;
                  console.log({node});
                  console.log({mem: node.parent.members});
                  const sourceCode = context.getSourceCode();
                  console.log({x: Object.keys(sourceCode)});
                  // Gather required and optional properties
                  const requiredProperties = [];
                  const optionalProperties = [];
                  for (const property of node.parent.members) {
                    if (property.optional) {
                      optionalProperties.push(property);
                    } else {
                      requiredProperties.push(property);
                    }
                  }
                  console.log({optionalProperties});
                  if (requiredProperties.length > 0 && optionalProperties.length > 0) {
                    // Create text for rearranged properties
                    const requiredText = requiredProperties.map(node => sourceCode.getText(node)).join('\n');
                    const optionalText = optionalProperties.map(node => sourceCode.getText(node)).join('\n');
                    console.log({requiredText, optionalText});
                    // Replace the entire property block with the rearranged text
                    return fixer.replaceTextRange([node.parent.range[0] + 1, node.parent.range[1] - 1], `${requiredText}${optionalText}`);
                  }
                },
              });
            }
          }
        }
      },
    };
  },
};
