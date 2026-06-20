---
title: SEO Foundation V1
type: execution-plan
tags: [seo, static, sitemap, robots, landing, cloudflare]
created: 2026-06-03
updated: 2026-06-03
status: complete
---

# SEO Foundation V1

## 0. Metadata

- [x] Execution plan id: `seo-foundation-v1`
- [x] Target phase: post-demo productization
- [x] Owner: Codex
- [x] Status: complete
- [x] Created: 2026-06-03
- [x] Updated: 2026-06-03

## 1. Objective

- [x] Make Arabesque's public landing and SEO pages crawlable without app login.
- [x] Add baseline metadata, structured data, sitemap, robots policy, and static fallback content.
- [x] Keep protected app routes blocked from indexing.

## 2. Implemented Scope

- [x] Public `/robots.txt` with sitemap reference and disallow rules for `/app`, `/results`, `/admin`, and `/api`.
- [x] Public `/sitemap.xml` for `/`, `/validation`, and three use-case pages.
- [x] `src/api/main.py` public path allowlist for `/robots.txt`, `/sitemap.xml`, `/use-cases/*`, and `/landing/*`.
- [x] Static serving supports directory `index.html` for SEO pages.
- [x] Static serving supports `HEAD` requests for SPA/static routes.
- [x] Hashed static assets receive long immutable cache headers.
- [x] Root HTML includes canonical, robots meta, Organization/WebSite/SoftwareApplication/FAQ JSON-LD, and crawlable fallback content.
- [x] Public use-case pages:
  - [x] `/use-cases/price-optimization/`
  - [x] `/use-cases/creative-testing/`
  - [x] `/use-cases/market-research/`
- [x] Landing nav now links to real anchors/routes instead of placeholder `#` links.
- [x] Persona images have descriptive alt text.
- [x] OG image resized to 1200x630 and reduced to the 300-600KB target range.
- [x] Logo/persona PNGs resized for their display use.

## 2.1 Programmatic SEO Expansion

- [x] Added SEO page generator: `frontend/scripts/generate-seo-pages.mjs`.
- [x] `npm --prefix frontend run build` regenerates SEO pages before Vite build.
- [x] Public simulation pages:
  - [x] `/simulations/creative-testing/`
  - [x] `/simulations/price-optimization/`
  - [x] `/simulations/product-launch/`
  - [x] `/simulations/value-proposition/`
  - [x] `/simulations/market-segmentation/`
  - [x] `/simulations/competitive-positioning/`
  - [x] `/simulations/brand-perception/`
  - [x] `/simulations/churn-prediction/`
  - [x] `/simulations/campaign-strategy/`
- [x] Public comparison pages:
  - [x] `/compare/market-research-vs-ai-simulation/`
  - [x] `/compare/survey-vs-persona-simulation/`
  - [x] `/compare/user-interview-vs-ai-simulation/`
- [x] Sitemap now includes root, validation, three use-case pages, nine simulation pages, and three comparison pages.
- [x] Landing footer links to core simulation and comparison pages without adding complexity to the primary nav.
- [x] `src/api/main.py` public path allowlist includes `/simulations/*` and `/compare/*`.

## 3. Deferred / External

- [ ] Google Search Console property verification and sitemap submission.
  - Requires the owner's Google account access.
  - Sitemap is ready at `https://arabesque.cc/sitemap.xml`.
- [ ] Real billing/organization SEO pages.
- [ ] WebP/AVIF conversion if a converter is added to the build toolchain.

## 4. Validation Log

- [x] 2026-06-03: `uv run pytest tests/test_api_auth.py::test_seo_public_paths_bypass_auth_middleware tests/test_api_app.py::test_static_seo_files_directory_index_head_and_cache` passed.
- [x] 2026-06-03: `uv run ruff check src tests` passed.
- [x] 2026-06-03: `npm --prefix frontend run typecheck` passed.
- [x] 2026-06-03: `npm --prefix frontend run build` passed.
- [x] 2026-06-03: Programmatic SEO page generation created 9 simulation pages, 3 comparison pages, and an expanded sitemap.
