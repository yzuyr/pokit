<script lang="ts">
  import { onMount, tick } from "svelte";
  import colors from "tailwindcss/colors";
  import { watch } from "runed";
  import * as Tone from "tone";
  import { match, P } from "ts-pattern";
  import { clsx } from "clsx";
  import { SvgKnob } from "svelte-knobs";
  import { SvelteSet } from "svelte/reactivity";
  import { EnumParam, LinearParam } from "svelte-knobs/params";
  import nipplejs from "nipplejs";
  import { Chord } from "tonal";
  import TranspositionInput from "./components/transposition-input.svelte";
  import { GithubIcon } from "lucide-svelte";

  const clamp = (val: number, min = 1, max = 10) =>
    Math.min(Math.max(val, min), max);
  type KeyboardKeys = "h" | "u" | "j" | "i" | "k" | "o" | "l";

  const chords = {
    h: {
      frequencies: ["C3", "E3", "G3"],
      class: "col-span-2 row-span-3 col-start-1 row-start-2",
    },
    u: {
      frequencies: ["D3", "F3", "A3"],
      class: "col-span-3 col-start-1 row-start-1",
    },
    j: {
      frequencies: ["E3", "G3", "B3"],
      class: "col-span-2 row-span-3 col-start-3 row-start-2",
    },
    i: {
      frequencies: ["F3", "A3", "C4"],
      class: "col-span-2 col-start-4 row-start-1",
    },
    k: {
      frequencies: ["G3", "B3", "D4"],
      class: "col-span-2 row-span-3 col-start-5 row-start-2",
    },
    o: {
      frequencies: ["A3", "C4", "E4"],
      class: "col-span-3 col-start-6 row-start-1",
    },
    l: {
      frequencies: ["B3", "D4", "F4"],
      class: "col-span-2 row-span-3 col-start-7 row-start-2",
    },
  };

  const waveformEnum = new EnumParam([
    "sawtooth",
    "sine",
    "square",
    "triangle",
  ] as const);

  let nippleElement = $state<HTMLElement>();
  let joystickManager = $state<nipplejs.JoystickManager>();
  let synth = $state<Tone.PolySynth>();
  let lastKeyClicked = $state<KeyboardKeys>();
  let pressedKeys = $state<SvelteSet<string>>(new SvelteSet());
  let modifierKeys = $state<SvelteSet<string>>(new SvelteSet());
  let previousTransposition = $state<number>(0);
  let joystickActive = $state<boolean>(false);
  // Knobs
  let waveformValue = $state<number>(0);
  const waveform = $derived(waveformEnum.denormalize(waveformValue));
  let transposition = $state<number>(0);
  let attack = $state(0.01);
  let decay = $state(0.3);
  let sustain = $state(0.8);
  let release = $state(0.5);

  // Circular transposition mapping based on joystick angle
  // nipple.js uses 0° as right, 90° as up, 180° as left, 270° as down
  const transpositionMap = {
    90: { name: "maj/min", semitones: 0 }, // Top (90°)
    45: { name: "7", semitones: 2 }, // Top-right (45°)
    0: { name: "maj/min7", semitones: 4 }, // Right (0°)
    315: { name: "maj/min9", semitones: 7 }, // Bottom-right (315°)
    270: { name: "sus4", semitones: 5 }, // Bottom (270°)
    225: { name: "sus2/maj6", semitones: -3 }, // Bottom-left (225°)
    180: { name: "dim", semitones: -6 }, // Left (180°)
    135: { name: "aug", semitones: 3 }, // Top-left (135°)
  };

  function transposeNote(note: string, semitones: number): string {
    if (semitones === 0) return note;
    return Tone.Frequency(note).transpose(semitones).toNote();
  }

  function getTransposedFrequencies(key: KeyboardKeys): string[] {
    return chords[key].frequencies.map((note) =>
      transposeNote(note, transposition),
    );
  }

  function getChordName(key: KeyboardKeys): string {
    const frequencies =
      transposition === 0
        ? chords[key].frequencies
        : getTransposedFrequencies(key);
    const chord = Chord.detect(frequencies);

    if (chord.length > 0) {
      // Return the first (most likely) chord detection
      return chord[0];
    }

    // Fallback: detect original chord and show transposition
    const originalChord = Chord.detect(chords[key].frequencies);
    const originalName =
      originalChord.length > 0 ? originalChord[0] : "Unknown";

    if (transposition === 0) {
      return originalName;
    }

    const direction = transposition > 0 ? "+" : "";
    return `${originalName} ${direction}${transposition}`;
  }

  function setTransposition(value: number) {
    transposition = clamp(value, -24, 24);
  }

  function getTranspositionFromAngle(angle: number): number {
    // Normalize angle to 0-360 range
    const normalizedAngle = ((angle % 360) + 360) % 360;

    // Find closest mapped angle
    let closestAngle = 0;
    let minDifference = 360;

    Object.keys(transpositionMap).forEach((key) => {
      const mapAngle = Number.parseInt(key);
      const difference = Math.min(
        Math.abs(normalizedAngle - mapAngle),
        Math.abs(normalizedAngle - mapAngle + 360),
        Math.abs(normalizedAngle - mapAngle - 360),
      );

      if (difference < minDifference) {
        minDifference = difference;
        closestAngle = mapAngle;
      }
    });

    return transpositionMap[closestAngle as keyof typeof transpositionMap]
      .semitones;
  }

  function handleJoystickMove(evt: any) {
    console.log("Joystick move:", evt); // Debug log
    if (evt.angle && evt.distance > 5) {
      // Only respond to significant movement
      const degrees = evt.angle.degree; // Use the raw angle from nipple.js
      const newTransposition = getTranspositionFromAngle(degrees);

      // Apply distance-based scaling (closer to center = less transposition)
      const maxDistance = 75; // Adjust based on joystick size
      const distanceFactor = Math.min(evt.distance / maxDistance, 1);
      const scaledTransposition = Math.round(newTransposition * distanceFactor);

      console.log("Setting transposition:", scaledTransposition); // Debug log
      setTransposition(scaledTransposition);
      joystickActive = true;
    }
  }

  function handleJoystickEnd() {
    joystickActive = false;
    setTransposition(0);
  }

  function updateWASDTransposition() {
    const w = modifierKeys.has("w");
    const a = modifierKeys.has("a");
    const s = modifierKeys.has("s");
    const d = modifierKeys.has("d");

    // Map WASD combinations to nipple.js angles
    let angle = null;
    if (w && d)
      angle = 45; // Top-right
    else if (s && d)
      angle = 315; // Bottom-right
    else if (s && a)
      angle = 225; // Bottom-left
    else if (w && a)
      angle = 135; // Top-left
    else if (w)
      angle = 90; // Top
    else if (d)
      angle = 0; // Right
    else if (s)
      angle = 270; // Bottom
    else if (a) angle = 180; // Left

    if (angle !== null) {
      const newTransposition = getTranspositionFromAngle(angle);
      return setTransposition(newTransposition);
    }
    // Reset transposition when no WASD keys are pressed
    return setTransposition(0);
  }

  // Handle real-time transposition changes for currently playing notes
  $effect(() => {
    if (
      transposition !== previousTransposition &&
      lastKeyClicked &&
      pressedKeys.has(lastKeyClicked) &&
      synth
    ) {
      // Only update if we're currently playing a chord and synth is ready
      const oldFreqs = chords[lastKeyClicked].frequencies.map((note) =>
        transposeNote(note, previousTransposition),
      );

      // Wait for all pending state changes to complete
      tick().then(() => {
        synth?.triggerRelease(oldFreqs);
        if (!lastKeyClicked) return;
        synth?.triggerAttack(getTransposedFrequencies(lastKeyClicked));
      });
    }
    previousTransposition = transposition;
  });

  // Handle WASD transposition changes - only when WASD keys change
  watch(
    () => modifierKeys.values(),
    () => {
      updateWASDTransposition();
    },
  );

  // Handle ADSR changes in real-time
  $effect(() => {
    if (synth) {
      // Store current state before making changes
      const wasPlaying = lastKeyClicked && pressedKeys.has(lastKeyClicked);
      const currentKey = lastKeyClicked;

      // Update synth settings
      synth.set({
        oscillator: {
          type: waveform,
        },
        envelope: {
          attack,
          decay,
          sustain,
          release,
        },
      });

      // Only release all and clear state if we're not currently playing
      if (!wasPlaying) {
        synth.releaseAll();
        pressedKeys.clear();
        lastKeyClicked = undefined;
      }
      if (currentKey) {
        // If we were playing, restart the current chord with new settings
        tick().then(() => {
          synth?.triggerRelease(getTransposedFrequencies(currentKey));
          synth?.triggerAttack(getTransposedFrequencies(currentKey));
        });
      }
    }
  });

  function onKeyDown(eventKey: string) {
    return match(eventKey)
      .with(P.union("h", "u", "j", "i", "k", "o", "l"), (key) => {
        // Only trigger if this key isn't already being pressed (prevents key repeat)
        if (!pressedKeys.has(key) && synth) {
          pressedKeys.add(key);

          // Release previous chord if playing
          if (lastKeyClicked && pressedKeys.has(lastKeyClicked)) {
            synth.triggerRelease(getTransposedFrequencies(lastKeyClicked));
            pressedKeys.delete(lastKeyClicked);
          }

          // Trigger new chord
          synth.triggerAttack(getTransposedFrequencies(key));
          lastKeyClicked = key;
        }
      })
      .with(P.union("w", "a", "s", "d"), (key) => {
        if (!modifierKeys.has(key)) {
          modifierKeys.add(key);
        }
      })
      .run();
  }

  function onKeyUp(eventKey: string) {
    return match(eventKey)
      .with(P.union("h", "u", "j", "i", "k", "o", "l"), (key) => {
        if (pressedKeys.has(key) && synth) {
          pressedKeys.delete(key);
          synth.triggerRelease(getTransposedFrequencies(key));
          if (lastKeyClicked === key) {
            lastKeyClicked = undefined;
          }
        }
      })
      .with(P.union("w", "a", "s", "d"), (key) => {
        modifierKeys.delete(key);
      })
      .run();
  }

  onMount(() => {
    synth = new Tone.PolySynth({
      voice: Tone.Synth,
      options: {
        oscillator: {
          type: waveform,
        },
        envelope: {
          attack,
          decay,
          sustain,
          release,
        },
        volume: -20,
      },
    }).toDestination();
    if (nippleElement) {
      joystickManager = nipplejs.create({
        zone: nippleElement,
        mode: "static",
        position: { left: "50%", top: "50%" },
        dynamicPage: true,
        size: 160,
        color: colors.orange[500],
        fadeTime: 250,
      });

      // Add joystick event listeners with proper context binding
      joystickManager.on("move", (_evt, data) => handleJoystickMove(data));
      joystickManager.on("end", () => handleJoystickEnd());
    }
  });
