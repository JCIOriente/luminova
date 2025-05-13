# Luminova

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is almost ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/getting-started/tutorials/react-monorepo-tutorial?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Run tasks

To run the dev server for your app, use:

```sh
npx nx serve spotlight
```

To create a production bundle:

```sh
npx nx build spotlight
```

To see all available targets to run for a project, run:

```sh
npx nx show project spotlight
```

## Add new projects

```sh
npx nx g @nx/react:app demo
```

To generate a new library, use:

```sh
nx g @nx/react:lib libs/<mylib> --bundler vite --unitTestRunner vitest --compiler swc

nx g @nx/js:lib libs/<mylib> --bundler swc --unitTestRunner vitest
```

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Firebase

```sh
firebase target:apply hosting <IDENTIFIER> <SITE>

# Executed so far
firebase target:apply hosting spotlight jcioriente
firebase target:apply hosting backstage jcioriente-backstage

firebase deploy --only hosting
```

### Firebase Emulators

Firebase emulators provide a local development environment to test Firebase services without affecting your production environment. This allows you to:

- Test Firestore database operations
- Debug Cloud Functions
- Verify hosting configurations
- Work offline without internet connection

The emulator suite dashboard is available at: http://localhost:4100/

#### Development Workflow

For an optimal development experience, you can run both the Firebase emulators and your application in watch mode simultaneously. This setup enables:

1. Real-time code updates without manual restarts
2. Local data persistence between sessions
3. Automatic rebuilds when changes are detected

Here's how to set it up:

```sh
# Start the Firebase emulators
firebase emulators:start --only firestore,functions,hosting --import ./.data --export-on-exit

# Start the application in watch mode
nx build spotlight --watch
```

With these steps, you can develop and test your Firebase services locally without affecting your production environment.
