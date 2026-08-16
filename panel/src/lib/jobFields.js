// Heuristic (regex-based, no AI) extraction of a few fields that are
// usually buried in free-text job descriptions rather than structured
// fields. Every result includes the matched source sentence as `evidence`
// so the user can sanity-check it rather than trust the label blindly, plus
// a short `searchTerm` — the specific phrase that triggered the match,
// used to scroll/highlight it on the actual page (the full `evidence` can
// be long/multi-line and span multiple DOM nodes, so it isn't reliable to
// search for directly).

function splitIntoSentences(text) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9•-])/))
    .map((s) => s.trim())
    .filter(Boolean)
}

function findSentence(sentences, pattern) {
  return sentences.find((s) => pattern.test(s)) ?? null
}

const CLEARANCE_PATTERNS = [
  /security clearance/i,
  /\btop secret\b/i,
  /\bts\/sci\b/i,
  /\bpublic trust\b/i,
  /\bsecret clearance\b/i,
  /clearance (required|preferred|eligible|eligibility)/i,
  /able to obtain (a |an )?(security )?clearance/i,
  /active clearance/i,
  /\bpolygraph\b/i,
]

function detectClearance(sentences) {
  for (const pattern of CLEARANCE_PATTERNS) {
    const sentence = findSentence(sentences, pattern)
    if (sentence) {
      const searchTerm = sentence.match(pattern)?.[0] ?? sentence
      return { status: 'Mentioned', evidence: sentence, searchTerm }
    }
  }
  return { status: 'Not mentioned', evidence: null, searchTerm: null }
}

const SPONSOR_MENTION = /\bsponsor(ship|ing|s)?\b/i
const SPONSOR_NEGATION =
  /\b(not|unable to|cannot|can't|won't|will not|does not|doesn't|no longer|no)\b/i
const SPONSOR_POSITIVE =
  /\b(will sponsor|able to sponsor|open to sponsor|sponsorship (is |are )?available|do sponsor|happy to sponsor|can sponsor|sponsors? (visas?|candidates?))\b/i

function detectSponsorship(sentences) {
  const sentence = findSentence(sentences, SPONSOR_MENTION)
  if (!sentence) return { status: 'Not mentioned', evidence: null, searchTerm: null }
  const searchTerm = sentence.match(SPONSOR_MENTION)?.[0] ?? 'sponsor'
  if (SPONSOR_NEGATION.test(sentence)) {
    return { status: 'Not available', evidence: sentence, searchTerm }
  }
  if (SPONSOR_POSITIVE.test(sentence)) {
    return { status: 'Available', evidence: sentence, searchTerm }
  }
  return { status: 'Mentioned — check manually', evidence: sentence, searchTerm }
}

const YOE_PATTERNS = [
  /(\d{1,2})\+?\s*(?:-|–|to)\s*(\d{1,2})\+?\s*years?/i,
  /minimum(?:\s+of)?\s+(\d{1,2})\+?\s*years?/i,
  /(\d{1,2})\+\s*years?/i,
  /(\d{1,2})\s*years?(?:\s+of)?\s+(?:relevant\s+)?experience/i,
]

function detectExpectedYOE(text, sentences) {
  for (const pattern of YOE_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const status = match[2]
      ? `${match[1]}–${match[2]} years`
      : `${match[1]}+ years`
    const evidence = sentences.find((s) => s.includes(match[0])) ?? match[0]
    return { status, evidence, searchTerm: match[0] }
  }
  return { status: 'Not mentioned', evidence: null, searchTerm: null }
}

const PREFERRED_HEADING =
  /^\s*(preferred qualifications?|preferred skills?|preferred experience|nice to have|bonus points?)\s*:?\s*$/im
const NEXT_SECTION_HEADING =
  /^\s*(required qualifications?|requirements?|responsibilities|about (the )?(company|us|role)|what you.?ll (do|need)|minimum qualifications?|qualifications|benefits|compensation|how to apply)\s*:?\s*$/im

const CITIZENSHIP_PATTERNS = [
  /\bu\.?s\.?\s*citizen(ship)?\b/i,
  /\bmust be authorized to work\b/i,
  /\bwithout sponsorship\b/i,
  /\bgreen card\b/i,
  /\bpermanent resident\b/i,
]

function detectPreferred(text, sentences) {
  const headingMatch = text.match(PREFERRED_HEADING)
  let status = 'Not mentioned'
  let evidence = null
  let searchTerm = null

  if (headingMatch) {
    const rest = text.slice(headingMatch.index + headingMatch[0].length)
    const nextHeading = rest.match(NEXT_SECTION_HEADING)
    const block = (nextHeading ? rest.slice(0, nextHeading.index) : rest)
      .trim()
      .slice(0, 500)
    status = 'Mentioned'
    evidence = block
    searchTerm = headingMatch[0].trim()
  }

  const citizenshipNotes = CITIZENSHIP_PATTERNS.map((pattern) =>
    findSentence(sentences, pattern)
  ).filter(Boolean)

  return { status, evidence, searchTerm, citizenshipNotes }
}

export function analyzeJobFields(jdText) {
  const text = jdText || ''
  const sentences = splitIntoSentences(text)

  return {
    clearance: detectClearance(sentences),
    sponsorship: detectSponsorship(sentences),
    expectedYOE: detectExpectedYOE(text, sentences),
    preferred: detectPreferred(text, sentences),
  }
}
