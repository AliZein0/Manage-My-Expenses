/**
 * Whisper Processor
 * Processes audio files using whisper.cpp
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class WhisperProcessor {
  constructor() {
    this.whisperPath = path.join(__dirname, '..', 'whisper.cpp');
    this.whisperExe = path.join(this.whisperPath, 'build', 'bin', 'Release', 'whisper-cli.exe');
    this.modelPath = path.join(this.whisperPath, 'models', 'ggml-small.bin');
  }

  /**
   * Check if whisper.cpp is available
   */
  isAvailable() {
    return fs.existsSync(this.whisperExe) && fs.existsSync(this.modelPath);
  }

  /**
   * Process audio file and return transcript
   */
  async processAudio(audioBuffer, audioFormat = 'webm') {
    if (!this.isAvailable()) {
      throw new Error('whisper.cpp not available. Please build whisper.cpp first.');
    }

    // Create temporary files
    const tempDir = os.tmpdir();
    const tempAudioPath = path.join(tempDir, `whisper-${Date.now()}.${audioFormat}`);
    const tempOutputPath = path.join(tempDir, `whisper-output-${Date.now()}.txt`);

    try {
      // Write audio buffer to temp file
      await fs.promises.writeFile(tempAudioPath, audioBuffer);

      // Build command
      const command = `"${this.whisperExe}" -m "${this.modelPath}" -f "${tempAudioPath}" -of "${tempOutputPath.replace('.txt', '')}" -l auto -np -nt`;

      console.log('Running whisper command:', command);

      // Execute whisper.cpp
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60 second timeout
      });

      if (stderr) {
        console.warn('Whisper stderr:', stderr);
      }

      console.log('Whisper stdout:', stdout);

      // Read the output file
      const outputPath = tempOutputPath.replace('.txt', '.txt');
      if (fs.existsSync(outputPath)) {
        const transcript = await fs.promises.readFile(outputPath, 'utf-8');
        
        // Clean up temp files
        await this.cleanupTempFiles([tempAudioPath, outputPath]);

        return transcript.trim();
      } else {
        throw new Error('Whisper output file not created');
      }

    } catch (error) {
      // Clean up temp files on error
      await this.cleanupTempFiles([tempAudioPath, tempOutputPath]);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(files) {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file);
        }
      } catch (error) {
        console.warn('Failed to clean up temp file:', file, error);
      }
    }
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      whisperExe: this.whisperExe,
      modelPath: this.modelPath,
      whisperExists: fs.existsSync(this.whisperExe),
      modelExists: fs.existsSync(this.modelPath),
    };
  }
}

// Create singleton instance
let instance = null;

function getWhisperProcessor() {
  if (!instance) {
    instance = new WhisperProcessor();
  }
  return instance;
}

module.exports = { getWhisperProcessor };
