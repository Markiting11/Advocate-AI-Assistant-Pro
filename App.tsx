
import React, { useState, useRef, useEffect } from 'react';
import { 
  FileUp, 
  LayoutDashboard, 
  ShieldAlert, 
  Gavel, 
  FileText, 
  Mic, 
  MicOff, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  FileSearch, 
  Info,
  FileBadge,
  User,
  ChevronRight,
  Scale,
  PencilLine,
  SendHorizontal,
  Printer,
  Link,
  BookOpen,
  RotateCcw,
  Plus,
  Files,
  X
} from 'lucide-react';
import { AppTab, CaseData, LegalDomain, DraftLanguage, Citation } from './types';
import { analyzeCaseFile, generateStrategy, prepareHearing, generateDraft, researchLegalPrecedents, startManualDraftChat, MultimodalPart } from './services/gemini';
import { GoogleGenAI, Modality, Chat } from '@google/genai';
import { encode, decode, decodeAudioData } from './services/audio';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit

const DOMAIN_TEMPLATES: Record<LegalDomain, string[]> = {
  'Family': ['Marriage Certificate (Nikahnama)', 'Divorce Notice (Talaq)', 'Child Custody Application', 'Financial Support / Alimony Claim'],
  'Criminal': ['Response to FIR', 'Bail Application', 'Defense Argument Document', 'Private Complaint'],
  'Civil': ['Civil Petition (Plaint)', 'Breach of Contract Claim', 'Property Dispute Petition', 'Financial Recovery Claim', 'Affidavit'],
  'General': ['Legal Notice', 'Reply to Legal Notice', 'Power of Attorney (Wakalatnama)', 'Letter of Intent']
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Upload);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [stagedFiles, setStagedFiles] = useState<{name: string, part: MultimodalPart}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');

  // Draft specific state
  const [selectedDomain, setSelectedDomain] = useState<LegalDomain>('General');
  const [draftLanguage, setDraftLanguage] = useState<DraftLanguage>('English');
  const [isManualDraft, setIsManualDraft] = useState(false);
  const [manualInput, setManualInput] = useState('');
  
  // Manual Draft Chat Ref
  const manualChatRef = useRef<Chat | null>(null);
  
  // Voice Assistant Refs
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  // Initialize or reset manual chat when language or documents change
  useEffect(() => {
    if (isManualDraft) {
      const parts = stagedFiles.map(f => f.part);
      manualChatRef.current = startManualDraftChat(parts, draftLanguage);
    }
  }, [draftLanguage, isManualDraft, stagedFiles]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    const newStaged: {name: string, part: MultimodalPart}[] = [...stagedFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is too large (>20MB).`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        let mimeType = file.type;
        if (!mimeType) {
          if (file.name.endsWith('.txt')) mimeType = 'text/plain';
          else if (file.name.endsWith('.pdf')) mimeType = 'application/pdf';
        }

        const part: MultimodalPart = mimeType === 'text/plain' 
          ? { text: await file.text() } 
          : { inlineData: { mimeType, data: base64 } };
        
        newStaged.push({ name: file.name, part });
      } catch (err) {
        setError(`Failed to read ${file.name}`);
      }
    }
    setStagedFiles(newStaged);
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
    if (stagedFiles.length <= 1) setCaseData(null);
  };

  const startAnalysis = async () => {
    if (stagedFiles.length === 0) return;
    setIsLoading(true);
    setError(null);
    const parts = stagedFiles.map(f => f.part);

    try {
      setLoadingStep("Reading all uploaded documents (Case + Appeals)...");
      const analysis = await analyzeCaseFile(parts);
      
      setLoadingStep("Researching precedents and legal background...");
      const citations = await researchLegalPrecedents(analysis.summary, analysis.legalIssues);
      analysis.citations = citations;

      setLoadingStep("Structuring legal strategy and defense flow...");
      const strategy = await generateStrategy(parts);

      setLoadingStep("Mapping court questions and hearing prep...");
      const hearingPrep = await prepareHearing(parts);
      
      setCaseData({
        fileName: `${stagedFiles.length} Documents`,
        fileContent: `Aggregated analysis of: ${stagedFiles.map(f => f.name).join(', ')}`,
        analysis,
        strategy,
        hearingPrep
      });
      setActiveTab(AppTab.Analysis);
    } catch (err: any) {
      setError("AI analysis failed. Please check your connection or file content.");
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const cleanDraftText = (text: string) => {
    // If it's a guide/answer, preserve structure
    if (text.includes('Step') || text.includes('Guide') || text.includes('Format') || text.includes('Steps to')) {
       return text.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/___/g, '').replace(/__/g, '').replace(/`/g, '').trim();
    }
    return text.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/___/g, '').replace(/__/g, '').replace(/#/g, '').replace(/`/g, '').trim();
  };

  const handleGenerateDraft = async (type: string) => {
    const parts = stagedFiles.map(f => f.part);
    if (parts.length === 0) return;
    setIsDrafting(true);
    setGeneratedDraft(null);
    try {
      const draft = await generateDraft(parts, selectedDomain, type, draftLanguage);
      setGeneratedDraft(cleanDraftText(draft));
    } catch (error) {
      setError("Failed to generate draft.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleGenerateManualDraft = async () => {
    if (!manualInput.trim()) return;
    setIsDrafting(true);
    setError(null);
    
    try {
      if (!manualChatRef.current) {
        manualChatRef.current = startManualDraftChat(stagedFiles.map(f => f.part), draftLanguage);
      }

      const stream = await manualChatRef.current.sendMessageStream({ message: manualInput });
      const currentPrompt = manualInput;
      setManualInput(''); 
      
      let fullResponse = "";
      setGeneratedDraft(""); 
      
      for await (const chunk of stream) {
        fullResponse += chunk.text;
        setGeneratedDraft(cleanDraftText(fullResponse));
      }
    } catch (error) {
      setError("Failed to process conversation.");
    } finally {
      setIsDrafting(false);
    }
  };

  const resetManualChat = () => {
    manualChatRef.current = startManualDraftChat(stagedFiles.map(f => f.part), draftLanguage);
    setGeneratedDraft(null);
    setManualInput('');
  };

  const toggleVoiceAssistant = async () => {
    if (isVoiceActive) { stopVoiceAssistant(); return; }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const analysisContext = caseData?.analysis ? `CONTEXT: ${caseData.analysis.summary}. PARTIES: ${caseData.analysis.parties.join(', ')}.` : "Discuss legal cause generally.";
      const systemInstruction = `You are "Advocate Assistant Pro". Understand the cause and discuss it professionally. Speak Urdu and English. Help brainstorm counter-arguments. Context: ${analysisContext}`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsVoiceActive(true);
            navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
              const source = inputCtx.createMediaStreamSource(s);
              const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const l = inputData.length;
                const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
                });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputCtx.destination);
            });
          },
          onmessage: async (message) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onclose: () => setIsVoiceActive(false),
          onerror: () => setIsVoiceActive(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setIsVoiceActive(false); }
  };

  const stopVoiceAssistant = () => {
    if (sessionRef.current) { sessionRef.current.close?.(); sessionRef.current = null; }
    setIsVoiceActive(false);
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-serif font-bold tracking-tight text-amber-400">Advocate AI</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-medium">Assistant Pro</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavItem icon={<FileUp size={20} />} label="Upload Case" active={activeTab === AppTab.Upload} onClick={() => setActiveTab(AppTab.Upload)} />
          <NavItem icon={<LayoutDashboard size={20} />} label="Case Analysis" active={activeTab === AppTab.Analysis} disabled={!caseData} onClick={() => setActiveTab(AppTab.Analysis)} />
          <NavItem icon={<ShieldAlert size={20} />} label="Strategy & Risks" active={activeTab === AppTab.Strategy} disabled={!caseData} onClick={() => setActiveTab(AppTab.Strategy)} />
          <NavItem icon={<FileText size={20} />} label="Drafting Tool" active={activeTab === AppTab.Drafts} disabled={!caseData} onClick={() => setActiveTab(AppTab.Drafts)} />
          <NavItem icon={<Gavel size={20} />} label="Hearing Prep" active={activeTab === AppTab.HearingPrep} disabled={!caseData} onClick={() => setActiveTab(AppTab.HearingPrep)} />
        </nav>

        {caseData && (
          <div className="px-4 py-3 bg-slate-800/50 border-y border-slate-800">
             <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-slate-500 uppercase">Documents ({stagedFiles.length})</div>
             <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                {stagedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-1 text-[10px] text-slate-300 truncate bg-slate-900/40 rounded border border-slate-700/30">
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
             </div>
          </div>
        )}

        <div className="p-4 bg-slate-800 m-4 rounded-xl shadow-inner border border-slate-700/50">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-3 h-3 rounded-full ${isVoiceActive ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-semibold text-slate-300 uppercase">Voice Assistant</span>
          </div>
          <button 
            onClick={toggleVoiceAssistant}
            disabled={!caseData}
            className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition-all ${
              isVoiceActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-amber-500 text-slate-900 disabled:opacity-50 hover:bg-amber-400'
            }`}
          >
            {isVoiceActive ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="text-sm">{isVoiceActive ? 'Stop' : 'Discuss Cause'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 relative">
        <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight text-sm">{activeTab}</h2>
          {caseData && (
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-semibold border border-slate-200">
              <Files size={14} className="text-amber-500" /> {stagedFiles.length} Documents Analyzed
            </div>
          )}
        </header>

        <div className="p-8 max-w-5xl mx-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 text-red-700">
              <AlertTriangle className="shrink-0" size={20} />
              <p className="text-sm font-medium flex-1">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
              <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center max-w-md w-full">
                <Loader2 className="animate-spin text-amber-500 mb-6" size={56} />
                <h3 className="text-xl font-serif font-bold text-slate-800 text-center mb-2">Legal Processing Engine</h3>
                <p className="text-slate-500 text-sm animate-pulse text-center">{loadingStep}</p>
              </div>
            </div>
          )}

          {activeTab === AppTab.Upload && (
            <div className="space-y-6">
              <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-amber-400 transition-all cursor-pointer relative group">
                <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept=".txt,.pdf,.jpg,.jpeg,.png" />
                <div className="bg-amber-50 p-6 rounded-full text-amber-500 mb-6 group-hover:scale-110 transition-transform">
                  <FileUp size={32} />
                </div>
                <h3 className="text-2xl font-serif font-bold text-slate-800 mb-2">Upload All Case & Appeal Documents</h3>
                <p className="text-slate-500 max-w-md text-sm">Select multiple PDFs or images. We read them together to understand the full context of the cause.</p>
              </div>

              {stagedFiles.length > 0 && (
                <div className="bg-white rounded-2xl border p-6 animate-in fade-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2"><Files size={18} className="text-amber-500" /> Staged Documents ({stagedFiles.length})</h4>
                    <button onClick={startAnalysis} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
                       Analyze All Together <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stagedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border rounded-xl group">
                        <div className="flex items-center gap-3">
                          <FileBadge size={20} className="text-slate-400" />
                          <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <button onClick={() => removeStagedFile(i)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={16} /></button>
                      </div>
                    ))}
                    <label className="flex items-center justify-center p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all cursor-pointer">
                      <input type="file" multiple onChange={handleFileUpload} className="hidden" accept=".txt,.pdf,.jpg,.jpeg,.png" />
                      <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><Plus size={14} /> Add More Files</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === AppTab.Analysis && caseData?.analysis && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-8">
                <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest mb-4">Case Executive Summary</h3>
                <p className="text-slate-700 leading-relaxed text-xl font-serif italic mb-6">"{caseData.analysis.summary}"</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoBox label="Case Type" value={caseData.analysis.caseType} />
                  <InfoBox label="Relief Sought" value={caseData.analysis.reliefSought} />
                </div>
              </div>

              {caseData.analysis.citations && caseData.analysis.citations.length > 0 && (
                <div className="bg-white rounded-2xl border p-8">
                  <div className="flex items-center gap-2 mb-6">
                    <Link size={20} className="text-blue-500" />
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Precedents & Web Research</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {caseData.analysis.citations.map((cite, i) => (
                      <a key={i} href={cite.uri} target="_blank" rel="noopener noreferrer" className="p-4 bg-slate-50 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all flex flex-col justify-between group">
                        <p className="text-sm font-bold text-slate-800 mb-1 group-hover:text-blue-700">{cite.title}</p>
                        <span className="text-[10px] font-black text-blue-500 uppercase flex items-center gap-1">View Full Text <ChevronRight size={10} /></span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DataList title="Parties Involved" items={caseData.analysis.parties} icon={<User size={18} className="text-blue-500" />} />
                <DataList title="Legal Issues" items={caseData.analysis.legalIssues} icon={<AlertTriangle size={18} className="text-red-500" />} />
              </div>
            </div>
          )}

          {activeTab === AppTab.Drafts && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-white rounded-3xl border p-6 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg mb-1">Legal Drafting Assistant</h3>
                    <p className="text-slate-500 text-sm">Explain how to draft or generate the final document.</p>
                  </div>
                  <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button onClick={() => setDraftLanguage('English')} className={`px-4 py-2 rounded-lg text-sm font-bold ${draftLanguage === 'English' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>English</button>
                    <button onClick={() => setDraftLanguage('Urdu')} className={`px-4 py-2 rounded-lg text-sm font-bold font-urdu ${draftLanguage === 'Urdu' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>اردو</button>
                  </div>
                </div>

                <div className="flex gap-4 border-b mb-6">
                  <button onClick={() => setIsManualDraft(false)} className={`pb-3 px-4 text-sm font-bold ${!isManualDraft ? 'border-b-2 border-amber-500 text-slate-900' : 'text-slate-400'}`}>Templates</button>
                  <button onClick={() => setIsManualDraft(true)} className={`pb-3 px-4 text-sm font-bold ${isManualDraft ? 'border-b-2 border-amber-500 text-slate-900' : 'text-slate-400'}`}>Conversational Drafting</button>
                </div>

                {isManualDraft ? (
                  <div className="space-y-4">
                    <div className="p-5 bg-slate-50 border rounded-2xl">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-black uppercase text-slate-400">Ask or Instruct</label>
                        <button onClick={resetManualChat} className="text-[10px] font-bold text-slate-400 hover:text-amber-600 flex items-center gap-1 uppercase"><RotateCcw size={12} /> Reset Chat</button>
                      </div>
                      <textarea 
                        className={`w-full h-32 bg-white border rounded-xl p-4 text-sm text-slate-800 outline-none focus:border-amber-400 transition-all font-medium ${draftLanguage === 'Urdu' ? 'font-urdu' : ''}`}
                        placeholder={draftLanguage === 'Urdu' ? "مثال کے طور پر: 'طلاق نامہ کیسے تیار کریں؟'" : "e.g., 'how to draft Talaq Divorce'"}
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        dir={draftLanguage === 'Urdu' ? 'rtl' : 'ltr'}
                      />
                      <div className="mt-4 flex justify-end">
                        <button onClick={handleGenerateManualDraft} disabled={isDrafting || !manualInput.trim()} className="bg-amber-500 text-slate-900 px-6 py-3 rounded-xl font-bold text-sm hover:bg-amber-600 transition-all flex items-center gap-2 disabled:opacity-50 shadow-md">
                          <SendHorizontal size={18} /> {generatedDraft ? 'Next Step' : 'Ask Assistant'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {DOMAIN_TEMPLATES[selectedDomain].map(template => (
                      <button key={template} onClick={() => handleGenerateDraft(template)} disabled={isDrafting} className="p-5 bg-slate-50 border rounded-2xl text-left hover:border-amber-400 hover:bg-amber-50 transition-all flex justify-between items-center group">
                        <span className={`text-sm font-bold text-slate-700 group-hover:text-amber-700 ${draftLanguage === 'Urdu' ? 'font-urdu' : ''}`}>{template}</span>
                        <ChevronRight size={16} className="text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(isDrafting || generatedDraft) && (
                <div className="bg-white rounded-3xl shadow-xl border overflow-hidden">
                  <div className="bg-slate-900 px-8 py-5 flex justify-between items-center">
                    <h3 className="font-bold text-white uppercase text-xs tracking-widest">Assistant Result</h3>
                    {generatedDraft && !isDrafting && (
                      <div className="flex gap-2">
                        <button onClick={() => window.print()} className="bg-slate-800 text-white p-2 rounded-lg"><Printer size={18} /></button>
                        <button onClick={() => {
                          const blob = new Blob([generatedDraft!], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `Draft_${Date.now()}.txt`; a.click();
                        }} className="bg-amber-500 text-slate-900 px-4 py-2 rounded-lg font-black text-xs">EXPORT TEXT</button>
                      </div>
                    )}
                  </div>
                  <div className="p-8 bg-slate-100 min-h-[500px]">
                    {isDrafting && !generatedDraft ? (
                      <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-amber-500" size={40} /></div>
                    ) : (
                      <div className="bg-white shadow-inner rounded-xl p-8 border max-w-4xl mx-auto min-h-[450px]">
                        <textarea className={`w-full h-full min-h-[400px] text-slate-800 leading-relaxed outline-none resize-none border-none ${draftLanguage === 'Urdu' ? 'font-urdu text-right' : 'font-serif text-left'}`} value={generatedDraft!} onChange={(e) => setGeneratedDraft(e.target.value)} dir={draftLanguage === 'Urdu' ? 'rtl' : 'ltr'} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === AppTab.Strategy && caseData?.strategy && (
             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatusCard title="Strengths" items={caseData.strategy.strengths} type="success" />
                  <StatusCard title="Risks" items={caseData.strategy.risks} type="warning" />
                  <StatusCard title="Missing Evidence" items={caseData.strategy.gaps} type="danger" />
                </div>
             </div>
          )}

          {activeTab === AppTab.HearingPrep && caseData?.hearingPrep && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DataList title="Hearing Checklist" items={caseData.hearingPrep.checklist} type="checklist" icon={<CheckCircle2 className="text-green-500" />} />
                <DataList title="Predicted Questions" items={caseData.hearingPrep.predictedQuestions} icon={<Gavel className="text-amber-600" />} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{ icon: any, label: string, active: boolean, disabled?: boolean, onClick: () => void }> = ({ icon, label, active, disabled, onClick }) => (
  <button onClick={onClick} disabled={disabled} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-amber-500 text-slate-900 font-bold shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
    {icon} <span className="text-sm tracking-tight">{label}</span>
  </button>
);

const FeatureCard: React.FC<{ icon: any, title: string, desc: string }> = ({ icon, title, desc }) => (
  <div className="bg-white p-6 rounded-2xl border hover:shadow-lg transition-all">
    <div className="mb-4 bg-slate-50 w-12 h-12 rounded-xl flex items-center justify-center">{icon}</div>
    <h4 className="font-bold text-slate-800 mb-2">{title}</h4>
    <p className="text-xs text-slate-500">{desc}</p>
  </div>
);

const DataList: React.FC<{ title: string, items: string[], icon?: any, type?: 'default' | 'checklist' }> = ({ title, items, icon, type = 'default' }) => (
  <div className="bg-white rounded-2xl border flex flex-col h-full">
    <div className="bg-slate-50 px-6 py-4 border-b flex items-center gap-2">{icon}<h3 className="font-bold text-slate-800 text-xs uppercase">{title}</h3></div>
    <div className="p-6 space-y-4 flex-1">
      {items.map((item, i) => (
        <div key={i} className="flex gap-4 items-start">
          {type === 'checklist' ? <input type="checkbox" className="mt-1 w-4 h-4 rounded border-slate-300 text-amber-500 cursor-pointer" /> : <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0"></div>}
          <p className="text-slate-700 text-sm leading-relaxed">{item}</p>
        </div>
      ))}
    </div>
  </div>
);

const InfoBox: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <div className="p-4 bg-slate-50 rounded-xl border">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{label}</span>
    <span className="text-slate-800 font-bold">{value}</span>
  </div>
);

const StatusCard: React.FC<{ title: string, items: string[], type: 'success' | 'warning' | 'danger' }> = ({ title, items, type }) => {
  const styles = { success: 'bg-green-50 border-green-200 text-green-800', warning: 'bg-amber-50 border-amber-200 text-amber-800', danger: 'bg-red-50 border-red-200 text-red-800' };
  return (
    <div className={`p-6 rounded-2xl border ${styles[type]} h-full`}>
      <h4 className="font-black mb-5 text-xs uppercase tracking-widest opacity-80">{title}</h4>
      <ul className="space-y-3">
        {items.map((item, i) => <li key={i} className="text-sm flex gap-2 font-semibold"><span>•</span> {item}</li>)}
      </ul>
    </div>
  );
};

export default App;
