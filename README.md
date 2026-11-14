# Head to Head

Phone vs phone games. One phone starts a game and shows a QR code, everyone else scans it, and you all play the same game on your own phones.

**Play:** https://jimmywilson1979-arch.github.io/head-to-head/

## Games
- **Noughts & Crosses**
- **Connect 4**

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
Hard is unbeatable at Noughts & Crosses and very strong at Connect 4.

## Good to know
- Keep the host's phone on the game screen. If it locks, the game carries on when it's unlocked.
- If the host's page reloads, **Resume** on the home page brings the game back for everyone.
- Testing on one device: add `?local` to the link and open two tabs (no internet needed).

## How it works
- The host phone holds the real game and sends the board to everyone; other phones send their moves to it.
- Uses the same live connection (Supabase Realtime broadcast) as Buzz In. Nothing is stored on a server.
- `games.js` holds the rules and computer players for each game, so new games plug in there.
