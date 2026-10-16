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
  /clearance\s+(?:(?:is|not)\s+)*(required|preferred|eligible|eligibility|needed|mandatory|optional)/i,
  /able to obtain (a |an )?(security )?clearance/i,
  /active clearance/i,
  /\bpolygraph\b/i,
]

function detectClearance(sentences) {
  const matches = []
  for (const sentence of sentences) {
    const pattern = CLEARANCE_PATTERNS.find((candidate) => candidate.test(sentence))
    if (!pattern) continue
    let status = 'Mentioned — check manually'
    if (/\b(?:no|without)\s+(?:active\s+|security\s+|secret\s+)*clearance\s+(?:is\s+)?(?:required|needed|necessary|mandatory)\b|\bclearance\s+(?:is\s+)?not\s+(?:required|needed|necessary|mandatory)\b|\bnot required to (?:have|hold|obtain)\b/i.test(sentence)) {
      status = 'Not required'
    } else if (/\b(?:preferred|optional|desired|nice to have|a plus|not mandatory)\b/i.test(sentence) &&
        !/\b(?:must|required|mandatory|shall)\b/i.test(sentence)) {
      status = 'Preferred / optional'
    } else if (/\b(?:must|required|requires?|mandatory|shall|need to|condition of employment)\b/i.test(sentence) ||
        /\b(?:ability|able|eligible|eligibility) to (?:obtain|maintain)\b/i.test(sentence) ||
        /\bactive\s+(?:(?:security\s+|secret\s+|top secret\s+)?clearance|ts\/sci|top secret)\b/i.test(sentence)) {
      status = 'Required'
    }
    matches.push({ status, evidence: sentence, searchTerm: sentence.match(pattern)?.[0] ?? sentence })
  }
  const priority = ['Required', 'Mentioned — check manually', 'Preferred / optional', 'Not required']
  matches.sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))
  if (matches.length) return matches[0]
  return { status: 'Not mentioned', evidence: null, searchTerm: null }
}

const SPONSOR_MENTION = /\bsponsor(ship|ing|s)?\b/i
const SPONSOR_NEGATIONS = [
  /\b(?:unable to|not able to|cannot|can't|won't|will not|does not|doesn't|do not|don't|no longer|not)\s+(?:(?:currently|be able to|provide|offer|support|providing|offering)\s+)*(?:(?:visa|immigration)\s+)?sponsor(?:ship|ing|s)?\b/i,
  /\bno\s+(?:(?:visa|immigration)\s+)?sponsorship\b/i,
  /\bsponsorship\s+(?:(?:is|are|will be)\s+)?(?:not\s+(?:available|offered|provided|supported)|unavailable)\b/i,
]
const SPONSOR_POSITIVE =
  /\b(will sponsor|able to sponsor|open to sponsor|sponsorship (is |are )?available|do sponsor|happy to sponsor|can sponsor|sponsors? (visas?|candidates?))\b/i

function detectSponsorship(sentences) {
  const sentence = findSentence(sentences, SPONSOR_MENTION)
  if (!sentence) return { status: 'Not mentioned', evidence: null, searchTerm: null }
  const searchTerm = sentence.match(SPONSOR_MENTION)?.[0] ?? 'sponsor'
  if (SPONSOR_NEGATIONS.some((pattern) => pattern.test(sentence))) {
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

function detectExpectedYOE(text) {
  let section = 'other'
  const candidates = []
  for (const line of text.split(/\r?\n/)) {
    if (PREFERRED_HEADING.test(line)) {
      section = 'preferred'
      continue
    }
    if (NEXT_SECTION_HEADING.test(line)) {
      section = REQUIRED_HEADING.test(line) ? 'required' : 'other'
      continue
    }
    for (const sentence of splitIntoSentences(line)) {
      // Choose by position within the sentence, rather than by regex type.
      const matches = YOE_PATTERNS.map((pattern) => sentence.match(pattern))
        .filter(Boolean)
        .sort((a, b) => a.index - b.index || b[0].length - a[0].length)
      const match = matches[0]
      if (!match) continue
      const preferred = section === 'preferred' ||
        /\b(?:preferred|nice to have|bonus|a plus)\b/i.test(sentence)
      const required = section === 'required' ||
        /\b(?:minimum|at least|required|must)\b/i.test(sentence)
      const priority = preferred ? 2 : required ? 0 : 1
      candidates.push({
        priority,
        status: match[2] ? `${match[1]}–${match[2]} years` : `${match[1]}+ years`,
        evidence: sentence,
        searchTerm: match[0],
      })
    }
  }
  // Stable sorting preserves posting order for equally ranked requirements.
  candidates.sort((a, b) => a.priority - b.priority)
  if (candidates.length) {
    const { status, evidence, searchTerm } = candidates[0]
    return { status, evidence, searchTerm }
  }
  return { status: 'Not mentioned', evidence: null, searchTerm: null }
}

const PREFERRED_HEADING =
  /^\s*(preferred qualifications?|preferred skills?|preferred experience|nice to have|bonus points?)\s*:?\s*$/im
const NEXT_SECTION_HEADING =
  /^\s*(required qualifications?|requirements?|responsibilities|about (the )?(company|us|role)|what you.?ll (do|need)|minimum qualifications?|qualifications|benefits|compensation|how to apply)\s*:?\s*$/im
const REQUIRED_HEADING =
  /^\s*(required qualifications?|requirements?|what you.?ll need|minimum qualifications?|qualifications)\s*:?\s*$/i

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

  // One source sentence can match several eligibility rules; display it once.
  const citizenshipNotes = [...new Set(CITIZENSHIP_PATTERNS.map((pattern) =>
    findSentence(sentences, pattern)
  ).filter(Boolean))]

  return { status, evidence, searchTerm, citizenshipNotes }
}

export function analyzeJobFields(jdText) {
  const text = jdText || ''
  const sentences = splitIntoSentences(text)

  return {
    clearance: detectClearance(sentences),
    sponsorship: detectSponsorship(sentences),
    expectedYOE: detectExpectedYOE(text),
    preferred: detectPreferred(text, sentences),
  }
}
