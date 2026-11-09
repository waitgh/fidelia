// Envelope encryption for a church database file.
//
// A random 256-bit data key (DK) encrypts the (gzipped) SQLite bytes with AES-256-GCM.
// The DK is wrapped once per user with a key derived from their password (PBKDF2-SHA256),
// and once with a printed recovery key. Everything runs in the browser via WebCrypto.
//
// File layout:
//   "FIDELIA\x01" (8 bytes) | header length (uint32 BE) | header JSON (UTF-8) | body IV (12) | body ciphertext
// The header is not secret (salts, wrapped keys, hashed username hints). The body is
// authenticated with AAD bound to the church id.

const MAGIC = new Uint8Array([0x46, 0x49, 0x44, 0x45, 0x4c, 0x49, 0x41, 0x01]); // FIDELIA\x01
export const PBKDF2_ITERATIONS = 600_000;
const RECOVERY_ITERATIONS = 10_000; // recovery keys are 128-bit random; stretching is a formality
const INVITE_ITERATIONS = 100_000; // invite codes are 80-bit random and short-lived
export const INVITE_DAYS = 14;

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export interface KeySlot {
  id: string;
  kind: 'password' | 'recovery' | 'invite';
  /** Invite slots only: role the new member gets, and expiry (ms since epoch). Both are bound into the AAD. */
  role?: string;
  expires?: number;
  /** SHA-256(churchId:lowercased username), hex, first 16 chars. Lets us pick the slot without leaking names. */
  hint?: string;
  salt: string; // base64
  iterations: number;
  iv: string; // base64
  wrapped: string; // base64 AES-GCM(DK)
}

export interface FileHeader {
  v: 1;
  churchId: string;
  compression: 'gzip' | 'none';
  keyslots: KeySlot[];
}

export class WrongPasswordError extends Error {
  constructor() { super('Wrong sign-in name or password'); }
}
export class NotAChurchFileError extends Error {
  constructor() { super('This is not a Fidelia church file'); }
}

// ---------- helpers ----------
export const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const randomId = () => [...randomBytes(8)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string) {
  const h = new Uint8Array(await subtle().digest('SHA-256', enc.encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function usernameHint(churchId: string, username: string) {
  return (await sha256Hex(`${churchId}:${username.trim().toLowerCase()}`)).slice(0, 16);
}

async function deriveKek(secret: string, salt: Uint8Array, iterations: number) {
  const base = await subtle().importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const aesKey = (raw: Uint8Array) =>
  subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function gcmEncrypt(key: CryptoKey, data: Uint8Array, aad: string) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, data as BufferSource));
  return { iv, ct };
}

async function gcmDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array, aad: string) {
  return new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, key, ct as BufferSource),
  );
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// ---------- recovery key ----------
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

/** 130 bits of randomness as 26 characters, shown as XXXX-XXXX-...-XX */
export function generateRecoveryKey(): string {
  const chars = [...randomBytes(26)].map((b) => B32[b & 31]).join('');
  return chars.match(/.{1,4}/g)!.join('-');
}

