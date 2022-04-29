import {
  SimpleExpressionNode, ExpressionNode, CompoundExpressionNode, DirectiveNode, ElementNode, ForNode, IfBranchNode,
  IfNode, TemplateChildNode, AttributeNode
} from '@vue/compiler-core';
import { XeCSSParserOptions, XeCSSRule } from './types';
import { compileTemplate, SFCTemplateCompileOptions, SFCTemplateCompileResults } from '@vue/compiler-sfc';
// ------------------------------------ constant ---------------------------------
const MATCHER_TYPE = {
  COMMON: 1 << 1,
  PSEUDO: 1 << 2,
  VALUE_PSEUDO: 1 << 3,
  APPEND: 1 << 4,
  MULTIPLY: 1 << 5
};

// ------------------------------------ utils ---------------------------------
function transform(v: string) {
  return v.replace(/:/g, '\\:').replace(/\//g, '\\/');
}

/**
 * @param propNode {Node} - get value from a template node
 * @return { String }
 * */
function unpack(propNode: any): string {
  return (propNode.value && propNode.value.content) || '';
}

function traverseMap<K extends any, V extends any>(map: Map<K, V>, handler: (entry: [K, V]) => void) {
  if (!handler) return;
  const iterator = map.entries();
  while (true) {
    const current = iterator.next();
    if (current.done) break;
    handler(current.value);
  }
}

function mapToEntries<K extends any, V extends any>(map: Map<K, V>): [K, V][] {
  let result: [K, V][] = [];
  traverseMap(map, entry => {
    result.push(entry);
  });
  return result;
}

function isElementNode(node: TemplateChildNode): node is ElementNode {
  return node.type === 1;
}

function isIfNode(node: TemplateChildNode): node is IfNode {
  return node.type === 9;
}

function isIfBranchNode(node: TemplateChildNode): node is IfBranchNode {
  return node.type === 10;
}

function isForNode(node: TemplateChildNode): node is ForNode {
  return node.type === 11;
}

function isSimpleExp(node: ExpressionNode): node is SimpleExpressionNode {
  return node.type === 4;
}

function isCompoundExp(node: ExpressionNode): node is CompoundExpressionNode {
  return node.type === 8;
}

function isDirectiveNode(node: AttributeNode | DirectiveNode): node is DirectiveNode {
  return node.type === 7;
}

// ------------------------------------ constructor ---------------------------------
/** @constructor */
class XeCSSParser {
  needPatch = true;
  readonly collector = new Map<string, number>();
  readonly pseudos: string[] = [];
  readonly tasks = new Set<Promise<void>>();
  readonly prefix: string;
  private readonly pseudoMatcher: RegExp;
  private readonly commonMarcher: RegExp;
  private readonly appendMarcher: RegExp;
  private readonly templateMatcher = /<template>(.|\n)+<\/template>/;
  private readonly ternaryMatcher = /(.+)\s*\?\s*(['"].+['"])\s*:\s*(['"].+['"])/;

  /**
   * @param options { {pseudos:string[],prefix:string} }
   * */
  constructor(options: XeCSSParserOptions = {}) {
    const { pseudos, prefix } = options;
    this.prefix = prefix || 'xe';
    Array.isArray(pseudos) && (this.pseudos = pseudos);
    this.pseudoMatcher = new RegExp(`^(${this.pseudos.map(item => `${item}:`).join('|')})`);
    this.commonMarcher = new RegExp(`^${this.prefix}[:-]?`);
    this.appendMarcher = new RegExp(`${this.prefix}(.*):(.+)`);
  }

  loadCache(entries: [string, number][]) {
    return new Promise<void>(resolve => {
      entries.forEach(([key, value]) => {
        this.collector.set(key, value);
      });
      resolve();
    });
  }

  /**
   * @param property {String} - propertyName
   * @param value {String} - propertyValue
   * @param tag {MATCHER_TYPE} - a tag for judge property's type
   * @description before collect a xe-css property, it should be analyzed and assembled
   * */
  collect(property: string, value: string, tag: number) {
    const result = [];
    if (tag & MATCHER_TYPE.MULTIPLY) {
      value.split(' ').forEach(v => {
        const key = `${ property }=${ v }`;
        const value = v.match(this.pseudoMatcher)
          ? (tag | MATCHER_TYPE.VALUE_PSEUDO)
          : tag;
        this.collector.set(key, value);
        result.push([key, value]);
      });
    } else {
      const key = `${ property }=${ value }`;
      if (value.match(this.pseudoMatcher)) {
        tag |= MATCHER_TYPE.VALUE_PSEUDO;
      }
      const oldTag = this.collector.get(key) || 0;
      if (oldTag != null && oldTag !== tag) {
        this.needPatch = true;
      }
      const newTag = oldTag | tag;
      this.collector.set(key, newTag);
      result.push([key, newTag]);
    }
    return result;
  }

  /**
   * @description set tag from attr info, it can be used to judge the node type
   * */
  matchAttrType(attr: string) {
    let tag = 0;
    if (attr.match(this.commonMarcher)) {
      tag |= MATCHER_TYPE.COMMON;
    } else if (attr.match(this.pseudoMatcher)) {
      tag |= MATCHER_TYPE.PSEUDO;
    }
    return tag;
  }

  /**
   * @description set tag from attr info, it can be used to judge the node type
   * */
  matchNodeType(attr: string, value: string) {
    let tag = 0;
    if (attr.match(this.appendMarcher)) {
      tag |= MATCHER_TYPE.APPEND;
    }
    if (~value.indexOf(' ')) {
      tag |= MATCHER_TYPE.MULTIPLY;
    }
    return tag;
  }

  mergeBaseCompilerOptions(options: { source: string }): SFCTemplateCompileOptions {
    return Object.assign(options, { id: '', filename: '.index.vue' });
  }

  handlerCompileResult(compileResults: SFCTemplateCompileResults) {
    const { ast } = compileResults;
    if (!ast) return [] as any[];
    return this.handleAstChildren(ast.children);
  }

  handleAstChildren(nodeList: TemplateChildNode[]) {
    if (!nodeList) return [];
    const result: any[] = [];
    nodeList.forEach(node => {
      /*
       * ROOT = 0,
       * ELEMENT = 1,
       * TEXT = 2,
       * COMMENT = 3,
       * SIMPLE_EXPRESSION = 4,
       * INTERPOLATION = 5,
       * ATTRIBUTE = 6,
       * DIRECTIVE = 7,
       * COMPOUND_EXPRESSION = 8,
       * IF = 9,
       * IF_BRANCH = 10,
       * FOR = 11,
       * TEXT_CALL = 12,
       */
      if (isElementNode(node)) {
        if (node.tag === 'svg') return;
        result.push(...this.parseElementNode(node));
      } else if (isIfNode(node)) {
        result.push(...this.handleAstChildren(node.branches));
      } else if (isForNode(node) || isIfBranchNode(node)) {
        result.push(...this.handleAstChildren(node.children));
      }
    });
    return result;
  }

  parseDirectiveNode(node: DirectiveNode) {
    if (!node.arg || !node.exp || node.name !== 'bind') return [];
    if (isSimpleExp(node.arg) && isCompoundExp(node.exp)) {
      const attr = node.arg.content;
      let tag = this.matchAttrType(attr);
      if (!tag) return [];
      const ternaryMatched = node.exp.loc.source.match(this.ternaryMatcher);
      if (ternaryMatched) {
        const value = ternaryMatched.splice(2).join(' ').replace(/['"]/g, '');
        tag |= this.matchNodeType(attr, value);
        return this.collect(attr, value, tag);
      }
    }
    return [];
  }

  parseElementNode(node: ElementNode) {
    const result = [];
    if (node.props.length) {
      const needParsePropsMap = new Map();
      node.props.forEach(propNode => {
        if (isDirectiveNode(propNode)) {
          result.push(...this.parseDirectiveNode(propNode));
        } else {
          const tag = this.matchAttrType(propNode.name);
          tag && needParsePropsMap.set(propNode, tag);
        }
      });
      if (needParsePropsMap.size) {
        traverseMap(needParsePropsMap, ([propNode, tag]) => {
          const attr = propNode.name;
          const value = unpack(propNode);
          tag |= this.matchNodeType(attr, value);
          const res = this.collect(attr, value, tag);
          result.push(...res);
        });
      }
    }
    result.push(...this.handleAstChildren(node.children));
    return result;
  }

  run(source: string) {
    return new Promise<any[]>((resolve, reject) => {
      this.tasks.add(
        new Promise<void>(_resolve => {
          try {
            const len = this.collector.size;
            const matched = source.match(this.templateMatcher);
            if (!matched) return reject();
            const templateSource = compileTemplate(
              this.mergeBaseCompilerOptions({ source: matched[0] })
            );
            const result = this.handlerCompileResult(templateSource);
            if (len < this.collector.size) {
              this.needPatch = true;
            }
            resolve(result);
          } catch (e) {
            reject();
          } finally {
            _resolve();
          }
        })
      );
    });
  }

  get entries() {
    return mapToEntries(this.collector);
  }

  get empty() {
    return !this.collector.size;
  }
}

class XeCSSGenerator {
  private readonly rules: XeCSSRule[];
  private readonly prefix: string;

  constructor(rules: XeCSSRule[] = [], prefix?: string) {
    this.rules = rules;
    this.prefix = prefix || 'xe';
  }

  parse(entries: [string, number][]) {
    if (!Array.isArray(this.rules) || !this.rules.length) return '';
    try {
      return entries.reduce((res, entry) => {
        return res + this.normalize(entry);
      }, '');
    } catch (e) {
      console.log('error=>', e);
      return '';
    }
  }

  normalize([attrEntry, tag]: [string, number]) {
    let [attr, value] = attrEntry.split('=');
    let attrResult = attr.replace(new RegExp(`${this.prefix}-?`, 'g'), '');
    let valueResult = value;
    let pseudo = '';
    if (tag & MATCHER_TYPE.PSEUDO) {
      attrResult = attrResult.replace(/^([^:]+:)/, p => {
        pseudo = p.slice(0, -1);
        return '';
      });
    }
    if (tag & MATCHER_TYPE.VALUE_PSEUDO) {
      valueResult = valueResult.replace(/^([^:]+:)/, p => {
        pseudo = p.slice(0, -1);
        return '';
      });
    }
    if (tag & MATCHER_TYPE.APPEND) {
      attrResult = attrResult.replace(/(:[^:]+)$/, a => {
        valueResult += `-${ a.slice(1) }`;
        return '';
      });
    }
    const token = `${ attrResult }${ attrResult && valueResult ? '-' : '' }${ valueResult }`;
    let result = '';
    this.rules.some(([reg, handler]) => {
      const matches = token.match(reg);
      if (!matches) return;
      const styles = handler?.(matches.slice(1));
      if (styles && typeof styles === 'object') {
        const split = tag & MATCHER_TYPE.MULTIPLY ? '~=' : '=';
        const propertySelector = attr + (value ? split + `"${ value }"` : '');
        const classContent = Object.entries(styles).reduce((res, [p, v]) => {
          return res + `${ p }:${ v }!important;`;
        }, '');
        return (result = classContent
          ? `[${ transform(propertySelector) }]${ pseudo ? ':' + pseudo : '' } { ${ classContent } } `
          : result);
      }
    });
    return result;
  }
}

export { MATCHER_TYPE, XeCSSGenerator, XeCSSParser };
