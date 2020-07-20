import { terser } from 'rollup-plugin-terser';
import urlImport from 'rollup-plugin-url-import'

export default {
  input: 'src/es6.js',
  output: {
    dir: 'dist',
    format: 'es'
  },
  plugins: [
    urlImport(),
    terser(),
  ],
};
