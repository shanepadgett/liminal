# attention

Plays a sound when the on-screen session needs the user: its turn ends or it asks for approval.

Status: built

## Provides

- None

## Requires

- `Approval`

## Adds

- TUI: a composer line part at order 60 that plays `assets/notification.wav`

## Requirements

- A sound plays when the on-screen session's turn ends, unless the turn was cancelled
- A sound plays when a new approval ask appears for the on-screen session
- A question form ends the turn, so the turn end sound covers it
- Other sessions make no sound
- The system player plays the file: `afplay` on macOS, `paplay`, `pw-play` or `aplay` on Linux
- No player found means no sound

## References

- Tau `src/tui/Notifications.ts`, `src/tui/internal/notification-sound.ts`, `src/tui/internal/turn-attention.ts`
