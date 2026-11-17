import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvObjects } from './csv';

describe('csv', () => {
  it('handles quotes, escaped quotes, newlines in fields, CRLF and BOM', () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",\n\n';
    expect(parseCsv(text)).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', '']]);
    expect(parseCsvObjects(text)[0]).toEqual({ a: 'x, y', b: 'say "hi"' });
  });
});
