export const RESUME_SLOTS = ['resume-1', 'resume-2', 'resume-3']
export const DEFAULT_SECTION_ORDER = ['details', 'resume', 'job', 'keywords']
const SECTION_ORDER_KEY = 'sectionOrder'
const LEGACY_RESUME_KEY = 'resume'

function checkSlot(slot) {
  if (!RESUME_SLOTS.includes(slot)) throw new Error('Unknown resume slot')
}

export function normalizeSectionOrder(order) {
  const valid = Array.isArray(order)
    ? [...new Set(order.filter((id) => DEFAULT_SECTION_ORDER.includes(id)))]
    : []
  return [...valid, ...DEFAULT_SECTION_ORDER.filter((id) => !valid.includes(id))]
}

export async function getPanelState() {
  const saved = await chrome.storage.local.get([
    ...RESUME_SLOTS, LEGACY_RESUME_KEY, SECTION_ORDER_KEY,
  ])
  // Migrate once so clearing the first slot cannot restore the old resume.
  if (saved[LEGACY_RESUME_KEY]) {
    if (!Object.hasOwn(saved, RESUME_SLOTS[0])) {
      await chrome.storage.local.set({ [RESUME_SLOTS[0]]: saved[LEGACY_RESUME_KEY] })
      saved[RESUME_SLOTS[0]] = saved[LEGACY_RESUME_KEY]
    }
    await chrome.storage.local.remove(LEGACY_RESUME_KEY)
  }
  return {
    resumes: RESUME_SLOTS.map((slot) => saved[slot] ?? null),
    sectionOrder: normalizeSectionOrder(saved[SECTION_ORDER_KEY]),
  }
}

export async function setResume(slot, { fileName, text }) {
  checkSlot(slot)
  await chrome.storage.local.set({ [slot]: { fileName, text } })
}

export async function clearResume(slot) {
  checkSlot(slot)
  await chrome.storage.local.remove(slot)
}

export async function setSectionOrder(order) {
  await chrome.storage.local.set({ [SECTION_ORDER_KEY]: normalizeSectionOrder(order) })
}
