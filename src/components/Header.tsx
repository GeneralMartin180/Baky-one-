import { useState } from 'react';
import { Shield, Github, Settings, Info, Menu, X } from 'lucide-react';
import { ActiveModal } from '../types';
import { BakyOneLogo } from './SearchHome';

interface HeaderProps {
  onOpenModal: (modal: ActiveModal) => void;
  showCompactLogo?: boolean;
  onLogoClick?: () => void;
  brandTitle?: string;
}

export default function Header({
  onOpenModal,
  showCompactLogo = false,
  onLogoClick,
  brandTitle = 'baky one',
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      id="main-header"
      className="w-full bg-white sticky top-0 z-30 transition-colors border-b border-neutral-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left Side: Logo in crisp black */}
        <div className="flex items-center gap-3">
          {showCompactLogo ? (
            <button
              id="header-brand-logo-btn"
              onClick={onLogoClick}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
            >
              <BakyOneLogo className="w-7 h-7 shrink-0" />
              <span className="font-bold text-xl tracking-tight text-neutral-950 group-hover:text-neutral-700 transition-colors lowercase">
                {brandTitle}
              </span>
            </button>
          ) : (
            <span className="text-xs text-neutral-400 font-medium tracking-wide">
              Privacy-First Search
            </span>
          )}
        </div>

        {/* Right Side: Normal Menu */}
        <nav id="desktop-nav-menu" className="hidden md:flex items-center gap-2 text-xs">
          <button
            id="nav-about-btn"
            onClick={() => onOpenModal('about')}
            className="px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-neutral-400" />
            O projekte
          </button>

          <button
            id="nav-privacy-btn"
            onClick={() => onOpenModal('privacy')}
            className="px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            Súkromie
          </button>

          <button
            id="nav-opensource-btn"
            onClick={() => onOpenModal('opensource')}
            className="px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Github className="w-3.5 h-3.5 text-neutral-700" />
            Open Source
          </button>

          <div className="h-3.5 w-px bg-neutral-200 mx-1" />

          <button
            id="nav-settings-btn"
            onClick={() => onOpenModal('settings')}
            className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            title="Nastavenia"
            aria-label="Nastavenia"
          >
            <Settings className="w-4 h-4" />
          </button>
        </nav>

        {/* Mobile Hamburger Button */}
        <div className="md:hidden flex items-center gap-1">
          <button
            id="mobile-settings-btn"
            onClick={() => onOpenModal('settings')}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg"
            aria-label="Nastavenia"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            id="mobile-hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-neutral-600 hover:text-neutral-900 rounded-lg"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          className="md:hidden border-t border-neutral-100 bg-white px-4 py-3 space-y-1.5 text-xs shadow-md"
        >
          <button
            id="mobile-menu-about-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenModal('about');
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
          >
            <Info className="w-4 h-4 text-neutral-400" />
            O projekte BuckyOne
          </button>

          <button
            id="mobile-menu-privacy-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenModal('privacy');
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            Zásady súkromia
          </button>

          <button
            id="mobile-menu-opensource-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenModal('opensource');
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
          >
            <Github className="w-4 h-4 text-neutral-700" />
            Open Source
          </button>

          <button
            id="mobile-menu-settings-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenModal('settings');
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-neutral-400" />
            Nastavenia
          </button>
        </div>
      )}
    </header>
  );
}
