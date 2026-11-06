import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

interface DonorOption {
  id: number;
  firstName: string;
  lastName: string;
  spouseName?: string | null;
  envelopeNumber: string | null;
  offeringCount?: number;
  isActive?: boolean;
}

interface DonorPickerProps {
  donors: DonorOption[];
  value: string;
  onChange: (donorId: string) => void;
  required?: boolean;
  compact?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

export function DonorPicker({ donors, value, onChange, required, compact, triggerRef }: DonorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedDonor = donors.find((d) => String(d.id) === value);

  const sortByEnvelope = (list: DonorOption[]) =>
    [...list].sort((a, b) => {
      const aNum = a.envelopeNumber ? parseInt(a.envelopeNumber, 10) : Infinity;
      const bNum = b.envelopeNumber ? parseInt(b.envelopeNumber, 10) : Infinity;
      if (aNum !== bNum) return aNum - bNum;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });

  const sortByOfferingFrequency = (list: DonorOption[]) =>
    [...list].sort((a, b) => {
      const aCount = a.offeringCount ?? 0;
      const bCount = b.offeringCount ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });

  const normalizeText = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

  const matchesSearch = (donor: DonorOption, rawSearch: string) => {
    const term = normalizeText(rawSearch);
    if (!term) return true;
    const first = normalizeText(donor.firstName);
    const last = normalizeText(donor.lastName);
    const firstLast = `${first} ${last}`;
    const lastFirst = `${last} ${first}`;
    return (
      first.includes(term) ||
      last.includes(term) ||
      firstLast.includes(term) ||
      lastFirst.includes(term) ||
      (donor.spouseName ? normalizeText(donor.spouseName).includes(term) : false) ||
      (donor.envelopeNumber ? normalizeText(donor.envelopeNumber).includes(term) : false)
    );
  };

  const filteredBase = search ? donors.filter((d) => matchesSearch(d, search)) : donors;
  const activeFiltered = filteredBase.filter((d) => d.isActive !== false);
  const inactiveFiltered = filteredBase.filter((d) => d.isActive === false);
  const isNumericSearch = search !== '' && /^\d+$/.test(search.trim());
  const sortForSearch = isNumericSearch ? sortByEnvelope : sortByOfferingFrequency;
  const filtered = search
    ? [...sortForSearch(activeFiltered), ...sortForSearch(inactiveFiltered)]
    : [...sortByEnvelope(activeFiltered), ...sortByEnvelope(inactiveFiltered)];
  const activeCount = activeFiltered.length;

  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateDropdownPos = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (open) updateDropdownPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateDropdownPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (donorId: number) => {
    onChange(String(donorId));
    setOpen(false);
    setSearch('');
  };

  const handleOpen = () => {
    setOpen(true);
    setSearch('');
    setHighlightIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const displayText = selectedDonor
    ? `${selectedDonor.lastName}, ${selectedDonor.firstName}${selectedDonor.spouseName ? ` & ${selectedDonor.spouseName}` : ''}${selectedDonor.envelopeNumber ? ` (#${selectedDonor.envelopeNumber})` : ''}`
    : '';

  const baseInputClass = compact ? 'input py-1 text-sm' : 'input';

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for form validation */}
      {required && (
        <input
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0"
          value={value}
          required
          onChange={() => {}}
        />
      )}

      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          className={`${baseInputClass} text-left w-full truncate ${!selectedDonor ? 'text-gray-400' : ''}`}
        >
          {displayText || 'Select donor...'}
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            className={`${baseInputClass} pl-8`}
            placeholder="Type name or envelope #..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setSearch('');
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIdx((prev) => {
                  const next = Math.min(prev + 1, filtered.length - 1);
                  listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                  return next;
                });
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIdx((prev) => {
                  const next = Math.max(prev - 1, 0);
                  listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                  return next;
                });
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = highlightIdx >= 0 ? filtered[highlightIdx] : filtered.length === 1 ? filtered[0] : null;
                if (target) handleSelect(target.id);
              }
            }}
          />
        </div>
      )}

      {open && dropdownPos && createPortal(
        <div
          ref={listRef}
          className="fixed z-[9999] max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 280) }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">No donors match</div>
          ) : (
            filtered.map((d, i) => (
              <div key={d.id}>
                {i === activeCount && inactiveFiltered.length > 0 && (
                  <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">Inactive</div>
                )}
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors flex justify-between items-center ${
                    i === highlightIdx ? 'bg-primary-100 text-primary-800' : String(d.id) === value ? 'bg-primary-50 font-medium text-primary-700' : d.isActive === false ? 'text-gray-400' : 'text-gray-700'
                  }`}
                  onClick={() => handleSelect(d.id)}
                >
                  <span>
                    {d.lastName}, {d.firstName}
                    {d.spouseName && <span className="text-gray-400"> & {d.spouseName}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0 ml-2">
                    {d.envelopeNumber && (
                      <span className="text-xs text-gray-400 font-mono">#{d.envelopeNumber}</span>
                    )}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
