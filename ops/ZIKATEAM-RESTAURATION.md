# ZikaTeam — point de restauration et procédure de publication

## Version de référence validée visuellement par le responsable

- Date : **16 novembre 2026**.
- Worker Cloudflare : `zikamansle-app-production` sur `app.zikamansle.fr`.
- **Version immuable à conserver :** `967e6b4e-49a8-4ac6-a28f-e5347ee9d465` (Cloudflare version n° 262).
- **Déploiement du rétablissement :** `612d06cb-e1a0-4045-b2c0-1c08b051ae68`.
- Base D1 : `zikamansle-app-production`, UUID `fe7c5010-d6e9-48ed-88aa-ff1402820e02`.
- Sauvegarde ponctuelle D1 Time Travel (16/11/2026) : `00000067-0000000c-00005125-bb1f023a0f752b9f13aba0bf20b5206a`.
- **Attention :** ce signet D1 dépend de la durée de conservation Time Travel de Cloudflare ; il **ne remplace pas une sauvegarde SQL exportée et conservée séparément**.
- La version 263 (`63d6ef3c-96bc-4cab-a796-cd852fb9a1c9`) déployée plus tard, ainsi que le correctif 264 (`0c84bc98-5a98-4da2-9b74-c5261268f7d8`), **ne doivent pas servir de référence** : leur interface ZikaTeam n'avait plus les fonctionnalités attendues.
- La version 265 (`1c4aa68f-9f5d-4471-9ec9-3bb2af975107`) a été préparée mais **pas déployée**.
- La présence du menu complet a été validée visuellement par le responsable (« ça a l'air bon »), mais **les essais connectés, fonction par fonction, restent à effectuer**.

## Discipline obligatoire AVANT modification

1. **Ne pas publier directement depuis un ancien checkout GitHub ou une branche de programme interactif.** Les branches `feat/zikateam-*` ne correspondent pas nécessairement à l'intégralité des fichiers statiques actuellement présents sur Cloudflare. Les déployer en bloc provoque une régression.
2. Recenser et préserver les fichiers statiques servis (`/zikateam`, `/zikateam.js`, `/zikateam.css`, service worker, scripts injectés), les bindings Workers, les scripts backend, le schéma D1 et les secrets (sans les afficher dans Git).
3. Faire un **déploiement de validation isolé** utilisant une base de test et **notifications sortantes neutralisées**, sans écraser le Worker de production.
4. Contrôler le compte administrateur connecté, le compte secrétariat, un responsable et un bénévole ; confirmer les autorisations et tester les boutons d'ajout, modification, listes, documents, messagerie, notifications et finances. Aucun test n'a le droit d'envoyer des notifications générales réelles.
5. Passer `node ops/zikateam-smoke-test.mjs`. Ce test est une **alarme de régression**, pas une validation exhaustive des fonctions.
6. Vérifier le statut du contrôle GitHub, sauvegarder une référence restaurable, puis déployer une nouvelle version Cloudflare de manière maîtrisée ; conserver le numéro de la version immédiatement précédente.
7. Après publication, tester réellement le menu, un accès gestion autorisé et un accès non autorisé, et vérifier les logs Cloudflare avant de déclarer le changement réussi. En cas de régression, revenir immédiatement à la version précédente ; ne pas migrer ou restaurer D1 par réflexe.

## Retour arrière de l'interface

Via **Cloudflare > Workers & Pages > zikamansle-app-production > Deployments**, redéployer l'ancienne version `967e6b4e-49a8-4ac6-a28f-e5347ee9d465` à **100 %** du trafic. Vérifier qu'il s'agit bien du Worker et de l'environnement **production**, et contrôler les fonctionnalités après changement.

Un rollback du Worker **ne restaure pas les données D1**. Les modifications de la base exigent une procédure de sauvegarde/reprise distincte ; ne pas écraser les données bénévoles et messages.

## Surveillance et limites

Le workflow `.github/workflows/zikateam-regression-guard.yml` exécute un test public en lecture seule toutes les six heures et sur demande. Il ne lance aucun déploiement et ne dispose d'aucun accès privé au compte administrateur. Une alarme signale une anomalie technique, pas nécessairement une panne des boutons.

**Reste à imposer dans GitHub/Cloudflare** : protection de la branche de production avec revue obligatoire et contrôle vert, suppression des chemins de publication manuelle non contrôlés, limitation des jetons Cloudflare de déploiement, sauvegarde SQL D1 externe chiffrée avec politique de rétention, et procédure de tests connectés. Aucun de ces contrôles d'accès n'est prétendu actif sans vérification.
