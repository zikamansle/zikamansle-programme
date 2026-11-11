# Déploiement et maintenance sans ChatGPT Work

## État au 11 novembre 2026

Source récupérée, adaptation autonome compilée et tests unitaires réussis. Branche dédiée `migration/application-autonome` créée dans `zikamansle/zikamansle-programme` pour transférer le code via l’accès GitHub disponible. Aucun dépôt dédié créé, aucun déploiement distant réalisé, aucun DNS changé. Le site et les notifications actuels restent en service.

## 1. GitHub

Accès autonome au code transféré :

```sh
git clone --branch migration/application-autonome --single-branch https://github.com/zikamansle/zikamansle-programme.git zikamansle-app
cd zikamansle-app
npm ci
```

Ne pas fusionner cette branche avec main : elle contient un projet distinct. Cloudflare peut utiliser directement cette branche, ou vous pouvez créer ultérieurement le dépôt dédié et y pousser le même code. Les étapes ci-dessous concernent cette séparation facultative.

Créer un dépôt **privé** vide nommé `zikamansle-app` dans le compte `zikamansle`. Le connecteur disponible peut écrire dans des dépôts existants mais ne propose pas leur création ; la session navigateur et `gh` ne sont pas connectés.

Après connexion GitHub sur votre ordinateur, depuis le dossier `zikamansle-app` uniquement :

```sh
git init -b main
git add .
git commit -m "Préparer l’application ZikaMansle autonome sur Cloudflare"
gh auth login
gh repo create zikamansle/zikamansle-app --private --source=. --remote=origin --push
```

Si le dépôt a déjà été créé dans le navigateur, utiliser `git remote add origin https://github.com/zikamansle/zikamansle-app.git` puis `git push -u origin main` à la place de `gh repo create`. Ne jamais initialiser Git dans le dossier global contenant `export-prive`.

## 2. Cloudflare de validation

Le projet cible est Cloudflare Workers + Static Assets, pas un simple dépôt Pages statique : un backend est indispensable.

```sh
npm ci
npx wrangler login
npx wrangler whoami
npx wrangler d1 create zikamansle-app-staging
npx wrangler r2 bucket create zikamansle-app-staging
```

Vérifier le compte sélectionné. Remplacer `database_id` nul dans `wrangler.jsonc` par l'identifiant retourné. Garder `PUSH_SEND_ENABLED` à `false`. Ne pas ajouter de route, domaine personnalisé ou configuration IONOS. Vérifier les conditions et éventuels coûts de votre compte avant d'activer de nouveaux services.

```sh
npx wrangler d1 migrations apply zikamansle-app-staging --remote
npm test
npm run build
npm run deploy:staging
```

La nouvelle URL workers.dev doit rester distincte de `app.zikamansle.fr` pendant la validation. Le domaine ne figure dans aucune route de déploiement préparée.

## 3. Administration sécurisée

Sur **Cloudflare Zero Trust → Access → Applications**, créer une application de type **Self-hosted** nommée « Administration ZikaMansle (test) ». Protéger le seul chemin `/administration/*` de l'hôte `zikamansle-app-staging.zikamansle.workers.dev` (et non l'ensemble du Worker). La règle **Allow** doit viser une **adresse e-mail précise**, jamais « Everyone » ou un domaine e-mail entier. Si nécessaire, activer l'authentification par code à usage unique.

La page `/administration/notifications` et tous les appels privés `/administration/api/admin`, `upload`, `create`, `send`, `clear-history` utilisent cette même application Access et donc le même jeton signé. L'ancienne URL `/admin-notifications.html` redirige vers le chemin protégé. Le serveur vérifie en plus la signature du jeton, son émetteur, l'audience et `ADMIN_EMAIL`.

Dans **GitHub → Settings → Environments → zikamansle-staging**, ajouter les variables `ACCESS_TEAM_DOMAIN` (sous la forme `nom-equipe.cloudflareaccess.com`, sans `https://`) et `ACCESS_AUD` (Application Audience Tag), et ajouter le secret `ADMIN_EMAIL` égal à l'e-mail autorisé dans la politique Access. Ces valeurs doivent ensuite être déployées via un workflow GitHub explicitement déclenché : la création d'une application Access seule n'active pas l'administration.

Les routes publiques `/api/push/news`, `config`, `media`, `subscribe`, `unsubscribe`, `receipt`, `selftest`, `test-status` doivent rester accessibles sans connexion aux visiteurs. Les anciennes API privées `/api/push/admin`, `upload`, `create`, `send`, `clear-history` restent protégées cryptographiquement même en l'absence de politique Access, et ne sont pas utilisées par la nouvelle interface.

Ne pas activer **Protect this Worker behind Access → All traffic**, qui masquerait aussi toute l'application publique. Les fonctions d'envoi push demeurent désactivées en test tant que `PUSH_SEND_ENABLED` vaut `false` ; la clé privée VAPID n'est pas récupérée. L'authentification effective et les cookies sont à vérifier dans le navigateur, sur le compte cible.

## 4. Notifications et clé privée

| Paramètre | Destination | État |
|---|---|---|
| VAPID_PUBLIC_KEY | Variable Cloudflare | Valeur publique exportée dans configuration-publique.json |
| VAPID_PRIVATE_JWK | Secret Cloudflare uniquement | Masqué à la source, non récupéré |
| ADMIN_EMAIL | Secret Cloudflare | À saisir par le propriétaire |
| ACCESS_TEAM_DOMAIN | Variable Cloudflare | À créer dans votre compte |
| ACCESS_AUD | Variable Cloudflare | À relever dans l'application Access |
| PUSH_SEND_ENABLED | Variable Cloudflare | false tant que les essais ne sont pas autorisés |
| DB / BUCKET | Liaisons D1 / R2 | Ressources de validation séparées |
| WIX_API_KEY / WIX_SITE_ID | Secrets Supabase existants | Non exportés, restent sur Supabase |

