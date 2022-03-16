import { ResolvePlugin } from 'webpack';
import { XeCSSCompilation, XeCSSCompiler, XeCSSPluginOptions } from './types';
import { XeCSSGenerator, XeCSSParser } from './xe-css';
// @ts-ignore
import path from 'path';
// @ts-ignore
import WebpackSources from 'webpack-sources';
// @ts-ignore
import VirtualModulesPlugin from 'webpack-virtual-modules';

const XeCSSLoader = path.resolve(__dirname, './loader/xe-css-loader');

/** @constructor */
class XeCSSPlugin {
  private readonly prefix: string;
  private readonly PluginName = 'XeCSSPlugin';
  private readonly outPutFileName = 'xe-css.css';
  private readonly __virtualModulePrefix = path.resolve(process.cwd(), '_virtual_');
  private readonly __vfsModules = new Set<string>();
  private readonly generator: XeCSSGenerator;
  private readonly parser: XeCSSParser;
  private _timer: any = null;
  private __vfs: any;
  rawCss = '';

  /**
   * @param options { { rules?:[RegExp,Function][],pseudos?:string[],prefix:string} }
   * */
  constructor(options: XeCSSPluginOptions) {
    this.prefix = options.prefix || 'xe';
    this.generator = new XeCSSGenerator(options.rules || [], this.prefix);
    this.parser = new XeCSSParser({ pseudos: options.pseudos, prefix: this.prefix });
    this.parser.loadCache().then(async () => {
      await this.load(true);
      this.updateModule();
    });
  }

  load(force = false) {
    return new Promise<string>(async resolve => {
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

  apply(compiler: XeCSSCompiler) {
    if (compiler.options.plugins) {
      let vfs = compiler.options.plugins.find(i => i instanceof VirtualModulesPlugin);
      if (!vfs) {
        vfs = new VirtualModulesPlugin();
        compiler.options.plugins.push(vfs);
      }
      this.__vfs = vfs;
    }

    const resolver: ResolvePlugin = {
      apply: (resolver: any) => {
        const target = resolver.ensureHook('resolve');

        resolver.getHook('resolve').tapAsync(this.PluginName, async (request: any, resolveContext: any, callback: () => void) => {
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
        });
      }
    };

    if (compiler.options.resolve?.plugins) {
      compiler.options.resolve.plugins = compiler.options.resolve.plugins || [];
      compiler.options.resolve.plugins.push(resolver);
    }


    compiler.$xecssContext = compiler.$xecssContext || {
      parser: this.parser,
      load: this.load.bind(this),
      updateModule: this.updateModule.bind(this)
    };
    if (compiler.options.module?.rules) {
      compiler.options.module.rules.push({
        test: /\.vue/,
        include: path.resolve('src'),
        loader: XeCSSLoader
      });
      compiler.options.module.rules.push({
        include: id => {
          return id != null && this.__vfsModules.has(id);
        },
        use: [
          {
            loader: XeCSSLoader,
            options: {
              _isVirtual_: true
            }
          }
        ]
      });
    }

    compiler.hooks.compilation.tap(this.PluginName, _compilation => {
      const compilation = _compilation as XeCSSCompilation;
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
              `<link type="text/css" rel="stylesheet" href="${ this.outPutFileName }" /></html>`
            );
          }
          cb(null, htmlPluginData);
        }
      );
    });
  }
}

export {
  XeCSSPlugin,
};
