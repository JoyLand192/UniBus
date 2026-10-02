export type CityCode = '34040' | '34010'
export const CITY_CODES: CityCode[] = ['34040', '34010']

export interface Route {
  id: string
  number: string
  startName: string | null
  endName: string | null
  cityCodes: CityCode[]
}

export interface Stop {
  order: number
  id: string
  name: string
  lat: number | null
  lng: number | null
}

export interface BusPosition {
  order: number | null
  id: string | null
  name: string | null
  lat: number | null
  lng: number | null
  vehicleNo: string | null
}

type JsonObject = Record<string, unknown>
type Operation = 'routes' | 'info' | 'stops' | 'positions'

const PAGE_SIZE = 100
const MAX_PAGES = 100

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const result = String(value).trim()
  return result || null
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function coordinate(value: unknown, limit: number): number | null {
  const result = asNumber(value)
  return result !== null && Math.abs(result) <= limit ? result : null
}

export function normalizeItems(value: unknown): JsonObject[] {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  return values.map(object).filter((item): item is JsonObject => item !== null)
}

function unpack(payload: unknown): { items: JsonObject[], totalCount: number | null } {
  const response = object(object(payload)?.response)
  if (!response) throw new Error('API 응답에 response가 없습니다. 응답 구조를 확인해 주세요.')
  const header = object(response.header)
  const code = asString(header?.resultCode)
  if (code && !['00', '0', '03', 'NODATA_ERROR'].includes(code)) {
    throw new Error(asString(header?.resultMsg) || `공공데이터 API 오류 (${code})`)
  }
  if (code === '03' || code === 'NODATA_ERROR') return { items: [], totalCount: 0 }
  const body = object(response.body)
  if (!body) throw new Error('API 응답에 body가 없습니다. 응답 구조를 확인해 주세요.')
  const items = normalizeItems(object(body.items)?.item)
  return { items, totalCount: asNumber(body.totalCount) }
}

async function request(
  operation: Operation,
  params: Record<string, string | number>,
  signal: AbortSignal,
): Promise<{ items: JsonObject[], totalCount: number | null }> {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => query.set(key, String(value)))
  const response = await fetch(`/api/${operation}?${query}`, { signal })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(asString(object(payload)?.message) || `요청 실패 (HTTP ${response.status})`)
  }
  return unpack(payload)
}

async function allPages(
  operation: 'routes' | 'stops' | 'positions',
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<JsonObject[]> {
  const result: JsonObject[] = []
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const page = await request(operation, { ...params, pageNo, numOfRows: PAGE_SIZE }, signal)
    result.push(...page.items)
    if (page.items.length === 0) return result
    if (page.totalCount !== null && result.length >= page.totalCount) return result
    if (page.totalCount === null && page.items.length < PAGE_SIZE) return result
  }
  throw new Error('API 페이지 수가 예상 범위를 넘었습니다. 전체 데이터를 확인할 수 없습니다.')
}

function normalizeRoute(item: JsonObject, cityCode: CityCode): Route {
  const id = asString(item.routeid)
  const number = asString(item.routeno)
  if (!id || !number) throw new Error('노선 응답에 routeid 또는 routeno가 없습니다. 응답 구조를 확인해 주세요.')
  return {
    id,
    number,
    startName: asString(item.startnodenm),
    endName: asString(item.endnodenm),
    cityCodes: [cityCode],
  }
}

export function cityScopeLabel(cityCodes: CityCode[]): string {
  const includesAsan = cityCodes.includes('34040')
  const includesCheonan = cityCodes.includes('34010')
  if (includesAsan && includesCheonan) return '천안·아산'
  if (includesCheonan) return '천안'
  return '아산'
}

