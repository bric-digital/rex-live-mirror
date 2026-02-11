# webmunk-live-mirror

BRIC module for capturing Q&A pairs, sources, and interactions from LLM chatbot platforms in real-time.

## Overview

**webmunk-live-mirror** detects user questions and AI responses across multiple chatbot platforms, automatically extracting:
- **Question & Response pairs** - Full text capture with transaction tracking
- **Citation sources** - Backend-configurable selector support with cross-question deduplication
- **Metadata** - Timestamps, URLs, login state, and platform identification

## Supported Platforms

- **Perplexity.ai** - Questions, responses, and Perplexity citation sources ✅
- **ChatGPT** (chatgpt.com) - Questions and responses
- **Google Gemini** (gemini.google.com) - Questions and responses  
- **Claude** (claude.ai) - Questions and responses

## Key Features

### For Perplexity
- Detects response completion via action button appearance (Share/Copy)
- Extracts all citation links from responses using configurable selectors
- **Cross-question source deduplication**: Only new sources saved per question (no duplicates across Q1, Q2, Q3...)
- Accumulates sources across full conversation session

### General Architecture
- **Transaction-based tracking** - Reliable Q&A deduplication instead of hashing
- **Button-based triggers** - Immediate capture (no polling, no timing-based guessing)
- **Backend configuration** - DOM selectors managed by Django AppConfiguration
- **Resilient selectors** - Fallbacks + validation for DOM changes

## Integration with Other BRIC Modules

**webmunk-live-mirror** is part of the **webmunk** BRIC ecosystem:

```
┌─────────────────────────────────────────────────────┐
│  webmunk-core (Service Worker, Config Management)   │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┼────────────┬──────────────────────┐
    │            │            │                      │
┌───▼───┐  ┌─────▼─────┐  ┌──▼──────────┐  ┌───────▼──┐
│ Live  │  │ Page      │  │ Passive     │  │ History  │
│Mirror │  │ Manip.    │  │ Data Kit    │  │ Block    │
└───────┘  └───────────┘  └─────────────┘  └──────────┘
    │
    └──> LLM Capture
         (This module)
         
    └──> Sends to: webmunk-passive-data-kit
         for PDK server transmission
```

**Data Flow**:
1. **webmunk-live-mirror** detects Q&A + sources on chatbot pages
2. Formats transaction with metadata
3. Sends via `chrome.runtime.sendMessage` to **webmunk-core**
4. **webmunk-passive-data-kit** handles batch transmission to PDK server

## Configuration

This module reads from the `llm_capture` section of the backend config.

### Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | Yes | - | Enable/disable LLM capture |
| `sources` | string[] | No | [] | Platform identifiers to capture (e.g., `["perplexity", "chatgpt"]`) |
| `platforms` | object | Yes | - | Platform-specific configuration (see below) |
| `batch_size` | number | No | 10 | Number of messages to batch before transmission |
| `transmission_interval_ms` | number | No | 60000 | Interval between batch transmissions (milliseconds) |
| `capture_logged_out` | boolean | No | true | Whether to capture when user is logged out |
| `min_content_length` | number | No | 10 | Minimum content length to capture |

### Platform Configuration

Each platform in the `platforms` object has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable/disable this platform |
| `selectors` | object | Yes | DOM selectors for content extraction |
| `login_detection` | object | No | Selectors to detect login state |

### Example

```json
{
  "llm_capture": {
    "enabled": true,
    "sources": ["perplexity", "chatgpt"],
    "platforms": {
      "chatgpt": {
        "enabled": true,
        "selectors": {
          "contentDiv": "div[class*=\"prose\"]",
          "loginButton": "button[data-testid=\"login-button\"]",
          "userMessage": "[data-message-author-role=\"user\"]",
          "profileButton": "[data-testid=\"user-profile\"]",
          "conversationId": "window.location.pathname.split(\"/c/\")[1]",
          "assistantMessage": "[data-message-author-role=\"assistant\"]",
          "messageContainer": "#thread"
        },
        "login_detection": {
          "loggedInSelector": "#history",
          "loggedOutSelector": "button[data-testid=\"login-button\"]"
        }
      },
      "perplexity": {
        "enabled": true,
        "selectors": {
          "userQuestion": ":is(h1, div)[class*=\"group/query\"] span.select-text",
          "citationTitle": "span.text-3xs.rounded-badge span",
          "citationElements": "a[href*=\"http\"], [data-pplx-citation-url]",
          "messageContainer": ".scrollable-container",
          "assistantResponse": "div[id^=\"markdown-content\"]"
        },
        "login_detection": {
          "loggedOutSelector": "[aria-label*=\"Sign in\"]"
        }
      }
    },
    "batch_size": 10,
    "capture_logged_out": true,
    "min_content_length": 10,
    "transmission_interval_ms": 8000
  }
}
```

### Selector Configuration Notes

Selectors are CSS selectors used to find elements on the page. Since LLM platforms frequently update their DOM structure, selectors are configured server-side for easy updates without extension rebuilds.

## Data Format

Captured interactions transmitted as:

```json
{
  "messageType": "llmMessageCapture",
  "platform": "perplexity",
  "payload": {
    "content": {
      "user": "what is a large language model?",
      "assistant": "A large language model (LLM) is an AI...",
      "sources": [
        { "source_title": "wikipedia", "source_url": "https://en.wikipedia.org/wiki/Large_language_model" },
        { "source_title": "nvidia", "source_url": "https://www.nvidia.com/.../large-language-models/" }
      ]
    },
    "url": "https://www.perplexity.ai/search/...",
    "timestamp": 1705852836000,
    "isLoggedIn": true,
    "transactionId": "perp_1705852836000_abc123xyz"
  }
}
```

## Installation

Add to your extension's `package.json` dependencies:

```json
{
  "dependencies": {
    "@bric/webmunk-live-mirror": "github:bric-digital/webmunk-live-mirror#main"
  }
}
```

Then run `npm install`.

## Module Context Exports

- `./extension` - Extension context (manifest.json integration)
- `./browser` - Browser/popup context
- `./service-worker` - Service worker context (background processing)

## License

See LICENSE file
