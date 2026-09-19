const { createSharedBlocks } = require('../eslint-rules/base-config.cjs');

module.exports = [{ ignores: ['.astro/**'] }, ...createSharedBlocks(__dirname)];
