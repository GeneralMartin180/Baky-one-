import { LogOut, CloudSun, ExternalLink } from 'lucide-react';
import { executeEmergencyEscape } from '../services/privacyEphemeralManager';

interface EscapeFloatingButtonProps {
  query?: string;
}

export default function EscapeFloatingButton({ query }: EscapeFloatingButtonProps) {
  return (
    <div
      id="emergency-escape-floating-container"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 select-none print:hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <button
        type="button"
        id="btn-emergency-escape-bottom-right"
        onClick={executeEmergencyEscape}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#d93025] hover:bg-[#c5221f] active:bg-[#a51d24] text-white font-medium text-xs shadow-lg shadow-red-900/25 border border-red-400/40 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer group"
        title="Rýchly únik: Kliknutím otvoríte AccuWeather na novej karte a vymažete vyhľadávanie"
        aria-label="Rýchly únik – otvoriť AccuWeather na novej karte a vymazať vyhľadávanie"
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
          <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        </div>

        <span className="font-semibold tracking-wide uppercase text-[11px]">
          Escape
        </span>

        <span className="hidden sm:inline text-white/80 text-[11px] font-normal">
          · AccuWeather
        </span>

        <ExternalLink className="w-3.5 h-3.5 text-white/80" />

        <CloudSun className="w-3.5 h-3.5 text-amber-200" />
      </button>
    </div>
  );
}
