# TUI design

How the TUI and the gallery look and move, and how the transcript shows a session.

## Look

- Charm's design sensibility is the model; own palettes, glyphs and ornament
- Content carries no chrome; borders and boxes only for dialogs, overlays and cards
- Hierarchy comes from four text brightness levels; color only where it carries meaning
- Focus changes weight, never shape; blurred states keep their shape and drop to muted
- Status and mode use chips: solid fill, one cell of padding each side
- Liminal has its own signature ornament, used consistently in titles and headers
- The ornament is the eighth-block fade `▏▎▍▌▋▊▉█` in the palette gradient
- Ornament placement is the edge: hairlines across the width that thicken into the fade, shared by headers and dialog titles
- A small set of single-cell glyphs; no Nerd Font icons
- Emoji only for file-tag kinds: 📄 file, 📁 folder, 📚 reference, 🌄 image
- Metadata lines join parts with a faint separator; key hints are a muted key and a fainter action
- Every component renders to a given width; truncate with `…`, lower-priority parts yield first, long output collapses and expands
- Background fills only to push secondary content back
- Spacing rhythm: two-cell margin and indent, chips `(0,1)`, cards `(1,2)`
- Palettes define the 16 ANSI colors used for terminal output

## Motion

- Motion has character and stays cheap
- Working motion is the glide; no sweep
- Only one place glides while working: the header or the composer's top edge
- Toasts show in the chat column's top right, under the header; every kind times out, errors included

## Gallery

- The gallery's Primitives group shows the shared pieces components are built from
- One component per concept; screens and samples are built only from gallery components, so a change shows everywhere it is used
- The transcript is the only conversation component; the chat screen and samples hold a moment of it

## Transcript

Brightness follows importance, and what is newest is brightest.

- A turn is a prompt and a reply
- The prompt is a raised band with an accent bar; a long prompt shows two lines ending in `…`, and a click opens and closes it
- Once a turn's prompt scrolls past the top, a copy stays pinned there until the next prompt pushes it out row for row; a pinned answers band folds to its title line until clicked open
- While working, the tip of the turn is one live line: a turning arc and the action in the present tense with a band of light across it; elapsed time after 3s
- Under the live line, what the action produces, gone when it ends: thinking as three fading italic lines, a command's newest two output lines, the diff an edit writes, checks ticking off
- Everything the assistant says is full-brightness Markdown, arriving a whole word at a time; all its work is gray rows between, on the same left edge, with a blank line between blocks
- Between two things the assistant said, work folds into one row per group: a mark, the verb in bold, what it worked on, detail in brackets (`◈ Explored kernel/test, 2 files, 1 search`, `◆ Ran checks (all passed)`)
- Reads and searches in a row join one group; so do edits in a row; `◈` marks a group of several actions, `◆` a single one
- A group still going on is the live line in the present tense, and settles into its row once the next thing starts
- A group opens on a click to one row per action; a thought opens to its text; past turns fold the same way
- Work dims once left behind: a stretch fades to dim over 600ms once the assistant next speaks, and all of it dims when the turn's work is over
- Only failures have color: `(failed)` or `(lint failed)` in the danger color; no green counts or check marks
- Thinking streams in with its newest characters warming up from the background; the rest of the word is laid out unseen, so words never jump lines
- The turn ends in one dim row, `◇ Worked for 34s`, then the answer with code in the accent
- A run that asks questions ends by drafting a form, shown only as the live line `Drafting questions`, then settles into `? <title>  4 questions for you`
- The form takes over the composer, keeping the model line and key hints: title, tabs (`1 ✓  2  3  4  context`), then the tab in view
- A select or yes/no tab lists options with `○`/`●` marks and aligned descriptions; a select ends in an `Other…` row that becomes a field; notes hang under options as `└ note`
- A written-answer tab and the optional context tab have a `›` field; the suggested answer and its reason close a question's tab
- Sending with a question open sends it as skipped, with no warning
- The answers are the next prompt, in the raised band: each question muted, `→ answer`, `as suggested` or `own answer` beside it, `suggested <answer>` under it when the user chose another, option notes as `└ note on <option>`, skipped as faint `→ skipped`, Additional context last
