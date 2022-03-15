const glob = require('glob');
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  name: 'ZxCSS',
  entry: glob.sync('./packages/*.js'),
  mode: "production",
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: "bundle.js",
    library: "lib",
    libraryTarget: "umd",
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
  ]
};
