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

## Picture packs
Use your own pictures in **Symbol Snap**, **Who Is It?** and **Card Clash**.
1. Pick one of those games, then tap **📥 Load a picture pack** and choose a pack file: the one from the Letter Quest picture page (e.g. `george-disney-pictures.json`) or one from Pack Builder.
2. **Symbol Snap** can use it straight away. Packs with fewer than 57 pictures (31 for Kids) are topped up with emoji.
3. For **Who Is It?** and **Card Clash**, tap **✨ Add details with Claude** once. Claude looks at each picture to note hats, hair and colours, and makes up five fun stats for the cards. It uses your Claude API key and is saved on the phone.
4. In Card Clash, pick 🖼️ the pack as the theme. In the other two, choose 🖼️ the pack under Picture pack.

**📤 Share this pack** sends the finished pack, with Claude's details included, to someone else (e.g. by WhatsApp). They load it the same way and don't need Claude or an API key.

Only the host needs the pack. The other phone gets the pictures automatically when the game starts, which takes a few seconds the first time.

## Play the computer
Pick **Easy**, **Medium** or **Hard** and press **Play the computer** – no second phone needed. Good for testing on your own.
For the race games (Flag Quiz, Symbol Snap, Spot the Difference, Word Search) the level sets how fast the computer is, and in Flag Quiz how often it knows the hard flags.
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

- **Flag Quiz** – a race: a flag shows on both phones with 4 countries to pick from (from the same part of the world, so it's not a giveaway). First right answer scores. Get it wrong and you're out for that flag, but the other player can still answer. After each flag you both see the answer and its capital. 10 flags, from easy (Wales, France) to hard (Bhutan, Malawi). **Kids:** 8 well-known flags with 3 big answer buttons. 175 flags in `img/flags/` (flag-icons, MIT licence); near-identical pairs like Chad and Romania never appear as options together.
- **Symbol Snap** (Dobble style) – there's a middle card and your own card. They always share exactly one picture: tap it first to win the middle card, which becomes your new card. A wrong tap freezes you for a second. First to 10 cards wins. **Kids:** 6 pictures a card instead of 8, first to 8. The deck is built the proper Dobble way (57 cards, or 31 for Kids), so every pair of cards shares exactly one picture.
- **Spot the Difference** – two pictures that are almost the same; race to tap the differences on either one. Each find is circled in your colour. Tap a wrong spot and you get a ✖ and a one-second freeze. 3 pictures a game, 7 differences each (Kids: 5 bigger, more obvious ones). Pictures are made fresh every game from 6 scenes (Garden, Under the sea, Space, Christmas Eve, Farm, Seaside): things go missing, change, flip round, grow or shrink, appear, and bits of the background change too. If you're both stuck, both tap **Skip this picture** (against the computer it skips straight away), and the ones nobody found are shown with dashed rings.
- The **Standard / Kids** switch appears for these three as well.

### Board and table games
- **Draughts** – English rules on an 8×8 board. Pieces move diagonally forward; jumping is compulsory and you must keep jumping if you can. Reach the far row to get a king (it can move backwards, and crowning ends your go). Win by taking every piece or leaving the other player with no move. 40 moves each with nothing taken is a draw. Tap a piece, then where it's going (for a double jump, tap each landing square). Also works on **one screen**.
- **Chess** – full rules: castling, en passant, promotion (you choose the piece), check, checkmate and stalemate, plus draws for 50 moves with no capture or pawn move, the same position three times, or not enough pieces left. Whoever starts the round plays White; each phone shows the board from its own side. Tap a piece to see where it can go. Captured pieces and the last few moves are shown, and there's a **🏳️ Give up** button. Also works on **one screen**.
- **Dominoes** – double-six set, 7 tiles each, the rest in the pile. Match a number at either end of the line; if a tile fits both ends, tap it and then the end you want. Can't go? Pick up from the pile until you can, and once the pile is empty you **knock**. First to play every tile wins; if nobody can go, the fewest spots left wins.
- **Colour Clash** (Uno style, our own name) – 108 cards in red, green, blue and yellow: numbers, ⊘ Skip, ⇄ Reverse, +2, ★ Wild and +4. Match the colour or the number/symbol. With two players Reverse works like Skip, so Skip, Reverse, +2 and +4 all mean you go again. Can't go? Pick up one card; play it if it fits, or keep it and pass. When the pile runs out the played cards are shuffled back in. First to play every card wins.
- Computer players for all four: Easy makes mistakes, Medium looks a few moves ahead, Hard looks deeper (chess thinks for up to about 2 seconds).
- Dominoes and Colour Clash: each phone only shows its own hand. The hands do travel to both phones with the game, so it relies on nobody digging into the page code.
- Roll On (3–4 players) versions of Dominoes and Colour Clash are planned.

## Coming next
- More **Card Clash** themes (see ideas list)
- **Who Is It? family edition** – your own family photos instead of cartoon faces

## How it works
- The host phone holds the real game and sends the board to everyone; other phones send their moves to it.
- Air hockey: the host phone runs the physics 120 times a second. The two phones try to link **directly** over Wi-Fi (WebRTC, shown as ⚡ Direct) for the lowest delay; if that isn't possible they fall back to the online connection (☁️ Online), which is slower and uses more of the free Supabase message allowance.
- Flag images: [flag-icons](https://github.com/lipis/flag-icons) (MIT licence, see `img/flags/LICENSE-flag-icons`).
- Hidden things (Battleships fleets, Rock Paper Scissors picks) are never sent out – only the board everyone is allowed to see. (Dominoes and Colour Clash hands are the exception, see above.)
- Uses the same live connection (Supabase Realtime broadcast) as Buzz In. Nothing is stored on a server.
- `games.js` holds the rules and computer players for each game, so new games plug in there. Draughts, Chess, Dominoes and Colour Clash are in `games2.js` (rules and computer) and `boards2.js` (their screens).

## 📱 Getting back in
During a game, the host can tap **📱 Join QR** in the top bar to show the QR code and the room code. If someone drops out, they join again with the **same name** and get their old place back, with their wins, seat and turn. A new phone only takes over a name if that player has been offline for 15 seconds or more.
