# Fix für readInstagram() im API-Skript (server.js)

## Problem
`impressionen` zeigt `"0"` obwohl es Daten in der DB gibt.

### Ursache
Die `readInstagram`-Funktion liest `SUM(reach)` und `SUM(impressions)` **nur** aus der
`instagram_top_posts`-Tabelle. Die `impressions`-Spalte dort enthält aber 0, weil das
Fetching-Skript die `views`-Daten nicht korrekt von der Instagram Graph API geholt hat
(leerer `if`-Block bei `entry.total_value`).

## Fix im API-Skript

Ersetze diesen Block in `readInstagram()`:

```js
// ALT:
let totalReach = 0, totalImpr = 0;
if (hasPosts) {
    const [sumRows] = await db.query(`SELECT SUM(reach) as totalReach, SUM(impressions) as totalImpr FROM \`${pt}\``);
    if (sumRows.length > 0) {
      totalReach = sumRows[0].totalReach || 0;
      totalImpr = sumRows[0].totalImpr || 0;
    }
}
```

mit:

```js
// NEU: Reichweite und Impressionen aus BEIDEN Tabellen lesen, Stats hat Priorität
let totalReach = 0, totalImpr = 0;

// 1. Primär: Tägliche Stats-Tabelle (Account-Level reach + impressions)
if (hasStats) {
    const [sumRows] = await db.query(
      `SELECT SUM(reach) as totalReach, SUM(impressions) as totalImpr FROM \`${st}\``
    );
    if (sumRows.length > 0) {
      totalReach = sumRows[0].totalReach || 0;
      totalImpr = sumRows[0].totalImpr || 0;
    }
}

// 2. Fallback: Posts-Tabelle, wenn Stats 0 liefert
if (hasPosts && (totalReach === 0 || totalImpr === 0)) {
    const [sumRows] = await db.query(
      `SELECT SUM(reach) as totalReach, SUM(impressions) as totalImpr FROM \`${pt}\``
    );
    if (sumRows.length > 0) {
      if (totalReach === 0) totalReach = sumRows[0].totalReach || 0;
      if (totalImpr === 0) totalImpr = sumRows[0].totalImpr || 0;
    }
}
```

## Fix im Fetching-Skript (bereits angewandt)
Die Datei `fetch-data-insta.js` wurde bereits gefixt:
- `views`-Metric wird jetzt zuerst ohne `metric_type` (als `period=day`) abgefragt
- Falls das fehlschlägt, wird `metric_type=total_value` als Fallback mit korrektem
  Parsing der `breakdowns`-Struktur verwendet
- Der vorherige leere `if (entry.total_value) {}` Block wurde entfernt

