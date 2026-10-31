# PronostiK — dossier technique (pour relecture)

Dernière mise à jour : 1er novembre 2026. Tout ce qui est décrit ici est dans ce dépôt et tourne automatiquement.

## 1. Objectif et règle du jeu

- Objectif : publier des probabilités 1 / N / 2 **bien calibrées** sur 5 championnats (Ligue 1, Premier League, Bundesliga, Serie A, La Liga), avec un bilan public.
- Le site **n'identifie pas de value bets** et ne conseille aucune mise. Il affiche nos probabilités, celles du marché (marge retirée) et une « cote équivalente » (1/p), à titre d'information.
- **Règle** : aucune modification du modèle en production sans gain mesuré sur des matchs jamais utilisés pour le construire ou le régler (protocole §5).

## 2. Données

| Source | Contenu | Usage |
|---|---|---|
| football-data.co.uk (CSV `mmz4281/<saison>/<code>.csv`) | résultats, tirs, cotes moyennes d'ouverture (`AvgH/D/A`) et de clôture (`AvgCH/CD/CA`) | historique depuis 2022-23 (D1 et D2), backtests |
| football-data.co.uk `fixtures.csv` | matchs des prochains jours avec cotes | comparaison affichée sur le site |
| football-data.org API v4 (plan gratuit) | calendrier, résultats du jour | pronostics des 7 prochains jours, règlement |

Fichiers produits : `data/history.json` (≈12 000 matchs), `data/predictions.json`, `data/scorecard.json`, `data/meta.json`.

## 3. Modèle en production (« v2 », `model.mjs` → `createRatings`)

Modèle de Poisson multiplicatif à forces attaque/défense, réestimé à chaque date de match **avec les seuls matchs antérieurs** :

- λ_dom = c · h · a_dom · d_ext ; λ_ext = c · a_ext · d_dom (c = niveau de buts de base, h = avantage du terrain, a = attaque, d = défense ; moyennes de a et d normalisées à 1).
- Fenêtre : 550 jours. Poids temporel : 0,5^(âge / 365 jours).
- Rétrécissement vers la moyenne : pseudo-observations de poids k = 8 ajoutées à chaque force (équipes peu observées ramenées vers 1).
- Estimation : mises à jour alternées (40 itérations) de type maximum de vraisemblance pondéré.
- Pas de prédiction si une équipe a moins de 3 matchs-équivalents pondérés (`minW = 3`) → repli sur l'ancien modèle v1 (moyennes sur 10 derniers matchs + forme sur 5, coefficient 0,72 pour la D2 ; `createModel`). Le champ `model` de chaque pronostic indique lequel a servi.
- Probabilités : somme des scores de Poisson indépendants de 0 à 10 buts, puis renormalisation.
- Hyperparamètres choisis sur 2024-25 (dev), vérifiés sur 2025-08 → (test).

## 4. Probabilités du marché (« dévigage »)

Méthode **proportionnelle** : p_i = (1/cote_i) / Σ(1/cote_j), sur les cotes **moyennes de clôture** (`AvgCH/CD/CA`, à défaut `AvgH/D/A`). Les méthodes de Shin ou « power » n'ont pas été testées (piste ouverte, effet attendu faible sur le Brier).

## 5. Protocole d'évaluation

- Test chronologique : chaque match est prédit avec un modèle estimé uniquement sur les matchs antérieurs.
- Période de test : matchs de première division à partir du **2025-08-01**, ayant des cotes de clôture.
- Mesures : Brier à 3 issues (somme des carrés, 1/3-1/3-1/3 ≈ 0,667), log-loss, taux de l'issue la plus probable.
- Comparaisons appariées (même ensemble de matchs pour toutes les variantes).

## 6. Résultats

### 6.1 Bilan par championnat (production, `data/scorecard.json`)

| Championnat | n | Brier modèle | Brier marché | Log-loss modèle | Log-loss marché | Favori juste (modèle) | Favori juste (marché) |
|---|---|---|---|---|---|---|---|
| Ligue 1 | 378 | 0,6076 | 0,5816 | 1,013 | 0,976 | 50,3 % | 53,4 % |
| Premier League | 460 | 0,6277 | 0,6079 | 1,044 | 1,013 | 45,9 % | 49,1 % |
| Bundesliga | 369 | 0,5883 | 0,5680 | 0,990 | 0,959 | 54,7 % | 56,1 % |
| Serie A | 470 | 0,5877 | 0,5723 | 0,987 | 0,965 | 54,0 % | 55,5 % |
| La Liga | 479 | 0,5879 | 0,5654 | 0,989 | 0,955 | 53,0 % | 54,9 % |

Écart moyen modèle − marché : environ +0,017 de Brier, stable d'un championnat à l'autre.

### 6.2 Expériences (toutes sur la période de test)

| Expérience | Résultat | Décision |
|---|---|---|
| v2 contre v1 (Ligue 1, n = 302) | 0,6030 contre 0,6438 ; écart −0,041 ± 0,026 (IC 95 %) | v2 adopté |
| Correction Dixon-Coles (scores faibles) | aucun gain | rejetée |
| Mélange w·modèle + (1−w)·marché, w de 0 à 1 (5 ligues, n = 2 080) | meilleur à w = 0 (marché seul) : 0,5776 ; w = 0,1 : 0,5783 ; w = 1 : 0,5944 | non adopté ; le marché est seulement affiché à côté |
| « xG-tirs » : buts ≈ 0,339 × tirs cadrés − 0,018 × tirs non cadrés, forces estimées sur α·buts + (1−α)·xG | α = 1 : 0,5944 ; α = 0,5 : 0,5928 ; α = 0 : 0,5962 (marché 0,5776) | gain non significatif, non adopté |
| BTTS et +1,5 / +2,5 buts déduits des λ | Brier ≈ celui d'une fréquence constante ; biais de −6,7 à +5,0 points selon la ligue | non publiés |

Script de l'expérience xG : `scripts/lab-xg.mjs` (résultat dans `lab/xg-result.json`, exécuté par `.github/workflows/lab.yml`).

## 7. Ce que le modèle ignore

Compositions, blessures, suspensions, calendrier et fatigue, enjeux, météo, transferts. Le marché intègre ces informations, ce qui explique très probablement l'essentiel de l'écart.

## 8. Questions ouvertes pour la relecture

1. Une source de données **gratuite ou peu chère** apportant une information que le marché n'a pas déjà (le seul moyen réaliste de réduire l'écart) ?
2. Le dévigage proportionnel est-il le bon choix pour la comparaison, ou faut-il Shin / power ?
3. Hyperparamètres (fenêtre, demi-vie, k) : faut-il les régler par championnat ?
4. Calibration : faut-il une recalibration finale (par exemple une régression isotonique ou de Platt sur la saison précédente) ?

## 9. Comment proposer une amélioration

Pour être testée, une proposition doit préciser :
- la formule ou l'algorithme exact (pas seulement l'idée) ;
- les données nécessaires, et si elles existent dans les fichiers ci-dessus ;
- ce qui est réglé, et sur quelle période (jamais sur la période de test).

Elle sera mesurée sur les mêmes 2 080 matchs. **Chiffres à battre** : 0,5944 (modèle actuel), 0,5776 (marché).

## 10. Fichiers utiles

- `model.mjs` : modèles v1 et v2.
- `scripts/update.mjs` : robot de mise à jour (toutes les 3 heures).
- `csv.mjs`, `lib.mjs`, `leagues.mjs` : lecture des données, noms d'équipes.
- `tests/check-model.mjs`, `tests/e2e.mjs` : tests automatiques.
