# webmunk-live-mirror

BRIC module for capturing Q&A pairs and interactions from LLM chatbot platforms.

## Supported Platforms

- Perplexity.ai
- ChatGPT (chatgpt.com)
- Google Gemini (gemini.google.com)
- Claude (claude.ai)

## Installation

```bash
npm install @bric/webmunk-live-mirror
```

## Configuration

Add to extension config:

```json
{
  "llm_capture": {
    "enabled": true,
    "sources": ["perplexity", "chatgpt", "gemini", "claude"],
    "transmission_interval_ms": 60000,
    "batch_size": 10
  }
}
```

## Module Exports

- `./extension` - Extension context module
- `./browser` - Browser/content script context module
- `./service-worker` - Service worker context module

## Data Format

Captured interactions are transmitted as:

```json
{
  "source": "perplexity",
  "timestamp": 1234567890,
  "interaction": {
    "type": "question" | "response",
    "content": "user question or bot response",
    "length": 150
  },
  "url": "https://www.perplexity.ai/..."
}
```

## License

See LICENSE file
