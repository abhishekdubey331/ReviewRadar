# System Architecture: Greenlight Review Intelligence MCP

This document maps out the data flow and system boundaries of the stateless `v1.0` architecture. 

## 1. High-Level MCP Context Boundary
The MCP server operates as an isolated, stateless background process. It communicates with host applications (like Cursor or Claude Desktop) entirely via standard I/O (`stdio`) using the JSON-RPC protocol defined by the MCP spec.

```mermaid
sequenceDiagram
    participant User
    participant Host LLM (Cursor / Claude)
    participant MCP Server (ReviewRadar)
    participant External APIs (Anthropic/OpenAI)

    User->>Host LLM: "What are the biggest P0 complaints?"
    Host LLM->>MCP Server: Call tool `reviews.analyze(path: "reviews.json")`
    Note over MCP Server: Executes Phase 1 (Rules/PII)
    Note over MCP Server: Executes Phase 2 (Selective LLM)
    MCP Server-->>External APIs: Batch routed reviews (if needed)
    External APIs-->>MCP Server: Return generated summaries
    MCP Server-->>Host LLM: Return strict JSON Schema
    Host LLM-->>User: "The biggest complaints are..."
```

## 2. Review Processing Pipeline (Internal Flow)
When `reviews.analyze` or `reviews.summarize` is called, the data passes through our strict 2-Phase pipeline.

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

## 3. Deployment & State

*   **State:** The server holds **0 megabytes** of state between requests. All history, tracking, and comparison must be managed by the Host Client.
*   **Security:** Raw text entering Node.js memory is scrubbed at step `D`. By step `J` (where data leaves the local machine to hit OpenAI/Anthropic), it is guaranteed chemically clean of PII.
