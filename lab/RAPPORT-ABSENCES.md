# Étude absences (8 nov. 2026)
Modèle testé : v2 + absences (joueurs « Missing Fixture » d'API-Football, pondérés par leur part de minutes la saison précédente).
Réglage sur 2023-24 (1 558 matchs) : alpha 0,05 (attaque), beta 0 (défense).
Test unique sur 2024-25 (1 698 matchs, 5 grands championnats), mêmes matchs pour les deux modèles.

| | écart log-loss (v2+abs − v2) | IC 95 % |
|---|---|---|
| Total | −0,0011 | [−0,0026 ; +0,0004] |
| Ligue 1 | +0,0018 | [−0,0016 ; +0,0052] |
| Premier League | −0,0014 | [−0,0050 ; +0,0022] |
| Bundesliga | −0,0028 | [−0,0067 ; +0,0011] |
| Serie A | −0,0029 | [−0,0062 ; +0,0003] |
| Liga | +0,0001 | [−0,0026 ; +0,0029] |

Conclusion : gain minuscule et non significatif (tous les IC contiennent 0). Le modèle de production n'est pas modifié.
Script : scripts/lab-absences.mjs (données sur la branche experience-absences).
