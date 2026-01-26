/**
 * Voice Service for AI Assistant
 * Provides speech-to-text functionality using the Web Speech API
 */

// Extend Window interface to include SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface VoiceRecognitionResult {
  transcript: string;
  confidence: number;
}

export interface VoiceRecognitionError {
  error: string;
  message: string;
}

export class VoiceService {
  private recognition: any = null;
  private isListeningState = false;
  private onResultCallback: ((result: VoiceRecognitionResult) => void) | null = null;
  private onErrorCallback: ((error: VoiceRecognitionError) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    // Check if browser supports Web Speech API
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.setupRecognition();
      }
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;

    // Configure recognition settings
    this.recognition.continuous = false; // Stop after first result
    this.recognition.interimResults = false; // Only final results
    this.recognition.lang = 'en-US'; // Default language

    // Event handlers
    this.recognition.onresult = (event: any) => {
      const result = event.results[0][0];
      const transcript = result.transcript;
      const confidence = result.confidence;

      if (this.onResultCallback) {
        this.onResultCallback({ transcript, confidence });
      }
    };

    this.recognition.onerror = (event: any) => {
      const error = event.error;
      const message = event.message || 'Unknown error';

      if (this.onErrorCallback) {
        this.onErrorCallback({ error, message });
      }
    };

    this.recognition.onend = () => {
      this.isListeningState = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };
  }

  /**
   * Check if voice recognition is supported
   */
  isSupported(): boolean {
    return this.recognition !== null;
  }

  /**
   * Check if currently listening
   */
  isListening(): boolean {
    return this.isListeningState;
  }

  /**
   * Start listening for speech
   */
  startListening(): Promise<VoiceRecognitionResult> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Voice recognition is not supported in this browser'));
        return;
      }

      if (this.isListeningState) {
        reject(new Error('Already listening'));
        return;
      }

      this.onResultCallback = (result) => {
        this.isListeningState = false;
        resolve(result);
      };

      this.onErrorCallback = (error) => {
        this.isListeningState = false;
        reject(new Error(`${error.error}: ${error.message}`));
      };

      this.onEndCallback = () => {
        // Clean up callbacks
        this.onResultCallback = null;
        this.onErrorCallback = null;
        this.onEndCallback = null;
      };

      try {
        this.isListeningState = true;
        this.recognition.start();
      } catch (error) {
        this.isListeningState = false;
        reject(error);
      }
    });
  }

  /**
   * Stop listening for speech
   */
  stopListening(): void {
    if (this.recognition && this.isListeningState) {
      this.recognition.stop();
      this.isListeningState = false;
    }
  }

  /**
   * Set the language for recognition
   */
  setLanguage(lang: string): void {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  /**
   * Get supported languages (if available)
   */
  getSupportedLanguages(): string[] {
    // Common languages supported by most browsers
    return [
      'en-US', // English (US)
      'en-GB', // English (UK)
      'es-ES', // Spanish
      'fr-FR', // French
      'de-DE', // German
      'it-IT', // Italian
      'pt-BR', // Portuguese (Brazil)
      'ja-JP', // Japanese
      'ko-KR', // Korean
      'zh-CN', // Chinese (Simplified)
      'ar-SA', // Arabic
      'hi-IN', // Hindi
      'ru-RU', // Russian
    ];
  }
}

// Create a singleton instance
let voiceServiceInstance: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService();
  }
  return voiceServiceInstance;
}

/**
 * Hook-friendly voice recognition function
 * Returns a promise that resolves with the transcript
 */
export async function recognizeSpeech(): Promise<string> {
  const voiceService = getVoiceService();
  
  if (!voiceService.isSupported()) {
    throw new Error('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
  }

  try {
    const result = await voiceService.startListening();
    return result.transcript;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if voice recognition is available
 */
export function isVoiceSupported(): boolean {
  const voiceService = getVoiceService();
  return voiceService.isSupported();
}

/**
 * Get browser compatibility information
 */
export function getBrowserCompatibility(): {
  supported: boolean;
  browser: string;
  features: string[];
} {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  const supported = isVoiceSupported();
  const features: string[] = [];

  if (supported) {
    features.push('Speech Recognition');
    if ('speechSynthesis' in window) {
      features.push('Speech Synthesis');
    }
  }

  return {
    supported,
    browser,
    features,
  };
}