function compareRoutes(a: Route, b: Route): number {
  return a.number.length - b.number.length ||
    a.number.localeCompare(b.number, 'ko-KR', { numeric: true, sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
}

export async function searchRoutes(routeNo: string, signal: AbortSignal): Promise<Route[]> {
  const cityResults = await Promise.all(CITY_CODES.map(async (cityCode) => ({
    cityCode,
    items: await allPages('routes', { cityCode, routeNo }, signal),
  })))
  const byRouteId = new Map<string, Route>()
  cityResults.forEach(({ cityCode, items }) => items.forEach((item) => {
    const route = normalizeRoute(item, cityCode)
    const existing = byRouteId.get(route.id)
    if (!existing) {
      byRouteId.set(route.id, route)
      return
    }
    byRouteId.set(route.id, {
      ...existing,
      startName: existing.startName ?? route.startName,
      endName: existing.endName ?? route.endName,
      cityCodes: [...new Set([...existing.cityCodes, cityCode])],
    })
  }))
  const routes = [...byRouteId.values()].sort(compareRoutes)
  // API 검색 결과에 기종점이 없으면 같은 routeid로 상세 정보를 보완한다.
  return Promise.all(routes.map(async (route) => {
    if (route.startName && route.endName) return route
    const detail = await getRouteInfo(route.cityCodes, route.id, signal)
    return {
      ...route,
      startName: route.startName ?? detail.startName,
      endName: route.endName ?? detail.endName,
    }
  }))
}

export async function getRouteInfo(cityCodes: CityCode[], routeId: string, signal: AbortSignal): Promise<Route> {
  const responses = await Promise.all(cityCodes.map(async (cityCode) => ({
    cityCode,
    page: await request('info', { cityCode, routeId }, signal),
  })))
  const found = responses.find(({ page }) => page.items.length > 0)
  if (!found?.page.items[0]) throw new Error('선택한 노선의 상세 정보가 없습니다.')
  const detail = normalizeRoute(found.page.items[0], found.cityCode)
  return { ...detail, cityCodes: [...new Set(cityCodes)] }
}

export async function getStops(cityCodes: CityCode[], routeId: string, signal: AbortSignal): Promise<Stop[]> {
  const cityItems = await Promise.all(cityCodes.map((cityCode) =>
    allPages('stops', { cityCode, routeId }, signal),
  ))
  const items = cityItems.flat()
  const stops = items.map((item) => {
    const order = asNumber(item.nodeord)
    const id = asString(item.nodeid)
    const name = asString(item.nodenm)
    if (order === null || !id || !name) {
      throw new Error('정류소 응답에 nodeord, nodeid 또는 nodenm이 없습니다. 응답 구조를 확인해 주세요.')
    }
    return {
      order,
      id,
      name,
      lat: coordinate(item.gpslati, 90),
      lng: coordinate(item.gpslong, 180),
    }
  })
  const byOrderAndId = new Map<string, Stop>()
  stops.forEach((stop) => {
    const key = `${stop.order}:${stop.id}`
    const existing = byOrderAndId.get(key)
    byOrderAndId.set(key, existing ? {
      ...existing,
      lat: existing.lat ?? stop.lat,
      lng: existing.lng ?? stop.lng,
    } : stop)
  })
  return [...byOrderAndId.values()].sort((a, b) => a.order - b.order)
}

export async function getBusPositions(cityCodes: CityCode[], routeId: string, signal: AbortSignal): Promise<BusPosition[]> {
  const cityItems = await Promise.all(cityCodes.map((cityCode) =>
    allPages('positions', { cityCode, routeId }, signal),
  ))
  const items = cityItems.flat()
  const buses = items.map((item) => ({
    order: asNumber(item.nodeord),
    id: asString(item.nodeid),
    name: asString(item.nodenm),
    lat: coordinate(item.gpslati, 90),
    lng: coordinate(item.gpslong, 180),
    vehicleNo: asString(item.vehicleno),
  }))
  const unique = new Map<string, BusPosition>()
  buses.forEach((bus) => {
    const key = bus.vehicleNo
      ? `vehicle:${bus.vehicleNo}`
      : `position:${bus.order}:${bus.id}:${bus.lat}:${bus.lng}`
    if (!unique.has(key)) unique.set(key, bus)
  })
  return [...unique.values()]
}
