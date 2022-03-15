function XeCssLoader(source) {
  const { _isVirtual_ } = this.query;
  if (_isVirtual_) {
    this.cacheable(false);
    const callback = this.async();
    const plugin = this._compiler?.$xecssContext;
    if (plugin) {
      plugin.load().then(
        code => {
          callback(null, code);
        },
        err => {
          callback(err);
        }
      );
    } else {
      callback(null, source);
    }
  } else {
    const context = {
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

module.exports = XeCssLoader;
