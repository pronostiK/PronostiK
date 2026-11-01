# Rapport : segments, erreurs et recalibration

Généré par `scripts/lab-segments.mjs` à partir de `data/history.json`. Le modèle de production n'est pas modifié.

## Protocole

- **Prédictions chronologiques** : chaque match est prédit par le modèle v2 estimé uniquement sur les matchs antérieurs (`m.date < date`).
- **Marché** : cotes moyennes de clôture, marge retirée par normalisation proportionnelle.
- **Échantillon de test** : 2080 matchs de première division depuis le 2025-08-01, avec cotes et prédiction v2. **Échantillon indépendant** : 1698 matchs de la saison 2024-08-01 → 2025-08-01, pour vérifier qu'un segment favorable se répète.
- **Différences appariées** modèle − marché (négatif = modèle meilleur), avec IC à 95 % par approximation normale.
- **Correction de Bonferroni** : 26 segments testés, donc seuil |z| ≥ 3,10 au lieu de 1,96.

## Synthèse

1. **Aucun segment où le modèle bat le marché.** Sur 26 segments, aucun n'a un écart de Brier dont l'IC à 95 % passe entièrement sous zéro, même avant correction. Le marché est meilleur partout, sur le test comme sur l'échantillon indépendant.
2. **Le modèle perd surtout quand il s'écarte du marché.** Quand le désaccord dépasse 10 points, l'écart atteint +0,0519 de Brier ; sous 3 points, il n'est que de +0,0051. Les gros désaccords sont des erreurs du modèle, pas des opportunités.
3. **Erreur systématique principale : le modèle sous-estime les gros favoris.** Quand le favori du marché est à 60 % ou plus, le modèle sous-estime la victoire à domicile de 7,0 points (erreur type 2,2). Sa pente de calibration (1,13) indique des probabilités trop prudentes.
4. **La recalibration chronologique corrige un peu, sans combler l'écart.** Gain de −0,0008 (non significatif) ; il reste +0,0160 de retard sur le marché.
5. **2 080 contre 2156** : la différence vient des 76 matchs prédits par le repli v1 dans le bilan public.

**Conclusion** : avec ces données (résultats passés uniquement), le modèle ne contient pas d'information que les cotes de clôture n'ont pas déjà. Aucune modification n'est justifiée par ces résultats.

## Vue d'ensemble

| Échantillon | n | Brier modèle | Brier marché | Écart Brier [IC 95 %] | Log-loss modèle | Log-loss marché | Écart log-loss [IC 95 %] |
|---|---|---|---|---|---|---|---|
| Test | 2080 | 0,5944 | 0,5776 | +0,0168 [+0,0117 ; +0,0219] | 0,9973 | 0,9714 | +0,0259 [+0,0185 ; +0,0333] |
| Indépendant (saison 2024-25) | 1698 | 0,5894 | 0,5715 | +0,0179 [+0,0122 ; +0,0236] | 0,9882 | 0,9622 | +0,0260 [+0,0176 ; +0,0344] |

## 1–3. Segments

Pour chaque segment, l'écart de Brier est donné sur le test et sur l'échantillon indépendant. Un avantage réel devrait être négatif et significatif **dans les deux**.

### Probabilité du favori (marché)

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| < 45 % | 759 | 0,6711 | 0,6547 | +0,0164 [+0,0086 ; +0,0243] marché meilleur | +0,0234 [+0,0122 ; +0,0346] | 571 | +0,0146 [+0,0046 ; +0,0245] |
| 45–55 % | 586 | 0,6359 | 0,6244 | +0,0115 [+0,0019 ; +0,0211] marché meilleur | +0,0186 [+0,0048 ; +0,0325] | 464 | +0,0153 [+0,0044 ; +0,0263] |
| 55–65 % | 407 | 0,5671 | 0,5498 | +0,0173 [+0,0050 ; +0,0296] marché meilleur | +0,0255 [+0,0078 ; +0,0432] | 326 | +0,0209 [+0,0072 ; +0,0347] |
| ≥ 65 % | 328 | 0,3769 | 0,3501 | +0,0267 [+0,0130 ; +0,0405] marché meilleur | +0,0451 [+0,0241 ; +0,0662] | 337 | +0,0242 [+0,0124 ; +0,0360] |

