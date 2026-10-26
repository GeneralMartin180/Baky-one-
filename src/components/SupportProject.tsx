import { useState } from 'react';
import { Check, Copy, Heart, X } from 'lucide-react';
import { useDialog } from './useDialog';

const IBAN = 'SK89 0200 0000 0072 8156 1753';

function SupportDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog(onClose);
  const [copyState, setCopyState] = useState<'idle' | 'pending' | 'copied' | 'failed'>('idle');

  const copyIban = async () => {
    setCopyState('pending');
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(IBAN.replace(/ /g, ''));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-xs" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="support-title" aria-describedby="support-description" tabIndex={-1} className="relative w-full max-w-sm overflow-y-auto rounded-[28px] border border-[#e8eaed] bg-white p-6 shadow-2xl max-h-[calc(100dvh-32px)]">
        <button type="button" onClick={onClose} aria-label="Zavrieť podporu projektu" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"><X className="h-5 w-5" /></button>
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff1ee] text-[#d64d3c]"><Heart className="h-6 w-6" aria-hidden="true" /></div>
        <h2 id="support-title" className="text-2xl font-semibold tracking-tight text-[#202124]">Malý príspevok.<br />Veľká podpora.</h2>
        <p id="support-description" className="mb-6 mt-3 text-sm leading-relaxed text-[#5f6368]">Páči sa ti Baky One? Podpor jeho ďalší rozvoj ľubovoľnou sumou. Každý príspevok pomáha open-source projektu rásť.</p>
        <div className="rounded-2xl border border-[#e8eaed] bg-[#f8f9fa] p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#70757a]">Bankový prevod · IBAN</p>
          <p className="select-all break-words font-mono text-[15px] font-medium leading-relaxed text-[#202124]">{IBAN}</p>
        </div>
        <button type="button" onClick={copyIban} disabled={copyState === 'pending'} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#202124] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3c4043] disabled:opacity-60">
          {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyState === 'copied' ? 'IBAN skopírovaný' : copyState === 'pending' ? 'Kopírujem…' : 'Skopírovať IBAN'}
        </button>
        <p role={copyState === 'failed' ? 'alert' : 'status'} className="mt-3 text-center text-xs leading-relaxed text-[#70757a]">{copyState === 'failed' ? 'Kopírovanie sa nepodarilo. Označ a skopíruj IBAN vyššie.' : copyState === 'copied' ? 'Vlož IBAN do svojej bankovej aplikácie. Ďakujeme za podporu!' : 'Dobrovoľná podpora. Sumu si zvolíš vo svojej banke.'}</p>
      </div>
    </div>
  );
}

export default function SupportProject() {
  const [open, setOpen] = useState(false);
  return <>
    <button id="support-project-button" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex min-h-11 items-center gap-2 rounded-full border border-[#e8eaed] bg-white px-4 text-[13px] font-medium text-[#202124] shadow-[0_4px_20px_rgba(32,33,36,0.12)] transition-colors hover:border-[#f0beb5] hover:bg-[#fff7f5] sm:right-6 sm:bottom-6 print:hidden">
      <Heart className="h-4 w-4 fill-[#fce3dd] text-[#d64d3c]" aria-hidden="true" />Support us
    </button>
    {open && <SupportDialog onClose={() => setOpen(false)} />}
  </>;
}
