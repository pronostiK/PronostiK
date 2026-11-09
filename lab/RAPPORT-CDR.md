# Coupe du Roi : pronostics pour tous les matchs (petits clubs compris)
9 nov. 2026 — script `scripts/lab-cdr-fit.mjs`, résultat complet `lab/cdr/result.json`.

## Verdict : VALIDÉ (les deux critères fixés avant le test sont remplis)

## Données
- Matchs : Wikipédia (anglais), éditions 2021-22 à 2026-27, avec la division de chaque club (1 = Liga … 6 = régional). `lab/cdr/matches.json`.
- Force des clubs de Liga et de 2e division : Elo calculé sur les résultats football-data.co.uk depuis 2016-17 (uniquement les matchs AVANT chaque match de coupe).
- Exclus : tour préliminaire (aller-retour entre clubs régionaux), demi-finales retour allées en prolongation (score à 90 min inconnu).
- Résultat compté à 90 minutes : prolongation ou tirs au but = match nul.

## Modèle
Logit ordonné : écart = niveau de la division (réglé) + 0,40 × écart Elo dans la division + terrain.
Niveaux réglés (Liga = 0) : D2 −0,86 · D3 −1,04 · D4 −1,40 · D5 −2,31 · D6 −5,04. Avantage du terrain ≈ 0 (en coupe, le petit club reçoit).

## Méthode
Réglage sur 2021-22 à 2024-25 (458 matchs). Test unique sur 2025-26 + 2026-27 joués (156 matchs), sans retouche après coup.
Critères fixés avant : 1) battre la référence « fréquences 1/N/2 » en perte logarithmique (IC 95 % sous 0) ;
2) calibrage du favori : écart < 5 points et IC 95 % contenant 0.

## Résultats (test)
| | Matchs | Perte modèle | Perte référence | Écart (IC 95 %) | Favori annoncé | Favori gagnant |
|---|---|---|---|---|---|---|
| Total | 156 | 0,875 | 0,985 | −0,110 [−0,163 ; −0,057] | 59,5 % | 56,4 % (écart +3,1 [−4,1 ; +10,3]) |
| 2025-26 | 116 | 0,915 | 1,008 | −0,093 [−0,157 ; −0,030] | 58,8 % | 54,3 % |
| 2026-27 | 40 | 0,758 | 0,917 | −0,158 [−0,253 ; −0,064] | 61,6 % | 62,5 % |

Calibrage par tranche (annoncé → observé) : <50 % : 43 → 40 (70 matchs) · 50-60 : 54 → 55 (20) · 60-70 : 65 → 52 (25) · 70-80 : 75 → 77 (13) · 80-90 : 83 → 78 (9) · 90+ : 98 → 100 (19).
Aucun favori annoncé à plus de 85 % n'a perdu.

## Limites (à dire honnêtement)
- Pas de cotes de bookmakers pour la Coupe du Roi dans nos sources : on ne peut PAS dire que le modèle bat les bookmakers, seulement qu'il est bien calibré et bien meilleur qu'un tirage au hasard pondéré.
- La force individuelle (Elo) n'apporte rien de mesurable en plus de la division (écart −0,005 [−0,032 ; +0,023]) : pour les petits clubs, le pronostic repose sur leur division.
- Léger excès de confiance possible sur le favori (+3 points), non significatif. Échantillon de test modeste (156 matchs).
- Marchés (buts, score exact) : non testés pour la coupe.
