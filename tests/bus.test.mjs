import test from 'node:test'
import assert from 'node:assert/strict'
import { getBusPositions, getStops, normalizeItems, searchRoutes } from '../src/api/bus.ts'

const cityCode = '34040'
const signal = new AbortController().signal

function response(items, totalCount = null) {
  return { response: { header: { resultCode: '00' }, body: { items: { item: items }, totalCount } } }
}

test('배열·단일 객체·빈 item을 정규화한다', () => {
  assert.equal(normalizeItems(null).length, 0)
  assert.equal(normalizeItems('').length, 0)
  assert.deepEqual(normalizeItems({ nodeord: 1 }), [{ nodeord: 1 }])
  assert.deepEqual(normalizeItems([{ nodeord: 1 }, { nodeord: 2 }]), [{ nodeord: 1 }, { nodeord: 2 }])
})

test('정류소 전체 페이지를 수집하고 nodeord로 정렬한다', async () => {
  const originalFetch = globalThis.fetch
  const requestedPages = []
  globalThis.fetch = async (url) => {
    const pageNo = Number(new URL(url, 'http://localhost').searchParams.get('pageNo'))
    requestedPages.push(pageNo)
    const items = pageNo === 1
      ? [{ nodeord: 3, nodeid: 'c', nodenm: '셋째', gpslati: 36.8, gpslong: 127.1 }, { nodeord: 1, nodeid: 'a', nodenm: '첫째', gpslati: 36.7, gpslong: 127.2 }]
      : { nodeord: 2, nodeid: 'b', nodenm: '둘째', gpslati: 36.75, gpslong: 127.15 }
    return { ok: true, json: async () => response(items, 3) }
  }
  try {
    const stops = await getStops(cityCode, 'ROUTE1', signal)
    assert.deepEqual(requestedPages, [1, 2])
    assert.deepEqual(stops.map((stop) => stop.order), [1, 2, 3])
  } finally { globalThis.fetch = originalFetch }
})

test('같은 번호의 방향별 routeid를 보존하고 빈 버스 응답을 처리한다', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const path = new URL(url, 'http://localhost').pathname
    if (path === '/api/routes') return { ok: true, json: async () => response([
      { routeid: 'A', routeno: '100', startnodenm: '아산', endnodenm: '천안' },
      { routeid: 'B', routeno: '100', startnodenm: '천안', endnodenm: '아산' },
    ], 2) }
    return { ok: true, json: async () => response('', 0) }
  }
  try {
    const routes = await searchRoutes(cityCode, '100', signal)
    assert.deepEqual(routes.map((route) => route.id), ['A', 'B'])
    assert.deepEqual(await getBusPositions(cityCode, 'A', signal), [])
  } finally { globalThis.fetch = originalFetch }
})
