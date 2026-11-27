# Design language

The app is the **SEO-console layout (structure of "B") with a minimal finish (aesthetic of "A")**: a dark brand-navy sidebar + light content canvas, a few stat cards, and a dense, sortable table. Clean surfaces, hairline borders, the brand accent, strong typographic hierarchy. Responsive **desktop-first** (the data table collapses to stacked cards on narrow screens).

**Hard rule:** no hardcoded colors or common sizes in component CSS. Everything themeable comes from **design tokens** (CSS custom properties). This keeps future tweaks, or a full identity swap, to a single place.

The palette, fonts, spacing, radii, and the tab pattern below are taken from **ProductiveShop's own theme CSS** (`--primary`, `--cards-dark`, Satoshi/Switzer, etc.), so the app reads as part of their brand.

## Token system

Tokens live in one global stylesheet (`web/src/styles/tokens.css`, imported once at the app root). CSS Modules consume them only via `var(--token)`. Two tiers:

1. **Primitives**: the raw brand palette/scale. Swapping identity means editing *only* these.
2. **Semantic tokens**: role-based aliases components actually use (`--color-surface`, `--color-text`, …). Components never reference primitives directly.

```css
:root {
  /* ---- Primitives (brand, from ProductiveShop theme) ---- */
  --ps-primary:    #6161ff;   /* brand accent */
  --ps-primary-600:#5757e5;   /* hover */
  --ps-primary-200:#b997ee;
  --ps-secondary:  #d1f960;   /* lime pop */
  --ps-navy:       #112235;   /* --cards-dark → sidebar / on-dark */
  --ps-sky:        #92bff7;
  --ps-green:      #9ce9b4;
  --ps-yellow:     #f7d45f;
  --ps-pink:       #f3bed8;
  --ps-error:      #f54949;

  /* Neutrals (ProductiveShop grey scale) */
  --grey-0:#ffffff; --grey-50:#f5f5f5; --grey-100:#ebebeb; --grey-200:#cecece;
  --grey-250:#c8c8c8; --grey-300:#c4c4c4; --grey-400:#758195; --grey-500:#999999;
  --grey-700:#555555; --grey-800:#2c2b2b; --grey-900:#1d1d1d; --grey-950:#1b1b1b; --grey-1000:#000000;

  /* ---- Semantic tokens (what components use) ---- */
  --color-bg:            var(--grey-50);
  --color-surface:       var(--grey-0);
  --color-surface-2:     var(--grey-50);
  --color-border:        var(--grey-200);
  --color-text:          var(--grey-950);
  --color-text-muted:    var(--grey-500);
  --color-text-subtle:   var(--grey-400);
  --color-sidebar-bg:    var(--ps-navy);          /* = --cards-dark #112235 (their nav bg) */
  --color-sidebar-text:  rgba(255,255,255,.80);
  --color-sidebar-active:var(--grey-0);
  --color-sidebar-accent:     var(--ps-secondary); /* on-dark CTA/active = lime, per .site-header__nav */
  --color-sidebar-accent-text:var(--grey-950);
  --color-accent:        var(--ps-primary);        /* accent on LIGHT surfaces */
  --color-accent-hover:  var(--ps-primary-600);
  --color-link:          var(--ps-primary);
  --color-focus-ring:    color-mix(in srgb, var(--ps-primary) 40%, transparent);
  --sev-high:   var(--ps-error);    /* HIGH   */
  --sev-medium: var(--ps-yellow);   /* MEDIUM */
  --sev-low:    var(--grey-400);    /* LOW    */
  --sev-ok:     var(--ps-green);    /* good / improving */

  /* ---- Typography (brand fonts: Fontshare, free) ---- */
  --font-sans:     "Satoshi", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --font-headings: "Switzer", var(--font-sans);
  --text-xs:12px; --text-sm:14px; --text-md:16px; --text-lg:20px; --text-xl:28px;
  --leading-tight:1.25; --leading-normal:1.5;
  --weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;

  /* ---- Spacing (ProductiveShop 8-based scale; value = name in px) ---- */
  --space-4:4px; --space-8:8px; --space-12:12px; --space-16:16px;
  --space-24:24px; --space-32:32px; --space-40:40px; --space-48:48px; --space-64:64px;

  /* ---- Radius ---- */
  --radius-sm:8px; --radius-md:16px; --radius-lg:24px; --radius-pill:117px; --radius-input:2px;

  /* ---- Elevation (brand cards are mostly flat; shadows kept subtle) ---- */
  --shadow-sm:0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
  --shadow-md:0 4px 12px rgba(16,24,40,.10);

  /* ---- Controls ---- */
  --btn-radius:var(--radius-pill); --btn-pad-y:14px; --btn-pad-x:32px; --btn-weight:600;
  --input-height:48px; --input-pad:12px; --input-radius:var(--radius-input);

  /* ---- Layout ---- */
  --sidebar-width:240px; --topbar-height:64px;
  --container-max:1440px; --container-pad:64px;

  /* ---- Motion ---- */
  --transition-fast:120ms ease;
}

/* Brand reduces container padding on smaller screens */
@media (max-width:1024px){ :root{ --container-pad:16px; } }
@media (max-width:576px){  :root{ --container-pad:16px; } }
```

