import { ActiveModal } from '../types';

interface FooterProps {
  onOpenModal: (modal: ActiveModal) => void;
}

export default function Footer({ onOpenModal }: FooterProps) {
  return (
    <footer id="main-footer" className="w-full bg-white border-t border-neutral-100/90 py-6 text-xs text-neutral-500 mt-auto">
      <div className="px-4 sm:px-6 md:px-10 lg:px-12 flex items-center">
        {/* Spacer matching exact logo width on desktop */}
        <div className="w-[120px] sm:w-[140px] md:w-[160px] shrink-0 hidden md:block" />

        <div className="w-full max-w-[660px] ml-0 md:ml-6 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-700">baky one</span>
            <span>•</span>
            <span>Bez ukladania histórie dotazov</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              id="footer-about-btn"
              onClick={() => onOpenModal('about')}
              className="hover:text-neutral-900 transition-colors cursor-pointer"
            >
              Pomoc
            </button>
            <button
              type="button"
              id="footer-privacy-btn"
              onClick={() => onOpenModal('privacy')}
              className="hover:text-neutral-900 transition-colors cursor-pointer"
            >
              Súkromie
            </button>
            <button
              type="button"
              id="footer-settings-btn"
              onClick={() => onOpenModal('settings')}
              className="hover:text-neutral-900 transition-colors cursor-pointer"
            >
              Nastavenia
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
