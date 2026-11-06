import { useState, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import { Upload, X, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { DonorPicker } from './DonorPicker.js';
import { api } from '../lib/api.js';

interface DonorOption {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  envelopeNumber: string | null;
  email: string | null;
  isActive?: boolean;
}

interface CategoryOption {
  id: number;
  name: string;
  isActive?: boolean;
}

interface ImportRow {
  rawName: string;
  donorId: string;
  amount: string;
  categoryId: string;
}

interface ImportZelleProps {
  batchId: number;
  donors: DonorOption[];
  categories: CategoryOption[];
  onDone: () => void;
  onClose: () => void;
}

/* ── Fuzzy name matching (same algorithm as ImportPayPal) ── */

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function fuzzyMatchDonor(rawName: string, donors: DonorOption[]): string {
  const norm = rawName.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!norm) return '';

  const normCompact = normalize(rawName);
  const parts = norm.split(/\s+/).filter((p) => p.length >= 2);

  let bestId = '';
  let bestScore = 0;

  for (const d of donors) {
    const inactivePenalty = d.isActive === false ? 0.8 : 1;
    const first = normalize(d.firstName);
    const last = normalize(d.lastName);
    const firstLast = `${first}${last}`;
    const lastFirst = `${last}${first}`;
    const spouse = d.spouseName ? normalize(d.spouseName) : '';
    const spouseFirst = d.spouseName ? normalize(d.spouseName.trim().split(/\s+/)[0]!) : '';
    const spouseFirstLast = spouseFirst ? `${spouseFirst}${last}` : '';

    // Extract tokens from email local part (e.g. "sunjuan.miya" → ["sunjuan","miya"])
    // and build candidateName+last combos for matching alternate names stored in email
    const emailTokens = d.email
      ? d.email.split('@')[0]!.split(/[._\-+]/).map((t) => normalize(t)).filter((t) => t.length >= 2)
      : [];
    const emailCandidates = emailTokens.map((t) => `${t}${last}`);

    const isExact =
      normCompact === firstLast ||
      normCompact === lastFirst ||
      (!!spouseFirstLast && normCompact === spouseFirstLast) ||
      emailCandidates.some((c) => normCompact === c);

    if (isExact && inactivePenalty === 1) {
      return String(d.id);
    }

    const rawScore = isExact ? 1.0 : (() => {
      const sim = Math.max(
        diceCoefficient(normCompact, firstLast),
        diceCoefficient(normCompact, lastFirst),
        spouse ? Math.max(
          diceCoefficient(normCompact, `${spouse}${last}`),
          diceCoefficient(normCompact, `${last}${spouse}`),
          spouseFirstLast ? diceCoefficient(normCompact, spouseFirstLast) : 0,
        ) : 0,
        ...emailCandidates.map((c) => diceCoefficient(normCompact, c)),
      );

      let partBonus = 0;
      if (parts.length >= 2) {
        const nameParts = [first, last, spouse].filter(Boolean);
        const matched = parts.filter((p) => nameParts.some((n) => n.startsWith(p) || n === p));
        if (matched.length >= 2) partBonus = 0.15;
      }
      return Math.min(sim + partBonus, 1);
    })();

    const score = rawScore * inactivePenalty;

    if (score > bestScore) {
      bestScore = score;
      bestId = String(d.id);
    }
  }

  return bestScore >= 0.45 ? bestId : '';
}

/* ── Bounding-box table reconstruction ── */

interface WordBox {
  text: string;
  x: number;
  yMid: number;
  h: number;
}

/** Extract every word with its bounding-box from tesseract's structured result. */
function getWordBoxes(data: Record<string, any>): WordBox[] {
  const out: WordBox[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          if (w.text && w.bbox) {
            out.push({
              text: w.text,
              x: w.bbox.x0,
              yMid: (w.bbox.y0 + w.bbox.y1) / 2,
              h: w.bbox.y1 - w.bbox.y0,
            });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Group words into visual rows using their vertical center, then sort each
 * row left-to-right and join into a string.  This reconstructs the actual
 * table rows even when the raw OCR text scrambles columns.
 */
function buildVisualRows(words: WordBox[]): string[] {
  if (words.length === 0) return [];

  const avgH = words.reduce((s, w) => s + w.h, 0) / words.length;
  const tol = avgH * 0.6;

  const sorted = [...words].sort((a, b) => a.yMid - b.yMid);
  const groups: WordBox[][] = [[sorted[0]!]];

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i]!;
    const cur = groups[groups.length - 1]!;
    const rowY = cur.reduce((s, r) => s + r.yMid, 0) / cur.length;
    if (Math.abs(w.yMid - rowY) <= tol) {
      cur.push(w);
    } else {
      groups.push([w]);
    }
  }

  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    return g.map((w) => w.text).join(' ');
  });
}

