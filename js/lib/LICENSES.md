# 이 폴더에 들어 있는 외부 파일

리포트 PDF를 만들고 읽는 데만 쓰인다. 모두 필요할 때에만 불러온다.

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `font-nanum.js` | 나눔고딕 (NanumGothic-Regular.ttf), © NAVER Corp. | SIL Open Font License 1.1 |
| `jspdf.umd.min.js` | jsPDF 2.5.2 | MIT |
| `pdf.min.js`, `pdf.worker.min.js` | pdf.js 3.11.174 (Mozilla) | Apache License 2.0 |

## 나눔고딕 서브셋에 관하여

`font-nanum.js` 는 나눔고딕 원본을 그대로 담은 것이 아니라, 이 앱에 필요한 글자만
남기고 줄인 뒤 base64 로 바꾼 것이다. 포함된 글자는 다음과 같다.

- KS X 1001 완성형 한글 2,350자
- 아스키 (숫자·영문·문장부호)
- 한글 호환 자모 (ㄱ~ㅎ, ㅏ~ㅣ)
- 리포트에 쓰는 기호 (·, →, ●, ○ 등)

SIL Open Font License 1.1 은 서브셋 생성과 재배포를 허용한다. 다만 폰트를 그 자체로
팔 수 없고, 저작권 표시를 남겨야 한다. 원본과 전체 라이선스 조문은 아래에서 볼 수 있다.

https://github.com/google/fonts/tree/main/ofl/nanumgothic

서브셋을 다시 만들려면 `fonttools` 로 원본 TTF 에서 위 글자만 남기고
base64 로 바꿔 `var NANUM_GOTHIC_BASE64 = "..."` 형태로 저장하면 된다.
