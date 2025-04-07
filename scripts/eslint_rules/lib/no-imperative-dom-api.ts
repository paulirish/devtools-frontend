// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @fileoverview Rule to identify and templatize manually constructed DOM.
 */

import type {TSESTree} from '@typescript-eslint/utils';

import {adorner} from './no-imperative-dom-api/adorner.ts';
import {getEnclosingExpression, isIdentifier} from './no-imperative-dom-api/ast.ts';
import {ClassMember} from './no-imperative-dom-api/class-member.ts';
import {domApiDevtoolsExtensions} from './no-imperative-dom-api/dom-api-devtools-extensions.ts';
import {domApi} from './no-imperative-dom-api/dom-api.ts';
import {DomFragment} from './no-imperative-dom-api/dom-fragment.ts';
import {toolbar} from './no-imperative-dom-api/toolbar.ts';
import {widget} from './no-imperative-dom-api/widget.ts';
import {createRule} from './tsUtils.ts';
type CallExpression = TSESTree.CallExpression;
type Identifier = TSESTree.Identifier;
type MemberExpression = TSESTree.MemberExpression;
type NewExpression = TSESTree.NewExpression;
type Node = TSESTree.Node;
type Range = TSESTree.Range;

type Subrule = Partial<{
  getEvent(event: Node): string | null,
  propertyAssignment(property: Identifier, propertyValue: Node, domFragment: DomFragment): boolean,
  methodCall(property: Identifier, firstArg: Node, secondArg: Node, domFragment: DomFragment, call: CallExpression):
      boolean,
  propertyMethodCall(property: Identifier, method: Node, firstArg: Node, domFragment: DomFragment): boolean,
  subpropertyAssignment(
      property: Identifier, subproperty: Identifier, subpropertyValue: Node, domFragment: DomFragment): boolean,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  MemberExpression: (node: MemberExpression) => void,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NewExpression: (node: NewExpression) => void,
}>;

