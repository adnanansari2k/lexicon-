<script setup>
import { ref, onMounted } from 'vue'
import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore'
import { db } from './firebase'

// Import Components
import WordLibrary from './components/WordLibrary.vue'
import FlashCardGame from './components/FlashCardGame.vue'
import JsonUploader from './components/JsonUploader.vue'
import DiscoveryPage from './components/DiscoveryPage.vue'
import BooksPage from './components/BooksPage.vue'
import BottomNav from './components/BottomNav.vue'

// --- STATE ---
const currentTab = ref('library')
const words = ref([])
const discoveryItems = ref([]) 
const books = ref([]) 
const loading = ref(false)

// --- DATA FETCHING ---
const fetchData = async () => {
  loading.value = true
  try {
    const now = Date.now()

    // 1. Fetch Words
    const dueQuery = query(collection(db, 'words'), where('nextReview', '<=', now), limit(30))
    const dueSnapshot = await getDocs(dueQuery)
    const dueWords = dueSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const recentQuery = query(collection(db, 'words'), orderBy('dateAdded', 'desc'), limit(50))
    const recentSnapshot = await getDocs(recentQuery)
    const recentWords = recentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const combinedWords = [...dueWords, ...recentWords]
    const uniqueWordsMap = new Map()
    combinedWords.forEach(w => uniqueWordsMap.set(w.id, w))
    words.value = Array.from(uniqueWordsMap.values())

    // 2. Fetch Discovery Content
    const discoveryQuery = query(collection(db, 'discovery'), limit(20))
    const discoverySnapshot = await getDocs(discoveryQuery)
    discoveryItems.value = discoverySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    // 3. Fetch Books/Quotes
    const booksQuery = query(collection(db, 'books'), orderBy('dateAdded', 'desc'))
    const booksSnapshot = await getDocs(booksQuery)
    books.value = booksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

  } catch (e) {
    console.error("Firebase Error:", e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="app-shell">
    <div class="content-area">
      
      <WordLibrary 
        v-if="currentTab === 'library'" 
        :words="words" 
        :loading="loading" 
        @refresh="fetchData"
      />

      <FlashCardGame 
        v-if="currentTab === 'play'" 
        :words="words" 
        @refresh="fetchData" 
        @update:currentTab="currentTab = $event" 
      />

      <DiscoveryPage 
        v-if="currentTab === 'discovery'" 
        :discoveryItems="discoveryItems" 
        :loading="loading" 
        :words="words" 
        @refresh="fetchData" 
      />

      <BooksPage 
        v-if="currentTab === 'books'" 
        :books="books" 
        :loading="loading" 
        @refresh="fetchData" 
      />

      <JsonUploader 
        v-if="currentTab === 'upload'" 
        @refresh="fetchData" 
      />
      
    </div>

    <BottomNav 
      :currentTab="currentTab" 
      @update:currentTab="currentTab = $event" 
    />
  </div>
</template>

<style>
/* Global App Styles */
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', 'Segoe UI', sans-serif; background: #f1f5f9; }

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 600px;
  margin: 0 auto;
  background: #f8fafc;
  box-shadow: 0 0 30px rgba(0,0,0,0.1);
  position: relative;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 90px;
  scrollbar-width: none;
}
.content-area::-webkit-scrollbar { display: none; }
</style>
