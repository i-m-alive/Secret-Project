const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const axios = require('axios');

// Set ffmpeg path for fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Base uploads directory
const baseUploadsDir = path.join(__dirname, 'uploads');

// Ensure the base uploads directory exists
if (!fs.existsSync(baseUploadsDir)) {
    fs.mkdirSync(baseUploadsDir, { recursive: true });
}

// Multer setup for file uploads without file size limit
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const sessionId = req.body.sessionId;
        const sessionDir = path.join(baseUploadsDir, sessionId);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        cb(null, sessionDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `voice-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log('Received file:', file); // Log file info to debug

        // List of accepted MIME types for audio files
        const filetypes = /wav|mp3|m4a|aac|flac|ogg/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = /audio/.test(file.mimetype);  // Allow any MIME type that starts with "audio"

        console.log('extname:', extname); // Log extension check result
        console.log('mimetype:', mimetype); // Log MIME type check result

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only audio files are allowed!'));
    }
}).array('files');


// Convert all files to WAV format and compile into a single file
async function convertAndCompile(sessionDir) {
    try {
        const files = fs.readdirSync(sessionDir).filter(file => !file.includes('compiled.wav'));
        const wavFiles = await Promise.all(files.map(file => convertToWav(path.join(sessionDir, file), sessionDir)));

        const listFilePath = path.join(sessionDir, `filelist-${Date.now()}.txt`);
        const fileListContent = wavFiles.map(filePath => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n');

        fs.writeFileSync(listFilePath, fileListContent);

        const outputFilePath = path.join(sessionDir, 'compiled.wav');

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(listFilePath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c', 'copy'])
                .output(outputFilePath)
                .on('start', () => {
                    console.log(`Starting compilation of files: ${fileListContent}`);
                })
                .on('end', () => {
                    fs.unlinkSync(listFilePath); // Remove the filelist after processing
                    console.log(`Successfully compiled files into ${outputFilePath}`);
                    resolve(outputFilePath);
                })
                .on('error', (err) => {
                    console.error('Error compiling audio:', err);
                    reject(err);
                })
                .run();
        });
    } catch (error) {
        console.error('Error in compiling process:', error);
        throw error;
    }
}

// Convert a single file to WAV format
function convertToWav(filePath, sessionDir) {
    return new Promise((resolve, reject) => {
        const outputFilePath = path.join(sessionDir, `converted-${path.basename(filePath, path.extname(filePath))}.wav`);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return reject(new Error(`File not found: ${filePath}`));
        }

        ffmpeg(filePath)
            .toFormat('wav')
            .on('start', () => {
                console.log(`Starting conversion of ${filePath} to WAV`);
            })
            .on('end', () => {
                console.log(`Successfully converted ${filePath} to ${outputFilePath}`);
                resolve(outputFilePath);
            })
            .on('error', (err) => {
                console.error(`Error converting ${filePath} to WAV:`, err);
                reject(err);
            })
            .save(outputFilePath);
    });
}

// Endpoint to handle file uploads
app.post('/api/upload', (req, res) => {
    console.log('Received upload request');
    upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(500).json({ message: err.message });
        } else if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ message: err.message });
        }

        console.log('File upload successful, processing...');

        const sessionId = req.body.sessionId;
        const sessionDir = path.join(baseUploadsDir, sessionId);

        try {
            console.log(`Compiling files for session: ${sessionId}`);
            const compiledFilePath = await convertAndCompile(sessionDir);
            console.log('Compilation successful, file path:', compiledFilePath);
            res.json({
                message: 'Files uploaded, converted, and compiled successfully.',
                compiledFile: compiledFilePath,
                sessionDir: sessionDir
            });
        } catch (err) {
            console.error('Error during file processing:', err);
            res.status(500).json({ message: 'Failed to process files.', error: err.message });
        }
    });
});

// Endpoint to trigger the model training (Upload button)
app.post('/api/upload-model', (req, res) => {
    const { sessionId } = req.body;
    const sessionDir = path.join(baseUploadsDir, sessionId);
    const compiledFilePath = path.join(sessionDir, 'compiled.wav');

    if (!fs.existsSync(compiledFilePath)) {
        return res.status(400).json({ message: 'Compiled file not found.' });
    }

    triggerModelTraining(`http://localhost:${port}/uploads/${sessionId}/compiled.wav`)
        .then(() => {
            res.json({ message: 'Model training triggered successfully.' });
        })
        .catch(err => {
            console.error('Error triggering model training:', err);
            res.status(500).json({ message: 'Failed to trigger model training.', error: err.message });
        });
});

// Trigger model training in Google Colab
const triggerModelTraining = async (fileUrl) => {
    try {
        const colabUrl = 'https://colab.research.google.com/drive/YOUR_COLAB_NOTEBOOK_ID';  // Update this URL with your actual Google Colab URL

        const response = await axios.post(colabUrl, {
            fileUrl: fileUrl
        });

        console.log('Model training triggered successfully:', response.data);
    } catch (error) {
        console.error('Error triggering model training:', error.message);
        throw error;
    }
};

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(baseUploadsDir));

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