### Écart de niveau (|λ dom − λ ext| du modèle, tiers)

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| faible (< 0,29) | 693 | 0,6572 | 0,6405 | +0,0167 [+0,0077 ; +0,0258] marché meilleur | +0,0246 [+0,0117 ; +0,0375] | 497 | +0,0146 [+0,0032 ; +0,0260] |
| moyen | 693 | 0,6361 | 0,6233 | +0,0128 [+0,0032 ; +0,0224] marché meilleur | +0,0186 [+0,0049 ; +0,0322] | 549 | +0,0212 [+0,0106 ; +0,0318] |
| fort (≥ 0,67) | 694 | 0,4901 | 0,4692 | +0,0210 [+0,0131 ; +0,0288] marché meilleur | +0,0346 [+0,0227 ; +0,0465] | 652 | +0,0176 [+0,0095 ; +0,0258] |

### Championnat

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| Ligue 1 | 366 | 0,6016 | 0,5812 | +0,0205 [+0,0079 ; +0,0330] marché meilleur | +0,0305 [+0,0124 ; +0,0486] | 294 | +0,0107 [−0,0044 ; +0,0258] |
| Premier League | 445 | 0,6212 | 0,6062 | +0,0150 [+0,0031 ; +0,0268] marché meilleur | +0,0251 [+0,0083 ; +0,0419] | 368 | +0,0122 [−0,0001 ; +0,0245] |
| Bundesliga | 354 | 0,5845 | 0,5643 | +0,0203 [+0,0090 ; +0,0315] marché meilleur | +0,0305 [+0,0140 ; +0,0470] | 298 | +0,0241 [+0,0108 ; +0,0374] |
| Serie A | 458 | 0,5831 | 0,5698 | +0,0133 [+0,0022 ; +0,0244] marché meilleur | +0,0203 [+0,0039 ; +0,0366] | 368 | +0,0197 [+0,0072 ; +0,0321] |
| La Liga | 457 | 0,5817 | 0,5650 | +0,0166 [+0,0062 ; +0,0271] marché meilleur | +0,0251 [+0,0099 ; +0,0404] | 370 | +0,0225 [+0,0113 ; +0,0337] |

### Désaccord max modèle/marché (points)

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| < 3 | 385 | 0,5631 | 0,5580 | +0,0051 [+0,0023 ; +0,0079] marché meilleur | +0,0088 [+0,0042 ; +0,0134] | 282 | +0,0016 [−0,0016 ; +0,0049] |
| 3–6 | 672 | 0,5970 | 0,5940 | +0,0029 [−0,0019 ; +0,0078] | +0,0049 [−0,0026 ; +0,0125] | 567 | +0,0073 [+0,0020 ; +0,0126] |
| 6–10 | 566 | 0,6020 | 0,5890 | +0,0130 [+0,0035 ; +0,0224] marché meilleur | +0,0197 [+0,0058 ; +0,0335] | 487 | +0,0089 [−0,0014 ; +0,0193] |
| ≥ 10 | 457 | 0,6078 | 0,5559 | +0,0519 [+0,0336 ; +0,0703] marché meilleur | +0,0789 [+0,0529 ; +0,1050] | 362 | +0,0592 [+0,0385 ; +0,0799] |

### Sens du désaccord sur la victoire à domicile

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| modèle ≤ −10 pts | 198 | 0,5487 | 0,4867 | +0,0620 [+0,0329 ; +0,0911] marché meilleur | +0,0914 [+0,0496 ; +0,1331] | 179 | +0,0666 [+0,0366 ; +0,0966] |
| −10 à −5 | 331 | 0,5787 | 0,5619 | +0,0168 [+0,0034 ; +0,0303] marché meilleur | +0,0270 [+0,0074 ; +0,0467] | 279 | +0,0016 [−0,0133 ; +0,0165] |
| −5 à +5 | 1054 | 0,5881 | 0,5832 | +0,0049 [+0,0014 ; +0,0083] marché meilleur | +0,0079 [+0,0026 ; +0,0133] | 866 | +0,0050 [+0,0008 ; +0,0092] |
| +5 à +10 | 344 | 0,6173 | 0,6043 | +0,0130 [+0,0003 ; +0,0256] marché meilleur | +0,0194 [+0,0011 ; +0,0377] | 258 | +0,0214 [+0,0080 ; +0,0348] |
| modèle ≥ +10 pts | 153 | 0,6799 | 0,6305 | +0,0494 [+0,0163 ; +0,0825] marché meilleur | +0,0774 [+0,0308 ; +0,1239] | 116 | +0,0705 [+0,0324 ; +0,1086] |

