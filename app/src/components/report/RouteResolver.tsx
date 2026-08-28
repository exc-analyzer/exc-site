import { useEffect, useState } from 'react';
import ReportPage from './ReportPage';
import { Card, Empty } from '../console/ui';

/**
 * Bilinmeyen bir adrese düşüldüğünde ne gösterileceğine karar verir.
 *
 * Rapor adresleri derin yollar: /app/r/<sahip>/<depo>/<komut>
 * Bunlar üretimde Firebase yönlendirmesiyle doğrudan rapor sayfasına düşüyor.
 * Geliştirme sunucusunda öyle bir kural yok; Astro bilinmeyen adres için bu
 * 404 sayfasını sunuyor. Burada adresi tanıyıp raporu göstererek geliştirme
 * ile üretim arasındaki farkı kapatıyoruz.
 *
 * Astro'nun geliştirme sunucusuna ara katman eklemek denendi (Vite eklentisi,
 * astro:server:setup kancası, connect yığınının başına ekleme) — üçü de
 * çalışmadı, yönlendirici isteği ara katmandan önce karşılıyor.
 */
export default function RouteResolver() {
  const [isReport, setIsReport] = useState<boolean | null>(null);

  useEffect(() => {
    setIsReport(/^\/app\/(r|u)\//.test(window.location.pathname));
  }, []);

  if (isReport === null) return null;
  if (isReport) return <ReportPage />;

  return (
    <Card>
      <div className="px-6 py-10">
        <Empty>
          Böyle bir sayfa yok.{' '}
          <a href="/app/" className="text-sky-400 hover:underline">
            Uygulamaya dön
          </a>
        </Empty>
      </div>
    </Card>
  );
}
