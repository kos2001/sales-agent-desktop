export default {
  title: "도구",
  subtitle: "대화 중에 에이전트가 쓸 수 있는 도구를 켜고 끕니다",
  web: {
    label: "웹 검색",
    description: "웹을 검색하고 URL에서 내용을 가져옵니다",
  },
  browser: {
    label: "브라우저",
    description: "웹 페이지를 이동하고 클릭·입력 등으로 조작합니다",
  },
  terminal: {
    label: "터미널",
    description: "셸 명령과 스크립트를 실행합니다",
  },
  file: {
    label: "파일 작업",
    description: "파일을 읽고 쓰고 검색하고 관리합니다",
  },
  code_execution: {
    label: "코드 실행",
    description: "Python과 셸 코드를 직접 실행합니다",
  },
  vision: { label: "이미지 인식", description: "이미지와 시각 자료를 분석합니다" },
  image_gen: {
    label: "이미지 생성",
    description: "DALL-E 등으로 이미지를 만듭니다",
  },
  tts: { label: "음성 변환", description: "텍스트를 음성으로 변환합니다" },
  skills: {
    label: "플레이북",
    description: "플레이북을 만들고 관리하고 실행합니다",
  },
  memory: {
    label: "메모리",
    description: "기억을 저장하고 불러옵니다",
  },
  session_search: {
    label: "대화 검색",
    description: "지난 대화 전체를 검색합니다",
  },
  clarify: {
    label: "확인 질문",
    description: "필요할 때 사용자에게 되묻습니다",
  },
  delegation: {
    label: "작업 위임",
    description: "병렬 작업을 위해 하위 에이전트를 만듭니다",
  },
  cronjob: {
    label: "예약 실행",
    description: "정해진 시각에 실행할 작업을 만들고 관리합니다",
  },
  moa: {
    label: "모델 조합",
    description: "여러 AI 모델을 함께 활용합니다",
  },
  todo: {
    label: "작업 계획",
    description: "복잡한 작업을 할 일 목록으로 관리합니다",
  },
  mcpServers: "MCP 서버",
  mcpDescription: "config.yaml에 설정된 Model Context Protocol 서버입니다. 터미널에서 <code>hermes mcp add/remove</code>로 관리합니다.",
  http: "HTTP",
  stdio: "stdio",
  disabled: "사용 안 함",
} as const;
