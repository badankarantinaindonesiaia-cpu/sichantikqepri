
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

// Helper function to convert a file to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as base64 string'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const LOADING_MESSAGES = [
  "Summoning digital muses...",
  "Warming up the pixels...",
  "Choreographing the frames...",
  "This might take a few minutes. Great art needs patience!",
  "Rendering cinematic magic...",
  "Almost there, polishing the final cut...",
  "Consulting with the AI director...",
];

// FIX: Removed conflicting global declaration for `window.aistudio` to resolve TypeScript errors.
// The global type is assumed to be provided by the execution environment.

const Spinner: React.FC = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [prompt, setPrompt] = useState<string>('A neon hologram of a cat driving a sports car at top speed on a rainy night in a futuristic city');
  const [referenceImage, setReferenceImage] = useState<{ file: File | null; previewUrl: string | null; base64: string | null }>({ file: null, previewUrl: null, base64: null });
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadingIntervalRef = useRef<number | null>(null);

  const checkApiKey = useCallback(async () => {
    try {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setHasApiKey(true);
      } else {
        setHasApiKey(false);
      }
    } catch (e) {
      console.error("Error checking for API key:", e);
      setHasApiKey(false);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  useEffect(() => {
    if (isLoading) {
      let messageIndex = 0;
      loadingIntervalRef.current = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
        setLoadingMessage(LOADING_MESSAGES[messageIndex]);
      }, 4000);
    } else {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
    }

    return () => {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
      }
    };
  }, [isLoading]);
  
  const handleSelectKey = async () => {
    try {
        await window.aistudio.openSelectKey();
        // Assume key selection is successful and optimistically update the UI.
        setHasApiKey(true);
    } catch (e) {
        console.error("Error opening select key dialog:", e);
        setError("Could not open the API key selection dialog. Please try again.");
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (referenceImage.previewUrl) {
        URL.revokeObjectURL(referenceImage.previewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      const base64 = await fileToBase64(file);
      setReferenceImage({ file, previewUrl, base64 });
    }
  };

  const removeImage = () => {
    if (referenceImage.previewUrl) {
      URL.revokeObjectURL(referenceImage.previewUrl);
    }
    setReferenceImage({ file: null, previewUrl: null, base64: null });
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setGeneratedVideoUrl(null);
    setLoadingMessage(LOADING_MESSAGES[0]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const payload: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: {
          numberOfVideos: 1,
          resolution,
          aspectRatio,
        }
      };

      if (referenceImage.base64 && referenceImage.file) {
        payload.image = {
          imageBytes: referenceImage.base64,
          mimeType: referenceImage.file.type,
        };
      }
      
      let operation = await ai.models.generateVideos(payload);

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

      if (!downloadLink) {
        throw new Error("Video generation succeeded but no download link was found.");
      }
      
      const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video data: ${videoResponse.statusText}`);
      }

      const videoBlob = await videoResponse.blob();
      const videoUrl = URL.createObjectURL(videoBlob);
      setGeneratedVideoUrl(videoUrl);

    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "An unknown error occurred.";
       if (errorMessage.includes("Requested entity was not found.")) {
        errorMessage = "Your API key is invalid or not found. Please select a valid key and try again.";
        setHasApiKey(false);
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const mainContent = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* Controls Panel */}
      <div className="bg-gray-800/50 rounded-2xl p-6 shadow-lg backdrop-blur-md border border-gray-700/50 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-cyan-400">Video Generation Controls</h2>

        {/* Prompt */}
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
          <textarea
            id="prompt"
            rows={5}
            className="w-full bg-gray-900/70 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors placeholder-gray-500"
            placeholder="e.g., A majestic lion roaring on a cliff at sunset, cinematic lighting"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Reference Image (Optional)</label>
          {referenceImage.previewUrl ? (
            <div className="relative group">
              <img src={referenceImage.previewUrl} alt="Reference preview" className="w-full h-auto max-h-60 object-contain rounded-lg border-2 border-gray-600" />
              <button onClick={removeImage} className="absolute top-2 right-2 bg-red-600/80 text-white rounded-full p-1.5 hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          ) : (
            <label htmlFor="image-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-900/50 hover:bg-gray-800/60 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span></p>
                <p className="text-xs text-gray-500">PNG, JPG, or WEBP</p>
              </div>
              <input id="image-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageChange} />
            </label>
          )}
        </div>

        {/* Aspect Ratio & Resolution */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
            <div className="flex gap-2">
              {['16:9', '9:16'].map(ratio => (
                <button key={ratio} onClick={() => setAspectRatio(ratio as '16:9' | '9:16')} className={`w-full py-2 px-4 rounded-md text-sm font-semibold transition-all ${aspectRatio === ratio ? 'bg-cyan-600 text-white shadow-md' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Resolution</label>
            <div className="flex gap-2">
              {['720p', '1080p'].map(res => (
                <button key={res} onClick={() => setResolution(res as '720p' | '1080p')} className={`w-full py-2 px-4 rounded-md text-sm font-semibold transition-all ${resolution === res ? 'bg-cyan-600 text-white shadow-md' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {res}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateVideo}
          disabled={isLoading || !prompt.trim()}
          className="w-full flex items-center justify-center bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-lg"
        >
          {isLoading && <Spinner />}
          {isLoading ? 'Generating...' : 'Generate Video'}
        </button>
      </div>

      {/* Output Panel */}
      <div className="bg-gray-800/50 rounded-2xl p-6 shadow-lg backdrop-blur-md border border-gray-700/50 flex flex-col items-center justify-center min-h-[400px] lg:min-h-full">
        {isLoading ? (
          <div className="text-center">
            <Spinner />
            <p className="mt-4 text-lg font-semibold text-cyan-400">Processing your request</p>
            <p className="text-gray-400 mt-2">{loadingMessage}</p>
          </div>
        ) : error ? (
          <div className="text-center text-red-400 bg-red-900/50 p-4 rounded-lg">
            <h3 className="font-bold text-lg">Error</h3>
            <p className="text-sm">{error}</p>
          </div>
        ) : generatedVideoUrl ? (
          <div className="w-full flex flex-col items-center gap-4">
            <video src={generatedVideoUrl} controls autoPlay loop className="w-full rounded-lg border-2 border-gray-700" />
            <a
              href={generatedVideoUrl}
              download={`veo-generated-video-${new Date().getTime()}.mp4`}
              className="w-full max-w-xs flex items-center justify-center bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-all shadow-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Download Video
            </a>
          </div>
        ) : (
          <div className="text-center text-gray-500">
             <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
             </svg>
            <p className="mt-4 text-lg">Your generated video will appear here.</p>
            <p className="text-sm">Configure your settings and click "Generate Video" to begin.</p>
          </div>
        )}
      </div>
    </div>
  );


  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 -translate-x-1/4 -translate-y-1/4 w-[150vw] h-[150vh] bg-gradient-to-br from-gray-900 via-gray-900 to-cyan-900/40 animate-[spin_20s_linear_infinite]"></div>
        <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-[150vw] h-[150vh] bg-gradient-to-tl from-gray-900 via-gray-900 to-blue-900/40 animate-[spin_25s_linear_infinite_reverse]"></div>

        <div className="relative z-10 w-full flex flex-col items-center">
            <header className="text-center my-8">
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                    VEO 3.1 Video Generator
                    </span>
                </h1>
                <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
                    Bring your ideas to life. Generate stunning videos from text and images with Google's state-of-the-art AI.
                </p>
            </header>

            {!hasApiKey ? (
              <div className="bg-yellow-900/50 border border-yellow-700/50 text-yellow-200 px-6 py-4 rounded-lg text-center max-w-2xl mx-4">
                  <h3 className="font-bold text-lg mb-2">API Key Required</h3>
                  <p className="mb-4">To use the video generator, you need to select a Gemini API key. Please ensure you have enabled billing for your project.</p>
                  <p className="text-sm text-yellow-300 mb-4">Read more about billing at <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-100">ai.google.dev/gemini-api/docs/billing</a>.</p>
                  <button
                      onClick={handleSelectKey}
                      className="bg-yellow-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                      Select API Key
                  </button>
              </div>
            ) : mainContent}
        </div>
    </main>
  );
};

export default App;
