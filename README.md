# Luminova

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is almost ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/getting-started/tutorials/react-monorepo-tutorial?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

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
