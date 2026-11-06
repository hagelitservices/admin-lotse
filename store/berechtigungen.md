# Berechtigungen und ihre Begründung

Rahmen E3, Spez. §8. **Test U-40 liest diese Tabelle:** Jedes Recht und jede Herkunft im gebauten Manifest braucht
hier eine Zeile (erstes Code-Stück der ersten Spalte), jede Zeile ein Recht oder eine Herkunft im Manifest, und jede
Zeile steht wortgleich in Spez. §8. Die Begründungen gehen wörtlich (übersetzt) in
die Felder „Begründung der Berechtigung“ beider Stores.

| Recht | Warum | Warum nicht weniger |
|---|---|---|
| `sidePanel` | Die Erklärung erscheint neben dem Portal, ohne die Microsoft-Seite zu verändern. | Ein Popup schließt sich bei jedem Klick ins Portal; Sandra müsste es für jede Einstellung neu öffnen. |
| `storage` | Merkt sich, welche Hinweise der Nutzer ausgeblendet hat, und liest Firmeneinstellungen (`storage.managed`). Zustand je Tab nur in `storage.session`. | – |
| Host `https://admin.cloud.microsoft/*` | Seite erkennen und angezeigte Werte lesen — Microsoft 365 Admin Center und Exchange Admin Center (`/exchange`) laufen unter dieser Adresse; `admin.microsoft.com` und `admin.exchange.microsoft.com` leiten nur dorthin um und bekommen kein Recht (H2, 05.11.2026). | `activeTab` gilt nur nach einem Klick und nur bis zur nächsten Navigation. Der Lotse soll beim Blättern im Portal mitgehen und die Abweichungszahl am Symbol zeigen, bevor jemand klickt. |
| Host `https://entra.microsoft.com/*` | wie oben | wie oben |
| Host `https://intune.microsoft.com/*` | wie oben | wie oben |
| Rahmen-Herkunft `https://*.reactblade.portal.azure.net/*` (H2: `sandbox-1` bis `sandbox-3`, Nummer wechselt je Laden; nur in `content_scripts.matches`) | Microsoft zeigt Einstellungen von Entra und Intune in eingebetteten Rahmen dieser Herkünfte. Das Skript liest dort nur, wenn der oberste Rahmen eines der vier Portale ist (`location.ancestorOrigins`), sonst beendet es sich sofort. | Ohne diese Herkunft wären die meisten Entra- und Intune-Werte unlesbar. |

**Bewusst nicht** (U-41 schlägt fehl, wenn eines davon im Manifest steht): `tabs`, `scripting`, `webRequest`,
`webNavigation`, `cookies`, `downloads`, `<all_urls>`, `activeTab`, `optional_host_permissions` (in 1.0).

**Ohne eigenes Recht:** Tastenkürzel (`commands`, Alt+Umschalt+L öffnet den Lotsen), Optionsseite, Firmenmodus über
`storage.managed` (Teil von `storage`).
