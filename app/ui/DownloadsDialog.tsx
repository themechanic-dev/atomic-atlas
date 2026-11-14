// The web version's downloads: the app for Android, Linux and Windows, from GitHub. On a
// computer the Android app comes as a QR code to scan with the phone; on a phone, as a
// button. An iPhone has no app: the web version is the way there.

import { t } from '../i18n';
import { openExternal } from '../lib/platform';
import { qrPath } from '../lib/qr';
import { deviceKind, downloadLinks } from '../state/downloads';
import { Dialog } from './controls';

function Download({ href, label, hint, testId }: { href: string; label: string; hint: string; testId: string }) {
  return (
    <div class="download">
      <a class="btn btn-primary" href={href} rel="noopener" data-testid={testId}>
        {label}
      </a>
      <p class="hint">{hint}</p>
    </div>
  );
}

export function DownloadsDialog({ onClose }: { onClose: () => void }) {
  const links = downloadLinks.value;
  if (!links) return null;
  const device = deviceKind();
  const qr = qrPath(links.apk);
  return (
    <Dialog title={t('downloads.title')} onClose={onClose} testId="downloads-dialog">
      <p class="hint">{t('downloads.intro')}</p>
      {device === 'ios' ? (
        <p class="downloads-ios" data-testid="downloads-ios">
          {t('downloads.ios')}
        </p>
      ) : device === 'android' ? (
        <Download href={links.apk} label={t('downloads.apk')} hint={t('downloads.apk.hint')} testId="download-apk" />
      ) : (
        <>
          <div class="downloads-qr">
            <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} width="168" height="168" role="img" aria-label={t('downloads.qr')} data-testid="download-qr" shape-rendering="crispEdges">
              <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
            <div>
              <strong>{t('downloads.qr')}</strong>
              <p class="hint">{t('downloads.qr.hint')}</p>
              <p class="hint">{t('downloads.apk.hint')}</p>
            </div>
          </div>
          <Download href={links.deb} label={t('downloads.deb')} hint={t('downloads.deb.hint')} testId="download-deb" />
          <Download href={links.exe} label={t('downloads.exe')} hint={t('downloads.exe.hint')} testId="download-exe" />
        </>
      )}
      <p class="downloads-code">
        <button type="button" class="link" onClick={() => openExternal(links.code)} data-testid="download-code">
          {t('downloads.code')}
        </button>
      </p>
    </Dialog>
  );
}
