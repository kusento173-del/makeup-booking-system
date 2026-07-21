/** @type {import('lint-staged').Configuration} */
export default {
  '*.{cjs,css,js,json,md,mjs,ts,tsx,yaml,yml}': 'prettier --check',
  '*.{cjs,js,mjs,ts,tsx}': 'eslint --max-warnings=0',
};
