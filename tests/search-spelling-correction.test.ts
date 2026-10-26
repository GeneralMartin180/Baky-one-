import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProviderSpellingCorrection } from '../src/services/searchSpellingCorrection.ts';

// Reduced from live Seznam responses for these public diagnostic queries.
function correction(candidate: string, href = `?q=${encodeURIComponent(candidate)}&sId=example`) {
  return `<div><h3 title="Hledali jsme ${candidate}">Hledali jsme<!-- --> <a data-e-a="accept" href="${href}">${candidate}</a></h3><div>Přesto můžeme hledat původní dotaz</div></div>`;
}

test('explicit Seznam corrections retain live typo, transposition and split-brand spelling', () => {
  for (const [original, corrected] of [
    ['yutubez', 'youtube'], ['yutube', 'youtube'], ['space x', 'spacex'],
    ['bratilsava', 'bratislava'], ['microsfot windows', 'microsoft windows'], ['najlepsi mobil', 'nejlepší mobil'],
  ]) assert.equal(parseProviderSpellingCorrection('seznam', correction(corrected), original), corrected, original);
});

test('related links, echoed queries and scripts cannot become spelling evidence', () => {
  const related = '<h3>Lidé také hledají</h3><a href="?q=youtube&thru=related">youtube</a>';
  const echo = '<input name="q" value="youtube"><h3>Hledali jste <a data-e-a="accept" href="?q=youtube">youtube</a></h3>';
  const script = `<script>const markup = '${correction('youtube')}';</script>`;
  const template = `<template>${correction('youtube')}</template>`;
  for (const html of [related, echo, script, template, '<h3>Hledali jsme youtube</h3>']) {
    assert.equal(parseProviderSpellingCorrection('seznam', html, 'yutube'), undefined);
  }
  assert.equal(parseProviderSpellingCorrection('unknown', correction('youtube'), 'yutube'), undefined);
  assert.equal(parseProviderSpellingCorrection('seznam', correction('youtube'), 'youtube'), undefined);
});

test('correction destinations must be the exact HTTPS provider search origin', () => {
  for (const href of [
    'https://evil.example/?q=youtube', 'https://search.seznam.cz.evil.example/?q=youtube',
    'http://search.seznam.cz/?q=youtube', 'https://search.seznam.cz:444/?q=youtube',
    'https://user:pass@search.seznam.cz/?q=youtube', '/redirect?q=youtube',
    '?q=youtube#fragment', '?q=youtube&q=other', 'javascript:alert(1)',
  ]) assert.equal(parseProviderSpellingCorrection('seznam', correction('youtube', href), 'yutube'), undefined, href);
  assert.equal(parseProviderSpellingCorrection('seznam', correction('youtube', 'https://search.seznam.cz/?q=youtube'), 'yutube'), 'youtube');
});

test('visible correction and destination query must agree after whitespace normalization only', () => {
  for (const href of ['?q=unrelated', '?q=YouTube', '?q=youtube%00', '?q=youtube%0A', '?q=%3Cyoutube%3E']) {
    assert.equal(parseProviderSpellingCorrection('seznam', correction('youtube', href), 'yutube'), undefined);
  }
  assert.equal(parseProviderSpellingCorrection('seznam', correction('microsoft windows', '?q=microsoft%20%20windows'), 'microsfot windows'), 'microsoft windows');
});

test('semantic drift, changed digits and exact operators are not accepted as spelling corrections', () => {
  for (const [original, corrected] of [
    ['baky os', 'baky boss'], ['windows 12', 'windows 11'], ['baky', 'bank'],
    ['yutube site:youtube.com', 'youtube'], ['yutube -site:example.com', 'youtube'],
    ['"yutube"', 'youtube'], ['yutube', 'https://youtube.com'],
  ]) assert.equal(parseProviderSpellingCorrection('seznam', correction(corrected), original), undefined, original);
  assert.equal(parseProviderSpellingCorrection('seznam', correction('y'.repeat(501)), 'yutube'), undefined);
});

test('conflicting explicit correction headers fail closed rather than picking an arbitrary query', () => {
  const body = correction('youtube') + correction('youtuber');
  assert.equal(parseProviderSpellingCorrection('seznam', body, 'yutubez'), undefined);
  assert.equal(parseProviderSpellingCorrection('seznam', correction('youtube') + correction('youtube'), 'yutube'), 'youtube');
});
