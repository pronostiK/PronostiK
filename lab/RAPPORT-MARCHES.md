# Rapport : autres marchés (audit détaillé)

Généré par `scripts/lab-markets.mjs`. Le moteur et le site ne sont pas modifiés.

## Protocole

- **Réglage (DEV)** : saison 2024-25, 1720 matchs. Les corrections des marchés de buts et les références naïves (fréquences moyennes) y sont estimées.
- **Validation (TEST)** : matchs à partir du 2025-08-01, 2080 matchs, jamais utilisés pour un réglage. Chaque prédiction n'utilise que les matchs antérieurs.
- **Mesures** : Brier binaire (ou à 3 issues pour la mi-temps), log-loss, calibration par tranches. Différences appariées modèle − référence sur les mêmes matchs, IC à 95 %. Négatif = le modèle fait mieux.
- **Marché (bookmakers)** : seulement pour +/- 2,5 buts (cotes moyennes de clôture, marge retirée). Les fichiers ne contiennent pas de cotes pour les autres marchés.

## 1. Marchés de buts (TEST, n = 2080)

| Marché | Version | Brier | Log-loss | Δ Brier vs naïf [IC 95 %] | Δ log-loss vs naïf [IC 95 %] | Verdict (Brier) |
|---|---|---|---|---|---|---|
| Plus de 1,5 but | brut | 0,1749 | 0,5332 | −0,0006 [−0,0037 ; +0,0025] | −0,0025 [−0,0107 ; +0,0057] | non significatif |
| Plus de 1,5 but | recalibré | 0,1734 | 0,5296 | −0,0021 [−0,0038 ; −0,0003] | −0,0060 [−0,0110 ; −0,0010] | meilleur |
| Plus de 2,5 buts | brut | 0,2459 | 0,6847 | −0,0023 [−0,0068 ; +0,0022] | −0,0049 [−0,0143 ; +0,0044] | non significatif |
| Plus de 2,5 buts | recalibré | 0,2443 | 0,6813 | −0,0040 [−0,0074 ; −0,0005] | −0,0083 [−0,0153 ; −0,0012] | meilleur |
| Les deux équipes marquent | brut | 0,2482 | 0,6897 | +0,0004 [−0,0032 ; +0,0040] | +0,0010 [−0,0063 ; +0,0083] | non significatif |
| Les deux équipes marquent | recalibré | 0,2462 | 0,6856 | −0,0015 [−0,0031 ; +0,0001] | −0,0031 [−0,0063 ; +0,0001] | non significatif |

**Plus de 2,5 buts contre les bookmakers** (n = 2080) :

| Version | Brier modèle | Brier marché | Δ Brier [IC 95 %] | Δ log-loss [IC 95 %] |
|---|---|---|---|---|
| brut | 0,2459 | 0,2379 | +0,0080 [+0,0051 ; +0,0110] | +0,0166 [+0,0105 ; +0,0228] |
| recalibré | 0,2443 | 0,2379 | +0,0064 [+0,0038 ; +0,0090] | +0,0133 [+0,0079 ; +0,0187] |

### Calibration (version affichée sur le site : recalibrée)

| Marché | Tranche | n | Annoncé | Observé | ± (erreur type) |
|---|---|---|---|---|---|
| Plus de 1,5 but | 60–70 % | 142 | 67.9 % | 67.6 % | 3.9 |
| Plus de 1,5 but | 70–80 % | 1278 | 75.7 % | 76.2 % | 1.2 |
| Plus de 1,5 but | 80–90 % | 653 | 82.7 % | 81.5 % | 1.5 |
| Plus de 2,5 buts | 0–40 % | 125 | 37.0 % | 44.8 % | 4.4 |
| Plus de 2,5 buts | 40–50 % | 688 | 45.7 % | 48.3 % | 1.9 |
| Plus de 2,5 buts | 50–60 % | 891 | 54.8 % | 56.0 % | 1.7 |
| Plus de 2,5 buts | 60–70 % | 341 | 63.5 % | 62.2 % | 2.6 |
| Plus de 2,5 buts | 70–80 % | 33 | 73.6 % | 84.8 % | 6.2 |

## 2. Résultat à la mi-temps (TEST, n = 2080)

