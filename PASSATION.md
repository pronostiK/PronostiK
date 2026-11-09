# PronostiK — note de passation (à lire en début de nouvelle conversation)
Mise à jour : 9 nov. 2026 (soir).

## Utilisateur
Débutant, francophone. Réponses courtes, claires, sans jargon. A des clients : le site doit être automatique et fiable.
Règles : ne jamais demander de secret dans la conversation (tout est dans les secrets GitHub) ; ne jamais envoyer d'e-mail sans son accord ;
ne jamais modifier model.mjs sans preuve statistique (réglage sur une période, test unique sur une autre, IC 95 %).

## Architecture
- Site statique (index.html, app.js, style.css) lisant data/*.json ; hébergé sur GitHub Pages (pronostikapp.fr, DNS chez Amen).
- Robot : scripts/update.mjs lancé par .github/workflows/update.yml ; horloge.yml le relance toutes les 5 min pendant les matchs, 30 min sinon.
- Chat : worker Cloudflare (worker/chat.js). Appli Android : android/.
- Compétitions : FL1, PL, BL1, SA, PD, PPL, DED, ELC, FL2, CL, EL, ECL, NL (Ligue des nations), CDR (Coupe du Roi).
- Modèles : v2 Poisson (championnats), Euro Elo (Coupes d'Europe, scripts/ucl-lib.mjs), Elo des sélections (scripts/nations-lib.mjs).
- Coupe du Roi (CDR) : EN LIGNE, pronostic pour TOUS les matchs (modèle validé : lab/RAPPORT-CDR.md ; code scripts/cdr-lib.mjs, NE PAS modifier les paramètres sans nouveau test).
  Calendrier/scores ESPN (une requête par jour ; plages de dates refusées). Division des clubs + logos des petits clubs : page Wikipédia anglaise de l'édition (toutes les 6 h / chaque semaine).
  Elo Liga/2e div. : lab/cdr/csv (anciennes saisons) + historique. Réglage à 90 min (prolongation = nul ; demi-finale retour en prolongation = annulé). Matchs de coupe hors historique.
  Marchés (buts, score exact) non testés : non publiés. Club sans division trouvée : match sans pronostic (meta.cdr.sansDivision). Interrupteur : CDR_PUBLIC dans update.mjs.
- Compositions : scripts/compos-lib.mjs (ESPN, une fois par heure) → data/compos.json → onglet « Compos » (terrain unique, lien Wikipédia par joueur ; pas de photos).
- Résumé : bilan sur 30 jours glissants + PronostiK contre bookmakers (% de bons favoris).

## Études déjà faites (modèle inchangé)
Absences (lab/RAPPORT-ABSENCES.md), Dixon-Coles (lab/RAPPORT-DIXON.md), xG (lab/xg-result.json) : aucun gain significatif.

## À faire
1. Migration de l'hébergement vers Cloudflare Pages (le robot reste sur GitHub) : guider l'utilisateur pas à pas sur téléphone
   (relier GitHub à Cloudflare Pages, puis DNS chez Amen) ; vérifier ensuite assetlinks (APK), CORS du chat, version.json.
2. Applications (Android / autres) : à discuter avec l'utilisateur.
3. Idée en attente : afficher la liste des absents (ESPN) sur la page match, à titre d'info.
4. Rapport hybride Elo prévu le 4 janvier 2027.
5. Coupe du Roi : suivre les vrais résultats (favoris annoncés contre gagnants) ; refaire le test en fin d'édition (été 2027).
