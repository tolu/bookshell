<template>
  <aside class="alts">
    <div class="alts-label">{{ label }}</div>
    <slot />
  </aside>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), {
  label: 'Alternatives',
})
</script>