**Consumption rule (in every CSS Module):**
```css
.card { background: var(--color-surface); border:1px solid var(--color-border);
        border-radius: var(--radius-md); padding: var(--space-24); }
```
No raw hex, no magic px for themeable values. Structural one-offs (e.g. a `1px` hairline) are fine, but any color/spacing/type with a token must use the token.

**Recharts / JS colors:** the chart needs colors as JS values. Keep one source of truth: read tokens at runtime via `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')` (a tiny `readToken()` helper), not duplicated hex in TS.

**Fonts:** Satoshi + Switzer load from Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=switzer@500,600,700&display=swap`), with a system-sans fallback so the app still renders offline/if the CDN is blocked.

**Identity swap / theming:** retuning the brand = edit the **primitives** block only. A full alternate theme (or future dark mode) is a `[data-theme="x"] { … }` block overriding the same semantic tokens, and components don't change. Breakpoints can't use CSS vars, so they're a documented constant set matching the brand: **1024px**, **768px**, **576px**.

## Layout & components

- **Sidebar** (`--color-sidebar-bg` = brand navy `#112235`, fixed `--sidebar-width`): Pages · Clients · + Add client. Active item highlighted with `--color-accent`. Collapses to a top bar under 1024px.
- **Content canvas** (`--color-bg`), max `--container-max`, padded `--container-pad`.
- **Stat cards** (3 to 4): summary of the selected client (pages, open issues, avg/best position). Few and meaningful, no vanity metrics. Brand-flat (surface + border + big radius), subtle shadow optional.
- **Pages table**: dense, sortable. URL · keyword chips · issue count pill · **best position** (lowest across the page's keywords on the latest date, labelled "best position" so the single number isn't ambiguous), with a trend arrow. Collapses to stacked cards under 576px.
- **Page detail**: a **segmented control** toggles **Chart** ↔ **Table** for the position history (default **Chart**, default range ~last 90 days for readability, since the ≥50k history spans ~400 days). It mirrors ProductiveShop's own tab styling (`.cases__tab`): inactive = `--grey-50` bg / `--grey-500` text; **active = `--color-accent` bg / white text**; `--radius-sm`. Plus keyword chips and issues grouped by severity (`--sev-*`).
- **Buttons**: primary = pill (`--btn-radius` 117px), `--color-accent` bg, white text, weight 600. Secondary = outline.
- **Auth / Add client**: controlled inputs (`--input-*`, square `2px` radius per brand) on a centered `--color-surface` card.

## Accessibility notes

Severity is never color-only (icon/label too); focus states use `--color-focus-ring`; text/background pairs target WCAG AA contrast. Note the lime `--ps-secondary` and yellow are light, so always pair with dark text, never as text on white.
