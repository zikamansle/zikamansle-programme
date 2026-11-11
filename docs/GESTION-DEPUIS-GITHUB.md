# Gérer ZikaMansle directement depuis GitHub
Le code est dans la branche `migration/application-autonome` du dépôt `zikamansle/zikamansle-programme`.
Work n'est pas nécessaire pour modifier ce code, exécuter ses tests ou déployer avec GitHub Actions.

## Ce qui fonctionne où
- GitHub : fichiers, historique, tests et publication automatisée.
- Cloudflare : exécution de l'application, base des notifications et médias.
- Supabase/Wix : services actuels du programme et des contenus, conservés.
- Application : Plus → Administration pour les actualités, médias et notifications après configuration d'Access.

GitHub Pages seul ne remplace pas le backend des notifications. Les abonnements et la clé privée ne doivent jamais être ajoutés aux fichiers du dépôt, qui est public.

## Configuration unique, sans connexion GitHub dans Cloudflare
1. Vérifier dans Cloudflare que Workers, D1 et R2 sont accessibles sur votre compte et consulter les conditions et coûts éventuels. Le workflow crée ou retrouve automatiquement la base D1 `zikamansle-app-staging` et le bucket R2 de test du même nom après connexion du jeton. Ne pas recréer manuellement ces ressources.
2. Créer un jeton API limité à votre compte et aux permissions nécessaires : déploiement Workers, modification D1 et accès R2. Ne pas accorder de droits DNS. Le jeton doit permettre de créer le Worker de test ; réduire ensuite sa portée si possible.
3. Dans GitHub, Settings → Environments, créer `zikamansle-staging`. Y ajouter les secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, puis les secrets applicatifs `ADMIN_EMAIL` et `VAPID_PRIVATE_JWK` lorsqu'ils sont disponibles. Ne jamais les coller dans un fichier, un ticket ou une conversation.
4. Dans cet environnement, les variables `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` et `VAPID_PUBLIC_KEY` pourront être ajoutées après configuration d'Access et de la clé de test. `ZIKA_D1_DATABASE_ID` est facultative : le workflow retrouve automatiquement l'identifiant D1 et vérifie toute valeur fournie.
5. Dans Settings → Secrets and variables → Actions → Variables du dépôt, ajouter `ZIKA_DEPLOY_ENABLED=true` uniquement lorsque la configuration est prête. Cette variable doit être au niveau du dépôt car elle contrôle le démarrage du job.
6. Enregistrer une modification sur la branche de migration : tests et déploiement de test se lancent automatiquement. Suivre l'onglet Actions. En cas d'échec, lire l'étape concernée. Aucune intervention de Work n'est nécessaire.

Le workflow n'est pas sur la branche par défaut : le bouton « Run workflow » peut ne pas être affiché. Le déclenchement par modification de la branche fonctionne indépendamment de ce bouton. Dans un futur dépôt dédié, adapter la branche du déclencheur à main avant son utilisation.

## Limites actuelles
Le déploiement automatisé ne modifie ni app.zikamansle.fr ni les DNS IONOS ; les envois push restent verrouillés. Les ressources, secrets et la connexion Access doivent encore être configurés dans vos comptes. La clé privée VAPID originale manque toujours. Les données privées doivent être importées séparément par un canal sécurisé. Les tests Android réels et la recette complète restent obligatoires avant la bascule.

Les valeurs absentes ne sont pas inventées. Aucun token ni secret n'a été créé ou ajouté à vos comptes par ce changement.

Références :
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
