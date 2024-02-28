# Unison for Visual Studio Code

Official editor support for the [Unison language](https://unison-lang.org/).

Provides syntax highlighting and Language Server support.

## Features

Learn about features [here](https://github.com/unisonweb/unison/blob/trunk/docs/language-server.markdown).

## Requirements

This plugin requires the [**UCM** (Unison Codebase Manager)](https://github.com/unisonweb/unison).

## Installing

Install from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=unison-lang.unison)

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

## Deploying

Follow [this guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) to get your account set up, contact @ChrisPenner to get access to the `unison-lang` [publisher](https://dev.azure.com/unison-lang).

Then:

```sh
$ vsce login unison-lang
$ npm run publish
```
