# PronostiK : site public de probabilités (Ligue 1, Premier League, Bundesliga, Serie A, La Liga)

Un site qui se met à jour tout seul : les matchs des 7 prochains jours des cinq grands championnats, les probabilités du modèle, et un bilan public des résultats. Personne n'a rien à saisir.

## Comment ça marche

- Toutes les 3 heures, un robot GitHub (le fichier `.github/workflows/update.yml`) lance `scripts/update.mjs`.
- Ce script récupère l'historique gratuit (football-data.co.uk, une fois par semaine) puis les résultats et le calendrier de chaque championnat chez football-data.org (une requête par championnat, bien en dessous des limites gratuites), calcule les pronostics avec ton modèle (`model.mjs`, identique à celui de la page PronostiK), les fige au coup d'envoi, puis les règle quand le match est fini.
- Le site (`index.html`, `app.js`, `style.css`) lit seulement les fichiers de `data/`. Ta clé n'est jamais visible par les visiteurs.

## Mise en ligne : 5 étapes, une seule fois (environ 15 minutes)

L'ordre compte.

1. **Crée un compte GitHub** (gratuit) sur github.com, puis un nouveau dépôt **public** nommé `pronostik`. Il doit être public pour que l'hébergement soit gratuit. Ne coche pas « Add a README ».
2. **Ajoute ta clé** : dans le dépôt, *Settings* → *Secrets and variables* → *Actions* → *New repository secret*. Nom : `FD_TOKEN`. Valeur : ta clé football-data.org (gratuite sur football-data.org/client/register).
3. **Active l'hébergement** : *Settings* → *Pages* → *Source* : choisis **GitHub Actions**.
4. **Envoie les fichiers** : dans le dépôt, *Add file* → *Upload files*, puis glisse **tout le contenu** de ce dossier (sans le zip lui-même), sans oublier le dossier caché `.github`. Valide avec *Commit changes*. Si le dossier `.github` n'apparaît pas sur ton ordinateur, active l'affichage des fichiers cachés (Mac : Cmd+Maj+point).
5. **Lance le premier calcul** : onglet *Actions* → *Mise à jour PronostiK* → *Run workflow*. Au bout d'une ou deux minutes, le site est en ligne à l'adresse `https://TON-NOM.github.io/pronostik/`.

Ensuite, plus rien à faire : le robot tourne seul. Si une mise à jour échoue (clé invalide, API en panne), le site affiche une bande d'avertissement et GitHub t'envoie un e-mail.

## Championnats et API

- Le plan gratuit de football-data.org couvre les cinq championnats (et aussi Pays-Bas, Portugal, Championship : voir `leagues.mjs` pour en ajouter). Vérifie la liste sur ton compte.
- Ton autre clé (API-Football ou équivalent) n'est pas utilisée. Elle pourrait servir plus tard pour les **cotes des matchs à venir**, que football-data.org ne donne pas gratuitement.
- Le **premier lancement dure quelques minutes** : il télécharge quatre saisons d'historique et fait cinq requêtes espacées.
- Si une équipe n'est pas reconnue (nom différent entre l'API et l'historique), la carte affiche « équipe non reconnue » et le nom apparaît dans `data/meta.json`, rubrique `unmapped`. Ajoute alors une ligne dans `ALIASES` de `leagues.mjs`.

## Limites à connaître

- **Pas de cotes pour les matchs à venir.** Le bilan compare le modèle aux cotes sur l'historique, pas en direct.
- **Une équipe sans historique suffisant** (promue, par exemple) reçoit « Pronostic indisponible » plutôt qu'un chiffre bidon.
- **Le modèle est moins précis que les cotes** (voir l'onglet Bilan). Le site le dit clairement : c'est volontaire, et c'est ce qui le rend crédible.
- **Seule la Ligue 1 a été calibrée à la main.** Pour les autres championnats, le modèle est le même ; son bilan s'affiche séparément pour chacun.

## Avant de monétiser ou de faire de la publicité

Le site affiche déjà les mentions de jeu responsable. Si tu vends un abonnement, ajoutes des liens vers des opérateurs ou fais de la publicité en France, vérifie les règles de l'ANJ et fais relire l'activité par un juriste. Le bilan public doit rester visible : ne promets jamais de gains.

## Vérifier que tout est intact

```
node tests/check-model.mjs   # le modèle donne les mêmes chiffres que la page d'origine
node tests/e2e.mjs           # simulation complète : 5 championnats, fausse API et faux CSV
```


## Le modèle

Probabilités calculées avec des forces attaque/défense pondérées par l’ancienneté (modèle v2, `model.mjs`, `createRatings`). Si une équipe manque d’historique, le robot utilise l’ancien calcul (v1). Le champ `model` de chaque pronostic indique lequel a servi. Le bilan par championnat est recalculé avec le même modèle que celui utilisé pour les pronostics.
