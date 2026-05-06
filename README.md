# OpenTal 1.1 - Pure Mikhail Tal Edition

## Attribution

**This is NOT my original engine.** This project is based on:
- **Rodent** (by Pawel Koziol, 2011-2017)
- Originally derived from **Sungorus 1.4** (by Pablo Vazquez, 2009-2011)

I (the uploader) used the Rodent engine as a base and refined/tuned it to play in the style of Mikhail Tal ("The Wizard of Riga"). All credit for the original engine goes to Pawel Koziol and Pablo Vazquez.

## "You must take the sacrifice - it's not a gift!" - Mikhail Tal

OpenTal is a UCI-compatible chess engine that plays in the style of Mikhail Tal, the 8th World Chess Champion known as "The Wizard of Riga."

## Features

- **Pure Tal Style**: Sacrifices material for initiative, chaotic positions, relentless king attacks
- **Tal Opening Book**: Uses `ph-tal2.bin` (Tal's actual games)
- **Aggressive Evaluation**: Ignores material disadvantage when attacking
- **UCI Compatible**: Works with Arena Chess GUI, Cute Chess, etc.

## Arena Chess GUI Setup

1. **Download**: Get the `opental` executable (Linux) or compile it yourself
2. **Open Arena Chess GUI**
3. **Engine → Install New Engine**
4. **Browse** to `opental` executable
5. **Set Parameters** (optional):
   - `TalMode`: true (default) - Pure Tal style
   - `UseBook`: true (default) - Uses Tal's opening book
   - `Threads`: 1-8 (default 1)
   - `Hash`: 16-4096 MB (default 16)

## Compilation (Linux)

```bash
cd /path/to/OpenTal
make clean && make
```

The compiled engine will be `opental` in the project root.

## Playing Style

This engine embodies Mikhail Tal's famous style:

- **Sacrifice-happy**: Will gladly give up material for attacking chances
- **King hunter**: Pieces aggressively target the enemy king
- **Pawn storms**: Relentless pawn advances against enemy king
- **Forward pieces**: Knights, bishops, rooks push forward
- **Ignore safety**: Own king safety is secondary to attack
- **Chaos creator**: Creates messy, tactical positions!

## UCI Options

| Option | Default | Description |
|--------|---------|-------------|
| `TalMode` | true | Pure Mikhail Tal style (always ON in this edition) |
| `UseBook` | true | Use Tal's opening book (`ph-tal2.bin`) |
| `Hash` | 16 | Hash table size in MB |
| `Threads` | 1 | Number of search threads |
| `MainBookFile` | ph-tal2.bin | Opening book file |

## Example Games

The engine loves sacrificial attacks like:

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Bd7 13. Nf1 cxd4 14. cxd4 exd4 15. Nxd4 Nc6 16. Be3 Nxd4 17. Bxd4 d5!? 18. exd5 Nxd5 19. Bxh7+! Kxh7 20. Qh5+ Kg8 21. Bxg6 fxg6 22. Qxg6+ Kh8 23. Qh6+ Kg8 24. Qg6+ Kh8 25. Qh6+ = (Draw by repetition, but Tal would play for mate!)

## Building on Windows

```cmd
g++ -std=c++14 -O3 -DUSE_THREADS -o opental sources/src/*.cpp -lpthread
```

## License

GNU General Public License v3 - See LICENSE file for details.

Original Rodent engine: Copyright (C) 2011-2017 Pawel Koziol
Original Sungorus engine: Copyright (C) 2009-2011 Pablo Vazquez

"Pure Mikhail Tal" modifications: Refined by uploader (2026).

## Enjoy the chaos!

*"The move is there, whether you like it or not."* - Mikhail Tal
