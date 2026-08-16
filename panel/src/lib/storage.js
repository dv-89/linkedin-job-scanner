const RESUME_KEY = 'resume'

export async function getResume() {
  const { [RESUME_KEY]: resume } = await chrome.storage.local.get(RESUME_KEY)
  return resume ?? null
}

export async function setResume({ fileName, text }) {
  await chrome.storage.local.set({ [RESUME_KEY]: { fileName, text } })
}

export async function clearResume() {
  await chrome.storage.local.remove(RESUME_KEY)
}
