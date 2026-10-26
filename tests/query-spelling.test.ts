import assert from 'node:assert/strict';
import test from 'node:test';
import { isConservativeSpellingCorrection, typoTokenDistance } from '../src/services/querySpelling.ts';

test('advertised corrections accept small typing errors, letter swaps and diacritics', () => {
  for (const [query, correction] of [
    ['bratilsava', 'Bratislava'],
    ['microsfot windows', 'Microsoft Windows'],
    ['gooogle', 'Google'],
    ['wikipedi', 'Wikipedia'],
    ['yutubez', 'youtube'],
    ['pocsaie bratislava', 'počasí bratislava'],
    ['najlepsi notebook', 'nejlepší notebook'],
    ['POCASIE RIMAVSKA SOBOTA', 'Počasie Rimavská Sobota'],
  ]) assert.equal(isConservativeSpellingCorrection(query, correction), true, `${query} → ${correction}`);
  assert.equal(typoTokenDistance('microsfot', 'microsoft'), 1);
  assert.equal(typoTokenDistance('yutubez', 'youtube'), 2);
});

test('whitespace repairs retain the exact non-space characters and product boundaries', () => {
  assert.equal(isConservativeSpellingCorrection('space x', 'spacex'), true);
  assert.equal(isConservativeSpellingCorrection('bakyos', 'Baky OS'), true);
  assert.equal(isConservativeSpellingCorrection('  Space   X ', 'SpaceX'), true);
  assert.equal(isConservativeSpellingCorrection('space x', 'space station'), false);
  assert.equal(isConservativeSpellingCorrection('rtx 4070', 'rtx4070'), false);
  assert.equal(isConservativeSpellingCorrection('iphone15', 'iphone 15'), false);
});

test('corrections cannot replace short brands, numbers, codes, word order or query meaning', () => {
  for (const [query, correction] of [
    ['baky os', 'babis'],
    ['baky os', 'bank os'],
    ['os', 'boss'],
    ['baky', 'bank'],
    ['nasa', 'masa'],
    ['windows 12', 'windows 11'],
    ['rtx4070 driver', 'rtx4080 driver'],
    ['windows ١٢', 'windows ١١'],
    ['world news', 'world sports'],
    ['notebook', 'notebook gaming'],
    ['microsoft windows', 'windows microsoft'],
    ['abcdefgh', 'youtube'],
  ]) assert.equal(isConservativeSpellingCorrection(query, correction), false, `${query} → ${correction}`);
  assert.equal(isConservativeSpellingCorrection('windows 12', 'Windows 12'), true);
  assert.equal(typoTokenDistance('abcdefgh', 'youtube'), null);
});

test('quoted phrases, exclusions, operators and punctuated identifiers do not enter rewriting', () => {
  for (const query of [
    'site:github.com microsfot',
    '-site:example.com microsfot',
    'microsoft -windows',
    'microsoft +windows',
    '"microsfot windows"',
    '„microsfot windows“',
    "'microsfot windows'",
    'microsoft OR windows',
    'microsoft AND windows',
    'microsoft NOT windows',
    'https://microsfot.com/',
    'Array.prototype.srot',
    'ThinkPad-X1',
  ]) assert.equal(isConservativeSpellingCorrection(query, query), false, query);
  assert.equal(isConservativeSpellingCorrection('microsfot windows', 'Microsoft -Windows'), false);
});

test('spelling checks reject blank, control-character and oversized provider data', () => {
  assert.equal(isConservativeSpellingCorrection('', ''), false);
  assert.equal(isConservativeSpellingCorrection('  ', ' '), false);
  assert.equal(isConservativeSpellingCorrection('youtube', 'youtube\n'), false);
  assert.equal(isConservativeSpellingCorrection('a'.repeat(513), 'a'.repeat(513)), false);
  assert.equal(typoTokenDistance('a'.repeat(65), 'b' + 'a'.repeat(64)), null);
  assert.equal(typoTokenDistance('baky os', 'bakyos'), null);
});
