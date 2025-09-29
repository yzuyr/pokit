<script lang="ts">
  let {
    transposition,
    setTransposition,
  }: { transposition: number; setTransposition: (value: number) => void } =
    $props();
</script>

<div class="join my-[23px]">
  <button
    class="btn btn-square"
    onclick={() => setTransposition(transposition - 12)}>-12</button
  >
  <button
    class="btn btn-square"
    onclick={() => setTransposition(transposition - 1)}>-1</button
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
    onclick={() => setTransposition(transposition + 1)}>+1</button
  >
  <button
    class="btn btn-square"
    onclick={() => setTransposition(transposition + 12)}>+12</button
  >
</div>
