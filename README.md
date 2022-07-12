# Unison for Visual Studio Code

## Features

Please see [this page](https://github.com/unisonweb/unison/blob/trunk/docs/language-server.markdown) for a description of supported features.

## Requirements

This plugin requires the [**UCM** (Unison Codebase Manager)](https://github.com/unisonweb/unison).

Ensure an instance of the UCM is running before starting your editor.


## Installing

This extension is currently under development, to install a development build, follow these steps:

* Download the latest `unison-x.y.z.vsix` from the [Releases tab](https://github.com/unisonweb/vscode-unison/releases)
* Install it into your VS Code from a shell using `code --install-extension unison-x.y.z.vsix`

## Extension Settings

```
{
  // The port where UCM is serving the language server
  "unison.lspPort" = 5757
}
```

## Release Notes

See the [CHANGELOG](./CHANGELOG.md) for updates.

## Development

* Clone the project
* Symlink the project into your `~/.vscode/extensions` folder, e.g. `ln -s ~/Projects/vscode-unison ~/.vscode/extension/unison-dev`
* `npm run watch`
* Restart Visual Studio Code

Or optionally, using the VS code extension host:

* `git clone https://github.com/unisonweb/vscode-unison`
* `cd vscode-unison`
* `code .`
* Press F5 to load the extension host.

