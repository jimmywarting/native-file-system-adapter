import { terser } from 'rollup-plugin-terser'
import multiInput from 'rollup-plugin-multi-input'

// import urlImport from 'rollup-plugin-url-import'

export default {
  input: ['src/**/*.js'],
  output: {
    dir: 'dist',
    format: 'es'
  },
  plugins: [
    // urlImport(),
    terser(),
    multiInput()
  ]
}
