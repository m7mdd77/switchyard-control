# GPT-OSS runtime — 2 November 2026

The operator selected a new private Cerebras key file and GPT-OSS 120B (gpt-oss-120b) for this app. The key stays in its existing private file and is read only by the server. Use CEREBRAS_API_KEY or CEREBRAS_KEY_FILE with your own credential; never commit the key or a personal key path. The endpoint remains https://api.cerebras.ai/v1/chat/completions. No other provider or model fallback is used.

GPT-OSS requests use low reasoning effort and hidden reasoning format. Only the completed answer enters application validation; reasoning text is not retained or exported. The existing completion, response-size, deadline, domain, quota, approval and execution boundaries remain. Completion usage includes reasoning tokens and is not a guaranteed USD cap. The application does not retry model requests. Provider rate limits remain provider limits even when the app allowance has capacity.

The public Site queues requests to the existing authenticated PC worker. This PC must remain awake and connected. The Site has a separate service credential and never receives the model API key.

33 regression tests passed. Fresh local and public evidence is recorded separately in gpt-oss-verification.json when each check completes. Earlier Qwen, Sol, Astra and DeepSeek records/videos remain dated history, not evidence for GPT-OSS.

Fresh genuine verification passed. See [gpt-oss-verification.json](gpt-oss-verification.json) for actual local/public scope and usage. Earlier local checks encountered a provider rate limit; those failed attempts remain recorded. The final checks were spaced out and passed without application retries or alternate credentials. Public Site deployment succeeded at https://switchyard-control.choggyacc.chatgpt.site.
