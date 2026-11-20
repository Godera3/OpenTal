# Chess.com policy and data sources

Verified 2026-11-20 against the live sites.

## Fair Play

Primary policy: https://www.chess.com/legal/fair-play (updated 2026-03-25).

- "All of your moves must be your own."
- "Do not use chess engines, software of any kind, bots, plugins, browser
  extensions, or any tools that analyze positions during play. We can detect
  if you are using any of these programs."
- "Do not perform any automated analysis or 'blunder checking' of your games
  in progress."
- Explicit carve-out: "This Fair Play Policy applies to your use of our
  Services; however, it does not apply to your games that are not against
  other users, such as in the game mode versus Chess.com computer (i.e.,
  non-human, virtual) 'bots'."

Help centre: https://support.chess.com/en/articles/8583921-what-counts-as-cheating-on-chess-com

- "Computer games and unrated puzzles — Unrated puzzles and games against
  computer personalities are the only exceptions to the rules above. Since
  these games and puzzles are not rated or against a real person, you are
  free to experiment with any tools and learn however you choose!"

Also corroborated at
https://support.chess.com/en/articles/8568369-what-do-i-need-to-know-about-fair-play-on-chess-com:
"These rules do not apply to games played against the computer or 'Bots.'"

**Consequence:** this extension is for bot games and unrated puzzles only.
Do not use it in a live or rated game against a human. Enforcement can
include public account closure and lifetime bans.

## PubAPI for later training

There is no dedicated bot endpoint. `GET https://api.chess.com/pub/bots` and
`/pub/bot/{username}/games` return 404; the official endpoint list has no
Bots section (https://www.chess.com/news/view/published-data-api).

Bots are ordinary player accounts in the normal endpoints:

- Profile: `https://api.chess.com/pub/player/santabot` — no `is_bot` field
- Archives: `https://api.chess.com/pub/player/santabot/games/archives`
- Monthly games: `https://api.chess.com/pub/player/santabot/games/2021/04`
- PGN: `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}/pgn`

Bot games are identified by matching the opponent `@id`/username in a human
player's archives against a known bot-name list. Games against bots are
auto-saved when the minimum ply count is met (bots 4 ply, coach 2 ply):
https://support.chess.com/en/articles/8609271-can-i-save-my-games-against-the-bots

PubAPI is read-only, cached for 12–24 hours, and serial requests are fine;
parallel bursts may get 429. No credentials are needed.
