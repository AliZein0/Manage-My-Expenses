"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react"
import { getVoiceService, isVoiceSupported } from "@/lib/voice/voice-service"
import { useToast } from "@/components/ui/use-toast"

interface VoiceInputButtonProps {
  onTranscript: (transcript: string) => void
  disabled?: boolean
  className?: string
  size?: "sm" | "default" | "lg" | "icon"
}

export function VoiceInputButton({ 
  onTranscript, 
  disabled = false, 
  className = "",
  size = "sm"
}: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Check browser support on mount
    const supported = isVoiceSupported()
    setIsSupported(supported)
  }, [])

  const handleVoiceInput = async () => {
    if (!isSupported) {
      toast({
        title: "Voice Not Supported",
        description: "Your browser doesn't support voice recognition. Please use Chrome, Edge, or Safari.",
        variant: "destructive"
      })
      return
    }

    if (isListening) {
      // Stop listening if already listening
      const voiceService = getVoiceService()
      voiceService.stopListening()
      setIsListening(false)
      return
    }

    try {
      setIsListening(true)
      setIsProcessing(true)

      const voiceService = getVoiceService()
      const result = await voiceService.startListening()
      
      // Process the transcript
      if (result.transcript.trim()) {
        onTranscript(result.transcript)
        
        toast({
          title: "Voice Input Received",
          description: `"${result.transcript}"`
        })
      } else {
        toast({
          title: "No Speech Detected",
          description: "Please try speaking again.",
          variant: "default"
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to recognize speech"
      
      toast({
        title: "Voice Recognition Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsListening(false)
      setIsProcessing(false)
    }
  }

  if (!isSupported) {
    return (
      <Button
        size={size}
        variant="outline"
        disabled={true}
        className={className}
        title="Voice recognition not supported"
      >
        <MicOff className="w-4 h-4" />
      </Button>
    )
  }

  return (
    <Button
      size={size}
      variant={isListening ? "destructive" : "outline"}
      onClick={handleVoiceInput}
      disabled={disabled || isProcessing}
      className={`${className} ${isListening ? "animate-pulse" : ""}`}
      title={isListening ? "Stop listening" : "Start voice input"}
    >
      {isProcessing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isListening ? (
        <Mic className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  )
}

interface VoiceStatusIndicatorProps {
  isListening: boolean
  isProcessing: boolean
}

export function VoiceStatusIndicator({ isListening, isProcessing }: VoiceStatusIndicatorProps) {
  if (!isListening && !isProcessing) return null

  return (
    <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processing...</span>
        </>
      ) : (
        <>
          <Volume2 className="w-4 h-4 animate-pulse" />
          <span>Listening...</span>
        </>
      )}
    </div>
  )
}

interface VoiceFeedbackProps {
  transcript: string
  confidence: number
  onClose: () => void
}

export function VoiceFeedback({ transcript, confidence, onClose }: VoiceFeedbackProps) {
  if (!transcript) return null

  const confidenceLevel = confidence > 0.8 ? "high" : confidence > 0.6 ? "medium" : "low"
  const confidenceColor = confidenceLevel === "high" ? "text-green-600" : 
                         confidenceLevel === "medium" ? "text-yellow-600" : "text-red-600"

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">You said:</p>
          <p className="text-sm text-gray-900 mt-1">{transcript}</p>
          <p className={`text-xs mt-1 ${confidenceColor}`}>
            Confidence: {(confidence * 100).toFixed(0)}%
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </Button>
      </div>
    </div>
  )
}

export function VoiceNotSupportedMessage() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <MicOff className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-800">Voice Recognition Not Available</p>
          <p className="text-xs text-yellow-700 mt-1">
            Voice input requires a compatible browser like Chrome, Edge, or Safari. 
            Please use the text input instead.
          </p>
        </div>
      </div>
    </div>
  )
}
