# Head to Head

Phone vs phone games. One phone starts a game and shows a QR code, everyone else scans it, and you all play the same game on your own phones.

**Play:** https://jimmywilson1979-arch.github.io/head-to-head/

## Games
- **Noughts & Crosses**
- **Connect 4**
- **Dots & Boxes** – 4×4 boxes. Finish a box and you go again.
- **Battleships** – 8×8, ships of 4, 3, 3, 2, 2. Shuffle your fleet until you're happy, press Ready, then take turns firing. Your ships stay on your phone; the other player never sees them.
- **Rock Paper Scissors** – both pick at the same time, first to 3. Picks are hidden until both are in.

## How to play a friend
1. Open the link, type your name, pick a game and press **Play a friend**.
2. Your friend scans the QR code (or types the 4-letter code, or you send them the invite link on WhatsApp – it works from anywhere, not just the same room).
3. Press **Start the game**. Your phone and theirs show the same board; take turns.
4. Press **Play again** for a rematch. Who goes first swaps each game, and the score is kept.

## More than two players
Up to 8 phones can join. Two play at a time and the rest wait in line.
**Winner stays on:** the loser goes to the back of the line and the next person takes their place (on a draw, whoever went first steps off).
The host can switch games between rounds.

## Play the computer
Pick **Easy**, **Medium** or **Hard** and press **Play the computer** – no second phone needed. Good for testing on your own.
Hard is unbeatable at Noughts & Crosses, very strong at Connect 4 and Dots & Boxes, hunts ships properly at Battleships, and at Rock Paper Scissors it learns your habits.

## Good to know
- Keep the host's phone on the game screen. If it locks, the game carries on when it's unlocked.
- If the host's page reloads, **Resume** on the home page brings the game back for everyone.
- Testing on one device: add `?local` to the link and open two tabs (no internet needed).

## Coming next
- **Top Trumps** style – pick a stat, beat theirs (footballers, animals, family-photo edition)
- **Guess Who** style – ask yes/no questions to find their character (family-faces edition)
- **Mini golf** – take turns putting on your own phone, scores shared
- **Air hockey** – each phone is one end of the table

## How it works
- The host phone holds the real game and sends the board to everyone; other phones send their moves to it.
- Hidden things (Battleships fleets, Rock Paper Scissors picks) are never sent out – only the board everyone is allowed to see.
- Uses the same live connection (Supabase Realtime broadcast) as Buzz In. Nothing is stored on a server.
- `games.js` holds the rules and computer players for each game, so new games plug in there.