| | Brier | Log-loss |
|---|---|---|
| Modèle | 0,6322 | 1,0427 |
| Référence naïve (fréquences 2024-25) | 0,6557 | 1,0819 |
| Δ modèle − naïf [IC 95 %] | −0,0236 [−0,0303 ; −0,0169] | −0,0392 [−0,0497 ; −0,0288] |

### Calibration de chaque issue

| Issue | Tranche | n | Annoncé | Observé | ± |
|---|---|---|---|---|---|
| 1 (domicile mène) | 0–20 % | 184 | 17.0 % | 17.4 % | 2.8 |
| 1 (domicile mène) | 20–30 % | 676 | 25.8 % | 27.1 % | 1.7 |
| 1 (domicile mène) | 30–40 % | 745 | 34.5 % | 35.0 % | 1.7 |
| 1 (domicile mène) | 40–50 % | 362 | 43.9 % | 47.5 % | 2.6 |
| 1 (domicile mène) | 50–60 % | 90 | 54.0 % | 58.9 % | 5.2 |
| 1 (domicile mène) | 60–100 % | 23 | 64.6 % | 69.6 % | 9.6 |
| N (égalité) | 20–30 % | 42 | 27.3 % | 31.0 % | 7.1 |
| N (égalité) | 30–40 % | 878 | 37.0 % | 36.9 % | 1.6 |
| N (égalité) | 40–50 % | 1125 | 43.5 % | 43.0 % | 1.5 |
| N (égalité) | 50–60 % | 34 | 51.4 % | 55.9 % | 8.5 |
| 2 (extérieur mène) | 0–20 % | 497 | 16.1 % | 13.7 % | 1.5 |
| 2 (extérieur mène) | 20–30 % | 933 | 24.8 % | 22.9 % | 1.4 |
| 2 (extérieur mène) | 30–40 % | 494 | 34.4 % | 33.6 % | 2.1 |
| 2 (extérieur mène) | 40–50 % | 131 | 43.7 % | 48.9 % | 4.4 |
| 2 (extérieur mène) | 50–60 % | 22 | 54.2 % | 40.9 % | 10.5 |

Moyennes globales : annoncé 32.9 % / 40.5 % / 26.5 % · observé 34.5 % / 40.4 % / 25.1 %.

## 3. Score exact (TEST, n = 2080)

Log-loss sur les 17 catégories (16 scores de 0-0 à 3-3, plus « autre ») : modèle 2,6360, référence naïve (fréquences 2024-25) 2,7077, Δ −0,0717 [−0,0890 ; −0,0544].

### Distribution complète : probabilité moyenne annoncée contre fréquence observée

| Score | Annoncé | Observé | n observés | ± |
|---|---|---|---|---|
| 0-0 | 6.8 % | 6.3 % | 131 | 0.5 |
| 0-1 | 8.2 % | 7.3 % | 151 | 0.6 |
| 0-2 | 5.3 % | 5.1 % | 107 | 0.5 |
| 0-3 | 2.5 % | 2.7 % | 56 | 0.4 |
| 1-0 | 9.5 % | 9.1 % | 190 | 0.6 |
| 1-1 | 11.1 % | 11.4 % | 237 | 0.7 |
| 1-2 | 7.0 % | 7.0 % | 145 | 0.6 |
| 1-3 | 3.2 % | 2.7 % | 56 | 0.4 |
| 2-0 | 7.1 % | 6.5 % | 135 | 0.5 |
| 2-1 | 8.1 % | 9.4 % | 195 | 0.6 |
| 2-2 | 5.0 % | 5.6 % | 116 | 0.5 |
| 2-3 | 2.2 % | 2.3 % | 47 | 0.3 |
| 3-0 | 3.8 % | 4.2 % | 88 | 0.4 |
| 3-1 | 4.2 % | 4.7 % | 97 | 0.5 |
| 3-2 | 2.5 % | 2.8 % | 58 | 0.4 |
| 3-3 | 1.1 % | 1.6 % | 33 | 0.3 |
| autre | 12.5 % | 11.4 % | 238 | 0.7 |

### Le score annoncé comme le plus probable

| Probabilité annoncée du score n°1 | n | Annoncé | Réalisé |
|---|---|---|---|
| 0–10 % | 339 | 9.4 % | 9.1 % |
| 10–12 % | 730 | 11.1 % | 10.8 % |
| 12–14 % | 740 | 12.8 % | 13.8 % |
| 14–100 % | 271 | 15.5 % | 15.5 % |

