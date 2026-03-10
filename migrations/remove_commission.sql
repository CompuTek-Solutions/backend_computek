-- Migration pour supprimer la commission des vendeurs
-- Exécuter cette migration pour enlever la logique de commission

-- Supprimer la colonne commission_rate de la table users
ALTER TABLE users DROP COLUMN IF EXISTS commission_rate;

-- Mettre à jour les vues ou procédures stockées si nécessaire
-- (À ajouter si vous avez des vues qui utilisent commission_rate)

-- Confirmer la modification
SELECT 'Column commission_rate removed from users table' as status;
