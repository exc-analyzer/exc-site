# EXC Analyzer - Web Sitesi

[exc-analyzer.web.app](https://exc-analyzer.web.app) adresinde yayinlanan site.
[EXC Analyzer CLI](https://github.com/exc-analyzer/exc) projesinin web yuzu.

## Yapi

| Yol | Ne |
|---|---|
| `public/` | **Deploy edilen klasor** - `firebase.json` bunu yayinlar |
| `public/index.html` | Sitenin tamami (tek dosya) |
| `public/posts.json` | Blog yazilari |
| `public/images/tutorial/` | Rehber videolarinin poster gorselleri |
| `firebase.json` | Hosting: yonlendirmeler, onbellek, guvenlik basliklari |
| kokteki `index.html`, `logo.png`, `favicon.png` | `public/` icindekilerin eski kopyalari. **Gecerli olan `public/` icindekiler.** Ikisi birbirinden ayrisabilir; birlestirilmeli. |

## Yayinlama

    firebase deploy --only hosting

## Bant genisligi notu (onemli)

Firebase Hosting ucretsiz katmani **gunde 360 MB** transfer veriyor.

- Rehber videolari (`*.mp4`, ~107 MB) depoda tutulmuyor. Yerel diskte durur,
  YouTube'a tasinana kadar deploy bu makineden yapilmalidir.
- Videolar `preload="none"` + `IntersectionObserver` ile **sadece ekrana girdiginde**
  indirilir. Onceden `autoplay` + `preload="auto"` vardi: her ziyaretci sayfayi acar
  acmaz 107 MB cekiyordu ve gunluk kota birkac ziyaretcide tukenip site kapaniyordu.
- Video alani yuklenene kadar bos kalmasin diye `poster` olarak
  `images/tutorial/*.svg` gorselleri kullaniliyor (dosya basi ~1.8 KB).

## Yol haritasi

Bu depo, planlanan topluluk platformunun temeli olacak: `/app` altinda GitHub ile
giris, tarayicida calisan repo analizi, paylasilabilir rapor sayfalari ve yorumlar.
Statik varliklar jsDelivr uzerinden bu depodan servis edilecek.
