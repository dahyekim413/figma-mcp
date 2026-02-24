# figma-mcp

Claude / Cursor ↔ Figma 실시간 연동을 위한 MCP(Model Context Protocol) 서버입니다.
WebSocket을 통해 AI 에이전트가 Figma 문서를 읽고 수정할 수 있습니다.

## 구조

```
figma-mcp/
├── src/
│   ├── mcp_server/
│   │   ├── server.ts   # MCP 서버 (stdio transport)
│   │   └── socket.ts   # WebSocket 브릿지 서버 (port 3055)
│   └── figma_plugin/
│       ├── manifest.json
│       ├── code.js     # Figma 플러그인 샌드박스 코드
│       └── ui.html     # 플러그인 UI (WebSocket 클라이언트)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## 동작 방식

```
Claude/Cursor
    ↕ (stdio)
MCP Server (server.ts)
    ↕ (WebSocket)
WebSocket Bridge (socket.ts) — port 3055
    ↕ (WebSocket)
Figma Plugin (ui.html + code.js)
    ↕ (postMessage)
Figma API
```

## 시작하기

### 1. 의존성 설치

```bash
bun install
```

### 2. WebSocket 서버 실행

```bash
bun run socket
```

### 3. Figma 플러그인 설치

1. Figma 데스크톱 앱 실행
2. **Plugins → Development → Import plugin from manifest...**
3. `src/figma_plugin/manifest.json` 선택
4. 플러그인 실행 후 **Connect** 클릭

### 4. Claude Desktop에 MCP 서버 등록

`~/.claude/claude_desktop_config.json` 에 추가:

```json
{
  "mcpServers": {
    "figma-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/figma-mcp/src/mcp_server/server.ts"]
    }
  }
}
```

## 제공 도구 (MCP Tools)

| 도구 | 설명 |
|------|------|
| `get_document_info` | 문서 기본 정보 조회 |
| `get_selection` | 현재 선택된 노드 조회 |
| `get_node_info` | 특정 노드 상세 정보 |
| `get_nodes_info` | 여러 노드 정보 일괄 조회 |
| `get_styles` | 문서 스타일 목록 |
| `get_local_components` | 로컬 컴포넌트 목록 |
| `create_rectangle` | 사각형 생성 |
| `create_text` | 텍스트 노드 생성 |
| `create_frame` | 프레임 생성 |
| `set_fill_color` | 노드 채우기 색상 변경 |
| `move_node` | 노드 위치 이동 |
| `resize_node` | 노드 크기 조정 |
| `delete_node` | 노드 삭제 |
| `set_text_content` | 텍스트 내용 변경 |
| `export_node_as_image` | 노드를 이미지로 내보내기 |

## 개발

```bash
# TypeScript 빌드 (watch 모드)
bun run dev

# 빌드
bun run build
```

## 라이선스

MIT
