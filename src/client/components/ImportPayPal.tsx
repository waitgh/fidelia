import { useState, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import { Upload, X, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { DonorPicker } from './DonorPicker.js';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/settings.js';

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
  paymentMethod: string;
}

interface ImportPayPalProps {
  batchId: number;
  donors: DonorOption[];
  categories: CategoryOption[];
  onDone: () => void;
  onClose: () => void;
}

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
      // Dice coefficient on both orderings — picks the better one
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

      // Bonus: if every word-part matches or starts a name part
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

  // Threshold: 0.45 catches OCR-imperfect matches while avoiding false positives
  return bestScore >= 0.45 ? bestId : '';
}

function parsePayPalText(text: string): { name: string; amount: string }[] {
  const results: { name: string; amount: string }[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const amountRe = /\$\s*([\d,]+(?:\.\d{1,2})?)/;

  for (let i = 0; i < lines.length; i++) {
    const amountMatch = lines[i]!.match(amountRe);
    if (!amountMatch) continue;

    const raw = amountMatch[1]!.replace(/,/g, '');
    const amount = raw.includes('.') ? raw : `${raw}.00`;

    // Search this line and previous lines for a name
    let name = '';
    for (let j = i; j >= Math.max(0, i - 4); j--) {
      const line = lines[j]!;
      // Skip lines that are purely date, status, amount, or header-like
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) continue;
      if (/^(completed|pending|refunded|payment from|type|status|gross|date|name)/i.test(line)) continue;
      if (amountRe.test(line) && j !== i) continue;

      // Try to extract a name: strip out amount, "USD", "Payment from", dates, "Completed", etc.
      let candidate = line
        .replace(amountRe, '')
        .replace(/USD/gi, '')
        .replace(/completed/gi, '')
        .replace(/payment\s+from/gi, '')
        .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}[,\s]*/g, '')
        .replace(/\d{1,2}:\d{2}\s*(AM|PM)/gi, '')
        .replace(/[®©@]/g, '')
        .trim();

      // Remove trailing/leading punctuation
      candidate = candidate.replace(/^[,.\s|]+|[,.\s|]+$/g, '').trim();

      if (candidate.length >= 3 && /[a-zA-Z]/.test(candidate)) {
        name = candidate;
        break;
      }
    }

    if (name || amount) {
      results.push({ name: name || 'Unknown', amount });
    }
  }

  return results;
}

export function ImportPayPal({ batchId, donors, categories, onDone, onClose }: ImportPayPalProps) {
  const { offeringMethodOptions } = useSettings();
  const defaultPaypalMethod = offeringMethodOptions.find((m) => m.value === 'paypal')?.value
    ?? offeringMethodOptions[0]?.value
    ?? 'paypal';
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

  const defaultCategoryId = () => {
    const general = categories.find((c) => c.name.toLowerCase() === 'general');
    return general ? String(general.id) : categories[0] ? String(categories[0].id) : '';
  };

  const processImage = useCallback(async (file: File) => {
    setError('');
    setStep('processing');
    setImagePreview(URL.createObjectURL(file));

    try {
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      setOcrDebug(text);
      const parsed = parsePayPalText(text);

      if (parsed.length === 0) {
        setError('Could not find any transactions in the image. Make sure it shows PayPal payment rows with dollar amounts.');
        setStep('upload');
        return;
      }

      const defaultCat = defaultCategoryId();
      const importRows: ImportRow[] = parsed.map((p) => ({
        rawName: p.name,
        donorId: fuzzyMatchDonor(p.name, donors),
        amount: p.amount,
        categoryId: defaultCat,
        paymentMethod: defaultPaypalMethod,
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
          paymentMethod: row.paymentMethod,
          checkNumber: null,
          notes: 'Imported from PayPal screenshot',
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
          <h3 className="text-lg font-semibold">Import from PayPal Screenshot</h3>
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
              <p className="text-gray-600 font-medium">Drop a PayPal screenshot here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
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

              <p className="text-sm text-gray-500 mb-3">
                Found <strong>{rows.length}</strong> transaction{rows.length !== 1 ? 's' : ''}. Review and fix any mismatches before importing.
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
