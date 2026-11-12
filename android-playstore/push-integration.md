# Push pour ZikaMansle — branche de préparation

L'interface Web Push et le gestionnaire de réception sont présents **sur la branche de préparation uniquement**, pas sur l'application publique. Ils ne rendent pas les envois opérationnels sans backend.

## Configuration attendue

La configuration doit être disponible avant l'exécution de `app.js`, via `window.ZIKA_PUSH_CONFIG` ou `window.ZIKA_CONFIG.push` :

```js
window.ZIKA_PUSH_CONFIG = {
  vapidPublicKey: 'CLE_VAPID_PUBLIQUE_BASE64URL',
  subscribeUrl: 'https://EXEMPLE-DOMAINE-HTTPS/api/push/subscribe'
};
```

- `vapidPublicKey` = **clé publique**, jamais la clé privée dans le client.
- `subscribeUrl` = endpoint HTTPS à mettre en place sur l'infrastructure réelle (par exemple Supabase Edge Functions si choisi). La requête `POST` contient `{ subscription: { endpoint, keys, expirationTime } }`.
- Le serveur vérifie l'origine, applique une protection anti-abus, stocke les abonnements de façon limitée et sécurisée, documente leur durée de vie et sait traiter les endpoints expirés.
- L'envoi des notifications se fait **uniquement côté serveur** avec la clé VAPID privée sécurisée.
- Le clic demande l'autorisation seulement lorsque l'utilisateur appuie sur « Activer les notifications ».
- Le service worker accepte les champs de notification `title`, `body`, `url`, `tag`. L'URL cliquable reste dans l'origine et le périmètre de l'application.
- Icône actuelle du dépôt = Z ; conserver cette icône pour la notification si c'est la version souhaitée, **mais remplacer l'icône principale de l'application par la tête officielle de Zika**.
- Prévoir la désinscription effective et le traitement des droits RGPD avant publication.
- Tester la réception sur un téléphone Android, l'app en arrière-plan et le clic.

## Ce qui est testé

`node --test android-playstore/tests/push.test.mjs` vérifie les notifications, les liens externes rejetés et la réouverture de l'application.

**Aucun test ne prouve pour l'instant la livraison de notifications réelles : la configuration serveur n'est pas disponible dans le dépôt.**
