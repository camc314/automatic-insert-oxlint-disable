# automatic-insert-oxlint-disable

A CLI tool that automatically inserts `oxlint-disable-next-line` comments for a specified rule across your codebase.

## Description

This tool runs [oxlint](https://oxc.rs/docs/guide/usage/linter.html) to find all violations of a specified rule, then automatically inserts disable comments above each violation. It intelligently handles existing disable directives by appending to them rather than creating duplicates.

## Installation

```bash
pnpm install
```

## Usage

```bash
npx tsx src/index.ts --rule <plugin/rule-name> [-- <oxlint args>]
```

### Options

| Option      | Short | Description                                                 |
| ----------- | ----- | ----------------------------------------------------------- |
| `--rule`    | `-r`  | The rule to disable in `plugin/rule-name` format (required) |
| `--dry-run` | `-d`  | Preview changes without modifying files                     |

### Examples

Disable all `no-unused-vars` violations from the eslint plugin:

```bash
node src/index.ts --rule eslint/no-unused-vars
```

Preview changes without modifying files:

```bash
node src/index.ts --rule eslint/no-unused-vars --dry-run
```

Run on a specific directory:

```bash
node src/index.ts --rule eslint/no-unused-vars -- src/
```

## Requirements

-   Node.js >24
-   An `.oxlintrc.json` configuration file in your project root
-   oxlint installed in your project (`./node_modules/.bin/oxlint`)

## How It Works

1. Runs oxlint with the specified rule enabled (all other rules disabled)
2. Parses the JSON output to find all violations
3. Groups violations by file
4. For each violation:
    - If the previous line already has an `oxlint-disable-next-line` comment, appends the new rule to it
    - Otherwise, inserts a new `oxlint-disable-next-line` comment above the violation
5. Writes the modified files (unless `--dry-run` is specified)
