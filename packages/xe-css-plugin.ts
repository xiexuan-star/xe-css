import { ResolvePlugin } from 'webpack';
import { XeCSSCompilation, XeCSSCompiler, XeCSSPluginOptions } from './types';
import { XeCSSDefaultPseudos, XeCSSDefaultRules, XeCSSGenerator, XeCSSParser } from './xe-css';
// @ts-ignore
import path from 'path';
import fs from 'fs';
import os from 'os';
import findCacheDir from 'find-cache-dir';
import WebpackSources from 'webpack-sources';
import VirtualModulesPlugin from 'webpack-virtual-modules';
import glob from 'glob';

const XeCSSLoader = path.resolve(__dirname, './loader/xe-css-loader');
const CacheLoader = 'cache-loader';

const cacheSearchPath = 'node_modules/.cache/xe-css-loader/*.json';

async function getCache() {
  const fileList = await new Promise<string[]>((resolve, reject) => {
    glob(cacheSearchPath, {}, (err, matches) => {
      if (err) reject();
      resolve(matches);
    });
  });
  return Promise.all(fileList.map(file => {
    return new Promise<any[]>(resolve => {
      fs.readFile(file, 'utf-8', (err, result) => {
        if (err) resolve([]);
        try {
          const data = JSON.parse(result);
          resolve(Array.isArray(data) ? data : []);
        } catch (e: any) {
          resolve([]);
        }
      });
    });
  })).then(dataList => {
    return dataList.reduce((res, data) => {
      return res.concat(data);
    }, [] as any[]);
  });
}

async function setCache() {

}

/** @constructor */
class XeCSSPlugin {
  private readonly prefix: string;
  private readonly cacheId = findCacheDir({
    name: 'xe-css-loader'
  }) || os.tmpdir();
  private readonly PluginName = 'XeCSSPlugin';
  private readonly outPutFileName = `xe-css.${ (Math.random() * 10 ** 10).toFixed(0) }.css`;
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
    getCache().then(data => {
      this.parser.loadCache(data).then(async () => {
        await this.load(true);
        this.updateModule();
      });
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
          if (id.includes('xe-css.css') && !id.includes('_virtual_')) {
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
      load: this.load.bind(this),
    };
    if (compiler.options.module?.rules) {
      compiler.options.module.rules.push({
        test: /\.vue/,
        include: path.resolve('src'),
        use: [{
          loader: CacheLoader,
          options: {
            cacheDirectory: this.cacheId,
            read(id: string, callback: any) {
              fs.readFile(id, 'utf8', callback);
            },
            write: (key: string, data: any, callback: any) => {
              data = Buffer.from(data.result[0]).toString('utf-8');
              this.parser.run(data).then((fileCollection) => {
                this.parser.needPatch && this.updateModule();
                fs.mkdir(key.replace(/\/[^/]+\.json$/, ''), { recursive: true }, (err) => {
                  if (err) {
                    console.error(err);
                  }
                  const json = JSON.stringify(fileCollection);
                  if (!fileCollection.length) return callback(null, json);
                  fs.writeFile(key, json, 'utf-8', (err: any) => {
                    if (err) throw err;
                    callback(null, json);
                  });
                });
              });
            }
          }
        }]
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
  XeCSSDefaultPseudos,
  XeCSSDefaultRules,
};
