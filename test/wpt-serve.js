import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  let filePath = resolve(ROOT, '.' + url.pathname)

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const content = await readFile(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    res.end(content)
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404)
      res.end('Not Found: ' + url.pathname)
    } else {
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  }
})

const PORT = parseInt(process.env.PORT || '3456', 10)
server.listen(PORT, () => {
  console.log(`WPT test server listening on http://localhost:${PORT}`)
})
