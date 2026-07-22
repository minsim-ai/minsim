import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const publicDir = new URL("../public/", import.meta.url);
const baseUrl = "https://arabesque.cc";
const ogImage = `${baseUrl}/OG_image.png?v=20260603`;
const lastmod = "2026-06-03";

const simulations = [
  {
    slug: "creative-testing",
    eyebrow: "Creative Testing",
    title: "AI 크리에이티브 비교 시뮬레이션",
    description: "광고 카피, 랜딩 헤드라인, 캠페인 메시지를 한국인 AI 페르소나로 비교하고 선택 이유와 세그먼트 반응을 확인합니다.",
    h1: "광고 카피와 헤드라인을 배포 전에 비교하세요",
    intro: "여러 개의 광고 문구나 랜딩 헤드라인을 입력하면 Arabesque가 한국인 AI 페르소나 응답을 시뮬레이션해 선호도, 선택 이유, 세그먼트별 차이를 보여줍니다.",
    inputs: ["크리에이티브 후보 2~10개", "제품 또는 캠페인 설명", "타겟 고객 조건"],
    outputs: ["후보별 선택률", "선택 이유 TOP", "세그먼트별 반응 차이"],
    audience: ["퍼포먼스 마케터", "브랜드/콘텐츠 마케터", "랜딩 페이지를 개선하는 제품팀"],
  },
  {
    slug: "price-optimization",
    eyebrow: "Price Optimization",
    title: "AI 가격 최적화 시뮬레이션",
    description: "월 구독, SaaS, 신제품 가격 후보를 한국인 AI 페르소나로 비교하고 구매 의향, 거절 이유, 가격 저항을 확인합니다.",
    h1: "가격 후보를 실제 출시 전에 검증하세요",
    intro: "9,900원, 14,900원, 19,900원 같은 가격 후보를 입력하면 구매 의향과 거절 이유를 함께 분석해 가격 인하와 가치 증명 사이의 판단을 돕습니다.",
    inputs: ["제품명과 설명", "가격 후보 3~6개", "구매 상황과 경쟁 가격"],
    outputs: ["가격별 구매 의향", "조건부 구매 이유", "세그먼트별 가격 저항"],
    audience: ["SaaS 창업자", "PM/PO", "가격 정책을 바꾸려는 B2B 팀"],
  },
  {
    slug: "product-launch",
    eyebrow: "Product Launch",
    title: "AI 신제품 반응 시뮬레이션",
    description: "출시 전 제품 콘셉트, 주요 기능, 가격 범위를 한국인 AI 페르소나로 검증해 초기 반응과 리스크를 확인합니다.",
    h1: "신제품 출시 전 시장 반응을 먼저 확인하세요",
    intro: "제품 콘셉트와 주요 기능을 입력하면 페르소나별 매력도, 구매 장벽, 보완해야 할 메시지를 빠르게 확인할 수 있습니다.",
    inputs: ["제품 콘셉트", "주요 기능", "타겟 사용 상황", "예상 가격대"],
    outputs: ["출시 매력도", "구매 장벽", "추천 포지셔닝"],
    audience: ["신제품 PM", "초기 스타트업", "브랜드/상품기획 팀"],
  },
  {
    slug: "value-proposition",
    eyebrow: "Value Proposition",
    title: "AI 가치 제안 테스트",
    description: "여러 가치 제안 문구를 한국인 AI 페르소나로 비교해 어떤 메시지가 더 설득력 있는지 확인합니다.",
    h1: "가치 제안 문구의 설득력을 비교하세요",
    intro: "제품 설명과 가치 제안 후보를 입력하면 어떤 문구가 더 명확하고 신뢰를 주며 행동을 유도하는지 비교합니다.",
    inputs: ["제품 맥락", "가치 제안 후보 2~5개", "평가 기준"],
    outputs: ["가치 제안 순위", "설득 이유", "개선 방향"],
    audience: ["B2B SaaS 마케터", "랜딩/온보딩 담당자", "세일즈 메시지를 다듬는 팀"],
  },
  {
    slug: "market-segmentation",
    eyebrow: "Market Segmentation",
    title: "AI 시장 세분화 시뮬레이션",
    description: "카테고리와 핵심 질문을 입력해 한국 시장의 잠재 고객 세그먼트와 니즈 차이를 빠르게 탐색합니다.",
    h1: "시장 세그먼트를 빠르게 발견하세요",
    intro: "제품 카테고리와 핵심 질문을 입력하면 AI 페르소나 응답을 기반으로 니즈, 태도, 구매 장벽이 다른 세그먼트를 도출합니다.",
    inputs: ["카테고리", "제품군", "핵심 질문", "원하는 세그먼트 수"],
    outputs: ["세그먼트 프로필", "핵심 니즈", "우선 공략 집단"],
    audience: ["리서치 팀", "시장 진입 전략 담당자", "초기 ICP를 찾는 스타트업"],
  },
  {
    slug: "competitive-positioning",
    eyebrow: "Competitive Positioning",
    title: "AI 경쟁 포지셔닝 시뮬레이션",
    description: "경쟁 제품과 속성을 입력해 한국인 AI 페르소나가 인식하는 상대적 강점, 약점, 포지셔닝을 확인합니다.",
    h1: "경쟁 제품 사이에서 우리 위치를 확인하세요",
    intro: "경쟁 제품 정보와 비교 속성을 입력하면 선호 점유, 인식 차이, 차별화 포인트를 빠르게 파악합니다.",
    inputs: ["카테고리 설명", "경쟁 제품 2~5개", "비교 속성"],
    outputs: ["선호 점유", "속성별 강약점", "차별화 메시지"],
    audience: ["전략/마케팅 리더", "경쟁 분석 담당자", "포지셔닝을 재정의하는 팀"],
  },
  {
    slug: "brand-perception",
    eyebrow: "Brand Perception",
    title: "AI 브랜드 인지도 시뮬레이션",
    description: "브랜드명, 카테고리, 평가 속성을 입력해 한국인 AI 페르소나의 브랜드 이미지와 연상어를 확인합니다.",
    h1: "브랜드 이미지와 연상어를 빠르게 점검하세요",
    intro: "브랜드와 카테고리를 입력하면 신뢰, 품질, 가격, 혁신성 같은 속성별 인식과 자유 연상어를 확인합니다.",
    inputs: ["브랜드명", "카테고리", "평가 속성", "맥락 설명"],
    outputs: ["속성별 인식", "연상어", "브랜드 리스크"],
    audience: ["브랜드 마케터", "PR/커뮤니케이션 팀", "리브랜딩을 준비하는 팀"],
  },
  {
    slug: "churn-prediction",
    eyebrow: "Churn Prediction",
    title: "AI 이탈 예측 시뮬레이션",
    description: "가격 인상, 경쟁사 제안, 서비스 변화 상황에서 고객 이탈 위험과 유지 메시지를 시뮬레이션합니다.",
    h1: "이탈 위험과 유지 메시지를 미리 확인하세요",
    intro: "현재 상황과 트리거 이벤트를 입력하면 어떤 고객 세그먼트가 이탈 위험이 높은지, 어떤 유지 메시지가 필요한지 확인합니다.",
    inputs: ["서비스명", "현재 상황", "이탈 트리거", "경쟁사 제안"],
    outputs: ["이탈 의향", "고위험 세그먼트", "유지 메시지"],
    audience: ["CRM/그로스 팀", "구독 서비스 운영자", "가격 인상 전 리스크를 보는 팀"],
  },
  {
    slug: "campaign-strategy",
    eyebrow: "Campaign Strategy",
    title: "AI 캠페인 전략 시뮬레이션",
    description: "채널과 메시지 조합을 한국인 AI 페르소나로 비교해 예산 배분과 캠페인 우선순위를 정합니다.",
    h1: "채널과 메시지 조합을 캠페인 전에 비교하세요",
    intro: "여러 채널과 메시지 후보를 입력하면 도달 효과, 설득력, 예산 효율 관점에서 캠페인 조합을 비교합니다.",
    inputs: ["제품 맥락", "채널 후보", "메시지 후보", "예산"],
    outputs: ["채널×메시지 순위", "예산 배분 힌트", "캠페인 리스크"],
    audience: ["캠페인 매니저", "퍼포먼스 마케터", "신제품 런칭 팀"],
  },
];

