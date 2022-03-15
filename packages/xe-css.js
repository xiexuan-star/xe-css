const { compileTemplate } = require('@vue/compiler-sfc');
const path = require('path');
const fs = require('fs');
// ------------------------------------ constant ---------------------------------
const MATCHER_TYPE = {
  COMMON: 1 << 1,
  PSEUDO: 1 << 2,
  VALUE_PSEUDO: 1 << 3,
  APPEND: 1 << 4,
  MULTIPLY: 1 << 5
};

// ------------------------------------ utils ---------------------------------
function transform(v) {
  return v.replace(/:/g, '\\:').replace(/\//g, '\\/');
}

/**
 * @param propNode {Node} - get value from a template node
 * @return { String }
 * */
function unpack(propNode) {
  return (propNode.value && propNode.value.content) || '';
}

/**
 * @param map {Map<K,V>}
 * @param handler {([K,V])=>void} - handler function to each map's entries
 * */
function traverseMap(map, handler) {
  if (!handler) return;
  const iterator = map.entries();
  while (true) {
    const current = iterator.next();
    if (current.done) break;
    handler(current.value);
  }
}

/**
 * @param map { Map<K,V>}
 * @return {[K,V][]}
 * */
function mapToEntries(map) {
  let result = [];
  traverseMap(map, entry => {
    result.push(entry);
  });
  return result;
}

// ------------------------------------ constructor ---------------------------------
/** @constructor */
class XeCssParser {
  needPatch = true;
  collector = new Map();
  pseudos = [];
  tasks = new Set();

  /**
   * @param options { {pseudos:string[],prefix:string} }
   * */
  constructor(options = {}) {
    const { pseudos, prefix } = options;
    this.prefix = prefix || 'xe';
    Array.isArray(pseudos) && (this.pseudos = pseudos);
    this.pseudoMatcher = new RegExp(`^${this.pseudos.map(item => `${item}:`).join('|')}`);
    this.templateMatcher = /<template>(.|\n)+<\/template>/;
    this.commonMarcher = new RegExp(`^${this.prefix}[:-]?`);
    this.appendMarcher = new RegExp(`${this.prefix}(.*):(.+)`);
    this.cachePath = path.resolve(__dirname, `xe-css.json`);
  }

  emitCache() {
    const data = mapToEntries(this.collector);
    fs.writeFile(this.cachePath, JSON.stringify(data), err => {
      err && console.log(err);
    });
  }

  loadCache() {
    return new Promise((resolve, reject) => {
      fs.readFile(this.cachePath, (err, content) => {
        err ? reject() : resolve(content.toString('utf8'));
      });
    }).then(
      content => {
        try {
          JSON.parse(content).forEach(entry => {
            this.collector.set(...entry);
          });
        } catch (e) {
          console.log(e);
        }
      },
      () => {
        fs.writeFile(this.cachePath, JSON.stringify([]), err => {
          err & console.log(err);
        });
      }
    );
  }

  /**
   * @param property {String} - propertyName
   * @param value {String} - propertyValue
   * @param tag {MATCHER_TYPE} - a tag for judge property's type
   * @description before collect a xe-css property, it should be analyzed and assembled
   * */
  collect(property, value, tag) {
    if (tag & MATCHER_TYPE.MULTIPLY) {
      value.split(' ').forEach(v => {
        this.collector.set(`${property}=${v}`, tag);
      });
    } else {
      const key = `${property}=${value}`;
      const oldTag = this.collector.get(key);
      if (oldTag != null && oldTag !== tag) {
        this.needPatch = true;
      }
      this.collector.set(key, tag | oldTag);
    }
  }

  /**
   * @description set tag from attr info, it can be used to judge the node type
   * */
  matchAttrType(attr) {
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
  matchNodeType(attr, value) {
    let tag = 0;
    if (attr.match(this.appendMarcher)) {
      tag |= MATCHER_TYPE.APPEND;
    }
    if (value.match(this.pseudoMatcher)) {
      tag |= MATCHER_TYPE.VALUE_PSEUDO;
    }
    if (~value.indexOf(' ')) {
      tag |= MATCHER_TYPE.MULTIPLY;
    }
    return tag;
  }

  mergeBaseCompilerOptions(options) {
    return Object.assign(options, { id: '', filename: '.index.vue' });
  }

  handlerCompileResult(compileResults) {
    const { ast } = compileResults;
    if (!ast) return;
    this.handleAstChildren(ast.children);
  }

  handleAstChildren(nodeList) {
    if (!nodeList) return;
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
      if (node.type === 1) {
        this.parseElementNode(node);
      } else if (node.type === 9) {
        this.handleAstChildren(node.branches);
      } else if (node.type === 11 || node.type === 10) {
        this.handleAstChildren(node.children);
      }
    });
  }

  parseElementNode(node) {
    if (node.props.length) {
      const needParsePropsMap = new Map();
      node.props.forEach(propNode => {
        const tag = this.matchAttrType(propNode.name);
        tag && needParsePropsMap.set(propNode, tag);
      });
      if (needParsePropsMap.size) {
        traverseMap(needParsePropsMap, ([propNode, tag]) => {
          const attr = propNode.name;
          const value = unpack(propNode);
          tag |= this.matchNodeType(attr, value);
          this.collect(attr, value, tag);
        });
      }
    }
    this.handleAstChildren(node.children);
  }

  run(source, loaderContext) {
    return new Promise((resolve, reject) => {
      this.tasks.add(
        new Promise(_resolve => {
          try {
            const len = this.collector.size;
            const matched = source.match(this.templateMatcher);
            if (!matched) return reject();
            const templateSource = compileTemplate(
              this.mergeBaseCompilerOptions({ source: matched[0] })
            );
            this.handlerCompileResult(templateSource);
            if (len < this.collector.size) {
              this.needPatch = true;
            }
            resolve();
          } catch (e) {
            reject();
            loaderContext.error(e);
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

class XeCssGenerator {
  constructor(rules = [], prefix) {
    this.rules = rules;
    this.prefix = prefix || 'xe';
  }

  parse(entries) {
    if (!Array.isArray(this.rules) || !this.rules.length) return '';
    try {
      return entries.reduce((res, entry) => {
        return res + this.normalize(entry);
      }, '');
    } catch (e) {
      console.log('error=>', e);
    }
  }

  normalize([attrEntry, tag]) {
    let [attr, value] = attrEntry.split('=');
    let attrResult = attr.replace(new RegExp(`${this.prefix}-?`,'g'), '');
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
        valueResult += `-${a.slice(1)}`;
        return '';
      });
    }
    const tokens = `${attrResult}${attrResult && valueResult ? '-' : ''}${valueResult}`;
    let result = '';
    this.rules.some(([reg, handler]) => {
      const matches = tokens.match(reg);
      if (!matches) return;
      const styles = handler?.(matches.slice(1));
      if (styles && typeof styles === 'object') {
        const split = tag & MATCHER_TYPE.MULTIPLY ? '~=' : '=';
        const propertySelector = attr + (value ? split + `"${value}"` : '');
        const classContent = Object.entries(styles).reduce((res, [p, v]) => {
          return res + `${p}:${v}!important;`;
        }, '');
        return (result = classContent
          ? `[${transform(propertySelector)}]${pseudo ? ':' + pseudo : ''} { ${classContent} } `
          : result);
      }
    });
    return result;
  }
}

// ------------------------------------ rules ---------------------------------
function getDistance(d) {
  const isPercent = d.match(/-?\d+%/);
  return isPercent ? d : `${d}px`;
}

const DIRECTION_MAP = {
  l: 'left',
  r: 'right',
  b: 'bottom',
  t: 'top'
};

const DISPLAY_MAP = {
  ib: 'inline-block',
  b: 'block',
  flex: 'flex',
  iflex: 'inline-flex',
  i: 'inline',
  none: 'none'
};

const ALIGN_MAP = {
  l: 'left',
  r: 'right',
  c: 'center'
};

const BORDER_TYPE = {
  w: 'width',
  c: 'color',
  s: 'style',
  r: 'radius'
};

const FLEX_MAP = {
  TYPE: {
    ai: 'align-items',
    jc: 'justify-content',
    d: 'flex-direction',
    wrap: 'flex-wrap'
  },
  VALUE: {
    start: 'flex-start',
    end: 'flex-end',
    around: 'space-around',
    between: 'space-between'
  }
};

const COLOR_MAP = {
  primary: '#0084ff',
  danger: '#f9463f',
  warning: '#fa8c16',
  info: '#abb2c2',
  success: '#24b47e',

  red: '#ff3333',
  purple: '#ff33a9',
  orange: '#ff8833',
  blue: '#3377ff',
  deep: '#2c96ff',
  weak: '#b9fdfb',
  gray: '#8c939d',
  white: '#ffffff',
  black: '#000000'
};

function parseColorHex2Rgb(color) {
  // 这里取了个默认值, 如果没匹配上就取primary
  color = color.match(/^#[0-9a-f]{6}/) ? color : COLOR_MAP.primary;
  const list = color.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/) || [];
  return list.slice(1).map(c => parseInt(`0x${c}`));
}

function parseColor(color) {
  if (COLOR_MAP[color]) {
    return COLOR_MAP[color];
  }
  if (color.match(/^[a-zA-Z]+$/)) {
    return color;
  }
  if (color.match(/^[0-9a-f]{3}$/) || color.match(/^[0-9a-f]{6}$/)) {
    return `#${color}`;
  }
  return COLOR_MAP.primary;
}

function getColorValue(color, deep, opacity) {
  let resultColor = parseColor(color);
  let resultOpacity = '1';
  if (resultColor.match(/^#[0-9a-f]{6}/)) {
    resultColor = parseColorHex2Rgb(resultColor);
    deep &&
    (resultColor = resultColor.map(
      c => ~~(c + (255 - c) * ((100 - Math.min(100, +deep)) / 100))
    ));
    opacity && (resultOpacity = Math.min(100, +opacity) / 100);
  }
  return resultColor ? `rgba(${resultColor.join(',')},${resultOpacity})` : '';
}

/**
 * @description 允许匹配的伪类, 会以 selector:hover { ... } 的形式被使用
 * */
const XeCSSDefaultPseudos = ['focus', 'hover'];

/**
 * @prefix 默认为xe,可自行调整
 * @description xe-css 的匹配规则, 每一项都是一个二元数组,接收一个正则和一个处理函数,函数参数为正则表达式中的[$1,$2...]
 * @return 函数返回值是一个CSSProperties对象,需要注意的是 margin-top就得写成margin-top,不能是marginTop
 * @example
 *        希望匹配xe-m-10的属性,正则只需匹配m-10即可
 *        匹配了m-10后, 所有的能得到xe-m-10的结果都可以被匹配,
 *        且hover focus 等等伪类无需考虑会自动添加
 *        如
 *          xe-m-10
 *          xe='m-10'
 *          xe:10='m'
 *          xe-m='10'
 *          hover:xe-m-10
 *          focus:xe-m='10'
 *          hover:xe:10='m'
 *          xe:10='hover:m'
 *        同时, 在命名空间中也会被匹配 如 xe:10='m p' 这时m-10的规则也是生效的
 * 注意事项:
 *    匹配是从上到下进行的,规则不要有重复匹配的情况,正则尽量添加^符号
 *    如果是纯属性的写法,就没办法写 xe-m-10% 百分号不能作属性, 但可以xe='m-10%'
 *    函数至少得返回一个空对象,不然报错,因为既然匹配上了正则那说明值是正确的
 * */
const XeCSSDefaultRules = [
  // 匹配所有的margin与padding  如  xe-mtbl-10  即代表 上下左方向的margin 为10px, 同时xe-m--10表示 所有方向的margin为-10px 支持百分号与负数
  [
    /^([mp])([tblr]{0,4})-(-?\d+%?)$/,
    ([type, direction, value]) => {
      type = type === 'm' ? 'margin' : 'padding';
      if (!direction) {
        return { [type]: getDistance(value) };
      } else {
        const result = {};
        Array.from(direction).forEach(d => {
          result[`${type}-${DIRECTION_MAP[d]}`] = getDistance(value);
        });
        return result;
      }
    }
  ],
  // 匹配所有的height和width, 如 xe-w-100 表示100px的width 支持百分号 mw是最大宽 miw是最小宽 高度同理
  [
    /^(m|mi)?([wh])-(\d+%?)$/,
    ([prepend, type, value]) => {
      return {
        [(prepend === 'm' ? 'max-' : prepend === 'mi' ? 'min-' : '') +
        (type === 'h' ? 'height' : 'width')]: getDistance(value)
      };
    }
  ],
  // 匹配fontsize xe-fs-14
  [
    /^fs-(\d+)$/,
    ([value]) => {
      return { 'font-size': `${value}px` };
    }
  ],
  // 匹配大部分常用的display, 如 xe-dp-b 表示display:block 缩写具体看 DISPLAY_MAP
  [
    /^dp-([a-z]+)$/,
    ([type]) => {
      const display = DISPLAY_MAP[type] || type;
      return display ? { display } : {};
    }
  ],
  // 匹配背景色和字体颜色 fc-primary-80/40 表示字体颜色是primary,80的深度和40的透明度
  // 支持的色值有 一些常见的单词, 以及6位16进制数的 HEX色值
  [
    /^(fc|bg)-([\da-z]+)-?(\d*)\/?(\d*)$/,
    ([type, color, deep, opacity]) => {
      type = type === 'fc' ? 'color' : 'background-color';
      const value = getColorValue(color, deep, opacity);
      return value ? { [type]: value } : {};
    }
  ],
  // 匹配所有visible,没有缩写直接写值吧
  [
    /^v-([a-z]+)$/,
    ([visible]) => {
      return { visible };
    }
  ],
  // 匹配text-align,
  [
    /^align-[lrc]$/,
    ([value]) => {
      return { 'text-align': ALIGN_MAP[value] };
    }
  ],
  // 匹配弹性布局flex系列, xe-flex='~' 表示display:flex这点特殊
  // 用于 xe-flex='~ jc-center' 这种情况
  [
    /^flex-?(~|jc|ai|d|wrap|center|[0-9])?-?([a-z-]*)$/,
    ([type, value]) => {
      if (type === '~' || !type) return { display: 'flex' };
      if (parseInt(type)) {
        return { flex: type };
      }
      if (type === 'center') {
        return { display: 'flex', 'justify-content': 'center', 'align-items': 'center' };
      }
      return { [FLEX_MAP.TYPE[type]]: FLEX_MAP.VALUE[value] || value };
    }
  ],
  // 匹配overflow,没什么好说的
  [
    /^of-([a-z]+)$/,
    ([overflow]) => {
      return { overflow };
    }
  ],
  // 匹配position, 也没什么说的
  [
    /^pos-([a-z]+)$/,
    ([position]) => {
      return { position };
    }
  ],
  // 位置 l-4 => left:4px 同样支持负数和百分比
  [
    /^([lrtb])-(-?\d+%?)$/,
    ([type, value]) => {
      return { [DISPLAY_MAP[type]]: getDistance(value) };
    }
  ],
  // 匹配border, 4个type w/c/s/r width/color/style/radius
  // 如  xe-bor-rlr-4 表示 border-left/right-radius: 4px
  [
    /^bor-([wcsr]+)([ltrb]*)-([a-z\d]+)$/,
    ([type, direction, value]) => {
      value = ['w', 'r'].includes(type) ? `${value}px` : value;
      if (!direction) {
        return { [`border-${BORDER_TYPE[type]}`]: value };
      }
      return Array.from(direction).reduce((result, d) => {
        result[`border-${DISPLAY_MAP[d]}-${type}`] = value;
        return result;
      }, {});
    }
  ],
  // 匹配cursor
  [
    /^cursor-([a-z]+)$/,
    ([cursor]) => {
      return { cursor };
    }
  ]
];

module.exports = { MATCHER_TYPE, XeCssParser, XeCssGenerator, XeCSSDefaultRules, XeCSSDefaultPseudos };