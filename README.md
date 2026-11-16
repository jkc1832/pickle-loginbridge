# Pickle Login Bridge

피클에서 사용할 로그인 토큰·연결 설정을 브라우저에서 JSON 파일로 만드는 공개 정적 웹앱입니다. 사이트마다 전용 HTTPS 호스트를 사용하므로 피클 볼트가 호스트별로 계정을 구분할 수 있습니다.

## 구조와 실행

`index.html`, `style.css`, `app.js`가 공통 화면과 엔진입니다. `sites/<siteId>.json`이 입력 폼, API 요청, 다운로드 구조를 선언합니다. `hosts.json`은 호스트와 사이트 ID를 연결하고 전체 사이트 목록의 인덱스 역할을 합니다. `_headers`는 Cloudflare Pages 응답 보안 헤더입니다. 설치할 런타임 의존성과 빌드 단계가 없습니다. CSS는 기기에 설치된 글꼴을 사용합니다.

로컬 확인은 저장소 루트에서 정적 HTTP 서버를 실행합니다. 예를 들어 Python이 설치된 환경에서 다음 명령을 사용할 수 있습니다.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

`http://localhost:8000/`에서 목록, `http://localhost:8000/?site=dongtan-lakecity-visit-web`에서 폼을 확인합니다. 피클의 비밀번호 자동 입력은 공개 HTTPS 주소에서 확인해야 합니다. 일반 HTTP 주소와 `file://`에서는 앱이 입력 폼을 열지 않으며, 로컬 개발용 루프백 HTTP만 허용합니다.

## 지원 사이트

아래 브릿지 주소는 배포할 Pages 프로젝트 이름을 기준으로 정한 주소입니다. 실제 사용하려면 각 Pages 프로젝트를 생성하고 배포해야 합니다.

| 사이트명 | 로그인 브릿지 주소 | 원본 로그인 주소 | 설명 |
| --- | --- | --- | --- |
| 노크타운 앱 로그인 | https://pickle-loginbridge--knocktown-appapi.pages.dev/?download=1 | https://homeknocktown.co.kr/ | 앱 API로 로그인하고 액세스·갱신 토큰과 만료 정보를 저장합니다. 원본 링크는 서비스 홈페이지입니다. |
| 동탄 레이크시티 방문차량 | https://pickle-loginbridge--dongtan-lakecity-visit-web.pages.dev/ | http://210.217.80.232/Account/Login | 동·호수·비밀번호로 방문차량 자동화용 설정 파일을 만듭니다. |
| SmartThings 개인 토큰 | https://pickle-loginbridge--smartthings-pat.pages.dev/ | https://account.smartthings.com/tokens | 공식 사이트에서 받은 PAT를 `token` 키에 담습니다. 새 PAT의 유효 기간은 24시간입니다. |

노크타운 규격은 사용자가 제공한 앱 분석 프로젝트의 `KNOCKTOWN_API.md`에 기록된 Android 1.30.0(454) 분석에 근거합니다. `POST https://api.homeknocktown.co.kr/v1/auth/token/authorize`에 `username`, `password`를 보내고 응답 루트의 `accessToken`, `refreshToken`, `expiresAt` 문자열을 읽습니다. 브라우저는 자신의 User-Agent를 사용합니다. 2026-11-17에 계정 정보 없이 브릿지 Origin을 지정한 OPTIONS 요청에서 HTTP 204, `Access-Control-Allow-Origin: *`, POST 및 요청 헤더 허용을 확인했습니다. 실제 계정 로그인과 POST 응답의 CORS 처리는 배포 후 확인해야 합니다.

