import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  User, 
  Loader2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const GeminiAssistant: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'ai',
      text: 'Hello! I am the Unique School System assistant (powered by Groq). Ask me how to use any module — students, attendance, fees, payroll, batch results, emails, reporting, and more.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || isLoadingChat) return;

    const userText = inputMsg.trim();
    setInputMsg('');

    const userMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoadingChat(true);

    try {
      const history = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const res = await fetch('/api/groq/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history
        })
      });

      const raw = await res.text();
      let data: { reply?: string; text?: string; error?: string } = {};
      if (raw.trim()) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Server returned invalid JSON (HTTP ${res.status}). Restart the dev server (npm run dev).`);
        }
      } else if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'Assistant API not found — restart the dev server (npm run dev) to load the Groq route.'
            : `Empty server response (HTTP ${res.status}).`
        );
      }

      setIsLoadingChat(false);

      const reply = data.reply || data.text;
      if (reply) {
        setMessages(prev => [
          ...prev,
          {
            id: 'msg-' + Date.now(),
            sender: 'ai',
            text: reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: 'msg-' + Date.now(),
            sender: 'ai',
            text: data.error || 'I could not process your request. Please try again.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err: any) {
      setIsLoadingChat(false);
      setMessages(prev => [
        ...prev,
        {
          id: 'msg-' + Date.now(),
          sender: 'ai',
          text: `Error connecting to assistant: ${err.message || 'Network error'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-blue-900" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                USS System Assistant (Groq)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Answers questions about the Unique School System ERP only — students, fees, attendance, batch parser, and admin workflows.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-[550px]">
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                msg.sender === 'user' ? 'bg-blue-900 text-white' : 'bg-amber-400 text-slate-900 shadow'
              }`}>
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed space-y-1 shadow-sm ${
                msg.sender === 'user' 
                  ? 'bg-blue-900 text-white rounded-tr-none' 
                  : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
              }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <span className={`block text-[10px] text-right font-mono ${msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {isLoadingChat && (
            <div className="flex gap-3 mr-auto items-center">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center font-bold">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border p-3 rounded-2xl text-xs flex items-center gap-2 text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-800" />
                Assistant is thinking...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200 flex gap-2">
          <input 
            type="text"
            value={inputMsg}
            onChange={e => setInputMsg(e.target.value)}
            placeholder="Ask about USS modules — e.g. How do I upload batch exam results?"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800"
          />
          <button
            type="submit"
            disabled={isLoadingChat || !inputMsg.trim()}
            className="px-6 py-3 bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow flex items-center gap-2 transition-all active:scale-95"
          >
            <Send className="w-4 h-4 text-amber-300" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
