import { XeCSSLoaderContext, XeCSSPluginContext } from '../types';

function XeCSSLoader(this: XeCSSPluginContext, source: string = '') {
  const { _isVirtual_ } = this.query;
  if (_isVirtual_) {
    this.cacheable(false);
    const callback = this.async();
    const plugin = this._compiler?.$xecssContext;
    if (plugin) {
      plugin.load().then(
        code => {
          callback!(null, code as string);
        },
        (err: Error) => {
          callback!(err as Error);
        }
      );
    } else {
      callback!(null, source as string);
    }
  } else {
    const context: XeCSSLoaderContext = {
      error: error => this.emitError(typeof error === 'string' ? new Error(error) : error),
      warn: error => this.emitWarning(typeof error === 'string' ? new Error(error) : error)
    };
    const { parser, updateModule } = this._compiler?.$xecssContext ?? {};
    if (parser) {
      parser.run(source, context).then(() => {
        parser.needPatch && updateModule();
      });
    }
    return source;
  }
}

module.exports = XeCSSLoader;
