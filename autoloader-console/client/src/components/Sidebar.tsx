import { NavLink } from 'react-router';
import { useLanguage } from '../i18n/context';
import { NAV_VIEWS } from '../nav';

function navItemClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-[#ec111a] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ');
}

/** Left sidebar: Scotiabank brand, the five Console views, and a user-card placeholder. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <img
          src="/scotiabank-logo.png"
          alt="Scotiabank"
          width={30}
          height={30}
          className="rounded"
        />
        <div className="leading-tight">
          <div className="text-sm font-bold text-foreground">{t('brand.wordmark')}</div>
          <div className="text-[10px] tracking-wide text-muted-foreground">
            {t('brand.subtitle')}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="px-2 pb-2 text-[10px] font-semibold tracking-wider text-muted-foreground">
          {t('nav.section')}
        </div>
        <div className="flex flex-col gap-0.5">
          {NAV_VIEWS.map((view) => {
            const Icon = view.icon;
            return (
              <NavLink
                key={view.path}
                to={view.path}
                end={view.path === '/'}
                className={navItemClass}
                onClick={onNavigate}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(view.navKey)}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* User card (placeholder) */}
      <div className="flex items-center gap-2.5 border-t px-4 py-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #ec111a, #ed431d)' }}
        >
          DM
        </div>
        <div className="leading-tight">
          <div className="text-xs font-semibold text-foreground">{t('user.name')}</div>
          <div className="text-[10px] text-muted-foreground">{t('user.role')}</div>
        </div>
      </div>
    </div>
  );
}
