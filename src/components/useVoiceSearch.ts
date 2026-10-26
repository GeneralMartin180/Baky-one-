import { useEffect, useRef, useState } from 'react';

export function useVoiceSearch(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = recognition.onstart = recognition.onend = recognition.onerror = null;
      try { recognition.abort(); } catch {}
    }
  }, []);

  const startVoiceSearch = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('Tento prehliadač nepodporuje hlasové vyhľadávanie. Zadajte text.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    setVoiceError(null);
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = 'sk-SK';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => {
        setIsListening(false);
        setVoiceError('Hlas sa nepodarilo rozpoznať. Skontrolujte povolenie mikrofónu alebo zadajte text.');
      };
      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim();
        if (text) callbackRef.current(text);
      };
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError('Hlasové vyhľadávanie sa nepodarilo spustiť.');
    }
  };
  return { isListening, voiceError, startVoiceSearch, isSupported };
}
