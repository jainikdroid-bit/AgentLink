# Motion clips (cheri-anim.json)

Source: Quaternius, "Universal Animation Library [Standard]" (UAL1_Standard.glb, no root motion)
https://quaternius.itch.io/universal-animation-library (pack page: https://quaternius.com/packs/universalanimationlibrary.html)

License: CC0 1.0 Universal (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/
Free for personal, educational and commercial use; no attribution required (credit given here anyway).

Used clips: Idle_Loop, Walk_Loop, Crouch_Idle_Loop, and Jump_Start + Jump_Loop + Jump_Land joined into one jump.
Only the rotations of hips, spine, chest, upper chest, legs, feet and toes plus the hip height are kept;
`extract-anim.mjs` rebuilds the file from the original .glb. The retargeting to the VRM happens in scene.ts.
