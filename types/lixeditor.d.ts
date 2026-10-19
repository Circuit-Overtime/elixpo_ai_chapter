// @elixpo/lixeditor ships its own TypeScript types as of 2.7.0, so the editor's
// API is no longer declared here. We keep only the ambient CSS-module
// declarations for the side-effect style imports — the package's exports map
// has no TS "types" condition for the ./styles subpath, and the BlockNote CSS
// entrypoints ship none either.
declare module "@elixpo/lixeditor/styles";
declare module "@blocknote/core/fonts/inter.css";
declare module "@blocknote/mantine/style.css";
