<script setup>
defineProps({
  currentTab: {
    type: String,
    required: true,
    default: 'library'
  }
})
defineEmits(['update:currentTab'])
</script>

<template>
  <nav class="bottom-nav">
    <button class="nav-item" :class="{ active: currentTab === 'library' }" @click="$emit('update:currentTab', 'library')">
      <span class="icon">📖</span>
      <span class="label">Library</span>
    </button>
    
    <button class="nav-item" :class="{ active: currentTab === 'play' }" @click="$emit('update:currentTab', 'play')">
      <span class="icon">🎮</span>
      <span class="label">Play</span>
    </button>
    
    <button class="nav-item" :class="{ active: currentTab === 'discovery' }" @click="$emit('update:currentTab', 'discovery')">
      <span class="icon">🧭</span>
      <span class="label">Discover</span>
    </button>

    <button class="nav-item" :class="{ active: currentTab === 'books' }" @click="$emit('update:currentTab', 'books')">
      <span class="icon">🔖</span>
      <span class="label">Books</span>
    </button>
    
    <button class="nav-item" :class="{ active: currentTab === 'upload' }" @click="$emit('update:currentTab', 'upload')">
      <span class="icon">☁️</span>
      <span class="label">Upload</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 600px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: space-around;
  padding: 12px 8px 24px 8px;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -4px 20px rgba(15, 23, 42, 0.05);
  z-index: 1000;
}

.nav-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: transparent; border: none; color: #94a3b8; cursor: pointer;
  padding: 8px 12px; border-radius: 16px; transition: all 0.2s ease; width: 20%;
}

.nav-item .icon { font-size: 1.4rem; margin-bottom: 4px; filter: grayscale(100%); opacity: 0.6; transition: all 0.3s; }
.nav-item .label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; transition: color 0.3s; }

.nav-item.active { color: #0f172a; }
.nav-item.active .icon { filter: grayscale(0%); opacity: 1; transform: translateY(-2px); }
.nav-item.active .label { color: #0f172a; }

.nav-item:active { transform: scale(0.95); background: #f1f5f9; }
</style>
