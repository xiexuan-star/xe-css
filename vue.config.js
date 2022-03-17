'use strict';
const { XeCSSPlugin, XeCSSDefaultRules, XeCSSDefaultPseudos } = require('./dist/xe-css-plugin');

const path = require('path');

function resolve(dir) {
  return path.join(__dirname, dir);
}

const config = {
  publicPath: '/',
  outputDir: 'dist',
  assetsDir: 'assets',
  productionSourceMap: false,
  lintOnSave: process.env.VUE_APP_BASE_API !== 'production',
  devServer: {
    port: 8080,
    open: false,
    overlay: {
      warnings: false,
      errors: true
    }
  },

  configureWebpack: {
    name: 'XeCSS',
    resolve: {
      alias: {
        '@': resolve('src'),
        views: resolve('src/views')
      }
    },
    module: {
      unknownContextCritical: false,
      rules: [
        {
          resourceQuery: /blockType=cx-name/,
          loader: require.resolve('./name-loader.js')
        },
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: 'javascript/auto'
        }
      ]
    },
    plugins: [
      require('unplugin-auto-import/webpack')({
        dts: './src/auto-import.d.ts',
        include: [
          /\.[tj]sx?$/, // .ts, .tsx, .js, .jsx
          /\.vue$/, /\.vue\?vue/ // .vue
        ],
        imports: ['vue']
      }),
      new XeCSSPlugin({
        rules: XeCSSDefaultRules,
        pseudos: XeCSSDefaultPseudos,
      })
    ]
  },
};

module.exports = config;
