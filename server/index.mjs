import 'dotenv/config'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = resolve(root, 'dist')
const production = process.argv.includes('--production')
const port = Number(process.env.PORT) || 5173
const endpoints = {
  routes: '/1613000/BusRouteInfoInqireService/getRouteNoList',
  info: '/1613000/BusRouteInfoInqireService/getRouteInfoIem',
  stops: '/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList',
  positions: '/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList',
}
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function handleApi(req, res, url) {
  const operation = url.pathname.slice('/api/'.length)
  if (!(operation in endpoints) || req.method !== 'GET') {
    sendJson(res, 404, { message: '요청한 API를 찾을 수 없습니다.' })
    return
  }
  const cityCode = url.searchParams.get('cityCode')
  const routeNo = url.searchParams.get('routeNo')?.trim()
  const routeId = url.searchParams.get('routeId')?.trim()
  if (!['34040', '34010'].includes(cityCode) ||
      (operation === 'routes' && (!routeNo || routeNo.length > 30)) ||
      (operation !== 'routes' && (!routeId || !/^[\w-]{1,80}$/.test(routeId)))) {
    sendJson(res, 400, { message: '도시 또는 노선 정보가 올바르지 않습니다.' })
    return
  }
  const serviceKey = process.env.SERVICE_KEY?.trim()
  if (!serviceKey) {
    sendJson(res, 503, { message: '서버에 SERVICE_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.' })
    return
  }
  const pageNo = Math.max(1, Math.min(1000, Number(url.searchParams.get('pageNo')) || 1))
  const numOfRows = Math.max(1, Math.min(1000, Number(url.searchParams.get('numOfRows')) || 100))
  const upstream = new URL(endpoints[operation], 'https://apis.data.go.kr')
  upstream.searchParams.set('serviceKey', serviceKey)
  upstream.searchParams.set('_type', 'json')
  upstream.searchParams.set('cityCode', cityCode)
  if (operation === 'routes') upstream.searchParams.set('routeNo', routeNo)
  else upstream.searchParams.set('routeId', routeId)
  if (operation !== 'info') {
    upstream.searchParams.set('pageNo', String(pageNo))
    upstream.searchParams.set('numOfRows', String(numOfRows))
  }
  try {
    const response = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) throw new Error(`공공데이터 API HTTP ${response.status}`)
    const body = await response.json()
    sendJson(res, 200, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    sendJson(res, 502, { message: `공공데이터 API 요청에 실패했습니다. ${message}` })
  }
}

async function serveBuiltFile(req, res, url) {
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
  const filePath = resolve(distRoot, `.${pathname}`)
  if (filePath !== distRoot && !filePath.startsWith(distRoot + sep)) {
    res.writeHead(403).end()
    return
  }
  let target = filePath
  try {
    if (!(await stat(target)).isFile()) target = resolve(distRoot, 'index.html')
  } catch { target = resolve(distRoot, 'index.html') }
  try {
    const content = await readFile(target)
    res.writeHead(200, { 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404).end('Build output not found. Run npm run build first.')
  }
}

const vite = production ? null : await createViteServer({
  root,
  server: { middlewareMode: true },
  appType: 'spa',
})

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/api/')) {
    void handleApi(req, res, url)
  } else if (vite) {
    vite.middlewares(req, res, () => { res.writeHead(404).end() })
  } else {
    void serveBuiltFile(req, res, url)
  }
}).listen(port, () => {
  console.log(`UniBus ${production ? 'production' : 'development'} server: http://localhost:${port}`)
})
