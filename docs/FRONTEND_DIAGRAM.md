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
        SR["Search Results"]
        MO["Movers Pages"]
        FC["Forecast Page"]
        PR["Projection Page"]
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
    L --> SR
    L --> MO
    LI --> D
    SU --> D

    D --> I
    D --> TS
    D --> AC
    D --> ST
    D --> FC
    D --> PR

    TS --> I
    I --> TS
    I --> FC
    I --> PR
    AC --> D
    ST --> D
```

## Notes

- Guests can browse the landing page, open auth pages, and search into instrument pages.
- The dashboard is the signed-in home page.
- The instrument page is the main chart page for a selected symbol.
- Forecast and projection routes are public pages in the router, but the current frontend API helpers still require a token before running the requests.
- The tracked-symbols page is the full watch board for saved names.
- Account and settings are available from the user menu.
- Local testing can use `http://127.0.0.1:8000` as a frontend/full-stack origin or the Vite dev server at `http://127.0.0.1:5173`.