export function normalizeRecoveryKey(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 80 bits as 16 characters, shown as XXXX-XXXX-XXXX-XXXX. */
export function generateInviteCode(): string {
  return [...randomBytes(16)].map((b) => B32[b & 31]).join('').match(/.{4}/g)!.join('-');
}

// ---------- key slots ----------
const slotAad = (churchId: string, s: Pick<KeySlot, 'id' | 'kind' | 'role' | 'expires'>) =>
  `fidelia:v1:${churchId}:slot:${s.id}${s.kind === 'invite' ? `:invite:${s.role}:${s.expires}` : ''}`;

async function makeSlot(
  churchId: string, dk: Uint8Array, kind: KeySlot['kind'], secret: string, hint?: string,
  invite?: { role: string; expires: number },
): Promise<KeySlot> {
  const id = randomId();
  const salt = randomBytes(16);
  const iterations = kind === 'password' ? PBKDF2_ITERATIONS : kind === 'invite' ? INVITE_ITERATIONS : RECOVERY_ITERATIONS;
  const kek = await deriveKek(secret, salt, iterations);
  const meta = { id, kind, ...(invite ?? {}) };
  const { iv, ct } = await gcmEncrypt(kek, dk, slotAad(churchId, meta));
  return { ...meta, hint, salt: b64(salt), iterations, iv: b64(iv), wrapped: b64(ct) };
}

async function openSlot(churchId: string, slot: KeySlot, secret: string): Promise<Uint8Array | null> {
  const kek = await deriveKek(secret, unb64(slot.salt), slot.iterations);
  try {
    return await gcmDecrypt(kek, unb64(slot.iv), unb64(slot.wrapped), slotAad(churchId, slot));
  } catch {
    return null;
  }
}

/** An unlocked church: header plus the raw data key, kept only in memory. */
export interface Unlocked {
  header: FileHeader;
  dataKey: Uint8Array;
}

export async function createChurchKeys(username: string, password: string): Promise<{ unlocked: Unlocked; recoveryKey: string }> {
  const churchId = randomId() + randomId();
  const dataKey = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const keyslots = [
    await makeSlot(churchId, dataKey, 'password', password, await usernameHint(churchId, username)),
    await makeSlot(churchId, dataKey, 'recovery', normalizeRecoveryKey(recoveryKey)),
  ];
  return { unlocked: { header: { v: 1, churchId, compression: 'gzip', keyslots }, dataKey }, recoveryKey };
}

/** Adds (or replaces) a password slot for a user. Returns a new header. */
export async function setUserPassword(u: Unlocked, username: string, password: string): Promise<FileHeader> {
  const hint = await usernameHint(u.header.churchId, username);
  const slot = await makeSlot(u.header.churchId, u.dataKey, 'password', password, hint);
  return { ...u.header, keyslots: [...u.header.keyslots.filter((s) => s.hint !== hint), slot] };
}

export async function removeUser(u: Unlocked, username: string): Promise<FileHeader> {
  const hint = await usernameHint(u.header.churchId, username);
  return { ...u.header, keyslots: u.header.keyslots.filter((s) => s.hint !== hint) };
}

/** Replaces the recovery slot with a new recovery key. */
export async function rotateRecoveryKey(u: Unlocked): Promise<{ header: FileHeader; recoveryKey: string }> {
  const recoveryKey = generateRecoveryKey();
  const slot = await makeSlot(u.header.churchId, u.dataKey, 'recovery', normalizeRecoveryKey(recoveryKey));
  return { header: { ...u.header, keyslots: [...u.header.keyslots.filter((s) => s.kind !== 'recovery'), slot] }, recoveryKey };
}

/** Adds a one-time invite slot. The code is shown once to the admin who creates it. */
export async function createInvite(u: Unlocked, role: string, now = Date.now()): Promise<{ header: FileHeader; code: string; slotId: string }> {
  const code = generateInviteCode();
  const slot = await makeSlot(u.header.churchId, u.dataKey, 'invite', normalizeRecoveryKey(code), undefined, { role, expires: now + INVITE_DAYS * 86_400_000 });
  return { header: { ...u.header, keyslots: [...u.header.keyslots, slot] }, code, slotId: slot.id };
}

export function removeSlot(u: Unlocked, slotId: string): FileHeader {
  return { ...u.header, keyslots: u.header.keyslots.filter((s) => s.id !== slotId) };
}

export class InviteError extends Error {
  constructor(msg = 'That invite code doesn’t work. Check it, or ask an admin for a new one.') { super(msg); this.name = 'InviteError'; }
}

/** Opens the church with an invite code. Expired or tampered invites don't open. */
export async function unlockWithInvite(header: FileHeader, code: string, now = Date.now()): Promise<{ unlocked: Unlocked; slot: KeySlot }> {
  const invites = header.keyslots.filter((s) => s.kind === 'invite');
  for (const slot of invites) {
    const dk = await openSlot(header.churchId, slot, normalizeRecoveryKey(code));
    if (!dk) continue;
    if ((slot.expires ?? 0) < now) throw new InviteError('That invite code has expired. Ask an admin for a new one.');
    return { unlocked: { header, dataKey: dk }, slot };
  }
  throw new InviteError();
}

export async function unlockWithPassword(header: FileHeader, username: string, password: string): Promise<Unlocked> {
  const hint = await usernameHint(header.churchId, username);
  for (const slot of header.keyslots.filter((s) => s.kind === 'password' && s.hint === hint)) {
    const dk = await openSlot(header.churchId, slot, password);
    if (dk) return { header, dataKey: dk };
  }
  throw new WrongPasswordError();
}

export async function unlockWithRecoveryKey(header: FileHeader, recoveryKey: string): Promise<Unlocked> {
  for (const slot of header.keyslots.filter((s) => s.kind === 'recovery')) {
    const dk = await openSlot(header.churchId, slot, normalizeRecoveryKey(recoveryKey));
    if (dk) return { header, dataKey: dk };
  }
  throw new WrongPasswordError();
}

// ---------- file ----------
export function readHeader(file: Uint8Array): FileHeader {
  if (file.length < 12 || !MAGIC.every((b, i) => file[i] === b)) throw new NotAChurchFileError();
  const len = new DataView(file.buffer, file.byteOffset).getUint32(8);
  const header = JSON.parse(dec.decode(file.subarray(12, 12 + len))) as FileHeader;
  if (header.v !== 1) throw new Error('This file was made by a newer version of Fidelia. Please reload the page.');
  return header;
}

export async function encryptFile(u: Unlocked, plaintext: Uint8Array): Promise<Uint8Array> {
  const body = u.header.compression === 'gzip' ? await pipe(plaintext, new CompressionStream('gzip')) : plaintext;
  const { iv, ct } = await gcmEncrypt(await aesKey(u.dataKey), body, `fidelia:v1:${u.header.churchId}:body`);
  const h = enc.encode(JSON.stringify(u.header));
  const out = new Uint8Array(12 + h.length + 12 + ct.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(8, h.length);
  out.set(h, 12);
  out.set(iv, 12 + h.length);
  out.set(ct, 24 + h.length);
  return out;
}

export async function decryptFile(u: Unlocked, file: Uint8Array): Promise<Uint8Array> {
  const header = readHeader(file);
  if (header.churchId !== u.header.churchId) throw new Error('This file belongs to a different church');
  const hLen = new DataView(file.buffer, file.byteOffset).getUint32(8);
  const iv = file.subarray(12 + hLen, 24 + hLen);
  const ct = file.subarray(24 + hLen);
  let body: Uint8Array;
  try {
    body = await gcmDecrypt(await aesKey(u.dataKey), iv, ct, `fidelia:v1:${header.churchId}:body`);
  } catch {
    throw new Error('The church file is damaged or was tampered with');
  }
  return header.compression === 'gzip' ? pipe(body, new DecompressionStream('gzip')) : body;
}
