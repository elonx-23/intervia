-- Seed PSE Gestion — généré par scripts/generate-seed.mjs

insert into public.access_codes (username, code, role, label)
values ('admin', '685096', 'admin', 'Administrateur');

with new_technicians as (
  insert into public.technicians (first_name, last_name) values
    ('Aaron', 'Fitoussi'),
    ('Eitan', 'Perez'),
    ('Elior', 'Djebali'),
    ('Elone', 'Levy'),
    ('Abd-rahim', 'Boudjadi'),
    ('Karl', 'Boccara'),
    ('Mohamed', 'Benmansour'),
    ('Aaron', 'Dylan'),
    ('Ben', 'Perez'),
    ('Maxime', 'Nicolas'),
    ('Adam', 'Ghazloun')
  returning id, first_name, last_name
)
insert into public.access_codes (username, code, role, technicien_id, label)
select v.username, v.code, 'technicien', nt.id, nt.first_name || ' ' || nt.last_name
from new_technicians nt
join (values
  ('Aaron', 'Fitoussi', 'aaron.fitoussi', '493618'),
  ('Eitan', 'Perez', 'eitan.perez', '716638'),
  ('Elior', 'Djebali', 'elior.djebali', '688962'),
  ('Elone', 'Levy', 'elone.levy', '156194'),
  ('Abd-rahim', 'Boudjadi', 'abd-rahim.boudjadi', '319947'),
  ('Karl', 'Boccara', 'karl.boccara', '397726'),
  ('Mohamed', 'Benmansour', 'mohamed.benmansour', '841338'),
  ('Aaron', 'Dylan', 'aaron.dylan', '790435'),
  ('Ben', 'Perez', 'ben.perez', '122084'),
  ('Maxime', 'Nicolas', 'maxime.nicolas', '599063'),
  ('Adam', 'Ghazloun', 'adam.ghazloun', '333883')
) as v(first_name, last_name, username, code)
  on v.first_name = nt.first_name and v.last_name = nt.last_name;
