/** Country-aware persona name/sex display helpers for multi-country Nemotron rows. */

const NAME_FIELDS = ['name', 'persona_name', 'full_name', 'korean_name'] as const
const NARRATIVE_FIELDS = [
  'persona',
  'professional_persona',
  'family_persona',
  'arts_persona',
  'cultural_background',
] as const

const NAMES_F = [
  '강순녀', '나순희', '장화영', '유복연', '안혜영', '박미정', '조승희', '오은숙',
  '정경희', '김명숙', '최영숙', '위영래', '정성임', '이도화', '강은채',
]
const NAMES_M = [
  '이재호', '임병태', '손동하', '봉수훈', '오민영', '이성기', '권상운', '백용일',
  '유상연', '송영범', '장남식', '이태호', '최옥남', '정승현', '이찬종',
]

const NAME_BLOCKLIST = new Set([
  'a', 'an', 'at', 'con', 'da', 'de', 'des', 'do', 'el', 'em', 'en', 'from',
  'in', 'la', 'le', 'les', 'na', 'no', 'on', 'para', 'por', 'su', 'the',
  'um', 'uma', 'un', 'une', 'with',
])

const MALE_VALUES = new Set([
  '남자', '남성', '남', 'male', 'm', 'man', 'masculino', 'masculin', 'homme',
  'nam', 'mann', 'mannelijk', '男性', '男',
])
const FEMALE_VALUES = new Set([
  '여자', '여성', '여', 'female', 'f', 'woman', 'feminino', 'femenino', 'féminin',
  'femme', 'nữ', 'vrouw', 'vrouwelijk', 'frau', '女性', '女',
])

const KR_NAME = /^([가-힣]{2,4})\s*씨/
const JP_NAME = /^([\u3040-\u30ff\u3400-\u9fff々〆ヶー\s]{2,20}?)は(?:[、,]|\s|$)/
const LATIN_NAME =
  /^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})(?=\s*[,，]|\s+(?:is|was|has|fuses|channels|blends|combines|combina|é|est|unit|allie|incarne|known|balances|prefers|finds|fuels|showcases|aims)\b)/
const LATIN_SINGLE =
  /^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{1,24})(?=\s*[,，]|\s+(?:is|was|has|é|est)\b)/
const VN_NAME =
  /^([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^\s,]{0,24}(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][^\s,]{0,24}){1,4})\s*,/
const ES_MID_NAME =
  /,\s*([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’.-]+(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’.-]+){1,3}),\s*a\s+sus\b/

export type SexCategory = 'male' | 'female' | 'unknown'

export function sexCategory(sex: unknown): SexCategory {
  if (sex === null || sex === undefined) return 'unknown'
  const text = String(sex).trim()
  if (!text) return 'unknown'
  const lowered = text.toLocaleLowerCase('en-US')
  if (MALE_VALUES.has(lowered) || MALE_VALUES.has(text)) return 'male'
  if (FEMALE_VALUES.has(lowered) || FEMALE_VALUES.has(text)) return 'female'
  if (/(male|mascul|homme|남자|남성|男)/i.test(text) && !/(female|여성|여자)/i.test(text)) {
    return 'male'
  }
  if (/(female|femin|femme|여자|여성|女)/i.test(text)) return 'female'
  return 'unknown'
}

export function isMaleLabel(label: string): boolean {
  return sexCategory(label) === 'male'
}

export function isFemaleLabel(label: string): boolean {
  return sexCategory(label) === 'female'
}

export function sexShortLabel(sex: unknown): string {
  const category = sexCategory(sex)
  if (category === 'male') return '남'
  if (category === 'female') return '여'
  return '미상'
}

export function normalizeGenderDisplayLabel(label: string): string {
  const category = sexCategory(label)
  if (category === 'male') return '남성'
  if (category === 'female') return '여성'
  return label
}

export function extractNameFromNarrative(text: string): string | null {
  const raw = (text || '').trim()
  if (!raw) return null
  const sample = raw.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ')

  for (const pattern of [KR_NAME, JP_NAME, VN_NAME, LATIN_NAME, LATIN_SINGLE]) {
    const match = pattern.exec(sample)
    if (match) {
      const cleaned = cleanName(match[1])
      if (cleaned) return cleaned
    }
  }
  const mid = ES_MID_NAME.exec(sample)
  if (mid) {
    const cleaned = cleanName(mid[1])
    if (cleaned) return cleaned
  }
  return null
}

export function extractPersonaName(persona: Record<string, unknown> | null | undefined): string | null {
  if (!persona || typeof persona !== 'object') return null
  for (const key of NAME_FIELDS) {
    const value = persona[key]
    if (typeof value === 'string') {
      const cleaned = cleanName(value)
      if (cleaned) return cleaned
    }
  }
  for (const key of NARRATIVE_FIELDS) {
    const value = persona[key]
    if (typeof value === 'string' && value.trim()) {
      const found = extractNameFromNarrative(value)
      if (found) return found
    }
  }
  return null
}

export function personaDisplayName(
  persona: Record<string, unknown> | null | undefined,
  uuid = '',
): string {
  const found = extractPersonaName(persona)
  if (found) return found

  const short = (uuid || '').replace(/-/g, '').slice(0, 4) || '????'
  const country = String(persona?._country_id ?? persona?.country_id ?? '').toLowerCase()
  const sex = typeof persona?.sex === 'string' ? persona.sex : ''
  if (!country || country === 'kr') {
    return syntheticKoreanName(uuid || short, sex)
  }
  return `Persona ${short}`
}

/** @deprecated Prefer personaDisplayName(persona, uuid). Kept for call sites that only have uuid+sex. */
export function displayName(seed: string, sex: string): string {
  return syntheticKoreanName(seed, sex)
}

function syntheticKoreanName(seed: string, sex: string): string {
  const category = sexCategory(sex)
  const pool = category === 'female' ? NAMES_F : category === 'male' ? NAMES_M : [...NAMES_F, ...NAMES_M]
  if (!seed) return pool[0]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return pool[hash % pool.length]
}

function cleanName(value: string): string | null {
  const cleaned = value.replace(/\s+/g, ' ').trim().replace(/^[\s,.;:·]+|[\s,.;:·]+$/g, '')
  if (!cleaned || cleaned.length > 48) return null
  const tokens = cleaned.split(' ')
  if (!tokens.length) return null
  if (NAME_BLOCKLIST.has(tokens[0].toLocaleLowerCase('en-US'))) return null
  if (/^[0-9a-fA-F-]{8,}$/.test(cleaned)) return null
  return cleaned
}
