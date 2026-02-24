<script setup>
import { ref } from 'vue'
import { collection, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  books:   { type: Array,   default: () => [] },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

const selectedBook     = ref(null)
const showAddBookModal = ref(false)

const newBookTitle  = ref('')
const newBookAuthor = ref('')
const isAddingBook  = ref(false)

const newQuoteText  = ref('')
const isAddingQuote = ref(false)

const addNewBook = async () => {
  if (!newBookTitle.value.trim()) return
  isAddingBook.value = true
  try {
    await addDoc(collection(db, 'books'), {
      title:     newBookTitle.value,
      author:    newBookAuthor.value || 'Unknown Author',
      quotes:    [],
      dateAdded: Date.now()
    })
    newBookTitle.value  = ''
    newBookAuthor.value = ''
    showAddBookModal.value = false
    emit('refresh')
  } catch (e) { console.error(e) }
  finally { isAddingBook.value = false }
}

const addNewQuote = async () => {
  if (!newQuoteText.value.trim() || !selectedBook.value) return
  isAddingQuote.value = true
  try {
    const quoteData = { text: newQuoteText.value, dateAdded: Date.now() }
    await updateDoc(doc(db, 'books', selectedBook.value.id), { quotes: arrayUnion(quoteData) })
    selectedBook.value.quotes.push(quoteData)
    newQuoteText.value = ''
    emit('refresh')
  } catch (e) { console.error(e) }
  finally { isAddingQuote.value = false }
}

// spine colors cycle for book cards
const spineColors = [
  { accent: '#818cf8', bg: '#eef2ff', border: '#c7d2fe' },
  { accent: '#34d399', bg: '#f0fdf4', border: '#a7f3d0' },
  { accent: '#fbbf24', bg: '#fffbeb', border: '#fde68a' },
  { accent: '#f472b6', bg: '#fdf2f8', border: '#fbcfe8' },
  { accent: '#60a5fa', bg: '#eff6ff', border: '#bfdbfe' },
  { accent: '#fb923c', bg: '#fff7ed', border: '#fed7aa' },
]
const spine = (i) => spineColors[i % spineColors.length]
</script>

<template>
  <div class="bw">

    <!-- HEADER -->
    <header class="ph">
      <div class="title-row">
        <div>
          <h1 class="main-title">Library of Quotes</h1>
          <p class="subtitle">Your personal collection of profound thoughts</p>
        </div>
        <button class="add-btn" @click="showAddBookModal = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
          Add Book
        </button>
      </div>
    </header>

    <!-- LOADING -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <!-- BOOKS GRID -->
    <div v-else class="books-list">
      <div v-if="books.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        </div>
        <p>No books yet. Add your first one.</p>
      </div>

      <div
        v-for="(book, i) in books"
        :key="book.id"
        class="book-card"
        @click="selectedBook = book"
      >
        <!-- Colored spine accent -->
        <div class="book-spine" :style="{ background: spine(i).accent }"></div>

        <div class="book-body">
          <div class="book-info">
            <h2 class="book-title">{{ book.title }}</h2>
            <span class="book-author">{{ book.author }}</span>
          </div>

          <div class="quote-badge" :style="{ background: spine(i).bg, borderColor: spine(i).border, color: spine(i).accent }">
            <span class="qb-num">{{ book.quotes?.length || 0 }}</span>
            <span class="qb-lbl">quotes</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ADD BOOK MODAL -->
    <Transition name="fade-scale">
      <div v-if="showAddBookModal" class="overlay" @click.self="showAddBookModal = false">
        <div class="modal add-modal">
          <button class="close-btn" @click="showAddBookModal = false">âœ•</button>

          <div class="modal-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          </div>
          <h2 class="modal-title">Add a Book</h2>
          <p class="modal-sub">Save books whose quotes you want to collect.</p>

          <input
            v-model="newBookTitle"
            type="text"
            placeholder="Book title"
            class="inp"
            @keyup.enter="addNewBook"
          />
          <input
            v-model="newBookAuthor"
            type="text"
            placeholder="Author name"
            class="inp"
            @keyup.enter="addNewBook"
          />

          <div class="modal-btns">
            <button class="btn-cancel" @click="showAddBookModal = false">Cancel</button>
            <button class="btn-save" @click="addNewBook" :disabled="isAddingBook || !newBookTitle.trim()">
              {{ isAddingBook ? 'Savingâ€¦' : 'Save Book' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- BOOK READER MODAL -->
    <Transition name="slide-up">
      <div v-if="selectedBook" class="overlay" @click.self="selectedBook = null">
        <div class="modal book-modal">
          <button class="close-btn" @click="selectedBook = null">âœ•</button>

          <!-- Book header -->
          <div class="bm-header">
            <span class="bm-tag">Quote Collection</span>
            <h1 class="bm-title">{{ selectedBook.title }}</h1>
            <p class="bm-author">{{ selectedBook.author }}</p>
          </div>

          <!-- Quotes list -->
          <div class="quotes-scroll">
            <div v-if="!selectedBook.quotes?.length" class="no-quotes">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <p>No quotes yet. Add the first one below.</p>
            </div>

            <div
              v-for="(quote, idx) in selectedBook.quotes"
              :key="idx"
              class="quote-card"
            >
              <span class="qmark">"</span>
              <p class="qtext">{{ quote.text || quote }}</p>
            </div>
          </div>

          <!-- Add quote -->
          <div class="add-quote">
            <textarea
              v-model="newQuoteText"
              placeholder="Paste a quote from this bookâ€¦"
              class="quote-ta"
              rows="3"
            ></textarea>
            <button
              class="add-quote-btn"
              @click="addNewQuote"
              :disabled="isAddingQuote || !newQuoteText.trim()"
            >
              {{ isAddingQuote ? 'Addingâ€¦' : 'Add Quote' }}
            </button>
          </div>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

* { box-sizing: border-box; }

.bw {
  padding: 20px 16px 80px;
  max-width: 600px;
  margin: 0 auto;
  min-height: 100%;
  background: #f8fafc;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* â”€â”€ HEADER â”€â”€ */
.ph { margin-bottom: 24px; }
.title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }

.main-title {
  font-family: 'Lora', serif;
  font-size: 1.65rem; font-weight: 700;
  color: #0f172a; margin: 0 0 3px;
  letter-spacing: -0.3px; line-height: 1.2;
}
.subtitle { font-size: 0.8rem; color: #94a3b8; margin: 0; font-weight: 500; }

.add-btn {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  background: #0f172a; color: white; border: none;
  padding: 9px 14px; border-radius: 12px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.78rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 4px 12px -4px rgba(15,23,42,0.25);
  transition: transform 0.12s;
}
.add-btn:active { transform: scale(0.95); }

/* â”€â”€ LOADING â”€â”€ */
.loading-state { display: flex; justify-content: center; padding: 60px 0; }
.spinner {
  width: 32px; height: 32px;
  border: 3px solid #e2e8f0; border-top-color: #0f172a;
  border-radius: 50%; animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* â”€â”€ BOOK LIST â”€â”€ */
.books-list { display: flex; flex-direction: column; gap: 10px; }

.empty-state {
  text-align: center; padding: 48px 20px;
  background: white; border-radius: 20px; border: 1px dashed #e2e8f0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.empty-icon { color: #e2e8f0; }
.empty-state p { color: #94a3b8; font-size: 0.88rem; margin: 0; }

/* â”€â”€ BOOK CARD â”€â”€ */
.book-card {
  background: white; border: 1px solid #f1f5f9; border-radius: 18px;
  overflow: hidden; display: flex;
  box-shadow: 0 2px 12px -4px rgba(15,23,42,0.06);
  cursor: pointer; transition: transform 0.12s;
}
.book-card:active { transform: scale(0.982); }

.book-spine {
  width: 5px; flex-shrink: 0; border-radius: 18px 0 0 18px;
}

.book-body {
  flex: 1; display: flex; justify-content: space-between;
  align-items: center; padding: 18px 16px;
}

.book-info { flex: 1; min-width: 0; }
.book-title {
  font-family: 'Lora', serif;
  font-size: 1.05rem; font-weight: 700; color: #0f172a;
  margin: 0 0 4px; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.book-author {
  font-size: 0.78rem; color: #94a3b8; font-style: italic; font-weight: 500;
}

.quote-badge {
  display: flex; flex-direction: column; align-items: center;
  border: 1px solid; border-radius: 12px;
  padding: 9px 13px; flex-shrink: 0; margin-left: 14px;
  min-width: 58px;
}
.qb-num { font-size: 1.15rem; font-weight: 800; line-height: 1; }
.qb-lbl { font-size: 0.55rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; opacity: 0.8; }

/* â”€â”€ OVERLAY â”€â”€ */
.overlay {
  position: fixed; inset: 0;
  background: rgba(15,23,42,0.45); backdrop-filter: blur(6px);
  z-index: 9999; display: flex; justify-content: center; align-items: center;
  padding: 20px;
}

.close-btn {
  position: absolute; top: 14px; right: 14px;
  background: #f1f5f9; border: none; width: 30px; height: 30px;
  border-radius: 50%; font-size: 0.85rem; color: #475569; font-weight: bold;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  z-index: 2; transition: background 0.12s;
}
.close-btn:hover { background: #e2e8f0; }

/* â”€â”€ ADD BOOK MODAL â”€â”€ */
.add-modal {
  background: white; width: 100%; max-width: 400px;
  padding: 28px 24px 24px; border-radius: 24px;
  position: relative;
  box-shadow: 0 24px 60px rgba(15,23,42,0.18);
}

.modal-icon {
  width: 46px; height: 46px; background: #eef2ff; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
}
.modal-title {
  font-family: 'Lora', serif;
  font-size: 1.35rem; font-weight: 700; color: #0f172a;
  margin: 0 0 4px;
}
.modal-sub { font-size: 0.8rem; color: #94a3b8; margin: 0 0 20px; }

.inp {
  width: 100%; padding: 13px 14px;
  border: 1.5px solid #e2e8f0; border-radius: 12px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.92rem; color: #0f172a;
  margin-bottom: 10px; transition: border-color 0.15s;
  background: #fafafa;
}
.inp:focus { outline: none; border-color: #6366f1; background: white; }
.inp::placeholder { color: #94a3b8; }

.modal-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px; }
.btn-cancel {
  padding: 10px 18px; background: #f8fafc; border: 1px solid #e2e8f0;
  color: #64748b; border-radius: 11px; font-family: inherit;
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
}
.btn-save {
  padding: 10px 20px; background: #0f172a; color: white; border: none;
  border-radius: 11px; font-family: inherit;
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-save:disabled { opacity: 0.45; cursor: not-allowed; }

/* â”€â”€ BOOK READER MODAL â”€â”€ */
.book-modal {
  background: #fafaf9; width: 100%; max-width: 500px; height: 85vh;
  border-radius: 24px; display: flex; flex-direction: column;
  overflow: hidden; position: relative;
  box-shadow: 0 24px 60px rgba(15,23,42,0.2);
}

.bm-header {
  padding: 22px 22px 16px; background: white;
  border-bottom: 1px solid #f1f5f9; flex-shrink: 0;
  padding-right: 48px;
}
.bm-tag {
  display: inline-block; font-size: 0.55rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1.2px;
  background: #eef2ff; color: #6366f1; border: 1px solid #c7d2fe;
  padding: 2px 8px; border-radius: 6px; margin-bottom: 8px;
}
.bm-title {
  font-family: 'Lora', serif;
  font-size: 1.5rem; font-weight: 700; color: #0f172a;
  margin: 0 0 4px; line-height: 1.25;
}
.bm-author { font-size: 0.85rem; color: #94a3b8; font-style: italic; margin: 0; }

/* Quotes scroll */
.quotes-scroll {
  flex: 1; overflow-y: auto; padding: 18px 18px 10px;
  display: flex; flex-direction: column; gap: 13px;
}

.no-quotes {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 40px 20px; color: #94a3b8;
  font-size: 0.85rem; text-align: center;
}
.no-quotes p { margin: 0; }

.quote-card {
  background: white; border: 1px solid #f1f5f9; border-radius: 16px;
  padding: 18px 18px 16px; position: relative;
  box-shadow: 0 1px 6px -2px rgba(15,23,42,0.04);
}
.qmark {
  position: absolute; top: -4px; left: 12px;
  font-family: 'Lora', serif; font-size: 3.5rem;
  color: #fde68a; line-height: 1; pointer-events: none; opacity: 0.7;
}
.qtext {
  font-family: 'Lora', serif; font-style: italic;
  font-size: 0.98rem; color: #334155; line-height: 1.7;
  margin: 0; position: relative; z-index: 1;
  padding-top: 6px;
}

/* Add quote area */
.add-quote {
  padding: 14px 16px; background: white;
  border-top: 1px solid #f1f5f9; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 9px;
}
.quote-ta {
  width: 100%; padding: 12px 14px;
  border: 1.5px solid #e2e8f0; border-radius: 12px;
  font-family: 'Lora', serif; font-style: italic;
  font-size: 0.92rem; color: #334155; resize: none;
  transition: border-color 0.15s; background: #fafafa;
}
.quote-ta:focus { outline: none; border-color: #6366f1; background: white; }
.quote-ta::placeholder { color: #94a3b8; font-style: italic; }

.add-quote-btn {
  width: 100%; padding: 12px;
  background: #0f172a; color: white; border: none;
  border-radius: 12px; font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.88rem; font-weight: 800; cursor: pointer;
  box-shadow: 0 4px 12px -4px rgba(15,23,42,0.2);
  transition: transform 0.12s, opacity 0.15s;
}
.add-quote-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.add-quote-btn:active:not(:disabled) { transform: scale(0.98); }

/* â”€â”€ TRANSITIONS â”€â”€ */
.fade-scale-enter-active, .fade-scale-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.96); }

.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.25s, transform 0.3s cubic-bezier(0.16,1,0.3,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(40px); }
</style>