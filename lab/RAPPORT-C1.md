# Ligue des champions : modèle et test

## Pourquoi un modèle à part
Le modèle des championnats (v2) compare des équipes **du même championnat**. En C1, les clubs viennent de pays différents : il faut une échelle commune.

## Le modèle : Elo européen
- Un seul classement Elo pour tous les clubs, alimenté par les matchs de championnat (1re division) de 19 pays et par la C1, depuis 2017.
- Les matchs nationaux font bouger les clubs à l'intérieur d'un pays ; les matchs de C1 font circuler les points entre pays.
- Un club qui apparaît pour la première fois démarre au niveau de départ de son pays (réglé sur les C1 2018-2021, prudence choisie sur 2021-2023) ou au bas de son championnat (promu).
- Norvège, Pologne, Roumanie : absents de la C1 pendant le réglage, niveau fixé à celui des pays comparables (1420).
- 1N2 : modèle ordonné sur l'écart Elo (avantage du terrain en C1 ≈ 99 points, nul en finale). Buts attendus : régression de Poisson sur l'écart Elo (réglée sur 2023-26, format à 36 clubs).
- Sources : football-data.co.uk (championnats), openfootball (C1 2017-2026), football-data.org (C1 en cours).

## Test (matchs jamais vus pendant le réglage : C1 2023-24 à 2026-27, 537 matchs)
| | Brier | Log-loss |
|---|---|---|
| Elo européen (publié) | **0,530** | **0,902** |
| Elo sans niveau de départ par pays | 0,537 | 0,912 |
| Prévision naïve (fréquences 1/N/2) | 0,614 | 1,016 |

Écart avec la prévision naïve : −0,084 (IC 95 % : −0,113 à −0,056), significatif.
Calibration (annoncé / observé) : 13/12, 25/27, 42/42, 58/52, 72/76, 86/88 %.

Marchés (test) : +2,5 buts et « les deux marquent » à peine mieux que la moyenne → badge « fiabilité faible ». Mi-temps et score exact : non testés sur la C1.

## Limites
- Aucune cote de bookmaker disponible pour la C1 : impossible de comparer au marché.
- Les clubs de pays sans championnat suivi (Tchéquie, Croatie, Chypre, Kazakhstan…) ne sont notés que sur leurs matchs de C1.
- Le modèle ignore compositions et blessures.

Scripts : `scripts/lab-ucl.mjs` (sources), `scripts/lab-ucl-data.mjs` (championnats), `scripts/lab-ucl-fit.mjs` (réglage, test, graine `data/ucl-seed.json`), `scripts/ucl-lib.mjs` (code partagé avec le robot).
