// src/components/Instructions.js

import React from 'react';
import './Instructions.css'; // Optional: Create a separate CSS file for Instructions component

function Instructions() {
    return (
        <div className="instructions">
            <h3>Instructions</h3>
            <ol>
                <li>Click the "Start" button to begin recording your voice.</li>
                <li>Click "Stop" to end the recording.</li>
                <li>Alternatively, you can upload multiple audio files from your device.</li>
                <li>Listen to the audio previews and confirm before uploading.</li>
                <li>Click "Upload" to save the recordings for processing.</li>
            </ol>
        </div>
    );
}

export default Instructions;
