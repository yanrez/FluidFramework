const spawn = require("child_process").spawn;
const path = require("path");
const merge = require("webpack-merge");
const CleanWebpackPlugin = require("clean-webpack-plugin");

module.exports = env => {
    const isProduction = env === "production";
    const tsconfig = isProduction
        ? "tsconfig.prod.json"
        : "tsconfig.dev.json";
    const styleLocalIdentName = isProduction
        ? "[hash:base64:5]"
        : "[folder]-[local]-[hash:base64:5]";

    return merge({
        entry: { main: "./src/index.ts" },
        resolve: { extensions: [".ts", ".tsx", ".js"] },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    exclude: /node_modules/,
                    enforce: "pre"
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: { 
                        configFile: tsconfig,
                        // ts-loader v4.4.2 resolves the 'declarationDir' for .d.ts files relative to 'outDir'.
                        // This is different than 'tsc', which resolves 'declarationDir' relative to the location
                        // of the tsconfig. 
                        compilerOptions: {
                            declarationDir: ".",
                        }
                    },
                },
                {
                    test: /\.css$/,
                    use: [
                        "style-loader", {
                            loader: "typings-for-css-modules-loader",
                            options: {
                                modules: true,
                                namedExport: true,
                                localIdentName: styleLocalIdentName
                            }
                        }
                    ],
                    exclude: /node_modules/
                }
            ]
        },
        plugins: [
            new CleanWebpackPlugin(["dist"]),
            {
                apply: (compiler) => {
                    compiler.hooks.afterEmit.tapPromise("PublishChaincodePlugin",
                        (compilation) => {
                            if (compilation.errors.length > 0) {
                                console.warn(`Skipping @chaincode publication due to compilation errors.`);
                                //console.warn(`${JSON.stringify(compilation.errors)}`);
                                return Promise.resolve();
                            }
                            
                            return new Promise(resolve => {
                                const proc = spawn("npm", ["run", "publish-patch-local"],
                                    { stdio: [process.stdin, process.stdout, process.stderr] });
                                proc.on('close', resolve);
                            });
                        }
                    );
                }
            }
        ],
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939            
            devtoolNamespace: "flow/editor",
            libraryTarget: "umd"
        },
        node: {
            fs: "empty",
            dgram: "empty",
            net: "empty",
            tls: "empty"
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
