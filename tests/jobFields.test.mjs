import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeJobFields } from '../panel/src/lib/jobFields.js'

test('clearance requirements are distinguished from optional and ambiguous mentions', () => {
  for (const sentence of [
    'An active security clearance is required.',
    'Candidates must obtain TS/SCI clearance.',
    'Ability to obtain a security clearance.',
    'Must pass a public trust investigation.',
    'Active TS/SCI with polygraph.',
  ]) assert.equal(analyzeJobFields(sentence).clearance.status, 'Required', sentence)
  assert.equal(analyzeJobFields('Security clearance is not required.').clearance.status, 'Not required')
  assert.equal(analyzeJobFields('No security clearance required.').clearance.status, 'Not required')
  assert.equal(analyzeJobFields('No clearance is required.').clearance.status, 'Not required')
  assert.equal(analyzeJobFields('Security clearance not mandatory.').clearance.status, 'Not required')
  assert.equal(analyzeJobFields('Security clearance preferred.').clearance.status, 'Preferred / optional')
  assert.equal(analyzeJobFields('Discuss security clearance with the recruiter.').clearance.status, 'Mentioned — check manually')
  assert.equal(analyzeJobFields('Python required.').clearance.status, 'Not mentioned')
})

test('a required clearance takes precedence over an earlier optional or negative mention', () => {
  const sentence = 'Candidates must hold a Secret security clearance.'
  const result = analyzeJobFields(`Top Secret clearance preferred.\n${sentence}`).clearance
  assert.equal(result.status, 'Required')
  assert.equal(result.evidence, sentence)
})

test('unrelated negation does not reverse an offer of sponsorship', () => {
  const sentence = 'We can sponsor visas for candidates who do not currently have work authorization.'
  const result = analyzeJobFields(sentence).sponsorship
  assert.equal(result.status, 'Available')
  assert.equal(result.evidence, sentence)
})

test('sponsorship refusals still report not available', () => {
  for (const sentence of [
    'We do not sponsor visas.',
    'We are not able to sponsor candidates.',
    'We will not be able to provide visa sponsorship.',
    'No visa sponsorship is available.',
    'Visa sponsorship is not available.',
    'We are unable to offer immigration sponsorship.',
    'We are not currently offering visa sponsorship.',
  ]) {
    assert.equal(analyzeJobFields(sentence).sponsorship.status, 'Not available', sentence)
  }
})

test('ambiguous sponsorship mentions retain manual review', () => {
  assert.equal(analyzeJobFields('Discuss sponsorship with the recruiter.').sponsorship.status,
    'Mentioned — check manually')
  assert.equal(analyzeJobFields('Python experience required.').sponsorship.status, 'Not mentioned')
})

test('required experience takes precedence over a preferred range', () => {
  const required = 'Minimum of 5 years of relevant experience.'
  const result = analyzeJobFields(`Required qualifications:\n${required}\nPreferred qualifications:\n1-2 years using Kubernetes.`).expectedYOE
  assert.equal(result.status, '5+ years')
  assert.equal(result.evidence, required)
  assert.equal(result.searchTerm, 'Minimum of 5 years')
})

test('preferred sections remain optional even when they specify a minimum', () => {
  const jd = 'Preferred qualifications:\nMinimum of 2 years of experience with Kubernetes.\nRequired qualifications:\n5 years of experience.'
  assert.equal(analyzeJobFields(jd).expectedYOE.status, '5+ years')
})

test('inline preference and regex ordering do not replace required experience', () => {
  assert.equal(analyzeJobFields('1-2 years of experience preferred.\nMinimum of 5 years of experience required.').expectedYOE.status, '5+ years')
  assert.equal(analyzeJobFields('5 years of experience.\n2-3 years of experience.').expectedYOE.status, '5+ years')
  assert.equal(analyzeJobFields('3-5 years of experience required.').expectedYOE.status, '3–5 years')
  assert.equal(analyzeJobFields('Python experience required.').expectedYOE.status, 'Not mentioned')
})

test('one eligibility sentence matching multiple rules appears only once', () => {
  const sentence = 'Applicants must be a U.S. citizen, a green card holder or a permanent resident.'
  assert.deepEqual(analyzeJobFields(sentence).preferred.citizenshipNotes, [sentence])
})

test('distinct eligibility notes remain visible and irrelevant text adds none', () => {
  const citizenship = 'Applicants must be a U.S. citizen or permanent resident.'
  const authorization = 'Applicants must be authorized to work without sponsorship.'
  assert.deepEqual(analyzeJobFields(`${citizenship}\n${authorization}`).preferred.citizenshipNotes,
    [citizenship, authorization])
  assert.deepEqual(analyzeJobFields('Python and SQL preferred.').preferred.citizenshipNotes, [])
})
