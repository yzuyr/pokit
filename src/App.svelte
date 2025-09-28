<script lang="ts">
    import { onMount } from "svelte";
    import * as Tone from "tone";
    import { match, P } from "ts-pattern";
    import { clsx } from "clsx";
    import { SvgKnob } from "svelte-knobs";
    import { SvelteSet } from "svelte/reactivity";
    import { LinearParam } from "svelte-knobs/params";
    import nipplejs from "nipplejs";

    const clamp = (val: number, min = 1, max = 10) =>
        Math.min(Math.max(val, min), max);

    const WAVEFORM = {
        SINE: "sine",
        SAWTOOTH: "sawtooth",
        SQUARE: "square",
        TRIANGLE: "triangle",
    } as const;

    type Waveform = (typeof WAVEFORM)[keyof typeof WAVEFORM];
    type KeyboardKeys = "h" | "u" | "j" | "i" | "k" | "o" | "l";

    const chords = {
        h: {
            name: "Cmaj",
            frequencies: ["C3", "E3", "G3"],
            class: "col-span-2 row-span-3 col-start-1 row-start-2",
        },
        u: {
            name: "Dmin",
            frequencies: ["D3", "F3", "A3"],
            class: "col-span-3 col-start-1 row-start-1",
        },
        j: {
            name: "Emin",
            frequencies: ["E3", "G3", "B3"],
            class: "col-span-2 row-span-3 col-start-3 row-start-2",
        },
        i: {
            name: "Fmaj",
            frequencies: ["F3", "A3", "C4"],
            class: "col-span-2 col-start-4 row-start-1",
        },
        k: {
            name: "Gmaj",
            frequencies: ["G3", "B3", "D4"],
            class: "col-span-2 row-span-3 col-start-5 row-start-2",
        },
        o: {
            name: "Amin",
            frequencies: ["A3", "C4", "E4"],
            class: "col-span-3 col-start-6 row-start-1",
        },
        l: {
            name: "Bdim",
            frequencies: ["B3", "D4", "F4"],
            class: "col-span-2 row-span-3 col-start-7 row-start-2",
        },
    };

    let nippleElement = $state<HTMLElement>();
    let joystickManager = $state<nipplejs.JoystickManager>();
    let synth = $state<Tone.PolySynth>();
    let lastKeyClicked = $state<KeyboardKeys>();
    let pressedKeys = $state<SvelteSet<string>>(new SvelteSet());
    let transposition = $state<number>(0); // in semitones
    let previousTransposition = $state<number>(0);
    let waveform = $state<Waveform>(WAVEFORM.SAWTOOTH);
    let attack = $state(0.01);
    let decay = $state(0.3);
    let sustain = $state(0.8);
    let release = $state(0.5);

    function transposeNote(note: string, semitones: number): string {
        if (semitones === 0) return note;
        return Tone.Frequency(note).transpose(semitones).toNote();
    }

    function getTransposedFrequencies(key: KeyboardKeys): string[] {
        return chords[key].frequencies.map((note) =>
            transposeNote(note, transposition),
        );
    }

    function setTransposition(value: number) {
        transposition = clamp(value, -24, 24);
    }

    // Handle real-time transposition changes for currently playing notes
    $effect(() => {
        if (
            transposition !== previousTransposition &&
            lastKeyClicked &&
            pressedKeys.has(lastKeyClicked)
        ) {
            // Release the old transposed notes
            const oldFreqs = chords[lastKeyClicked].frequencies.map((note) =>
                transposeNote(note, previousTransposition),
            );
            synth?.triggerRelease(oldFreqs);

            // Trigger the new transposed notes
            synth?.triggerAttack(getTransposedFrequencies(lastKeyClicked));
        }
        previousTransposition = transposition;
    });

    // Handle ADSR changes in real-time
    $effect(() => {
        if (synth) {
            synth.set({
                envelope: {
                    attack,
                    decay,
                    sustain,
                    release,
                },
            });
        }
    });

    function updateWaveform() {
        if (synth) {
            // Stop all current notes to prevent distortion
            synth.releaseAll();
            synth.dispose();

            // Create new synth with selected waveform - no filter
            synth = new Tone.PolySynth({
                voice: Tone.Synth,
                options: {
                    oscillator: {
                        type: waveform as any,
                    },
                    envelope: {
                        attack,
                        decay,
                        sustain,
                        release,
                    },
                    volume: -16,
                },
            }).toDestination();

            // Clear pressed keys state since we stopped all notes
            pressedKeys.clear();
            lastKeyClicked = undefined;
        }
    }

    function onKeyDown(eventKey: string) {
        return match(eventKey)
            .with(P.union("h", "u", "j", "i", "k", "o", "l"), (key) => {
                // Only trigger if this key isn't already being pressed (prevents key repeat)
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);
                    if (lastKeyClicked) {
                        synth?.triggerRelease(
                            getTransposedFrequencies(lastKeyClicked),
                        );
                    }
                    synth?.triggerAttack(getTransposedFrequencies(key));
                    lastKeyClicked = key;
                }
            })
            .with(P.union("w", "a", "s", "d"), (key) => {
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);
                }
            })
            .run();
    }

    function onKeyUp(eventKey: string) {
        return match(eventKey)
            .with(P.union("h", "u", "j", "i", "k", "o", "l"), (key) => {
                pressedKeys.delete(key);
                synth?.triggerRelease(getTransposedFrequencies(key));
                if (lastKeyClicked === key) {
                    lastKeyClicked = undefined;
                }
            })
            .with(P.union("w", "a", "s", "d"), (key) => {
                pressedKeys.delete(key);
            })
            .run();
    }

    onMount(() => {
        synth = new Tone.PolySynth({
            voice: Tone.Synth,
            options: {
                oscillator: {
                    type: waveform as any,
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
        joystickManager = nipplejs.create({
            zone: nippleElement,
            mode: "static",
            dynamicPage: true,
        });
    });
</script>

<svelte:window
    on:keydown|preventDefault={(event) => onKeyDown(event.key)}
    on:keyup|preventDefault={(event) => onKeyUp(event.key)}
/>

<main class="h-screen w-full flex flex-col p-4">
    <header class="flex-1 grid grid-cols-4 items-stretch">
        <div>Pokit</div>
        <div class="flex flex-col gap-2">
            <label for="transposition" class="text-sm font-medium">
                Transpose (semitones)
            </label>
            <div class="join">
                <button
                    class="btn btn-square"
                    onclick={() => setTransposition(transposition - 12)}
                    >O-</button
                >
                <input
                    id="transposition"
                    type="number"
                    min="-24"
                    max="24"
                    step="1"
                    class="input"
                    bind:value={transposition}
                />
                <button
                    class="btn btn-square"
                    onclick={() => setTransposition(transposition + 12)}
                    >O+</button
                >
            </div>
        </div>
        <div class="flex flex-col gap-2">
            <label for="waveform" class="text-sm font-medium"> Waveform </label>
            <select
                id="waveform"
                class="select"
                bind:value={waveform}
                onchange={updateWaveform}
            >
                <option value="sine">Sine</option>
                <option value="sawtooth">Saw</option>
                <option value="square">Square</option>
                <option value="triangle">Triangle</option>
            </select>
        </div>
        <div class="grid grid-cols-4 grid-rows-2">
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
        </div>
    </header>
    <div class="flex flex-[5] gap-4">
        <aside class="flex-1 flex flex-col items-center justify-center">
            <div bind:this={nippleElement} class="flex-1"></div>
        </aside>
        <div class="flex-[5] grid grid-cols-8 grid-rows-4 gap-4">
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
                >
                    <div class="text-xl">{chord.name}</div>
                    <div class="absolute bottom-4 right-4 text-3xl">
                        {key}
                    </div>
                </button>
            {/each}
        </div>
    </div>
</main>
