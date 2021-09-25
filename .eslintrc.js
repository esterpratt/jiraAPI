module.exports = {
  extends: [
    'prettier',
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'prettier/prettier': ['error', { singleQuote: true, printWidth: 120, trailingComma: 'es5' }],
  },
  plugins: [
    'eslint-plugin-prettier',
  ],
};