## 4. Ventilation par saison et par championnat (Δ Brier modèle − naïf, version affichée)

Une cellule n'est fiable qu'avec un effectif suffisant : avec moins de 150 matchs, l'intervalle est large.

| Saison | Championnat | n | +1,5 recalibré | +2,5 recalibré | +2,5 vs marché | Mi-temps 1N2 |
|---|---|---|---|---|---|---|
| 2025-26 | Ligue 1 | 302 | +0,0032 [−0,0010 ; +0,0074] | +0,0004 [−0,0078 ; +0,0086] | +0,0136 [+0,0062 ; +0,0210] | −0,0190 [−0,0361 ; −0,0019] |
| 2025-26 | Premier League | 372 | +0,0004 [−0,0023 ; +0,0031] | +0,0037 [−0,0021 ; +0,0096] | +0,0054 [−0,0004 ; +0,0113] | −0,0209 [−0,0337 ; −0,0081] |
| 2025-26 | Bundesliga | 302 | −0,0025 [−0,0065 ; +0,0016] | −0,0105 [−0,0198 ; −0,0012] | +0,0069 [+0,0005 ; +0,0133] | −0,0256 [−0,0461 ; −0,0051] |
| 2025-26 | Serie A | 372 | −0,0050 [−0,0100 ; 0,0000] | −0,0009 [−0,0100 ; +0,0081] | −0,0004 [−0,0062 ; +0,0054] | −0,0265 [−0,0424 ; −0,0107] |
| 2025-26 | La Liga | 369 | −0,0059 [−0,0113 ; −0,0005] | −0,0071 [−0,0168 ; +0,0027] | +0,0041 [−0,0016 ; +0,0097] | −0,0267 [−0,0439 ; −0,0095] |
| 2025-26 | **Tous** | 1717 | −0,0021 [−0,0041 ; −0,0001] | −0,0027 [−0,0065 ; +0,0011] | +0,0056 [+0,0028 ; +0,0083] | −0,0239 [−0,0313 ; −0,0164] |
| 2026-27 | Ligue 1 | 64 | −0,0033 [−0,0114 ; +0,0049] | −0,0059 [−0,0219 ; +0,0101] | +0,0128 [−0,0035 ; +0,0291] | −0,0277 [−0,0573 ; +0,0019] |
| 2026-27 | Premier League | 73 | −0,0036 [−0,0095 ; +0,0023] | −0,0046 [−0,0163 ; +0,0072] | +0,0039 [−0,0090 ; +0,0168] | −0,0095 [−0,0351 ; +0,0162] |
| 2026-27 | Bundesliga | 52 | −0,0064 [−0,0163 ; +0,0035] | −0,0341 [−0,0563 ; −0,0120] | +0,0054 [−0,0142 ; +0,0249] | −0,0343 [−0,0824 ; +0,0137] |
| 2026-27 | Serie A | 86 | +0,0035 [−0,0049 ; +0,0119] | +0,0043 [−0,0136 ; +0,0223] | +0,0134 [−0,0035 ; +0,0303] | −0,0109 [−0,0438 ; +0,0220] |
| 2026-27 | La Liga | 88 | −0,0017 [−0,0108 ; +0,0074] | −0,0170 [−0,0338 ; −0,0002] | +0,0139 [−0,0001 ; +0,0280] | −0,0331 [−0,0661 ; −0,0001] |
| 2026-27 | **Tous** | 363 | −0,0018 [−0,0056 ; +0,0020] | −0,0099 [−0,0176 ; −0,0022] | +0,0104 [+0,0033 ; +0,0174] | −0,0223 [−0,0373 ; −0,0073] |

## Limites

- La validation compte une saison complète plus le début de la suivante : un écart inférieur à environ 0,003 de Brier n'est pas détectable de façon fiable.
- La « référence naïve » est un plancher : la battre montre que le modèle apporte de l'information, pas qu'il bat les bookmakers.
- Pas de cotes de bookmakers dans les fichiers pour la mi-temps, le score exact et « les deux équipes marquent » : la comparaison au marché n'est pas possible pour ces marchés.
- La mi-temps suppose 45 % des buts avant la pause (mesuré : 44.9 % sur 2024-25) et l'indépendance des deux mi-temps.