La clé VAPID privée originale doit être récupérée depuis votre sauvegarde sécurisée ou par une procédure d'export prise en charge par l'hébergeur. Ne pas la demander en clair dans une conversation et ne pas la publier dans GitHub. La saisir avec `npx wrangler secret put VAPID_PRIVATE_JWK` sur le poste de confiance, ou directement dans le tableau de bord Cloudflare. Les outils actuels ne retournent pas sa valeur. Aucun contournement ou changement du site en service n'a été effectué pour l'extraire.

Conserver **l'origine HTTPS, le chemin/scope du service worker et la même paire VAPID** est indispensable à la reprise des abonnements. Les abonnements d'app.zikamansle.fr ne servent pas à abonner workers.dev. Pour les essais, créer une paire distincte et utiliser uniquement des appareils de test et une base vide de vrais abonnements. Ne jamais tester un envoi global avec la base réelle restaurée.

Après validation, une éventuelle nouvelle clé de production imposerait un réabonnement des appareils : ce n'est pas une migration transparente. Ne pas remplacer la clé actuelle sans décision explicite.

## 5. Données et restauration

Le dossier privé contient un export D1 complet des quatre tables visibles à l'instant de lecture, une base SQLite restaurée avec contrôle d'intégrité, un SQL de restauration, les 18 événements et 27 paramètres Supabase, le schéma et les politiques accessibles, ainsi que les références des médias joints. Les lectures ne sont pas une transaction multi-tables sur le serveur ; refaire une sauvegarde finale à la bascule pour capturer toute évolution.

`notifications-restore.sql` contient le schéma et les données : l'importer dans une **nouvelle base vide**, sans appliquer les migrations au préalable. Il n'est pas destiné à écraser une base existante :

```sh
npx wrangler d1 execute NOM_DE_LA_BASE_VIDE --remote --file=CHEMIN_PRIVE/notifications-restore.sql
```

Pour une base de test avec le schéma déjà appliqué, ne pas exécuter ce dump complet. Garder les données réelles séparées du test d'envoi. Comparer les quatre nombres de lignes et les enregistrements, pas seulement la réussite de l'import. Le `push_config.admin` original est conservé dans le dump mais n'accorde plus de droits dans la nouvelle application.

Restaurer les objets R2 sous leurs clés originales `push/<identifiant>` avec leur Content-Type. Les références des notifications sont relatives et seront conservées. L'inventaire complet R2 n'est pas exposé par les outils disponibles : les objets non référencés peuvent encore manquer.

Le Supabase existant appartient déjà à un compte externe à Work et reste la source vivante du programme. Son export JSON n'est pas un dump Postgres complet : comptes Auth, mots de passe, secrets, extensions, fonctions SQL et stockage ne sont pas garantis exportés. Avant de déplacer aussi Supabase, effectuer une sauvegarde officielle supplémentaire via ses outils de sauvegarde/CLI. Ne pas importer le JSON comme SQL. La fonction `wix-media` est récupérée, mais son origine CORS et son administrateur actuels sont conservés : aucun redéploiement automatique.

## 6. Maintenance courante

- Interface et icônes : modifier `public/`, lancer les tests, vérifier le rendu puis publier le Worker choisi.
- Programme : administration existante du dépôt `zikamansle-programme` / Supabase ; `public/config.js` contient seulement la clé publique et l'URL du projet.
- Rubriques : le site Wix officiel continue d'alimenter les 17 pages, avec un cache de cinq minutes et les copies de secours existantes.
- Actualités et notifications : menu Plus → Administration ; ajout média, test sur un appareil, envoi, bilan et archivage de l'historique conservés.
- À chaque changement de cache PWA, incrémenter `CACHE` dans `public/sw.js` ; garder `/sw.js` et son scope racine.
- Sauvegarder régulièrement D1 via `wrangler d1 export`, les objets R2 et les données Supabase, séparément de Git ; conserver les secrets dans un gestionnaire de mots de passe ou coffre sécurisé.
- Le workflow de vérification GitHub lance tests et compilation à chaque modification. La publication automatique en environnement de test n'est possible que si la variable de dépôt `ZIKA_DEPLOY_ENABLED` vaut `true`, avec les secrets de l'environnement `zikamansle-staging`. Aucun déploiement de production ni changement DNS n'est prévu. Un déploiement manuel via Wrangler reste possible sans Work.

## 7. Android

Le manifeste garde `name` et `short_name` = ZikaMansle, les icônes officielles 192/512 et le badge Z. Le service worker conserve les notifications, liens et accusés de réception. Le nom affiché par Android dépend également du mode d'installation (Chrome/PWA/TWA) et des paramètres système ; le code web seul ne permet pas de garantir l'étiquette de l'émetteur.

Tester sur le Redmi Note 14 Pro 5G : réception application ouverte, en arrière-plan et écran verrouillé, nom ZikaMansle, icône/badge, son, clic et retour vers l'actualité. Vérifier aussi le fichier assetlinks.json et l'association du domaine si la version Google Play utilise une TWA. Aucun AAB n'est modifié par cette migration web.

## 8. Bascule et retour arrière

La bascule n'est pas préparée comme une action automatique. Après validation complète : sauvegarde finale, comparaison des données et médias, preuve de possession de la même clé VAPID, restauration dans la base cible, tests d'administration, puis décision explicite sur le routage du domaine. Aucun changement DNS IONOS n'est autorisé à ce stade. Conserver l'ancien site, sa base et ses secrets pour le retour arrière. Ne jamais laisser deux expéditeurs traiter simultanément les mêmes messages en attente.

## Références techniques

- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
