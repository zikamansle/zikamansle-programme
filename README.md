# ZikaMansle — application autonome

Migration préparée le 11 novembre 2026. **Ce dossier n'est pas une migration terminée et n'a pas été déployé.**

Le runtime est un Worker Cloudflare standard avec fichiers statiques, D1 et R2. Il ne dépend pas de ChatGPT Sites, de son authentification ou de ses connecteurs. Le programme continue à lire le projet Supabase existant et les rubriques continuent à se synchroniser avec le site Wix officiel.

## Démarrer

Installer Node.js 24 et Git, puis dans ce dossier :

```sh
npm ci
npm test
npm run build
npm run db:local
npm run dev
```

Les envois sont désactivés par défaut. La compilation est un `--dry-run` : elle ne publie rien.

## Fichiers

| Dossier | Rôle |
|---|---|
| public/ | Interface, identité, icônes Zika, logos, programme de secours, service worker |
| server/push-api.mjs | Abonnements, actualités, médias, tests, envois et historique |
| server/webpush.mjs | Chiffrement et signature Web Push |
| server/admin-auth.mjs | Validation cryptographique de Cloudflare Access |
| server/site-content.mjs | Synchronisation des pages Wix autorisées |
| worker/index.mjs | Routage Cloudflare standard |
| drizzle/ | Schéma D1 et migrations originales |
| supabase/ | Source de la fonction wix-media et inventaire du schéma externe |
| docs/ | Déploiement, secrets, maintenance et état de vérification |

L'administration est accessible via **Plus → Administration**. Elle exige un jeton Cloudflare Access signé, pour la bonne audience et l'adresse administrateur. Un simple en-tête portant une adresse e-mail ne donne aucun accès.

Lire [docs/MIGRATION.md](docs/MIGRATION.md) avant tout déploiement et [docs/VERIFICATION.md](docs/VERIFICATION.md) pour les limites constatées.

## Provenance

Dépôt de transfert : `zikamansle/zikamansle-programme`, branche dédiée `migration/application-autonome`. Cette branche contient uniquement l’application autonome et ne doit pas être fusionnée avec main.

Source publiée : version 15, commit `95867159de7b0fd1a5ae8b9642c4794aa91d659b`.
Site préservé : https://app.zikamansle.fr/.
La copie intégrale originale et les exports privés sont fournis séparément dans le dossier de transfert. Ne jamais ajouter les exports privés à Git.