SmartThings PAT는 공식 페이지에서 사용자가 발급받습니다. 이 앱의 변환 과정은 토큰 유효성을 확인하지 않습니다. [SmartThings 인증 문서](https://developer.smartthings.com/docs/getting-started/authorization-and-permissions)

## 호스트 선택과 네이밍

1. `location.hostname`을 `hosts.json`에서 조회합니다.
2. 매핑이 없으면 `pickle-loginbridge--<siteId>.pages.dev` 규칙에서 ID를 읽습니다.
3. 둘 다 없으면 `?site=<siteId>`를 로컬·프리뷰용으로 사용합니다.
4. 사이트 선택이 없으면 등록된 전체 사이트의 브릿지 주소, 원본 주소, 설명을 보여 줍니다. 잘못된 ID나 읽을 수 없는 설정에는 오류를 표시합니다.

등록된 호스트에서는 `?site=`가 사이트를 바꾸지 못합니다. 프리뷰 쿼리는 폼 동작을 확인하는 용도이며, 피클 볼트 등록에는 사이트별 정식 호스트를 사용합니다. 알 수 없는 쿼리 파라미터로 입력값을 채우지 않습니다.

- 전국·글로벌 서비스는 `<서비스>-<구분>`을 사용합니다. 예를 들어 `knocktown-appapi`, `smartthings-pat`입니다.
- 지역·단지 서비스는 `<지역>-<단지>-<구분>`을 사용합니다. 예를 들어 `dongtan-lakecity-visit-web`입니다.
- 같은 서비스의 앱 API와 웹은 `-appapi`, `-web`으로 구분합니다. PAT는 `-pat`를 사용합니다.
- 영문 소문자, 숫자, 단일 하이픈으로 구성합니다. 파일명과 `siteId`가 일치해야 합니다. 호스트 접두사 길이를 고려해 ID는 최대 43자로 제한합니다.
- 커스텀 도메인을 사용하면 `hosts.json`에 정확한 호스트를 추가하고 해당 사이트의 `bridgeUrl`을 변경합니다.

## 선언형 사이트 설정

각 JSON은 `sites/_schema.json`을 참조합니다. 필수 메타데이터는 `siteId`, `name`, `bridgeUrl`, `originLoginUrl`, `description`이며, `mode`, `fields`, `filename`, `output`도 필요합니다. `bridgeUrl`은 공개 HTTPS 주소로 작성합니다. 링크·라벨·설명에는 공개 정보만 넣습니다.

`fields`의 각 항목은 `name`, `label`, `type`, `autocomplete`을 갖습니다. 모든 입력은 필수이며 문자열로 처리하므로 동·호수의 앞자리 0도 유지됩니다. `maxLength` 기본값은 4096, 허용 최댓값은 16384입니다. 비밀번호·토큰·API 키는 반드시 `type: "password"`, `autocomplete: "current-password"`로 선언합니다. 비밀 입력란에는 보기 전환 버튼이 없습니다.

템플릿은 JSON 객체·배열·리터럴로 구성하며 다음 참조만 지원합니다.

```json
{
  "account": { "id": { "$field": "username" } },
  "token": { "$response": ["data", "accessToken"] },
  "version": 1
}
```

`{"$field":"필드명"}`은 입력 문자열 전체를 대입합니다. `{"$response":["data","accessToken"]}`은 API 응답의 명시적 객체 경로를 읽습니다. 응답 참조는 비어 있지 않은 문자열만 허용합니다. 점 문자열, 배열 인덱스, JSONPath, 문자열 보간, 실행 코드는 지원 범위에 포함되지 않습니다. 동적 출력 키와 `__proto__`, `constructor`, `prototype`도 거부합니다.

엔진은 실행 시 필수 키, 모드, URL, 입력 형식, 참조 필드, 위험한 키, 파일명을 검증합니다. 템플릿 깊이는 최대 12단계입니다. JSON Schema 검증에 더해 필드 이름 중복, 존재하지 않는 참조 등의 의미 검증을 수행합니다.

### `config_download`

입력값을 `output`에 조립해 즉시 다운로드합니다. 초기 HTML·JS·CSS·설정 파일을 받은 뒤에는 생성 과정에서 외부 요청이 없습니다. 동탄 예제 결과는 `dong`, `ho`, `password` 세 키이며 파일명은 `dongtan_lakecity_visit_config.json`입니다. 원본 HTTP 로그인 주소는 안내 링크로만 사용합니다.

### `api_token`

`api.url`에는 쿼리·사용자 정보·프래그먼트가 없는 HTTPS 로그인 주소를 넣습니다. `api.body`는 입력 필드 참조로 작성합니다. 요청은 JSON POST이며, 브라우저에서 해당 API로 직접 전송합니다. 쿠키를 보내지 않고 리다이렉트는 거부합니다. 타임아웃은 30초이며 중복 제출을 막습니다.

`output`에 필요한 토큰 경로만 선언합니다. 전체 응답이나 서버 오류 내용을 화면에 출력하지 않습니다. 로그인 요청에서 필수 토큰을 얻으면 파일 다운로드가 시작됩니다. `requireDownloadParam: true`이면 `?download=1`이 있을 때만 입력·제출이 활성화됩니다. 노크타운의 정식 브릿지 링크에는 이 옵션이 들어 있습니다.

서비스가 브릿지 출처의 CORS 요청을 허용해야 합니다. 로그인 정책에 추가 인증이 있거나 브라우저 연결이 허용되지 않으면 공식 토큰 발급 경로가 있는 서비스에 `token_convert`를 적용할 수 있습니다.

### `token_convert`

사용자가 `originLoginUrl`에서 발급받은 토큰을 마스킹된 입력칸에 붙여 넣습니다. 모든 입력란은 password 타입이어야 합니다. `output` 구조로 감싸 로컬 파일로 다운로드합니다. SmartThings 예제는 `{ "token": "입력한 토큰" }` 형식입니다.

## 보안과 피클 호환성

폼은 명시적 label과 표준 input, submit 버튼으로 구성합니다. 사용자가 입력하는 동안 비밀은 마스킹된 password 입력의 `value`에만 존재합니다. 이는 표준 폼 자동 입력에 필요한 상태입니다. 비밀의 사본, API 응답, 생성 JSON을 텍스트·HTML·속성·숨은 입력 등에 추가하지 않습니다.

최종 파일은 `JSON.stringify(payload, null, 2)`로 직렬화한 `application/json` Blob입니다. DOM에 붙이지 않은 `<a download>`를 클릭한 직후 object URL을 해제합니다. 성공·실패·초기화·페이지 이탈 시 입력과 앱의 데이터 참조를 비웁니다. 페이지 복원 시에도 초기화합니다. 진행 중 요청은 초기화·이탈 시 취소하며, 이전 요청이 나중에 완료되어도 다운로드하지 않습니다.

앱은 입력과 결과를 localStorage, sessionStorage, cookie, IndexedDB 또는 로그에 기록하지 않습니다. JavaScript의 가비지 컬렉션 시점과 브라우저 네트워크 버퍼의 물리적 메모리 삭제 시점은 제어할 수 없습니다. 내려받은 파일과 브라우저 자체의 비밀번호 저장 기능은 사용자의 기기에서 관리됩니다. 다운로드 API는 저장 완료 여부를 알려주지 않으므로 화면은 다운로드 시작과 목록 확인을 안내합니다.

API 모드에서 로그인 정보는 해당 서비스 서버에 전달됩니다. 그 서비스의 처리·보관 정책은 서비스가 정합니다. 다른 두 모드에서는 파일 생성 과정에 입력값 전송이 없습니다. 원본 사이트의 로그인 성공 여부와 피클의 격리 저장은 해당 서비스 및 피클에서 확인해야 합니다.

`_headers`와 HTML의 CSP는 외부 스크립트, 인라인 스크립트, 외부 스타일, 폼 전송을 제한합니다. `connect-src`는 같은 출처의 정적 설정 조회와 명시된 노크타운 API만 허용합니다. 헤더에는 `frame-ancestors 'none'`, `no-referrer`, `nosniff`, `no-store`가 포함됩니다. Cloudflare Analytics, Zaraz, Rocket Loader, Turnstile 등 추가 스크립트 삽입 기능은 사용하지 않습니다.

## 새 사이트 JSON 한 개로 PR 제출하기

1. 유사한 모드의 JSON을 복사해 `sites/<siteId>.json` 한 개를 작성합니다.
2. 필수 메타데이터와 마스킹 필드, 파일명, 출력 구조를 채웁니다. 실제 계정·비밀번호·토큰은 예제에 넣지 않습니다.
3. 로컬에서 `?site=<siteId>`로 확인합니다. 호스트 규칙을 따르면 `hosts.json` 등록 전에도 전용 호스트에서 해당 JSON을 읽을 수 있습니다.
4. 해당 JSON 파일 한 개만 PR로 제출합니다. API 모드는 주소·요청·응답 규격의 근거와 CORS 확인 결과를 PR 설명에 적습니다.

관리자는 병합 시 `hosts.json`과 README 표를 갱신하고 Pages 프로젝트를 연결합니다. 새 API 출처가 필요한 경우 `_headers`와 `index.html`의 `connect-src`에 정확한 HTTPS 출처를 함께 추가합니다. 기여자가 JavaScript를 수정할 필요가 없습니다.

순수 정적 서버는 `sites/` 디렉터리를 파일 목록 API로 제공하지 않으므로 전체 목록에는 인덱스인 `hosts.json` 등록이 필요합니다. 빌드나 런타임 외부 디렉터리 조회 없이 운영하기 위해 이 등록은 관리자가 수행합니다.

## Cloudflare Pages 멀티 호스트 배포

1. Cloudflare의 Workers & Pages에서 Pages 프로젝트를 만들고 이 GitHub 저장소의 `main` 브랜치를 연결합니다.
2. 프레임워크는 `None`, 빌드 명령은 빈 값, 출력 디렉터리는 저장소 루트 `.`으로 설정합니다. 화면에서 명령 입력을 요구하면 `exit 0`을 사용합니다. 별도 의존성 설치나 번들 생성은 필요하지 않습니다.
3. 목록용 프로젝트 이름은 `pickle-loginbridge`, 사이트별 프로젝트 이름은 `pickle-loginbridge--knocktown-appapi`, `pickle-loginbridge--dongtan-lakecity-visit-web`, `pickle-loginbridge--smartthings-pat`로 지정합니다. 모두 동일한 저장소·루트·브랜치에 연결합니다.
4. 각 프로젝트 배포 후 대응하는 `https://<프로젝트명>.pages.dev`로 접속합니다. 이름이 이미 사용 중이면 실제 확보한 호스트에 맞춰 매핑과 `bridgeUrl`을 수정합니다.
5. 배포 응답에서 `_headers`의 CSP와 `Cache-Control: no-store`를 확인합니다. 노크타운은 해당 호스트의 CORS, 피클의 계정 자동 입력, JSON 다운로드·격리 이동까지 확인합니다.

이 구조에서 더블 하이픈이 들어간 각 호스트는 개별 Pages 프로젝트의 주소입니다. 한 저장소를 여러 Pages 프로젝트에 연결할 수 있으며, 공식 문서는 저장소당 기본 5개 프로젝트 제한을 안내합니다. 더 많은 사이트는 한도 상향이나 저장소 복제 구성을 사용합니다. [Pages 멀티 프로젝트 문서](https://developers.cloudflare.com/pages/configuration/monorepos/)

정적 파일 배포와 헤더 적용 방식은 Cloudflare 문서를 참고하세요. [정적 HTML 배포](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) · [커스텀 헤더](https://developers.cloudflare.com/pages/configuration/headers/)

### 템플릿 복제 배포

GitHub에서 이 저장소를 Fork하거나, 관리자가 Settings에서 Template repository를 켠 경우 Use this template으로 복제합니다. 복제본의 사이트 JSON과 호스트 매핑을 자신의 주소에 맞게 수정하고 같은 절차로 Pages 프로젝트를 연결합니다. 기존 전용 호스트와 동일한 이름을 확보할 수 없다면 자신의 커스텀 HTTPS 도메인을 `hosts.json`에 등록합니다.

Git 연결 없이 배포하려면 배포 파일을 ZIP으로 묶어 Pages Direct Upload에서 프로젝트마다 업로드합니다. ZIP 루트에 `index.html`, `app.js`, `style.css`, `_headers`, `hosts.json`, `sites/`가 있어야 합니다. `.git`, 테스트 파일, 실제 연결 파일은 포함하지 않습니다. Direct Upload로 만든 프로젝트는 이후 Git 연동 방식으로 직접 전환할 수 없어 새 프로젝트가 필요합니다. [Direct Upload 문서](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## 검증

회귀 검사는 Node.js 내장 테스트 러너로 실행합니다. 개발 검증용이며 앱 실행과 배포에 Node.js는 필요하지 않습니다.

```sh
node --test tests/app.test.cjs
```

22개 회귀 검사로 호스트 선택, 세 모드의 제출·파일 생성, 입력 정리, 오류 응답, 중복 제출, 초기화 후 지연 응답, 위험한 설정 거부를 검증합니다. 실제 서비스 계정과 토큰을 테스트에 사용하지 않습니다. 로컬 Chromium 브라우저에서 동탄 설정 파일의 실제 다운로드, 입력 초기화, 전체 사이트 목록 표시를 확인했습니다. Cloudflare 배포와 피클 볼트·격리 저장의 통합 검증은 배포 후 수행합니다.
