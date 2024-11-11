require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const cors = require('cors'); // Import CORS package

// Initialize Express
const app = express();
const PORT = 5000;

// AWS S3 configuration using AWS SDK v3
const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1', // Default region if not provided
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

if (!BUCKET_NAME) {
    console.error("Error: AWS_BUCKET_NAME environment variable is not set.");
    process.exit(1);
}

// CORS configuration to allow requests from React frontend running on localhost:3000
app.use(cors({
    origin: 'http://localhost:3000', // Allow requests from this origin
    methods: ['GET', 'POST'], // Allow only GET and POST requests
}));

// Multer configuration for handling file uploads
const upload = multer({ dest: 'uploads/' });

// Endpoint to handle audio file uploads and compile request
app.post('/api/upload', upload.array('files'), async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const sessionPath = `sessions/${sessionId}`;

        // Ensure directory for the session exists
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        // Process each uploaded file
        const processedFiles = [];
        for (const file of req.files) {
            const outputFilePath = path.join(sessionPath, `${file.filename}.wav`);
            
            // Convert file to WAV with ffmpeg at 22050 Hz
            await convertToWav(file.path, outputFilePath, 22050);
            processedFiles.push(outputFilePath);

            // Upload converted file to S3
            await uploadToS3(sessionPath, `${file.filename}.wav`, outputFilePath);
        }

        // Remove local temp files
        req.files.forEach(file => fs.unlinkSync(file.path));

        // Compile all files in the session folder into one
        const compiledFilePath = await compileAudioFiles(sessionPath, processedFiles);

        res.json({ compiledFile: compiledFilePath });
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send('Error compiling audio files');
    }
});

// Endpoint to trigger Google Colab notebook for model training
app.post('/api/upload-model', async (req, res) => {
    const { sessionId } = req.body;
    const colabNotebookPath = 'path/to/your/colab/notebook.ipynb'; // Replace with the actual notebook path

    try {
        // Run the Google Colab notebook as a subprocess
        exec(`python3 -m jupyter nbconvert --to notebook --execute ${colabNotebookPath}`, (err, stdout, stderr) => {
            if (err) {
                console.error('Error running notebook:', err);
                res.status(500).send('Error triggering model training');
                return;
            }
            console.log('Notebook executed successfully:', stdout);
            res.json({ message: 'Model training triggered successfully' });
        });
    } catch (error) {
        console.error('Error triggering model training:', error);
        res.status(500).send('Failed to trigger model training');
    }
});

// Helper function to convert audio to WAV format at specified sample rate
function convertToWav(inputPath, outputPath, sampleRate) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('pcm_s16le')
            .audioFrequency(sampleRate)
            .toFormat('wav')
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .save(outputPath);
    });
}

// Helper function to upload file to S3 using AWS SDK v3
async function uploadToS3(sessionPath, fileName, filePath) {
    if (!BUCKET_NAME) {
        throw new Error("Bucket name is missing. Check AWS_BUCKET_NAME environment variable.");
    }
    const fileContent = fs.readFileSync(filePath);
    const params = {
        Bucket: BUCKET_NAME,
        Key: `${sessionPath}/${fileName}`,
        Body: fileContent,
    };

    try {
        await s3.send(new PutObjectCommand(params));
        console.log(`Successfully uploaded ${fileName} to S3`);
    } catch (error) {
        console.error(`Failed to upload ${fileName} to S3:`, error);
        throw error;
    }
}

// Helper function to compile all WAV files in a session into one
async function compileAudioFiles(sessionPath, audioFiles) {
    const compiledFolderPath = path.join(sessionPath, 'compiled_audio');
    if (!fs.existsSync(compiledFolderPath)) {
        fs.mkdirSync(compiledFolderPath, { recursive: true });
    }

    const compiledFilePath = path.join(compiledFolderPath, 'compiled_audio.wav');

    return new Promise((resolve, reject) => {
        const ffmpegCommand = ffmpeg();

        audioFiles.forEach(file => ffmpegCommand.input(file));

        ffmpegCommand
            .on('end', () => {
                // Upload compiled file to S3
                uploadToS3(`${sessionPath}/compiled_audio`, 'compiled_audio.wav', compiledFilePath)
                    .then(() => resolve(compiledFilePath))
                    .catch(reject);
            })
            .on('error', reject)
            .mergeToFile(compiledFilePath);
    });
}

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