### Favori du marché

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| domicile | 1360 | 0,5842 | 0,5651 | +0,0192 [+0,0130 ; +0,0253] marché meilleur | +0,0293 [+0,0202 ; +0,0384] | 1104 | +0,0184 [+0,0113 ; +0,0256] |
| extérieur | 716 | 0,6133 | 0,6009 | +0,0123 [+0,0032 ; +0,0214] marché meilleur | +0,0193 [+0,0064 ; +0,0322] | 587 | +0,0172 [+0,0075 ; +0,0268] |

### Moment de la saison

| Segment | n test | Brier modèle | Brier marché | Écart Brier test [IC 95 %] | Écart log-loss test [IC 95 %] | n indép. | Écart Brier indép. [IC 95 %] |
|---|---|---|---|---|---|---|---|
| août–octobre | 772 | 0,5832 | 0,5654 | +0,0178 [+0,0090 ; +0,0267] marché meilleur | +0,0275 [+0,0147 ; +0,0402] | 398 | +0,0211 [+0,0095 ; +0,0327] |
| novembre–février | 774 | 0,5959 | 0,5751 | +0,0208 [+0,0135 ; +0,0280] marché meilleur | +0,0321 [+0,0216 ; +0,0426] | 747 | +0,0148 [+0,0067 ; +0,0228] |
| mars–mai | 534 | 0,6086 | 0,5989 | +0,0097 [−0,0014 ; +0,0208] | +0,0147 [−0,0016 ; +0,0310] | 553 | +0,0198 [+0,0088 ; +0,0308] |

**Lecture.** Aucun segment ne montre un avantage du modèle significatif après correction pour comparaisons multiples. Aucun segment n’a même un IC à 95 % entièrement sous zéro. Meilleur segment pour le modèle : « 3–6 », écart +0,0029 [−0,0019 ; +0,0078].

## Calibration (test, issues 1/N/2 empilées)

| Tranche annoncée | n | Modèle : annoncé → observé (± erreur type) | Marché : n | Marché : annoncé → observé |
|---|---|---|---|---|
| 0–20 % | 691 | 15,6 % → 14,8 % (± 1,3) | 1012 | 14,7 % → 12,1 % |
| 20–30 % | 2660 | 24,9 % → 24,5 % (± 0,8) | 2369 | 25,6 % → 25,7 % |
| 30–40 % | 1134 | 34,6 % → 32,6 % (± 1,4) | 1169 | 34,1 % → 32,5 % |
| 40–50 % | 853 | 44,6 % → 45,5 % (± 1,7) | 709 | 44,8 % → 47,7 % |
| 50–60 % | 557 | 54,5 % → 56,2 % (± 2,1) | 473 | 54,8 % → 53,9 % |
| 60–70 % | 237 | 63,8 % → 69,2 % (± 3,0) | 316 | 64,5 % → 69,3 % |
| 70–100 % | 108 | 76,0 % → 83,3 % (± 3,6) | 192 | 76,3 % → 82,3 % |

