const path = require('node:path')

module.exports = {
    target: 'electron-renderer',
    entry: './src/index.ts',
    devtool: 'source-map',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        library: { type: 'commonjs2' },
        clean: true,
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader' },
            { test: /\.(css|html|sh)$/, type: 'asset/source' },
        ],
    },
    externals: [/^@angular\//, /^rxjs(?:\/|$)/, /^tabby-/, /^@ng-bootstrap\//],
    optimization: { minimize: false },
}
