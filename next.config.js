const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias['fit-file-parser-binary'] = path.join(
      __dirname,
      'node_modules',
      'fit-file-parser',
      'dist',
      'binary.js'
    );
    return config;
  },
};

module.exports = nextConfig;
