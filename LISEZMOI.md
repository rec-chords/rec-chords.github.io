# Rec. — mise en route

Rec. est ton carnet de vocaux musicaux : tu enregistres, puis tu ranges chaque prise
dans une **idée** (nouvelle ou suite d'une idée existante). Tu peux glisser les prises d'un bloc à l'autre.

## Utilisation

- **Barre « Enregistrer » en bas** : tu enregistres. À l'arrêt, l'appli pose une seule question : « une nouvelle idée » ou « la suite d'une idée ». Tu peux aussi répondre « je décide plus tard ».
- **« + enregistrer une suite »** sous une idée : la prise va directement dans cette idée.
- **Glisser-déposer** : à la souris, attrape une prise et lâche-la sur un autre bloc. Au téléphone, fais un **appui long**
  sur la prise, puis glisse-la. Si tu la lâches entre deux prises, tu changes l'ordre. Si tu la lâches sur la zone
  « Lâche ici pour créer une nouvelle idée », tu crées une nouvelle idée.
- **« écouter »** (à droite du titre de l'idée) : enchaîne toutes les prises d'une idée.
- **Forme d'onde** : clique dessus pour aller directement à un endroit de la prise.
- **⋯** sur une idée : renommer, étiquettes, notes (tonalité, accords, paroles), favori, fusionner, supprimer.
- **⋯** sur une prise : renommer, note, déplacer, télécharger, supprimer.
- **« importer »** (en haut à droite) : charge tes anciens vocaux, ils arrivent dans « À trier ».
- **Texte** : « + écrire un texte » sous une idée ouvre une page pour tes paroles, accords ou notes. Le texte s'affiche ensuite sous le titre de l'idée ; touche-le pour le modifier. Le bouton « écouter » lance les prises pendant que tu écris.
- Sur PC, **glisse des fichiers audio** depuis un dossier vers la page : lâche-les sur une idée pour les y ajouter, sur « déposer ici pour une nouvelle idée » pour en créer une, ou ailleurs pour les envoyer dans « À trier ».
- Sur PC, la **barre d'espace** lance et arrête l'enregistrement.
- **Apparence** : sombre ou clair, dans les réglages.

Tant que la synchro n'est pas configurée, l'appli est en **mode essai** : les vocaux restent dans le navigateur de l'appareil.

---

> **Adresse de l'appli :** <https://neorama-cleansheets.github.io/rec/>
>
> **État actuel :** les étapes 1 et 3 sont déjà faites. Le projet Supabase `fredon` existe, les tables sont installées,
> l'utilisateur est créé et l'appli pointe dessus (adresse et clé publique dans `store.js`). Il reste l'étape 2 (mise en ligne)
> et l'étape 4 (installation sur le téléphone). Sur un nouvel appareil, il suffit de saisir l'e-mail et le mot de passe.

## 1. Créer l'espace de stockage (Supabase, gratuit, environ 5 min)

1. Va sur <https://supabase.com>, crée un compte, puis **New project**. Choisis un nom (`fredon`), un mot de passe de base
   de données (garde-le de côté, l'appli n'en a pas besoin) et la région la plus proche (*Paris* ou *Frankfurt*).
2. Dans le projet, ouvre **SQL Editor**, puis **New query**. Colle tout le contenu du fichier `supabase-setup.sql` et clique **Run**.
   Le message « Success » doit s'afficher.
3. Crée ton utilisateur : **Authentication**, puis **Users**, puis **Add user**, puis **Create new user**. Saisis ton e-mail et un mot de passe,
   et coche **Auto Confirm User**.
4. Récupère tes deux informations de connexion : **Project Settings**, puis **API** (ou **Data API / API Keys**) :
   - l'**URL du projet** (`https://xxxx.supabase.co`) ;
   - la clé **anon public** (ou **publishable**). Cette clé est faite pour être utilisée dans une appli web.
     ⚠️ Ne prends jamais la clé *service_role* / *secret*.

> Bon à savoir : sur l'offre gratuite, un projet inactif pendant 7 jours est mis en pause. Si ça arrive,
> un clic sur **Restore** dans le tableau de bord le relance, sans perte de données. Le stockage gratuit fait 1 Go.
> Une minute de vocal pèse environ 0,7 Mo, donc 1 Go représente environ 1 400 minutes (à peu près 23 heures).

## 2. Mettre l'appli en ligne (pour l'ouvrir sur le téléphone)

Le micro ne fonctionne que sur une page en **https**. Le plus simple est Netlify :

1. Crée un compte sur <https://app.netlify.com>.
2. Va dans **Add new project**, puis **Deploy manually**, et glisse le dossier `fredon` entier dans la zone.
3. Netlify te donne une adresse du type `https://xxxx.netlify.app`. Tu peux la renommer dans *Site configuration*, par exemple `fredon-ton-nom`.

Pour mettre à jour l'appli plus tard, il suffit de reglisser le dossier dans **Deploys**.

## 3. Connecter l'appli

Sur chaque appareil (PC et téléphone) :

1. Ouvre ton adresse `https://….netlify.app`.
2. Ouvre **réglages** (en haut à droite), choisis **Synchronisé**, puis colle l'URL et la clé, saisis ton e-mail et ton mot de passe, et touche **Se connecter**.
3. Si tu as enregistré des vocaux en mode essai, l'appli te propose de les envoyer dans le cloud.

## 4. L'installer comme une appli sur le téléphone

- **Android (Chrome)** : menu ⋮, puis **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
- **iPhone (Safari)** : bouton Partager, puis **Sur l'écran d'accueil**.

L'appli s'ouvre ensuite en plein écran, comme une vraie appli.

## Astuces

- Garde l'écran allumé pendant que tu enregistres. Sur téléphone, un enregistrement peut s'arrêter si l'écran se verrouille.
- Quand tu reviens sur l'appli, elle récupère automatiquement ce que tu as fait sur l'autre appareil.

## Tester sur le PC sans rien installer

```bash
python -m http.server 5173 --directory fredon
```

Ouvre ensuite <http://localhost:5173>. Le micro marche sur `localhost`.

## Groupes

- **Créer** : « + groupe » en haut, puis « Créer un groupe ». Tu en es l'admin et tu reçois un code d'invitation de 8 caractères (bouton « membres » pour le retrouver).
- **Inviter** : chaque musicien ouvre Rec., crée son compte dans « réglages », touche « + groupe », « Rejoindre un groupe » et saisit le code.
- **Deux rôles** : l'**admin** peut retirer un membre, supprimer n'importe quelle prise ou idée du groupe, renommer ou supprimer le groupe. Un **membre** peut écouter, enregistrer une suite, modifier les textes et supprimer ses propres prises.
- **Partager une idée** : menu ⋯ de l'idée, « Partager avec un groupe ». Seul son auteur peut la retirer du groupe.
- **Instrument** : après un enregistrement, choisis voix, guitare, basse, clavier, batterie ou autre. L'icône s'affiche devant la prise ; elle se change par le menu ⋯ de la prise.
- Les règles serveur des groupes sont dans `supabase-groupes.sql` (déjà exécuté).
