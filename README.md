# Unison for Visual Studio Code

Official editor support for the [Unison language](https://unison-lang.org/).

Provides syntax highlighting and Language Server support.

## Features

Learn about features [here](https://github.com/unisonweb/unison/blob/trunk/docs/language-server.markdown).

## Requirements

This plugin requires the [**UCM** (Unison Codebase Manager)](https://github.com/unisonweb/unison).

## Installing

Follow the instructions in your editor to install from either:

* [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=unison-lang.unison)
* [Open VSX](https://open-vsx.org/extension/unison-lang/unison)

## Extension Settings

The default settings are configured for you, so there's no need to make changes.
If you'd like to override the defaults you can do so with the following options:

```
{
  // The port where UCM is serving the language server
  "unison.lspPort" = 5757
}
```

## Release Notes

See the [CHANGELOG](./CHANGELOG.md) for updates.

## Development

* Run the build in watch mode in a separate terminal: `npm start`
* Open the project in VS Code: `code .`
* Press F5 to load the extension into the VS Code extension host.

## Publishing new versions

1. Update the version in `package.json`.
2. Commit the changes, and tag the commit, e.g. `git tag 1.2.1 <sha>`
3. Push the changes and the tag to GitHub, e.g. `git push --tags`
4. Create a new release on GitHub for that tag
5. Github Actions will build and publish the extension to [Open VSX](https://open-vsx.org/extension/unison-lang/unison) and the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=unison-lang.unison).

