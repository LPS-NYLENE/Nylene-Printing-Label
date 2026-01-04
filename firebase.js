// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuratioc
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAcNqa-rlwixUAsS7hTGsXaqiC8ELMVJXw",
    authDomain: "nylene-label-printer.firebaseapp.com",
    projectId: "nylene-label-printer",
    storageBucket: "nylene-label-printer.firebasestorage.app",
    messagingSenderId: "906222982085",
    appId: "1:906222982085:web:5c9808ced0307256c0b1ac",
    measurementId: "G-42JFZ5Q0NK",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
