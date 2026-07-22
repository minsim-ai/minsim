export type CountryMapConfig = {
  countryId: string
  countryNameKo: string
  mapUrl: string
  pathRegionAliases?: Record<string, readonly string[]>
  sourceLabel: string
  sourceUrl?: string
}

const JAPAN_PREFECTURES: Record<string, readonly string[]> = {
  'JP-01': ['北海道'],
  'JP-02': ['青森県'],
  'JP-03': ['岩手県'],
  'JP-04': ['宮城県'],
  'JP-05': ['秋田県'],
  'JP-06': ['山形県'],
  'JP-07': ['福島県'],
  'JP-08': ['茨城県'],
  'JP-09': ['栃木県'],
  'JP-10': ['群馬県'],
  'JP-11': ['埼玉県'],
  'JP-12': ['千葉県'],
  'JP-13': ['東京都'],
  'JP-14': ['神奈川県'],
  'JP-15': ['新潟県'],
  'JP-16': ['富山県'],
  'JP-17': ['石川県'],
  'JP-18': ['福井県'],
  'JP-19': ['山梨県'],
  'JP-20': ['長野県'],
  'JP-21': ['岐阜県'],
  'JP-22': ['静岡県'],
  'JP-23': ['愛知県'],
  'JP-24': ['三重県'],
  'JP-25': ['滋賀県'],
  'JP-26': ['京都府'],
  'JP-27': ['大阪府'],
  'JP-28': ['兵庫県'],
  'JP-29': ['奈良県'],
  'JP-30': ['和歌山県'],
  'JP-31': ['鳥取県'],
  'JP-32': ['島根県'],
  'JP-33': ['岡山県'],
  'JP-34': ['広島県'],
  'JP-35': ['山口県'],
  'JP-36': ['徳島県'],
  'JP-37': ['香川県'],
  'JP-38': ['愛媛県'],
  'JP-39': ['高知県'],
  'JP-40': ['福岡県'],
  'JP-41': ['佐賀県'],
  'JP-42': ['長崎県'],
  'JP-43': ['熊本県'],
  'JP-44': ['大分県'],
  'JP-45': ['宮崎県'],
  'JP-46': ['鹿児島県'],
  'JP-47': ['沖縄県'],
}

