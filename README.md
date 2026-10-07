# AFFICHES-EM v1.0

Générateur d'affiches prix pour le département Électroménager.
Remplace le classeur Excel à macros VBA (`SAISIE_EM` / `BASE_DONNEES_EM`) et la génération PowerPoint.

**Architecture** — Application web progressive (PWA) hébergée sur GitHub Pages, données, authentification et stockage des visuels sur Supabase.

---

## Mise en service (Supabase)

1. **Créer le projet** sur [supabase.com](https://supabase.com) (région proche, par exemple Europe).
2. **Créer les tables, les droits et le bucket** : *SQL Editor* → *New query* → coller le contenu de `supabase/schema.sql` → *Run*. Le script est relançable sans risque.
3. **Créer le premier administrateur** : *Authentication* → *Users* → *Add user* (e-mail + mot de passe, cocher *Auto Confirm User*), puis dans le *SQL Editor* :

```sql
update public.profiles set role = 'administrateur'
where id = (select id from auth.users where email = 'vous@exemple.com');
```

4. **Relier l'application** : *Project Settings* → *API*. Copiez `.env.example` en `.env.local` et renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé *anon* / *publishable*, **jamais** la clé *service_role*).
5. **Déploiement GitHub Pages** : dans le dépôt, *Settings* → *Secrets and variables* → *Actions* → onglet **Variables**, créez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

### Rôles et utilisateurs

Le rôle est lu dans la table `profiles` (`administrateur`, `operateur` ou `aucun`) et appliqué par la base elle-même (RLS) : modifier le code du navigateur ne donne aucun droit supplémentaire. Un nouveau compte a le rôle `aucun` tant qu'un administrateur ne lui en attribue pas un :

```sql
update public.profiles set role = 'operateur'
where id = (select id from auth.users where email = 'collegue@exemple.com');
```

### Limites du plan gratuit Supabase (à connaître)

- **Pause après 7 jours sans activité** : le projet s'arrête ; il se relance depuis le tableau de bord Supabase. Pour un usage quotidien en magasin, ce n'est en général pas un problème ; pendant les congés, oui.
- 500 Mo de base de données, 1 Go de fichiers, 5 Go de transfert par mois.
- Pas de facturation à la ligne lue : le quota qui a bloqué Appwrite n'existe pas ici.

---

## Migration depuis Appwrite

À faire une seule fois, après les étapes 1 à 3 ci-dessus.

1. **Débloquer la lecture d'Appwrite** : attendre la remise à zéro du cycle de facturation (Console Appwrite → Facturation) ou relever temporairement le plafond de budget. L'export lit toutes les lignes.
2. Dans `.env.local`, renseigner `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_DATABASE_ID`, `APPWRITE_API_KEY` (droits : `databases.read`, `files.read`, `users.read`, `teams.read`) puis lancer :

```bash
npm run migrer:export          # Appwrite -> dossier export-appwrite/ (une seule lecture)
```

3. Ajouter `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`, puis :

```bash
npm run migrer:import -- --simulation   # vérifie l'export sans rien écrire
npm run migrer:import                    # écrit dans Supabase
```

4. Distribuer les mots de passe temporaires de `utilisateurs-migres.csv` (les mots de passe Appwrite ne sont pas exportables), puis supprimer ce fichier.
5. Retirer toutes les clés de `.env.local` et révoquer la clé API Appwrite et la clé `service_role`.

Les identifiants sont conservés : les logos, pictogrammes et affiches gardent leurs liens. Les affiches reprennent comme auteur celui de leur campagne.

---

## Démarrer dans GitHub Codespaces

1. Sur la page du dépôt, cliquez sur **Code** → onglet **Codespaces** → **Create codespace on main**.
2. Attendez l'ouverture de l'éditeur (une à deux minutes au premier lancement).
3. Dans le terminal intégré :

```bash
npm install
npm run dev
```

4. Codespaces propose automatiquement d'ouvrir l'aperçu dans le navigateur. L'application se recharge à chaque modification enregistrée.

Le terminal s'exécute sur les serveurs GitHub : aucune installation n'est nécessaire sur votre poste.

---

## Commandes disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement instantané |
| `npm run build` | Compilation de production dans `dist/` |
| `npm run preview` | Prévisualise le résultat de `build` |
| `npm run typecheck` | Vérifie les types sans produire de fichiers |

---

## Structure du projet

```
AFFICHES-EM_v1.0/
├─ public/                    Fichiers servis tels quels
│  ├─ icon.svg                Icône de l'application
│  ├─ icon-maskable.svg       Icône adaptative (Android)
│  └─ favicon.svg
├─ src/
│  ├─ components/             Composants réutilisables
│  │  └─ AppShell.tsx         Barre latérale, en-tête, zone de contenu
│  ├─ config/
│  │  └─ constants.ts         Formats, catégories, règles commerciales
│  ├─ lib/
│  │  └─ supabase.ts          Client Supabase, noms de tables, gestion des erreurs
│  ├─ pages/                  Écrans de l'application
│  ├─ styles/
│  │  ├─ tokens.css           Palette, typographie, espacements
│  │  └─ global.css           Réinitialisation et styles de base
│  ├─ App.tsx                 Routage
│  └─ main.tsx                Point d'entrée
├─ supabase/schema.sql        Tables, droits (RLS) et bucket de visuels
├─ scripts/                   Migration Appwrite -> Supabase
├─ .env.example               Modèle de configuration Supabase
├─ index.html
└─ vite.config.ts             Build, chemin GitHub Pages, PWA
```

---

## Configuration et sécurité

```bash
cp .env.example .env.local
```

`.env.local` n'est jamais versionné.

**Point important** — l'URL du projet et la clé *anon* sont publiques par conception : elles figurent dans le code de toute application cliente Supabase. La sécurité repose entièrement sur les règles RLS de `supabase/schema.sql`, jamais sur leur confidentialité.

**La clé `service_role` ne doit jamais figurer dans ce dépôt** : elle contourne toutes les règles. Elle ne sert qu'au script de migration, depuis `.env.local`.

---

## Choix techniques notables

**Routage par fragment (`HashRouter`)** — GitHub Pages ne sait pas rediriger les URL profondes vers `index.html`. Les adresses prennent donc la forme `.../#/campagnes`, ce qui fonctionne sans configuration serveur.

**Chemin de base dynamique** — GitHub Pages sert le site depuis `/<nom-du-dépôt>/`. La variable `BASE_PATH`, injectée par le workflow de déploiement, ajuste automatiquement les chemins des ressources et du manifeste PWA.

**Règles commerciales dans `constants.ts`** — le barème de crédit et les seuils y figurent comme valeurs par défaut. À partir de l'étape 0.4, ils seront lus depuis Supabase et modifiables par un administrateur, conformément au document de cadrage.

---

## Phase 3 — Génération des affiches A4 (Electro / Image & Son)

Reproduction fidèle du modèle PowerPoint `EMPOTXA4.potx` (cotes en mm relevées dans le fichier).

| Élément | Règle (identique à la macro `InsererDonnees`) |
|---|---|
| Gabarit | **Electro** (fond bleu) : gem, pem, cuisson, froid, lavage — **Nouvelles technologies** (fond rose) : image-son, nt, telephonie, pc. Forçable à l'impression. |
| Logo | Fichier `logo_<idMarque>` du bucket `medias` ; à défaut, nom de la marque en toutes lettres. |
| Pictos 1 à 6 | Fichiers `picto_<CODE>` ; à défaut, hexagone jaune (ou cartouche rouge « GARANTIE » pour `1AN`, `2ANS`, `5ANS`…). |
| Prix barré | Affiché dès qu'il dépasse le prix de vente, avec le trait orange. |
| Bandeau « وفر » | Seulement si la remise ≥ seuil (10 %). |
| Crédit 0 % | À partir de 2 999 dh (12 / 15 / 18 / 24 mois). |
| Livraison gratuite | À partir de 2 000 dh, sauf article exclu. |

**Écrans** : aperçu en direct dans la saisie ; bouton **Affiches** (liste des campagnes) ou **Aperçu & impression** (saisie) → page `/affiches/:campagneId`.

**Impression / PDF** : bouton *Imprimer / PDF*, puis A4, marges *Aucune*, échelle 100 %, *Graphiques d'arrière-plan* coché. Les formats A5 / A6 / A7 sont imposés automatiquement (2 / 4 / 8 par feuille A4).

**Visuels fixes** : `public/affiches/` (cadres, crédit 0 %, livraison gratuite) — extraits du modèle PowerPoint.
