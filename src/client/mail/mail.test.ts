import { describe, it, expect } from 'vitest';
import { buildMime, b64utf8 } from './gmail';
import { graphMessage } from './microsoft';

const mail = {
  to: ['a@x.org', 'b@x.org'],
  subject: '2026 奉献收据',
  bodyText: 'Dear friend,\nThank you.',
  attachments: [{ filename: 'Statement.pdf', contentType: 'application/pdf', contentBase64: 'A'.repeat(400_000) }],
};

describe('mail encoding', () => {
  it('builds MIME with encoded subject, base64 body and attachment', () => {
    const m = buildMime(mail, 'me@x.org', 'B');
    expect(m).toContain('To: a@x.org, b@x.org');
    expect(m).toContain('Subject: =?UTF-8?B?');
    expect(m).toContain('filename="Statement.pdf"');
    expect(m.split('\r\n').every((l) => l.length <= 998)).toBe(true);
    expect(m.trimEnd().endsWith('--B--')).toBe(true);
    expect(() => b64utf8(m)).not.toThrow(); // large message, no stack overflow
  });
  it('builds a Graph sendMail payload', () => {
    const g = graphMessage(mail);
    expect(g.message.toRecipients).toEqual([{ emailAddress: { address: 'a@x.org' } }, { emailAddress: { address: 'b@x.org' } }]);
    expect(g.message.attachments[0]).toMatchObject({ name: 'Statement.pdf', '@odata.type': '#microsoft.graph.fileAttachment' });
  });
});
