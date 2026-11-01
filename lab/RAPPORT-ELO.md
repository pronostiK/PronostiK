# Étude Elo : Poisson v2 (A), Elo (B), hybride (C)

Généré par `scripts/lab-elo.mjs` (branche `experience-elo`). La production n'est pas modifiée.

## Synthèse

- **B (Elo seul) contre A (v2)** : écart de Brier −0,0010 [−0,0066 ; +0,0045], soit non significatif ; log-loss −0,0025 [−0,0108 ; +0,0058].
- **C (hybride) contre A (v2)** : Brier −0,0035 [−0,0064 ; −0,0006], soit meilleur ; log-loss −0,0054 [−0,0101 ; −0,0008].
- **C contre le marché** : Brier +0,0133 [+0,0082 ; +0,0184], soit moins bon.
- Les écarts sont des différences appariées (négatif = mieux que la référence), avec un IC à 95 %, sur 2080 matchs de test.

## Protocole

- **Elo** : une note par équipe et par championnat. Avantage du terrain H. Mise à jour pondérée par l'écart de buts (1 ; 1,5 ; (11+n)/8). Un promu démarre à la moyenne des 3 plus faibles notes. Rappel vers la moyenne à chaque 1er août. Les matchs d'une même date sont prédits avant d'intégrer leurs résultats.
- **Conversion en probabilités 1/N/2** : logit ordonné sur l'écart de notes.
- **Hybride** : mélange log-linéaire des probabilités v2 et Elo, plus deux constantes (domicile, nul).
- **Réglages** : uniquement sur 1698 matchs de la saison 2024-25 (DEV). Grille de 45 combinaisons (K, H, rappel), retenue : K = 20, H = 80, rappel = 1. Hybride : poids v2 = 0.751, poids Elo = 0.399.
- **Test final** : 2080 matchs à partir du 2025-08-01 (les mêmes que dans les autres études), évalués une seule fois, sur les mêmes matchs pour A, B, C et le marché.

## Résultats sur le test final

| Championnat | n | Brier A | Brier B | Brier C | Brier marché | B − A [IC 95 %] | C − A [IC 95 %] | C − marché [IC 95 %] |
|---|---|---|---|---|---|---|---|---|
| **Tous** | 2080 | 0,5944 | 0,5934 | 0,5909 | 0,5776 | −0,0010 [−0,0066 ; +0,0045] | −0,0035 [−0,0064 ; −0,0006] | +0,0133 [+0,0082 ; +0,0184] |
| Ligue 1 | 366 | 0,6016 | 0,5987 | 0,5998 | 0,5812 | −0,0030 [−0,0143 ; +0,0084] | −0,0018 [−0,0083 ; +0,0047] | +0,0187 [+0,0067 ; +0,0306] |
| Premier League | 445 | 0,6212 | 0,6280 | 0,6199 | 0,6062 | +0,0068 [−0,0068 ; +0,0203] | −0,0013 [−0,0081 ; +0,0055] | +0,0137 [+0,0024 ; +0,0250] |
| Bundesliga | 354 | 0,5845 | 0,5761 | 0,5788 | 0,5643 | −0,0084 [−0,0210 ; +0,0041] | −0,0057 [−0,0124 ; +0,0011] | +0,0146 [+0,0021 ; +0,0270] |
| Serie A | 458 | 0,5831 | 0,5759 | 0,5767 | 0,5698 | −0,0073 [−0,0178 ; +0,0033] | −0,0064 [−0,0121 ; −0,0008] | +0,0069 [−0,0037 ; +0,0175] |
| La Liga | 457 | 0,5817 | 0,5866 | 0,5792 | 0,5650 | +0,0049 [−0,0084 ; +0,0182] | −0,0025 [−0,0093 ; +0,0044] | +0,0141 [+0,0033 ; +0,0250] |

### Log-loss

| Championnat | Log-loss A | Log-loss B | Log-loss C | Log-loss marché | B − A [IC 95 %] | C − A [IC 95 %] |
|---|---|---|---|---|---|---|
| **Tous** | 0,9973 | 0,9948 | 0,9919 | 0,9714 | −0,0025 [−0,0108 ; +0,0058] | −0,0054 [−0,0101 ; −0,0008] |
| Ligue 1 | 1,0054 | 1,0012 | 1,0023 | 0,9749 | −0,0043 [−0,0214 ; +0,0129] | −0,0032 [−0,0136 ; +0,0073] |
| Premier League | 1,0352 | 1,0423 | 1,0315 | 1,0101 | +0,0072 [−0,0132 ; +0,0276] | −0,0037 [−0,0143 ; +0,0070] |
| Bundesliga | 0,9848 | 0,9711 | 0,9759 | 0,9542 | −0,0136 [−0,0328 ; +0,0055] | −0,0088 [−0,0197 ; +0,0021] |
| Serie A | 0,9812 | 0,9705 | 0,9723 | 0,9609 | −0,0106 [−0,0264 ; +0,0051] | −0,0089 [−0,0181 ; +0,0003] |
| La Liga | 0,9799 | 0,9862 | 0,9770 | 0,9548 | +0,0063 [−0,0132 ; +0,0258] | −0,0029 [−0,0136 ; +0,0078] |

## Calibration (test, issues empilées)

Pente de calibration (1 = parfait, au-dessus de 1 = trop prudent) : A 1.13, B 0.92, C 1.01, marché 1.14.

| Tranche | A : annoncé → observé | B : annoncé → observé | C : annoncé → observé |
|---|---|---|---|
| 0–20 % | 15.6 → 14.8 % (n = 691) | 14.3 → 15.0 % (n = 1183) | 14.5 → 14.6 % (n = 992) |
| 20–30 % | 24.9 → 24.5 % (n = 2660) | 25.8 → 27.4 % (n = 2545) | 25.7 → 25.7 % (n = 2479) |
| 30–40 % | 34.6 → 32.6 % (n = 1134) | 34.9 → 34.4 % (n = 758) | 34.2 → 33.9 % (n = 1060) |
| 40–50 % | 44.6 → 45.5 % (n = 853) | 44.7 → 41.0 % (n = 620) | 44.7 → 45.0 % (n = 705) |
| 50–60 % | 54.5 → 56.2 % (n = 557) | 54.6 → 51.6 % (n = 510) | 54.8 → 52.1 % (n = 491) |
| 60–70 % | 63.8 → 69.2 % (n = 237) | 64.6 → 63.5 % (n = 381) | 64.3 → 66.4 % (n = 330) |
| 70–100 % | 76.0 → 83.3 % (n = 108) | 76.9 → 76.1 % (n = 243) | 77.0 → 80.3 % (n = 183) |

## Limites

- La période de test a déjà été consultée dans des études précédentes (pas pour régler Elo). Les matchs joués après le 1er novembre 2026 serviront de confirmation.
- Elo démarre en août 2023 (début de l'historique). En 2024-25, les notes n'avaient qu'une saison de recul.
- Le réglage d'Elo (45 combinaisons) et de l'hybride (4 paramètres) a été fait sur DEV, avec un léger optimisme sur DEV mais aucun effet sur le test.
