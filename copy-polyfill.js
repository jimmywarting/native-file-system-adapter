import { copyFileSync } from "fs"

copyFileSync('./node_modules/web-streams-polyfill/dist/ponyfill.es2018.mjs', 'lib/web-streams-ponyfill.js')
copyFileSync('./node_modules/web-streams-polyfill/dist/types/polyfill.d.ts', 'lib/web-streams-ponyfill.d.ts')
