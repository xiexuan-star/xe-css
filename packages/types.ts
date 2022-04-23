import { SyncHook } from 'tapable';
import { Compiler, loader, compilation } from 'webpack';
import { XeCSSParser } from './xe-css';

export type XeCSSLoaderContext = {
  error(message: string): void
  warn(message: string): void
}

export type XeCSSCompiler = Compiler & { $xecssContext: XeCSSPluginExpose }

export type XeCSSCompilation =
  compilation.Compilation
  & { hooks: compilation.Compilation['hooks'] & { htmlWebpackPluginAfterHtmlProcessing: SyncHook } }

export type XeCSSPluginContext = loader.LoaderContext & { _compiler: XeCSSCompiler }

export type XeCSSPluginExpose = {
  load(): Promise<string>,
  // parser: XeCSSParser,
  // updateModule(): void
}

export type XeCSSRule = [RegExp, (tokens: string[]) => Record<string, string>]

export type XeCSSPluginOptions = Partial<{
  rules: XeCSSRule[],
  pseudos: string[],
  prefix: string
}>

export type XeCSSParserOptions = Pick<XeCSSPluginOptions, 'pseudos' | 'prefix'>
export type XeCSSGeneratorOptions = Pick<XeCSSPluginOptions, 'rules' | 'prefix'>


