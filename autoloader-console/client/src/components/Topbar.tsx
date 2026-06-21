import { useLocation, useNavigate } from 'react-router';
import { Button } from '@databricks/appkit-ui/react';
import { Menu, Plus, ChevronRight } from 'lucide-react';
import { useLanguage } from '../i18n/context';
import { LANGS } from '../i18n/translations';
import { NAV_VIEWS } from '../nav';

/** Top chrome: breadcrumb, Framework-active indicator, ES/EN toggle, New operation CTA. */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = NAV_VIEWS.find((v) => v.path === pathname) ?? NAV_VIEWS[0];

  return (
    <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenNav}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">{t('nav.open')}</span>
      </Button>

      {/* Breadcrumb: scotia_latam > <view> */}
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="font-mono text-muted-foreground">{t('chrome.breadcrumbRoot')}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-semibold text-foreground">{t(view.titleKey)}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Framework active */}
        <span className="hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:inline-flex">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: '#22c38e', boxShadow: '0 0 6px #22c38e' }}
          />
          {t('chrome.frameworkActive')}
        </span>

        {/* Language toggle */}
        <div className="inline-flex overflow-hidden rounded-md border">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                lang === l ? 'text-white' : 'text-muted-foreground hover:bg-muted'
              }`}
              style={lang === l ? { background: '#ec111a' } : undefined}
            >
              {l}
            </button>
          ))}
        </div>

        {/* New operation CTA */}
        <Button
          onClick={() => {
            void navigate('/onboarding');
          }}
          className="bg-[#ec111a] text-white hover:bg-[#c20f17]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('chrome.newOperation')}</span>
        </Button>
      </div>
    </header>
  );
}
