import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BusMap } from './components/BusMap'
import {
  getBusPositions,
  getRouteInfo,
  getStops,
  searchRoutes,
  type BusPosition,
  type Route,
  type Stop,
  cityScopeLabel,
} from './api/bus'
const configuredRefresh = Number(import.meta.env.VITE_BUS_REFRESH_MS)
const refreshMs = Number.isFinite(configuredRefresh) && configuredRefresh >= 5000 ? configuredRefresh : 30000

function message(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function routeLabel(route: Route): string {
  return `${route.startName || '출발지 정보 없음'} → ${route.endName || '종점 정보 없음'}`
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="2"/><path d="m16 16 4.4 4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}

export default function App() {
  const [routeNo, setRouteNo] = useState('')
  const [results, setResults] = useState<Route[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [routeDetail, setRouteDetail] = useState<Route | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [buses, setBuses] = useState<BusPosition[]>([])
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const [busLoading, setBusLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [busError, setBusError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const searchController = useRef<AbortController | null>(null)
  const stopRefs = useRef(new Map<number, HTMLButtonElement>())

  const selectedRoute = useMemo(
    () => results.find((route) => route.id === selectedId) || null,
    [results, selectedId],
  )
  const route = routeDetail || selectedRoute
  const busByOrder = useMemo(() => {
    const grouped = new Map<number, BusPosition[]>()
    buses.forEach((bus) => {
      if (bus.order === null) return
      grouped.set(bus.order, [...(grouped.get(bus.order) || []), bus])
    })
    return grouped
  }, [buses])
  const unmatchedBuses = buses.filter((bus) => bus.order === null || !stops.some((stop) => stop.order === bus.order))

  const selectStop = useCallback((order: number) => {
    setSelectedOrder(order)
    stopRefs.current.get(order)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = routeNo.trim()
    if (!query) return
    searchController.current?.abort()
    const controller = new AbortController()
    searchController.current = controller
    setSearching(true)
    setSearched(false)
    setSearchError(null)
    setResults([])
    setSelectedId(null)
    setRouteDetail(null)
    setStops([])
    setBuses([])
    setSelectedOrder(null)
    try {
      const found = await searchRoutes(query, controller.signal)
      if (controller.signal.aborted) return
      setResults(found)
      setSearched(true)
      if (found.length === 1) setSelectedId(found[0].id)
    } catch (error) {
      if (!isAbort(error) && !controller.signal.aborted) setSearchError(message(error))
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }

  useEffect(() => {
    if (!selectedId || !selectedRoute) return
    const controller = new AbortController()
    setRouteLoading(true)
    setRouteError(null)
    setRouteDetail(null)
    setStops([])
    setSelectedOrder(null)
    const { cityCodes } = selectedRoute
    Promise.all([
      getRouteInfo(cityCodes, selectedId, controller.signal),
      getStops(cityCodes, selectedId, controller.signal),
    ]).then(([info, loadedStops]) => {
      if (controller.signal.aborted) return
      setRouteDetail(info)
      setStops(loadedStops)
    }).catch((error: unknown) => {
      if (!isAbort(error) && !controller.signal.aborted) setRouteError(message(error))
    }).finally(() => {
      if (!controller.signal.aborted) setRouteLoading(false)
    })
    return () => controller.abort()
  }, [selectedId, selectedRoute])

  useEffect(() => {
    if (!selectedId || !selectedRoute) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null
    setBuses([])
    setLastUpdated(null)
    setBusError(null)
    const { cityCodes } = selectedRoute
    const poll = async () => {
      controller = new AbortController()
      setBusLoading(true)
      try {
        const next = await getBusPositions(cityCodes, selectedId, controller.signal)
        if (disposed) return
        setBuses(next)
        setLastUpdated(new Date())
        setBusError(null)
      } catch (error) {
        if (!disposed && !isAbort(error)) {
          setBuses([])
          setBusError(message(error))
        }
      } finally {
        if (!disposed) {
          setBusLoading(false)
          timer = setTimeout(poll, refreshMs)
        }
      }
    }
    void poll()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [selectedId, selectedRoute])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /><span /></span>
          <div><strong>UniBus</strong><small>천안 · 아산 버스 위치</small></div>
        </div>
        <span className="topbar-note"><span className="live-dot" /> 실시간 버스 위치</span>
      </header>

      <section className="search-section" aria-label="노선 검색">
        <div className="search-heading">
          <div><p className="eyebrow">BUS ROUTE FINDER</p><h1>우리 동네 버스, 지금 어디쯤?</h1></div>
          <p>도시와 노선번호를 선택해 정류장과 운행 위치를 확인하세요.</p>
        </div>
        <form className="search-form" onSubmit={submitSearch}>
          <div className="region-badge" aria-label="천안·아산 통합 검색">
            <span className="region-mark" aria-hidden="true">⌖</span><span><strong>천안 · 아산</strong><small>통합 검색</small></span>
          </div>
          <label className="route-input"><SearchIcon /><span className="sr-only">버스 노선번호</span><input value={routeNo} onChange={(event) => setRouteNo(event.target.value)} placeholder="버스 노선번호 입력 (예: 100)" maxLength={30} /></label>
          <button className="search-button" type="submit" disabled={searching || !routeNo.trim()}>{searching ? '검색 중…' : '노선 검색'}<span aria-hidden="true">→</span></button>
        </form>
        {searchError && <div className="notice notice--error" role="alert"><strong>노선을 불러오지 못했습니다.</strong><span>{searchError}</span></div>}
        {searched && results.length === 0 && <div className="notice" role="status">천안·아산에서 해당 번호의 노선을 찾지 못했습니다. 번호를 다시 확인해 주세요.</div>}
        {results.length > 0 && <div className="route-results" aria-label="검색된 방향별 노선">
          <div className="result-heading"><strong>검색 결과 <em>{results.length}</em></strong><span>운행 방향을 선택하세요</span></div>
          <div className="route-options">{results.map((item) => <button key={item.id} type="button" className={`route-option ${selectedId === item.id ? 'selected' : ''}`} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><b>{item.number}</b><span className="route-direction">{routeLabel(item)}</span><small className="route-scope">{cityScopeLabel(item.cityCodes)}</small><span className="option-arrow" aria-hidden="true">↗</span></button>)}</div>
          {results.some((item) => !item.startName || !item.endName) && <p className="data-note">일부 노선의 기종점 정보가 API에서 제공되지 않았습니다.</p>}
        </div>}
      </section>

      <main className="content-grid">
        <section className="map-panel" aria-label="버스 지도">
          <BusMap routeId={selectedId} stops={stops} buses={buses} selectedOrder={selectedOrder} onSelectStop={selectStop} />
          <div className="map-summary"><span className="map-summary-icon">⌖</span><div><small>{route ? `${cityScopeLabel(route.cityCodes)} · ${route.number}번` : '천안 · 아산'}</small><strong>{route ? routeLabel(route) : '노선을 검색하면 지도에 표시됩니다'}</strong></div></div>
          <div className="map-legend"><span><i className="legend-stop" /> 정류장</span><span><i className="legend-bus" /> 운행 버스</span></div>
        </section>

        <aside className="stops-panel" aria-label="노선 정류장 목록">
          <div className="panel-heading"><div><p className="eyebrow">ROUTE STOPS</p><h2>{route ? <><span className="route-number">{route.number}</span>번 노선</> : '정류장 목록'}</h2></div>{route && <span className="city-pill">{cityScopeLabel(route.cityCodes)}</span>}</div>
          {route && <p className="direction-line">{routeLabel(route)}</p>}
          {route && <div className="route-meta"><span>정류장 <strong>{stops.length}</strong>곳</span><span>운행 버스 <strong>{buses.length}</strong>대</span></div>}
          {route && <div className="live-status" role="status"><ClockIcon /><span>{busLoading && !lastUpdated ? '버스 위치를 불러오는 중…' : lastUpdated ? `마지막 갱신 ${lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '실시간 위치 대기 중'}</span><small>{Math.round(refreshMs / 1000)}초 간격</small></div>}
          {routeError && <div className="notice notice--error" role="alert"><strong>노선 정보를 불러오지 못했습니다.</strong><span>{routeError}</span></div>}
          {busError && <div className="notice notice--error" role="alert"><strong>버스 위치를 갱신하지 못했습니다.</strong><span>{busError}</span></div>}
          {route && !busLoading && !busError && buses.length === 0 && <div className="notice" role="status">현재 운행 중인 버스 위치가 제공되지 않습니다.</div>}
          {unmatchedBuses.length > 0 && <div className="notice" role="status">{unmatchedBuses.length}대의 정류장 순서가 목록과 일치하지 않아 지도에서만 확인할 수 있습니다.</div>}
          <div className="stop-scroll">
            {!selectedId && <div className="empty-state"><span className="empty-icon">◎</span><strong>어떤 버스를 찾고 계신가요?</strong><p>노선번호를 검색하고 방향을 선택하면<br />정류장 목록이 여기에 나타납니다.</p></div>}
            {selectedId && routeLoading && <div className="loading-state" role="status"><span className="spinner" />정류장 정보를 불러오는 중입니다…</div>}
            {selectedId && !routeLoading && !routeError && stops.length === 0 && <div className="empty-state"><strong>정류장 정보가 없습니다.</strong><p>선택한 노선의 정류장 목록을 API에서 받지 못했습니다.</p></div>}
            {stops.length > 0 && <ol className="stop-list">{stops.map((stop) => {
              const atStop = busByOrder.get(stop.order) || []
              return <li key={`${stop.order}-${stop.id}`} className={selectedOrder === stop.order ? 'stop-row selected' : 'stop-row'}>
                <div className="timeline"><span className="timeline-dot" /></div>
                <button type="button" ref={(element) => { if (element) stopRefs.current.set(stop.order, element); else stopRefs.current.delete(stop.order) }} onClick={() => selectStop(stop.order)} className="stop-button" aria-label={`${stop.order}번째 정류장 ${stop.name}, 지도에서 보기`}><span className="stop-order">{String(stop.order).padStart(2, '0')}</span><span className="stop-name">{stop.name}</span><span className="locate-icon" aria-hidden="true">⌖</span></button>
                {atStop.map((bus, index) => <div className="bus-at-stop" key={`${bus.vehicleNo || 'bus'}-${index}`}><span className="bus-badge">BUS</span><span>{bus.vehicleNo ? `버스 ${bus.vehicleNo}` : '운행 중인 버스'}</span><small>정류장 순서 {stop.order}</small></div>)}
              </li>
            })}</ol>}
          </div>
        </aside>
      </main>
      <footer className="footer">버스 위치와 정류장 정보는 공공데이터 API 제공 상태에 따라 달라질 수 있습니다.</footer>
    </div>
  )
}