**Pente de calibration** (régression logistique de l'issue sur logit(p) ; 1 = parfait, < 1 = trop confiant, > 1 = trop prudent) : modèle 1,127, marché 1,139.

## 4. Erreurs systématiques (test) : biais moyen annoncé − observé, en points

Un biais n'est notable que s'il dépasse environ 2 erreurs types (colonne « ± »).

| Groupe | n | Modèle 1 / N / 2 | Marché 1 / N / 2 | ± (1 erreur type) 1 / N / 2 |
|---|---|---|---|---|
| Tous | 2080 | −1,2 / −0,9 / +2,1 | −0,9 / +0,2 / +0,7 | 1,1 / 0,9 / 1,0 |
| Ligue 1 | 366 | −0,9 / −1,4 / +2,3 | −2,9 / −0,1 / +3,0 | 2,6 / 2,3 / 2,4 |
| Premier League | 445 | +1,0 / −3,4 / +2,5 | +1,6 / −2,8 / +1,2 | 2,3 / 2,1 / 2,2 |
| Bundesliga | 354 | −2,2 / −1,5 / +3,7 | −0,4 / −0,2 / +0,7 | 2,6 / 2,3 / 2,5 |
| Serie A | 458 | −1,1 / +1,4 / −0,3 | +0,7 / +2,4 / −3,0 | 2,3 / 2,0 / 2,2 |
| La Liga | 457 | −2,9 / +0,3 / +2,6 | −3,6 / +1,5 / +2,1 | 2,3 / 2,0 / 2,1 |
| Favori marché ≥ 60 % | 508 | −7,0 / +4,1 / +2,9 | −3,3 / +2,1 / +1,2 | 2,2 / 1,6 / 1,9 |
| Match serré (favori < 45 %) | 759 | +1,5 / −3,1 / +1,6 | +0,0 / −0,3 / +0,2 | 1,7 / 1,7 / 1,7 |

## 5. Recalibration chronologique (sans fuite)

On transforme p'_k ∝ exp(t · log p_k + β_k). Les paramètres sont réestimés **au début de chaque mois** de test, avec uniquement les matchs déjà joués (saison 2024-25 et mois de test précédents). Deux versions : « température » (t seul) et « complète » (t + β domicile + β nul). Comparaison appariée match par match (2080 matchs, contrôle : OK).

| Version | Brier | Log-loss | Écart Brier contre marché [IC 95 %] | Écart Brier contre modèle brut [IC 95 %] |
|---|---|---|---|---|
| Modèle brut | 0,5944 | 0,9973 | +0,0168 [+0,0117 ; +0,0219] | — |
| Température | 0,5939 | 0,9966 | +0,0162 [+0,0110 ; +0,0215] | −0,0006 [−0,0016 ; +0,0004] |
| Complète | 0,5936 | 0,9958 | +0,0160 [+0,0106 ; +0,0213] | −0,0008 [−0,0024 ; +0,0007] |
| Marché | 0,5776 | 0,9714 | — | — |

Paramètres du premier et du dernier mois : t = 1,187 → 1,180 ; β domicile = −0,093 → −0,009 ; β nul = 0,126 → 0,152 (détail dans `lab/segments-result.json`).

## 6. Pourquoi 2 080 matchs ici et 2156 dans le bilan

- **Laboratoire** : 2080 matchs, uniquement ceux que le modèle v2 sait prédire (au moins 3 matchs-équivalents pondérés pour chaque équipe).
- **Bilan du site** : 2156 matchs, car il utilise le même prédicteur que le site, c'est-à-dire v2 avec **repli sur v1** pour les équipes sans assez d'historique (souvent des promus en début de saison). Ici, 76 matchs de test relèvent de ce repli. 2080 + 76 = 2156 : l'écart est entièrement expliqué.
- **Conséquence** : le bilan public mélange v2 et v1, et le laboratoire ne mesure que v2. Les conclusions sur v2 ne changent pas ; le bilan est un peu moins bon à cause des matchs en repli.

## Limites

- Intervalles par approximation normale sur des différences appariées. Ils sont fiables pour n ≥ 100 environ, et indicatifs en dessous.
- Les segments « désaccord » sont définis à partir du marché lui-même. Ils décrivent où le modèle se trompe, mais ne constituent pas une stratégie utilisable avant le match avec des cotes d'ouverture.
- Cotes de **clôture** : c'est la référence la plus exigeante. Un éventuel avantage face aux cotes d'ouverture n'est pas mesuré ici.
- Une seule saison et quelques mois de test : les petits effets (moins de 0,005 de Brier) ne sont pas détectables.
