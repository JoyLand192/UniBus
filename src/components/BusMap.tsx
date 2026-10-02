import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { BusPosition, Stop } from '../api/bus'

interface Props {
  routeId: string | null
  stops: Stop[]
  buses: BusPosition[]
  selectedOrder: number | null
  onSelectStop: (order: number) => void
}

const stopIcon = L.divIcon({ className: 'map-pin map-pin--stop', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] })
const activeStopIcon = L.divIcon({ className: 'map-pin map-pin--stop map-pin--active', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
const busIcon = L.divIcon({ className: 'map-pin map-pin--bus', html: '<span>BUS</span>', iconSize: [42, 30], iconAnchor: [21, 15] })

function popup(title: string, detail: string | null): HTMLElement {
  const container = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = title
  container.append(strong)
  if (detail) {
    const small = document.createElement('small')
    small.textContent = detail
    container.append(small)
  }
  return container
}

export function BusMap({ routeId, stops, buses, selectedOrder, onSelectStop }: Props) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const stopLayerRef = useRef<L.LayerGroup | null>(null)
  const busLayerRef = useRef<L.LayerGroup | null>(null)
  const fittedRouteRef = useRef<string | null>(null)

  useEffect(() => {
    if (!elementRef.current) return
    const map = L.map(elementRef.current, { zoomControl: false }).setView([36.79, 127.11], 11)
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    const stopLayer = L.layerGroup().addTo(map)
    const busLayer = L.layerGroup().addTo(map)
    mapRef.current = map
    stopLayerRef.current = stopLayer
    busLayerRef.current = busLayer
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(elementRef.current)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      stopLayerRef.current = null
      busLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = stopLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const points: L.LatLngExpression[] = []
    stops.forEach((stop) => {
      if (stop.lat === null || stop.lng === null) return
      const point: L.LatLngExpression = [stop.lat, stop.lng]
      points.push(point)
      L.marker(point, { icon: stop.order === selectedOrder ? activeStopIcon : stopIcon })
        .bindPopup(popup(stop.name, `${stop.order}번째 정류장`))
        .on('click', () => onSelectStop(stop.order))
        .addTo(layer)
    })
    if (routeId && routeId !== fittedRouteRef.current && points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 15 })
      fittedRouteRef.current = routeId
    }
    if (!routeId) fittedRouteRef.current = null
  }, [routeId, stops, selectedOrder, onSelectStop])

  useEffect(() => {
    const layer = busLayerRef.current
    if (!layer) return
    layer.clearLayers()
    buses.forEach((bus) => {
      if (bus.lat === null || bus.lng === null) return
      const title = bus.vehicleNo ? `버스 ${bus.vehicleNo}` : '운행 중인 버스'
      L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 1000 })
        .bindPopup(popup(title, bus.name))
        .addTo(layer)
    })
  }, [buses])

  useEffect(() => {
    const stop = stops.find((item) => item.order === selectedOrder)
    if (stop?.lat != null && stop.lng != null) mapRef.current?.panTo([stop.lat, stop.lng])
  }, [selectedOrder, stops])

  return <div className="map-canvas" ref={elementRef} role="region" aria-label="선택한 노선의 정류소와 실시간 버스 지도" />
}
