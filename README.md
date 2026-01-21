# webmunk-live-mirror

BRIC module for capturing Q&A pairs and interactions from LLM chatbot platforms.

## Supported Platforms

- **Perplexity.ai** - Questions, responses, and Perplexity citation sources ✅
- **ChatGPT** (chatgpt.com) - Questions and responses

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

## License

See LICENSE file