export default createRule({
  name: 'no-imperative-dom-api',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer template literals over imperative DOM API calls',
      category: 'Possible Errors',
    },
    messages: {
      preferTemplateLiterals: 'Prefer template literals over imperative DOM API calls',
    },
    fixable: 'code',
    schema: [],  // no options
  },
  defaultOptions: [],
  create: function(context) {
    const sourceCode = context.getSourceCode();

    const subrules: Subrule[] = [
      adorner.create(context),
      domApi.create(context),
      domApiDevtoolsExtensions.create(context),
      toolbar.create(context),
      widget.create(context),
    ];

    function getEvent(event: Node): string|null {
      for (const rule of subrules) {
        const result = 'getEvent' in rule ? rule.getEvent?.(event) : null;
        if (result) {
          return result;
        }
      }
      if (event.type === 'Literal') {
        return event.value?.toString() ?? null;
      }
      return null;
    }

    function processReference(reference: Node, domFragment: DomFragment): boolean {
      const parent = reference.parent;
      if (!parent) {
        return false;
      }
      const isAccessed = parent.type === 'MemberExpression' && parent.object === reference;
      if (!isAccessed) {
        return false;
      }
      const property = parent.property;
      if (property.type !== 'Identifier') {
        return false;
      }
      const grandParent = parent.parent;
      const isPropertyAssignment = grandParent.type === 'AssignmentExpression' && grandParent.left === parent;
      const propertyValue = isPropertyAssignment ? grandParent.right : null;
      const isMethodCall = grandParent.type === 'CallExpression' && grandParent.callee === parent;
      const grandGrandParent = grandParent.parent;
      const isPropertyMethodCall = grandParent.type === 'MemberExpression' && grandParent.object === parent &&
          grandGrandParent?.type === 'CallExpression' && grandGrandParent?.callee === grandParent &&
          grandParent.property.type === 'Identifier';
      const propertyMethodArgument = isPropertyMethodCall ? grandGrandParent.arguments[0] : null;
      const isSubpropertyAssignment = grandParent.type === 'MemberExpression' && grandParent.object === parent &&
          grandParent.property.type === 'Identifier' && grandGrandParent?.type === 'AssignmentExpression' &&
          grandGrandParent?.left === grandParent;
      const subproperty =
          isSubpropertyAssignment && grandParent.property.type === 'Identifier' ? grandParent.property : null;
      const subpropertyValue = isSubpropertyAssignment ? grandGrandParent.right : null;
      for (const rule of subrules) {
        if (isPropertyAssignment && propertyValue) {
          if ('propertyAssignment' in rule && rule.propertyAssignment?.(property, propertyValue, domFragment)) {
            return true;
          }
        } else if (isMethodCall) {
          const firstArg = grandParent.arguments[0];
          const secondArg = grandParent.arguments[1];
          if (isIdentifier(property, 'addEventListener')) {
            const event = getEvent(firstArg);
            const value = secondArg;
            if (event && value.type !== 'SpreadElement') {
              domFragment.eventListeners.push({key: event, value});
            }
            return true;
          }
          if ('methodCall' in rule && rule.methodCall?.(property, firstArg, secondArg, domFragment, grandParent)) {
            return true;
          }
        } else if (isPropertyMethodCall && propertyMethodArgument) {
          if ('propertyMethodCall' in rule &&
              rule.propertyMethodCall?.(property, grandParent.property, propertyMethodArgument, domFragment)) {
            return true;
          }
        } else if (isSubpropertyAssignment && subproperty && subpropertyValue) {
          if ('subpropertyAssignment' in rule &&
              rule.subpropertyAssignment?.(property, subproperty, subpropertyValue, domFragment)) {
            return true;
          }
        }
      }
      return false;
    }

    function getRangesToRemove(domFragment: DomFragment): Range[] {
      const ranges: Range[] = [];
      for (const reference of domFragment.references) {
        if (!reference.processed) {
          continue;
        }
        const range = getEnclosingExpression(reference.node)?.range;
        if (!range) {
          continue;
        }
        ranges.push(range);
        for (const child of domFragment.children) {
          ranges.push(...getRangesToRemove(child));
        }
      }

      if (domFragment.initializer && domFragment.references.every(r => r.processed)) {
        const range = getEnclosingExpression(domFragment.initializer)?.range;
        if (range) {
          ranges.push(range);
        }
      }
      for (const range of ranges) {
        while ([' ', '\n'].includes(sourceCode.text[range[0] - 1])) {
          range[0]--;
        }
      }
      ranges.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i][0] < ranges[i - 1][1]) {
          ranges[i] = [ranges[i - 1][1], Math.max(ranges[i][1], ranges[i - 1][1])];
        }
      }

      return ranges.filter(r => r[0] < r[1]);
    }

    function maybeReportDomFragment(domFragment: DomFragment): void {
      const replacementLocation = domFragment.replacementLocation?.parent?.type === 'ExportNamedDeclaration' ?
          domFragment.replacementLocation.parent :
          domFragment.replacementLocation;
      if (!replacementLocation || domFragment.parent || !domFragment.tagName ||
          domFragment.references.every(r => !r.processed)) {
        return;
      }
      context.report({
        node: replacementLocation,
        messageId: 'preferTemplateLiterals',
        fix(fixer) {
          const template = 'html`' + domFragment.toTemplateLiteral(sourceCode).join('') + '`';

          if (replacementLocation.type === 'VariableDeclarator' && replacementLocation.init) {
            domFragment.initializer = undefined;
            return [
              fixer.replaceText(replacementLocation.init, template),
              ...getRangesToRemove(domFragment).map(range => fixer.removeRange(range)),
            ];
          }

          const text = `
export const DEFAULT_VIEW = (input, _output, target) => {
  render(${template},
    target, {host: input});
};

`;
          return [
            fixer.insertTextBefore(replacementLocation, text),
            ...getRangesToRemove(domFragment).map(range => fixer.removeRange(range)),
          ];
        }
      });
    }

    return {
      MemberExpression(node: MemberExpression) {
        if (node.object.type === 'ThisExpression') {
          ClassMember.getOrCreate(node, sourceCode);
        }
        for (const rule of subrules) {
          if ('MemberExpression' in rule) {
            rule.MemberExpression?.(node);
          }
        }
      },
      NewExpression(node) {
        for (const rule of subrules) {
          if ('NewExpression' in rule) {
            rule.NewExpression?.(node);
          }
        }
      },
      'Program:exit'() {
        let processedSome = false;
        do {
          processedSome = false;
          for (const domFragment of DomFragment.values()) {
            if (!domFragment.tagName) {
              continue;
            }
            for (const reference of domFragment.references) {
              if (reference.processed) {
                continue;
              }
              if (processReference(reference.node, domFragment)) {
                reference.processed = true;
                processedSome = true;
              }
            }
          }
        } while (processedSome);

        for (const domFragment of DomFragment.values()) {
          maybeReportDomFragment(domFragment);
        }
        DomFragment.clear();
      }
    };
  }
});
