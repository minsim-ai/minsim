# OG 이미지 프롬프트 - Arabesque

**규격**: 1200 × 630px (OG 표준)  
**용도**: 링크 공유 시 SNS·메신저 미리보기 (LinkedIn, KakaoTalk, Slack, Twitter 등)

---

## 컨셉 방향 (3가지)

### A. 페르소나 네트워크형 ★ 추천

수천 개의 작은 사람 아이콘이 흩어져 있다가 오른쪽에서 하나의 데이터 차트로 수렴하는 구조.  
"많은 한국인 → 하나의 인사이트"를 시각화.

### B. 대시보드 UI형

실제 결과 화면처럼 도넛 차트·바 그래프가 보이는 미니멀 UI 목업.  
제품이 뭔지 즉시 이해됨. 클릭률 높음.

### C. 미니멀 타이포그래피형

텍스트와 컬러만으로 구성. 가장 빠르게 제작 가능.

---

## Midjourney 프롬프트

### A. 페르소나 네트워크형

```
OG image for a B2B SaaS product, 1200x630px landscape, dark navy background (#0D1117), 
thousands of tiny minimalist human silhouette icons scattered across the left side, 
gradually converging into a clean donut chart and bar graph on the right side, 
connected by thin glowing blue lines (#0066FF), 
color palette: deep navy, electric blue, white, subtle warm gradient on icons, 
flat design no gradients on background, modern tech aesthetic, 
empty space in upper left for text overlay, 
cinematic lighting, ultra clean, professional SaaS, 16:9 ratio
--ar 16:9 --style raw --v 6
```

### B. 대시보드 UI형

```
Clean minimal SaaS dashboard UI, OG image 1200x630px, dark navy background, 
floating UI card with donut chart showing Korean demographic segments (age, region, job), 
small percentage labels in Korean, bar graphs with blue accent colors, 
subtle glow effect on charts, glassmorphism card, 
one large number "58" with "seconds" label visible, 
modern B2B product design, Pretendard-style sans-serif, 
empty upper left area reserved for branding text,
--ar 16:9 --style raw --v 6
```

### C. 미니멀 타이포그래피형

```
Minimalist OG banner image, 1200x630px, split layout, 
left 60% solid dark navy (#0D1117) with reserved white space for text, 
right 40% abstract Korean peninsula outline made of tiny glowing dots (#0066FF), 
dots forming the shape of a simplified Korea map silhouette, 
clean sans-serif type region on left, 
subtle noise texture overlay, flat modern design, no gradients,
--ar 16:9 --style raw --v 6
```

---

## DALL-E 3 프롬프트 (ChatGPT 사용 시)

```
Create a professional OG (Open Graph) image for a Korean B2B SaaS product called Arabesque. 
Size: 1200x630px landscape format.

Visual concept: On a deep dark navy background, show hundreds of small minimalist human 
silhouette icons on the left side, connected by thin glowing blue lines that flow toward 
a clean data visualization (pie chart and bar chart) on the right side. 
The overall feel should be "many Korean voices becoming one clear insight."

Color palette: #0D1117 (background), #0066FF (accent blue), white, light gray.
Style: Clean, modern, professional SaaS. No clutter. Flat design.
Leave the upper-left area clear for text overlay (brand name and tagline will be added separately).
No text in the image itself.
```

---

## 텍스트 오버레이 스펙 (이미지 생성 후 Figma/Canva에서 추가)

```
[상단 좌측]
폰트: Pretendard ExtraBold or WantedSans Bold
텍스트 1: Arabesque  (크기 48~56px, 흰색)
텍스트 2: 출시 전에 한국 시장 반응을 확인하세요  (크기 24px, 연회색 #B0B8C1)

[하단 좌측]
텍스트: arabesque.cc  (크기 18px, Primary Blue #0066FF)

[선택: 뱃지]
"최대 1만 명 가상 한국인 피드백"을 pill 형태 뱃지로
배경: #0066FF, 텍스트: 흰색, border-radius: 999px
```

---

## 빠른 제작 옵션 (AI 없이)

**Canva 사용 시:**
1. 1200×630 새 디자인
2. 배경색 `#0D1117`
3. 우측에 Canva 내장 "사람 아이콘" 반복 배치 + 파란색 적용
4. 텍스트 오버레이 위 스펙대로 적용
5. 제작 시간 약 15분

**Vercel OG / satori 사용 시 (코드 기반):**
`arabesque.cc/api/og` 라우트로 동적 생성 가능.  
Next.js `@vercel/og` 패키지 활용.
