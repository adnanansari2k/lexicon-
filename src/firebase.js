// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";

// REPLACE THIS WITH YOUR FIREBASE CONFIG KEYS
const firebaseConfig = {
  apiKey: "AIzaSyBdUnyHh02ylYTfs0c7aKCaYj4ABC4-HDA",
  authDomain: "lexicon-3e94c.firebaseapp.com",
  projectId: "lexicon-3e94c",
  storageBucket: "lexicon-3e94c.firebasestorage.app",
  messagingSenderId: "581056778459",
  appId: "1:581056778459:web:a21b91fec949af11863cfe",
  measurementId: "G-6B4QTX4HT5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const wordsCollection = collection(db, "words");

export { db, wordsCollection, addDoc, getDocs };
