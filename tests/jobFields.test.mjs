import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeJobFields } from '../panel/src/lib/jobFields.js'

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