</script>

<svelte:window
  on:keydown|preventDefault={(event) => onKeyDown(event.key)}
  on:keyup|preventDefault={(event) => onKeyUp(event.key)}
/>

<main class="h-screen w-full flex">
  <aside class="flex flex-col items-center justify-between p-4 pr-0">
    <div class="flex flex-col w-full">
      <div class="text-xl font-semibold w-full">Pokit</div>
      <div class="flex gap-2 items-center w-full">
        <a
          href="https://github.com/yzuyr/pokit"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-square"
        >
          <GithubIcon size={16} />
        </a>
      </div>
    </div>
    <div class="grid grid-cols-2 w-full">
      <label class="label flex-col text-xs font-semibold" for="attack">
        <SvgKnob id="attack" bind:value={attack} />
        <span class="uppercase">Attack</span>
      </label>
      <label class="label flex-col text-xs font-semibold" for="decay">
        <SvgKnob id="decay" bind:value={decay} />
        <span class="uppercase">Decay</span>
      </label>
      <label class="label flex-col text-xs font-semibold" for="sustain">
        <SvgKnob id="sustain" bind:value={sustain} />
        <span class="uppercase">Sustain</span>
      </label>
      <label class="label flex-col text-xs font-semibold" for="release">
        <SvgKnob id="release" bind:value={release} />
        <span class="uppercase">Release</span>
      </label>
      <label class="label flex-col text-xs font-semibold" for="waveform">
        <SvgKnob
          id="waveform"
          bind:value={waveformValue}
          snapPoints={[0.33, 0.66]}
        />
        <span class="uppercase">{waveform}</span>
      </label>
    </div>
    <div
      class="relative flex flex-col items-center justify-center w-full gap-2"
    >
      <label for="transposition" class="label text-xs font-semibold uppercase">
        Transpose
      </label>
      <div class="relative w-40 h-40">
        <div bind:this={nippleElement}></div>
      </div>
      <TranspositionInput {transposition} {setTransposition} />
    </div>
  </aside>
  <div class="flex-1 grid grid-cols-8 grid-rows-4 gap-4 p-4">
    {#each Object.entries(chords) as [key, chord]}
      <button
        class={clsx(
          "btn h-full focus:outline-none relative font-semibold",
          chord.class,
          pressedKeys.has(key as KeyboardKeys) && "btn-primary",
        )}
        onmousedown={() => {
          if (!pressedKeys.has(key as KeyboardKeys)) {
            onKeyDown(key);
          }
        }}
        ontouchstart={() => {
          if (!pressedKeys.has(key as KeyboardKeys)) {
            onKeyDown(key);
          }
        }}
        ontouchmove={() => {
          if (pressedKeys.has(key as KeyboardKeys)) {
            onKeyDown(key);
          }
        }}
        ontouchend={() => {
          if (pressedKeys.has(key as KeyboardKeys)) {
            onKeyUp(key);
          }
        }}
        onmouseup={() => {
          if (pressedKeys.has(key as KeyboardKeys)) {
            onKeyUp(key);
          }
        }}
        onmouseleave={() => {
          if (pressedKeys.has(key as KeyboardKeys)) {
            onKeyUp(key);
          }
        }}
        oncontextmenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div class="text-xl">{getChordName(key as KeyboardKeys)}</div>
        <div class="absolute bottom-4 right-4 text-3xl">
          {key}
        </div>
      </button>
    {/each}
  </div>
</main>
