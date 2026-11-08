# Étude Dixon-Coles (8 nov. 2026)
Correction des petits scores (0-0, 1-0, 0-1, 1-1) ajoutée au modèle v2. Réglage de rho sur 2024-25, test unique d'août 2025 à novembre 2026 (3 671 matchs, 8 championnats).
- 1N2 log-loss : −0,0005, IC 95 % [−0,0022 ; +0,0012] → pas d'amélioration significative.
- 1N2 Brier : +0,0001, IC 95 % [−0,0009 ; +0,0010].
- Score exact : légèrement moins bon (non significatif).
- Nuls prévus 24,2 % (v2) / 26,4 % (Dixon-Coles) / 25,3 % réels.
Conclusion : le modèle de production n'est pas modifié. Script : scripts/lab-dixon.mjs.
