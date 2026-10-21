# @shanepadgett/liminal-settings

Settings from `settings.json` in the global and project folders. Project values win; objects merge key by key. Files may hold comments and trailing commas.

- `Setting.make(key, schema)`: a plugin's top-level key. The schema is an object schema; a missing key reads as `{}`.
- `Settings.get(setting)`: reads the files on each call; fails with `SettingsInvalid`.
- `Settings.write(scope, path, value)`: sets a value in the `"global"` or `"project"` file, keeping comments; `undefined` removes it.
- `DeclaredSettings`: every plugin's setting, for the settings screen.

Requires `Directories`, `FileSystem` and `Path`.
