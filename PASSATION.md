# PronostiK — note de passation (à lire en début de nouvelle conversation)
Mise à jour : 9 nov. 2026.

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
- Coupe du Roi (CDR) : EN PAUSE, retirée du site (CDR_PUBLIC = false dans update.mjs). L'utilisateur veut « tout ou rien » :
  pronostic pour TOUS les matchs + logos de tous les clubs (ESPN n'en a pas pour les petits clubs). Code prêt : calendrier et scores ESPN (esp.copa_del_rey, une requête par jour ; les plages de dates sont refusées). Pronostic seulement si les deux clubs
  sont en Liga (modèle PD v2 inchangé, finale neutre = moyenne des deux sens) ; sinon match affiché sans pronostic, visible seulement dans l'onglet Coupe du Roi.
  Score ESPN = prolongation comprise : réglage à 90 min (prolongation = nul ; demi-finale retour en prolongation = annulé). Matchs de coupe hors historique.
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
5. Coupe du Roi complète (prioritaire pour l'utilisateur), labo : tester sur les éditions passées (ESPN, jour par jour) des pronostics Liga contre 2e division, puis petits clubs
   (données de leurs championnats). N'activer que si le test le prouve (règle model.mjs). Sondage ESPN : lab/cdr/probe.json.
