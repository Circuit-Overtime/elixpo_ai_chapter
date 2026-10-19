# Seasonal themes

Seasonal themes are selected from `themes.json` before first paint and refreshed
in the browser once per minute. Dates are evaluated in each entry's own time
zone, so a theme starts and ends at local midnight for that event.

To add a theme:

1. Add an annual schedule and metadata entry to `themes.json`.
2. Add a stylesheet scoped to `html[data-seasonal-theme='<id>']`.
3. Import that stylesheet from `seasonal.css`.
4. Add boundary and time-zone cases to `tests/seasonalTheme.test.mjs`.

Annual ranges may cross New Year (`12-30` through `01-02`). Higher-priority
active entries win when dates overlap. Theme assets belong in `public/` and the
`icon` field is used for shared brand marks and the temporary favicon.
