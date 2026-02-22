# System Architecture: ReviewRadar MCP

This document maps out the data flow and system boundaries of the `v1.0` architecture.

## 1. High-Level MCP Context Boundary
The MCP server operates as an isolated background process. It communicates with host applications (like Cursor or Claude Desktop) entirely via standard I/O (`stdio`) using the JSON-RPC protocol defined by the MCP spec.

```mermaid
sequenceDiagram
    participant User
    participant Host LLM (Cursor / Claude)
    participant MCP Server (ReviewRadar)
    participant External APIs (Anthropic/OpenAI)

    User->>Host LLM: "What are the biggest P0 complaints?"
    Host LLM->>MCP Server: Call tool `reviews_analyze(source: { ... })`
    Note over MCP Server: Executes Phase 1 (Rules/PII)
    Note over MCP Server: Executes Phase 2 (Selective LLM)
    MCP Server-->>External APIs: Batch routed reviews (if needed)
    External APIs-->>MCP Server: Return generated summaries
    MCP Server-->>Host LLM: Return strict JSON Schema
    Host LLM-->>User: "The biggest complaints are..."
```

## 2. Review Processing Pipeline (Internal Flow)
When `reviews_analyze` or `reviews_summarize` is called, the data passes through our strict 2-Phase pipeline.

```mermaid
flowchart TD
    A[Incoming CSV/JSON Payload] --> B{Schema & Limits Validator}
    B -- Exceeds 5k/10MB --> C[Throw INPUT_TOO_LARGE]
    B -- Valid --> D[Local PII Redaction Regex/Presidio]
    
    subgraph "Phase 1: Deterministic Engine (Zero Cost)"
        D --> E[Spam Rejection Rule]
        E --> F[Feature Area Keyword Mapper]
        F --> G[Severity Precedence Rules]
    end
    
    G --> H{LLM Routing Check}
    
    H -- "rule_confidence > 0.60 & P2/FYI" --> I[Compile Final Result]
    
    subgraph "Phase 2: LLM Engine (Cost-Controlled)"
        H -- "isLlmRequired === true" --> J[Concurrency Queue max 15]
        J --> K[API Circuit Breaker Check]
        K --> L[Generate LLM Classification/Summary]
    end
    
    L --> I
    I --> M[Format output to JSON Schema]
    M --> N[Return to Host LLM]
```

## 3. Deployment, State, and Storage

*   **Process State:** Request handling is stateless at the MCP protocol layer.
*   **Persistent Local Storage:** Vector index artifacts are persisted to `storage/vector_index.json` and `storage/metadata.json` when imports run. This allows search and diagnostics across process restarts.
*   **Operational Implication:** Deployments must provide writable disk for `storage/` and include cleanup/backup policy for local index files.
*   **Security Boundary:** Raw text entering Node.js memory is scrubbed before LLM calls. Logs should avoid raw review text and should use IDs/counts for diagnostics.
