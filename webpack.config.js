const glob = require('glob');
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  name: 'XeCSS',
  entry: glob.sync('./packages/*.js'),
  mode: "production",
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: "index.js",
    libraryTarget: "commonjs",
  },
  module: {
    rules: [
      {
        test: /.js$/,
        include: path.resolve(__dirname, 'packages'),
        loader: 'babel-loader'
      }
    ]
  },
  externals: [nodeExternals()],
  resolve: {
    modules: ['node_modules']
  },
  node: {
    fs: "empty"
  },
  plugins: [
    new CleanWebpackPlugin({})
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        loader: {
          name: 'chunk-loader',
          test: /[\\/]packages[\\/]loader[\\/]xe-css-loader\.js$/,
          chunks: 'async'
        },
        plugin: {
          name: 'chunk-plugin',
          test: /[\\/]packages[\\/]xe-css-plugin\.js$/,
          chunks: 'initial'
        },
        config: {
          name: 'chunk-config',
          test: /[\\/]packages[\\/]xe-css\.js$/,
          chunks: 'async'
        }
      }
    }
  }
};
