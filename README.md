# Head to Head

Phone vs phone games. One phone starts a game and shows a QR code, everyone else scans it, and you all play the same game on your own phones.

**Play:** https://jimmywilson1979-arch.github.io/head-to-head/

## Games
- **Noughts & Crosses**
- **Connect 4**
- **Dots & Boxes** – 4×4 boxes. Finish a box and you go again.
- **Battleships** – 8×8, ships of 4, 3, 3, 2, 2. Shuffle your fleet until you're happy, press Ready, then take turns firing. Your ships stay on your phone; the other player never sees them.
- **Rock Paper Scissors** – both pick at the same time, first to 3. Picks are hidden until both are in.
- **Card Clash** (Top Trumps style) – the deck is split between you. Whoever's turn it is picks a stat on their top card; higher wins both cards. A draw puts both cards in the middle for the next winner. Win every card, or have the most after 30 rounds. Themes: **Animals** (32 cards), **Dinosaurs** (24), **Space** (24), **Countries** (30, including Wales, England and Scotland), **Sea life** (24) and **Christmas** (26, just for fun). Every card has its own storybook picture (made in Gemini, in `img/cards/`), and Countries uses real flags. More themes plug into `DECKS` in `games.js`.

## How to play a friend
1. Open the link, type your name, pick a game and press **Play a friend**.
2. Your friend scans the QR code (or types the 4-letter code, or you send them the invite link on WhatsApp – it works from anywhere, not just the same room).
3. Press **Start the game**. Your phone and theirs show the same board; take turns.
4. Press **Play again** for a rematch. Who goes first swaps each game, and the score is kept.

## Changing games
- **Host:** tap **🎮 Games** (tap twice if a game is going) or **Choose another game** at the end. Everyone goes back to the game menu together and stays connected – pick a new game and press Start.
- **Everyone else:** tap **🎮 Games** or **Suggest another game** and pick one. The host gets a "Kelly wants to play…" banner with a **Play it** button.

## If a phone goes to sleep
Each phone checks the link every few seconds and reconnects by itself if it has gone quiet, and again straight away when you come back to the app. There's also a **Tap to reconnect** button on the warning bar.

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

- **Who Is It?** (Guess Who style) – 24 original cartoon people. Each player picks a secret person, then you take turns asking yes/no questions; the app answers and flips down everyone who doesn't match. Tap "I know who it is!" to guess – a wrong guess ends your go.
  - The 24 faces are painted portraits (`img/faces/`, also in the art library under `who-is-it/`). Each person's answers in `games.js` match their portrait exactly, so if a face is ever replaced, check its answers too. "Rosy cheeks?" became "Short hair?" because nearly every portrait has some pink in its cheeks.
- **Hangman** – one hidden word for both players, with its category shown. Take turns picking letters; find the last letter or tap **I know the word!** and fill it in to win the word. First to 3 words wins (or most words after 12). Standard: 8 wrong guesses, then nobody gets that word. **Kids:** short picture words, 10 balloons that pop instead of a gallows, a picture hint after 3 wrong letters, and a wrong "I know the word" costs nothing.
- **Word Search** – one grid, a race: tap the first letter then the last (or drag across) and the first to spot a word gets it, marked in their colour. Standard: 10 × 10, 8 words from a category, any direction including backwards. **Kids:** 8 × 8, 6 picture words, only across and down.
- **Crossword** – a fresh mini crossword every game. Take turns: pick a clue (or tap a square), type the answer on the letter keys, and get a point if it's right. Letters you fill in help both of you. If you both pass in a row, the game gives you a free letter. Most words answered wins. **Kids:** picture clues, smaller grid, and the first letter of every word is filled in.
- The **Standard / Kids** switch appears under the game picker (and in the lobby, and after a game against the computer) whenever one of the word games is picked.
- **Mini Golf** – 6 holes (par 18) with walls, blocks, sand and water. Drag back anywhere on the course like a catapult to set the direction and power. The aim stays when you let go, so you can drag again to fine-tune it (or press Reset), then press **⛳ Hit**. Dragging off the edge of the course is fine. Take turns; both balls are on the course. Water = back where you were plus a penalty stroke; 6 shots max per hole. Lowest total wins. Every phone runs exactly the same physics, so shots play out identically everywhere.
- **Air Hockey** – real-time, first to 7. Two ways to play: **📱📱 Phones end to end** (each phone shows its own half – put the phones top to top and the puck slides from one screen to the other) or **🖥️ Whole table** (each phone shows the full table, your goal at the bottom – use this when you're not side by side). Drag anywhere on your half to move your paddle.

## Coming next
- More **Card Clash** themes (see ideas list)
- **Who Is It? family edition** – your own family photos instead of cartoon faces

## How it works
- The host phone holds the real game and sends the board to everyone; other phones send their moves to it.
- Air hockey: the host phone runs the physics 120 times a second. The two phones try to link **directly** over Wi-Fi (WebRTC, shown as ⚡ Direct) for the lowest delay; if that isn't possible they fall back to the online connection (☁️ Online), which is slower and uses more of the free Supabase message allowance.
- Flag images: [flag-icons](https://github.com/lipis/flag-icons) (MIT licence, see `img/flags/LICENSE-flag-icons`).
- Hidden things (Battleships fleets, Rock Paper Scissors picks) are never sent out – only the board everyone is allowed to see.
- Uses the same live connection (Supabase Realtime broadcast) as Buzz In. Nothing is stored on a server.
- `games.js` holds the rules and computer players for each game, so new games plug in there.

## 📱 Getting back in
During a game, the host can tap **📱 Join QR** in the top bar to show the QR code and the room code. If someone drops out, they join again with the **same name** and get their old place back, with their wins, seat and turn. A new phone only takes over a name if that player has been offline for 15 seconds or more.
