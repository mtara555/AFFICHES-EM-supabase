// @ts-check
/**
 * AFFICHES-EM v1.0 — Migration Appwrite -> Supabase
 * ---------------------------------------------------------------------------
 * Deux etapes separees, pour ne lire Appwrite qu'UNE seule fois :
 *
 *   npm run migrer:export     Appwrite  -> dossier local export-appwrite/
 *   npm run migrer:import     dossier local -> Supabase
 *   npm run migrer:import -- --simulation   verifie l'export sans rien ecrire
 *
 * Options (export) : --sans-journal   ignore la table journal (la plus volumineuse)
 *                    --sans-fichiers  ignore le bucket « medias »
 * Options (import) : --simulation     n'ecrit rien dans Supabase
 *
 * Les deux etapes sont RELANCABLES : l'import utilise des upserts sur
 * l'identifiant, qui est conserve (un logo reste `logo_<idMarque>`).
 *
 * ATTENTION — l'export lit chaque ligne : tant que la limite de lectures
 * d'Appwrite est depassee, il echoue. Attendez la remise a zero du cycle de
 * facturation (Console Appwrite > Facturation) ou relevez le plafond de budget
 * le temps de l'export, puis rebaissez-le.
 *
 * UTILISATEURS — les mots de passe Appwrite ne sont pas exportables. Les
 * comptes sont recrees dans Supabase avec un mot de passe temporaire, ecrit
 * dans utilisateurs-migres.csv (a distribuer puis supprimer).
 *
 * Cles necessaires, dans .env.local (jamais versionne) :
 *   export : APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID, APPWRITE_API_KEY
 *   import : VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Supprimez-les, puis revoquez-les, une fois la migration terminee.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'export-appwrite');
const DOSSIER_FICHIERS = join(DOSSIER, 'fichiers');
const ARGS = new Set(process.argv.slice(3));
const COMMANDE = process.argv[2];

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                 */
/* -------------------------------------------------------------------------- */

function chargerEnv() {
  try {
    const contenu = readFileSync(join(RACINE, '.env.local'), 'utf8');
    for (const ligne of contenu.split('\n')) {
      const nette = ligne.trim();
      if (!nette || nette.startsWith('#')) continue;
      const sep = nette.indexOf('=');
      if (sep === -1) continue;
      const cle = nette.slice(0, sep).trim();
      const valeur = nette.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
      if (!(cle in process.env)) process.env[cle] = valeur;
    }
  } catch {
    /* fichier absent : variables du shell */
  }
}

function exiger(noms) {
  const manquants = noms.filter((n) => !process.env[n]);
  if (manquants.length > 0) {
    console.error(`\nConfiguration incomplete. Variables manquantes : ${manquants.join(', ')}\n`);
    process.exit(1);
  }
}

const ecrireJson = (nom, donnees) =>
  writeFileSync(join(DOSSIER, nom), JSON.stringify(donnees, null, 1), 'utf8');

