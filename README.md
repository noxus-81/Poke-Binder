# ⚡ Poké Binder — Votre Classeur Pokémon Numérique

<p align="center">
  <img src="public/images/preview.png" alt="Poké Binder Preview" width="700" onerror="this.style.display='none'"/>
</p>

Poké Binder est une application web moderne inspirée de Pokécardex, conçue pour les dresseurs et collectionneurs de cartes Pokémon. Elle permet de rechercher n'importe quelle carte existante dans le monde, de consulter ses cotes réelles en direct, de gérer son classeur virtuel personnel et de scanner ses cartes physiques via photo.

---

## ✨ Fonctionnalités Clés

- **🔍 Catalogue Complet & Français** :
  - Recherche instantanée parmi plus de 22 000 cartes en français et international.
  - Filtre par langue d'illustration (*Scans 100% français* ou *Archives internationales*).
  - Tri par date de sortie, nom alphabétique ou valeur marchande.

- **💶 Cotes et Prix du Marché en Temps Réel** :
  - Données actualisées basées sur le marché européen (**CardMarket**) et mondial (**TCGPlayer**).
  - Prix affichés directement en Euros (**€**).
  - Détail des variantes : normale, holographique, reverse holo, 1ère édition.

- **📖 Classeur Virtuel Intelligent** :
  - Ajout et retrait en un clic depuis le catalogue ou le scanner.
  - Suivi des quantités possédées et de l'état de chaque carte (Near Mint, etc.).
  - Calcul automatique de la **valeur financière totale** de votre collection.

- **📷 Scanner de Cartes sans Quota (OCR Local)** :
  - Prenez une photo ou déposez une image de votre carte physique.
  - Reconnaissance automatique via **Tesseract.js** tournant directement dans le navigateur.
  - 100% privé, sans quota et sans clé d'IA payante.

- **🔄 Mises à Jour Quotidiennes Automatiques** :
  - Tâche planifiée automatique toutes les 24h sur le serveur.
  - **GitHub Actions** intégré (`.github/workflows/daily-update.yml`) qui actualise chaque nuit à 03h00 UTC les prix et le catalogue.

- **🔒 Sécurité Avancée des Comptes** :
  - Inscription via nom d'utilisateur, email ou numéro de téléphone.
  - Mots de passe hachés avec `bcryptjs` (aucun mot de passe en clair).
  - Sessions sécurisées par tokens JWT stockés en **cookies `HttpOnly`** (invisibles et impossibles à voler via l'inspecteur F12 ou console JS).

---

## 🚀 Installation & Lancement Rapide

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- Git

### 2. Cloner le projet
```bash
git clone https://github.com/VOTRE_PSEUDO/poke-binder.git
cd poke-binder
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Lancer le serveur
```bash
npm start
```
L'application sera accessible sur **http://localhost:3000** 🎉

---

## 🛠️ Stack Technique

- **Front-end** : HTML5, CSS3 Moderne (Glassmorphism, thème Pokémon interactif), JavaScript Vanilla (Single Page Application réactive).
- **Back-end** : Node.js, Express.
- **Base de Données** : SQLite via WebAssembly (`sql.js`) avec persistance disque et système de cache local 7 jours.
- **Authentification** : JWT (JSON Web Tokens) & cookies HttpOnly + `bcryptjs`.
- **Vision / OCR** : Tesseract.js (reconnaissance de texte embarquée côté client).
- **Sources de Données** : TCGDex API (catalogue FR & cotes CardMarket sans clé requise) avec fallback PokéTCG.
- **Automatisation CI/CD** : GitHub Actions pour la mise à jour nocturne des prix.

---

## 📂 Structure du Répertoire

```text
pokecardex/
├── .github/
│   └── workflows/
│       └── daily-update.yml       # Tâche planifiée GitHub Actions (3h UTC)
├── db/
│   ├── database.js               # Schéma et gestionnaire SQLite (sql.js)
│   └── pokecardex.db             # Base de données persistante
├── middleware/
│   └── auth.js                   # Vérification JWT et protection des routes
├── routes/
│   ├── auth.js                   # Inscription, connexion, déconnexion sécurisées
│   ├── cards.js                  # Recherche, filtres, multi-CDN d'images & prix €
│   ├── collection.js             # Gestion du classeur et statistiques
│   └── scan.js                   # Analyse et identification de cartes
├── scripts/
│   └── update-prices.js          # Script d'actualisation quotidienne des cotes
├── public/
│   ├── index.html                # Interface utilisateur principale
│   ├── css/
│   │   └── styles.css            # Thème complet Pokémon responsive
│   └── js/
│       ├── api.js                # Client API avec auto-refresh de session
│       ├── auth.js               # Logique de compte utilisateur
│       ├── cards.js              # Recherche et modals
│       ├── collection.js         # Affichage du classeur virtuel
│       ├── scan.js               # Scanner OCR drag & drop / caméra
│       └── app.js                # Initialisation et navigation SPA
├── server.js                     # Serveur Express & timer quotidien 24h
├── package.json
└── README.md
```

---

## ⚙️ Déploiement en Ligne (Ex: Render, Railway, VPS)

Pour héberger votre site gratuitement ou à bas coût :
1. Créez un projet sur **Render.com** ou **Railway.app** connecté à votre repo GitHub.
2. Définissez la commande de build : `npm install`
3. Définissez la commande de démarrage : `npm start`
4. Ajoutez la variable d'environnement `PORT` (ex: 3000) et un secret `JWT_SECRET` aléatoire.

---

## 📄 Licence

Ce projet est sous licence MIT. Les cartes, illustrations et noms Pokémon sont des marques déposées de The Pokémon Company, Nintendo, Creatures Inc. et Game Freak.
