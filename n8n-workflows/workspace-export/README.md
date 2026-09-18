# Export du workspace n8n

Instantané créé le 12 août 2026 à partir du conteneur local n8n 2.30.4.

- 6 workflows exportés au format JSON.
- Les workflows actifs et inactifs sont inclus.
- Les références aux credentials sont conservées pour faciliter la restauration.
- Aucun secret, mot de passe, jeton ou contenu de credential n'est stocké ici.
- Les credentials chiffrés et l'archive complète du volume sont conservés uniquement dans la sauvegarde locale ignorée par Git.

Ces fichiers peuvent être importés avec `n8n import:workflow`. Les credentials doivent être restaurés séparément avant d'activer les workflows qui en dépendent.
