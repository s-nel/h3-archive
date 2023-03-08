module.exports = function override(config, env) {
  config.resolve.extensions = [
    '.tsx', '.ts', '.js'
  ]
  return config;
}