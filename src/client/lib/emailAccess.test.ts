import { describe, expect, test } from 'vitest';
import { emailAllowed, parseAllowList, supportId } from './emailAccess';

describe('supportId', () => {
  test('is stable, 16 hex characters, and differs per church', async () => {
    const a = await supportId('church-a');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await supportId('church-a')).toBe(a);
    expect(await supportId('church-b')).not.toBe(a);
  });
  test('does not reveal the church ID', async () => {
    expect(await supportId('abc123')).not.toContain('abc123');
  });
});

describe('parseAllowList', () => {
  test('empty or missing means nobody', () => {
    expect(parseAllowList(undefined)).toEqual(new Set());
    expect(parseAllowList('  ')).toEqual(new Set());
  });
  test('"*" means everybody', () => {
    expect(parseAllowList(' * ')).toBe('*');
  });
  test('accepts commas, spaces and mixed case', () => {
    expect(parseAllowList('AAAA, bbbb  cccc,')).toEqual(new Set(['aaaa', 'bbbb', 'cccc']));
  });
});

describe('emailAllowed', () => {
  const allow = parseAllowList('aaaa,bbbb');
  test('listed churches get it, others do not', () => {
    expect(emailAllowed({ isDemo: false, supportId: 'aaaa', allow })).toBe(true);
    expect(emailAllowed({ isDemo: false, supportId: 'AAAA', allow })).toBe(true);
    expect(emailAllowed({ isDemo: false, supportId: 'zzzz', allow })).toBe(false);
  });
  test('the demo never gets it, even when open to everybody', () => {
    expect(emailAllowed({ isDemo: true, supportId: 'aaaa', allow })).toBe(false);
    expect(emailAllowed({ isDemo: true, supportId: 'aaaa', allow: '*' })).toBe(false);
  });
  test('"*" opens it to every real church', () => {
    expect(emailAllowed({ isDemo: false, supportId: 'zzzz', allow: '*' })).toBe(true);
  });
});
