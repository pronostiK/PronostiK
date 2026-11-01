# Sélections nationales (Ligue des nations) : modèle et test

- **Modèle** : Elo des sélections (formule « World Football Elo ») sur tous les matchs internationaux de la base publique martj42/international_results (≈ 50 000 matchs depuis 1872). Poids selon le match : Coupe du monde 60, phases finales continentales 50, éliminatoires et Ligue des nations 40, autres tournois 30, amicaux 20 ; multiplicateur réglé 0,8 ; avantage du terrain 60 points ; écart de buts pris en compte.
- **Conversion** : 1N2 par modèle ordonné sur l'écart Elo, buts attendus par régression de Poisson ; terrain neutre = moyenne des deux situations.
- **Réglage** : matchs officiels entre sélections européennes 2014-2021. **Test** : 2022 → octobre 2026, 1 013 matchs jamais vus.

| | Brier | Log-loss |
|---|---|---|
| Elo des sélections | **0,496** | **0,845** |
| Prévision naïve | 0,643 | — |

Écart : −0,147 (IC 95 % : −0,169 à −0,124). Calibration (annoncé / observé) : 10/11, 27/27, 42/43, 57/58, 72/67, 90/88 %.

- **Calendrier et résultats** : API publique de l'UEFA (Ligue des nations). Base de résultats rafraîchie chaque semaine (réglages figés).
- **Limites** : pas de cotes de bookmakers (pas de comparaison au marché) ; amicaux non couverts ; marchés (buts, mi-temps…) non testés sur les sélections ; compositions ignorées.

Scripts : `scripts/lab-nations*.mjs`, `scripts/nations-lib.mjs`, graine `data/nations-seed.json`.
