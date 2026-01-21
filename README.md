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

Backend configuration via Django AppConfiguration:

```python
# Django management command
python manage.py create_perplexity_config --verbose

# Applies selectors to AppConfiguration
platforms:
  perplexity:
    enabled: true
    selectors:
      userQuestion: ':is(h1, div)[class*="group/query"] span.select-text'
      assistantResponse: 'div[id^="markdown-content"]'
      messageContainer: '.scrollable-container'
      citationElements: 'a[href*="http"], [data-pplx-citation-url]'
```

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

```bash
npm install @bric/webmunk-live-mirror
```

## Module Context Exports

- `./extension` - Extension context (manifest.json integration)
- `./browser` - Browser/popup context
- `./service-worker` - Service worker context (background processing)

## License

See LICENSE file
