# Frontend Diagram

This diagram shows the current frontend flow at a high level.

```mermaid
flowchart TD
    U["User"]

    subgraph Public["Public Pages"]
        L["Landing Page"]
        LI["Login Page"]
        SU["Signup Page"]
        GI["Guest Instrument Page"]
    end

    subgraph App["Signed-in Pages"]
        D["Dashboard"]
        TS["Tracked Symbols"]
        I["Instrument Page"]
        AC["Account"]
        ST["Settings"]
    end

    U --> L
    L --> LI
    L --> SU
    L --> GI
    LI --> D
    SU --> D

    D --> I
    D --> TS
    D --> AC
    D --> ST

    TS --> I
    I --> TS
    AC --> D
    ST --> D
```

## Notes

- Guests can browse the landing page, open auth pages, and search into instrument pages.
- The dashboard is the signed-in home page.
- The instrument page is the main chart page for a selected symbol.
- The tracked-symbols page is the full watch board for saved names.
- Account and settings are available from the user menu.
