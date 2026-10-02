# UniBus MVP

천안·아산 양쪽 API를 함께 검색해 방향별 경유 정류소와 실시간 차량 위치를 지도와 세로 목록에 표시합니다. 같은 `routeid`로 조회된 결과는 합치며, 검색 결과는 노선번호 문자열 길이가 짧은 순으로 표시합니다.

## 실행

Node.js 24 이상이 필요합니다.

```powershell
npm.cmd install
```

프로젝트 루트에 `.env` 파일을 직접 만들고 아래 값을 입력합니다.

```dotenv
SERVICE_KEY=공공데이터포털에서_발급받은_디코딩_인증키
VITE_BUS_REFRESH_MS=30000
```

버스 노선정보·위치정보 API 활용 권한도 필요합니다. 키는 브라우저에 전달되지 않고 로컬 서버가 공공데이터 API를 호출할 때만 사용합니다.

```powershell
npm.cmd run dev
```

`http://localhost:5173`에서 볼 수 있습니다. 배포용 빌드는 `npm.cmd run build`, 실행은 `npm.cmd start`입니다. 서버 포트는 `PORT` 환경변수로 바꿀 수 있습니다.

## 설정과 데이터

- `VITE_BUS_REFRESH_MS`: 버스 위치 갱신 간격. 기본 30초, 최소 5초. 각 요청이 완료된 후 다음 요청을 예약합니다.
- `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION`: 지도 타일을 바꿀 때 함께 지정합니다. 기본 지도는 Leaflet과 OpenStreetMap 타일을 사용하며 [OSM 타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 출처를 표시합니다. 서비스 규모가 커지면 별도 타일 제공자를 설정하세요.
- 노선 검색 결과는 `routeid`별로 구분하고, 천안·아산 양쪽 조회에서 확인된 도시 범위를 함께 보존합니다. 정류소와 버스 위치도 양쪽 응답을 합친 뒤 중복을 제거합니다. 정류소는 모든 페이지를 수집한 뒤 `nodeord` 순으로 표시합니다. `response.body.items.item`의 배열·객체·빈 값 형태를 모두 처리합니다.
- API 키가 없거나 응답 구조가 다르면 화면에 원인을 표시합니다. 실제 API 응답은 키가 없는 상태에서 검증할 수 없습니다.
