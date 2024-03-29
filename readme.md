[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)

# myst-disclosure

> Myst IV: Revelation modding tool

## Usage

I'm _hoping_ to eventually build this project out into a full-blown Electron app with in-place editing of Revelation data files, savegames et al. For now though, this project is just a simple CLI unpack/repack tool that outputs human-editable JSON files (and can then use them as input for repacking). If you want to run it, follow the first three bullet points in the [Contributing](#contributing) section (using the 1st option for running the tool).

TODO: add CLI documentation; for now, use the `-h` flag to get usage info.

## Project status

`myst-disclosure` is currently UNSTABLE. What this means is that features and API's are work-in-progress: they might not work as intended yet, or are otherwise not yet set in stone. Everything will be STABLE once version v1 is released.

#### Currently available features

* Unpack/repack data containers
  * Subtitles, text labels, texture images and command blocks are converted to and from human-editable JSON
* Unpack savegames

## Contributing

* Clone the repo.
* Install dependencies with any node package manager (e.g. `npm install`, but may I suggest checking out [pnpm](https://pnpm.io/) to save yourselves some pain).
* Run the tool:
  * Run `npm run build` once to compile the TypeScript into JavaScript, then run `node dist/cli [arguments...]`, OR
  * Run `npm run dev -- [arguments...]`. This uses an experimental feature, so this might not work depending on what version of Node you're using; [read this](https://github.com/TypeStrong/ts-node/issues/1007) if you want to know more.
* Please take effort to follow the ESLint rules.
* If you use an editor like VSCode that uses a built-in TypeScript server for language features, make sure it uses TS >=4.3 or local TS module.

For development talk, we are based at the [Guild of Speedrunners Discord server](https://discord.gg/pQzhkaT); consider joining!