const comparisons = [
  {
    slug: "market-research-vs-ai-simulation",
    title: "전통 시장조사 vs AI 페르소나 시뮬레이션",
    description: "전통 시장조사와 AI 페르소나 시뮬레이션의 비용, 속도, 샘플, 한계를 비교하고 어떤 상황에서 함께 써야 하는지 정리합니다.",
    h1: "전통 시장조사와 AI 시뮬레이션은 언제 다르게 써야 할까요?",
    intro: "Arabesque는 시장조사를 대체하는 만능 도구가 아니라, 실제 조사 전에 검증할 가치가 큰 가설을 좁히는 제품 QA/리서치 보조 레이어입니다.",
    rows: [
      ["비용", "수천 원~수만 원 단위 반복", "수천만 원 이상"],
      ["속도", "수분~수십 분", "수주~수개월"],
      ["강점", "가설 우선순위화와 빠른 반복", "실제 사람의 법적/통계적 근거"],
      ["주의점", "절대 수치보다 상대 순위 중심", "느리고 비싸 반복이 어려움"],
    ],
  },
  {
    slug: "survey-vs-persona-simulation",
    title: "설문조사 vs AI 페르소나 시뮬레이션",
    description: "설문조사와 AI 페르소나 시뮬레이션의 차이를 비교하고, 설문 전에 질문과 보기 후보를 다듬는 방법을 설명합니다.",
    h1: "설문조사 전에 AI 시뮬레이션으로 질문을 다듬으세요",
    intro: "설문은 실제 응답을 얻는 강점이 있지만 질문 설계가 틀리면 비용이 낭비됩니다. AI 시뮬레이션은 설문 전 보기, 가격 후보, 메시지 후보를 빠르게 줄이는 데 적합합니다.",
    rows: [
      ["목적", "질문/보기 후보 사전 점검", "실제 응답 수집"],
      ["반복", "여러 번 빠르게 가능", "패널/예산 제약"],
      ["출력", "응답 이유와 세그먼트 힌트", "통계 표본과 응답률"],
      ["추천 조합", "시뮬레이션으로 설문안을 정리한 뒤 설문 실행", "최종 검증"],
    ],
  },
  {
    slug: "user-interview-vs-ai-simulation",
    title: "사용자 인터뷰 vs AI 페르소나 시뮬레이션",
    description: "사용자 인터뷰와 AI 페르소나 시뮬레이션을 함께 쓰는 방법을 설명합니다. 인터뷰 전에 어떤 가설을 더 깊게 볼지 좁힙니다.",
    h1: "사용자 인터뷰 전에 깊게 볼 가설을 먼저 좁히세요",
    intro: "인터뷰는 깊은 맥락을 얻는 데 강하지만 N이 작고 리소스가 큽니다. AI 시뮬레이션은 인터뷰 전에 넓은 가설 지도를 만들고 질문 슬롯을 보강하는 데 적합합니다.",
    rows: [
      ["강점", "넓은 표본 방향성 탐색", "깊은 동기와 맥락"],
      ["약점", "실제 고객 확증은 아님", "시간과 섭외 비용"],
      ["좋은 사용법", "인터뷰 가이드와 가격/메시지 후보 정리", "시뮬레이션에서 나온 의문 확인"],
      ["결론", "지도", "현장 확인"],
    ],
  },
];