/* ── Flexible OCR-tolerant regexes ── */

// OCR may read "I" as "1", "l", or "|"
const PAYMENT_ID_RE = /PAYMENT?\s*[Il1|]D/i;
// Some OCR outputs "PAYMENT +$100.01 ID XXXXX", so allow amount/noise between PAYMENT and ID
const PAYMENT_THEN_ID_RE = /PAYMENT\b.{0,40}\b[Il1|]D\b/i;
// OCR may misread '$' as '4', '5', or 'S' (e.g. "+$200.00" → "+5200.00",
// "+$20.00" → "+520.00"). The alternative \+[$45S](?=[1-9]\d+\.) handles that:
// it consumes the misread char and captures the real digits that follow.
// Lookahead [1-9]\d+\. requires a non-zero leading digit followed by at least one
// more digit and a decimal point — this avoids false positives on amounts like
// +500.00 (real $500 with OCR-dropped '$'), where the digit after '5' is '0'.
const AMOUNT_RE = /(?:\+\d+\$|\+[$45S](?=[1-9]\d+\.)|\+\$?|\$)\s*([\d,]+(?:\.\d{1,2})?)/;

// Matches "NAME PAYMENT ID CODE ZELLE BUSINESS PAYMENT +$AMOUNT [FROM]" in one pass.
// The OCR for this bank layout places the amount between "BUSINESS PAYMENT" and "FROM",
// so the amount must be captured right after "BUSINESS PAYMENT" rather than after "FROM".
// Matches "NAME PAYMENT ID[.] CODE ZELLE [BUSINESS PAYMENT] +$AMOUNT" in one pass.
// The amount may appear right after ZELLE (before "BUSINESS PAYMENT") or after
// "BUSINESS PAYMENT", depending on how the bank formats the row and where OCR
// places the right-column amount. [.,]? handles trailing punctuation on "ID".
const DIRECT_TX_RE = new RegExp(
  String.raw`(?:[A-Za-z]\s+)?([A-Za-z][A-Za-z ]+?)\s+PAYMENT\s*[Il1|]D[.,]?\s+\S+\s+ZELLE\s+(?:BUSINESS\s+PAYMENT\s+)?` + AMOUNT_RE.source,
  'gi',
);

function hasPaymentMarker(s: string): boolean {
  return PAYMENT_ID_RE.test(s) || PAYMENT_THEN_ID_RE.test(s);
}

