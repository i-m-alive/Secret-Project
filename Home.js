import React, { useState, useEffect } from 'react';
import { ReactMic } from 'react-mic';
import './Home.css'; // For specific styling related to Home.js
import { v4 as uuidv4 } from 'uuid'; // To generate unique session IDs

function Home() {
    const [audioSegments, setAudioSegments] = useState([]);
    const [error, setError] = useState('');
    const [record, setRecord] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [totalLength, setTotalLength] = useState(0);
    const [timerInterval, setTimerInterval] = useState(null);
    const [compilationDone, setCompilationDone] = useState(false);
    const [compiledAudioUrl, setCompiledAudioUrl] = useState('');
    const [sessionId] = useState(uuidv4()); // Generate a unique session ID

    useEffect(() => {
        return () => clearInterval(timerInterval);
    }, [timerInterval]);

    const startRecording = () => {
        // Create or resume the AudioContext after a user gesture
        if (window.AudioContext || window.webkitAudioContext) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }
    
        setRecord(true);
        setError('');
        setRecordingTime(0);
        const interval = setInterval(() => {
            setRecordingTime(prevTime => prevTime + 1);
        }, 1000);
        setTimerInterval(interval);
    };

    const stopRecording = () => {
        setRecord(false);
        clearInterval(timerInterval);
        addRecordedSegment(recordingTime);
    };

    const addRecordedSegment = (duration) => {
        const newSegment = {
            id: Date.now() + Math.random(),
            duration: duration,
            tag: '',
            number: audioSegments.length + 1,
            type: 'recorded',
            filename: `recorded-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`, // Generate a filename
            url: null // Will be set later when the recording is processed
        };

        setAudioSegments(prevSegments => {
            const updatedSegments = [...prevSegments, newSegment];
            updateTotalLength(updatedSegments);
            return updatedSegments;
        });
    };

    const onFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) return;

        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const audio = new Audio(event.target.result);
                audio.addEventListener('loadedmetadata', () => {
                    const duration = Math.floor(audio.duration);
                    const newSegment = {
                        id: Date.now() + Math.random(),
                        duration: duration,
                        tag: '',
                        number: audioSegments.length + 1,
                        type: 'uploaded',
                        url: event.target.result,
                        filename: file.name // Use the file's name as the filename
                    };
                    setAudioSegments(prevSegments => {
                        const updatedSegments = [...prevSegments, newSegment];
                        updateTotalLength(updatedSegments);
                        return updatedSegments;
                    });
                });
            };
            reader.readAsDataURL(file);
        });

        e.target.value = null;
    };

    const updateTotalLength = (segments) => {
        const newTotalLength = segments.reduce((acc, segment) => acc + (segment.duration || 0), 0);
        setTotalLength(newTotalLength);
        checkAudioLength(newTotalLength);
    };

    const checkAudioLength = (currentLength) => {
        const remainingTime = 1200 - currentLength;
        if (remainingTime > 0) {
            setError(`Total audio length is ${formatTime(currentLength)}. Please add more audio to reach 20 minutes. Remaining time needed: ${formatTime(remainingTime)}`);
        } else {
            setError('');
        }
    };

    const handleTagChange = (id, value) => {
        const updatedSegments = audioSegments.map(segment => {
            if (segment.id === id) {
                return { ...segment, tag: value };
            }
            return segment;
        });
        setAudioSegments(updatedSegments);
    };

    const discardAudio = (id) => {
        const updatedSegments = audioSegments.filter(segment => segment.id !== id);
        updateTotalLength(updatedSegments);
        setAudioSegments(updatedSegments);
    };

    const compileAudio = async () => {
        console.log('Compile button clicked');
        if (totalLength < 1200) {
            setError('Total audio length must be at least 20 minutes. Please add more audio files.');
            return;
        }
    
        try {
            const formData = new FormData();
            formData.append('sessionId', sessionId);
            for (const segment of audioSegments) {
                console.log('Processing segment:', segment); 
                let blob = null;
                if (segment.type === 'uploaded') {
                    blob = dataURLtoBlob(segment.url);
                } else if (segment.type === 'recorded' && segment.blob) {
                    blob = segment.blob;
                }
    
                if (blob) {
                    formData.append('files', blob, segment.filename);
                }
            }
    
            console.log('Sending data to backend...');
            const response = await fetch('http://localhost:5000/api/upload', {
                method: 'POST',
                body: formData
            });
    
            if (!response.ok) {
                throw new Error('Failed to compile audio');
            }
    
            console.log('Response received:', response);
            const result = await response.json();
            setCompilationDone(true);
            setCompiledAudioUrl(result.compiledFile); 
            console.log('Audio compiled successfully:', result);
    
        } catch (err) {
            console.error('Error compiling audio:', err);
            setError('Failed to compile audio.');
        }
    };
    

    const uploadModel = async () => {
        try {
            console.log('Uploading model for training...'); // Log when upload starts
            const response = await fetch('http://localhost:5000/api/upload-model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId })
            });

            const result = await response.json();
            if (response.ok) {
                console.log('Model training triggered successfully:', result);
            } else {
                setError(result.message);
            }
        } catch (err) {
            console.error('Error uploading audio for model training:', err);
            setError('Failed to upload audio for model training.');
        }
    };

    const dataURLtoBlob = (dataurl) => {
        if (!dataurl) return null; // Ensure the data URL is valid
        const arr = dataurl.split(','),
            mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    const formatTime = (timeInSeconds) => {
        if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '0:00';
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="App">
            <div className="logo-container">
                <img src="/logo.png" alt="App Logo" className="App-logo" />
            </div>

            <div className="App-content">
                <h2>Welcome to the Voice Mimic App</h2>

                <ReactMic
                    record={record}
                    className="sound-wave"
                    onStop={() => {}}
                    strokeColor="#000000"
                    backgroundColor="#f2f2f2"
                    width={200}
                    height={100}
                />

                {record && (
                    <div className="recording-timer">
                        <p>Recording Time: {formatTime(recordingTime)}</p>
                    </div>
                )}

                <div className="App-buttons">
                    <button onClick={startRecording} type="button">Start</button>
                    <button onClick={stopRecording} type="button">Stop</button>
                    <input type="file" accept="audio/*" multiple onChange={onFileChange} />
                </div>

                {audioSegments.length > 0 && (
                    <div className="audio-preview">
                        <h3>Preview Your Audio</h3>
                        {audioSegments.map(segment => (
                            <div key={segment.id} className="audio-segment">
                                <p className="audio-number">#{segment.number}</p>
                                <p className="audio-length">Length: {formatTime(segment.duration)}</p>
                                <input
                                    type="text"
                                    placeholder="Tag this audio"
                                    value={segment.tag}
                                    onChange={e => handleTagChange(segment.id, e.target.value)}
                                    className="tag-input"
                                />
                                {segment.type === 'uploaded' && (
                                    <audio controls src={segment.url} className="audio-player" />
                                )}
                                <span
                                    role="button"
                                    style={{ color: 'red', cursor: 'pointer', marginLeft: '10px', fontSize: '20px' }}
                                    onClick={() => discardAudio(segment.id)}
                                    title="Discard this audio"
                                >
                                    ❌
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="length-info">
                    <p>Total Compiled Audio Length: {formatTime(totalLength)}</p>
                    {totalLength < 1200 && (
                        <p style={{ color: 'red' }}>Remaining audio length needed: {formatTime(1200 - totalLength)}</p>
                    )}
                </div>

                {totalLength >= 1200 && !compilationDone && (
                    <div className="confirmation-buttons">
                        <button onClick={compileAudio} type="button">Compile Audio</button>
                    </div>
                )}

                {compilationDone && (
                    <div className="confirmation-buttons">
                        <p>Compilation complete! <a href={compiledAudioUrl} download>Download Compiled Audio</a></p>
                        <button onClick={uploadModel} type="button">Upload for Model Training</button>
                    </div>
                )}

                {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>
        </div>
    );
}

export default Home;