const lireJson = (nom) => {
  const chemin = join(DOSSIER, nom);
  if (!existsSync(chemin)) return [];
  return JSON.parse(readFileSync(chemin, 'utf8'));
};

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[36mℹ\x1b[0m ${m}`);
const avert = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

/* Tables Appwrite -> fichiers d'export */
const TABLES = [
  ['marques', 'marques.json'],
  ['articles', 'articles.json'],
  ['campagnes', 'campagnes.json'],
  ['affiches', 'affiches.json'],
  ['parametres', 'parametres.json'],
  ['journal', 'journal.json'],
  ['demandes-article', 'demandes-article.json'],
];

/* -------------------------------------------------------------------------- */
/* EXPORT : Appwrite -> fichiers locaux                                        */
/* -------------------------------------------------------------------------- */

async function exporter() {
  exiger(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY']);
  const { Client, TablesDB, Storage, Users, Teams, Query } = await import('node-appwrite');

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  const databaseId = process.env.APPWRITE_DATABASE_ID || 'affiches-em';
  const tablesDB = new TablesDB(client);
  const storage = new Storage(client);
  const users = new Users(client);
  const teams = new Teams(client);

  mkdirSync(DOSSIER_FICHIERS, { recursive: true });
  console.log('\nExport Appwrite -> export-appwrite/\n');

  /** Lit toutes les pages d'une liste Appwrite, par curseur. */
  async function toutLire(lister, cle) {
    const PAGE = 100;
    const tout = [];
    let curseur = null;
    for (;;) {
      const queries = [Query.limit(PAGE)];
      if (curseur) queries.push(Query.cursorAfter(curseur));
      const reponse = await lister(queries);
      const page = reponse[cle];
      tout.push(...page);
      if (page.length < PAGE) break;
      curseur = page[page.length - 1].$id;
    }
    return tout;
  }

  // 1. Utilisateurs et roles
  const comptes = await toutLire((queries) => users.list({ queries }), 'users');
  const roles = new Map();
  for (const [equipe, role] of [['operateurs', 'operateur'], ['administrateurs', 'administrateur']]) {
    try {
      const membres = await toutLire(
        (queries) => teams.listMemberships({ teamId: equipe, queries }),
        'memberships',
      );
      membres.forEach((m) => roles.set(m.userId, role)); // l'administrateur l'emporte (traite en dernier)
    } catch (e) {
      avert(`Equipe « ${equipe} » illisible : ${e instanceof Error ? e.message : e}`);
    }
  }
  const utilisateurs = comptes
    .filter((u) => u.email)
    .map((u) => ({ id: u.$id, email: u.email, nom: u.name || u.email, role: roles.get(u.$id) ?? 'aucun' }));
  ecrireJson('utilisateurs.json', utilisateurs);
  ok(`${utilisateurs.length} utilisateur(s)`);

  // 2. Tables
  for (const [tableId, fichier] of TABLES) {
    if (tableId === 'journal' && ARGS.has('--sans-journal')) {
      info('Table journal ignoree (--sans-journal)');
      continue;
    }
    try {
      const lignes = await toutLire(
        (queries) => tablesDB.listRows({ databaseId, tableId, queries }),
        'rows',
      );
      ecrireJson(fichier, lignes);
      ok(`${lignes.length} ligne(s) — ${tableId}`);
    } catch (e) {
      console.error(`\n  ✗ Table « ${tableId} » : ${e instanceof Error ? e.message : e}`);
      console.error('    (limite de lectures depassee ? voir l\'en-tete du script)\n');
      process.exit(1);
    }
  }

  // 3. Fichiers du bucket « medias »
  if (ARGS.has('--sans-fichiers')) {
    info('Fichiers ignores (--sans-fichiers)');
  } else {
    const fichiers = await toutLire((queries) => storage.listFiles({ bucketId: 'medias', queries }), 'files');
    const index = [];
    let n = 0;
    for (const f of fichiers) {
      const contenu = await storage.getFileDownload({ bucketId: 'medias', fileId: f.$id });
      writeFileSync(join(DOSSIER_FICHIERS, f.$id), Buffer.from(contenu));
      index.push({ id: f.$id, nom: f.name, type: f.mimeType, taille: f.sizeOriginal });
      n += 1;
      if (n % 25 === 0) info(`${n}/${fichiers.length} fichiers...`);
    }
    ecrireJson('fichiers.json', index);
    ok(`${index.length} fichier(s) telecharge(s)`);
  }

  console.log('\nExport termine. Etape suivante : npm run migrer:import -- --simulation\n');
}

/* -------------------------------------------------------------------------- */
/* IMPORT : fichiers locaux -> Supabase                                        */
/* -------------------------------------------------------------------------- */

/** Fonctions de conversion Appwrite -> Supabase (pures : testables sans reseau). */
export function convertir(donnees, proprietaire) {
  const { marques, articles, campagnes, affiches, parametres, journal, demandes } = donnees;
  const rapports = [];

  const marquesBase = marques.map((l) => ({
    id: l.$id,
    nom: l.nom,
    logo_file_id: l.logoFileId ?? null,
    actif: l.actif ?? true,
    created_at: l.$createdAt,
  }));

  const articlesBase = articles.map((l) => ({
    id: l.$id,
    ean: l.ean,
    marque_id: l.marqueId,
    designation: l.designation,
    reference: l.reference ?? '',
    categorie: l.categorie,
    photo_file_id: l.photoFileId ?? null,
    picto1: l.picto1 ?? '',
    picto2: l.picto2 ?? '',
    picto3: l.picto3 ?? '',
    picto4: l.picto4 ?? '',
    picto5: l.picto5 ?? '',
    picto6: l.picto6 ?? '',
    livraison_gratuite_exclue: l.livraisonGratuiteExclue ?? false,
    actif: l.actif ?? true,
    created_at: l.$createdAt,
  }));

  const campagnesBase = campagnes.map((l) => ({
    id: l.$id,
    nom: l.nom,
    statut: l.statut ?? 'brouillon',
    gabarit: l.gabarit || null,
    date_debut: l.dateDebut ?? null,
    date_fin: l.dateFin ?? null,
    created_by: proprietaire(l.createdBy),
    created_at: l.$createdAt,
  }));

  const auteurCampagne = new Map(campagnesBase.map((c) => [c.id, c.created_by]));
  let orphelines = 0;
  const affichesBase = [];
  for (const l of affiches) {
    const auteur = auteurCampagne.get(l.campagneId);
    if (!auteur) {
      orphelines += 1;
      continue;
    }
    affichesBase.push({
      id: l.$id,
      campagne_id: l.campagneId,
      ean: l.ean,
      prix_barre: l.prixBarre ?? 0,
      prix_principal: l.prixPrincipal,
      format: l.format ?? 'A4',
      stock_limite: l.stockLimite ?? false,
      nouveaute: l.nouveaute ?? false,
      promotion: l.promotion ?? false,
      mentions: l.mentions ?? '',
      visuel_fond_file_id: l.visuelFondFileId ?? null,
      ordre: l.ordre ?? 0,
      created_by: auteur, // l'auteur de la campagne : les affiches n'avaient pas de colonne auteur
      created_at: l.$createdAt,
    });
  }
  if (orphelines > 0) rapports.push(`${orphelines} affiche(s) orpheline(s) ignoree(s) (campagne introuvable)`);

  return {
    marques: marquesBase,
    articles: articlesBase,
    campagnes: campagnesBase,
    affiches: affichesBase,
    parametres: parametres.map((l) => ({
      id: l.$id,
      cle: l.cle,
      valeur: l.valeur,
      description: l.description ?? null,
    })),
    journal: journal.map((l) => ({
      id: l.$id,
      action: l.action,
      ressource: l.ressource,
      user_id: proprietaire(l.userId),
      utilisateur: l.utilisateur ?? null,
      appareil: l.appareil ?? null,
      avant: l.avant ?? null,
      apres: l.apres ?? null,
      date: l.date ?? l.$createdAt,
    })),
    demandes_article: demandes.map((l) => ({
      id: l.$id,
      ean: l.ean,
      demandeur: proprietaire(l.demandeur),
      commentaire: l.commentaire ?? null,
      statut: l.statut ?? 'en_attente',
      created_at: l.$createdAt,
    })),
    rapports,
  };
}

async function importer() {
  const simulation = ARGS.has('--simulation');
  if (!simulation) exiger(['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!existsSync(join(DOSSIER, 'utilisateurs.json'))) {
    console.error('\nAucun export trouve : lancez d\'abord « npm run migrer:export ».\n');
    process.exit(1);
  }

  console.log(`\nImport -> Supabase${simulation ? ' (SIMULATION : rien n\'est ecrit)' : ''}\n`);

  const utilisateurs = lireJson('utilisateurs.json');
  const correspondance = new Map(); // ancien id Appwrite -> uuid Supabase
  let premierAdmin = null;
  const csv = ['email;role;mot_de_passe_temporaire'];

  let supabase = null;
  if (!simulation) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // 1. Comptes
  const existants = new Map();
  if (supabase) {
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      data.users.forEach((u) => u.email && existants.set(u.email.toLowerCase(), u.id));
      if (data.users.length < 1000) break;
    }
  }
  let crees = 0;
  for (const u of utilisateurs) {
    let id = existants.get(u.email.toLowerCase());
    if (!id) {
      if (!supabase) {
        id = `simule-${u.id}`;
      } else {
        const motDePasse = randomBytes(9).toString('base64url');
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: motDePasse,
          email_confirm: true,
          user_metadata: { nom: u.nom },
        });
        if (error || !data.user) {
          avert(`Compte ${u.email} non cree : ${error?.message ?? 'erreur inconnue'}`);
          continue;
        }
        id = data.user.id;
        csv.push(`${u.email};${u.role};${motDePasse}`);
        crees += 1;
      }
    }
    correspondance.set(u.id, id);
    if (!premierAdmin && u.role === 'administrateur') premierAdmin = id;
    if (supabase) {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id, nom: u.nom, role: u.role }, { onConflict: 'id' });
      if (error) avert(`Profil ${u.email} : ${error.message}`);
    }
  }
  ok(`${utilisateurs.length} compte(s) traite(s), ${crees} cree(s)`);
  if (crees > 0) {
    writeFileSync(join(RACINE, 'utilisateurs-migres.csv'), csv.join('\n') + '\n', 'utf8');
    info('Mots de passe temporaires ecrits dans utilisateurs-migres.csv (a distribuer, puis supprimer).');
  }

  const parDefaut = process.env.SUPABASE_PROPRIETAIRE_PAR_DEFAUT || premierAdmin;
  if (!parDefaut) {
    console.error('\nAucun administrateur trouve : impossible d\'attribuer les lignes dont l\'auteur a disparu.');
    console.error('Definissez SUPABASE_PROPRIETAIRE_PAR_DEFAUT (uuid d\'un compte Supabase).\n');
    process.exit(1);
  }
  let sansProprietaire = 0;
  const proprietaire = (ancienId) => {
    const nouveau = ancienId ? correspondance.get(ancienId) : undefined;
    if (!nouveau) sansProprietaire += 1;
    return nouveau ?? parDefaut;
  };

  // 2. Tables
  const donnees = convertir(
    {
      marques: lireJson('marques.json'),
      articles: lireJson('articles.json'),
      campagnes: lireJson('campagnes.json'),
      affiches: lireJson('affiches.json'),
      parametres: lireJson('parametres.json'),
      journal: lireJson('journal.json'),
      demandes: lireJson('demandes-article.json'),
    },
    proprietaire,
  );

  for (const table of ['marques', 'articles', 'campagnes', 'affiches', 'parametres', 'journal', 'demandes_article']) {
    const lignes = donnees[table];
    if (supabase) {
      for (let i = 0; i < lignes.length; i += 500) {
        const { error } = await supabase.from(table).upsert(lignes.slice(i, i + 500), { onConflict: 'id' });
        if (error) {
          console.error(`\n  ✗ ${table} (lignes ${i + 1}-${i + 500}) : ${error.message}\n`);
          process.exit(1);
        }
      }
    }
    ok(`${lignes.length} ligne(s) — ${table}`);
  }
  donnees.rapports.forEach(avert);
  if (sansProprietaire > 0) {
    avert(`${sansProprietaire} ligne(s) rattachee(s) au proprietaire par defaut (auteur introuvable)`);
  }

  // 3. Fichiers
  const fichiers = lireJson('fichiers.json');
  if (supabase && fichiers.length > 0) {
    let n = 0;
    for (const f of fichiers) {
      const contenu = readFileSync(join(DOSSIER_FICHIERS, f.id));
      const { error } = await supabase.storage
        .from('medias')
        .upload(f.id, contenu, { upsert: true, contentType: f.type });
      if (error) avert(`Fichier ${f.id} : ${error.message}`);
      else n += 1;
    }
    ok(`${n}/${fichiers.length} fichier(s) envoye(s)`);
  } else {
    ok(`${fichiers.length} fichier(s) a envoyer`);
  }

  console.log(
    simulation
      ? '\nSimulation terminee. Relancez sans --simulation pour ecrire dans Supabase.\n'
      : '\nImport termine. Supprimez la cle service_role de .env.local et revoquez-la.\n',
  );
}

/* -------------------------------------------------------------------------- */

chargerEnv();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lancer = COMMANDE === 'export' ? exporter : COMMANDE === 'import' ? importer : null;
  if (!lancer) {
    console.error('Usage : node scripts/migrer-appwrite-vers-supabase.mjs <export|import> [options]');
    process.exit(1);
  }
  lancer().catch((e) => {
    console.error('\nEchec :', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
