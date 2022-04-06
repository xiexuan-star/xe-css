import { XeCSSLoaderContext, XeCSSPluginContext } from '../types';

function XeCSSLoader(this: XeCSSPluginContext, source = '') {
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
    return source;
  }
}

module.exports = XeCSSLoader;
