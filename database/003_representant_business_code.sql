-- Ajoute une contrainte de format sur l'identifiant metier du representant.
-- Le format attendu est 10 chiffres, avec les 4 premiers chiffres correspondant a l'annee.
-- Exemple valide: 2026999999.
alter table representants
drop constraint if exists chk_representants_code_representant_format;

alter table representants
add constraint chk_representants_code_representant_format
check (
  code_representant ~ '^[0-9]{10}$'
  and substring(code_representant from 1 for 4)::int between 2020 and 2099
);
