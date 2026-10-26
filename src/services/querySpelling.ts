const MAX_CORRECTION_LENGTH = 512;
const MAX_FUZZY_TOKEN_LENGTH = 64;

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Small typing differences only; short names, numbers and model codes stay exact. */
export function typoTokenDistance(original: string, candidate: string): number | null {
  const left = normalized(original);
  const right = normalized(candidate);
  if (!left || !right || !/^[\p{L}\p{N}]+$/u.test(left) || !/^[\p{L}\p{N}]+$/u.test(right)) return null;
  if (left === right) return 0;
  const a = [...left];
  const b = [...right];
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 5 || longer > MAX_FUZZY_TOKEN_LENGTH || /\p{N}/u.test(left + right)) return null;
  // A missing final letter can accompany a swap (pocsaie → počasí).
  const limit = shorter >= 6 && longer >= 7 ? 2 : 1;
  if (longer - shorter > limit) return null;

  // Unrestricted Damerau–Levenshtein also counts an adjacent letter swap as one
  // edit. The size cap keeps comparisons bounded for untrusted provider text.
  const ceiling = a.length + b.length;
  const distance = Array.from({ length: a.length + 2 }, () => Array<number>(b.length + 2).fill(0));
  distance[0][0] = ceiling;
  for (let row = 0; row <= a.length; row++) {
    distance[row + 1][0] = ceiling;
    distance[row + 1][1] = row;
  }
  for (let column = 0; column <= b.length; column++) {
    distance[0][column + 1] = ceiling;
    distance[1][column + 1] = column;
  }
  const lastRow = new Map<string, number>();
  for (let row = 1; row <= a.length; row++) {
    let lastColumn = 0;
    for (let column = 1; column <= b.length; column++) {
      const matchingRow = lastRow.get(b[column - 1]) || 0;
      const matchingColumn = lastColumn;
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      if (!cost) lastColumn = column;
      distance[row + 1][column + 1] = Math.min(
        distance[row][column] + cost,
        distance[row + 1][column] + 1,
        distance[row][column + 1] + 1,
        distance[matchingRow][matchingColumn] + (row - matchingRow - 1) + 1 + (column - matchingColumn - 1),
      );
    }
    lastRow.set(a[row - 1], row);
  }
  const edits = distance[a.length + 1][b.length + 1];
  return edits <= limit ? edits : null;
}

/** Validate a provider's explicit correction, without inventing replacement words. */
export function isConservativeSpellingCorrection(original: string, corrected: string): boolean {
  if (!original || !corrected || original.length > MAX_CORRECTION_LENGTH || corrected.length > MAX_CORRECTION_LENGTH) return false;
  if (/[\u0000-\u001f\u007f]/u.test(original + corrected)) return false;
  const before = normalized(original);
  const after = normalized(corrected);
  // Quoted phrases, operators, URLs and punctuated identifiers carry search
  // scope or literal meaning. They never enter automatic spelling recovery.
  if (!before || !after || /[^\p{L}\p{N} ]/u.test(before + after) || /(?:^|\s)(?:AND|OR|NOT)(?:\s|$)/u.test(original)) return false;
  const originalWords = before.split(' ');
  const correctedWords = after.split(' ');
  const originalCodes = originalWords.filter(word => /\p{N}/u.test(word));
  const correctedCodes = correctedWords.filter(word => /\p{N}/u.test(word));
  if (originalCodes.length !== correctedCodes.length || originalCodes.some((word, index) => word !== correctedCodes[index])) return false;

  // Missing spaces are accepted only when every non-space character stays in
  // the same order. Product/code token boundaries above must still match.
  if (before.replace(/ /g, '') === after.replace(/ /g, '')) return true;
  if (originalWords.length !== correctedWords.length) return false;
  return originalWords.every((word, index) => typoTokenDistance(word, correctedWords[index]) !== null);
}