const existingUseCases = [
  "/use-cases/price-optimization/",
  "/use-cases/creative-testing/",
  "/use-cases/market-research/",
];

const simulationLinks = simulations.map((item) => ({
  href: `/simulations/${item.slug}/`,
  label: item.title.replace(" | Arabesque", ""),
}));

const compareLinks = comparisons.map((item) => ({
  href: `/compare/${item.slug}/`,
  label: item.title,
}));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageShell({ title, description, canonical, eyebrow, h1, intro, body, jsonLd }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} | Arabesque</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Arabesque" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${ogImage}" />
    <meta name="twitter:card" content="summary_large_image" />
    <style>
      body{margin:0;background:#05070C;color:#f8fafc;font-family:Pretendard,system-ui,sans-serif;line-height:1.7}
      main{max-width:1040px;margin:0 auto;padding:72px 24px}a{color:#7FB3FF}.eyebrow{color:#7FB3FF;font-weight:800;font-size:13px;text-transform:uppercase}
      h1{font-size:clamp(38px,6vw,68px);line-height:1.08;margin:16px 0 24px;letter-spacing:-.02em}h2{font-size:28px;margin:56px 0 16px}p,li,td,th{color:#CED5E1;font-size:17px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}.card{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:20px;background:#0A1128}
      .cta{display:inline-block;margin-top:28px;padding:13px 20px;border-radius:999px;background:#0F68F6;color:#FFFFFF;font-weight:900;text-decoration:none}
      nav{display:flex;flex-wrap:wrap;gap:12px;margin:40px 0 0}nav a{font-size:14px;text-decoration:none;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:7px 12px}
      table{width:100%;border-collapse:collapse;margin-top:24px;background:#0A1128;border:1px solid rgba(255,255,255,.14);border-radius:12px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid rgba(255,255,255,.1);padding:14px}
      footer{margin-top:72px;padding-top:24px;border-top:1px solid rgba(255,255,255,.14);color:#94a3b8;font-size:14px}
    </style>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>
  <body>
    <main>
      <a href="/" aria-label="Arabesque 홈">Arabesque</a>
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(h1)}</h1>
      <p>${escapeHtml(intro)}</p>
      <a class="cta" href="/app">무료 데모 시작하기</a>
      ${body}
      <section>
        <h2>관련 페이지</h2>
        <nav aria-label="관련 SEO 페이지">
          ${[...simulationLinks.slice(0, 5), ...compareLinks].map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join("\n          ")}
        </nav>
      </section>
      <footer>© 2026 Arabesque. NVIDIA Nemotron-Personas-Korea 기반 AI 페르소나 시뮬레이션.</footer>
    </main>
  </body>
</html>
`;
}

function simulationPage(item) {
  const canonical = `${baseUrl}/simulations/${item.slug}/`;
  const body = `
      <section>
        <h2>입력 예시</h2>
        <div class="grid">${item.inputs.map((text) => `<div class="card"><strong>${escapeHtml(text)}</strong><p>시뮬레이션 맥락에 맞게 한 문장으로 입력할 수 있습니다.</p></div>`).join("")}</div>
      </section>
      <section>
        <h2>결과 예시</h2>
        <div class="grid">${item.outputs.map((text) => `<div class="card"><strong>${escapeHtml(text)}</strong><p>결과 보고서에서 방향성, 이유, 다음 액션으로 정리됩니다.</p></div>`).join("")}</div>
      </section>
      <section>
        <h2>추천 대상</h2>
        <ul>${item.audience.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>
      </section>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: item.title,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: canonical,
    description: item.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  };
  return pageShell({ ...item, canonical, body, jsonLd });
}

function comparePage(item) {
  const canonical = `${baseUrl}/compare/${item.slug}/`;
  const body = `
      <section>
        <h2>핵심 비교</h2>
        <table>
          <thead><tr><th>항목</th><th>AI 페르소나 시뮬레이션</th><th>비교 대상</th></tr></thead>
          <tbody>${item.rows.map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join("")}</tbody>
        </table>
      </section>
      <section>
        <h2>언제 Arabesque가 적합한가요?</h2>
        <ul>
          <li>실제 조사 전에 가설과 질문을 좁혀야 할 때</li>
          <li>가격, 메시지, 제품 콘셉트를 빠르게 반복 비교해야 할 때</li>
          <li>한국 시장 맥락의 세그먼트별 반응 힌트가 필요할 때</li>
        </ul>
      </section>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: item.h1,
        acceptedAnswer: { "@type": "Answer", text: item.intro },
      },
      {
        "@type": "Question",
        name: "AI 시뮬레이션 결과만으로 의사결정해도 되나요?",
        acceptedAnswer: { "@type": "Answer", text: "중요한 외부 공유나 고위험 의사결정에는 실제 인터뷰, 설문, 전문가 검토와 함께 사용하는 것이 적합합니다." },
      },
    ],
  };
  return pageShell({ ...item, canonical, eyebrow: "Comparison", body, jsonLd });
}

function writePublicFile(path, content) {
  const fullPath = join(publicDir.pathname, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

for (const item of simulations) {
  writePublicFile(`simulations/${item.slug}/index.html`, simulationPage(item));
}

for (const item of comparisons) {
  writePublicFile(`compare/${item.slug}/index.html`, comparePage(item));
}

const sitemapUrls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/validation", priority: "0.5", changefreq: "monthly" },
  ...existingUseCases.map((loc) => ({ loc, priority: "0.9", changefreq: "weekly" })),
  ...simulations.map((item) => ({ loc: `/simulations/${item.slug}/`, priority: "0.85", changefreq: "weekly" })),
  ...comparisons.map((item) => ({ loc: `/compare/${item.slug}/`, priority: "0.8", changefreq: "weekly" })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((item) => `  <url>
    <loc>${baseUrl}${item.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

writePublicFile("sitemap.xml", sitemap);
console.log(`Generated ${simulations.length} simulation pages, ${comparisons.length} compare pages, and sitemap.xml`);
