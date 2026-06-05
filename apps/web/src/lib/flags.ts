const SPECIAL_FLAGS: Record<string, string> = {
  'gb-eng': '🏴',
  'gb-sct': '🏴'
};

export function flagEmoji(flagCode?: string | null): string {
  if (!flagCode) return '🏳️';

  const normalized = flagCode.trim().toLowerCase();
  if (SPECIAL_FLAGS[normalized]) return SPECIAL_FLAGS[normalized];
  if (!/^[a-z]{2}$/.test(normalized)) return '🏳️';

  return normalized
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}
