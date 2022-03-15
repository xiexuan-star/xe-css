const WebpackSources = require('webpack-sources');
const VirtualModulesPlugin = require('webpack-virtual-modules');
const { XeCssParser, XeCssGenerator } = require('./xe-css.js');
const XeCssLoader = require.resolve('./xe-css-loader.js');
const path = require('path');

/** @constructor */
class XeCssPlugin {
  PluginName = 'XeCSSPlugin';
  outPutFileName = 'xe-css.css';
  rawCss = '';
  _timer = null;
  __virtualModulePrefix = path.resolve(process.cwd(), '_virtual_');
  __vfsModules = new Set();
  __vfs;

  /**
   * @param options { { rules?:[RegExp,Function][],pseudos?:string[],prefix:string} }
   * */
  constructor(options) {
    this.prefix = options.prefix || 'xe';
    this.generator = new XeCssGenerator(options.rules || [], this.prefix);
    this.parser = new XeCssParser({ pseudos: options.pseudos, prefix: this.prefix });
    this.parser.loadCache().then(async () => {
      await this.load(true);
      this.updateModule();
    });
  }

  load(force = false) {
    return new Promise(async resolve => {
      try {
        await Promise.all(this.parser.tasks);
        if (this.parser.needPatch || force) {
          this.parser.needPatch = false;
          const entries = this.parser.entries;
          this.rawCss = this.generator.parse(entries);
        }
      } finally {
        this.parser.tasks.clear();
        resolve(this.rawCss);
      }
    });
  }

  updateModule() {
    clearTimeout(this._timer);
    this._timer = setTimeout(async () => {
      await this.load();
      Array.from(this.__vfsModules).forEach(id => {
        this.__vfs.writeModule(id, this.rawCss);
      });
    });
  }

  apply(compiler) {
    let vfs = compiler.options.plugins.find(i => i instanceof VirtualModulesPlugin);
    if (!vfs) {
      vfs = new VirtualModulesPlugin();
      compiler.options.plugins.push(vfs);
    }
    this.__vfs = vfs;

    const resolver = {
      apply: resolver => {
        const target = resolver.ensureHook('resolve');
        const tap = () => async (request, resolveContext, callback) => {
          if (!request.request) {
            return callback();
          }
          let id = request.request;
          if (id.includes(this.__virtualModulePrefix)) {
            return callback();
          }
          if (id.includes(this.outPutFileName) && !id.includes('_virtual_')) {
            id = this.__virtualModulePrefix + id;
            this.__vfs.writeModule(id, '');
            this.__vfsModules.add(id);
            const newRequest = { ...request, request: id };
            resolver.doResolve(target, newRequest, null, resolveContext, callback);
          } else {
            callback();
          }
        };

        resolver.getHook('resolve').tapAsync(this.PluginName, tap());
      }
    };

    compiler.options.resolve.plugins = compiler.options.resolve.plugins || [];
    compiler.options.resolve.plugins.push(resolver);

    compiler.$xecssContext = compiler.$xecssContext || {
      parser: this.parser,
      load: this.load.bind(this),
      updateModule: this.updateModule.bind(this)
    };
    compiler.options.module.rules.push({
      test: /\.vue/,
      include: path.resolve('src'),
      loader: XeCssLoader
    });
    compiler.options.module.rules.push({
      include: id => {
        return id != null && this.__vfsModules.has(id);
      },
      use: [
        {
          loader: XeCssLoader,
          options: {
            _isVirtual_: true
          }
        }
      ]
    });

    compiler.hooks.compilation.tap(this.PluginName, compilation => {
      compilation.hooks.optimizeAssets.tapPromise(this.PluginName, async () => {
        await this.load();
        this.parser.emitCache();
        compilation.assets[this.outPutFileName] = new WebpackSources.RawSource(this.rawCss);
      });
      compilation.hooks.htmlWebpackPluginAfterHtmlProcessing.tapAsync(
        this.PluginName,
        (htmlPluginData, cb) => {
          if (process.env.NODE_ENV === 'production') {
            htmlPluginData.html = htmlPluginData.html.replace(
              '</html>',
              `<link type="text/css" rel="stylesheet" href="${this.outPutFileName}" /></html>`
            );
          }
          cb(null, htmlPluginData);
        }
      );
    });
  }
}

module.exports = XeCssPlugin;
