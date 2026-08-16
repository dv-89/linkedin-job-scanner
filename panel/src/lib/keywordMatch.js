import { ALL_SKILLS } from './skillsDictionary.js'
import { STOPWORDS } from './stopwords.js'

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Boundary check based on adjacent alphanumeric chars rather than \b, so
// terms containing symbols (C++, C#, .NET, CI/CD) still match correctly.
function containsTerm(text, term) {
  const pattern = `(?<![a-zA-Z0-9])${escapeRegExp(term)}(?![a-zA-Z0-9])`
  return new RegExp(pattern, 'i').test(text)
}

// Compares a job description against resume text using the curated skills
// dictionary, plus a secondary frequency-based pass for JD-specific terms
// the dictionary doesn't know about.
export function matchKeywords(jdText, resumeText) {
  const requiredSkills = ALL_SKILLS.filter((skill) =>
    containsTerm(jdText, skill.term)
  )

  const matched = []
  const missing = []
  for (const skill of requiredSkills) {
    if (containsTerm(resumeText, skill.term)) {
      matched.push(skill)
    } else {
      missing.push(skill)
    }
  }

  const score =
    requiredSkills.length > 0
      ? Math.round((matched.length / requiredSkills.length) * 100)
      : null

  const otherTerms = extractOtherTerms(jdText, requiredSkills)

  return { matched, missing, otherTerms, score }
}

function extractOtherTerms(jdText, requiredSkills) {
  const knownTermsLower = new Set(
    requiredSkills.map((s) => s.term.toLowerCase())
  )

  const words = jdText
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((w) => w.replace(/^[.+#]+|[.+#]+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !knownTermsLower.has(w))

  const counts = new Map()
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1)
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([term]) => term)
}
