# Crawl4ai MCP Server

A MCP server that provides web crawling capabilities using crawl4ai with markdown output for the LLM.

## Installation

### Prerequisites
- Node.js
- Access to the crawl4ai instance: https://docs.crawl4ai.com/core/docker-deployment/

### Setup

1. Clone the repository:
```bash
git clone https://github.com/Kirill812/crawl4ai-mcp-server.git
cd crawl4ai-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

4. Add the server configuration to your environment:

```json
{
  "mcpServers": {
    "crawl4ai": {
      "command": "node",
      "args": [
        "/path/to/crawl4ai-mcp-server/build/index.js"
      ],
      "env": {
        "CRAWL4AI_API_URL": "http://127.0.0.1:11235",
        "CRAWL4AI_AUTH_TOKEN": "your-auth-token"           // Optional: if authentication is needed
      }
    }
  }
}
```

Replace the environment variables with your values:
- `CRAWL4AI_API_URL`: URL of the crawl4ai API service (optional)
- `CRAWL4AI_AUTH_TOKEN`: Authentication token for the API (optional)

## Features

### Tools
- `crawl_urls` - Crawl web pages and get markdown content with citations
  - Parameters:
    - `urls` (required): List of URLs to crawl

### Response Format

The tool returns markdown content with citations for each URL. Multiple URLs are separated by horizontal rules (---). Example:

```markdown
This is content from the first URL [^1]

[^1]: https://example.com

---

This is content from the second URL [^2]

[^2]: https://example.org
```

## Development

For development with auto-rebuild:
```bash
npm run watch
```

## Error Handling

Common issues and solutions:
1. Make sure the URLs are valid and accessible
2. If using authentication, ensure the token is valid
3. Check network connectivity to the crawl4ai API service
4. For timeout errors, try reducing the number of URLs per request
5. If getting blocked by websites, the service will automatically handle retries with different user agents

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.