function paymentMarkerIndex(s: string): number {
  const a = s.search(PAYMENT_ID_RE);
  const b = s.search(PAYMENT_THEN_ID_RE);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/* ── Name extraction ── */

function extractName(block: string): string {
  // Pending: "FROM - YINGYUE XU - PAYMENT ID ..."
  const fromMatch = block.match(/FROM\s+(.+?)(?:\s+PAYMENT\b|\s+ZELLE\b)/i);
  if (fromMatch) {
    const name = fromMatch[1]!
      .replace(/\+?\$\s*[\d,]+\.\d{1,2}/g, '')
      .replace(/^[-—–\s.,]+|[-—–\s.,]+$/g, '')
      .trim();
    if (name.length >= 2 && /[a-zA-Z]{2}/.test(name)) return name;
  }

  // Deposited: "I Shen Chen PAYMENT ID 37R... ZELLE BUSINESS PAYMENT FROM"
  let cleaned = block;
  cleaned = cleaned.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ');
  cleaned = cleaned.replace(/\b(Pending|Deposited|Posted|Balance|DEPOSIT)\b/gi, ' ');
  cleaned = cleaned.replace(/ZELLE\s*BUSINESS\s*PAYMENT\s*(FROM)?/gi, ' ');
  cleaned = cleaned.replace(/\+?[$45S]\s*[\d,]+\.\d{1,2}/g, ' ');
  cleaned = cleaned.replace(/[®©@#°•|[\]{}()]/g, ' ');
  // Strip single-letter OCR noise at start (icons read as e, v, o, etc.)
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[^A-Za-z]*\b[a-z]\b\s+/i, '');

  const p2 = cleaned.match(/([A-Za-z][A-Za-z\s]+?)\s*PAYMENT\b/i);
  if (p2) {
    const candidate = p2[1]!.replace(/^\s*[-—–|.,\s]+|[-—–|.,\s]+\s*$/g, '').trim();
    if (candidate.length >= 2 && /[a-zA-Z]{2}/.test(candidate)) return candidate;
  }

  return '';
}

/* ── Core text parser ── */


function parseZelleText(text: string): { name: string; amount: string }[] {
  const joined = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Try the direct pattern first: "NAME PAYMENT ID CODE ZELLE BUSINESS PAYMENT +$AMOUNT [FROM]".
  // This handles bank activity-list screenshots where the amount appears mid-description.
  const directResults: { name: string; amount: string }[] = [];
  let dm: RegExpExecArray | null;
  DIRECT_TX_RE.lastIndex = 0;
  while ((dm = DIRECT_TX_RE.exec(joined)) !== null) {
    const name = dm[1]!.trim();
    if (name.length < 2) continue;
    const raw = dm[2]!.replace(/,/g, '');
    const amount = raw.includes('.') ? raw : `${raw}.00`;
    if (parseFloat(amount) > 0) directResults.push({ name, amount });
  }
  if (directResults.length > 0) return directResults;

  const results: { name: string; amount: string }[] = [];

  // Pre-index every dollar amount in the full text (for fallback pairing)
  const amtGlobal = new RegExp(AMOUNT_RE.source, 'g');
  const allAmounts: { idx: number; value: string; used: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = amtGlobal.exec(joined)) !== null) {
    allAmounts.push({ idx: m.index, value: m[1]!.replace(/,/g, ''), used: false });
  }

  // Split by date boundaries — each block usually holds one transaction.
  // For activity-list screenshots (no dates), "PAYMENT FROM" is the correct
  // boundary. We use a lookahead split so "PAYMENT FROM" stays at the START of
  // each subsequent block; this lets extractName's fromMatch path fire for both
  // the "deposited" format (NAME PAYMENT ID … ZELLE BUSINESS … PAYMENT FROM)
  // and the "pending" format (ZELLE BUSINESS PAYMENT FROM - NAME - PAYMENT ID).
  // Fall back to splitting on "ZELLE BUSINESS" only when "PAYMENT FROM" is absent.
  const hasDateBoundaries = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(joined);
  const paymentFromCount = (joined.match(/PAYMENT\s+FROM/gi) ?? []).length;
  const blocks = hasDateBoundaries
    ? joined.split(/(?=\d{1,2}\/\d{1,2}\/\d{2,4})/).filter((s) => s.trim())
    : paymentFromCount >= 2
      ? joined.split(/(?=PAYMENT\s+FROM)/i).filter((s) => s.trim())
      : joined.split(/(?=ZELLE\s+BUSINESS)/i).filter((s) => s.trim());
  let searchPos = 0;

  interface Deferred { name: string; pidAbsIdx: number }
  const deferred: Deferred[] = [];

  for (const block of blocks) {
    const blockStart = joined.indexOf(block, searchPos);
    searchPos = blockStart + block.length;

    if (/posted\s*balance/i.test(block)) continue;
    if (!hasPaymentMarker(block)) continue;

    const name = extractName(block);
    if (!name) continue;

    const inBlockAmt = block.match(AMOUNT_RE);
    if (inBlockAmt && parseFloat(inBlockAmt[1]!.replace(/,/g, '')) > 0) {
      const raw = inBlockAmt[1]!.replace(/,/g, '');
      const amount = raw.includes('.') ? raw : `${raw}.00`;
      const absIdx = blockStart + block.indexOf(inBlockAmt[0]);
      const entry = allAmounts.find((a) => Math.abs(a.idx - absIdx) <= 2);
      if (entry) entry.used = true;
      results.push({ name, amount });
    } else {
      // Block has payment marker + name but amount ended up in another block
      const markerIdx = paymentMarkerIndex(block);
      if (markerIdx >= 0) {
        deferred.push({ name, pidAbsIdx: blockStart + markerIdx });
      }
    }
  }

  // Pair deferred entries with nearest unused amount
  for (const d of deferred) {
    let best: (typeof allAmounts)[0] | null = null;
    let bestDist = Infinity;
    for (const amt of allAmounts) {
      if (amt.used || parseFloat(amt.value) <= 0) continue;
      const dist = Math.abs(amt.idx - d.pidAbsIdx);
      if (dist < bestDist && dist < 600) {
        bestDist = dist;
        best = amt;
      }
    }
    if (best) {
      best.used = true;
      results.push({ name: d.name, amount: best.value });
    }
  }

  return results;
}

/**
 * Auto-detect category from the cents portion of the amount:
 *  .01 → General, .02 → Building, anything else → General
 */
function categoryFromCents(amount: string, categories: CategoryOption[]): string {
  const generalCat = categories.find((c) => c.name.toLowerCase() === 'general');
  const buildingCat = categories.find((c) => c.name.toLowerCase() === 'building');
  const defaultId = generalCat ? String(generalCat.id) : categories[0] ? String(categories[0].id) : '';

  const cents = Math.round((parseFloat(amount) % 1) * 100);
  if (cents === 2 && buildingCat) return String(buildingCat.id);
  return defaultId;
}

export function ImportZelle({ batchId, donors, categories, onDone, onClose }: ImportZelleProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'preview' | 'importing'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [ocrDebug, setOcrDebug] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localDonors, setLocalDonors] = useState<DonorOption[]>(donors);

  const [newDonorTargetRow, setNewDonorTargetRow] = useState<number | null>(null);
  const [newDonorFirst, setNewDonorFirst] = useState('');
  const [newDonorLast, setNewDonorLast] = useState('');
  const [newDonorAddress, setNewDonorAddress] = useState('');
  const [newDonorCity, setNewDonorCity] = useState('');
  const [newDonorState, setNewDonorState] = useState('');
  const [newDonorZip, setNewDonorZip] = useState('');
  const [newDonorSaving, setNewDonorSaving] = useState(false);

  const processImage = useCallback(async (file: File) => {
    setError('');
    setStep('processing');
    setImagePreview(URL.createObjectURL(file));

    try {
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(file);
      await worker.terminate();

      // Try both approaches and keep whichever finds more transactions
      const wordBoxes = getWordBoxes(data);
      let bboxParsed: { name: string; amount: string }[] = [];
      let debugParts: string[] = [];

      if (wordBoxes.length > 0) {
        const visualRows = buildVisualRows(wordBoxes);
        const reconstructedText = visualRows.join('\n');
        bboxParsed = parseZelleText(reconstructedText);
        debugParts.push(`=== Reconstructed rows (${visualRows.length}) ===\n${reconstructedText}`);
      }

      const rawParsed = parseZelleText(data.text);
      const usedApproach = rawParsed.length > bboxParsed.length ? 'raw' : 'bbox';
      const parsed = usedApproach === 'raw' ? rawParsed : bboxParsed;

      // Count PAYMENT IDs in each text for diagnostics
      const pidCounter = (t: string) => (t.match(new RegExp(PAYMENT_ID_RE.source, 'gi')) ?? []).length;
      const bboxText = debugParts.length > 0 ? debugParts[0]! : '';
      debugParts.push(
        `=== Diagnostics ===\nUsed: ${usedApproach} (bbox: ${bboxParsed.length}, raw: ${rawParsed.length})\n` +
        `PAYMENT IDs found — bbox text: ${pidCounter(bboxText)}, raw text: ${pidCounter(data.text)}`,
      );
      debugParts.push(`=== Raw OCR text ===\n${data.text}`);
      setOcrDebug(debugParts.join('\n\n'));

      if (parsed.length === 0) {
        setError('Could not find any Zelle transactions. Expand "Show raw OCR text" below to see what was detected.');
      }

      const importRows: ImportRow[] = parsed.map((p) => ({
        rawName: p.name,
        donorId: fuzzyMatchDonor(p.name, donors),
        amount: p.amount,
        categoryId: categoryFromCents(p.amount, categories),
      }));

      setRows(importRows);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
      setStep('upload');
    }
  }, [donors, categories]);

  const openNewDonorModal = (rowIdx: number) => {
    setNewDonorTargetRow(rowIdx);
    setNewDonorFirst('');
    setNewDonorLast('');
    setNewDonorAddress('');
    setNewDonorCity('');
    setNewDonorState('');
    setNewDonorZip('');
  };

  const handleCreateDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewDonorSaving(true);
    try {
      const created = await api.donors.create({
        firstName: newDonorFirst,
        lastName: newDonorLast,
        address: newDonorAddress || null,
        city: newDonorCity || null,
        state: newDonorState || null,
        zipCode: newDonorZip || null,
      });
      const newDonor: DonorOption = {
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        spouseName: created.spouseName ?? null,
        envelopeNumber: created.envelopeNumber ?? null,
        email: created.email ?? null,
      };
      setLocalDonors((prev) => [...prev, newDonor]);
      if (newDonorTargetRow !== null) {
        updateRow(newDonorTargetRow, 'donorId', String(created.id));
      }
      setNewDonorTargetRow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create donor');
    } finally {
      setNewDonorSaving(false);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    processImage(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [processImage]);

  const updateRow = (idx: number, field: keyof ImportRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    setError('');
    const invalid = rows.find((r) => !r.donorId || !r.amount || !r.categoryId);
    if (invalid) {
      setError('Please select a donor for every row before importing.');
      return;
    }

    setStep('importing');
    try {
      for (const row of rows) {
        await api.offerings.create({
          batchId,
          donorId: Number(row.donorId),
          categoryId: Number(row.categoryId),
          amount: parseFloat(row.amount),
          paymentMethod: 'zelle',
          checkNumber: null,
          notes: 'Imported from Zelle screenshot',
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h3 className="text-lg font-semibold">Import from Zelle Bank Statement</h3>
          <button onClick={onClose} className="btn-ghost btn-sm text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-auto pb-48">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                <strong>Tip:</strong> Cents determine the fund — amounts ending in <code>.01</code> go to General,
                <code> .02</code> to Building. All others default to General. You can change categories after scanning.
              </div>
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 font-medium">Drop a Zelle bank statement screenshot here</p>
                <p className="text-sm text-gray-400 mt-1">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 mx-auto text-primary-600 animate-spin mb-3" />
              <p className="text-gray-600 font-medium">Reading image...</p>
              <p className="text-sm text-gray-400 mt-1">This may take a few seconds</p>
            </div>
          )}

          {(step === 'preview' || step === 'importing') && (
            <div>
              {imagePreview && (
                <div className="mb-4">
                  <img src={imagePreview} alt="Uploaded" className="max-h-40 rounded-lg border mx-auto" />
                </div>
              )}

              {error && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  {error}
                </div>
              )}

              <p className="text-sm text-gray-500 mb-3">
                Found <strong>{rows.length}</strong> Zelle transaction{rows.length !== 1 ? 's' : ''}. {rows.length > 0 ? 'Review and fix any mismatches before importing.' : ''}
              </p>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">OCR Name</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Donor</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Amount</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Category</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, idx) => (
                      <tr key={idx} className={!row.donorId ? 'bg-amber-50' : ''}>
                        <td className="px-3 py-2 text-gray-500 text-xs font-mono w-[5rem] max-w-[5rem] truncate" title={row.rawName}>
                          {row.rawName}
                        </td>
                        <td className="px-3 py-2 min-w-[12rem]">
                          <div className="flex items-center gap-1">
                            <div className="flex-1">
                              <DonorPicker
                                donors={localDonors}
                                value={row.donorId}
                                onChange={(val) => updateRow(idx, 'donorId', val)}
                                compact
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => openNewDonorModal(idx)}
                              className="btn-ghost btn-sm text-primary-600 shrink-0"
                              title="Add new donor"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="input py-1 text-sm text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={row.amount}
                            onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input py-1 text-sm"
                            value={row.categoryId}
                            onChange={(e) => updateRow(idx, 'categoryId', e.target.value)}
                          >
                            {categories
                              .filter((c) => c.isActive !== false)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="btn-ghost btn-sm text-red-500"
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ocrDebug && (
                <details className="mt-3 text-xs text-gray-400">
                  <summary className="cursor-pointer hover:text-gray-600">Show raw OCR text</summary>
                  <pre className="mt-1 p-2 bg-gray-50 rounded text-xs whitespace-pre-wrap max-h-32 overflow-auto">{ocrDebug}</pre>
                </details>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={step === 'importing' || rows.length === 0}
                  className="btn-primary btn-sm"
                >
                  {step === 'importing' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${rows.length} Offering${rows.length !== 1 ? 's' : ''}`
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('upload'); setRows([]); setError(''); setOcrDebug(''); }}
                  className="btn-secondary btn-sm"
                >
                  Upload Different Image
                </button>
                <button type="button" onClick={onClose} className="btn-secondary btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {newDonorTargetRow !== null && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setNewDonorTargetRow(null)} />
        <form
          onSubmit={handleCreateDonor}
          className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
        >
          <div className="flex items-center gap-2 mb-5">
            <UserPlus className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold">Quick Add Donor</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Enter the essentials now. You can add full details later from the Donors page.
          </p>
          <div className="space-y-3">
            <div>
              <label className="label">First Name *</label>
              <input
                className="input"
                required
                autoFocus
                value={newDonorFirst}
                onChange={(e) => setNewDonorFirst(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input
                className="input"
                required
                value={newDonorLast}
                onChange={(e) => setNewDonorLast(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                placeholder="Optional"
                value={newDonorAddress}
                onChange={(e) => setNewDonorAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <label className="label">City</label>
                <input
                  className="input"
                  value={newDonorCity}
                  onChange={(e) => setNewDonorCity(e.target.value)}
                />
              </div>
              <div className="col-span-1">
                <label className="label">State</label>
                <input
                  className="input"
                  value={newDonorState}
                  onChange={(e) => setNewDonorState(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="label">ZIP</label>
                <input
                  className="input"
                  value={newDonorZip}
                  onChange={(e) => setNewDonorZip(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button type="submit" className="btn-primary flex-1" disabled={newDonorSaving}>
              {newDonorSaving ? 'Saving...' : 'Add Donor'}
            </button>
            <button type="button" onClick={() => setNewDonorTargetRow(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}