const COUNTRY_MAPS: Record<string, CountryMapConfig> = {
  kr: {
    countryId: 'kr',
    countryNameKo: '대한민국',
    mapUrl: '/maps/korea-provinces.svg?v=1',
    sourceLabel: '대한민국 시도 경계',
  },
  us: {
    countryId: 'us',
    countryNameKo: '미국',
    mapUrl: '/maps/us-regions.v1.svg',
    sourceLabel: 'geoBoundaries USA ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  jp: {
    countryId: 'jp',
    countryNameKo: '일본',
    mapUrl: '/maps/jp-regions.v1.svg',
    pathRegionAliases: JAPAN_PREFECTURES,
    sourceLabel: 'geoBoundaries Japan ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  in: {
    countryId: 'in',
    countryNameKo: '인도',
    mapUrl: '/maps/in-regions.v1.svg',
    pathRegionAliases: {
      'IN-AN': ['Andaman & Nicobar Islands', 'Andaman Aur Nicobar Dweep Samuh', 'अंडमान और निकोबार द्वीप समूह'],
      'IN-AP': ['Andhra Pradesh', 'आंध्र प्रदेश'],
      'IN-AR': ['Arunachal Pradesh', 'अरुणाचल प्रदेश'],
      'IN-AS': ['Assam', 'असम'],
      'IN-BR': ['Bihar', 'बिहार'],
      'IN-CH': ['Chandigarh', 'चंडीगढ़'],
      'IN-CT': ['Chhattisgarh', 'छत्तीसगढ'],
      'IN-DH': [
        'Dadra & Nagar Haveli',
        'Dadra Aur Nagar Haveli',
        'Daman & Diu',
        'Daman Aur Diu',
        'दादरा और नगर हवेली',
        'दमन और दीव',
      ],
      'IN-DL': ['Delhi', 'Dilli', 'दिल्ली'],
      'IN-GA': ['Goa', 'गोवा'],
      'IN-GJ': ['Gujarat', 'गुजरात'],
      'IN-HR': ['Haryana', 'हरियाणा'],
      'IN-HP': ['Himachal Pradesh', 'हिमाचल प्रदेश'],
      'IN-JK': ['Jammu & Kashmir', 'Jammu Aur Kashmir', 'जम्मू और कश्मीर'],
      'IN-JH': ['Jharkhand', 'झारखंड'],
      'IN-KA': ['Karnataka', 'कर्नाटक'],
      'IN-KL': ['Kerala', 'केरल'],
      'IN-LD': ['Lakshadweep', 'लक्षद्वीप'],
      'IN-MP': ['Madhya Pradesh', 'मध्य प्रदेश'],
      'IN-MH': ['Maharashtra', 'महाराष्ट्र'],
      'IN-MN': ['Manipur', 'मणिपुर'],
      'IN-ML': ['Meghalaya', 'मेघालय'],
      'IN-MZ': ['Mizoram', 'मिज़ोरम'],
      'IN-NL': ['Nagaland', 'नागालैंड'],
      'IN-OR': ['Odisha', 'ओडिशा'],
      'IN-WB': ['West Bengal', 'Pashchim Bengal', 'पश्चिम बंगाल'],
      'IN-PY': ['Puducherry', 'पुदुचेरी'],
      'IN-PB': ['Punjab', 'पंजाब'],
      'IN-RJ': ['Rajasthan', 'राजस्थान'],
      'IN-SK': ['Sikkim', 'सिक्किम'],
      'IN-TN': ['Tamil Nadu', 'तमिलनाडु'],
      'IN-TG': ['Telangana', 'तेलंगाना'],
      'IN-TR': ['Tripura', 'त्रिपुरा'],
      'IN-UP': ['Uttar Pradesh', 'उत्तर प्रदेश'],
      'IN-UT': ['Uttarakhand', 'उत्तराखण्ड'],
    },
    sourceLabel: 'geoBoundaries India ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  br: {
    countryId: 'br',
    countryNameKo: '브라질',
    mapUrl: '/maps/br-regions.v1.svg',
    pathRegionAliases: {
      'BR-RN': ['Rio Grande do Norte'],
      'BR-RJ': ['Rio de Janeiro'],
    },
    sourceLabel: 'geoBoundaries Brazil ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  fr: {
    countryId: 'fr',
    countryNameKo: '프랑스',
    mapUrl: '/maps/fr-regions.v1.svg',
    sourceLabel: 'geoBoundaries France ADM2',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  sg: {
    countryId: 'sg',
    countryNameKo: '싱가포르',
    mapUrl: '/maps/sg-regions.v1.svg',
    sourceLabel: 'geoBoundaries Singapore ADM2',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  vn: {
    countryId: 'vn',
    countryNameKo: '베트남',
    mapUrl: '/maps/vn-regions.v1.svg',
    pathRegionAliases: {
      'VN-CT': ['Thành Phố Cần Thơ'],
      'VN-HP': ['Thành Phố Hải Phòng'],
      'VN-SG': ['Thành Phố Hồ Chí Minh'],
      'VN-DN': ['Thành Phố Đà Nẵng'],
      'VN-HN': ['Thủ Đô Hà Nội'],
      'VN-39': ['Tỉnh Đồng Nai'],
      'VN-43': ['Bà Rịa–Vũng Tàu'],
      'VN-43-con-dao': ['Bà Rịa–Vũng Tàu'],
    },
    sourceLabel: 'geoBoundaries Vietnam ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  sv: {
    countryId: 'sv',
    countryNameKo: '엘살바도르',
    mapUrl: '/maps/sv-regions.v1.svg',
    sourceLabel: 'geoBoundaries El Salvador ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
  be: {
    countryId: 'be',
    countryNameKo: '벨기에',
    mapUrl: '/maps/be-regions.v1.svg',
    pathRegionAliases: {
      BRU: ['Brussel', 'Brussels', 'Bruxelles', 'Brüssel'],
      VLG: ['Vlaanderen', 'Flanders', 'Flandre', 'Flandern'],
      WAL: ['Wallonië', 'Wallonie', 'Wallonia', 'Wallonien'],
    },
    sourceLabel: 'geoBoundaries Belgium ADM1',
    sourceUrl: 'https://www.geoboundaries.org/',
  },
}

export function getCountryMapConfig(countryId: string): CountryMapConfig | null {
  return COUNTRY_MAPS[countryId.trim().toLowerCase()] ?? null
}

export function getPathRegionCandidates(
  config: CountryMapConfig,
  pathId: string,
  pathName: string,
): string[] {
  const aliases = config.pathRegionAliases?.[pathId]
    ?? config.pathRegionAliases?.[pathName]
    ?? []
  const suffix = /^[A-Z]{2}-[A-Z0-9]+$/.test(pathId)
    ? pathId.slice(pathId.lastIndexOf('-') + 1)
    : ''
  return [...aliases, pathName, suffix, pathId].filter(Boolean)
}

export function regionKeyMatchesPath(
  countryId: string,
  regionName: string,
  pathId: string,
  pathName: string,
): boolean {
  const config = getCountryMapConfig(countryId)
  const regionKey = normalizeRegionKey(regionName)
  return Boolean(config && regionKey && getPathRegionCandidates(config, pathId, pathName)
    .some((candidate) => normalizeRegionKey(candidate) === regionKey))
}

export function normalizeRegionKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(departamento de|thanh pho|thu do|tinh)\s+/u, '')
    .replace(/\s+(prefecture|city)$/u, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}
